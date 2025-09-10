// src/modules/filemanager/components/VersionHistoryModal/VersionHistoryModal.tsx
import { ReactElement, useEffect, useMemo, useState, useCallback } from 'react'
import './VersionHistoryModal.scss'
import '../../styles/global.scss'

import { FMButton } from '../FMButton/FMButton'
import { createPortal } from 'react-dom'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import HistoryIcon from 'remixicon-react/HistoryLineIcon'
import UserIcon from 'remixicon-react/UserLineIcon'
import DownloadIcon from 'remixicon-react/Download2LineIcon'

import { useFM } from '../../providers/FMContext'
import type { FileInfo, FileManager, FileManagerBase } from '@solarpunkltd/file-manager-lib'
import { useFMTransfers } from '../../hooks/useFMTransfers'
// --- DEV flag: set localStorage.fmDebug = "1" to enable inline debug dump
const FM_DEBUG = (() => {
  try {
    return localStorage.getItem('fmDebug') === '1'
  } catch {
    return false
  }
})()

function looksLikeEthAddr(s: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim())
}

function safeStr(x: unknown) {
  try {
    const s = (x as any)?.toString?.() ?? String(x ?? '')

    return s !== '[object Object]' ? s : ''
  } catch {
    return ''
  }
}

// probe FM internals once (owner/address/bee)
async function probeFM(fmAny: any) {
  const out: Record<string, any> = {}
  try {
    out.fm_owner = safeStr(fmAny?.owner)
  } catch {}
  try {
    out.fm_address = safeStr(fmAny?.address)
  } catch {}
  try {
    out.fm_signerAddress = safeStr(fmAny?.signerAddress)
  } catch {}
  try {
    out.fm_getOwner = safeStr(await fmAny?.getOwner?.())
  } catch {}
  try {
    out.fm_getAddress = safeStr(await fmAny?.getAddress?.())
  } catch {}
  try {
    const node = await fmAny?.bee?.getNodeAddresses?.()
    out.bee_pub_compressed = safeStr(node?.publicKey?.toCompressedHex?.())
  } catch {}

  return out
}

interface VersionHistoryModalProps {
  fileInfo: FileInfo
  onCancelClick: () => void
}

/** ---------------- helpers: version index normalization & dedupe ---------------- */
const HEX_INDEX_BYTES = 8
const HEX_INDEX_CHARS = HEX_INDEX_BYTES * 2
const toHexIndexStr = (i: bigint) => '0x' + i.toString(16).padStart(HEX_INDEX_CHARS, '0')
// old helpers that worked before
const padIndexHex = (hexNoPrefix: string) => {
  const h = hexNoPrefix.toLowerCase()

  return h.length >= HEX_INDEX_CHARS ? h : h.padStart(HEX_INDEX_CHARS, '0')
}
const toHexIndex = (v?: string | number | bigint) => {
  if (v == null || v === '') return undefined
  const s = String(v)

  return s.startsWith('0x') ? `0x${padIndexHex(s.slice(2))}` : `0x${padIndexHex(BigInt(s).toString(16))}`
}

const getLocalPublisher = (fmObj: any): string | undefined => {
  // same helper you used before
  try {
    return fmObj?.nodeAddresses?.publicKey?.toCompressedHex?.()
  } catch {
    return undefined
  }
}

const parseIndex = (v: unknown): bigint | null => {
  try {
    if (v == null) return null

    if (typeof v === 'bigint') return v
    const s = String(v).trim()

    return BigInt(s)
  } catch {
    return null
  }
}
const keyOf = (fi: FileInfo) => {
  const t = fi.topic?.toString?.() ?? ''
  const idx = parseIndex(fi.version)
  const idxHex = idx != null ? toHexIndexStr(idx) : String(fi.version ?? '').toLowerCase()

  return `${t}:${idxHex}`
}
const getHeadByTopic = (list: FileInfo[], topic?: unknown): FileInfo | null => {
  try {
    const t = topic?.toString?.()

    if (!t) return null
    const same = list.filter(f => f.topic?.toString?.() === t)

    if (!same.length) return null

    return same.reduce((a, b) => (BigInt(a.version ?? '0') >= BigInt(b.version ?? '0') ? a : b))
  } catch {
    return null
  }
}

/** ---------------- SAME conversion helpers as FileItem (BeeBytes/streams supported) ---------------- */
type BeeBytes = { toUint8Array: () => Uint8Array }
const hasToUint8Array = (x: unknown): x is BeeBytes =>
  typeof x === 'object' && x !== null && typeof (x as BeeBytes).toUint8Array === 'function'
type HasGetReader = { getReader: () => ReadableStreamDefaultReader<Uint8Array> }
const hasGetReader = (x: unknown): x is HasGetReader =>
  typeof x === 'object' &&
  x !== null &&
  'getReader' in (x as HasGetReader) &&
  typeof (x as HasGetReader).getReader === 'function'
type HasArrayBuffer = { arrayBuffer: () => Promise<ArrayBuffer> }
const hasArrayBufferFn = (x: unknown): x is HasArrayBuffer =>
  typeof x === 'object' &&
  x !== null &&
  'arrayBuffer' in (x as HasArrayBuffer) &&
  typeof (x as HasArrayBuffer).arrayBuffer === 'function'
type HasBlob = { blob: () => Promise<Blob> }
const hasBlobFn = (x: unknown): x is HasBlob =>
  typeof x === 'object' && x !== null && 'blob' in (x as HasBlob) && typeof (x as HasBlob).blob === 'function'

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    let res: ReadableStreamReadResult<Uint8Array> = await reader.read()
    while (!res.done) {
      const chunk = res.value

      if (chunk) {
        chunks.push(chunk)
        total += chunk.byteLength
      }
      res = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }

  return out
}

type DownloadPart = Blob | Uint8Array | BeeBytes | ReadableStream<Uint8Array> | HasArrayBuffer | HasBlob

async function normalizeToBlob(part: DownloadPart, mime?: string): Promise<Blob> {
  const type = mime || 'application/octet-stream'

  if (part instanceof Blob) return part

  if (hasToUint8Array(part)) return new Blob([part.toUint8Array()], { type })

  if (part instanceof Uint8Array) return new Blob([part], { type })

  if (hasGetReader(part)) {
    const u8 = await streamToUint8Array(part as unknown as ReadableStream<Uint8Array>)

    return new Blob([u8], { type })
  }

  if (hasBlobFn(part)) {
    const b = await (part as HasBlob).blob()

    return b.type ? b : new Blob([await b.arrayBuffer()], { type })
  }

  if (hasArrayBufferFn(part)) {
    const buf = await (part as HasArrayBuffer).arrayBuffer()

    return new Blob([buf], { type })
  }
  throw new Error('Unsupported downloaded part type')
}

/** ---------- SAME ACT publisher hydration approach as FileItem ---------- */
function sameTopic(a?: FileInfo, b?: FileInfo) {
  try {
    return a?.topic?.toString?.() === b?.topic?.toString?.()
  } catch {
    return false
  }
}

async function getCandidatePublishers(fm: any, seed: FileInfo): Promise<string[]> {
  const out = new Set<string>()
  const seedPub = (seed as any)?.actPublisher

  if (seedPub) out.add(String(seedPub))
  try {
    const bee = (fm as any)?.bee
    const pub = await bee?.getNodeAddresses?.()

    if (pub?.publicKey) out.add(String(pub.publicKey))
  } catch {
    /* ignore */
  }
  try {
    const list: FileInfo[] = fm?.fileInfoList || []
    for (const f of list) {
      if (sameTopic(f, seed) && (f as any)?.actPublisher) out.add(String((f as any).actPublisher))
    }
  } catch {
    /* ignore */
  }

  return Array.from(out)
}

async function hydrateWithPublishers(
  fmLike: { getVersion: (fi?: FileInfo, version?: string) => Promise<FileInfo> },
  fmAny: any,
  seed: FileInfo,
  version?: string,
): Promise<FileInfo> {
  const pubs = await getCandidatePublishers(fmAny, seed)
  for (const p of pubs) {
    try {
      const variant = { ...seed, actPublisher: p } as FileInfo
      const res = await fmLike.getVersion(variant, version)

      return (res as any)?.actPublisher ? res : ({ ...res, actPublisher: p } as FileInfo)
    } catch {
      /* try next */
    }
  }

  const res = await fmLike.getVersion(seed, version)

  if (!(res as any)?.actPublisher && pubs.length) {
    return { ...res, actPublisher: pubs[0] } as FileInfo
  }

  return res
}

export function VersionHistoryModal({ fileInfo, onCancelClick }: VersionHistoryModalProps): ReactElement {
  const { fm, refreshFiles } = useFM()
  const { downloadBlob } = useFMTransfers()
  const modalRoot = document.querySelector('.fm-main') || document.body
  const [restoreDebug, setRestoreDebug] = useState<any | null>(null)

  const [allVersions, setAllVersions] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // simple client-side pagination
  const pageSize = 5
  const [currentPage, setCurrentPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(allVersions.length / pageSize))
  const pageVersions = useMemo(
    () => allVersions.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [allVersions, currentPage],
  )
  const hasPrev = currentPage > 0
  const hasNext = currentPage + 1 < totalPages

  const headFi = useMemo<FileInfo | null>(() => {
    if (!fm) return null

    return getHeadByTopic(fm.fileInfoList || [], fileInfo.topic) || fileInfo
  }, [fm, fileInfo])

  const headIdx = useMemo<bigint>(() => parseIndex(headFi?.version) ?? BigInt(0), [headFi])

  // enumerate robustly: relative offsets first, then absolute fallback
  const enumerateAll = useCallback(async (): Promise<FileInfo[]> => {
    console.debug('[FM-UI:VH] enumerate:start', {
      headTopic: headFi?.topic?.toString?.(),
      headVersion: headFi?.version,
      headIdx: headIdx.toString(),
    })

    if (!fm || !headFi) return []
    const rows: FileInfo[] = []
    const seen = new Set<string>()
    const pushUnique = (fi: FileInfo) => {
      const k = keyOf(fi)

      if (!seen.has(k)) {
        rows.push(fi)
        seen.add(k)
      }
    }

    const headAnchor: FileInfo = { ...headFi, version: toHexIndexStr(headIdx) }
    pushUnique(headFi)

    // relative offsets (1 = previous, 2 = prev2, …)
    const MAX_RELATIVE = 2048
    for (let off = 1; off <= MAX_RELATIVE; off++) {
      try {
        const v = await (fm as any).getVersion(headAnchor, String(off))

        if (!v) break
        pushUnique(v)
      } catch {
        break
      }
    }

    // absolute fallback if relative returned only the head
    console.debug('[FM-UI:VH] enumerate:relativeDone', { rows: rows.length })

    if (rows.length === 1 && headIdx > BigInt(0)) {
      let misses = 0
      const MAX_MISSES = 8
      const HARD_LIMIT = 4096
      for (let i = headIdx - BigInt(1); i >= BigInt(0) && rows.length < HARD_LIMIT; i--) {
        const hex = toHexIndexStr(i)
        try {
          pushUnique(await (fm as any).getVersion(headAnchor, hex))
          misses = 0
          continue
        } catch {}
        try {
          pushUnique(await (fm as any).getVersion(headAnchor, i.toString()))
          misses = 0
        } catch {
          misses++
        }

        if (misses >= MAX_MISSES) break
      }
    }

    return rows
  }, [fm, headFi, headIdx])

  // Create a Blob for a specific version (zip if multi-file)
  const getVersionBlob = useCallback(
    async (fi: FileInfo): Promise<Blob> => {
      console.debug('[FM-UI:VH] getVersionBlob:start', {
        name: fi?.name,
        topic: fi?.topic?.toString?.(),
        version: fi?.version,
      })

      if (!fm) throw new Error('FM not ready')
      const idx = parseIndex(fi.version) ?? BigInt(0)
      const versionParam = toHexIndexStr(idx)
      const anchor: FileInfo = { ...fi, version: versionParam }

      // ACT-aware hydration (exact version)
      let hydrated: FileInfo = fi
      try {
        hydrated = await hydrateWithPublishers(fm as any, fm as any, anchor, versionParam)
      } catch {
        /* fallback uses fi as-is */
      }

      const pubs = await getCandidatePublishers(fm as any, anchor)
      const toDownload = (hydrated as any).actPublisher
        ? hydrated
        : ({ ...hydrated, actPublisher: pubs[0] } as FileInfo)

      const mime = toDownload.customMetadata?.mime || 'application/octet-stream'
      let paths: string[] | undefined
      try {
        const list = await (fm as any).listFiles?.(toDownload as any)
        console.debug('[FM-UI:VH] getVersionBlob:listFiles', {
          count: Array.isArray(list) ? list.length : 0,
          sample: (list ?? []).slice?.(0, 5),
        })

        if (Array.isArray(list) && list.length > 0) {
          const baseName = toDownload.name || ''
          const matching = list.find((e: any) => e.path === baseName || e.path.endsWith('/' + baseName))
          paths = matching ? [matching.path] : list.map((e: any) => e.path)
        }
      } catch (e) {
        console.debug('[FM-UI:VH] getVersionBlob:listFiles:error', String(e))
      }

      console.debug('[FM-UI:VH] getVersionBlob:download:req', { paths })
      const res = await (fm as any).download(toDownload as any, paths)
      const arr = Array.isArray(res) ? res : [res]
      console.debug('[FM-UI:VH] getVersionBlob:download:res', { array: Array.isArray(res), count: arr.length })

      if (arr.length === 0) throw new Error('No content returned')

      const blobs = await Promise.all(arr.map(p => normalizeToBlob(p as DownloadPart, mime)))

      if (blobs.length === 1) return blobs[0]

      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const names = Array.isArray(paths) && paths.length === blobs.length ? paths : blobs.map((_, i) => `file-${i}`)
      await Promise.all(blobs.map(async (b, i) => zip.file(names[i], await b.arrayBuffer())))

      return await zip.generateAsync({ type: 'blob' })
    },
    [fm],
  )

  // (re)load on mount/topic change
  useEffect(() => {
    setCurrentPage(0)
    setError(null)

    if (!fm || !headFi) {
      setAllVersions([])

      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const list = await enumerateAll()

        if (!cancelled) setAllVersions(list)
      } catch {
        if (!cancelled) setError('Failed to load version history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fm, headFi?.topic, enumerateAll])

  // --- add these helpers near the other helpers ---
  async function resolveOwner(fmLike: any, preferred?: unknown): Promise<string> {
    // try preferred (from version/head), then fm fields, then async getters
    const candidates: unknown[] = [preferred, fmLike?.owner, fmLike?.address, fmLike?.signerAddress]

    for (const c of candidates) {
      const s = c?.toString?.()

      if (s && s !== '[object Object]') return String(s)
    }

    try {
      const got = await fmLike?.getOwner?.()

      if (got) return String(got)
    } catch {}
    try {
      const got = await fmLike?.getAddress?.()

      if (got) return String(got)
    } catch {}

    // LAST resort: bee signer/public key (may not exist in browser)
    try {
      const beeAddr = await fmLike?.bee?.signer?.publicKey?.address?.()

      if (beeAddr) return String(beeAddr)
    } catch {}
    try {
      const pub = await fmLike?.bee?.getNodeAddresses?.()
      const hex = pub?.publicKey?.toCompressedHex?.()

      if (hex) return String(hex)
    } catch {}

    return '' // signal failure to caller
  }

  function resolveTopic(preferred?: unknown, fallback?: unknown): string {
    const tryOne = (x: unknown) => {
      try {
        const s = (x as any)?.toString?.() ?? String(x ?? '')

        return s && s !== '[object Object]' ? s : ''
      } catch {
        return ''
      }
    }

    return tryOne(preferred) || tryOne(fallback)
  }
  const HEX40 = /^[0-9a-fA-F]{40}$/
  const ETH_RE = /^0x[0-9a-fA-F]{40}$/

  function normalizeOwnerHex(s: string): string {
    const t = s.trim()

    if (ETH_RE.test(t)) return t

    if (HEX40.test(t)) return '0x' + t.toLowerCase()

    return t // return as-is; caller will still validate and show a helpful error
  }

  const restoreVersion = async (versionFi: FileInfo) => {
    if (!fm) return

    // 1) Resolve topic & owner (with aggressive fallbacks)
    const topicStr = safeStr((versionFi as any)?.topic) || safeStr((headFi as any)?.topic) || safeStr(fileInfo.topic)

    // try version → head → fm.* fields → async getters
    let ownerRaw =
      safeStr((versionFi as any)?.owner) ||
      safeStr((headFi as any)?.owner) ||
      safeStr((fm as any)?.owner) ||
      safeStr((fm as any)?.address) ||
      safeStr((fm as any)?.signerAddress)

    if (!ownerRaw) {
      try {
        ownerRaw = safeStr(await (fm as any)?.getOwner?.())
      } catch {}

      if (!ownerRaw) {
        try {
          ownerRaw = safeStr(await (fm as any)?.getAddress?.())
        } catch {}
      }
    }

    // 2) Normalize the owner to a proper 0x40-hex address if possible
    const ownerStr = normalizeOwnerHex(ownerRaw)

    // 3) Normalize version to 8-byte hex
    const idxHex = toHexIndex((versionFi as any)?.version ?? '0') || toHexIndex(0)

    // 4) Validate references
    const fileRef = (versionFi as any)?.file?.reference
    const histRef = (versionFi as any)?.file?.historyRef

    // 5) Build & show a debug packet (and keep it in state for dev)
    const debugPacket = {
      name: versionFi?.name,
      topicStr,
      ownerRaw,
      ownerStr,
      ownerLooksEth: ETH_RE.test(ownerStr),
      idxRaw: String((versionFi as any)?.version ?? ''),
      idxHex,
      hasFileRef: Boolean(fileRef),
      hasHistoryRef: Boolean(histRef),
      headTopic: safeStr((headFi as any)?.topic),
      headOwner: safeStr((headFi as any)?.owner),
    }
    console.debug('[FM-UI:VH] restore:resolved', debugPacket)
    setRestoreDebug(debugPacket)

    // 6) Hard validations with explicit messages
    if (!topicStr) {
      setError('Failed to restore: could not resolve feed topic.')
      console.debug('[FM-UI:VH] restore:abort (no topic)')

      return
    }

    if (!ownerStr) {
      setError('Failed to restore: could not resolve owner address.')
      console.debug('[FM-UI:VH] restore:abort (no owner)')

      return
    }

    if (!ETH_RE.test(ownerStr)) {
      // bail out early; this was the most common cause in your logs
      setError(`Failed to restore: owner address is not a valid Ethereum address (${ownerStr}).`)
      console.debug('[FM-UI:VH] restore:abort (bad owner format)')

      return
    }

    if (!fileRef || !histRef) {
      setError('Failed to restore: missing file reference(s) on the selected version.')
      console.debug('[FM-UI:VH] restore:abort (missing refs)', { fileRef, histRef })

      return
    }

    // 7) Build the payload exactly for the lib
    const fixed: FileInfo = {
      ...versionFi,
      topic: topicStr as any,
      owner: ownerStr as any, // <- string with 0x prefix
      version: idxHex,
    }

    console.debug('[FM-UI:VH] restore:calling fm.restoreVersion', {
      topic: topicStr,
      owner: ownerStr,
      version: idxHex,
      fileRef,
      histRef,
    })

    try {
      await (fm as FileManagerBase).restoreVersion(fixed)
      console.debug('[FM-UI:VH] restore:success')
      await Promise.resolve(refreshFiles?.())
      onCancelClick()
    } catch (e: any) {
      const msg = String(e?.message || e || '')
      console.debug('[FM-UI:VH] restore:failure', { error: e, message: msg, fixed })
      setRestoreDebug({ ...debugPacket, errorMessage: msg })

      // --- Fallback path: metadata-only upload to "promote" this old file as new head ---
      const looksLikeFeedIndexEqualsBug =
        /uint8ArrayToHex|Bytes\.toHex|FeedIndex\.equals/i.test(e?.stack || '') ||
        /Cannot read properties of undefined \(reading 'toString'\)/i.test(msg)

      if (looksLikeFeedIndexEqualsBug) {
        try {
          const batchId = (versionFi as any)?.batchId?.toString?.() || (headFi as any)?.batchId?.toString?.()

          if (!batchId) throw new Error('Missing batchId for fallback upload')

          console.debug('[FM-UI:VH] restore:fallback-upload:start', {
            batchId,
            topicStr,
            ownerStr,
            idxHex,
          })

          await (fm as any).upload(
            {
              info: {
                batchId,
                // keep same name; you can also choose headFi?.name to avoid duplicates
                name: versionFi.name,
                topic: topicStr,
                // tell FileManager to reuse the existing content
                file: {
                  reference: (versionFi as any).file.reference.toString(),
                  historyRef: (versionFi as any).file.historyRef.toString(),
                },
                // keep metadata if you want it carried over
                customMetadata: versionFi.customMetadata,
              },
            },
            // no uploadOptions (we’re not uploading content)
            undefined,
            // requestOptions
            undefined,
          )

          console.debug('[FM-UI:VH] restore:fallback-upload:success')
          await Promise.resolve(refreshFiles?.())
          onCancelClick()

          return
        } catch (fallbackErr: any) {
          console.debug('[FM-UI:VH] restore:fallback-upload:failure', {
            error: fallbackErr,
            message: String(fallbackErr?.message || fallbackErr || ''),
          })
          // bubble to normal error mapping below
        }
      }

      // nice messages for other cases
      if (/postage|batch|stamp|insufficient/i.test(msg)) {
        setError('Failed to restore: need a valid postage stamp on this drive.')
      } else if (/feed.*not.*found/i.test(msg)) {
        setError('Failed to restore: feed not found for this owner/topic.')
      } else if (/has to be defined|version.*defined/i.test(msg)) {
        setError('Failed to restore: version index was not resolved.')
      } else {
        setError(FM_DEBUG ? `Failed to restore: ${msg}` : 'Failed to restore this version')
      }
    }
  }

  const modalTitle = (
    <>
      Version history – {headFi?.name ?? fileInfo.name}
      {headFi && ` (head v${(parseIndex(headFi.version) ?? BigInt(0)).toString()})`}
    </>
  )

  return createPortal(
    <div className="fm-modal-container">
      <div className="fm-modal-window fm-upgrade-drive-modal">
        <div className="fm-modal-window-header">
          <HistoryIcon size="21px" />
          <span className="fm-main-font-color">{modalTitle}</span>
        </div>

        <div className="fm-modal-window-body fm-expiring-notification-modal-body">
          {error && (
            <div className="fm-modal-white-section fm-soft-text">
              {error}
              {FM_DEBUG && restoreDebug && (
                <pre
                  style={{
                    marginTop: 8,
                    maxHeight: 220,
                    overflow: 'auto',
                    background: '#111',
                    color: '#eee',
                    padding: 8,
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                >
                  {JSON.stringify(restoreDebug, null, 2)}
                </pre>
              )}
            </div>
          )}

          {!error && loading && <div className="fm-loading">Loading…</div>}

          {!error && !loading && pageVersions.length === 0 && (
            <div className="fm-empty">No versions found for this file.</div>
          )}

          {!error &&
            !loading &&
            pageVersions.map(item => {
              const vStr = item.version ?? '0'
              const idx = parseIndex(vStr) ?? BigInt(0)
              const isCurrent = (parseIndex(headFi?.version) ?? BigInt(0)) === idx
              const modified = item.timestamp != null ? new Date(item.timestamp).toLocaleString() : '—'
              const key = `${item.topic?.toString?.() ?? ''}:${toHexIndexStr(idx)}`

              return (
                <div key={key} className="fm-modal-white-section fm-space-between">
                  <div className="fm-version-history-modal-section-left fm-space-between">
                    <div className="fm-version-history-modal-section-left-row">
                      <div className="fm-emphasized-text">v{idx.toString()}</div>
                      {isCurrent && <div className="fm-current-tag">Current</div>}
                    </div>
                    <div className="fm-version-history-modal-section-left-row">
                      <CalendarIcon size="12" /> {modified} <UserIcon size="12" />
                    </div>
                  </div>

                  <div className="fm-version-history-modal-section-right">
                    <FMButton
                      label="Download"
                      variant="secondary"
                      icon={<DownloadIcon size="15" />}
                      onClick={() =>
                        downloadBlob(item.name || 'download', getVersionBlob(item), {
                          size: (item.customMetadata as any)?.size,
                        })
                      }
                    />
                    {!isCurrent && (
                      <FMButton label="Restore" variant="primary" onClick={() => void restoreVersion(item)} />
                    )}
                  </div>
                </div>
              )
            })}
        </div>

        <div className="fm-modal-window-footer fm-space-between">
          <FMButton label="Close" variant="secondary" onClick={onCancelClick} />
          <div>
            <span style={{ marginRight: 12, opacity: 0.7 }}>
              Page {Math.min(currentPage + 1, totalPages)} / {totalPages} · total {allVersions.length}
            </span>
            {hasPrev && <FMButton label="Previous" variant="secondary" onClick={() => setCurrentPage(p => p - 1)} />}
            {hasNext && <FMButton label="Next" variant="primary" onClick={() => setCurrentPage(p => p + 1)} />}
          </div>
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

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
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { useFMTransfers } from '../../hooks/useFMTransfers'

interface VersionHistoryModalProps {
  fileInfo: FileInfo
  onCancelClick: () => void
}

/** ---------------- helpers: version index normalization & dedupe ---------------- */
const HEX_INDEX_BYTES = 8
const HEX_INDEX_CHARS = HEX_INDEX_BYTES * 2
const toHexIndexStr = (i: bigint) => '0x' + i.toString(16).padStart(HEX_INDEX_CHARS, '0')
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

  // Restore to selected version (normalize index to padded hex)
  const restoreVersion = async (versionFi: FileInfo) => {
    if (!fm) return
    try {
      const idx = parseIndex(versionFi.version) ?? BigInt(0)
      const fixed: FileInfo = {
        ...versionFi,
        version: toHexIndexStr(idx),
        ...((versionFi as any).owner ? {} : { owner: (headFi as any)?.owner }),
      }
      try {
        await (fm as any).restoreVersion(fixed)
      } catch {
        await (fm as any).restoreVersion(headFi, toHexIndexStr(idx))
      }
      await Promise.resolve(refreshFiles?.())
      onCancelClick()
    } catch {
      setError('Failed to restore this version')
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
          {error && <div className="fm-modal-white-section fm-soft-text">{error}</div>}
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

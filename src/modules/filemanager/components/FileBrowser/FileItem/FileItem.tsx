import { ReactElement, useCallback, useLayoutEffect, useState } from 'react'
import './FileItem.scss'
import { GetIconElement } from '../../../utils/GetIconElement'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { ViewType } from '../../../constants/constants'
import { GetInfoModal } from '../../GetInfoModal/GetInfoModal'
import { VersionHistoryModal } from '../../VersionHistoryModal/VersionHistoryModal'
import { buildGetInfoGroups } from '../../GetInfoModal/buildFileInfoGroups'
import type { FilePropertyGroup } from '../../GetInfoModal/buildFileInfoGroups'
import { useView } from '../../../providers/FMFileViewContext'
import type { FileInfo, FileManagerBase } from '@solarpunkltd/file-manager-lib'
import { useFM } from '../../../providers/FMContext'

interface FileItemProps {
  fileInfo: FileInfo
  onDownload?: (name: string, task: () => Promise<void>, opts?: { size?: string }) => Promise<void>
}

type BlobWithName = { blob: Blob; fileName: string }

const formatBytes = (v?: string) => {
  const n = v ? Number(v) : NaN

  if (!Number.isFinite(n) || n < 0) return '—'

  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let val = n / 1024,
    i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }

  return `${val.toFixed(1)} ${units[i]}`
}

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

function sanitizeFileName(s: string) {
  return (s || 'download').replace(/[\\/:*?"<>|]+/g, '_')
}

interface FileManagerLike {
  download: (fi: FileInfo, paths?: string[]) => Promise<unknown | unknown[]>
  listFiles: (fi: FileInfo) => Promise<Array<{ path: string }>>
  getVersion: (fi?: FileInfo, version?: string) => Promise<FileInfo>
  restoreVersion?: (fi: FileInfo) => Promise<void>
}

/** ------------ helpers: ACT-publisher aware hydration ------------ */
const HEX_INDEX_BYTES = 8
const HEX_INDEX_CHARS = HEX_INDEX_BYTES * 2
const indexToHex8 = (i: bigint) => `0x${i.toString(16).padStart(HEX_INDEX_CHARS, '0')}`
const parseIndex = (v: unknown): bigint => {
  if (v == null) return BigInt(0)
  const s = String(v).trim()

  return s.startsWith('0x') ? BigInt(s) : BigInt(s || '0')
}

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
  fmLike: FileManagerLike,
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

/** ---------- helpers to locate HEAD for the visible row ---------- */
function historyKey(fi: FileInfo): string {
  const ref = (fi as any)?.file?.historyRef ?? (fi as any)?.historyRef ?? (fi as any)?.actHistoryRef

  return ref ? String(ref) : ''
}

function normTopic(x: unknown): string {
  try {
    return (x as any)?.toString?.() ?? String(x ?? '')
  } catch {
    return String(x ?? '')
  }
}

function pickLatest(a: FileInfo, b: FileInfo): FileInfo {
  const av = BigInt(a?.version ?? '0'),
    bv = BigInt(b?.version ?? '0')

  if (av === bv) return Number(a.timestamp || 0) >= Number(b.timestamp || 0) ? a : b

  return av > bv ? a : b
}

function getHeadCandidate(fmObj: any, seed: FileInfo): FileInfo | null {
  try {
    const list: FileInfo[] = fmObj?.fileInfoList || []

    if (!list.length) return null
    const hist = historyKey(seed)
    let same: FileInfo[]

    if (hist) same = list.filter(f => historyKey(f) === hist)
    else {
      const t = normTopic(seed.topic)
      same = t ? list.filter(f => normTopic(f.topic) === t) : list.filter(f => f.name === seed.name)
    }

    if (!same.length) return null

    return same.reduce(pickLatest)
  } catch {
    return null
  }
}

export function FileItem({ fileInfo, onDownload }: FileItemProps): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view } = useView()
  const { fm, refreshFiles } = useFM()

  const name = fileInfo.name
  const size = formatBytes(fileInfo.customMetadata?.size)
  const dateMod = new Date(fileInfo.timestamp || 0).toLocaleDateString()

  const [safePos, setSafePos] = useState(pos)
  const [dropDir, setDropDir] = useState<'down' | 'up'>('down')
  const [showGetInfoModal, setShowGetInfoModal] = useState(false)
  const [infoGroups, setInfoGroups] = useState<FilePropertyGroup[] | null>(null)
  const [showVersionHistory, setShowVersionHistory] = useState(false)

  const openGetInfo = async () => {
    if (!fm) return
    const groups = await buildGetInfoGroups(fm as FileManagerBase, fileInfo)
    setInfoGroups(groups)
    setShowGetInfoModal(true)
  }

  /** HEAD (latest) — try cached list, else hydrate with publisher fallbacks */
  const ensureHead = useCallback(
    async (fmLike: FileManagerLike, fi: FileInfo): Promise<FileInfo> => {
      console.debug('[FM-UI] ensureHead:req', { name: fi?.name, topic: fi?.topic?.toString?.(), version: fi?.version })
      const cached = getHeadCandidate(fm as any, fi)

      if (cached) {
        console.debug('[FM-UI] ensureHead:hit-cache', { version: cached?.version })

        return cached
      }
      try {
        const res = await hydrateWithPublishers(fmLike, fm as any, fi)
        console.debug('[FM-UI] ensureHead:hydrated', { version: res?.version, actPub: (res as any)?.actPublisher })

        return res
      } catch (e) {
        console.debug('[FM-UI] ensureHead:error', String(e))

        return fi
      }
    },
    [fm],
  )

  const fileInfoToBlob = async (fmLike: FileManagerLike, fi: FileInfo): Promise<BlobWithName> => {
    console.debug('[FM-UI] toBlob:start', { name: fi?.name, topic: fi?.topic?.toString?.(), version: fi?.version })
    const baseName = fi.name || 'download'
    const mime = fi.customMetadata?.mime || 'application/octet-stream'

    let paths: string[] | undefined
    try {
      const entries = await fmLike.listFiles(fi)
      console.debug('[FM-UI] toBlob:listFiles', { count: entries.length, sample: entries.slice(0, 5) })
      const exact = entries.find(e => e.path === baseName || e.path.endsWith('/' + baseName))
      paths = exact ? [exact.path] : entries.map(e => e.path)
    } catch (e) {
      console.debug('[FM-UI] toBlob:listFiles:error', String(e))
      paths = undefined
    }

    console.debug('[FM-UI] toBlob:download:req', { paths })
    const res = await (fmLike.download as any)(fi, paths)
    const arr = Array.isArray(res) ? res : [res]
    console.debug('[FM-UI] toBlob:download:res', { isArray: Array.isArray(res), count: arr.length })

    if (arr.length === 0) throw new Error('No content returned by FileManager.download()')

    const blobs = await Promise.all(arr.map(p => normalizeToBlob(p as DownloadPart, mime)))

    if (blobs.length === 1) return { blob: blobs[0], fileName: baseName }

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    await Promise.all(blobs.map(async (b, i) => zip.file(paths?.[i] ?? `file-${i}`, await b.arrayBuffer())))
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    return { blob: zipBlob, fileName: `${baseName}.zip` }
  }

  const runTracked = (label: string, task: () => Promise<void>) =>
    (typeof onDownload === 'function' ? onDownload : (_: string, t: () => Promise<void>) => t())(label, task, {
      size: fileInfo.customMetadata?.size,
    })

  /** Open latest (HEAD) */
  const handleOpen = async () => {
    handleCloseContext()
    const fmLike = (fm as unknown as FileManagerLike) || null

    if (!fmLike) return
    const win = window.open('', '_blank')
    await runTracked(fileInfo.name || 'open', async () => {
      try {
        const head = await ensureHead(fmLike, fileInfo)
        const headIdx = parseIndex(head.version)
        const anchor: FileInfo = { ...head, version: indexToHex8(headIdx) }
        const hydrated = await hydrateWithPublishers(fmLike, fm as any, anchor, anchor.version)
        const pubs = await getCandidatePublishers(fm as any, anchor)
        const withPublisher = (hydrated as any).actPublisher
          ? hydrated
          : ({ ...hydrated, actPublisher: pubs[0] } as FileInfo)
        const { blob } = await fileInfoToBlob(fmLike, withPublisher)
        console.debug('[FM-UI] open:blob:ok', { bytes: blob.size })

        const url = URL.createObjectURL(blob)

        if (win) {
          win.location.href = url
          setTimeout(() => URL.revokeObjectURL(url), 30000)
        } else {
          window.open(url, '_blank')
          setTimeout(() => URL.revokeObjectURL(url), 30000)
        }
      } catch (e) {
        console.debug('[FM-UI] open:error', String(e))
        win?.close()
        throw e
      }
    })
  }

  /** Download latest (HEAD) */
  const handleDownload = async () => {
    handleCloseContext()
    const fmLike = (fm as unknown as FileManagerLike) || null

    if (!fmLike) return
    await runTracked(fileInfo.name || 'download', async () => {
      const headSeed = await ensureHead(fmLike, fileInfo)
      const headIdx = parseIndex(headSeed.version)
      const anchor: FileInfo = { ...headSeed, version: indexToHex8(headIdx) }
      const hydrated = await hydrateWithPublishers(fmLike, fm as any, anchor, anchor.version)
      const pubs = await getCandidatePublishers(fm as any, anchor)
      const withPublisher = (hydrated as any).actPublisher
        ? hydrated
        : ({ ...hydrated, actPublisher: pubs[0] } as FileInfo)
      const { blob, fileName } = await fileInfoToBlob(fmLike, withPublisher)
      console.debug('[FM-UI] download:blob:ok', { bytes: blob.size, fileName })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = sanitizeFileName(fileName)
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      requestAnimationFrame(() => {
        a.click()
        setTimeout(() => {
          a.remove()
          URL.revokeObjectURL(url)
        }, 0)
      })
    })
  }

  useLayoutEffect(() => {
    if (!showContext) return
    requestAnimationFrame(() => {
      const menu = contextRef.current

      if (!menu) return
      const rect = menu.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 8
      const left = Math.max(margin, Math.min(pos.x, vw - rect.width - margin))
      let top = pos.y
      let dir: 'down' | 'up' = 'down'

      if (pos.y > vh * 0.5 || pos.y + rect.height + margin > vh) {
        top = Math.max(margin, pos.y - rect.height)
        dir = 'up'
      } else {
        top = Math.max(margin, Math.min(pos.y, vh - rect.height - margin))
      }
      setSafePos({ x: left, y: top })
      setDropDir(dir)
    })
  }, [showContext, pos, contextRef])

  return (
    <div className="fm-file-item-content" onContextMenu={handleContextMenu} onClick={handleCloseContext}>
      <div className="fm-file-item-content-item fm-checkbox">
        <input type="checkbox" />
      </div>
      <div className="fm-file-item-content-item fm-name">
        <GetIconElement icon={name} />
        {name}
      </div>
      <div className="fm-file-item-content-item fm-size">{size}</div>
      <div className="fm-file-item-content-item fm-date-mod">{dateMod}</div>

      {showContext && (
        <div
          ref={contextRef}
          className="fm-file-item-context-menu"
          style={{ top: safePos.y, left: safePos.x }}
          data-drop={dropDir}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          {view === ViewType.File ? (
            <ContextMenu>
              <div className="fm-context-item" onClick={handleOpen}>
                View / Open
              </div>
              <div className="fm-context-item" onClick={handleDownload}>
                Download
              </div>
              <div className="fm-context-item" onClick={handleCloseContext}>
                Rename
              </div>
              <div className="fm-context-item-border" />
              <div
                className="fm-context-item"
                onClick={() => {
                  handleCloseContext()
                  setShowVersionHistory(true)
                }}
              >
                Version history
              </div>
              <div className="fm-context-item red" onClick={handleCloseContext}>
                Delete
              </div>
              <div className="fm-context-item-border" />
              <div
                className="fm-context-item"
                onClick={() => {
                  handleCloseContext()
                  void (async () => {
                    const groups = fm ? await buildGetInfoGroups(fm as FileManagerBase, fileInfo) : null

                    if (groups) {
                      setInfoGroups(groups)
                      setShowGetInfoModal(true)
                    }
                  })()
                }}
              >
                Get info
              </div>
            </ContextMenu>
          ) : (
            <ContextMenu>
              <div className="fm-context-item" onClick={handleOpen}>
                View / Open
              </div>
              <div className="fm-context-item" onClick={handleDownload}>
                Download
              </div>
              <div className="fm-context-item-border" />
              <div
                className="fm-context-item"
                onClick={() => {
                  handleCloseContext()
                  setShowVersionHistory(true)
                }}
              >
                Version history
              </div>
              <div className="fm-context-item" onClick={handleCloseContext}>
                Restore
              </div>
              <div className="fm-context-item red" onClick={handleCloseContext}>
                Destroy
              </div>
              <div className="fm-context-item red" onClick={handleCloseContext}>
                Forget permanently
              </div>
              <div className="fm-context-item-border" />
              <div
                className="fm-context-item"
                onClick={() => {
                  handleCloseContext()
                  void openGetInfo()
                }}
              >
                Get info
              </div>
            </ContextMenu>
          )}
        </div>
      )}

      {showGetInfoModal && infoGroups && (
        <GetInfoModal name={name} properties={infoGroups} onCancelClick={() => setShowGetInfoModal(false)} />
      )}

      {showVersionHistory && (
        <VersionHistoryModal fileInfo={fileInfo} onCancelClick={() => setShowVersionHistory(false)} />
      )}
    </div>
  )
}

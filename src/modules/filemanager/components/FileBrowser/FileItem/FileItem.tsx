import { ReactElement, useLayoutEffect, useState } from 'react'
import './FileItem.scss'
import { GetIconElement } from '../../../utils/GetIconElement'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { ViewType } from '../../../constants/constants'
import { GetInfoModal } from '../../GetInfoModal/GetInfoModal'
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
  let val = n / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }

  return `${val.toFixed(1)} ${units[i]}`
}

/* ---------------- Normalizers ---------------- */
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
    const stream = part as unknown as ReadableStream<Uint8Array>
    const u8 = await streamToUint8Array(stream)

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
  getVersion: (fi: FileInfo) => Promise<FileInfo>
  listFiles: (fi: FileInfo) => Promise<Array<{ path: string }>>
  download: (fi: FileInfo, paths?: string[]) => Promise<unknown | unknown[]>
}

/** Local view into optional internals we need to probe for presence only. */
type FileInfoInternals = FileInfo & {
  owner?: string
  actPublisher?: unknown
  file?: {
    reference?: unknown
    historyRef?: unknown
  }
}

const asInternals = (fi: FileInfo): FileInfoInternals => fi as FileInfoInternals

/* ---------------- Component ---------------- */
export function FileItem({ fileInfo, onDownload }: FileItemProps): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view } = useView()
  const { fm } = useFM()

  const name = fileInfo.name
  const size = formatBytes(fileInfo.customMetadata?.size)
  const dateMod = new Date(fileInfo.timestamp || 0).toLocaleDateString()

  const [safePos, setSafePos] = useState(pos)
  const [dropDir, setDropDir] = useState<'down' | 'up'>('down')

  const [showGetInfoModal, setShowGetInfoModal] = useState(false)
  const [infoGroups, setInfoGroups] = useState<FilePropertyGroup[] | null>(null)

  type BlobWithName = { blob: Blob; fileName: string }

  const openGetInfo = async () => {
    if (!fm) return
    const groups = await buildGetInfoGroups(fm as FileManagerBase, fileInfo)
    setInfoGroups(groups)
    setShowGetInfoModal(true)
  }

  const hasEssentials = (fi: FileInfo): boolean => {
    const f = asInternals(fi)
    const hasOwner = typeof f.owner === 'string' && f.owner.length > 0
    const hasRef = typeof f.file?.reference === 'string' && f.file.reference.length > 0
    const hasHist = typeof f.file?.historyRef === 'string' && f.file.historyRef.length > 0
    const hasPub = f.actPublisher !== undefined && f.actPublisher !== null

    return hasOwner && hasRef && hasHist && hasPub
  }

  async function ensureHead(fmLike: FileManagerLike, fi: FileInfo): Promise<FileInfo> {
    if (hasEssentials(fi)) return fi
    const f = asInternals(fi)
    const canGetHead = Boolean(fi.topic) && typeof f.owner === 'string'

    if (!canGetHead) return fi
    try {
      return await fmLike.getVersion(fi)
    } catch {
      return fi
    }
  }

  function validateHead(fi: FileInfo): void {
    const f = asInternals(fi)
    const missing: string[] = []

    if (!(typeof f.owner === 'string' && f.owner)) missing.push('owner')

    if (!(typeof f.file?.reference === 'string' && f.file.reference)) missing.push('file.reference')

    if (!(typeof f.file?.historyRef === 'string' && f.file.historyRef)) missing.push('file.historyRef')

    if (!(f.actPublisher !== undefined && f.actPublisher !== null)) missing.push('actPublisher')

    if (missing.length) throw new Error(`FileInfo missing required fields: ${missing.join(', ')}`)
  }

  async function libDownload(fmLike: FileManagerLike, source: FileInfo): Promise<BlobWithName> {
    const head = await ensureHead(fmLike, source)
    validateHead(head)

    const baseName = head.name || 'download'
    const mime = head.customMetadata?.mime || 'application/octet-stream'

    // Try to enumerate collection paths (ok if it fails — single-file case)
    let paths: string[] | undefined
    try {
      const list = await fmLike.listFiles(head)

      if (Array.isArray(list) && list.length > 0) {
        const matching = list.find(e => e.path === baseName || e.path.endsWith('/' + baseName))
        paths = matching ? [matching.path] : list.map(e => e.path)
      }
    } catch {
      /* ignore: single-file likely */
    }

    const res = await fmLike.download(head, paths)
    const arr = Array.isArray(res) ? res : [res]

    if (arr.length === 0) throw new Error('No content returned by FileManager.download()')

    const blobs = await Promise.all(arr.map(p => normalizeToBlob(p as DownloadPart, mime)))

    if (blobs.length === 1) {
      return { blob: blobs[0], fileName: baseName }
    }

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const names = Array.isArray(paths) && paths.length === blobs.length ? paths : blobs.map((_, i) => `file-${i}`)
    await Promise.all(blobs.map(async (b, i) => zip.file(names[i], await b.arrayBuffer())))
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    return { blob: zipBlob, fileName: `${baseName}.zip` }
  }

  const getBlobAndName = async (): Promise<BlobWithName> => {
    const fmLike = (fm as unknown as FileManagerLike) || null

    if (!fmLike) throw new Error('FM not ready')

    return await libDownload(fmLike, fileInfo)
  }

  const runTracked = (label: string, task: () => Promise<void>) =>
    (typeof onDownload === 'function' ? onDownload : (_: string, t: () => Promise<void>) => t())(label, task, {
      size: fileInfo.customMetadata?.size,
    })

  const handleOpen = async () => {
    handleCloseContext()
    const win = window.open('', '_blank')
    await runTracked(fileInfo.name || 'open', async () => {
      try {
        const { blob } = await getBlobAndName()
        const url = URL.createObjectURL(blob)

        if (win) {
          win.location.href = url
          setTimeout(() => URL.revokeObjectURL(url), 30000)
        } else {
          window.open(url, '_blank')
          setTimeout(() => URL.revokeObjectURL(url), 30000)
        }
      } catch (e) {
        if (win) win.close()
        throw e
      }
    })
  }

  const handleDownload = async () => {
    handleCloseContext()
    await runTracked(fileInfo.name || 'download', async () => {
      const { blob, fileName } = await getBlobAndName()
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
              <div className="fm-context-item" onClick={handleCloseContext}>
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
                  void openGetInfo()
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
              <div className="fm-context-item" onClick={handleCloseContext}>
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
    </div>
  )
}

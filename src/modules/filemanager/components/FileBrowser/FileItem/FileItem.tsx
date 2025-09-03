import { ReactElement, useContext, useLayoutEffect, useState } from 'react'
import './FileItem.scss'
import { GetIconElement } from '../../../utils/GetIconElement'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { ViewType } from '../../../constants/constants'
import { useView } from '../../../providers/FMFileViewContext'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { useFM } from '../../../providers/FMContext'
import { Context as SettingsContext } from '../../../../../providers/Settings'

interface FileItemProps {
  fileInfo: FileInfo
  onDownload?: (name: string, task: () => Promise<void>, opts?: { size?: string }) => Promise<void>
}

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

type BeeBytes = { toUint8Array: () => Uint8Array }
const hasToUint8Array = (x: unknown): x is BeeBytes =>
  typeof x === 'object' && x !== null && 'toUint8Array' in x && typeof (x as BeeBytes).toUint8Array === 'function'
const hasGetReader = (x: unknown): x is { getReader: () => ReadableStreamDefaultReader<Uint8Array> } =>
  typeof x === 'object' &&
  x !== null &&
  'getReader' in x &&
  typeof (x as ReadableStream<Uint8Array>).getReader === 'function'
const hasArrayBufferFn = (x: unknown): x is { arrayBuffer: () => Promise<ArrayBuffer> } =>
  typeof x === 'object' &&
  x !== null &&
  'arrayBuffer' in x &&
  typeof (x as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer === 'function'

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let doneReading = false

  while (!doneReading) {
    const { done, value } = await reader.read()

    if (done) {
      doneReading = true
      break
    }

    if (value) {
      chunks.push(value)
      total += value.byteLength
    }
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }

  return out
}

type DownloadPart =
  | Blob
  | Uint8Array
  | BeeBytes
  | ReadableStream<Uint8Array>
  | { arrayBuffer: () => Promise<ArrayBuffer> }

async function normalizeToBlob(part: DownloadPart, mime?: string): Promise<Blob> {
  const type = mime || 'application/octet-stream'

  if (part instanceof Blob) return part

  if (hasToUint8Array(part)) return new Blob([part.toUint8Array()], { type })

  if (part instanceof Uint8Array) return new Blob([part], { type })

  if (hasGetReader(part)) {
    const u8 = await streamToUint8Array(part as unknown as ReadableStream<Uint8Array>)

    return new Blob([u8], { type })
  }

  if (hasArrayBufferFn(part)) {
    const buf = await part.arrayBuffer()

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

type BeeWrapperJSON = {
  fileRef?: string
  file?: string
  reference?: string
  ref?: string
  dataRef?: string
  uploadFilesRes?: string
  manifestRef?: string
  manifest?: string
}

export function FileItem({ fileInfo, onDownload }: FileItemProps): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view } = useView()
  const { fm } = useFM()
  const { apiUrl } = useContext(SettingsContext)

  const name = fileInfo.name
  const size = formatBytes(fileInfo.customMetadata?.size)
  const dateMod = new Date(fileInfo.timestamp || 0).toLocaleDateString()

  const [safePos, setSafePos] = useState(pos)
  const [dropDir, setDropDir] = useState<'down' | 'up'>('down')

  const fetchJsonFromBytes = async (fi: FileInfo): Promise<BeeWrapperJSON | null> => {
    if (!apiUrl || !fi?.file?.reference || !fi?.file?.historyRef || !fi?.actPublisher) return null
    try {
      const url = `${apiUrl.replace(/\/+$/, '')}/bytes/${fi.file.reference.toString()}`
      const publisher = typeof fi.actPublisher === 'string' ? fi.actPublisher : fi.actPublisher.toString()
      const historyAddr = typeof fi.file.historyRef === 'string' ? fi.file.historyRef : fi.file.historyRef.toString()

      const r = await fetch(url, {
        headers: {
          'Swarm-Act': 'true',
          'Swarm-Act-Publisher': publisher,
          'Swarm-Act-History-Address': historyAddr,
        } as Record<string, string>,
      })

      if (!r.ok) return null
      const text = await r.text()
      try {
        return JSON.parse(text) as BeeWrapperJSON
      } catch {
        return null
      }
    } catch {
      return null
    }
  }

  const fetchBytesByRef = async (ref: string, fi: FileInfo): Promise<Blob | null> => {
    if (!apiUrl) return null
    try {
      const url = `${apiUrl.replace(/\/+$/, '')}/bytes/${ref}`
      const headers: Record<string, string> = {}

      if (fi?.actPublisher && fi?.file?.historyRef) {
        headers['Swarm-Act'] = 'true'
        headers['Swarm-Act-Publisher'] =
          typeof fi.actPublisher === 'string' ? fi.actPublisher : fi.actPublisher.toString()
        headers['Swarm-Act-History-Address'] =
          typeof fi.file.historyRef === 'string' ? fi.file.historyRef : fi.file.historyRef.toString()
      }
      const r = await fetch(url, { headers })

      if (!r.ok) return null

      return await r.blob()
    } catch {
      return null
    }
  }

  const fetchFromManifestPath = async (manifestRef: string, path: string): Promise<Blob | null> => {
    if (!apiUrl) return null
    try {
      const base = apiUrl.replace(/\/+$/, '')
      const url = `${base}/bzz/${manifestRef}/${encodeURIComponent(path)}`
      const r = await fetch(url)

      if (!r.ok) return null

      return await r.blob()
    } catch {
      return null
    }
  }

  const ensureHead = async (fi: FileInfo, fmLike: FileManagerLike): Promise<FileInfo> => {
    const essentialsOk = Boolean(fi?.file?.reference && fi?.file?.historyRef && fi?.actPublisher)

    if (essentialsOk) return fi
    const canGetHead = Boolean(fi?.topic && (fi as unknown as { owner?: unknown })?.owner)

    if (!canGetHead) return fi
    try {
      return await fmLike.getVersion(fi)
    } catch {
      return fi
    }
  }

  type BlobWithName = { blob: Blob; fileName: string }

  async function attemptFmDownload(
    fmLike: FileManagerLike,
    head: FileInfo,
    baseName: string,
    mime: string,
  ): Promise<BlobWithName | null> {
    try {
      const list = await fmLike.listFiles(head)

      if (!list?.length) return null

      const matching = list.find(e => e.path === baseName || e.path.endsWith('/' + baseName))
      const paths = matching ? [matching.path] : list.map(e => e.path)

      const res = await fmLike.download(head, paths)
      const arr = Array.isArray(res) ? res : [res]
      const blobs = await Promise.all(arr.map(p => normalizeToBlob(p as DownloadPart, mime)))

      if (blobs.length === 1) return { blob: blobs[0], fileName: baseName }

      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      await Promise.all(
        blobs.map(async (b, i) => {
          const ab = await b.arrayBuffer()
          const name = paths[i] || `file-${i}`
          zip.file(name, ab)
        }),
      )
      const zipBlob = await zip.generateAsync({ type: 'blob' })

      return { blob: zipBlob, fileName: `${baseName}.zip` }
    } catch {
      return null
    }
  }

  async function attemptWrapperFallback(head: FileInfo, baseName: string): Promise<BlobWithName | null> {
    const wrapper = await fetchJsonFromBytes(head)

    if (!wrapper || typeof wrapper !== 'object') return null

    const refCandidate = wrapper.fileRef || wrapper.file || wrapper.reference || wrapper.ref || wrapper.dataRef || null

    if (typeof refCandidate === 'string') {
      const b = await fetchBytesByRef(refCandidate, head)

      if (b) return { blob: b, fileName: baseName }
    }

    const manifest = wrapper.uploadFilesRes || wrapper.manifestRef || wrapper.manifest || null

    if (typeof manifest === 'string') {
      const tryPath = head.name || baseName
      const b = await fetchFromManifestPath(manifest, tryPath)

      if (b) return { blob: b, fileName: baseName }
    }

    return null
  }

  const getBlobAndName = async (): Promise<BlobWithName> => {
    const fmLike = (fm as unknown as FileManagerLike) || null

    if (!fmLike) throw new Error('FM not ready')

    const head = await ensureHead(fileInfo, fmLike)
    const mime = head.customMetadata?.mime || 'application/octet-stream'
    const baseName = head.name || 'download'

    const fmResult = await attemptFmDownload(fmLike, head, baseName, mime)

    if (fmResult) return fmResult

    const fallback = await attemptWrapperFallback(head, baseName)

    if (fallback) return fallback

    throw new Error('Manifest or raw bytes unavailable')
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
              <div className="fm-context-item" onClick={handleCloseContext}>
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
              <div className="fm-context-item" onClick={handleCloseContext}>
                Get info
              </div>
            </ContextMenu>
          )}
        </div>
      )}
    </div>
  )
}

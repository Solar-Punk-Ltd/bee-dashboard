import { ReactElement, useCallback, useLayoutEffect, useMemo, useState } from 'react'
import './FileItem.scss'
import { GetIconElement } from '../../../utils/GetIconElement'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { ViewType } from '../../../constants/constants'
import { GetInfoModal } from '../../GetInfoModal/GetInfoModal'
import { VersionHistoryModal } from '../../VersionHistoryModal/VersionHistoryModal'
import { DeleteFileModal } from '../../DeleteFileModal/DeleteFileModal'
import { RenameFileModal } from '../../RenameFileModal/RenameFileModal'
import { buildGetInfoGroups } from '../../GetInfoModal/buildFileInfoGroups'
import type { FilePropertyGroup } from '../../GetInfoModal/buildFileInfoGroups'
import { useView } from '../../../providers/FMFileViewContext'
import type { FileInfo, FileInfoOptions, FileStatus } from '@solarpunkltd/file-manager-lib'
import { useFM } from '../../../providers/FMContext'
import { BatchId } from '@ethersphere/bee-js'
import { DestroyDriveModal } from '../../DestroyDriveModal/DestroyDriveModal'
import type { PostageBatch } from '@ethersphere/bee-js'

interface FileItemProps {
  fileInfo: FileInfo
  onDownload?: (name: string, task: () => Promise<void>, opts?: { size?: string }) => Promise<void>
  showDriveColumn?: boolean
  driveLabel?: string
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

/** Minimal surface used by this component; purposely widened for compatibility. */
type FileManagerLike = {
  download: (fi: FileInfo, paths?: string[]) => Promise<ReadableStream<Uint8Array>[] | Uint8Array[] | unknown>
  listFiles: (fi: FileInfo) => Promise<Array<{ path: string }>>
  getVersion: (fi: FileInfo, version?: string | number | bigint) => Promise<FileInfo>
  restoreVersion?: (fi: FileInfo) => Promise<void>
  trashFile: (fi: FileInfo) => Promise<void>
  recoverFile: (fi: FileInfo) => Promise<void>
  forgetFile: (fi: FileInfo) => Promise<void>
  destroyVolume: (batchId: BatchId) => Promise<void>
  upload: (opts: FileInfoOptions) => Promise<void>
  fileInfoList?: FileInfo[]
  bee?: { getNodeAddresses?: () => Promise<{ publicKey?: string }> }
}

const HEX_INDEX_BYTES = 8
const HEX_INDEX_CHARS = HEX_INDEX_BYTES * 2
const indexToHex8 = (i: bigint) => `0x${i.toString(16).padStart(HEX_INDEX_CHARS, '0')}`

const parseIndex = (v: unknown): bigint => {
  if (v == null) return BigInt(0)
  const s = String(v).trim()

  return s.startsWith('0x') ? BigInt(s) : BigInt(s || '0')
}

const toStr = (x: unknown): string => {
  try {
    return (x as { toString?: () => string })?.toString?.() ?? String(x ?? '')
  } catch {
    return String(x ?? '')
  }
}

function sameTopic(a?: FileInfo, b?: FileInfo): boolean {
  try {
    return toStr(a?.topic) === toStr(b?.topic)
  } catch {
    return false
  }
}

async function getCandidatePublishers(
  fm: Pick<FileManagerLike, 'fileInfoList' | 'bee'>,
  seed: FileInfo,
): Promise<string[]> {
  const out = new Set<string>()
  const seedPub = seed.actPublisher

  if (seedPub) out.add(toStr(seedPub))

  try {
    const pub = await fm.bee?.getNodeAddresses?.()

    if (pub?.publicKey) out.add(String(pub.publicKey))
  } catch {
    /* ignore */
  }

  try {
    const list: FileInfo[] = fm.fileInfoList || []
    for (const f of list) {
      if (sameTopic(f, seed) && f.actPublisher) out.add(toStr(f.actPublisher))
    }
  } catch {
    /* ignore */
  }

  return Array.from(out)
}

async function hydrateWithPublishers(
  fmLike: FileManagerLike,
  fmAny: Pick<FileManagerLike, 'fileInfoList' | 'bee'>,
  seed: FileInfo,
  version?: string,
): Promise<FileInfo> {
  const pubs = await getCandidatePublishers(fmAny, seed)
  for (const p of pubs) {
    try {
      const variant: FileInfo = { ...seed, actPublisher: p }
      const res = await fmLike.getVersion(variant, version)

      return res.actPublisher ? res : { ...res, actPublisher: p }
    } catch {
      /* try next */
    }
  }
  const res = await fmLike.getVersion(seed, version)

  return res.actPublisher || pubs.length === 0 ? res : { ...res, actPublisher: pubs[0] }
}

function historyKey(fi: FileInfo): string {
  const ref = (fi.file as { historyRef?: unknown })?.historyRef

  return ref ? toStr(ref) : ''
}

function normTopic(x: unknown): string {
  return toStr(x)
}

function pickLatest(a: FileInfo, b: FileInfo): FileInfo {
  const av = BigInt(a?.version ?? '0')
  const bv = BigInt(b?.version ?? '0')

  if (av === bv) return Number(a.timestamp || 0) >= Number(b.timestamp || 0) ? a : b

  return av > bv ? a : b
}

function getHeadCandidate(fmObj: { fileInfoList?: FileInfo[] } | null | undefined, seed: FileInfo): FileInfo | null {
  try {
    const list: FileInfo[] = fmObj?.fileInfoList || []

    if (!list.length) return null
    const hist = historyKey(seed)
    const seedTopicNorm = normTopic(seed.topic)

    const same = list.filter(f => {
      if (hist) return historyKey(f) === hist

      if (seedTopicNorm) return normTopic(f.topic) === seedTopicNorm

      return f.name === seed.name
    })

    return same.length ? same.reduce(pickLatest) : null
  } catch {
    return null
  }
}

const batchIdToString = (id: string | BatchId | undefined): string =>
  typeof id === 'string' ? id : id?.toString() ?? ''

function getBatchIdForFile(fi: FileInfo, fallback?: unknown): string | undefined {
  const direct = fi?.batchId

  if (direct) return batchIdToString(direct as string | BatchId | undefined)

  if (fallback != null) return toStr(fallback)

  return undefined
}

type FMContextLike = {
  fm: unknown
  files: FileInfo[]
  currentBatch: { batchID: { toString(): string }; label?: string } | null
  refreshFiles: () => void | Promise<void>
}

type GetInfoFM = Parameters<typeof buildGetInfoGroups>[0]

export function FileItem({ fileInfo, onDownload, showDriveColumn, driveLabel }: FileItemProps): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { fm, refreshFiles, currentBatch, files } = useFM() as unknown as FMContextLike
  const fmLike = (fm || null) as FileManagerLike | null
  const { view } = useView()

  const name = fileInfo.name
  const size = formatBytes(fileInfo.customMetadata?.size)
  const dateMod = new Date(fileInfo.timestamp || 0).toLocaleDateString()
  const currentDriveName = currentBatch?.label
  const isTrashedFile = (fileInfo.status as FileStatus) === 'trashed'
  const statusLabel = isTrashedFile ? 'Trash' : 'Active'
  const [safePos, setSafePos] = useState(pos)
  const [dropDir, setDropDir] = useState<'down' | 'up'>('down')
  const [showGetInfoModal, setShowGetInfoModal] = useState(false)
  const [infoGroups, setInfoGroups] = useState<FilePropertyGroup[] | null>(null)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showDestroyDriveModal, setShowDestroyDriveModal] = useState(false)
  const [destroyStamp, setDestroyStamp] = useState<Pick<PostageBatch, 'batchID' | 'label'> | null>(null)
  const thisHistory = historyKey(fileInfo)

  const makeStampForFile = (): Pick<PostageBatch, 'batchID' | 'label'> | null => {
    const batchIdStr = getBatchIdForFile(fileInfo, currentBatch?.batchID ?? null)

    if (!batchIdStr) return null

    return { batchID: new BatchId(batchIdStr), label: currentBatch?.label ?? '' }
  }

  const openGetInfo = async () => {
    if (!fmLike) return
    const groups = await buildGetInfoGroups(fm as GetInfoFM, fileInfo)
    setInfoGroups(groups)
    setShowGetInfoModal(true)
  }

  const takenNames = useMemo(() => {
    if (!currentBatch || !files) return new Set<string>()
    const wanted = currentBatch.batchID.toString()
    const sameDrive = files.filter(fi => batchIdToString(fi.batchId) === wanted)
    const out = new Set<string>()
    sameDrive.forEach(fi => {
      const n = fi.name || ''

      if (!n) return

      if (historyKey(fi) !== thisHistory) out.add(n)
    })

    return out
  }, [files, currentBatch, thisHistory])

  const ensureHead = useCallback(async (manager: FileManagerLike, fi: FileInfo): Promise<FileInfo> => {
    const cached = getHeadCandidate(manager, fi)

    if (cached) return cached
    try {
      return await hydrateWithPublishers(manager, manager, fi)
    } catch {
      return fi
    }
  }, [])

  const fileInfoToBlob = async (manager: FileManagerLike, fi: FileInfo): Promise<BlobWithName> => {
    const baseName = fi.name || 'download'
    const mime = fi.customMetadata?.mime || 'application/octet-stream'

    let paths: string[] | undefined
    try {
      const entries = await manager.listFiles(fi)
      const exact = entries.find(e => e.path === baseName || e.path.endsWith('/' + baseName))
      paths = exact ? [exact.path] : entries.map(e => e.path)
    } catch {
      paths = undefined
    }

    const res = await manager.download(fi, paths)
    const parts = (Array.isArray(res) ? res : [res]) as Array<ReadableStream<Uint8Array> | Uint8Array>

    if (parts.length === 0) throw new Error('No content returned by FileManager.download()')

    const blobs = await Promise.all(parts.map(p => normalizeToBlob(p as DownloadPart, mime)))

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

  const handleOpen = async () => {
    handleCloseContext()

    if (!fmLike) return
    const win = window.open('', '_blank')
    await runTracked(fileInfo.name || 'open', async () => {
      try {
        const head = await ensureHead(fmLike, fileInfo)
        const headIdx = parseIndex(head.version)
        const anchor: FileInfo = { ...head, version: indexToHex8(headIdx) }
        const hydrated = await hydrateWithPublishers(fmLike, fmLike, anchor, anchor.version)
        const pubs = await getCandidatePublishers(fmLike, anchor)
        const withPublisher: FileInfo = hydrated.actPublisher ? hydrated : { ...hydrated, actPublisher: pubs[0] ?? '' }
        const { blob } = await fileInfoToBlob(fmLike, withPublisher)
        const url = URL.createObjectURL(blob)

        if (win) {
          win.location.href = url
          setTimeout(() => URL.revokeObjectURL(url), 30000)
        } else {
          const popup = window.open(url, '_blank')

          if (!popup) return
          setTimeout(() => URL.revokeObjectURL(url), 30000)
        }
      } catch {
        win?.close()
        throw new Error('Open failed')
      }
    })
  }

  const handleDownload = async () => {
    handleCloseContext()

    if (!fmLike) return

    await runTracked(fileInfo.name || 'download', async () => {
      const headSeed = await ensureHead(fmLike, fileInfo)
      const headIdx = parseIndex(headSeed.version)
      const anchor: FileInfo = { ...headSeed, version: indexToHex8(headIdx) }
      const hydrated = await hydrateWithPublishers(fmLike, fmLike, anchor, anchor.version)
      const pubs = await getCandidatePublishers(fmLike, anchor)
      const withPublisher: FileInfo = hydrated.actPublisher ? hydrated : { ...hydrated, actPublisher: pubs[0] ?? '' }
      const { blob, fileName } = await fileInfoToBlob(fmLike, withPublisher)

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

  const doTrash = async () => {
    if (!fmLike) return
    await fmLike.trashFile(fileInfo)
    await Promise.resolve(refreshFiles?.())
  }

  const doRecover = async () => {
    if (!fmLike) return
    await fmLike.recoverFile(fileInfo)
    await Promise.resolve(refreshFiles?.())
  }

  const doForget = async () => {
    if (!fmLike) return
    await fmLike.forgetFile(fileInfo)
    await Promise.resolve(refreshFiles?.())
  }

  /** Destroy the drive that owns THIS file (use the file’s own stamp when available). */
  const doDestroyDrive = () => {
    const s = makeStampForFile()

    if (!s) return
    setDestroyStamp(s)
    setShowDestroyDriveModal(true)
  }

  /** Rename = publish a new version with the same content refs but a new `name`. */
  const doRename = async (newName: string) => {
    if (!fmLike) return

    if (takenNames.has(newName)) throw new Error('name-taken')

    const batchId = getBatchIdForFile(fileInfo, currentBatch?.batchID)

    if (!batchId) throw new Error('no-batch')

    const headSeed = await ensureHead(fmLike, fileInfo)
    const headIdx = parseIndex(headSeed.version)
    const anchor: FileInfo = { ...headSeed, version: indexToHex8(headIdx) }

    let hydrated = headSeed
    try {
      hydrated = await hydrateWithPublishers(fmLike, fmLike, anchor, anchor.version)
    } catch {
      /* best-effort hydration */
    }
    const pubs = await getCandidatePublishers(fmLike, anchor)
    const withPublisher: FileInfo = hydrated.actPublisher ? hydrated : { ...hydrated, actPublisher: pubs[0] ?? '' }

    const ref = (withPublisher.file as { reference?: unknown })?.reference
    const historyRef = (withPublisher.file as { historyRef?: unknown })?.historyRef

    if (!ref || !historyRef) throw new Error('missing-refs')

    const info: FileInfoOptions['info'] = {
      batchId: String(batchId),
      name: newName,
      topic: withPublisher.topic,
      file: {
        reference: toStr(ref),
        historyRef: toStr(historyRef),
      },
      customMetadata: withPublisher.customMetadata ?? {},
    }

    await fmLike.upload({ info })
    await Promise.resolve(refreshFiles?.())
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

      {showDriveColumn && (
        <div className="fm-file-item-content-item fm-drive">
          <span className="fm-drive-name">{(driveLabel || '').trim()}</span>
          <span className={`fm-pill ${isTrashedFile ? 'fm-pill--trash' : 'fm-pill--active'}`} title={statusLabel}>
            {statusLabel}
          </span>
        </div>
      )}

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
              <div
                className="fm-context-item"
                onClick={() => {
                  handleCloseContext()
                  setShowRenameModal(true)
                }}
              >
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
              <div
                className="fm-context-item red"
                onClick={() => {
                  handleCloseContext()
                  setShowDeleteModal(true)
                }}
              >
                Delete
              </div>
              <div className="fm-context-item-border" />
              <div
                className="fm-context-item"
                onClick={() => {
                  handleCloseContext()
                  void (async () => {
                    const groups = fm ? await buildGetInfoGroups(fm as GetInfoFM, fileInfo) : null

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
                  void doRecover()
                }}
              >
                Restore
              </div>
              <div
                className="fm-context-item red"
                onClick={() => {
                  handleCloseContext()
                  const s = makeStampForFile()

                  if (!s) return
                  setDestroyStamp(s)
                  setShowDestroyDriveModal(true)
                }}
              >
                Destroy
              </div>
              <div
                className="fm-context-item red"
                onClick={() => {
                  handleCloseContext()
                  void doForget()
                }}
              >
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

      {showDeleteModal && (
        <DeleteFileModal
          name={name}
          currentDriveName={currentDriveName}
          onCancelClick={() => setShowDeleteModal(false)}
          onProceed={async action => {
            setShowDeleteModal(false)

            if (action === 'trash') await doTrash()
            else if (action === 'forget') await doForget()
            else if (action === 'destroy') await doDestroyDrive()
          }}
        />
      )}
      {showRenameModal && (
        <RenameFileModal
          currentName={name}
          takenNames={(() => {
            try {
              const driveId = currentBatch?.batchID?.toString?.()

              if (!driveId) return new Set<string>()
              const sameDrive = (files || []).filter(fi => batchIdToString(fi.batchId) === driveId)
              const names = sameDrive.map(fi => fi?.name || '').filter(n => n && n !== name)

              return new Set(names)
            } catch {
              return new Set<string>()
            }
          })()}
          onCancelClick={() => setShowRenameModal(false)}
          onProceed={async newName => {
            try {
              await doRename(newName)
              setShowRenameModal(false)
            } catch {
              /* keep modal open on error */
            }
          }}
        />
      )}

      {showDestroyDriveModal && destroyStamp && (
        <DestroyDriveModal
          stamp={destroyStamp}
          onCancelClick={() => {
            setShowDestroyDriveModal(false)
            setDestroyStamp(null)
          }}
          onConfirm={async batchId => {
            if (!fmLike) return
            await fmLike.destroyVolume(batchId)
            await Promise.resolve(refreshFiles?.())
            setShowDestroyDriveModal(false)
            setDestroyStamp(null)
          }}
        />
      )}
    </div>
  )
}

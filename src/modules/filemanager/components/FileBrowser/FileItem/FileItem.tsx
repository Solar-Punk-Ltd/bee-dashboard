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
import type { FileInfo, FileManager, FileInfoOptions, FileStatus } from '@solarpunkltd/file-manager-lib'
import { useFM } from '../../../providers/FMContext'
import { BatchId } from '@ethersphere/bee-js'
import { DestroyDriveModal } from '../../DestroyDriveModal/DestroyDriveModal'
import type { PostageBatch } from '@ethersphere/bee-js'

import {
  formatBytes,
  sanitizeFileName,
  parseIndexSafe,
  indexToHex8,
  normalizeToBlob,
  historyKey,
  getHeadCandidate,
  getBatchIdForFile,
  batchIdToString,
  hydrateWithPublishers,
  getCandidatePublishers,
  computeContextMenuPosition,
  toStr,
} from '../../../utils/fm'

import type { DownloadPart } from '../../../utils/fm'

interface FileItemProps {
  fileInfo: FileInfo
  onDownload?: (name: string, task: () => Promise<void>, opts?: { size?: string }) => Promise<void>
  showDriveColumn?: boolean
  driveLabel?: string
}

type BlobWithName = { blob: Blob; fileName: string }

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
  const fmLike = (fm || null) as FileManager | null
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

  const ensureHead = useCallback(async (manager: FileManager, fi: FileInfo): Promise<FileInfo> => {
    const cached = getHeadCandidate(manager, fi)

    if (cached) return cached
    try {
      return await hydrateWithPublishers(manager, manager, fi)
    } catch {
      return fi
    }
  }, [])

  const fileInfoToBlob = async (manager: FileManager, fi: FileInfo): Promise<BlobWithName> => {
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
        const headIdx = parseIndexSafe(head.version)
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
      const headIdx = parseIndexSafe(headSeed.version)
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

  const doDestroyDrive = () => {
    const s = makeStampForFile()

    if (!s) return
    setDestroyStamp(s)
    setShowDestroyDriveModal(true)
  }

  const doRename = async (newName: string) => {
    if (!fmLike) return

    if (takenNames.has(newName)) throw new Error('name-taken')

    const batchId = getBatchIdForFile(fileInfo, currentBatch?.batchID)

    if (!batchId) throw new Error('no-batch')

    const headSeed = await ensureHead(fmLike, fileInfo)
    const headIdx = parseIndexSafe(headSeed.version)
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
      const { safePos: s, dropDir: d } = computeContextMenuPosition({
        clickPos: pos,
        menuRect: menu.getBoundingClientRect(),
        viewport: { w: window.innerWidth, h: window.innerHeight },
        margin: 8,
      })
      setSafePos(s)
      setDropDir(d)
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

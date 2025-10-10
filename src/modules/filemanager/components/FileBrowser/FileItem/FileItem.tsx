import { ReactElement, useContext, useLayoutEffect, useMemo, useState, useRef, useEffect, useCallback } from 'react'
import './FileItem.scss'
import { GetIconElement } from '../../../utils/GetIconElement'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { Context as SettingsContext } from '../../../../../providers/Settings'
import { ViewType } from '../../../constants/fileTransfer'
import { GetInfoModal } from '../../GetInfoModal/GetInfoModal'
import { VersionHistoryModal } from '../../VersionHistoryModal/VersionHistoryModal'
import { DeleteFileModal } from '../../DeleteFileModal/DeleteFileModal'
import { RenameFileModal } from '../../RenameFileModal/RenameFileModal'
import { buildGetInfoGroups } from '../../../utils/infoGroups'
import type { FilePropertyGroup } from '../../../utils/infoGroups'
import { useView } from '../../../../../pages/filemanager/ViewContext'
import type { DriveInfo, FileInfo } from '@solarpunkltd/file-manager-lib'
import { Context as FMContext } from '../../../../../providers/FileManager'
import { DestroyDriveModal } from '../../DestroyDriveModal/DestroyDriveModal'
import { ConfirmModal } from '../../ConfirmModal/ConfirmModal'

import { Dir, formatBytes, isTrashed } from '../../../utils/common'
import { FileAction } from '../../../constants/fileTransfer'
import { startDownloadingQueue } from '../../../utils/download'
import { computeContextMenuPosition } from '../../../utils/ui'
import { getUsableStamps, handleDestroyDrive } from '../../../utils/bee'
import { PostageBatch } from '@ethersphere/bee-js'

interface FileItemProps {
  fileInfo: FileInfo
  onDownload: (name: string, size?: string, expectedSize?: number) => (progress: number, isDownloading: boolean) => void
  showDriveColumn?: boolean
  driveName: string
  selected?: boolean
  onToggleSelected?: (fi: FileInfo, checked: boolean) => void
  bulkSelectedCount?: number
  onBulk: {
    download?: () => void
    restore?: () => void
    forget?: () => void
    destroy?: () => void
    delete?: () => void
  }
}

export function FileItem({
  fileInfo,
  onDownload,
  showDriveColumn,
  driveName,
  selected = false,
  onToggleSelected,
  bulkSelectedCount,
  onBulk,
}: FileItemProps): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { fm, refreshFiles, currentDrive, files, drives } = useContext(FMContext)
  const { beeApi } = useContext(SettingsContext)
  const { view } = useView()
  const [driveStamp, setDriveStamp] = useState<PostageBatch | undefined>(undefined)

  const isMountedRef = useRef(true)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    isMountedRef.current = true

    const getStamps = async () => {
      const stamps = await getUsableStamps(beeApi)
      const driveStamp = stamps.find(s =>
        drives.some(d => d.batchId.toString() === s.batchID.toString() && d.id === fileInfo.driveId),
      )

      if (isMountedRef.current) {
        setDriveStamp(driveStamp)
      }
    }

    getStamps()

    return () => {
      isMountedRef.current = false

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [beeApi, drives, fileInfo.driveId])

  const size = formatBytes(fileInfo.customMetadata?.size)
  const dateMod = new Date(fileInfo.timestamp || 0).toLocaleDateString()
  const isTrashedFile = isTrashed(fileInfo)
  const statusLabel = isTrashedFile ? 'Trash' : 'Active'

  const [safePos, setSafePos] = useState(pos)
  const [dropDir, setDropDir] = useState<Dir>(Dir.Down)
  const [showGetInfoModal, setShowGetInfoModal] = useState(false)
  const [infoGroups, setInfoGroups] = useState<FilePropertyGroup[] | null>(null)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showDestroyDriveModal, setShowDestroyDriveModal] = useState(false)
  const [destroyDrive, setDestroyDrive] = useState<DriveInfo | null>(null)
  const [confirmForget, setConfirmForget] = useState(false)

  const openGetInfo = useCallback(async () => {
    if (!fm) return
    const groups = await buildGetInfoGroups(fm, fileInfo, driveName, driveStamp)
    setInfoGroups(groups)
    setShowGetInfoModal(true)
  }, [fm, fileInfo, driveName, driveStamp])

  const takenNames = useMemo(() => {
    if (!currentDrive || !files) return new Set<string>()
    const wanted = currentDrive.batchId.toString()
    const sameDrive = files.filter(fi => fi.batchId.toString() === wanted)
    const out = new Set<string>()
    sameDrive.forEach(fi => {
      if (fi.topic.toString() !== fileInfo.topic.toString()) out.add(fi.name)
    })

    return out
  }, [files, currentDrive, fileInfo.topic])

  // TODO: handleOpen shall only be available for images, videos etc... -> do not download 10GB into memory
  const handleDownload = useCallback(
    async (isNewWindow?: boolean) => {
      handleCloseContext()

      if (!fm || !beeApi) return
      const rawSize = fileInfo.customMetadata?.size
      const expectedSize = rawSize ? Number(rawSize) : undefined
      await startDownloadingQueue(
        fm,
        [fileInfo],
        onDownload(fileInfo.name, formatBytes(rawSize), expectedSize),
        isNewWindow,
      )
    },
    [handleCloseContext, fm, beeApi, fileInfo, onDownload],
  )

  const doTrash = useCallback(async () => {
    if (!fm) return
    const withMeta = {
      ...fileInfo,
      customMetadata: {
        ...(fileInfo.customMetadata ?? {}),
        lifecycle: 'Trashed',
        lifecycleAt: new Date().toISOString(),
      },
    }
    await fm.trashFile(withMeta as FileInfo)
    await Promise.resolve(refreshFiles?.())
  }, [fm, fileInfo, refreshFiles])

  const doRecover = useCallback(async () => {
    if (!fm) return
    const withMeta = {
      ...fileInfo,
      customMetadata: {
        ...(fileInfo.customMetadata ?? {}),
        lifecycle: 'Recovered',
        lifecycleAt: new Date().toISOString(),
      },
    }
    await fm.recoverFile(withMeta as FileInfo)
    await Promise.resolve(refreshFiles?.())
  }, [fm, fileInfo, refreshFiles])

  const doForget = useCallback(async () => {
    if (!fm) return
    await fm.forgetFile(fileInfo)
    await Promise.resolve(refreshFiles?.())
  }, [fm, fileInfo, refreshFiles])

  const showDestroyDrive = useCallback(() => {
    setDestroyDrive(currentDrive || null)
    setShowDestroyDriveModal(true)
  }, [currentDrive])
  // TODO: do rename upload progress
  const doRename = useCallback(
    async (newName: string) => {
      if (!fm || !currentDrive) return

      if (takenNames.has(newName)) throw new Error('name-taken')

      await fm.upload(
        currentDrive,
        {
          info: {
            name: newName,
            topic: fileInfo.topic,
            file: {
              reference: fileInfo.file.reference,
              historyRef: fileInfo.file.historyRef,
            },
            customMetadata: fileInfo.customMetadata,
          },
        },
        {
          actHistoryAddress: fileInfo.file.historyRef,
        },
      )

      await Promise.resolve(refreshFiles?.())
    },
    [fm, currentDrive, fileInfo, takenNames, refreshFiles],
  )

  const MenuItem = ({
    disabled,
    danger,
    onClick,
    children,
  }: {
    disabled?: boolean
    danger?: boolean
    onClick?: () => void
    children: React.ReactNode
  }) => (
    <div
      className={`fm-context-item${danger ? ' red' : ''}`}
      aria-disabled={disabled ? 'true' : 'false'}
      style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </div>
  )

  const isBulk = (bulkSelectedCount ?? 0) > 1

  const renderContextMenuItems = useCallback(() => {
    const viewItem = (
      <MenuItem disabled={isBulk} onClick={() => handleDownload(true)}>
        View / Open
      </MenuItem>
    )

    const downloadItem = isBulk ? (
      <MenuItem onClick={onBulk.download}>Download</MenuItem>
    ) : (
      <MenuItem onClick={() => handleDownload(false)}>Download</MenuItem>
    )

    const getInfoItem = (
      <MenuItem
        disabled={isBulk}
        onClick={() => {
          handleCloseContext()
          openGetInfo()
        }}
      >
        Get info
      </MenuItem>
    )

    if (view === ViewType.File) {
      return (
        <>
          {viewItem}
          {downloadItem}
          <MenuItem
            disabled={isBulk}
            onClick={() => {
              handleCloseContext()
              setShowRenameModal(true)
            }}
          >
            Rename
          </MenuItem>
          <div className="fm-context-item-border" />
          <MenuItem
            disabled={isBulk}
            onClick={() => {
              handleCloseContext()
              setShowVersionHistory(true)
            }}
          >
            Version history
          </MenuItem>
          <MenuItem
            danger
            onClick={() => {
              handleCloseContext()

              if (isBulk) onBulk.delete?.()
              else setShowDeleteModal(true)
            }}
          >
            Delete
          </MenuItem>
          <div className="fm-context-item-border" />
          {getInfoItem}
        </>
      )
    }

    return (
      <>
        {viewItem}
        {downloadItem}
        <div className="fm-context-item-border" />
        {isBulk ? (
          <>
            <MenuItem danger onClick={onBulk.restore}>
              Restore
            </MenuItem>
            <MenuItem danger onClick={onBulk.destroy}>
              Destroy
            </MenuItem>
            <MenuItem danger onClick={onBulk.forget}>
              Forget permanently
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem
              danger
              onClick={() => {
                handleCloseContext()
                doRecover()
              }}
            >
              Restore
            </MenuItem>
            <MenuItem
              danger
              onClick={() => {
                handleCloseContext()
                setShowDestroyDriveModal(true)
              }}
            >
              Destroy
            </MenuItem>
            <MenuItem
              danger
              onClick={() => {
                handleCloseContext()
                setConfirmForget(true)
              }}
            >
              Forget permanently
            </MenuItem>
          </>
        )}
        <div className="fm-context-item-border" />
        {getInfoItem}
      </>
    )
  }, [isBulk, view, handleDownload, handleCloseContext, openGetInfo, doRecover, onBulk])

  useLayoutEffect(() => {
    if (!showContext) return

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      if (!isMountedRef.current) return

      const menu = contextRef.current

      if (!menu) return
      const { safePos: s, dropDir: d } = computeContextMenuPosition({
        clickPos: pos,
        menuRect: menu.getBoundingClientRect(),
        viewport: { w: window.innerWidth, h: window.innerHeight },
        margin: 8,
      })

      if (isMountedRef.current) {
        setSafePos(s)
        setDropDir(d)
      }
      rafIdRef.current = null
    })

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [showContext, pos, contextRef])

  if (!currentDrive || !fm || !beeApi) {
    return <div className="fm-file-item-content">Error</div>
  }

  return (
    <div className="fm-file-item-content" onContextMenu={handleContextMenu} onClick={handleCloseContext}>
      <div className="fm-file-item-content-item fm-checkbox">
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onToggleSelected?.(fileInfo, e.target.checked)}
          onClick={e => e.stopPropagation()}
        />
      </div>

      <div className="fm-file-item-content-item fm-name" onDoubleClick={() => handleDownload(true)}>
        <GetIconElement icon={fileInfo.name} />
        {fileInfo.name}
      </div>

      {showDriveColumn && (
        <div className="fm-file-item-content-item fm-drive">
          <span className="fm-drive-name">{driveName}</span>
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
          <ContextMenu>{renderContextMenuItems()}</ContextMenu>
        </div>
      )}

      {showGetInfoModal && infoGroups && (
        <GetInfoModal
          name={fileInfo.name}
          properties={infoGroups}
          onCancelClick={() => {
            if (isMountedRef.current) setShowGetInfoModal(false)
          }}
        />
      )}

      {showVersionHistory && (
        <VersionHistoryModal
          fileInfo={fileInfo}
          onCancelClick={() => {
            if (isMountedRef.current) setShowVersionHistory(false)
          }}
          onDownload={onDownload}
        />
      )}

      {showDeleteModal && (
        <DeleteFileModal
          name={fileInfo.name}
          currentDriveName={currentDrive.name}
          onCancelClick={() => {
            if (isMountedRef.current) setShowDeleteModal(false)
          }}
          onProceed={action => {
            if (isMountedRef.current) setShowDeleteModal(false)
            switch (action) {
              case FileAction.Trash:
                doTrash()
                break
              case FileAction.Forget:
                setConfirmForget(true)
                break
              case FileAction.Destroy:
                showDestroyDrive()
                break
              default:
                break
            }
          }}
        />
      )}

      {showRenameModal && (
        <RenameFileModal
          currentName={fileInfo.name}
          takenNames={(() => {
            const sameDrive = files.filter(fi => fi.driveId.toString() === currentDrive.id.toString())
            const names = sameDrive.map(fi => fi.name).filter(n => n && n !== fileInfo.name)

            return new Set(names)
          })()}
          onCancelClick={() => {
            if (isMountedRef.current) setShowRenameModal(false)
          }}
          onProceed={async newName => {
            try {
              if (isMountedRef.current) setShowRenameModal(false)
              await doRename(newName)
            } catch {
              if (isMountedRef.current) setShowRenameModal(true)
            }
          }}
        />
      )}

      {confirmForget && (
        <ConfirmModal
          title="Forget permanently?"
          message={
            <>
              This removes <b title={fileInfo.name}>{fileInfo.name}</b> from your view.
              <br />
              The data remains on Swarm until the drive expires.
            </>
          }
          confirmLabel="Forget"
          cancelLabel="Cancel"
          onConfirm={async () => {
            await doForget()

            if (isMountedRef.current) setConfirmForget(false)
          }}
          onCancel={() => {
            if (isMountedRef.current) setConfirmForget(false)
          }}
        />
      )}

      {showDestroyDriveModal && destroyDrive && (
        <DestroyDriveModal
          drive={destroyDrive}
          onCancelClick={() => {
            if (isMountedRef.current) {
              setShowDestroyDriveModal(false)
              setDestroyDrive(null)
            }
          }}
          doDestroy={async () => {
            await handleDestroyDrive(
              beeApi,
              fm,
              destroyDrive,
              () => {
                refreshFiles?.()

                if (isMountedRef.current) {
                  setShowDestroyDriveModal(false)
                  setDestroyDrive(null)
                }
              },
              error => {
                // eslint-disable-next-line no-console
                console.error('Error destroying drive:', error)
              },
            )
          }}
        />
      )}
    </div>
  )
}

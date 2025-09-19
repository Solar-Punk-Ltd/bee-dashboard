import { ReactElement, useContext, useLayoutEffect, useMemo, useState, useRef, useEffect, useCallback } from 'react'
import './FileItem.scss'
import { GetIconElement } from '../../../utils/GetIconElement'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { Context as SettingsContext } from '../../../../../providers/Settings'
import { ViewType } from '../../../constants/constants'
import { GetInfoModal } from '../../GetInfoModal/GetInfoModal'
import { VersionHistoryModal } from '../../VersionHistoryModal/VersionHistoryModal'
import { DeleteFileModal } from '../../DeleteFileModal/DeleteFileModal'
import { RenameFileModal } from '../../RenameFileModal/RenameFileModal'
import { buildGetInfoGroups } from '../../GetInfoModal/buildFileInfoGroups'
import type { FilePropertyGroup } from '../../GetInfoModal/buildFileInfoGroups'
import { useView } from '../../../providers/FMFileViewContext'
import type { DriveInfo, FileInfo } from '@solarpunkltd/file-manager-lib'
import { useFM } from '../../../providers/FMContext'
import { DestroyDriveModal } from '../../DestroyDriveModal/DestroyDriveModal'

import { Dir, formatBytes, isTrashed } from '../../../utils/common'
import { FileAction } from '../../../constants/constants'
import { startDownloadingQueue } from '../../../utils/download'
import { computeContextMenuPosition } from '../../../utils/ui'

interface FileItemProps {
  fileInfo: FileInfo
  onDownload: (name: string, size?: string, expectedSize?: number) => (progress: number, isDownloading: boolean) => void
  showDriveColumn?: boolean
  driveName: string
}

// TODO: use contextinterface from provider
export function FileItem({ fileInfo, onDownload, showDriveColumn, driveName }: FileItemProps): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { fm, refreshFiles, currentDrive, files } = useFM()
  const { beeApi } = useContext(SettingsContext)
  const { view } = useView()

  // Track if component is mounted to prevent state updates on unmounted component
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const size = formatBytes(fileInfo.customMetadata?.size)
  const dateMod = new Date(fileInfo.timestamp || 0).toLocaleDateString() // todo: make sure that timestamp is correct
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

  const openGetInfo = useCallback(async () => {
    if (!fm) return

    const groups = await buildGetInfoGroups(fm, fileInfo, driveName)
    setInfoGroups(groups)
    setShowGetInfoModal(true)
  }, [fm, fileInfo, driveName])

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

  // TODO: handleOpen, is it different from download?
  // TODO: multiple downloads []: File[]
  const handleDownload = useCallback(async () => {
    handleCloseContext()

    if (!fm || !beeApi) return

    const size = fileInfo.customMetadata?.size
    const expectedSize = size ? Number(size) : undefined

    await startDownloadingQueue(fm, [fileInfo], onDownload(fileInfo.name, formatBytes(size), expectedSize))
  }, [handleCloseContext, fm, beeApi, fileInfo, onDownload])

  const doTrash = useCallback(async () => {
    if (!fm) return
    await fm.trashFile(fileInfo)
    await Promise.resolve(refreshFiles?.())
  }, [fm, fileInfo, refreshFiles])

  const doRecover = useCallback(async () => {
    if (!fm) return
    await fm.recoverFile(fileInfo)
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

  // TODO: rename shall call the same upload with progress: but different name with info.file.ref and .history already filled with the previous values
  const doRename = useCallback(
    async (newName: string) => {
      if (!fm || !beeApi || !currentDrive) return

      if (takenNames.has(newName)) throw new Error('name-taken')

      await fm.upload(currentDrive, {
        info: {
          ...fileInfo,
          name: newName,
        },
      })
      await Promise.resolve(refreshFiles?.())
    },
    [fm, beeApi, currentDrive, takenNames, fileInfo, refreshFiles],
  )

  const renderContextMenuItems = useCallback(() => {
    const commonItems = (
      <>
        <div className="fm-context-item" onClick={handleDownload}>
          View / Open
        </div>
        <div className="fm-context-item" onClick={handleDownload}>
          Download
        </div>
      </>
    )

    const getInfoItem = (
      <div
        className="fm-context-item"
        onClick={() => {
          handleCloseContext()
          openGetInfo()
        }}
      >
        Get info
      </div>
    )

    if (view === ViewType.File) {
      return (
        <>
          {commonItems}
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
          {getInfoItem}
        </>
      )
    }

    // Trash view
    return (
      <>
        {commonItems}
        <div className="fm-context-item-border" />
        <div
          className="fm-context-item"
          onClick={() => {
            handleCloseContext()
            doRecover()
          }}
        >
          Restore
        </div>
        <div
          className="fm-context-item red"
          onClick={() => {
            handleCloseContext()
            setDestroyDrive(currentDrive || null)
            setShowDestroyDriveModal(true)
          }}
        >
          Destroy
        </div>
        <div
          className="fm-context-item red"
          onClick={() => {
            handleCloseContext()
            doForget()
          }}
        >
          Forget permanently
        </div>
        <div className="fm-context-item-border" />
        {getInfoItem}
      </>
    )
  }, [view, handleDownload, handleCloseContext, openGetInfo, doRecover, doForget, currentDrive])

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

  if (!currentDrive || !fm || !beeApi) {
    return <div className="fm-file-item-content">Error</div>
  }

  return (
    <div className="fm-file-item-content" onContextMenu={handleContextMenu} onClick={handleCloseContext}>
      <div className="fm-file-item-content-item fm-checkbox">
        <input type="checkbox" />
      </div>

      <div className="fm-file-item-content-item fm-name">
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
            if (isMountedRef.current) {
              setShowGetInfoModal(false)
            }
          }}
        />
      )}

      {showVersionHistory && (
        <VersionHistoryModal
          fileInfo={fileInfo}
          onCancelClick={() => {
            if (isMountedRef.current) {
              setShowVersionHistory(false)
            }
          }}
        />
      )}

      {showDeleteModal && (
        <DeleteFileModal
          name={fileInfo.name}
          currentDriveName={currentDrive.name}
          onCancelClick={() => {
            if (isMountedRef.current) {
              setShowDeleteModal(false)
            }
          }}
          onProceed={action => {
            if (isMountedRef.current) {
              setShowDeleteModal(false)
            }

            switch (action) {
              case FileAction.Trash:
                doTrash()
                break
              case FileAction.Forget:
                doForget()
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
            if (isMountedRef.current) {
              setShowRenameModal(false)
            }
          }}
          onProceed={async newName => {
            try {
              await doRename(newName)

              if (isMountedRef.current) {
                setShowRenameModal(false)
              }
            } catch {
              /* keep modal open on error */
            }
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
            await fm.destroyDrive(destroyDrive)
            await Promise.resolve(refreshFiles?.())

            if (isMountedRef.current) {
              setShowDestroyDriveModal(false)
              setDestroyDrive(null)
            }
          }}
        />
      )}
    </div>
  )
}

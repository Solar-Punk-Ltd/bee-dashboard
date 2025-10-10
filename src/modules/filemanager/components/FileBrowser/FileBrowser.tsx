import { ReactElement, useEffect, useLayoutEffect, useRef, useState, useContext } from 'react'
import './FileBrowser.scss'
import { FileBrowserHeader } from './FileBrowserHeader/FileBrowserHeader'
import { FileBrowserContent } from './FileBrowserContent/FileBrowserContent'
import { ContextMenu } from '../ContextMenu/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { NotificationBar } from '../NotificationBar/NotificationBar'
import { FileAction, FileTransferType, TransferStatus, ViewType } from '../../constants/fileTransfer'
import { FileProgressNotification } from '../FileProgressNotification/FileProgressNotification'
import { useView } from '../../../../pages/filemanager/ViewContext'
import { Context as FMContext } from '../../../../providers/FileManager'
import { useTransfers } from '../../hooks/useTransfers'
import { useSearch } from '../../../../pages/filemanager/SearchContext'
import { useFileFiltering } from '../../hooks/useFileFiltering'
import { useDragAndDrop } from '../../hooks/useDragAndDrop'
import { useBulkActions } from '../../hooks/useBulkActions'
import { DeleteFileModal } from '../DeleteFileModal/DeleteFileModal'
import { DestroyDriveModal } from '../DestroyDriveModal/DestroyDriveModal'
import { ConfirmModal } from '../ConfirmModal/ConfirmModal'
import { ConfirmZipModal } from './ConfirmZipModal/ConfirmZipModal'
import { ViewerModal } from '../ViewerModal/ViewerModal'

import { Point, Dir } from '../../utils/common'
import { computeContextMenuPosition } from '../../utils/ui'
import { FileBrowserTopBar } from './FileBrowserTopBar/FileBrowserTopBar'
import { handleDestroyDrive } from '../../utils/bee'
import { Context as SettingsContext } from '../../../../providers/Settings'

export function FileBrowser(): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view, setActualItemView } = useView()
  const { beeApi } = useContext(SettingsContext)
  const { files, currentDrive, refreshFiles, resyncFM, drives, fm } = useContext(FMContext)
  const {
    uploadFiles,
    isUploading,
    uploadItems,
    isDownloading,
    downloadItems,
    trackDownload,
    conflictPortal,
    cancelOrDismissUpload,
    dismissDownload,
    dismissAllUploads,
    dismissAllDownloads,
  } = useTransfers()

  const { query, scope, includeActive, includeTrashed } = useSearch()

  const [safePos, setSafePos] = useState<Point>(pos as Point)
  const [dropDir, setDropDir] = useState<Dir>(Dir.Down)

  const legacyUploadRef = useRef<HTMLInputElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const isMountedRef = useRef(true)
  const rafIdRef = useRef<number | null>(null)

  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [showDestroyDriveModal, setShowDestroyDriveModal] = useState(false)
  const [confirmBulkForget, setConfirmBulkForget] = useState(false)
  const [showZipChoice, setShowZipChoice] = useState(false)
  const [pendingBulkFiles, setPendingBulkFiles] = useState<typeof bulk.selectedFiles>([])
  const [pendingCancelName, setPendingCancelName] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerPayload, setViewerPayload] = useState<{ name: string; mime: string; url: string } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const q = query.trim().toLowerCase()
  const isSearchMode = q.length > 0

  const { listToRender } = useFileFiltering({
    files,
    currentDrive: currentDrive || null,
    view,
    isSearchMode,
    query: q,
    scope,
    includeActive,
    includeTrashed,
  })

  const bulk = useBulkActions({
    listToRender,
    trackDownload,
  })

  const { isDragging, handleDragEnter, handleDragOver, handleDragLeave, handleDrop, handleOverlayDrop } =
    useDragAndDrop({
      onFilesDropped: uploadFiles,
      currentDrive: currentDrive || null,
    })

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files

    if (f && f.length) uploadFiles(f)
    e.target.value = ''
  }

  const onContextUploadFile = () => {
    const el = bulk.fileInputRef.current || legacyUploadRef.current
    el?.click()
  }

  const handleFileBrowserContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.fm-file-item-content')) return
    handleContextMenu(e)
  }

  useLayoutEffect(() => {
    if (!showContext) return

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      if (!isMountedRef.current) return

      const menu = contextRef.current
      const container = document.querySelector('.fm-file-browser-container') as HTMLElement | null

      if (!menu) return

      const rect = menu.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const containerRect = container?.getBoundingClientRect() ?? null

      const { safePos: sp, dropDir: dd } = computeContextMenuPosition({
        clickPos: pos as Point,
        menuRect: rect,
        viewport: { w: vw, h: vh },
        margin: 8,
        containerRect,
      })

      if (isMountedRef.current) {
        setSafePos(sp)
        setDropDir(dd)
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

  useEffect(() => {
    const title = isSearchMode
      ? `Search results${scope === 'selected' && currentDrive?.name ? ` — ${currentDrive.name}` : ''}`
      : currentDrive?.name || ''
    setActualItemView?.(title)
  }, [isSearchMode, scope, currentDrive, setActualItemView])

  useEffect(() => {
    if (!isSearchMode) {
      bulk.clearAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchMode])

  useEffect(() => {
    return () => {
      isMountedRef.current = false

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { name: string; mime: string; url: string }

      if (!detail) return
      setViewerPayload(detail)
      setViewerOpen(true)
    }

    window.addEventListener('fm:open-preview', onOpen as EventListener)

    return () => window.removeEventListener('fm:open-preview', onOpen as EventListener)
  }, [])

  const renderContextMenu = (): ReactElement | null => {
    if (drives.length === 0) {
      return (
        <ContextMenu>
          <div className="fm-context-item" onClick={doRefresh}>
            Refresh
          </div>
        </ContextMenu>
      )
    }

    if (bulk.selectedFiles.length > 1) {
      return (
        <ContextMenu>
          <div
            className="fm-context-item"
            onClick={() => {
              // mirror the row action: if multi-select, show choice
              setPendingBulkFiles(bulk.selectedFiles)
              setShowZipChoice(true)
            }}
          >
            Download
          </div>
          {view === ViewType.File ? (
            <div className="fm-context-item red" onClick={() => setShowBulkDeleteModal(true)}>
              Delete…
            </div>
          ) : (
            <>
              <div className="fm-context-item" onClick={() => bulk.bulkRestore(bulk.selectedFiles)}>
                Restore
              </div>
              <div className="fm-context-item red" onClick={() => setShowDestroyDriveModal(true)}>
                Destroy
              </div>
              <div className="fm-context-item red" onClick={() => bulk.bulkForget(bulk.selectedFiles)}>
                Forget permanently
              </div>
            </>
          )}
        </ContextMenu>
      )
    }

    if (view === ViewType.Trash) return <div className="fm-context-item"></div>

    return (
      <ContextMenu>
        <div className="fm-context-item">New folder</div>
        <div className="fm-context-item" onClick={onContextUploadFile}>
          Upload file
        </div>
        <div className="fm-context-item">Upload folder</div>
        <div className="fm-context-item-border" />
        <div className="fm-context-item">Paste</div>
        <div className="fm-context-item-border" />
        <div className="fm-context-item" onClick={doRefresh}>
          Refresh
        </div>
      </ContextMenu>
    )
  }

  const renderModals = (): ReactElement | null => (
    <>
      {showZipChoice && pendingBulkFiles.length > 0 && (
        <ConfirmZipModal
          fileCount={pendingBulkFiles.length}
          onZipAll={async () => {
            setShowZipChoice(false)
            await bulk.bulkDownloadAsZip(pendingBulkFiles)
          }}
          onIndividual={async () => {
            setShowZipChoice(false)
            await bulk.bulkDownload(pendingBulkFiles)
          }}
          onCancel={() => {
            setShowZipChoice(false)
            setPendingBulkFiles([])
          }}
        />
      )}

      {showBulkDeleteModal && bulk.selectedFiles.length > 0 && view === ViewType.File && (
        <DeleteFileModal
          names={bulk.selectedFiles.map(f => f.name)}
          currentDriveName={currentDrive?.name}
          onCancelClick={() => setShowBulkDeleteModal(false)}
          onProceed={async action => {
            setShowBulkDeleteModal(false)

            if (action === FileAction.Trash) {
              await bulk.bulkTrash(bulk.selectedFiles)
            } else if (action === FileAction.Forget) {
              setConfirmBulkForget(true)
            } else if (action === FileAction.Destroy) {
              setShowDestroyDriveModal(true)
            }
          }}
        />
      )}

      {confirmBulkForget && (
        <ConfirmModal
          title="Forget permanently?"
          message={
            <>
              This removes <b>{bulk.selectedFiles.length}</b> file
              {bulk.selectedFiles.length > 1 ? 's' : ''} from your view.
              <br />
              The data remains on Swarm until the drive expires.
            </>
          }
          confirmLabel="Forget"
          cancelLabel="Cancel"
          onConfirm={async () => {
            await bulk.bulkForget(bulk.selectedFiles)
            setConfirmBulkForget(false)
          }}
          onCancel={() => setConfirmBulkForget(false)}
        />
      )}

      {showDestroyDriveModal && currentDrive && (
        <DestroyDriveModal
          drive={currentDrive}
          onCancelClick={() => setShowDestroyDriveModal(false)}
          doDestroy={async () => {
            if (!currentDrive) return
            await handleDestroyDrive(
              beeApi,
              fm,
              currentDrive,
              () => {
                refreshFiles?.()
                setShowDestroyDriveModal(false)
              },
              error => {
                // eslint-disable-next-line no-console
                console.error('Error destroying drive:', error)
              },
            )
          }}
        />
      )}

      {pendingCancelName && (
        <ConfirmModal
          title="Cancel upload?"
          message={
            <>
              Stopping now will cancel the network request. Data already transmitted cannot be reverted.{' '}
              <b>We will try our best to clean up the transmitted data.</b>
              <br />
              To remove any (remaining) cancelled items from your browser view later, use{' '}
              <i>Right-click → Delete → Forget</i>.
            </>
          }
          confirmLabel="Cancel upload"
          cancelLabel="Keep uploading"
          onConfirm={() => {
            cancelOrDismissUpload(pendingCancelName)
            setPendingCancelName(null)
          }}
          onCancel={() => setPendingCancelName(null)}
        />
      )}
    </>
  )

  const doRefresh = async () => {
    handleCloseContext()

    if (isRefreshing || !resyncFM) return

    setIsRefreshing(true)

    try {
      await resyncFM()
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false)
      }
    }
  }

  return (
    <>
      {conflictPortal}
      <input type="file" ref={legacyUploadRef} style={{ display: 'none' }} onChange={onFileSelected} multiple />
      <input type="file" ref={bulk.fileInputRef} style={{ display: 'none' }} onChange={onFileSelected} multiple />

      <div className="fm-file-browser-container" data-search-mode={isSearchMode ? 'true' : 'false'}>
        <FileBrowserTopBar />
        <div
          className="fm-file-browser-content"
          data-search-mode={isSearchMode ? 'true' : 'false'}
          ref={contentRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <FileBrowserHeader key={isSearchMode ? 'hdr-search' : 'hdr-normal'} isSearchMode={isSearchMode} bulk={bulk} />
          <div
            className="fm-file-browser-content-body"
            onContextMenu={handleFileBrowserContextMenu}
            onClick={handleCloseContext}
          >
            <FileBrowserContent
              key={isSearchMode ? `content-search` : `content-${currentDrive?.id.toString() ?? 'none'}`}
              listToRender={listToRender}
              drives={drives}
              currentDrive={currentDrive || null}
              view={view}
              isSearchMode={isSearchMode}
              trackDownload={trackDownload}
              selectedIds={bulk.selectedIds}
              onToggleSelected={bulk.toggleOne}
              bulkSelectedCount={bulk.selectedCount}
              onBulk={{
                download: () => {
                  if (bulk.selectedFiles.length <= 1) {
                    bulk.bulkDownload(bulk.selectedFiles)

                    return
                  }
                  setPendingBulkFiles(bulk.selectedFiles)
                  setShowZipChoice(true)
                },
                restore: () => bulk.bulkRestore(bulk.selectedFiles),
                forget: () => bulk.bulkForget(bulk.selectedFiles),
                destroy: () => setShowDestroyDriveModal(true),
                delete: () => setShowBulkDeleteModal(true),
              }}
            />

            {showContext && (
              <div
                ref={contextRef}
                className="fm-file-browser-context-menu"
                style={{ top: safePos.y, left: safePos.x }}
                data-drop={dropDir}
              >
                {renderContextMenu()}
              </div>
            )}
          </div>

          {isDragging && currentDrive && (
            <div
              className="fm-drag-overlay"
              onDragOver={e => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={handleOverlayDrop}
            >
              <div className="fm-drag-text">Drop file(s) to upload</div>
            </div>
          )}

          {renderModals()}
        </div>

        <div className="fm-file-browser-footer">
          <FileProgressNotification
            label="Uploading files"
            type={FileTransferType.Upload}
            open={isUploading}
            count={uploadItems.length}
            items={uploadItems}
            onRowClose={name => {
              const row = uploadItems.find(i => i.name === name)

              if (row?.status === TransferStatus.Uploading) {
                setPendingCancelName(name)
              } else {
                cancelOrDismissUpload(name)
              }
            }}
            onCloseAll={() => dismissAllUploads()}
          />
          <FileProgressNotification
            label="Downloading files"
            type={FileTransferType.Download}
            open={isDownloading}
            count={downloadItems.length}
            items={downloadItems}
            onRowClose={name => dismissDownload(name)}
            onCloseAll={() => dismissAllDownloads()}
          />
          <NotificationBar />
          <ViewerModal
            open={viewerOpen}
            payload={viewerPayload}
            onClose={() => {
              setViewerOpen(false)
              setViewerPayload(null)
            }}
          />
        </div>
      </div>
    </>
  )
}

import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import React, {
  ReactElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { useSearch } from '../../../../pages/filemanager/SearchContext'
import { ItemType, useView } from '../../../../pages/filemanager/ViewContext'
import { Context as FMContext } from '../../../../providers/FileManager'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { FileAction, FileTransferType, TransferStatus, ViewType } from '../../constants/transfers'
import { BulkActionsResult, useBulkActions } from '../../hooks/useBulkActions'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useDragAndDrop } from '../../hooks/useDragAndDrop'
import { useFileFiltering } from '../../hooks/useFileFiltering'
import { SortDir, SortKey, useSorting } from '../../hooks/useSorting'
import { useTransfers } from '../../hooks/useTransfers'
import { handleDestroyAndForgetDrive } from '../../utils/bee'
import { Dir, getFileId, Point, safeSetState } from '../../utils/common'
import { isDirectoryPickerSupported } from '../../utils/fileOperations'
import { computeContextMenuPosition } from '../../utils/ui'
import { ProgressDestroyModal } from '../DestroyDriveModal/DestroyDriveModal'
import { ErrorModal } from '../ErrorModal/ErrorModal'
import { FileProgressNotification } from '../FileProgressNotification/FileProgressNotification'
import { NewFolderModal } from '../NewFolderModal/NewFolderModal'
import { NotificationBar } from '../NotificationBar/NotificationBar'

import { FileBrowserContent } from './FileBrowserContent/FileBrowserContent'
import { FileBrowserHeader } from './FileBrowserHeader/FileBrowserHeader'
import { FileBrowserContextMenu } from './FileBrowserMenu/FileBrowserContextMenu'
import { FileBrowserTopBar } from './FileBrowserTopBar/FileBrowserTopBar'
import { FileBrowserModals } from './FileBrowserModals'

import './FileBrowser.scss'

function DestroyProgressModal({
  isDestroying,
  isProgressModalOpen,
  currentDrive,
  onMinimize,
}: {
  isDestroying: boolean
  isProgressModalOpen: boolean
  currentDrive?: DriveInfo
  onMinimize: () => void
}) {
  if (isProgressModalOpen && isDestroying && currentDrive) {
    return <ProgressDestroyModal drive={currentDrive} onMinimize={onMinimize} />
  }

  return null
}

function DestroyingOverlay({ isDestroying, onClick }: { isDestroying: boolean; onClick: () => void }) {
  if (!isDestroying) return null

  return (
    <div className="fm-refresh-overlay" aria-busy="true" aria-live="polite">
      <div
        className="fm-refresh-content"
        onClick={onClick}
        style={{ cursor: 'pointer' }}
        title="Click to show progress modal"
      >
        <div className="fm-mini-spinner" role="status" aria-label="Destroying drive…" />
        <span className="fm-refresh-text">Destroying drive…</span>
      </div>
    </div>
  )
}

function ErrorModalBlock({
  showError,
  label,
  onOk,
}: {
  showError: boolean
  label: string
  onOk: () => void
}): ReactElement | null {
  if (!showError) {
    return null
  }

  const modalRoot = document.querySelector('.fm-main') || document.body

  return createPortal(<ErrorModal label={label} onClick={onOk} />, modalRoot)
}

const extractFilesFromClipboardEvent = (e: React.ClipboardEvent): File[] => {
  const out: File[] = []
  const items = e.clipboardData?.items ?? []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]

    if (it.kind === 'file') {
      const f = it.getAsFile()

      if (f) out.push(f)
    }
  }

  return out
}

interface FileBrowserProps {
  errorMessage?: string
  setErrorMessage?: (error: string) => void
}

type FileBrowserContextMenuBlockProps = {
  showContext: boolean
  contextRef: React.RefObject<HTMLDivElement | null>
  safePos: { x: number; y: number }
  dropDir: Dir
  drives: DriveInfo[]
  view: ViewType
  bulk: BulkActionsResult
  adminStamp: PostageBatch | undefined
  doRefresh: () => void
  onContextUploadFile: () => void
  onContextUploadFolder: () => void
  onContextCreateFolder: () => void
  setConfirmBulkRestore: (b: boolean) => void
  setShowBulkDeleteModal: (b: boolean) => void
  setShowDestroyDriveModal: (b: boolean) => void
}

function FileBrowserContextMenuBlock({
  showContext,
  contextRef,
  safePos,
  dropDir,
  drives,
  view,
  bulk,
  adminStamp,
  doRefresh,
  onContextUploadFile,
  onContextUploadFolder,
  onContextCreateFolder,
  setConfirmBulkRestore,
  setShowBulkDeleteModal,
  setShowDestroyDriveModal,
}: FileBrowserContextMenuBlockProps): ReactElement | null {
  if (!showContext) {
    return null
  }

  return (
    <div
      ref={contextRef}
      className="fm-file-browser-context-menu fm-context-menu"
      style={{ top: safePos.y, left: safePos.x }}
      data-drop={dropDir}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <FileBrowserContextMenu
        drives={drives}
        view={view}
        selectedFilesCount={bulk.selectedFiles.length}
        onRefresh={doRefresh}
        enableRefresh={Boolean(adminStamp)}
        onUploadFile={onContextUploadFile}
        onBulkDownload={() => bulk.download(bulk.selectedFiles)}
        onBulkRestore={() => setConfirmBulkRestore(true)}
        onBulkDelete={() => setShowBulkDeleteModal(true)}
        onUploadFolder={() => onContextUploadFolder()}
        onCreateFolder={() => onContextCreateFolder()}
        onBulkDestroy={() => setShowDestroyDriveModal(true)}
        onBulkForget={() => bulk.forget(bulk.selectedFiles)}
      />
    </div>
  )
}

export function FileBrowser({ errorMessage, setErrorMessage }: FileBrowserProps): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view, setActualItemView, viewFolders } = useView()
  const { beeApi } = useContext(SettingsContext)
  const { files, folders, adminDrive, currentDrive, resync, reloadCurrentDrive, drives, fm, showError, setShowError } =
    useContext(FMContext)
  const {
    uploadFiles,
    isUploading,
    uploadItems,
    isDownloading,
    downloadItems,
    trackDownload,
    conflictPortal,
    cancelOrDismissUpload,
    cancelOrDismissDownload,
    dismissAllUploads,
    dismissAllDownloads,
  } = useTransfers({ setErrorMessage })

  const { query, scope, includeActive, includeTrashed } = useSearch()

  const [safePos, setSafePos] = useState<Point>(pos)
  const [dropDir, setDropDir] = useState<Dir>(Dir.Down)

  const contentRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const isMountedRef = useRef(true)
  const rafIdRef = useRef<number | null>(null)

  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [showDestroyDriveModal, setShowDestroyDriveModal] = useState(false)
  const [isDestroying, setIsDestroying] = useState(false)
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false)
  const [confirmBulkForget, setConfirmBulkForget] = useState(false)
  const [confirmBulkRestore, setConfirmBulkRestore] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [pendingCancelUpload, setPendingCancelUpload] = useState<string | null>(null)
  const [pendingCancelDownload, setPendingCancelDownload] = useState<string | null>(null)

  // Current folder path within the drive manifest (empty string = drive root).
  const currentPath = viewFolders.map(f => f.folderName).join('/')

  const q = query.trim().toLowerCase()
  const isSearchMode = q.length > 0

  const getDriveName = useCallback(
    (driveId: string): string => {
      const match = drives.find(d => d.id.toString() === driveId)

      return match?.name ?? ''
    },
    [drives],
  )

  const openTopbarMenu = (anchorEl: HTMLElement) => {
    const r = anchorEl.getBoundingClientRect()
    const bodyRect = bodyRef.current?.getBoundingClientRect()
    const clickX = Math.round(r.right - 6)
    const minY = (bodyRect?.top ?? 0) + 8
    const clickY = Math.max(Math.round(r.bottom + 6), minY)
    const fakeEvt = {
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: clickX,
      clientY: clickY,
    } as React.MouseEvent<HTMLDivElement>
    handleContextMenu(fakeEvt)
  }

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

  const { sorted, sort, toggle, reset } = useSorting(listToRender, {
    persist: false,
    defaultState: { key: SortKey.Timestamp, dir: SortDir.Desc },
    getDriveName,
  })

  const sortedKey = sorted.map(f => getFileId(f)).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableSorted = useMemo(() => sorted, [sortedKey, files])

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
    const files = e.target.files

    if (files && files.length > 0) {
      uploadFiles(files)
    }
    e.target.value = ''
  }

  const onContextUploadFile = () => {
    bulk.uploadFromPicker()
    requestAnimationFrame(() => handleCloseContext())
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = extractFilesFromClipboardEvent(e)

    if (files.length === 0) return

    e.preventDefault()
    uploadFiles(files)
  }

  const handleFileBrowserContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement

    if (t.closest('.fm-file-item-context-menu, .fm-file-browser-context-menu')) return

    if (!e.shiftKey && t.closest('.fm-file-item-content')) return

    e.preventDefault()
    e.stopPropagation()
    handleContextMenu(e)
  }

  const handleDeleteModalProceed = async (action: FileAction) => {
    setShowBulkDeleteModal(false)

    if (action === FileAction.Trash) {
      return await bulk.trash(bulk.selectedFiles)
    }

    if (action === FileAction.Forget) {
      return setConfirmBulkForget(true)
    }

    if (action === FileAction.Destroy) {
      return setShowDestroyDriveModal(true)
    }
  }

  const handleDestroyDriveConfirm = useCallback(async () => {
    if (!currentDrive) return

    setShowDestroyDriveModal(false)
    setIsProgressModalOpen(true)
    setIsDestroying(true)

    await handleDestroyAndForgetDrive({
      beeApi,
      fm,
      drive: currentDrive,
      isDestroy: true,
      adminDrive,
      onSuccess: () => {
        setIsDestroying(false)
        setIsProgressModalOpen(false)
        setShowDestroyDriveModal(false)
      },
      onError: e => {
        setIsDestroying(false)
        setIsProgressModalOpen(false)
        setShowDestroyDriveModal(false)
        setErrorMessage?.(`Error destroying drive: ${currentDrive.name}: ${e}`)
        setShowError(true)
      },
    })
  }, [
    beeApi,
    fm,
    currentDrive,
    adminDrive,
    setErrorMessage,
    setIsProgressModalOpen,
    setShowDestroyDriveModal,
    setShowError,
  ])

  const handleDownloadClose = (uuid: string) => {
    const row = downloadItems.find(i => i.uuid === uuid)

    if (row?.status === TransferStatus.Downloading) {
      setPendingCancelDownload(uuid)
    } else {
      cancelOrDismissDownload(uuid)
    }
  }

  const handleUploadClose = (uuid: string) => {
    const row = uploadItems.find(i => i.uuid === uuid)

    if (row?.status === TransferStatus.Uploading) {
      setPendingCancelUpload(uuid)
    } else {
      cancelOrDismissUpload(uuid)
    }
  }

  const updateContextMenuPosition = () => {
    const menu = contextRef.current
    const body = bodyRef.current

    if (!menu) return

    const rect = menu.getBoundingClientRect()
    const containerRect = body?.getBoundingClientRect() ?? null

    const { safePos: sp, dropDir: dd } = computeContextMenuPosition({
      clickPos: pos,
      menuRect: rect,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      margin: 8,
      containerRect,
    })

    const topLeft = containerRect
      ? { x: Math.round(sp.x - containerRect.left), y: Math.round(sp.y - containerRect.top + 2) }
      : sp

    setSafePos(topLeft)
    setDropDir(dd)
    rafIdRef.current = null
  }

  useLayoutEffect(() => {
    if (!showContext) return

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(updateContextMenuPosition)

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showContext, pos, contextRef])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }

      setShowError(false)
    }
  }, [setShowError])

  useEffect(() => {
    let title = currentDrive?.name || ''

    if (isSearchMode) {
      title = 'Search results'

      if (scope === 'selected' && currentDrive?.name) {
        title += ` — ${currentDrive.name}`
      }
    }

    setActualItemView?.(title)
  }, [isSearchMode, scope, currentDrive, setActualItemView])

  useEffect(() => {
    if (!isSearchMode) {
      bulk.clearAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchMode])

  const doRefresh = async () => {
    handleCloseContext()

    if (isRefreshing) return

    setIsRefreshing(true)

    try {
      await resync()
    } finally {
      safeSetState(isMountedRef, setIsRefreshing)(false)
    }
  }

  const showDeleteModal = showBulkDeleteModal && bulk.selectedFiles.length > 0 && view === ViewType.File
  const showDragOverlay = isDragging && Boolean(currentDrive)
  const fileCountText = bulk.selectedFiles.length === 1 ? 'file' : 'files'

  const onBulk = useMemo(
    () => ({
      download: () => bulk.download(bulk.selectedFiles),
      restore: () => setConfirmBulkRestore(true),
      forget: () => bulk.forget(bulk.selectedFiles),
      destroy: () => setShowDestroyDriveModal(true),
      delete: () => setShowBulkDeleteModal(true),
    }),
    [bulk],
  )

  const createFolder = useCallback(() => {
    if (!currentDrive || !fm) {
      return
    }

    handleCloseContext()
    setShowNewFolderModal(true)
  }, [currentDrive, handleCloseContext, fm])

  // Names already used in the current folder (basenames of direct children) — prevents duplicates.
  const currentFolderNames = useMemo(() => {
    const prefix = currentPath ? `${currentPath}/` : ''

    return new Set(
      files
        .filter(f => f.driveId.toString() === currentDrive?.id.toString())
        .filter(f => f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes('/'))
        .map(f => f.path.slice(prefix.length)),
    )
  }, [files, currentDrive, currentPath])

  const doCreateFolder = useCallback(
    async (name: string) => {
      if (!currentDrive || !fm) {
        return
      }

      try {
        await fm.createFolder(currentDrive.id, currentPath || '/', name)
        setShowNewFolderModal(false)
        await reloadCurrentDrive()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        setShowError(true)
        setErrorMessage?.(errorMessage)
      }
    },
    [currentDrive, fm, currentPath, reloadCurrentDrive, setErrorMessage, setShowError],
  )

  const selectFolder = useCallback(async () => {
    if (!currentDrive) {
      return
    }

    if (!isDirectoryPickerSupported()) {
      return
    }

    handleCloseContext()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = await (window as any).showDirectoryPicker()
      const dataTransfer = new DataTransfer()
      const metadataMap = new Map()

      const queue: Array<{ handle: FileSystemHandle; path: string }> = []

      for await (const [, handle] of dirHandle.entries()) {
        queue.push({ handle, path: `${dirHandle.name}/` })
      }

      while (queue.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const { handle, path } = queue.shift()!

        if (handle.kind === 'file') {
          const file = await (handle as FileSystemFileHandle).getFile()

          const createdFile = new File([file], `${path}${file.name}`, { type: file.type })
          dataTransfer.items.add(createdFile)
          metadataMap.set(createdFile, { name: file.name, itemType: ItemType.File, path: `${path}${file.name}` })

          // eslint-disable-next-line no-continue
          continue
        }

        if (handle.kind === 'directory') {
          const dirHandle = handle as FileSystemDirectoryHandle

          const folderFileItem = new File([], `${path}${dirHandle.name}/`, { type: ItemType.Folder })
          metadataMap.set(folderFileItem, {
            name: dirHandle.name,
            itemType: ItemType.Folder,
            path: `${path}${folderFileItem.name}`,
          })
          dataTransfer.items.add(folderFileItem)

          for await (const [, childHandle] of dirHandle.entries()) {
            queue.push({ handle: childHandle, path: `${path}${dirHandle.name}/` })
          }

          // eslint-disable-next-line no-continue
          continue
        }

        throw new Error(`Unsupported file system handle kind: ${handle.kind}`)
      }

      const fileList = dataTransfer.files

      if (fileList.length === 0) {
        return
      }

      if (fileList && fileList.length) await uploadFiles(fileList, true, dirHandle.name)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      // TODO: detect user cancel via isUserCancellation from download
      const errName = (err as { name?: string })?.name

      if (errName !== 'AbortError') {
        const errorMessage = err instanceof Error ? err.message : String(err)
        setShowError(true)
        setErrorMessage?.(errorMessage)
      }
    }
  }, [currentDrive, handleCloseContext, setErrorMessage, setShowError, uploadFiles])

  return (
    <>
      {conflictPortal}

      {showNewFolderModal && currentDrive && (
        <NewFolderModal
          parentLabel={currentPath || currentDrive.name}
          takenNames={currentFolderNames}
          onCancelClick={() => setShowNewFolderModal(false)}
          onProceed={doCreateFolder}
        />
      )}

      <input type="file" ref={bulk.fileInputRef} style={{ display: 'none' }} onChange={onFileSelected} multiple />

      <div className="fm-file-browser-container" data-search-mode={isSearchMode ? 'true' : 'false'}>
        <FileBrowserTopBar onOpenMenu={openTopbarMenu} canOpen={!isSearchMode && Boolean(currentDrive)} />
        <div
          className="fm-file-browser-content"
          data-search-mode={isSearchMode ? 'true' : 'false'}
          ref={contentRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          onContextMenu={handleFileBrowserContextMenu}
        >
          <FileBrowserHeader
            key={isSearchMode ? 'hdr-search' : 'hdr-normal'}
            isSearchMode={isSearchMode}
            bulk={bulk}
            sortKey={sort.key}
            sortDir={sort.dir}
            onSortName={() => toggle(SortKey.Name)}
            onSortSize={() => toggle(SortKey.Size)}
            onSortDate={() => toggle(SortKey.Timestamp)}
            onSortDrive={() => toggle(SortKey.Drive)}
            onClearSort={reset}
          />
          <div
            className="fm-file-browser-content-body"
            ref={bodyRef}
            onMouseDown={e => {
              if (e.button !== 0) return
              handleCloseContext()
            }}
          >
            <FileBrowserContent
              key={isSearchMode ? `content-search` : `content-${currentDrive?.id.toString() ?? 'none'}`}
              listToRender={stableSorted}
              folders={isSearchMode ? [] : folders}
              drives={drives}
              currentDrive={currentDrive || null}
              view={view}
              isSearchMode={isSearchMode}
              trackDownload={trackDownload}
              selectedIds={bulk.selectedIds}
              onToggleSelected={bulk.toggleOne}
              bulkSelectedCount={bulk.selectedCount}
              onBulk={onBulk}
              setErrorMessage={setErrorMessage}
            />
            <ErrorModalBlock
              showError={Boolean(showError)}
              label={errorMessage || 'An error occurred'}
              onOk={() => {
                setShowError(false)
                setErrorMessage?.('')

                return
              }}
            />

            <FileBrowserContextMenuBlock
              showContext={showContext}
              contextRef={contextRef}
              safePos={safePos}
              dropDir={dropDir}
              drives={drives}
              view={view}
              bulk={bulk}
              adminStamp={fm?.adminStamp}
              doRefresh={doRefresh}
              onContextUploadFile={onContextUploadFile}
              onContextUploadFolder={selectFolder}
              onContextCreateFolder={createFolder}
              setConfirmBulkRestore={setConfirmBulkRestore}
              setShowBulkDeleteModal={setShowBulkDeleteModal}
              setShowDestroyDriveModal={setShowDestroyDriveModal}
            />
          </div>

          {showDragOverlay && (
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

          <FileBrowserModals
            showDeleteModal={showDeleteModal}
            selectedFiles={bulk.selectedFiles}
            fileCountText={fileCountText}
            currentDrive={currentDrive || null}
            confirmBulkForget={confirmBulkForget}
            confirmBulkRestore={confirmBulkRestore}
            showDestroyDriveModal={showDestroyDriveModal}
            pendingCancelUpload={pendingCancelUpload}
            onDeleteCancel={() => setShowBulkDeleteModal(false)}
            onDeleteProceed={handleDeleteModalProceed}
            onForgetConfirm={async () => {
              await bulk.forget(bulk.selectedFiles)
              setConfirmBulkForget(false)
            }}
            onForgetCancel={() => setConfirmBulkForget(false)}
            onRestoreConfirm={async () => {
              await bulk.restore(bulk.selectedFiles)
              setConfirmBulkRestore(false)
            }}
            onRestoreCancel={() => setConfirmBulkRestore(false)}
            onDestroyCancel={() => setShowDestroyDriveModal(false)}
            onDestroyConfirm={handleDestroyDriveConfirm}
            onCancelUploadConfirm={() => {
              if (pendingCancelUpload) {
                cancelOrDismissUpload(pendingCancelUpload)
                setPendingCancelUpload(null)
              }
            }}
            onCancelUploadCancel={() => setPendingCancelUpload(null)}
            pendingCancelDownload={pendingCancelDownload}
            onCancelDownloadConfirm={() => {
              if (pendingCancelDownload) {
                cancelOrDismissDownload(pendingCancelDownload)
                setPendingCancelDownload(null)
              }
            }}
            onCancelDownloadCancel={() => setPendingCancelDownload(null)}
          />

          {isRefreshing && (
            <div className="fm-refresh-overlay" aria-busy="true" aria-live="polite">
              <div className="fm-refresh-content">
                <div className="fm-mini-spinner" role="status" aria-label="Syncing…" />
                <span className="fm-refresh-text">Syncing latest files…</span>
              </div>
            </div>
          )}

          <DestroyingOverlay isDestroying={isDestroying} onClick={() => setIsProgressModalOpen(true)} />
          <DestroyProgressModal
            isDestroying={isDestroying}
            isProgressModalOpen={isProgressModalOpen}
            currentDrive={currentDrive}
            onMinimize={() => setIsProgressModalOpen(false)}
          />
        </div>

        <div className="fm-file-browser-footer">
          <FileProgressNotification
            label="Uploading files"
            type={FileTransferType.Upload}
            open={isUploading}
            items={uploadItems}
            onRowClose={handleUploadClose}
            onCloseAll={() => dismissAllUploads()}
          />
          <FileProgressNotification
            label="Downloading files"
            type={FileTransferType.Download}
            open={isDownloading}
            items={downloadItems}
            onRowClose={handleDownloadClose}
            onCloseAll={() => dismissAllDownloads()}
          />
          <NotificationBar setErrorMessage={setErrorMessage} />
        </div>
      </div>
    </>
  )
}

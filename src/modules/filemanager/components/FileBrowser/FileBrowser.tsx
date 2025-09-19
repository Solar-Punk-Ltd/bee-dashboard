import { ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './FileBrowser.scss'
import { FileBrowserTopBar } from './FileBrowserTopBar/FileBrowserTopBar'
import { FileBrowserHeader } from './FileBrowserHeader/FileBrowserHeader'
import { FileBrowserContent } from './FileBrowserContent/FileBrowserContent'
import { ContextMenu } from '../ContextMenu/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { NotificationBar } from '../NotificationBar/NotificationBar'
import { FileTransferType, ViewType } from '../../constants/constants'
import { FileProgressNotification } from '../FileProgressNotification/FileProgressNotification'
import { useView } from '../../providers/FMFileViewContext'
import { useFM } from '../../providers/FMContext'
import { useFMTransfers } from '../../hooks/useFMTransfers'
import { useFMSearch } from '../../providers/FMSearchContext'
import { useFileFiltering } from '../../hooks/useFileFiltering'
import { useDragAndDrop } from '../../hooks/useDragAndDrop'

import { Point, Dir } from '../../utils/common'
import { computeContextMenuPosition } from '../../utils/ui'

export function FileBrowser(): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view, setActualItemView } = useView()
  const { files, currentDrive, refreshFiles, drives } = useFM()
  const {
    uploadFiles,
    isUploading,
    uploadItems,
    isDownloading,
    downloadCount,
    downloadItems,
    trackDownload,
    conflictPortal,
  } = useFMTransfers()
  const { query, scope, includeActive, includeTrashed } = useFMSearch()

  const [safePos, setSafePos] = useState<Point>(pos as Point)
  const [dropDir, setDropDir] = useState<Dir>(Dir.Down)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

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

  const onContextUploadFile = () => fileInputRef.current?.click()

  const handleFileBrowserContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.fm-file-item-content')) return
    handleContextMenu(e)
  }

  useLayoutEffect(() => {
    if (!showContext) return
    requestAnimationFrame(() => {
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

      setSafePos(sp)
      setDropDir(dd)
    })
  }, [showContext, pos, contextRef])

  useEffect(() => {
    const title = isSearchMode
      ? `Search results${scope === 'selected' && currentDrive?.name ? ` — ${currentDrive.name}` : ''}`
      : currentDrive?.name || ''
    setActualItemView?.(title)
  }, [isSearchMode, scope, currentDrive, setActualItemView])

  return (
    <>
      {conflictPortal}
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={onFileSelected} />
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
          <FileBrowserHeader isSearchMode={isSearchMode} />
          <div
            className="fm-file-browser-content-body"
            onContextMenu={handleFileBrowserContextMenu}
            onClick={handleCloseContext}
          >
            <FileBrowserContent
              listToRender={listToRender}
              drives={drives}
              currentDrive={currentDrive || null}
              view={view}
              isSearchMode={isSearchMode}
              trackDownload={trackDownload}
            />

            {showContext && (
              <div
                ref={contextRef}
                className="fm-file-browser-context-menu"
                style={{ top: safePos.y, left: safePos.x }}
                data-drop={dropDir}
              >
                {view === ViewType.Trash ? (
                  <ContextMenu>
                    <div className="fm-context-item">Empty trash</div>
                  </ContextMenu>
                ) : (
                  <ContextMenu>
                    <div className="fm-context-item">New folder</div>
                    <div className="fm-context-item" onClick={onContextUploadFile}>
                      Upload file
                    </div>
                    <div className="fm-context-item">Upload folder</div>
                    <div className="fm-context-item-border" />
                    <div className="fm-context-item">Paste</div>
                    <div className="fm-context-item-border" />
                    <div className="fm-context-item" onClick={() => refreshFiles?.()}>
                      Refresh
                    </div>
                  </ContextMenu>
                )}
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
        </div>

        <div className="fm-file-browser-footer">
          <FileProgressNotification
            label="Uploading files"
            type={FileTransferType.Upload}
            open={isUploading}
            count={uploadItems.length}
            items={uploadItems.map(i => ({ name: i.name, percent: i.percent, size: i.size, kind: i.kind }))}
          />
          <FileProgressNotification
            label="Downloading files"
            type={FileTransferType.Download}
            open={isDownloading}
            count={downloadCount}
            items={downloadItems.map(i => ({ name: i.name, percent: i.percent, size: i.size, kind: i.kind }))}
          />
          <NotificationBar />
        </div>
      </div>
    </>
  )
}

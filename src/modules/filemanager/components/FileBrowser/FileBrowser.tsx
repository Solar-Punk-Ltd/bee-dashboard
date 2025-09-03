import { ReactElement, useCallback, useRef, useState } from 'react'
import './FileBrowser.scss'
import { FileBrowserTopBar } from './FileBrowserTopBar/FileBrowserTopBar'
import DownIcon from 'remixicon-react/ArrowDownSLineIcon'
import { FileItem } from './FileItem/FileItem'
import { ContextMenu } from '../ContextMenu/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { NotificationBar } from '../NotificationBar/NotificationBar'
import { FileTransferType, ViewType } from '../../constants/constants'
import { FileProgressNotification } from '../FileProgressNotification/FileProgressNotification'
import { useView } from '../../providers/FMFileViewContext'
import { useFMTransfers } from '../../hooks/useFMTransfers'
import { useFM } from '../../providers/FMContext'

export function FileBrowser(): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view } = useView()
  const { currentBatch } = useFM()
  const { uploadFiles, isUploading, uploadCount, uploadItems } = useFMTransfers()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files

    if (files && files.length) uploadFiles(files)
    e.target.value = ''
  }

  const onContextUploadFile = () => fileInputRef.current?.click()

  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const hasFilesDT = (dt: DataTransfer | null): boolean => {
    if (!dt) return false

    if (dt.types && Array.from(dt.types).includes('Files')) return true

    if (dt.items && Array.from(dt.items).some(i => i.kind === 'file')) return true

    return false
  }

  const onContentDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilesDT(e.dataTransfer)) return
    e.preventDefault()

    if (dragCounter.current++ === 0) setIsDragging(true)
  }

  const onContentDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilesDT(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onContentDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilesDT(e.dataTransfer)) return
    e.preventDefault()
    dragCounter.current = Math.max(0, dragCounter.current - 1)

    if (dragCounter.current === 0) setIsDragging(false)
  }

  const onContentDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilesDT(e.dataTransfer)) return
    e.preventDefault()
    const files = e.dataTransfer?.files ?? null
    dragCounter.current = 0
    setIsDragging(false)

    if (files && files.length) uploadFiles(files)
  }

  const handleFileBrowserContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.fm-file-item-content')) return
    handleContextMenu(e)
  }

  const onOverlayDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const files = e.dataTransfer?.files ?? null

      if (files && files.length) uploadFiles(files)
    },
    [uploadFiles],
  )

  return (
    <>
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={onFileSelected} />

      <div className="fm-file-browser-container">
        <FileBrowserTopBar />

        <div
          className="fm-file-browser-content"
          ref={contentRef}
          onDragEnter={onContentDragEnter}
          onDragOver={onContentDragOver}
          onDragLeave={onContentDragLeave}
          onDrop={onContentDrop}
        >
          <div className="fm-file-browser-content-header">
            <div className="fm-file-browser-content-header-item fm-checkbox">
              <input type="checkbox" />
            </div>
            <div className="fm-file-browser-content-header-item fm-name">
              Name
              <div className="fm-file-browser-content-header-item-icon">
                <DownIcon size="16px" />
              </div>
            </div>
            <div className="fm-file-browser-content-header-item fm-size">
              Size
              <div className="fm-file-browser-content-header-item-icon">
                <DownIcon size="16px" />
              </div>
            </div>
            <div className="fm-file-browser-content-header-item fm-date-mod">
              Date mod.
              <div className="fm-file-browser-content-header-item-icon">
                <DownIcon size="16px" />
              </div>
            </div>
          </div>

          <div
            className="fm-file-browser-content-body"
            onContextMenu={handleFileBrowserContextMenu}
            onClick={handleCloseContext}
          >
            <FileItem icon="image" name="File1.jpg" size="1.2MB" dateMod="2025-05-19" />
            <FileItem icon="doc" name="Report.pdf" size="0.5MB" dateMod="2025-05-25" />

            {showContext && (
              <div ref={contextRef} className="fm-file-browser-context-menu" style={{ top: pos.y, left: pos.x }}>
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
                    <div className="fm-context-item">Refresh</div>
                  </ContextMenu>
                )}
              </div>
            )}
          </div>

          {isDragging && currentBatch && (
            <div
              className="fm-drag-overlay"
              onDragOver={e => {
                e.preventDefault()
                ;(e.dataTransfer as DataTransfer).dropEffect = 'copy'
              }}
              onDrop={onOverlayDrop}
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
            count={uploadCount}
            items={uploadItems.map(i => ({ name: i.name, percent: i.percent, size: i.size }))}
          />
          <FileProgressNotification label="Downloading files" type={FileTransferType.Download} />
          <NotificationBar />
        </div>
      </div>
    </>
  )
}

import { ReactElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import type { FileInfo } from '@solarpunkltd/file-manager-lib'

export function FileBrowser(): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view } = useView()
  const { fm, files, currentBatch, refreshFiles } = useFM()
  const { uploadFiles, isUploading, uploadCount, uploadItems } = useFMTransfers()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files

    if (f && f.length) uploadFiles(f)
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
      dragCounter.current = 0
      const dropped = e.dataTransfer?.files

      if (dropped && dropped.length) uploadFiles(dropped)
    },
    [uploadFiles],
  )

  const [safePos, setSafePos] = useState(pos)
  const [dropDir, setDropDir] = useState<'down' | 'up'>('down')

  useLayoutEffect(() => {
    if (!showContext) return
    requestAnimationFrame(() => {
      const menu = contextRef.current
      const container = document.querySelector('.fm-file-browser-container') as HTMLElement | null

      if (!menu || !container) return

      const rect = menu.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 8

      const containerRect = container.getBoundingClientRect()
      const containerMidY = containerRect.top + containerRect.height / 2

      const left = Math.max(margin, Math.min(pos.x, vw - rect.width - margin))

      let top = pos.y
      let dir: 'down' | 'up' = 'down'

      if (pos.y > containerMidY || pos.y + rect.height + margin > vh) {
        top = Math.max(margin, pos.y - rect.height)
        dir = 'up'
      } else {
        top = Math.max(margin, Math.min(pos.y, vh - rect.height - margin))
      }

      setSafePos({ x: left, y: top })
      setDropDir(dir)
    })
  }, [showContext, pos, contextRef])

  const isTrashed = (fi: FileInfo) => {
    const s = (fi as any).status

    if (s == null) return false

    if (typeof s === 'string') return s.toLowerCase() === 'trashed'

    if (typeof s === 'number') return s !== 0

    return false
  }

  const currentDriveLabel = useMemo(
    () => (currentBatch ? currentBatch.label || currentBatch.batchID.toString() : ''),
    [currentBatch],
  )

  const rows = useMemo(() => {
    if (!currentBatch) return []
    const wanted = currentBatch.batchID.toString()
    const sameDrive = files.filter(fi => String((fi as any).batchId) === wanted)

    const map = new Map<string, FileInfo>()
    sameDrive.forEach(fi => {
      const key = fi.topic?.toString?.()

      if (!key) return
      const prev = map.get(key)
      const vi = BigInt(fi.version ?? '0')
      const pi = BigInt(prev?.version ?? '0')

      if (!prev || vi > pi) map.set(key, fi)
    })

    const latest = Array.from(map.values())

    return view === ViewType.Trash ? latest.filter(isTrashed) : latest.filter(fi => !isTrashed(fi))
  }, [files, currentBatch, view])

  useEffect(() => {
    if (fm && currentBatch) refreshFiles()
  }, [fm, currentBatch, refreshFiles])

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
            {currentBatch ? (
              rows.length === 0 ? (
                <div className="fm-drop-hint">Drag &amp; drop files here into “{currentDriveLabel}”</div>
              ) : (
                rows.map(fi => <FileItem key={fi.topic.toString()} fileInfo={fi} />)
              )
            ) : (
              <div className="fm-drop-hint">Select a drive to view its files</div>
            )}

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

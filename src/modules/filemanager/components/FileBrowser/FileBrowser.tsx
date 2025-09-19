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
import { useFM } from '../../providers/FMContext'
import { useFMTransfers } from '../../hooks/useFMTransfers'
import { FileInfo } from '@solarpunkltd/file-manager-lib'
import { useFMSearch } from '../../providers/FMSearchContext'

import { indexStrToBigint, isTrashed } from '../../utils/common'
import { computeContextMenuPosition } from '../../utils/ui'

type Point = { x: number; y: number }

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
  const [dropDir, setDropDir] = useState<'down' | 'up'>('down')

  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const q = query.trim().toLowerCase()
  const isSearchMode = q.length > 0
  const selectedBatchId = useMemo(() => (currentDrive ? currentDrive.batchId.toString() : ''), [currentDrive])

  const renderEmptyState = useCallback((): ReactElement => {
    if (drives.length === 0) {
      return <div className="fm-drop-hint">Create a drive to start using the file manager</div>
    }

    if (!currentDrive) {
      return <div className="fm-drop-hint">Select a drive to upload or view its files</div>
    }

    if (view === ViewType.Trash) {
      return (
        <div className="fm-drop-hint">
          Files from &quot;{currentDrive?.name}&quot; that are trashed can be viewed here
        </div>
      )
    }

    return <div className="fm-drop-hint">Drag &amp; drop files here into &quot;{currentDrive?.name}&quot;</div>
  }, [drives, currentDrive, view])

  const renderFileList = useCallback(
    (filesToRender: FileInfo[], showDriveColumn = false): ReactElement[] => {
      return filesToRender.map(fi => {
        const driveName = drives.find(d => d.id.toString() === fi.driveId.toString())?.name || '-'
        const key = `${fi.name}::${fi.version ?? ''}`

        if (showDriveColumn) {
          return (
            <FileItem key={key} fileInfo={fi} onDownload={trackDownload} showDriveColumn={true} driveName={driveName} />
          )
        }

        return <FileItem key={key} fileInfo={fi} onDownload={trackDownload} driveName={driveName} />
      })
    },
    [trackDownload, drives],
  )

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files

    if (f && f.length) uploadFiles(f)
    e.target.value = ''
  }

  const onContextUploadFile = () => fileInputRef.current?.click()

  const hasFilesDT = (dt: DataTransfer | null): boolean => {
    if (!dt) return false

    if (dt.types && Array.from(dt.types).includes('Files')) return true

    if (dt.items && Array.from(dt.items).some(i => i.kind === 'file')) return true

    return false
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilesDT(e.dataTransfer)) return
    e.preventDefault()

    if (dragCounter.current++ === 0) setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilesDT(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilesDT(e.dataTransfer)) return
    e.preventDefault()
    dragCounter.current = Math.max(0, dragCounter.current - 1)

    if (dragCounter.current === 0) setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilesDT(e.dataTransfer)) return
    e.preventDefault()
    const droppedFiles = e.dataTransfer?.files ?? null
    dragCounter.current = 0
    setIsDragging(false)

    if (droppedFiles && droppedFiles.length) uploadFiles(droppedFiles)
  }

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
        containerRect, // pass the rect; util will compute midY itself
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

  const handleOverlayDrop = useCallback(
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

  const statusIncluded = useCallback(
    (fi: FileInfo): boolean => {
      const trashed = isTrashed(fi)

      if (trashed && !includeTrashed) return false

      if (!trashed && !includeActive) return false

      return true
    },
    [includeActive, includeTrashed],
  )

  const matchesQuery = useCallback(
    (fi: FileInfo): boolean => {
      if (!q) return true
      const name = fi.name.toLowerCase()
      const mime = (fi.customMetadata?.mime || '').toLowerCase()
      const topic = String(fi.topic ?? '').toLowerCase()

      return name.includes(q) || mime.includes(q) || topic.includes(q)
    },
    [q],
  )

  // TODO: refactor
  const rows = useMemo((): FileInfo[] => {
    if (!currentDrive) return []

    const sameDrive = files.filter(fi => fi.driveId.toString() === currentDrive.id.toString())

    const nameCount = sameDrive.reduce<Record<string, number>>((acc, fi) => {
      acc[fi.name] = (acc[fi.name] || 0) + 1

      return acc
    }, {})

    const keyOf = (fi: FileInfo): string => {
      if (nameCount[fi.name] > 1) return `N:${fi.name}`
      const hist = fi.file.historyRef.toString()

      if (hist) return `H:${hist}`
      const t = fi.topic.toString()

      if (t) return `T:${t}`

      return `N:${fi.name}`
    }

    const map = new Map<string, FileInfo>()
    sameDrive.forEach(fi => {
      const key = keyOf(fi)
      const prev = map.get(key)

      if (!prev) {
        map.set(key, fi)

        return
      }

      // todo: same as lastof or picklatest
      const vi = indexStrToBigint(fi.version)
      const pi = indexStrToBigint(prev.version)

      if (vi === undefined || pi === undefined) {
        return
      }

      if (vi > pi) {
        map.set(key, fi)

        return
      }

      if (vi === pi && Number(fi.timestamp || 0) > Number(prev.timestamp || 0)) map.set(key, fi)
    })

    const latest = Array.from(map.values())

    return view === ViewType.Trash ? latest.filter(isTrashed) : latest.filter(fi => !isTrashed(fi))
  }, [files, currentDrive, view])

  const searchRows = useMemo((): FileInfo[] => {
    if (!isSearchMode) return []

    const source =
      scope === 'selected' && selectedBatchId ? files.filter(f => f.batchId.toString() === selectedBatchId) : files

    const filtered = source.filter(f => statusIncluded(f) && matchesQuery(f))

    const keyOf = (fi: FileInfo): string => {
      const hist = fi.file.historyRef.toString()

      if (hist) return `H:${hist}`
      const t = fi.topic.toString()

      return `T:${t}|N:${fi.name}`
    }

    const latest = new Map<string, FileInfo>()
    for (const fi of filtered) {
      const k = keyOf(fi)
      const prev = latest.get(k)

      if (!prev) {
        latest.set(k, fi)
      } else {
        const a = indexStrToBigint(fi.version)
        const b = indexStrToBigint(prev.version)

        // todo: review logic
        if (a === undefined || b === undefined) continue

        if (a > b || (a === b && Number(fi.timestamp || 0) > Number(prev.timestamp || 0))) {
          latest.set(k, fi)
        }
      }
    }

    return Array.from(latest.values()).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
  }, [isSearchMode, scope, selectedBatchId, files, matchesQuery, statusIncluded])

  const listToRender = isSearchMode ? searchRows : rows

  const renderMainContent = useCallback((): ReactElement | ReactElement[] => {
    if (drives.length === 0) {
      return renderEmptyState()
    }

    if (!isSearchMode) {
      if (!currentDrive) {
        return <div className="fm-drop-hint">Select a drive to upload or view its files</div>
      }

      if (listToRender.length === 0) {
        if (view === ViewType.Trash) {
          return (
            <div className="fm-drop-hint">
              Files from &quot;{currentDrive?.name}&quot; that are trashed can be viewed here
            </div>
          )
        }

        return <div className="fm-drop-hint">Drag &amp; drop files here into &quot;{currentDrive?.name}&quot;</div>
      }

      return renderFileList(listToRender)
    }

    if (listToRender.length === 0) {
      return <div className="fm-drop-hint">No results found.</div>
    }

    return renderFileList(listToRender, true)
  }, [drives, isSearchMode, currentDrive, view, listToRender, renderEmptyState, renderFileList])

  const mainContent = useMemo(() => renderMainContent(), [renderMainContent])

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

            {isSearchMode && (
              <div className="fm-file-browser-content-header-item fm-drive">
                Drive
                <div className="fm-file-browser-content-header-item-icon">
                  <DownIcon size="16px" />
                </div>
              </div>
            )}

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
            {mainContent}

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

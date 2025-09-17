import { ReactElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import type { FileInfo, FileStatus } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { useFMSearch } from '../../providers/FMSearchContext'

import { getUsableStamps } from '../../utils/bee'
import { indexStrToBigint } from '../../utils/common'
import { computeContextMenuPosition } from '../../utils/ui'

type Point = { x: number; y: number }
// todo: use fileStatus
const isTrashed = (fi: FileInfo): boolean => (fi.status as FileStatus | undefined) === 'trashed'

export function FileBrowser(): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view, setActualItemView } = useView()

  const { files, currentDrive, refreshFiles } = useFM()

  const { beeApi } = useContext(SettingsContext)

  const {
    uploadFiles,
    isUploading,
    uploadCount,
    uploadItems,
    isDownloading,
    downloadCount,
    downloadItems,
    trackDownload,
    conflictPortal,
  } = useFMTransfers()

  const [hasAnyDrive, setHasAnyDrive] = useState(false)
  const [stampLabels, setStampLabels] = useState<Map<string, string>>(new Map())

  const { query, scope, includeActive, includeTrashed } = useFMSearch()
  const q = query.trim().toLowerCase()
  const isSearchMode = q.length > 0

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const stamps = await getUsableStamps(beeApi)
      const drives = stamps.filter(s => s.label !== 'owner' && s.label !== 'owner-stamp')

      if (mounted) {
        setHasAnyDrive(drives.length > 0)
        const m = new Map<string, string>()
        for (const s of stamps) {
          const id = s.batchID.toString()
          const lbl = typeof s.label === 'string' && s.label.trim() ? s.label.trim() : `Drive ${id.slice(0, 6)}`
          m.set(id, lbl)
        }
        setStampLabels(m)
      }
    })()

    return () => {
      mounted = false
    }
  }, [beeApi])

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
    const droppedFiles = e.dataTransfer?.files ?? null
    dragCounter.current = 0
    setIsDragging(false)

    if (droppedFiles && droppedFiles.length) uploadFiles(droppedFiles)
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

  const [safePos, setSafePos] = useState<Point>(pos as Point)
  const [dropDir, setDropDir] = useState<'down' | 'up'>('down')

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

  const selectedBatchId = useMemo(() => (currentDrive ? currentDrive.batchId.toString() : ''), [currentDrive])

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

  let bodyContent: ReactElement | ReactElement[] = (
    <div className="fm-drop-hint">Select a drive to upload or view its files</div>
  )

  if (!hasAnyDrive) {
    bodyContent = <div className="fm-drop-hint">Create a drive to start using the file manager</div>
  } else if (!isSearchMode) {
    if (!currentDrive) {
      bodyContent = <div className="fm-drop-hint">Select a drive to upload or view its files</div>
    } else if (listToRender.length === 0) {
      if (view === ViewType.Trash) {
        bodyContent = (
          <div className="fm-drop-hint">Files from “{currentDrive?.name}” that are trashed can be viewed here</div>
        )
      } else {
        bodyContent = <div className="fm-drop-hint">Drag &amp; drop files here into “{currentDrive?.name}”</div>
      }
    } else {
      bodyContent = listToRender.map(fi => (
        <FileItem
          key={`${fi.file.historyRef.toString() || fi.topic.toString() || fi.name}::${fi.version ?? ''}`}
          fileInfo={fi}
          onDownload={trackDownload}
        />
      ))
    }
  } else {
    if (listToRender.length === 0) {
      bodyContent = <div className="fm-drop-hint">No results found.</div>
    } else {
      bodyContent = listToRender.map(fi => {
        const bid = fi.batchId.toString()
        const driveLabel = stampLabels.get(bid) || bid.slice(0, 6)

        return (
          <FileItem
            key={`${fi.file.historyRef.toString() || fi.topic.toString() || fi.name}::${fi.version ?? ''}`}
            fileInfo={fi}
            onDownload={trackDownload}
            showDriveColumn={true}
            driveName={driveLabel}
          />
        )
      })
    }
  }

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
            {bodyContent}

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

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
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { getUsableStamps } from '../../utils/utils'

type WithStatus = { status?: string | number | null }
const hasStatus = (x: unknown): x is WithStatus => typeof x === 'object' && x !== null && 'status' in (x as any)
type WithBatchId = { batchId?: string | number | bigint | null }
const hasBatchId = (x: unknown): x is WithBatchId => typeof x === 'object' && x !== null && 'batchId' in (x as any)

function safeTopic(t: unknown) {
  try {
    return (t as any)?.toString?.() ?? String(t ?? '')
  } catch {
    return String(t ?? '')
  }
}

function historyKey(fi: FileInfo): string {
  const ref = (fi as any)?.file?.historyRef ?? (fi as any)?.historyRef ?? (fi as any)?.actHistoryRef

  return ref ? String(ref) : ''
}

export function FileBrowser(): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view } = useView()
  const { fm, files, currentBatch, refreshFiles } = useFM()
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

  // Detect whether any usable drives exist (so we can show the right empty-state message)
  useEffect(() => {
    let mounted = true
    const run = async () => {
      const stamps = await getUsableStamps(beeApi)
      const drives = stamps.filter(s => s.label !== 'owner' && s.label !== 'owner-stamp')

      if (mounted) setHasAnyDrive(drives.length > 0)
    }
    run()

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
    const s = hasStatus(fi) ? (fi as any).status : undefined

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
    const sameDrive = files.filter(
      fi => hasBatchId(fi) && String((fi as any).batchId ?? (fi as any).batchID) === wanted,
    )

    const nameCount = sameDrive.reduce<Record<string, number>>((acc, fi) => {
      const n = fi.name || ''
      acc[n] = (acc[n] || 0) + 1

      return acc
    }, {})

    const keyOf = (fi: FileInfo) => {
      const n = fi.name || ''

      if (nameCount[n] > 1) return `N:${n}`
      const hist = historyKey(fi)

      if (hist) return `H:${hist}`
      const t = safeTopic(fi.topic)

      if (t) return `T:${t}`

      return `N:${n}`
    }

    const map = new Map<string, FileInfo>()
    sameDrive.forEach(fi => {
      const key = keyOf(fi)
      const prev = map.get(key)

      if (!prev) {
        map.set(key, fi)

        return
      }
      const vi = BigInt(fi.version ?? '0')
      const pi = BigInt(prev.version ?? '0')

      if (vi > pi) {
        map.set(key, fi)

        return
      }

      if (vi === pi && Number(fi.timestamp || 0) > Number(prev.timestamp || 0)) map.set(key, fi)
    })

    const latest = Array.from(map.values())

    return view === ViewType.Trash ? latest.filter(isTrashed) : latest.filter(fi => !isTrashed(fi))
  }, [files, currentBatch, view])

  useEffect(() => {
    if (fm && currentBatch) refreshFiles()
  }, [fm, currentBatch, refreshFiles])

  // ── Empty-state + content rendering rules ───────────────────────────────
  let bodyContent: ReactElement | ReactElement[] = (
    <div className="fm-drop-hint">Select a drive to upload or view its files</div>
  )

  if (!hasAnyDrive) {
    // 1) No stamp/drive exists
    bodyContent = <div className="fm-drop-hint">Create a drive to start using the file manager</div>
  } else if (!currentBatch) {
    // 3) Drives exist but nothing selected (rare, we auto-select; but keep as fallback)
    bodyContent = <div className="fm-drop-hint">Select a drive to upload or view its files</div>
  } else if (rows.length === 0) {
    // 2) Selected drive but empty rows
    if (view === ViewType.Trash) {
      bodyContent = (
        <div className="fm-drop-hint">Files from “{currentDriveLabel}” that are trashed can be viewed here</div>
      )
    } else {
      bodyContent = <div className="fm-drop-hint">Drag &amp; drop files here into “{currentDriveLabel}”</div>
    }
  } else {
    bodyContent = rows.map(fi => (
      <FileItem
        key={`${historyKey(fi) || safeTopic(fi.topic) || fi.name}::${fi.version ?? ''}`}
        fileInfo={fi}
        onDownload={trackDownload}
      />
    ))
  }

  return (
    <>
      {conflictPortal}
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
              Name{' '}
              <div className="fm-file-browser-content-header-item-icon">
                <DownIcon size="16px" />
              </div>
            </div>
            <div className="fm-file-browser-content-header-item fm-size">
              Size{' '}
              <div className="fm-file-browser-content-header-item-icon">
                <DownIcon size="16px" />
              </div>
            </div>
            <div className="fm-file-browser-content-header-item fm-date-mod">
              Date mod.{' '}
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

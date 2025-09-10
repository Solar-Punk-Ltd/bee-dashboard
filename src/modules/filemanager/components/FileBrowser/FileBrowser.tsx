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
import { BatchId } from '@ethersphere/bee-js'
import type { FileInfo, FileManager, FileStatus } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { getUsableStamps } from '../../utils/utils'
import { useFMSearch } from '../../providers/FMSearchContext'

type Point = { x: number; y: number }

type CurrentBatch = { batchID: BatchId; label?: string }
type SettingsValue = { beeApi: unknown }
type StampLike = { label?: string; batchID?: { toString?: () => string } | string }

const toStringSafe = (x: unknown): string => {
  if (x == null) return ''

  if (typeof x === 'string') return x
  try {
    const s = (x as { toString?: () => string }).toString?.() ?? String(x)

    return s !== '[object Object]' ? s : ''
  } catch {
    return ''
  }
}

type Stringish = { toString?: () => string } | string | number | boolean | bigint | null | undefined
const normalizeBatchId = (v: unknown): string => {
  const s = toStringSafe((v as Stringish)?.toString?.() ?? v)

  return s.startsWith('0x') ? s.slice(2).toLowerCase() : s.toLowerCase()
}

const historyKey = (fi: FileInfo): string => toStringSafe((fi.file as any)?.historyRef)
const isTrashed = (fi: FileInfo): boolean => (fi.status as FileStatus | undefined) === 'trashed'
const toBigIntSafe = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? '0'))
  } catch {
    return BigInt(0)
  }
}

export function FileBrowser(): ReactElement {
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const { view, setActualItemView } = useView()

  const { files, currentBatch, refreshFiles } = useFM() as {
    fm: FileManager
    files: FileInfo[]
    currentBatch: CurrentBatch | null
    refreshFiles: () => void
  }

  const { beeApi } = useContext(SettingsContext) as SettingsValue

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

  // ——— search state
  const { query, scope, includeActive, includeTrashed } = useFMSearch()
  const q = query.trim().toLowerCase()
  const isSearchMode = q.length > 0

  // ——— load stamps (for drive names + hasAnyDrive)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const stamps = (await getUsableStamps(beeApi as any)) as StampLike[]
      const drives = stamps.filter(s => s.label !== 'owner' && s.label !== 'owner-stamp')

      if (mounted) {
        setHasAnyDrive(drives.length > 0)
        const m = new Map<string, string>()
        for (const s of stamps as any[]) {
          const id = normalizeBatchId((s.batchID as any) ?? '')
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

      if (!menu || !container) return
      const rect = menu.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 8
      const containerRect = container.getBoundingClientRect()
      const containerMidY = containerRect.top + containerRect.height / 2
      const left = Math.max(margin, Math.min((pos as Point).x, vw - rect.width - margin))
      let top = (pos as Point).y
      let dir: 'down' | 'up' = 'down'

      if ((pos as Point).y > containerMidY || (pos as Point).y + rect.height + margin > vh) {
        top = Math.max(margin, (pos as Point).y - rect.height)
        dir = 'up'
      } else {
        top = Math.max(margin, Math.min((pos as Point).y, vh - rect.height - margin))
      }
      setSafePos({ x: left, y: top })
      setDropDir(dir)
    })
  }, [showContext, pos, contextRef])

  const currentDriveLabel = useMemo(
    () => (currentBatch ? currentBatch.label || toStringSafe(currentBatch.batchID) : ''),
    [currentBatch],
  )

  // Update the top bar title when entering/exiting search mode
  useEffect(() => {
    const title = isSearchMode
      ? `Search results${scope === 'selected' && currentDriveLabel ? ` — ${currentDriveLabel}` : ''}`
      : currentDriveLabel
    setActualItemView?.(title)
  }, [isSearchMode, scope, currentDriveLabel, setActualItemView])

  // Normal (non-search) list: latest per history/topic within the selected drive, filtered by Trash vs Active via `view`
  const rows = useMemo((): FileInfo[] => {
    if (!currentBatch) return []
    const wanted = normalizeBatchId(currentBatch.batchID)
    const sameDrive = files.filter(fi => normalizeBatchId(fi.batchId as any) === wanted)

    const nameCount = sameDrive.reduce<Record<string, number>>((acc, fi) => {
      const n = fi.name || ''
      acc[n] = (acc[n] || 0) + 1

      return acc
    }, {})

    const keyOf = (fi: FileInfo): string => {
      const n = fi.name || ''

      if (nameCount[n] > 1) return `N:${n}`
      const hist = historyKey(fi)

      if (hist) return `H:${hist}`
      const t = toStringSafe(fi.topic)

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
      const vi = toBigIntSafe(fi.version)
      const pi = toBigIntSafe(prev.version)

      if (vi > pi) {
        map.set(key, fi)

        return
      }

      if (vi === pi && Number(fi.timestamp || 0) > Number(prev.timestamp || 0)) map.set(key, fi)
    })

    const latest = Array.from(map.values())

    return view === ViewType.Trash ? latest.filter(isTrashed) : latest.filter(fi => !isTrashed(fi))
  }, [files, currentBatch, view])

  // Search helpers
  const statusIncluded = (fi: FileInfo): boolean => {
    const trashed = isTrashed(fi)

    if (trashed && !includeTrashed) return false

    if (!trashed && !includeActive) return false

    return true
  }

  const matchesQuery = (fi: FileInfo): boolean => {
    if (!q) return true
    const name = (fi.name || '').toLowerCase()
    const mime = (fi.customMetadata?.mime || '').toLowerCase()
    const topic = String(fi.topic ?? '').toLowerCase()

    return name.includes(q) || mime.includes(q) || topic.includes(q)
  }

  const selectedBatchId = useMemo(() => (currentBatch ? normalizeBatchId(currentBatch.batchID) : ''), [currentBatch])

  // Search list: filter by scope + status + query, dedupe to latest per history/topic/name, sort by recency
  const searchRows = useMemo((): FileInfo[] => {
    if (!isSearchMode) return []

    const source =
      scope === 'selected' && selectedBatchId
        ? files.filter(f => normalizeBatchId(f.batchId as any) === selectedBatchId)
        : files

    const filtered = source.filter(f => statusIncluded(f) && matchesQuery(f))

    const keyOf = (fi: FileInfo): string => {
      const hist = historyKey(fi)

      if (hist) return `H:${hist}`
      const t = toStringSafe(fi.topic)
      const n = fi.name || ''

      return `T:${t}|N:${n}`
    }

    const latest = new Map<string, FileInfo>()
    for (const fi of filtered) {
      const k = keyOf(fi)
      const prev = latest.get(k)

      if (!prev) {
        latest.set(k, fi)
      } else {
        const a = toBigIntSafe(fi.version)
        const b = toBigIntSafe(prev.version)

        if (a > b || (a === b && Number(fi.timestamp || 0) > Number(prev.timestamp || 0))) {
          latest.set(k, fi)
        }
      }
    }

    return Array.from(latest.values()).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
  }, [isSearchMode, scope, selectedBatchId, files, includeActive, includeTrashed, q])

  const listToRender = isSearchMode ? searchRows : rows

  // Empty + body content
  let bodyContent: ReactElement | ReactElement[] = (
    <div className="fm-drop-hint">Select a drive to upload or view its files</div>
  )

  if (!hasAnyDrive) {
    bodyContent = <div className="fm-drop-hint">Create a drive to start using the file manager</div>
  } else if (!isSearchMode) {
    // normal mode requires a selected drive
    if (!currentBatch) {
      bodyContent = <div className="fm-drop-hint">Select a drive to upload or view its files</div>
    } else if (listToRender.length === 0) {
      if (view === ViewType.Trash) {
        bodyContent = (
          <div className="fm-drop-hint">Files from “{currentDriveLabel}” that are trashed can be viewed here</div>
        )
      } else {
        bodyContent = <div className="fm-drop-hint">Drag &amp; drop files here into “{currentDriveLabel}”</div>
      }
    } else {
      bodyContent = listToRender.map(fi => (
        <FileItem
          key={`${historyKey(fi) || toStringSafe(fi.topic) || fi.name}::${fi.version ?? ''}`}
          fileInfo={fi}
          onDownload={trackDownload}
        />
      ))
    }
  } else {
    // search mode (works even without selecting a drive if scope=all)
    if (listToRender.length === 0) {
      bodyContent = <div className="fm-drop-hint">No results found.</div>
    } else {
      bodyContent = listToRender.map(fi => {
        const bid = normalizeBatchId(fi.batchId as any)
        const driveLabel = stampLabels.get(bid) || bid.slice(0, 6)

        return (
          <FileItem
            key={`${historyKey(fi) || toStringSafe(fi.topic) || fi.name}::${fi.version ?? ''}`}
            fileInfo={fi}
            onDownload={trackDownload}
            showDriveColumn={true}
            driveLabel={driveLabel}
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

          {isDragging && currentBatch && (
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

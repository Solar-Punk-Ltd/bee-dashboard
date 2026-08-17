import { DriveInfo, FileRecord, FolderInfo } from '@solarpunkltd/file-manager-lib'
import { memo, ReactElement, useCallback, useContext } from 'react'

import { ItemType, useView } from '../../../../../pages/filemanager/ViewContext'
import { Context as FMContext } from '../../../../../providers/FileManager'
import { DownloadProgress, TrackDownloadProps, ViewType } from '../../../constants/transfers'
import { useNodeDragMove } from '../../../hooks/useNodeDragMove'
import { basename, getFileId, parentOf } from '../../../utils/common'
import { GetIconElement } from '../../../utils/GetIconElement'
import { FileItem } from '../FileItem/FileItem'

import { SubItem } from './SubItem'

export type FileSystemItem = {
  path: string
  ref: string
}

const trashedLabel = (item: { path: string; trashedFrom?: string }): string => basename(item.trashedFrom ?? item.path)

interface FileBrowserContentProps {
  listToRender: FileRecord[]
  folders: FolderInfo[]
  drives: DriveInfo[]
  currentDrive: DriveInfo | null
  view: ViewType
  isSearchMode: boolean
  isLoading?: boolean
  trackDownload: (props: TrackDownloadProps) => (dp: DownloadProgress) => void
  selectedIds?: Set<string>
  onToggleSelected?: (fi: FileRecord, checked: boolean) => void
  bulkSelectedCount?: number
  onBulk: {
    download?: () => void
    restore?: () => void
    forget?: () => void
    destroy?: () => void
    delete?: () => void
  }
  setErrorMessage?: (error: string) => void
}

function FileBrowserContentInner({
  listToRender,
  folders,
  drives,
  currentDrive,
  view,
  isSearchMode,
  isLoading,
  trackDownload,
  selectedIds,
  onToggleSelected,
  bulkSelectedCount,
  onBulk,
  setErrorMessage,
}: FileBrowserContentProps): ReactElement {
  const { setFolderView, viewFolders, setViewFolders } = useView()
  const { setShowError } = useContext(FMContext)

  const enterFolder = useCallback(
    (folderName: string) => {
      setFolderView(true)
      setViewFolders([...viewFolders, { folderName }])
    },
    [setFolderView, setViewFolders, viewFolders],
  )

  const reportError = useCallback(
    (msg: string) => {
      setErrorMessage?.(msg)
      setShowError(true)
    },
    [setErrorMessage, setShowError],
  )

  const canMove = !isSearchMode && view === ViewType.File && Boolean(currentDrive)
  const { isMoving, draggedPaths, dropTarget, getDragProps, getDropProps } = useNodeDragMove(canMove, reportError)

  const dragPathsFor = useCallback(
    (fi: FileRecord): string[] => {
      if (!selectedIds?.has(getFileId(fi)) || (bulkSelectedCount ?? 0) < 2) return [fi.path]

      return listToRender.filter(f => selectedIds.has(getFileId(f))).map(f => f.path)
    },
    [selectedIds, bulkSelectedCount, listToRender],
  )

  const renderFileList = useCallback(
    (filesToRender: FileRecord[], showDriveColumn = false): ReactElement[] => {
      const renderFileItem = (fi: FileRecord, displayName?: string): ReactElement | null => {
        const drive = drives.find(d => d.id === fi.driveId)

        if (!drive) return null

        const key = `${getFileId(fi)}::${fi.version ?? ''}::${showDriveColumn ? 'search' : 'normal'}`

        return (
          <FileItem
            key={key}
            fileInfo={fi}
            displayName={displayName}
            onDownload={trackDownload}
            showDriveColumn={showDriveColumn}
            driveName={drive.name}
            selected={Boolean(selectedIds?.has(getFileId(fi)))}
            onToggleSelected={onToggleSelected}
            bulkSelectedCount={bulkSelectedCount}
            onBulk={onBulk}
            setErrorMessage={setErrorMessage}
            folderItemDoubleClick={() => undefined}
            dragProps={getDragProps(dragPathsFor(fi))}
            isDragging={draggedPaths.includes(fi.path)}
          />
        )
      }

      // Search results stay flat (full paths, possibly across drives).
      if (showDriveColumn) {
        return filesToRender
          .map(fi => renderFileItem(fi, fi.trashedFrom))
          .filter((el): el is ReactElement => el !== null)
      }

      if (view === ViewType.Trash) {
        const trashFolderRows = folders.map(folder => (
          <SubItem
            key={`trash-folder::${folder.path}`}
            name={trashedLabel(folder)}
            path={folder.path}
            type={ItemType.Folder}
            trashInfo={folder}
            setErrorMessage={setErrorMessage}
          />
        ))

        const trashFileRows = filesToRender
          .map(fi => renderFileItem(fi, trashedLabel(fi)))
          .filter((el): el is ReactElement => el !== null)

        return [...trashFolderRows, ...trashFileRows]
      }

      const currentPath = viewFolders.map(f => f.folderName).join('/')
      const prefix = currentPath ? currentPath + '/' : ''

      const fileChildren: { fi: FileRecord; displayName: string }[] = []
      const folderNames = new Set<string>()

      filesToRender.forEach(fi => {
        if (prefix && !fi.path.startsWith(prefix)) return

        const rest = prefix ? fi.path.slice(prefix.length) : fi.path

        if (rest.indexOf('/') === -1) {
          fileChildren.push({ fi, displayName: rest })
        }
      })

      folders.forEach(folder => {
        if (prefix && !folder.path.startsWith(prefix)) return

        const rest = prefix ? folder.path.slice(prefix.length) : folder.path

        if (!rest) return

        const slash = rest.indexOf('/')
        folderNames.add(slash === -1 ? rest : rest.slice(0, slash))
      })

      const folderRows = Array.from(folderNames).map(folderName => {
        const folderPath = `${prefix}${folderName}`

        return (
          <SubItem
            key={`folder::${folderPath}`}
            name={folderName}
            path={folderPath}
            type={ItemType.Folder}
            setErrorMessage={setErrorMessage}
            onDoubleClick={() => enterFolder(folderName)}
            dragProps={getDragProps([folderPath])}
            dropProps={getDropProps(folderPath)}
            isDragging={draggedPaths.includes(folderPath)}
            isDropTarget={dropTarget === folderPath}
          />
        )
      })

      const fileRows = fileChildren
        .map(({ fi, displayName }) => renderFileItem(fi, displayName))
        .filter((el): el is ReactElement => el !== null)

      // Every other drop target moves items deeper. Without a target for the enclosing folder a drag
      // could never bring anything back out, so one appears for the duration of the drag — the same
      // role `..` plays in a file manager, minus a permanent row nobody asked for.
      if (currentPath && draggedPaths.length > 0) {
        const upRow = (
          <div
            key="move-up"
            className={`fm-file-item-content fm-move-up-row${dropTarget === parentOf(currentPath) ? ' fm-drop-target' : ''}`}
            {...getDropProps(parentOf(currentPath))}
          >
            <div className="fm-file-item-content-item fm-checkbox" />
            <div className="fm-file-item-content-item fm-name">
              <GetIconElement name=".." metadata={{ mime: ItemType.Folder }} />
              .. (move out of {basename(currentPath)})
            </div>
          </div>
        )

        return [upRow, ...folderRows, ...fileRows]
      }

      return [...folderRows, ...fileRows]
    },

    [
      trackDownload,
      drives,
      folders,
      view,
      selectedIds,
      onToggleSelected,
      bulkSelectedCount,
      onBulk,
      setErrorMessage,
      viewFolders,
      enterFolder,
      dragPathsFor,
      getDragProps,
      getDropProps,
      draggedPaths,
      dropTarget,
    ],
  )

  if (drives.length === 0) {
    return <div className="fm-drop-hint">Create a drive to start using the file manager</div>
  }

  if (!isSearchMode && !currentDrive) {
    return <div className="fm-drop-hint">Select a drive to upload or view its files</div>
  }

  if (!isSearchMode && view === ViewType.Expired) {
    return (
      <div className="fm-drop-hint">
        The stamp for drive &quot;{currentDrive?.name}&quot; is expired, no files can be found
      </div>
    )
  }

  const rows = renderFileList(listToRender, isSearchMode)

  if (rows.length > 0) {
    return (
      <>
        {rows}
        {isMoving && (
          <div className="fm-refresh-overlay" aria-busy="true" aria-live="polite">
            <div className="fm-refresh-content">
              <div className="fm-mini-spinner" role="status" aria-label="Moving…" />
              <span className="fm-refresh-text">Moving…</span>
            </div>
          </div>
        )}
      </>
    )
  }

  if (isLoading) {
    return (
      <div className="fm-drop-hint" aria-busy="true" aria-live="polite">
        <div className="fm-mini-spinner" role="status" aria-label="Loading…" />
      </div>
    )
  }

  if (isSearchMode) {
    return <div className="fm-drop-hint">No results found.</div>
  }

  if (view === ViewType.Trash) {
    return (
      <div className="fm-drop-hint">
        Files from &quot;{currentDrive?.name}&quot; that are trashed can be viewed here
      </div>
    )
  }

  return <div className="fm-drop-hint">Drag &amp; drop files here into &quot;{currentDrive?.name}&quot;</div>
}

// Memoize to prevent rerenders when parent FileBrowser rerenders due to upload/download progress
export const FileBrowserContent = memo(FileBrowserContentInner)

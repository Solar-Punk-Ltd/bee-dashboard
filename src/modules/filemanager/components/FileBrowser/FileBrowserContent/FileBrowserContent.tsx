import { DriveInfo, FileInfo } from '@solarpunkltd/file-manager-lib'
import { memo, ReactElement, useCallback, useState } from 'react'

import { FolderTree, ItemType, useView } from '../../../../../pages/filemanager/ViewContext'
import { DownloadProgress, TrackDownloadProps, ViewType } from '../../../constants/transfers'
import { getFileId } from '../../../utils/common'
import { FileItem } from '../FileItem/FileItem'

import FolderSubItems from './FolderSubItems'

export type FileSystemItem = {
  path: string
  ref: string
}

interface FileBrowserContentProps {
  listToRender: FileInfo[]
  drives: DriveInfo[]
  currentDrive: DriveInfo | null
  view: ViewType
  isSearchMode: boolean
  trackDownload: (props: TrackDownloadProps) => (dp: DownloadProgress) => void
  selectedIds?: Set<string>
  onToggleSelected?: (fi: FileInfo, checked: boolean) => void
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

function buildTree(items: FileSystemItem[]): FolderTree {
  const root: FolderTree = {}

  items.forEach(item => {
    const parts = item.path.split('/').filter(Boolean).slice(1)
    let current: FolderTree = root

    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          type: index === parts.length - 1 && item.path.includes('.') ? ItemType.File : ItemType.Folder,
          children: {},
          ref: index === parts.length - 1 ? item.ref : undefined,
        }
      }
      current = current[part].children
    })
  })

  return root
}

function FileBrowserContentInner({
  listToRender,
  drives,
  currentDrive,
  view,
  isSearchMode,
  trackDownload,
  selectedIds,
  onToggleSelected,
  bulkSelectedCount,
  onBulk,
  setErrorMessage,
}: FileBrowserContentProps): ReactElement {
  const { folderView, setFolderView, setCurrentTree, viewFolders, setViewFolders } = useView()

  const [folderFileItems, setFolderFileItems] = useState<FileSystemItem[] | null>(null)

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

  const handleFolderItemDoubleClick = (folderFileItems: FileSystemItem[] | null, name: string) => {
    const actualTree = buildTree(folderFileItems || [])

    setFolderView(true)
    setFolderFileItems(folderFileItems)
    setCurrentTree(actualTree)
    setViewFolders([...viewFolders, { folderName: name, tree: actualTree }])
  }

  const renderFileList = (filesToRender: FileInfo[], showDriveColumn = false): ReactElement[] | ReactElement | null => {
    if (!folderView) {
      return filesToRender
        .map(fi => {
          const drive = drives.find(d => d.id.toString() === fi.driveId.toString())

          return drive ? { fi, driveName: drive.name } : null
        })
        .filter((item): item is { fi: FileInfo; driveName: string } => item !== null)
        .map(({ fi, driveName }) => {
          const key = `${getFileId(fi)}::${fi.version ?? ''}::${showDriveColumn ? 'search' : 'normal'}`

          return (
            <FileItem
              key={key}
              fileInfo={fi}
              onDownload={trackDownload}
              showDriveColumn={showDriveColumn}
              driveName={driveName}
              selected={Boolean(selectedIds?.has(getFileId(fi)))}
              onToggleSelected={onToggleSelected}
              bulkSelectedCount={bulkSelectedCount}
              onBulk={onBulk}
              setErrorMessage={setErrorMessage}
              folderItemDoubleClick={(folderFileItems: FileSystemItem[] | null, name: string) =>
                handleFolderItemDoubleClick(folderFileItems, name)
              }
            />
          )
        })
    }

    return folderFileItems ? <FolderSubItems /> : null
  }

  if (drives.length === 0) {
    return renderEmptyState()
  }

  if (!isSearchMode) {
    if (!currentDrive) {
      return <div className="fm-drop-hint">Select a drive to upload or view its files</div>
    }

    if (view === ViewType.Expired) {
      return (
        <div className="fm-drop-hint">
          The stamp for drive &quot;{currentDrive?.name}&quot; is expired, no files can be found
        </div>
      )
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

    return <>{renderFileList(listToRender)}</>
  }

  if (listToRender.length === 0) {
    return <div className="fm-drop-hint">No results found.</div>
  }

  return <>{renderFileList(listToRender, true)}</>
}

// Memoize to prevent rerenders when parent FileBrowser rerenders due to upload/download progress
export const FileBrowserContent = memo(FileBrowserContentInner)

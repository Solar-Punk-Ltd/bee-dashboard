import { DriveInfo, FileRecord, FolderInfo } from '@solarpunkltd/file-manager-lib'
import { memo, ReactElement, useCallback } from 'react'

import { ItemType, useView } from '../../../../../pages/filemanager/ViewContext'
import { DownloadProgress, TrackDownloadProps, ViewType } from '../../../constants/transfers'
import { getFileId } from '../../../utils/common'
import { FileItem } from '../FileItem/FileItem'

import { SubItem } from './SubItem'

export type FileSystemItem = {
  path: string
  ref: string
}

interface FileBrowserContentProps {
  listToRender: FileRecord[]
  folders: FolderInfo[]
  drives: DriveInfo[]
  currentDrive: DriveInfo | null
  view: ViewType
  isSearchMode: boolean
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
  trackDownload,
  selectedIds,
  onToggleSelected,
  bulkSelectedCount,
  onBulk,
  setErrorMessage,
}: FileBrowserContentProps): ReactElement {
  const { setFolderView, viewFolders, setViewFolders } = useView()

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

  const enterFolder = useCallback(
    (folderName: string) => {
      setFolderView(true)
      setViewFolders([...viewFolders, { folderName }])
    },
    [setFolderView, setViewFolders, viewFolders],
  )

  const renderFileList = useCallback(
    (filesToRender: FileRecord[], showDriveColumn = false): ReactElement[] | ReactElement | null => {
      const renderFileItem = (fi: FileRecord, displayName?: string): ReactElement | null => {
        const drive = drives.find(d => d.id.toString() === fi.driveId.toString())

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
          />
        )
      }

      // Search results stay flat (full paths, possibly across drives).
      if (showDriveColumn) {
        return filesToRender.map(fi => renderFileItem(fi)).filter((el): el is ReactElement => el !== null)
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

      const folderRows = Array.from(folderNames).map(folderName => (
        <SubItem
          key={`folder::${prefix}${folderName}`}
          name={folderName}
          path={`${prefix}${folderName}`}
          type={ItemType.Folder}
          onDoubleClick={() => enterFolder(folderName)}
        />
      ))

      const fileRows = fileChildren
        .map(({ fi, displayName }) => renderFileItem(fi, displayName))
        .filter((el): el is ReactElement => el !== null)

      return [...folderRows, ...fileRows]
    },

    [
      trackDownload,
      drives,
      folders,
      selectedIds,
      onToggleSelected,
      bulkSelectedCount,
      onBulk,
      setErrorMessage,
      viewFolders,
      enterFolder,
    ],
  )

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

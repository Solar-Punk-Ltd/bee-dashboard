import { ReactElement, useCallback } from 'react'
import { FileItem } from '../FileItem/FileItem'
import { FileInfo, DriveInfo } from '@solarpunkltd/file-manager-lib'
import { ViewType } from '../../../constants/constants'

const defaultId = (fi: FileInfo): string =>
  fi.file?.historyRef?.toString?.() || fi.topic?.toString?.() || `${fi.driveId?.toString?.()}:${fi.name}`

interface FileBrowserContentProps {
  listToRender: FileInfo[]
  drives: DriveInfo[]
  currentDrive: DriveInfo | null
  view: ViewType
  isSearchMode: boolean
  trackDownload: (
    name: string,
    size?: string,
    expectedSize?: number,
  ) => (progress: number, isDownloading: boolean) => void
  selectedIds?: Set<string>
  onToggleSelected?: (fi: FileInfo, checked: boolean) => void
  idOf?: (fi: FileInfo) => string
  bulkSelectedCount?: number
  onBulk: {
    download?: () => void
    restore?: () => void
    forget?: () => void
    destroy?: () => void
    delete?: () => void
  }
}

export function FileBrowserContent({
  listToRender,
  drives,
  currentDrive,
  view,
  isSearchMode,
  trackDownload,
  selectedIds,
  onToggleSelected,
  idOf,
  bulkSelectedCount,
  onBulk,
}: FileBrowserContentProps): ReactElement {
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

  const defaultId = (fi: FileInfo): string =>
    fi.file?.historyRef?.toString?.() || fi.topic?.toString?.() || `${fi.driveId?.toString?.()}:${fi.name}`

  const renderFileList = useCallback(
    (filesToRender: FileInfo[], showDriveColumn = false): ReactElement[] => {
      return filesToRender.map(fi => {
        const driveName = drives.find(d => d.id.toString() === fi.driveId.toString())?.name || '-'
        const key = `${(idOf ?? defaultId)(fi)}::${fi.version ?? ''}::${showDriveColumn ? 'search' : 'normal'}`

        return (
          <FileItem
            key={key}
            fileInfo={fi}
            onDownload={trackDownload}
            showDriveColumn={showDriveColumn}
            driveName={driveName}
            selected={Boolean(selectedIds?.has((idOf ?? defaultId)(fi)))}
            onToggleSelected={onToggleSelected}
            bulkSelectedCount={bulkSelectedCount}
            onBulk={onBulk}
          />
        )
      })
    },
    [trackDownload, drives, selectedIds, onToggleSelected, idOf, bulkSelectedCount, onBulk],
  )

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

    return <>{renderFileList(listToRender)}</>
  }

  if (listToRender.length === 0) {
    return <div className="fm-drop-hint">No results found.</div>
  }

  return <>{renderFileList(listToRender, true)}</>
}

export default FileBrowserContent

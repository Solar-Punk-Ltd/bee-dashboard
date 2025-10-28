import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { ReactElement } from 'react'
import '../FileBrowser.scss'
import { ViewType } from '../../../constants/transfers'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'

interface FileBrowserContextMenuProps {
  drives: DriveInfo[]
  view: ViewType
  selectedFilesCount: number
  onRefresh: () => void
  onUploadFile: () => void
  onBulkDownload: () => void
  onBulkRestore: () => void
  onBulkDelete: () => void
  onBulkDestroy: () => void
  onBulkForget: () => void
}

export function FileBrowserContextMenu({
  drives,
  view,
  selectedFilesCount,
  onRefresh,
  onUploadFile,
  onBulkDownload,
  onBulkRestore,
  onBulkDelete,
  onBulkDestroy,
  onBulkForget,
}: FileBrowserContextMenuProps): ReactElement {
  if (drives.length === 0) {
    return (
      <ContextMenu>
        <div className="fm-context-item" onClick={onRefresh}>
          Refresh
        </div>
      </ContextMenu>
    )
  }

  if (selectedFilesCount > 1) {
    return (
      <ContextMenu>
        <div className="fm-context-item" onClick={onBulkDownload}>
          Download
        </div>
        {view === ViewType.File ? (
          <div className="fm-context-item red" onClick={onBulkDelete}>
            Delete…
          </div>
        ) : (
          <>
            <div className="fm-context-item" onClick={onBulkRestore}>
              Restore
            </div>
            <div className="fm-context-item red" onClick={onBulkDestroy}>
              Destroy
            </div>
            <div className="fm-context-item red" onClick={onBulkForget}>
              Forget permanently
            </div>
          </>
        )}
      </ContextMenu>
    )
  }

  if (view === ViewType.Trash) {
    return (
      <ContextMenu>
        <div className="fm-context-item" onClick={onRefresh}>
          Refresh
        </div>
      </ContextMenu>
    )
  }

  return (
    <ContextMenu>
      <div className="fm-context-item" style={{ display: 'none' }}>
        New folder
      </div>
      <div className="fm-context-item" onClick={onUploadFile}>
        Upload file(s)
      </div>
      <div className="fm-context-item" style={{ display: 'none' }}>
        Upload folder
      </div>
      <div className="fm-context-item-border" />
      <div
        className="fm-context-item"
        role="menuitem"
        aria-disabled="true"
        tabIndex={-1}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <span>Paste</span>
        <span
          className="fm-info fm-info--inline"
          data-tip="Tip: Use ⌘V / Ctrl+V or Browser → Edit → Paste."
          aria-label="Paste help"
        >
          i
        </span>
      </div>
      <div className="fm-context-item-border" />
      <div className="fm-context-item" onClick={onRefresh}>
        Refresh
      </div>
    </ContextMenu>
  )
}

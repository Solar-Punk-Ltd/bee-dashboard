import { ReactElement } from 'react'
import './FileBrowserTopBar.scss'
import { useView } from '../../../../../pages/filemanager/ViewContext'
import { ViewType } from '../../../constants/transfers'

type Props = {
  onOpenMenu?: (anchorEl: HTMLElement) => void
  canOpen?: boolean
}

export function FileBrowserTopBar({ onOpenMenu, canOpen = true }: Props): ReactElement {
  const { view, viewFolders, setViewFolders, actualItemView, folderView, setFolderView, currentTree, setCurrentTree } =
    useView()

  const viewText = view === ViewType.Trash ? ' Trash' : ''
  const handleItemClick = (type: string, name?: { folderName: string; tree: any }, index?: number) => {
    if (type === 'drive') {
      setFolderView(false)
      setViewFolders([])
    }

    if (type === 'folder' && folderView) {
      if (index !== undefined && index !== -1) {
        const newFolders = viewFolders.slice(0, index + 1)

        if (JSON.stringify(viewFolders) !== JSON.stringify(newFolders)) {
          setViewFolders(newFolders)
        }

        if (currentTree !== newFolders[newFolders.length - 1].tree) {
          setCurrentTree(newFolders[newFolders.length - 1].tree)
        }
      }
    }
  }

  return (
    <div className="fm-file-browser-top-bar">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div className="fm-file-browser-top-bar__title">
          <div onClick={() => handleItemClick('drive')} className="fm-file-browser-top-bar-item">
            {actualItemView}
            {viewText}
          </div>
        </div>
        {viewFolders.length > 0 &&
          viewFolders.map((folder, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
              /{' '}
              <div onClick={() => handleItemClick('folder', folder, index)} className="fm-file-browser-top-bar-item">
                {folder.folderName}
              </div>
            </div>
          ))}
      </div>
      {canOpen && (
        <button
          type="button"
          className="fm-topbar-kebab"
          aria-haspopup="menu"
          aria-label="More actions"
          onClick={e => onOpenMenu?.(e.currentTarget)}
        >
          ⋯
        </button>
      )}
    </div>
  )
}

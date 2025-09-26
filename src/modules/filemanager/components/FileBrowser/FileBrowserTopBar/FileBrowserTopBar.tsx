import { ReactElement } from 'react'
import './FileBrowserTopBar.scss'
import { useView } from '../../../providers/FMFileViewContext'
import { set } from 'bignumber.js'

export function FileBrowserTopBar(): ReactElement {
  const { viewFolders, setViewFolders, actualItemView, folderView, setFolderView } = useView()

  const handleItemClick = (type: string) => {
    if (type === 'drive') {
      setFolderView(false)
      setViewFolders([])
    }
  }

  return (
    <div className="fm-file-browser-top-bar">
      <div onClick={() => handleItemClick('drive')} className="fm-file-browser-top-bar-item">
        {actualItemView}
      </div>
      {viewFolders.length > 0 &&
        viewFolders.map((folder, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
            /{' '}
            <div onClick={() => handleItemClick('folder')} className="fm-file-browser-top-bar-item">
              {folder}
            </div>
          </div>
        ))}
    </div>
  )
}

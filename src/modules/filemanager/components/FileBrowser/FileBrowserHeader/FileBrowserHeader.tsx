import { ReactElement } from 'react'
import DownIcon from 'remixicon-react/ArrowDownSLineIcon'

interface FileBrowserHeaderProps {
  isSearchMode: boolean
}

export function FileBrowserHeader({ isSearchMode }: FileBrowserHeaderProps): ReactElement {
  return (
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
  )
}

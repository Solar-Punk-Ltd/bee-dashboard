import { ReactElement } from 'react'
import DownIcon from 'remixicon-react/ArrowDownSLineIcon'
import { useFMBulkActions } from '../../../hooks/useFMBulkActions'

interface FileBrowserHeaderProps {
  isSearchMode: boolean
  bulk: ReturnType<typeof useFMBulkActions>
}

export function FileBrowserHeader({ isSearchMode, bulk }: FileBrowserHeaderProps): ReactElement {
  return (
    <div className="fm-file-browser-content-header">
      <input
        type="checkbox"
        checked={bulk.allChecked}
        ref={el => {
          if (el) el.indeterminate = bulk.someChecked
        }}
        onChange={e => {
          if (e.target.checked) bulk.selectAll()
          else bulk.clearAll()
        }}
      />
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

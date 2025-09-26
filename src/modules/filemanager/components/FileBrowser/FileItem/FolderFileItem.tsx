import { ReactElement } from 'react'
import './FileItem.scss'
import { GetIconElement } from '../../../utils/GetIconElement'

interface FolderFileItemProps {
  fileName: string
}

export function FolderFileItem({ fileName }: FolderFileItemProps): ReactElement {
  return (
    <div className="fm-file-item-content">
      <div className="fm-file-item-content-item fm-checkbox">
        <input type="checkbox" checked={false} onClick={e => e.stopPropagation()} />
      </div>
      <div className="fm-file-item-content-item fm-name">
        <GetIconElement name={fileName} />
        {fileName}
      </div>
    </div>
  )
}

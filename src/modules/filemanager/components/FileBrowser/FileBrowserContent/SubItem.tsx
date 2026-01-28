import { ReactElement } from 'react'
import { GetIconElement } from '../../../utils/GetIconElement'
import { ItemType } from '../../../../../pages/filemanager/ViewContext'

interface SubItemProps {
  name: string
  type: ItemType
  onDoubleClick?: () => void
}
export function SubItem({ name, type, onDoubleClick }: SubItemProps): ReactElement {
  const displayName = name.endsWith('/') ? name.split('/').filter(Boolean).pop() : name.split('/').pop()

  return (
    <div className="fm-file-item-content" onDoubleClick={onDoubleClick}>
      <div className="fm-file-item-content-item fm-checkbox">
        <input type="checkbox" checked={false} onClick={e => e.stopPropagation()} />
      </div>
      <div className="fm-file-item-content-item fm-name">
        <GetIconElement icon={type} />
        {displayName}
      </div>
    </div>
  )
}

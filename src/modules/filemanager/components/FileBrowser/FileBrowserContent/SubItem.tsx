import { ReactElement, useContext } from 'react'
import { GetIconElement } from '../../../utils/GetIconElement'
import { Context as SettingsContext } from '../../../../../providers/Settings'
import { Bee } from '@ethersphere/bee-js'

interface SubItemProps {
  name: string
  reference: string
  type: 'file' | 'folder'
  onDoubleClick?: () => void // Opcionális dupla kattintás esemény
}

export function SubItem({ name, reference, type, onDoubleClick }: SubItemProps): ReactElement {
  const displayName = name.endsWith('/') ? name.split('/').filter(Boolean).pop() : name.split('/').pop()
  const { beeApi } = useContext(SettingsContext)

  if (beeApi === null) {
    return <div>Loading...</div>
  }

  return (
    <div className="fm-file-item-content" onDoubleClick={onDoubleClick}>
      <div className="fm-file-item-content-item fm-checkbox">
        <input type="checkbox" checked={false} onClick={e => e.stopPropagation()} />
      </div>
      <div className="fm-file-item-content-item fm-name">
        <GetIconElement type={type} />
        {displayName}
      </div>
    </div>
  )
}

import { ReactElement } from 'react'
import ImageIcon from 'remixicon-react/Image2LineIcon'
import FileIcon from 'remixicon-react/FileTextLineIcon'
import FolderIcon from 'remixicon-react/Folder3LineIcon'

interface ContextMenuProps {
  icon: string
  size?: string
  color?: string
}

export function GetIconElement({ icon, size = '21px', color = '#ed8131' }: ContextMenuProps): ReactElement {
  switch (icon) {
    case 'image':
      return <ImageIcon size={size} color={color} />
    case 'folder':
      return <FolderIcon size={size} color={color} />
    default:
      return <FileIcon size={size} color={color} />
  }
}

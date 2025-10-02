import { ReactElement } from 'react'
import ImageIcon from 'remixicon-react/Image2LineIcon'
import FileIcon from 'remixicon-react/FileTextLineIcon'
import FolderIcon from 'remixicon-react/Folder3LineIcon'

interface ContextMenuProps {
  type?: string
  size?: string
  color?: string
  name?: string
}

export function GetIconElement({ type, size = '21px', color = '#ed8131', name }: ContextMenuProps): ReactElement {
  if (type) {
    switch (type) {
      case 'image':
        return <ImageIcon size={size} color={color} />
      case 'folder':
        return <FolderIcon size={size} color={color} />
      default:
        return <FileIcon size={size} color={color} />
    }
  }

  if (name) {
    const extension = name.split('.').pop()?.toLowerCase()

    if (extension) {
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff']

      if (imageExtensions.includes(extension)) {
        return <ImageIcon size={size} color={color} />
      } else if (extension === 'folder') {
        return <FolderIcon size={size} color={color} />
      } else {
        return <FileIcon size={size} color={color} />
      }
    }
  }

  return <FileIcon size={size} color={color} />
}

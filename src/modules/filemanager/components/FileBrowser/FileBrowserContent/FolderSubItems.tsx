import { ReactElement } from 'react'
import { SubItem } from './SubItem'

interface FolderSubItemsProps {
  items: { path: string; ref: string }[]
}

export function FolderSubItems({ items }: FolderSubItemsProps): ReactElement {
  const directItems = items.filter(item => {
    const pathParts = item.path.split('/').filter(Boolean)

    return pathParts.length === 2
  })

  return (
    <>
      {directItems.map((item, index) => {
        const isFile = item.path.includes('.') && !item.path.endsWith('/')
        const isFolder = !isFile

        return isFolder ? (
          <SubItem key={`${item.path}-${index}`} name={item.path} reference={item.ref} type="folder" />
        ) : (
          <SubItem key={`${item.path}-${index}`} name={item.path} reference={item.ref} type="file" />
        )
      })}
    </>
  )
}

export default FolderSubItems

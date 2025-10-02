import { ReactElement, useState } from 'react'
import { SubItem } from './SubItem'
import { useView } from 'src/pages/filemanager/ViewContext'

interface FolderSubItemsProps {
  tree: any
}

export function FolderSubItems({ tree }: FolderSubItemsProps): ReactElement {
  const { viewFolders, setViewFolders, currentTree, setCurrentTree } = useView()

  const handleFolderDoubleClick = (path: string) => {
    let currentNode = currentTree

    if (currentNode[path]) {
      currentNode = currentNode[path].children
      setCurrentTree(currentNode)
    } else {
      setCurrentTree({})
    }

    setViewFolders([...viewFolders, { folderName: path, tree: currentNode }])
  }

  return (
    <>
      {currentTree &&
        Object.entries(currentTree).map(([name, value]: [string, any]) => {
          const currentPath = `${name}`

          if (value.type === 'folder') {
            return (
              <SubItem
                key={currentPath}
                name={currentPath}
                reference={value.ref}
                type="folder"
                onDoubleClick={() => handleFolderDoubleClick(currentPath)}
              />
            )
          } else {
            return <SubItem key={currentPath} name={currentPath} reference={value.ref} type="file" />
          }
        })}
    </>
  )
}

export default FolderSubItems

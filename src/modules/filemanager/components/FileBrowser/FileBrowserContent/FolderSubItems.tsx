import { ReactElement } from 'react'

import { ItemType, TreeNode, useView } from '../../../../../pages/filemanager/ViewContext'

import { SubItem } from './SubItem'

export function FolderSubItems(): ReactElement {
  const { viewFolders, setViewFolders, currentTree, setCurrentTree } = useView()

  const handleFolderDoubleClick = (path: string) => {
    let currentNode = currentTree

    if (currentNode && currentNode[path]) {
      currentNode = currentNode[path].children
      setCurrentTree(currentNode)
    } else {
      setCurrentTree({})
    }

    setViewFolders([...viewFolders, { folderName: path, tree: currentNode || {} }])
  }

  return (
    <>
      {currentTree &&
        Object.entries(currentTree).map(([name, value]: [string, TreeNode]) => {
          const currentPath = `${name}`

          if (value.type === ItemType.Folder) {
            return (
              <SubItem
                key={currentPath}
                name={currentPath}
                type={ItemType.Folder}
                onDoubleClick={() => handleFolderDoubleClick(currentPath)}
              />
            )
          } else {
            return <SubItem key={currentPath} name={currentPath} type={ItemType.File} />
          }
        })}
    </>
  )
}

export default FolderSubItems

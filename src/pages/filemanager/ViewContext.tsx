import { createContext, ReactNode, useContext, useState } from 'react'

import { ViewType } from '../../modules/filemanager/constants/transfers'

export enum ItemType {
  File = 'file',
  Folder = 'directory',
}

export interface TreeNode {
  type: ItemType
  children: { [key: string]: TreeNode }
  ref?: string
}

export type FolderTree = { [key: string]: TreeNode }

interface ViewContextProps {
  view: ViewType
  setView: (view: ViewType) => void
  actualItemView?: string
  setActualItemView?: (view: string) => void
  viewFolders: { folderName: string; tree: FolderTree }[]
  setViewFolders: (folders: { folderName: string; tree: FolderTree }[]) => void
  folderView: boolean
  setFolderView: (folderView: boolean) => void
  currentTree: FolderTree | null
  setCurrentTree: (tree: FolderTree | null) => void
}

const ViewContext = createContext<ViewContextProps | undefined>(undefined)

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewType>(ViewType.File)
  const [viewFolders, setViewFolders] = useState<{ folderName: string; tree: FolderTree }[]>([])
  const [actualItemView, setActualItemView] = useState<string | undefined>(undefined)
  const [folderView, setFolderView] = useState<boolean>(false)
  const [currentTree, setCurrentTree] = useState<FolderTree | null>(null)

  return (
    <ViewContext.Provider
      value={{
        view,
        setView,
        actualItemView,
        setActualItemView,
        viewFolders,
        setViewFolders,
        folderView,
        setFolderView,
        currentTree,
        setCurrentTree,
      }}
    >
      {children}
    </ViewContext.Provider>
  )
}

export function useView() {
  const context = useContext(ViewContext)

  if (!context) {
    throw new Error('useView must be used within a ViewProvider')
  }

  return context
}

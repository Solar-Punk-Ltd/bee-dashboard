import { createContext, ReactNode, useContext, useState } from 'react'

import { ViewType } from '../../modules/filemanager/constants/transfers'

export enum ItemType {
  File = 'file',
  Folder = 'folder',
}

interface ViewContextProps {
  view: ViewType
  setView: (view: ViewType) => void
  actualItemView?: string
  setActualItemView?: (view: string) => void
  viewFolders: { folderName: string }[]
  setViewFolders: (folders: { folderName: string }[]) => void
  folderView: boolean
  setFolderView: (folderView: boolean) => void
}

const ViewContext = createContext<ViewContextProps | undefined>(undefined)

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewType>(ViewType.File)
  const [viewFolders, setViewFolders] = useState<{ folderName: string }[]>([])
  const [actualItemView, setActualItemView] = useState<string | undefined>(undefined)
  const [folderView, setFolderView] = useState<boolean>(false)

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

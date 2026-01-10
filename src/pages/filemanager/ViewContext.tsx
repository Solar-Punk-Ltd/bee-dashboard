import { createContext, useContext, useState, ReactNode } from 'react'
import { ViewType } from '../../modules/filemanager/constants/transfers'

interface ViewContextProps {
  view: ViewType
  setView: (view: ViewType) => void
  actualItemView?: string
  setActualItemView?: (view: string) => void
  viewFolders: { folderName: string; tree: any }[]
  setViewFolders: (folders: { folderName: string; tree: any }[]) => void
  folderView: boolean
  setFolderView: (folderView: boolean) => void
  currentTree: any
  setCurrentTree: (tree: any) => void
}

const ViewContext = createContext<ViewContextProps | undefined>(undefined)

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewType>(ViewType.File)
  const [viewFolders, setViewFolders] = useState<{ folderName: string; tree: any }[]>([])
  const [actualItemView, setActualItemView] = useState<string | undefined>(undefined)
  const [folderView, setFolderView] = useState<boolean>(false)
  const [currentTree, setCurrentTree] = useState<any>(null)

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

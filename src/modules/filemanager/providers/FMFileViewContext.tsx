import { createContext, useContext, useState, ReactNode } from 'react'
import { ViewType } from '../constants/fileTransfer'

interface ViewContextProps {
  view: ViewType
  setView: (view: ViewType) => void

  viewFolders: { folderName: string; tree: any }[]
  setViewFolders: (folders: { folderName: string; tree: any }[]) => void
  actualItemView?: string
  setActualItemView?: (view: string) => void
  folderView: boolean
  setFolderView: (folderView: boolean) => void
  currentTree: any
  setCurrentTree: (tree: any) => void
}

const FMFileViewContext = createContext<ViewContextProps | undefined>(undefined)

export function FMFileViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewType>(ViewType.File)
  const [viewFolders, setViewFolders] = useState<{ folderName: string; tree: any }[]>([])
  const [actualItemView, setActualItemView] = useState<string | undefined>(undefined)
  const [folderView, setFolderView] = useState<boolean>(false)
  const [currentTree, setCurrentTree] = useState<any>(null)

  return (
    <FMFileViewContext.Provider
      value={{
        view,
        setView,
        viewFolders,
        setViewFolders,
        actualItemView,
        setActualItemView,
        folderView,
        setFolderView,
        currentTree,
        setCurrentTree,
      }}
    >
      {children}
    </FMFileViewContext.Provider>
  )
}

export function useView() {
  const context = useContext(FMFileViewContext)

  if (!context) {
    throw new Error('useView must be used within a FMFileViewProvider')
  }

  return context
}

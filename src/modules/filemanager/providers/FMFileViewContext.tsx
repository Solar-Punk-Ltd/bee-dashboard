import { createContext, useContext, useState, ReactNode } from 'react'
import { ViewType } from '../constants/constants'

interface ViewContextProps {
  view: ViewType
  setView: (view: ViewType) => void
  viewFolders: string[]
  setViewFolders: (folders: string[]) => void
  actualItemView?: string
  setActualItemView?: (view: string) => void
  folderView: boolean
  setFolderView: (folderView: boolean) => void
}

const FMFileViewContext = createContext<ViewContextProps | undefined>(undefined)

export function FMFileViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewType>(ViewType.File)
  const [viewFolders, setViewFolders] = useState<string[]>([])
  const [actualItemView, setActualItemView] = useState<string | undefined>(undefined)
  const [folderView, setFolderView] = useState<boolean>(false)

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

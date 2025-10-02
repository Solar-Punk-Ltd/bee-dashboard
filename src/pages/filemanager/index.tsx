import { ReactElement, useContext, useEffect, useState } from 'react'
import './FileManager.scss'
import { SearchProvider } from './SearchContext'
import { ViewProvider } from './ViewContext'
import { Header } from '../../modules/filemanager/components/Header/Header'
import { Sidebar } from '../../modules/filemanager/components/Sidebar/Sidebar'
import { AdminStatusBar } from '../../modules/filemanager/components/AdminStatusBar/AdminStatusBar'
import { FileBrowser } from '../../modules/filemanager/components/FileBrowser/FileBrowser'
import { InitialModal } from '../../modules/filemanager/components/InitialModal/InitialModal'
import { Context as FMContext } from '../../providers/FileManager'

export function FileManagerPage(): ReactElement {
  const [showInitialModal, setShowInitialModal] = useState(false)
  const { fm, adminDrive, initializationError, adminStamp, getStoredState } = useContext(FMContext)

  useEffect(() => {
    if (!fm) {
      const storedState = getStoredState()
      setShowInitialModal(!storedState)
    }
  }, [fm, getStoredState])

  useEffect(() => {
    if (fm) setShowInitialModal(false)
  }, [fm])

  if (initializationError) {
    return (
      <div className="fm-main">
        <div className="fm-loading">
          <div className="fm-loading-title">Failed to initialize File Manager</div>
        </div>
      </div>
    )
  }

  if (showInitialModal) {
    return (
      <div className="fm-main">
        <InitialModal handleVisibility={(isVisible: boolean) => setShowInitialModal(isVisible)} />
      </div>
    )
  }

  if (!fm) {
    return (
      <div className="fm-main">
        <div className="fm-loading" aria-live="polite">
          <div className="fm-spinner" aria-hidden="true" />
          <div className="fm-loading-title">File manager loading…</div>
          <div className="fm-loading-subtitle">Please wait a few seconds</div>
        </div>
      </div>
    )
  }

  return (
    <SearchProvider>
      <ViewProvider>
        <div className="fm-main">
          <Header />
          <div className="fm-main-content">
            <Sidebar />
            <FileBrowser />
          </div>
          <AdminStatusBar adminStamp={adminStamp} adminDrive={adminDrive} loading={!adminStamp || !adminDrive} />
        </div>
      </ViewProvider>
    </SearchProvider>
  )
}

import { ReactElement, useContext, useEffect, useState } from 'react'
import './FileManager.scss'
import { SearchProvider } from './SearchContext'
import { ViewProvider } from './ViewContext'
import { Header } from '../../modules/filemanager/components/Header/Header'
import { Sidebar } from '../../modules/filemanager/components/Sidebar/Sidebar'
import { AdminStatusBar } from '../../modules/filemanager/components/AdminStatusBar/AdminStatusBar'
import { FileBrowser } from '../../modules/filemanager/components/FileBrowser/FileBrowser'
import { InitialModal } from '../../modules/filemanager/components/InitialModal/InitialModal'
import { Context as FMContext, getSignerPk } from '../../providers/FileManager'
import { PrivateKeyModal } from '../../modules/filemanager/components/PrivateKeyModal/PrivateKeyModal'

export function FileManagerPage(): ReactElement {
  const [showInitialModal, setShowInitialModal] = useState(false)
  const [hasPk, setHasPk] = useState<boolean>(getSignerPk() !== undefined)
  const { fm, adminDrive, initializationError, adminStamp, getStoredState, init } = useContext(FMContext)

  useEffect(() => {
    if (!hasPk || fm) return
    const storedState = getStoredState()
    setShowInitialModal(!storedState?.adminBatchId)
  }, [hasPk, fm, getStoredState])

  useEffect(() => {
    if (!hasPk) return

    if (fm) setShowInitialModal(false)
  }, [hasPk, fm])

  if (!hasPk) {
    return (
      <div className="fm-main">
        <PrivateKeyModal
          onSaved={async () => {
            setHasPk(true)

            const stored = getStoredState()
            const batchId = stored?.adminBatchId

            setShowInitialModal(!batchId)

            if (batchId) {
              await init(batchId)
            }
          }}
        />
      </div>
    )
  }

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

import { ReactElement, useContext, useState } from 'react'
import './FileManager.scss'
import { SearchProvider } from './SearchContext'
import { ViewProvider } from './ViewContext'
import { Header } from '../../modules/filemanager/components/Header/Header'
import { Sidebar } from '../../modules/filemanager/components/Sidebar/Sidebar'
import { AdminStatusBar } from '../../modules/filemanager/components/AdminStatusBar/AdminStatusBar'
import { FileBrowser } from '../../modules/filemanager/components/FileBrowser/FileBrowser'
import { InitialModal } from '../../modules/filemanager/components/InitialModal/InitialModal'
import { Context as FMContext } from '../../providers/FileManager'
import { PrivateKeyModal } from '../../modules/filemanager/components/PrivateKeyModal/PrivateKeyModal'
import { getSignerPk } from '../../../src/modules/filemanager/utils/common'

export function FileManagerPage(): ReactElement {
  const [showInitialModal, setShowInitialModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasPk, setHasPk] = useState<boolean>(getSignerPk() !== undefined)
  const { fm, adminDrive, initializationError, init } = useContext(FMContext)

  // TODO: handle if fm is already set but not pk is set

  if (!hasPk) {
    return (
      <div className="fm-main">
        <PrivateKeyModal
          onSaved={async () => {
            setHasPk(true)

            if (fm) {
              setIsLoading(false)

              return
            }

            const manager = await init()
            setIsLoading(false)

            setShowInitialModal(!manager?.adminStamp)
          }}
        />
      </div>
    )
  }

  if (initializationError && !isLoading) {
    return (
      <div className="fm-main">
        <div className="fm-loading">
          <div className="fm-loading-title">Failed to initialize File Manager</div>
        </div>
      </div>
    )
  }

  if (showInitialModal && !isLoading) {
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
          <AdminStatusBar
            adminStamp={fm.adminStamp || null}
            adminDrive={adminDrive}
            loading={!fm.adminStamp || !adminDrive}
          />
        </div>
      </ViewProvider>
    </SearchProvider>
  )
}

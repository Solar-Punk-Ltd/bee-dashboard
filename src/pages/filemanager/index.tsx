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
import { PrivateKeyModal } from '../../modules/filemanager/components/PrivateKeyModal/PrivateKeyModal'
import { getSignerPk } from '../../../src/modules/filemanager/utils/common'
import { ErrorModal } from '../../../src/modules/filemanager/components/ErrorModal/ErrorModal'

export function FileManagerPage(): ReactElement {
  const [showInitialModal, setShowInitialModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdminDrive, setIsAdminDrive] = useState(false)
  const [hasPk, setHasPk] = useState<boolean>(getSignerPk() !== undefined)
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

  const { fm, adminDrive, initializationError, init } = useContext(FMContext)

  useEffect(() => {
    if (!hasPk) {
      setIsLoading(false)

      return
    }

    if (initializationError) {
      setIsLoading(false)

      return
    }

    if (fm) {
      const hasAdminStamp = Boolean(fm.adminStamp)
      setIsAdminDrive(hasAdminStamp)
      setIsLoading(false)
      setShowInitialModal(!hasAdminStamp)

      return
    }

    setIsLoading(true)
  }, [fm, hasPk, initializationError])

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

            setIsLoading(true)
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

  if (showInitialModal && !isLoading && !isAdminDrive) {
    return (
      <div className="fm-main">
        <InitialModal
          handleVisibility={(isVisible: boolean) => setShowInitialModal(isVisible)}
          handleShowError={(flag: boolean) => setShowErrorModal(flag)}
        />
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

  const loading = !fm.adminStamp || !adminDrive

  return showErrorModal ? (
    <ErrorModal label={'Error during admin stamp creation, try again'} onClick={() => setShowInitialModal(true)} />
  ) : (
    <SearchProvider>
      <ViewProvider>
        <div className="fm-main">
          <Header />
          <div className="fm-main-content">
            <Sidebar errorMessage={errorMessage} setErrorMessage={setErrorMessage} loading={loading} />
            <FileBrowser errorMessage={errorMessage} setErrorMessage={setErrorMessage} />
          </div>
          <AdminStatusBar
            adminStamp={fm.adminStamp || null}
            adminDrive={adminDrive}
            loading={loading}
            setErrorMessage={setErrorMessage}
          />
        </div>
      </ViewProvider>
    </SearchProvider>
  )
}

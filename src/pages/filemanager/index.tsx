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
import { ConfirmModal } from '../../modules/filemanager/components/ConfirmModal/ConfirmModal'

export function FileManagerPage(): ReactElement {
  const [showInitialModal, setShowInitialModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasAdminDrive, setHasAdminDrive] = useState(false)
  const [hasPk, setHasPk] = useState<boolean>(getSignerPk() !== undefined)
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

  const [showResetModal, setShowResetModal] = useState<boolean>(false)

  const { fm, shallReset, adminDrive, initializationError, init } = useContext(FMContext)

  useEffect(() => {
    if (shallReset) {
      setShowInitialModal(true)
      setShowResetModal(true)

      return
    }

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
      const tmpHasAdminDrive = Boolean(adminDrive)
      setHasAdminDrive(hasAdminStamp || tmpHasAdminDrive)
      setIsLoading(false)
      setShowInitialModal(!(hasAdminStamp || tmpHasAdminDrive))

      return
    }

    setIsLoading(true)
  }, [fm, hasPk, initializationError, adminDrive, shallReset])

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

            const hasAdminStamp = Boolean(manager?.adminStamp)
            const hasAdminDrive = Boolean(adminDrive)
            setShowInitialModal(!(hasAdminStamp || hasAdminDrive))
          }}
        />
      </div>
    )
  }

  if (initializationError && !isLoading && !shallReset) {
    return (
      <div className="fm-main">
        <div className="fm-loading">
          <div className="fm-loading-title">Failed to initialize File Manager</div>
        </div>
      </div>
    )
  }

  if (showResetModal) {
    return (
      <ConfirmModal
        title="Reset File Manager State"
        message="Your File Manager state appears invalid. Please reset it to continue."
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowResetModal(false)
        }}
        onCancel={() => setShowResetModal(false)}
      />
    )
  }

  if ((showInitialModal && !isLoading && !hasAdminDrive) || (shallReset && fm)) {
    return (
      <div className="fm-main">
        <InitialModal
          resetState={false}
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

import { DriveInfo, FileManagerBase } from '@solarpunkltd/file-manager-lib'
import { ReactElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { SearchProvider } from './SearchContext'
import { ViewProvider } from './ViewContext'

import './FileManager.scss'

import { AdminStatusBar } from '@/modules/filemanager/components/AdminStatusBar/AdminStatusBar'
import { Button } from '@/modules/filemanager/components/Button/Button'
import { ConfirmModal } from '@/modules/filemanager/components/ConfirmModal/ConfirmModal'
import { ErrorModal } from '@/modules/filemanager/components/ErrorModal/ErrorModal'
import { FileBrowser } from '@/modules/filemanager/components/FileBrowser/FileBrowser'
import { FormbricksIntegration } from '@/modules/filemanager/components/FormbricksIntegration/FormbricksIntegration'
import { Header } from '@/modules/filemanager/components/Header/Header'
import { InitialModal } from '@/modules/filemanager/components/InitialModal/InitialModal'
import { PrivateKeyModal } from '@/modules/filemanager/components/PrivateKeyModal/PrivateKeyModal'
import { Sidebar } from '@/modules/filemanager/components/Sidebar/Sidebar'
import { getSignerPk, removeSignerPk } from '@/modules/filemanager/utils/common'
import { CheckState, Context as BeeContext } from '@/providers/Bee'
import { Context as FMContext } from '@/providers/FileManager'
import { BrowserPlatform, cacheClearUrls, detectBrowser } from '@/providers/Platform'
import { Context as SettingsContext } from '@/providers/Settings'

function PrivateKeyModalBlock({ onSaved }: { onSaved: () => void }) {
  return (
    <div className="fm-main">
      <PrivateKeyModal onSaved={onSaved} />
    </div>
  )
}

function InitializationErrorBlock({ onOk }: { onOk: () => void }) {
  return (
    <div className="fm-main">
      <div className="fm-loading">
        <div className="fm-loading-title">Failed to initialize File Manager, reload and try again </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <div style={{ minWidth: '120px' }}>
            <Button label={'OK'} variant="primary" disabled={false} onClick={onOk} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ResetModalBlock({ cacheHelpUrl, onConfirm }: { cacheHelpUrl: string; onConfirm: () => void }) {
  return (
    <div className="fm-main">
      <ConfirmModal
        title="Reset File Manager State"
        message={
          <span>
            Your File Manager state appears invalid. Please{' '}
            <a
              href={cacheHelpUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline', textDecoration: 'underline' }}
            >
              clear the browser cache
            </a>{' '}
            and reload the page. Then you can reset the File Manager to continue.
          </span>
        }
        confirmLabel="Continue"
        onConfirm={onConfirm}
        background={false}
      />
    </div>
  )
}

function InitialModalBlock(props: {
  resetState: boolean
  handleVisibility: (isVisible: boolean) => void
  handleShowError: (flag: boolean, error?: string) => void
  setIsCreationInProgress: (isCreating: boolean) => void
}) {
  return (
    <div className="fm-main">
      <InitialModal {...props} />
    </div>
  )
}

function LoadingBlock() {
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

function ErrorModalBlock({ onClick, label }: { onClick: () => void; label: string }) {
  return <ErrorModal label={label} onClick={onClick} />
}

function handleInitialModalError(
  setShowErrorModal: (v: boolean) => void,
  setErrorMessage: (msg: string) => void,
  flag: boolean,
  error?: string,
) {
  setShowErrorModal(flag)

  if (error) setErrorMessage(error)
}

function isBeeNodeReady(status: {
  all: CheckState
  apiConnection: { isEnabled: boolean; checkState: CheckState }
  topology: { isEnabled: boolean; checkState: CheckState }
}) {
  if (!status.apiConnection.isEnabled) return false

  if (status.all === CheckState.CONNECTING || status.all === CheckState.STARTING) return false

  const isReady =
    status.apiConnection.checkState === CheckState.OK || status.apiConnection.checkState === CheckState.WARNING

  return isReady
}

function FileManagerMainContent(props: {
  fm: FileManagerBase | null
  showConnectionError: boolean
  setShowConnectionError: (v: boolean) => void
  isFormbricksActive: boolean
  errorMessage: string
  setErrorMessage: (msg: string) => void
  loading: boolean
  adminDrive: DriveInfo | null
  isCreationInProgress: boolean
}) {
  const {
    fm,
    showConnectionError,
    setShowConnectionError,
    isFormbricksActive,
    errorMessage,
    setErrorMessage,
    loading,
    adminDrive,
    isCreationInProgress,
  } = props

  return (
    <SearchProvider>
      <ViewProvider>
        <div className="fm-main">
          {showConnectionError && fm && (
            <ErrorModal
              label="Bee node connection error. Please check your node status. File Manager will continue when connection is restored."
              onClick={() => setShowConnectionError(false)}
            />
          )}
          <FormbricksIntegration isActive={isFormbricksActive} />
          <Header />
          <div className="fm-main-content">
            <Sidebar errorMessage={errorMessage} setErrorMessage={setErrorMessage} loading={loading} />
            <FileBrowser errorMessage={errorMessage} setErrorMessage={setErrorMessage} />
          </div>
          <AdminStatusBar
            adminStamp={fm?.adminStamp || null}
            adminDrive={adminDrive}
            loading={loading}
            isCreationInProgress={isCreationInProgress}
            setErrorMessage={setErrorMessage}
          />
        </div>
      </ViewProvider>
    </SearchProvider>
  )
}

function renderInterimFileManagerContent(props: {
  shouldShowPreLoading: boolean
  shouldShowInitializationError: boolean
  shouldShowResetModal: boolean
  shouldShowInitialModal: boolean
  shouldShowLoadingWithoutFm: boolean
  shouldShowErrorModal: boolean
  cacheHelpUrl: string
  setShowResetModal: (v: boolean) => void
  shallReset: boolean
  setShowInitialModal: (v: boolean) => void
  setShowErrorModal: (v: boolean) => void
  setErrorMessage: (msg: string) => void
  setIsCreationInProgress: (isCreating: boolean) => void
  setHasPk: (v: boolean) => void
}): ReactElement | null {
  const {
    shouldShowPreLoading,
    shouldShowInitializationError,
    shouldShowResetModal,
    shouldShowInitialModal,
    shouldShowLoadingWithoutFm,
    shouldShowErrorModal,
    cacheHelpUrl,
    setShowResetModal,
    shallReset,
    setShowInitialModal,
    setShowErrorModal,
    setErrorMessage,
    setIsCreationInProgress,
    setHasPk,
  } = props

  if (shouldShowPreLoading) {
    return <LoadingBlock />
  }

  if (shouldShowInitializationError) {
    return (
      <InitializationErrorBlock
        onOk={() => {
          removeSignerPk()
          setHasPk(false)
        }}
      />
    )
  }

  if (shouldShowResetModal) {
    return <ResetModalBlock cacheHelpUrl={cacheHelpUrl} onConfirm={() => setShowResetModal(false)} />
  }

  if (shouldShowInitialModal) {
    return (
      <InitialModalBlock
        resetState={shallReset}
        handleVisibility={(isVisible: boolean) => setShowInitialModal(isVisible)}
        handleShowError={(flag: boolean, error?: string) =>
          handleInitialModalError(setShowErrorModal, setErrorMessage, flag, error)
        }
        setIsCreationInProgress={(isCreating: boolean) => {
          setIsCreationInProgress(isCreating)
        }}
      />
    )
  }

  if (shouldShowLoadingWithoutFm) {
    return <LoadingBlock />
  }

  if (shouldShowErrorModal) {
    return (
      <ErrorModalBlock
        label={
          'Error creating Admin Drive. Please try again. Possible causes include insufficient xDAI balance or a lost connection to the RPC.'
        }
        onClick={() => {
          setShowErrorModal(false)
          setShowInitialModal(true)
          setErrorMessage('')
        }}
      />
    )
  }

  return null
}

// eslint-disable-next-line complexity
function renderFileManagerPageContent(props: {
  isNodeReady: boolean
  isPostSyncGracePeriod: boolean
  initializationError: boolean
  isLoading: boolean
  shallReset: boolean
  hasTriedResetRecovery: boolean
  setHasPk: (v: boolean) => void
  showResetModal: boolean
  stampApiAvailable: boolean
  cacheHelpUrl: string
  setShowResetModal: (v: boolean) => void
  fm: FileManagerBase | null
  adminDrive: DriveInfo | null
  showErrorModal: boolean
  isEmptyState: boolean
  setShowInitialModal: (v: boolean) => void
  setShowErrorModal: (v: boolean) => void
  setErrorMessage: (msg: string) => void
  isFormbricksActive: boolean
  showConnectionError: boolean
  setShowConnectionError: (v: boolean) => void
  errorMessage: string
  loading: boolean
  isCreationInProgress: boolean
  setIsCreationInProgress: (isCreating: boolean) => void
}): ReactElement {
  const {
    isNodeReady,
    isPostSyncGracePeriod,
    initializationError,
    isLoading,
    shallReset,
    hasTriedResetRecovery,
    setHasPk,
    showResetModal,
    stampApiAvailable,
    cacheHelpUrl,
    setShowResetModal,
    fm,
    adminDrive,
    showErrorModal,
    isEmptyState,
    setShowInitialModal,
    setShowErrorModal,
    setErrorMessage,
    isFormbricksActive,
    showConnectionError,
    setShowConnectionError,
    errorMessage,
    loading,
    isCreationInProgress,
    setIsCreationInProgress,
  } = props
  const hasUsableManager = Boolean(fm?.adminStamp || adminDrive || fm?.driveList?.some(d => d.isAdmin))
  const shouldShowLoadingBeforeNodeReady = !isNodeReady
  const shouldShowInitializationError = Boolean(
    isNodeReady && !isPostSyncGracePeriod && initializationError && !isLoading && !shallReset && !hasUsableManager,
  )
  const shouldShowResetModal =
    isNodeReady &&
    !isPostSyncGracePeriod &&
    stampApiAvailable &&
    showResetModal &&
    shallReset &&
    hasTriedResetRecovery &&
    !hasUsableManager &&
    !isLoading
  const shouldShowInitialModal =
    isNodeReady && !isPostSyncGracePeriod && !showErrorModal && !showConnectionError && isEmptyState
  const shouldShowLoadingWithoutFm =
    !fm || (!hasUsableManager && (isLoading || !stampApiAvailable || (shallReset && !hasTriedResetRecovery)))
  const shouldShowErrorModal = showErrorModal

  const interimContent = renderInterimFileManagerContent({
    shouldShowPreLoading: shouldShowLoadingBeforeNodeReady || isPostSyncGracePeriod,
    shouldShowInitializationError,
    shouldShowResetModal,
    shouldShowInitialModal,
    shouldShowLoadingWithoutFm,
    shouldShowErrorModal,
    cacheHelpUrl,
    setShowResetModal,
    shallReset,
    setShowInitialModal,
    setShowErrorModal,
    setErrorMessage,
    setIsCreationInProgress,
    setHasPk,
  })

  if (interimContent) {
    return interimContent
  }

  return (
    <FileManagerMainContent
      fm={fm}
      showConnectionError={showConnectionError}
      setShowConnectionError={() => setShowConnectionError(false)}
      isFormbricksActive={isFormbricksActive}
      errorMessage={errorMessage}
      setErrorMessage={setErrorMessage}
      loading={loading}
      adminDrive={adminDrive}
      isCreationInProgress={isCreationInProgress}
    />
  )
}

export function FileManagerPage(): ReactElement {
  const isMountedRef = useRef(true)
  const wasNodeReadyRef = useRef(false)
  const [showInitialModal, setShowInitialModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasPk, setHasPk] = useState<boolean>(getSignerPk() !== undefined)
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [showResetModal, setShowResetModal] = useState<boolean>(false)
  const [hasTriedResetRecovery, setHasTriedResetRecovery] = useState<boolean>(false)
  const [isPostSyncGracePeriod, setIsPostSyncGracePeriod] = useState<boolean>(false)
  const [isCreationInProgress, setIsCreationInProgress] = useState<boolean>(false)
  const [showConnectionError, setShowConnectionError] = useState<boolean>(false)
  const [cacheHelpUrl, setCacheHelpUrl] = useState<string>(cacheClearUrls[BrowserPlatform.Chrome])

  const { status } = useContext(BeeContext)
  const { beeApi } = useContext(SettingsContext)
  const { fm, shallReset, adminDrive, stampApiAvailable, initializationError, init, syncDrives } = useContext(FMContext)

  const isNodeReady = useMemo(() => isBeeNodeReady(status), [status])
  const hasUsableManager = Boolean(fm?.adminStamp || adminDrive || fm?.driveList?.some(d => d.isAdmin))

  useEffect(() => {
    isMountedRef.current = true

    const getBrowserPlatform = async () => {
      const browserPlatform = await detectBrowser()

      setCacheHelpUrl(cacheClearUrls[browserPlatform])
    }

    getBrowserPlatform()

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const isApiError = status.apiConnection.checkState !== CheckState.OK || !status.apiConnection.isEnabled

    setShowConnectionError(isApiError)
  }, [status.apiConnection])

  useEffect(() => {
    if (!isNodeReady) {
      wasNodeReadyRef.current = false
      setIsPostSyncGracePeriod(false)
      setShowInitialModal(false)
      setShowResetModal(false)

      return
    }

    if (wasNodeReadyRef.current) {
      setIsPostSyncGracePeriod(false)

      return
    }

    wasNodeReadyRef.current = true

    let isActive = true
    setIsPostSyncGracePeriod(true)
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return
      }

      void syncDrives()

      if (isActive) {
        setIsPostSyncGracePeriod(false)
      }
    }, 5000)

    void syncDrives()

    return () => {
      isActive = false
      window.clearTimeout(timeoutId)
    }
  }, [isNodeReady, syncDrives])

  useEffect(() => {
    if (!beeApi || !hasPk || !isNodeReady || fm || shallReset) {
      return
    }

    let isActive = true
    let attempt = 0
    let retryTimerId: number | undefined

    const ensureInitialized = async () => {
      attempt += 1

      if (!isActive) {
        return
      }

      const manager = await init()

      if (!isActive || manager) {
        return
      }

      retryTimerId = window.setTimeout(() => {
        void ensureInitialized()
      }, 4000)
    }

    void ensureInitialized()

    return () => {
      isActive = false

      if (retryTimerId !== undefined) {
        window.clearTimeout(retryTimerId)
      }
    }
  }, [beeApi, hasPk, isNodeReady, fm, shallReset, initializationError, init])

  useEffect(() => {
    const shouldRecover = isNodeReady && shallReset && !hasUsableManager

    if (!shouldRecover) {
      setHasTriedResetRecovery(false)
    }

    return undefined
  }, [isNodeReady, shallReset, hasUsableManager])

  useEffect(() => {
    const shouldPollStampApi = isNodeReady && shallReset && !hasUsableManager && !stampApiAvailable

    if (!shouldPollStampApi) {
      return
    }

    void syncDrives()

    const intervalId = window.setInterval(() => {
      void syncDrives()
    }, 3000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isNodeReady, shallReset, hasUsableManager, stampApiAvailable, syncDrives])

  useEffect(() => {
    const shouldAttemptResetRecovery =
      beeApi &&
      hasPk &&
      isNodeReady &&
      fm &&
      shallReset &&
      !hasUsableManager &&
      stampApiAvailable &&
      !hasTriedResetRecovery

    if (!shouldAttemptResetRecovery) {
      return
    }

    let isActive = true

    const attemptRecovery = async () => {
      setHasTriedResetRecovery(true)
      setIsLoading(true)
      const manager = await init()

      if (!isActive) {
        return
      }
    }

    void attemptRecovery()

    return () => {
      isActive = false
    }
  }, [beeApi, hasPk, isNodeReady, fm, shallReset, hasUsableManager, stampApiAvailable, hasTriedResetRecovery, init])

  // eslint-disable-next-line complexity
  useEffect(() => {
    if (!beeApi) {
      return
    }

    if (!hasPk) {
      setIsLoading(false)

      return
    }

    setShowResetModal(
      Boolean(shallReset && !hasUsableManager && !isPostSyncGracePeriod && stampApiAvailable && hasTriedResetRecovery),
    )

    if (shallReset && !hasUsableManager) {
      if (!stampApiAvailable || !hasTriedResetRecovery) {
        setShowInitialModal(false)
        setIsLoading(true)

        return
      }

      if (!isPostSyncGracePeriod) {
        setShowInitialModal(false)
      }

      if (fm) {
        setIsLoading(false)
      }

      return
    }

    if (initializationError) {
      setIsLoading(false)

      return
    }

    if (fm) {
      setIsLoading(false)

      const hasAnyDriveMetadata = Boolean(fm.driveList?.length)
      const shouldSuggestInitialSetup =
        !hasUsableManager && !shallReset && !initializationError && !hasAnyDriveMetadata && !showConnectionError

      if (!isPostSyncGracePeriod) {
        setShowInitialModal(shouldSuggestInitialSetup)
      }

      return
    }

    setIsLoading(true)
  }, [
    fm,
    beeApi,
    hasPk,
    initializationError,
    adminDrive,
    shallReset,
    hasUsableManager,
    isPostSyncGracePeriod,
    showConnectionError,
    stampApiAvailable,
    hasTriedResetRecovery,
  ])

  const handlePrivateKeySaved = useCallback(async () => {
    if (!isMountedRef.current) return

    setHasPk(true)

    if (fm) {
      if (!isMountedRef.current) return

      setIsLoading(false)

      return
    }

    setIsLoading(true)
    const manager = await init()

    if (!isMountedRef.current) return

    setIsLoading(false)

    const hasAdminStamp = Boolean(manager?.adminStamp)
    const tmpHasAdminDrive = Boolean(adminDrive)

    setShowInitialModal(!(hasAdminStamp || tmpHasAdminDrive))
  }, [fm, adminDrive, init])

  const isEmptyState = useMemo(() => {
    const value = showInitialModal && !isLoading && !hasUsableManager && !isCreationInProgress

    return value
  }, [showInitialModal, isLoading, hasUsableManager, isCreationInProgress])

  const loading = !fm?.adminStamp || !adminDrive

  const isFormbricksActive = Boolean(fm && fm.adminStamp && adminDrive && !showInitialModal && !loading)

  if (!hasPk) {
    return <PrivateKeyModalBlock onSaved={handlePrivateKeySaved} />
  }

  return renderFileManagerPageContent({
    isNodeReady,
    isPostSyncGracePeriod,
    initializationError,
    isLoading,
    shallReset,
    hasTriedResetRecovery,
    setHasPk,
    showResetModal,
    stampApiAvailable,
    cacheHelpUrl,
    setShowResetModal,
    fm,
    adminDrive,
    showErrorModal,
    isEmptyState,
    setShowInitialModal,
    setShowErrorModal,
    setErrorMessage,
    isFormbricksActive,
    showConnectionError,
    setShowConnectionError,
    errorMessage,
    loading,
    isCreationInProgress,
    setIsCreationInProgress,
  })
}

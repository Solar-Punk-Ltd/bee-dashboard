import { BeeModes, PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo, FileManagerBase } from '@solarpunkltd/file-manager-lib'
import { ReactElement, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { AdminStatusBar } from '../../modules/filemanager/components/AdminStatusBar/AdminStatusBar'
import { Button } from '../../modules/filemanager/components/Button/Button'
import { ConfirmModal } from '../../modules/filemanager/components/ConfirmModal/ConfirmModal'
import { ErrorModal } from '../../modules/filemanager/components/ErrorModal/ErrorModal'
import { FileBrowser } from '../../modules/filemanager/components/FileBrowser/FileBrowser'
import { FormbricksIntegration } from '../../modules/filemanager/components/FormbricksIntegration/FormbricksIntegration'
import { Header } from '../../modules/filemanager/components/Header/Header'
import { InitialModal } from '../../modules/filemanager/components/InitialModal/InitialModal'
import { Sidebar } from '../../modules/filemanager/components/Sidebar/Sidebar'
import { getUsableStamps } from '../../modules/filemanager/utils/bee'
import { CheckState, Context as BeeContext } from '../../providers/Bee'
import { Context as FMContext } from '../../providers/FileManager'
import { BrowserPlatform, cacheClearUrls, detectBrowser } from '../../providers/Platform'
import { Context as SettingsContext } from '../../providers/Settings'
import { Context as SwarmIdContext, SwarmConnectionStatus } from '../../providers/SwarmId'
import { ROUTES } from '../../routes'

import { SearchProvider } from './SearchContext'
import { ViewProvider } from './ViewContext'

import './FileManager.scss'

function SwarmClientRequiredBlock({ error }: { error: Error | null }) {
  return (
    <div className="fm-main">
      <div className="fm-loading">
        <div className="fm-loading-title">No Swarm connection</div>
        <div className="fm-loading-subtitle">
          {error ? error.message : 'The File Manager needs a connected Swarm backend before it can load.'}
          <br />
          Set your identity key and connect on the <Link to={ROUTES.SWARM_ID}>Swarm ID</Link> page.
        </div>
      </div>
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

function UltraLightNodeErrorBlock() {
  return (
    <div className="fm-main">
      <div className="fm-loading">
        <div className="fm-loading-title">
          File Manager is not available with an Ultra-light node. Please upgrade to a Light node to continue.
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

function ChainSyncingBlock() {
  return (
    <div className="fm-main">
      <div className="fm-loading" aria-live="polite">
        <div className="fm-spinner" aria-hidden="true" />
        <div className="fm-loading-title">Bee node is syncing…</div>
        <div className="fm-loading-subtitle">
          Your Bee node is still syncing the postage batch state from the chain.
          <br />
          File Manager will be available once the sync is complete.
        </div>
      </div>
    </div>
  )
}

function ErrorModalBlock({ onClick, label }: { onClick: () => void; label: string }) {
  return <ErrorModal label={label} onClick={onClick} />
}

function FileManagerMainContent(props: {
  fm: FileManagerBase | null
  adminStamp: PostageBatch | null
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
    adminStamp,
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
            adminStamp={adminStamp}
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

enum PageState {
  Connecting = 'connecting', // still warming up — show nothing / loader
  UltraLightNode = 'ultra-light-node', // ultra-light node — file manager not available
  NoSwarmClient = 'no-swarm-client', // no SwarmClient yet — the Swarm ID page owns key + connection
  Loading = 'loading', // bee ready, client present, FM init in progress
  Reset = 'reset', // STATE_INVALID emitted and user has not yet acknowledged
  InitError = 'init-error', // FM init completed with an error (non-reset case)
  ChainSyncing = 'chain-syncing', // bee node is still syncing postage batch state from chain
  Initial = 'initial', // FM ready but no admin stamp/drive → show InitialModal
  AdminError = 'admin-error', // drive creation failed
  Ready = 'ready', // fully operational
}

export function FileManagerPage(): ReactElement {
  const isMountedRef = useRef(true)
  const [showAdminErrorModal, setAdminShowErrorModal] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [resetAcknowledged, setResetAcknowledged] = useState<boolean>(false)
  const [isCreationInProgress, setIsCreationInProgress] = useState<boolean>(false)
  const [connectionErrorDismissed, setConnectionErrorDismissed] = useState<boolean>(false)
  const [cacheHelpUrl, setCacheHelpUrl] = useState<string>(cacheClearUrls[BrowserPlatform.Chrome])
  const [fmAdminStamp, setFmAdminStamp] = useState<PostageBatch | null>(null)

  const { status, chainState, nodeInfo } = useContext(BeeContext)
  const { fm, initDone, shallReset, adminDrive, initializationError } = useContext(FMContext)
  const { beeApi } = useContext(SettingsContext)
  const {
    swarmClient,
    status: swarmStatus,
    error: swarmError,
    disconnect: swarmDisconnect,
  } = useContext(SwarmIdContext)

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
    isMountedRef.current = true

    const getFmAdminStamp = async () => {
      if (!beeApi || !fm) {
        return
      }

      const stamps = await getUsableStamps(beeApi)
      const adminStamp = stamps.find(s => s.batchID.toString() === fm.adminStamp?.batchId)

      if (adminStamp && isMountedRef.current) {
        setFmAdminStamp(adminStamp)
      }
    }

    getFmAdminStamp()
  }, [fm, beeApi])

  const { isBeeReady, isConnectionError } = useMemo(() => {
    const isConnecting = status.all === CheckState.CONNECTING
    const isApiOk = status.apiConnection.isEnabled && status.apiConnection.checkState === CheckState.OK

    return {
      isBeeReady: !isConnecting && isApiOk,
      isConnectionError: !isConnecting && !isApiOk && Boolean(fm),
    }
  }, [status, fm])

  useEffect(() => {
    if (!isConnectionError) {
      setConnectionErrorDismissed(false)
    }
  }, [isConnectionError])

  const pageState = useMemo((): PageState => {
    const isChainSyncing = chainState === null

    if (!isBeeReady && !initDone) return PageState.Connecting

    if (nodeInfo?.beeMode === BeeModes.ULTRA_LIGHT) return PageState.UltraLightNode

    if (!swarmClient && swarmStatus !== SwarmConnectionStatus.Connecting) return PageState.NoSwarmClient

    if (!initDone) return PageState.Loading

    if (shallReset && !resetAcknowledged) return PageState.Reset

    if (initializationError && !shallReset) return PageState.InitError

    const hasAdminStamp = Boolean(fm?.adminStamp)
    const hasAdminDrive = Boolean(adminDrive)
    const setupIncomplete = !hasAdminStamp && !hasAdminDrive

    if (setupIncomplete && isChainSyncing) return PageState.ChainSyncing

    if (showAdminErrorModal) return PageState.AdminError

    if (setupIncomplete && !isCreationInProgress) return PageState.Initial

    return PageState.Ready
  }, [
    isBeeReady,
    swarmClient,
    swarmStatus,
    initDone,
    shallReset,
    resetAcknowledged,
    initializationError,
    showAdminErrorModal,
    fm,
    adminDrive,
    isCreationInProgress,
    chainState,
    nodeInfo?.beeMode,
  ])

  const loading = !fm?.adminStamp || !adminDrive
  const isFormbricksActive = Boolean(fm && fm.adminStamp && adminDrive && !loading)

  if (pageState === PageState.UltraLightNode) {
    return <UltraLightNodeErrorBlock />
  }

  if (pageState === PageState.Connecting || pageState === PageState.Loading) {
    return <LoadingBlock />
  }

  if (pageState === PageState.ChainSyncing) {
    return <ChainSyncingBlock />
  }

  if (pageState === PageState.NoSwarmClient) {
    return <SwarmClientRequiredBlock error={swarmError} />
  }

  if (pageState === PageState.InitError) {
    return <InitializationErrorBlock onOk={() => void swarmDisconnect()} />
  }

  if (pageState === PageState.Reset) {
    return <ResetModalBlock cacheHelpUrl={cacheHelpUrl} onConfirm={() => setResetAcknowledged(true)} />
  }

  if (pageState === PageState.Initial) {
    return (
      <InitialModalBlock
        resetState={shallReset}
        handleShowError={(flag: boolean, error?: string) => {
          setAdminShowErrorModal(flag)

          if (error) setErrorMessage(error)
        }}
        setIsCreationInProgress={(isCreating: boolean) => setIsCreationInProgress(isCreating)}
      />
    )
  }

  if (pageState === PageState.AdminError) {
    const adminErrorLabel =
      chainState === null
        ? 'Your Bee node is still syncing the postage batch state from the chain. Please wait for the sync to complete and try again.'
        : errorMessage ||
          'Error creating Admin Drive. Please try again. Possible causes include insufficient xDAI balance or a lost connection to the RPC.'

    return (
      <ErrorModalBlock
        label={adminErrorLabel}
        onClick={() => {
          setAdminShowErrorModal(false)
          setErrorMessage('')
        }}
      />
    )
  }

  return (
    <FileManagerMainContent
      fm={fm}
      adminStamp={fmAdminStamp}
      showConnectionError={isConnectionError && !connectionErrorDismissed}
      setShowConnectionError={(show: boolean) => setConnectionErrorDismissed(!show)}
      isFormbricksActive={isFormbricksActive}
      errorMessage={errorMessage}
      setErrorMessage={setErrorMessage}
      loading={loading}
      adminDrive={adminDrive}
      isCreationInProgress={isCreationInProgress}
    />
  )
}

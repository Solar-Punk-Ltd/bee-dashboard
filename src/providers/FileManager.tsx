import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { BeeDev, PostageBatch, PrivateKey } from '@ethersphere/bee-js'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { FileManagerBase, FileManagerEvents } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from './Settings'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { getUsableStamps } from '../modules/filemanager/utils/bee'
import { KEY_STORAGE, FM_STORAGE_STATE } from '../modules/filemanager/utils/common'

type FMStorageState = {
  adminDriveId: string
  adminDriveName: string
  adminBatchId: string
}

function ensurePrivateKey(): PrivateKey {
  const fromLocalPk = localStorage.getItem(KEY_STORAGE)

  if (!fromLocalPk) {
    throw new Error(`Missing private key in localStorage under key "${KEY_STORAGE}".`)
  }

  return new PrivateKey(fromLocalPk)
}

function signerPk(): PrivateKey | undefined {
  try {
    return ensurePrivateKey()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Private key error:', err)

    return undefined
  }
}

function getStoredState(): FMStorageState | undefined {
  const raw = localStorage.getItem(FM_STORAGE_STATE)

  if (!raw) return undefined
  try {
    return JSON.parse(raw) as FMStorageState
  } catch {
    return undefined
  }
}

function setStoredState(state: FMStorageState): void {
  localStorage.setItem(FM_STORAGE_STATE, JSON.stringify(state))
}

interface ContextInterface {
  fm: FileManagerBase | null
  files: FileInfo[]
  currentDrive?: DriveInfo
  currentStamp?: PostageBatch
  drives: DriveInfo[]
  adminDrive: DriveInfo | null
  adminStamp: PostageBatch | null
  initializationError: boolean
  setAdminStamp: (stamp: PostageBatch | null) => void
  setCurrentDrive: (d: DriveInfo) => void
  setCurrentStamp: (s: PostageBatch | undefined) => void
  refreshFiles: () => void
  refreshDrives: () => void
  resyncFM: () => void
  init: (
    batchId?: string,
    onAdminDriveReady?: (hasExistingDrive: boolean, fm: FileManagerBase, batchId?: string) => void,
  ) => Promise<boolean>
  getStoredState: () => FMStorageState | undefined
  setStoredState: (state: FMStorageState) => void
  showUploadError?: boolean
  setShowUploadError: (show: boolean) => void
}

const initialValues: ContextInterface = {
  fm: null,
  files: [],
  currentDrive: undefined,
  currentStamp: undefined,
  drives: [],
  adminDrive: null,
  adminStamp: null,
  initializationError: false,
  setAdminStamp: () => {}, // eslint-disable-line
  setCurrentDrive: () => {}, // eslint-disable-line
  setCurrentStamp: () => {}, // eslint-disable-line
  refreshFiles: () => {}, // eslint-disable-line
  refreshDrives: () => {}, // eslint-disable-line
  resyncFM: () => {}, // eslint-disable-line
  init: async () => false, // eslint-disable-line
  getStoredState: () => undefined, // eslint-disable-line
  setStoredState: () => {}, // eslint-disable-line
  showUploadError: false,
  setShowUploadError: () => {}, // eslint-disable-line
}

export const Context = createContext<ContextInterface>(initialValues)
export const Consumer = Context.Consumer

interface Props {
  children: ReactNode
}

export function Provider({ children }: Props) {
  const { apiUrl, beeApi } = useContext(SettingsContext)
  const [fm, setFm] = useState<FileManagerBase | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [adminDrive, setAdminDrive] = useState<DriveInfo | null>(null)
  const [adminStamp, setAdminStamp] = useState<PostageBatch | null>(null)
  const [currentDrive, setCurrentDrive] = useState<DriveInfo | undefined>()
  const [currentStamp, setCurrentStamp] = useState<PostageBatch | undefined>()
  const [initializationError, setInitializationError] = useState<boolean>(false)
  const [showUploadError, setShowUploadError] = useState<boolean>(false)

  const refreshFiles = useCallback((): void => {
    if (fm) {
      setFiles([...fm.fileInfoList])
    }
  }, [fm])

  const refreshDrives = useCallback(
    (driveInfo?: DriveInfo): void => {
      if (!fm) {
        return
      }

      if (driveInfo?.isAdmin && !adminDrive) {
        setAdminDrive(driveInfo)
      }

      const userDrives = fm.getDrives().filter(d => !d.isAdmin)
      setDrives(userDrives)
    },
    [fm, adminDrive],
  )

  const init = useCallback(
    async (
      batchId?: string,
      adminDriveReadyCallback?: (hasExistingDrive: boolean, fm: FileManagerBase, batchId?: string) => void,
    ): Promise<boolean> => {
      const pk = signerPk()

      if (!apiUrl || !pk) return false

      const bee = new BeeDev(apiUrl, { signer: pk })

      const manager = new FileManagerBase(bee)

      const syncFiles = () => {
        setFiles([...manager.fileInfoList])
      }

      const handleInitialized = (success: boolean) => {
        setFm(manager)
        setInitializationError(!success)

        if (success) {
          const allDrives = manager.getDrives()
          const tmpAdminDrive = allDrives.find(d => d.isAdmin) || null
          setAdminDrive(tmpAdminDrive)

          if (tmpAdminDrive && beeApi) {
            ;(async () => {
              const usableStamps = await getUsableStamps(beeApi)
              const match = usableStamps.find(s => s.batchID.toString() === tmpAdminDrive.batchId.toString()) || null
              setAdminStamp(match)
            })()
          }

          if (tmpAdminDrive && !getStoredState()) {
            setStoredState({
              adminDriveId: tmpAdminDrive.id.toString(),
              adminDriveName: tmpAdminDrive.name,
              adminBatchId: tmpAdminDrive.batchId.toString(),
            })
          }

          setDrives(allDrives.filter(d => !d.isAdmin))
          syncFiles()

          if (adminDriveReadyCallback) {
            adminDriveReadyCallback(Boolean(tmpAdminDrive), manager, batchId)
          }
        } else {
          setAdminDrive(null)
          setDrives([])
          setFiles([])
        }
      }

      manager.emitter.on(FileManagerEvents.FILEMANAGER_INITIALIZED, handleInitialized)
      manager.emitter.on(FileManagerEvents.DRIVE_CREATED, async ({ driveInfo }: { driveInfo: DriveInfo }) => {
        if (driveInfo.isAdmin) {
          setAdminDrive(driveInfo)

          setStoredState({
            adminDriveId: driveInfo.id.toString(),
            adminDriveName: driveInfo.name,
            adminBatchId: driveInfo.batchId.toString(),
          })

          if (beeApi && !adminStamp) {
            const usableStamps = await getUsableStamps(beeApi)
            const match = usableStamps.find(s => s.batchID.toString() === driveInfo.batchId.toString()) || null
            setAdminStamp(match)
          }
        }

        setDrives(manager.getDrives().filter(d => !d.isAdmin))
      })
      manager.emitter.on(FileManagerEvents.DRIVE_DESTROYED, ({ driveInfo }) => {
        if (driveInfo?.isAdmin) {
          setAdminDrive(null)
          setAdminStamp(null)
        }
        setDrives(manager.getDrives().filter(d => !d.isAdmin))
        syncFiles()
      })
      manager.emitter.on(FileManagerEvents.FILE_UPLOADED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_VERSION_RESTORED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_TRASHED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_RECOVERED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_FORGOTTEN, syncFiles)

      try {
        await manager.initialize(batchId)

        return true
      } catch (error) {
        return false
      }
    },
    [apiUrl, beeApi, adminStamp],
  )

  const resyncFM = useCallback(async (): Promise<void> => {
    if (!apiUrl) return

    const stored = getStoredState()
    const prevDriveId = currentDrive?.id.toString()

    await init(stored?.adminBatchId, (_hasAdmin, manager) => {
      if (prevDriveId) {
        const refreshedDrive = manager.getDrives().find(d => d.id.toString() === prevDriveId)

        if (refreshedDrive) setCurrentDrive(refreshedDrive)
      }
    })
  }, [apiUrl, currentDrive?.id, init, setCurrentDrive])

  useEffect(() => {
    if (!apiUrl || !beeApi) return

    if (!localStorage.getItem('privateKey')) return

    if (fm) return

    const initFromLocalState = async () => {
      const storedState = getStoredState()

      if (storedState?.adminBatchId) {
        const usableStamps = await getUsableStamps(beeApi)
        const adminBatch = usableStamps.find(s => s.batchID.toString() === storedState.adminBatchId)

        if (adminBatch) {
          await init(storedState.adminBatchId, () => {
            setAdminStamp(adminBatch)
          })
        }
      }
    }

    initFromLocalState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, beeApi, fm])

  return (
    <Context.Provider
      value={{
        fm,
        files,
        currentDrive,
        currentStamp,
        drives,
        adminDrive,
        adminStamp,
        initializationError,
        setCurrentDrive,
        setCurrentStamp,
        setAdminStamp,
        refreshFiles,
        refreshDrives,
        resyncFM,
        init,
        getStoredState,
        setStoredState,
        showUploadError,
        setShowUploadError,
      }}
    >
      {children}
    </Context.Provider>
  )
}

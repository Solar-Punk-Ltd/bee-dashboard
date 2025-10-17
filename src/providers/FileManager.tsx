import { createContext, useCallback, useContext, useState, ReactNode, useEffect } from 'react'
import { Bee, PostageBatch } from '@ethersphere/bee-js'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { FileManagerBase, FileManagerEvents } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from './Settings'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { getSignerPk } from '../modules/filemanager/utils/common'

interface ContextInterface {
  fm: FileManagerBase | null
  files: FileInfo[]
  currentDrive?: DriveInfo
  currentStamp?: PostageBatch
  drives: DriveInfo[]
  adminDrive: DriveInfo | null
  initializationError: boolean
  setCurrentDrive: (d: DriveInfo) => void
  setCurrentStamp: (s: PostageBatch | undefined) => void
  refreshFiles: () => void
  refreshDrives: () => void
  resyncFM: () => Promise<void>
  init: () => Promise<FileManagerBase | null>
  showUploadError?: boolean
  setShowUploadError: (show: boolean) => void // todo: this should not be global
}

const initialValues: ContextInterface = {
  fm: null,
  files: [],
  currentDrive: undefined,
  currentStamp: undefined,
  drives: [],
  adminDrive: null,
  initializationError: false,
  setCurrentDrive: () => {}, // eslint-disable-line
  setCurrentStamp: () => {}, // eslint-disable-line
  refreshFiles: () => {}, // eslint-disable-line
  refreshDrives: () => {}, // eslint-disable-line
  resyncFM: async () => {}, // eslint-disable-line
  init: async () => null, // eslint-disable-line
  showUploadError: false,
  setShowUploadError: () => {}, // eslint-disable-line
}

export const Context = createContext<ContextInterface>(initialValues)
export const Consumer = Context.Consumer

interface Props {
  children: ReactNode
}

export function Provider({ children }: Props) {
  const { apiUrl } = useContext(SettingsContext)
  const [fm, setFm] = useState<FileManagerBase | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [adminDrive, setAdminDrive] = useState<DriveInfo | null>(null)
  // const [adminStamp, setAdminStamp] = useState<PostageBatch | null>(null)
  const [currentDrive, setCurrentDrive] = useState<DriveInfo | undefined>()
  const [currentStamp, setCurrentStamp] = useState<PostageBatch | undefined>()
  const [initializationError, setInitializationError] = useState<boolean>(false)
  const [showUploadError, setShowUploadError] = useState<boolean>(false)

  const refreshFiles = useCallback((): void => {
    if (fm) {
      setFiles([...fm.fileInfoList])
    }
  }, [fm])

  const refreshDrives = useCallback((): void => {
    if (!fm) {
      return
    }

    // TODO: optimize, do not call find() twice
    const allDrives = fm.getDrives()
    const tmpAdminDrive = allDrives.find(d => d.isAdmin)
    const userDrives = allDrives.filter(d => !d.isAdmin)
    setAdminDrive(tmpAdminDrive || null)
    setDrives(userDrives)
  }, [fm])

  const init = useCallback(async (): // batchId?: string,
  // adminDriveReadyCallback?: (hasExistingDrive: boolean, fm: FileManagerBase, batchId?: string) => void,
  Promise<FileManagerBase | null> => {
    const pk = getSignerPk()

    if (!apiUrl || !pk) return null

    // TODO: is reset everyting needed?
    // setFm(null)

    const bee = new Bee(apiUrl, { signer: pk })
    const manager = new FileManagerBase(bee)

    const syncFiles = () => {
      setFiles([...manager.fileInfoList])
    }

    const handleInitialized = (success: boolean) => {
      setInitializationError(!success)

      if (success) {
        setFm(manager)

        // TODO: syncdrives is better
        const allDrives = manager.getDrives()
        const tmpAdminDrive = allDrives.find(d => d.isAdmin)
        const userDrives = allDrives.filter(d => !d.isAdmin)
        setAdminDrive(tmpAdminDrive || null)
        setDrives(userDrives)
        syncFiles()
      } else {
        setAdminDrive(null)
        setDrives([])
        setFiles([])
      }
    }

    const handleDriveCreated = ({ driveInfo }: { driveInfo: DriveInfo }) => {
      if (driveInfo.isAdmin) {
        setAdminDrive(driveInfo)

        return
      }

      setDrives(manager.getDrives().filter(d => !d.isAdmin))
    }

    const handleDriveDestroyed = ({ driveInfo }: { driveInfo: DriveInfo }) => {
      setDrives(manager.getDrives().filter(d => !d.isAdmin))
      syncFiles()
    }

    manager.emitter.on(FileManagerEvents.FILEMANAGER_INITIALIZED, handleInitialized)
    manager.emitter.on(FileManagerEvents.DRIVE_CREATED, handleDriveCreated)
    manager.emitter.on(FileManagerEvents.DRIVE_DESTROYED, handleDriveDestroyed)
    manager.emitter.on(FileManagerEvents.FILE_UPLOADED, syncFiles)
    manager.emitter.on(FileManagerEvents.FILE_VERSION_RESTORED, syncFiles)
    manager.emitter.on(FileManagerEvents.FILE_TRASHED, syncFiles)
    manager.emitter.on(FileManagerEvents.FILE_RECOVERED, syncFiles)
    manager.emitter.on(FileManagerEvents.FILE_FORGOTTEN, syncFiles)

    try {
      await manager.initialize()

      return manager
    } catch (error) {
      return null
    }
  }, [apiUrl])

  const resyncFM = useCallback(async (): Promise<void> => {
    const prevDriveId = currentDrive?.id.toString()
    const manager = await init()

    if (prevDriveId && manager) {
      const refreshedDrive = manager.getDrives().find(d => d.id.toString() === prevDriveId)
      setCurrentDrive(refreshedDrive)
    }
  }, [currentDrive?.id, init, setCurrentDrive])

  useEffect(() => {
    const pk = getSignerPk()

    if (!pk || fm) return

    const initFromLocalState = async () => {
      await init()
    }

    initFromLocalState()
  }, [fm, init])

  return (
    <Context.Provider
      value={{
        fm,
        files,
        currentDrive,
        currentStamp,
        drives,
        adminDrive,
        initializationError,
        setCurrentDrive,
        setCurrentStamp,
        refreshFiles,
        refreshDrives,
        resyncFM,
        init,
        showUploadError,
        setShowUploadError,
      }}
    >
      {children}
    </Context.Provider>
  )
}

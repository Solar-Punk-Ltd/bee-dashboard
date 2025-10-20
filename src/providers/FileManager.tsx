import { createContext, useCallback, useContext, useState, ReactNode, useEffect } from 'react'
import { Bee, PostageBatch } from '@ethersphere/bee-js'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { FileManagerBase, FileManagerEvents } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from './Settings'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { getSignerPk } from '../modules/filemanager/utils/common'
import { getUsableStamps } from 'src/modules/filemanager/utils/bee'

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
  resync: () => Promise<void>
  init: () => Promise<FileManagerBase | null>
  showError?: boolean
  setShowError: (show: boolean) => void
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
  resync: async () => {}, // eslint-disable-line
  init: async () => null, // eslint-disable-line
  showError: false,
  setShowError: () => {}, // eslint-disable-line
}

export const Context = createContext<ContextInterface>(initialValues)
export const Consumer = Context.Consumer

interface Props {
  children: ReactNode
}

const findDrives = (allDrives: DriveInfo[]): { adminDrive: DriveInfo | null; userDrives: DriveInfo[] } => {
  let adminDrive: DriveInfo | null = null
  const userDrives: DriveInfo[] = []

  allDrives.forEach(d => {
    if (d.isAdmin) {
      adminDrive = d
    } else {
      userDrives.push(d)
    }
  })

  return { adminDrive, userDrives }
}

export function Provider({ children }: Props) {
  const { apiUrl, beeApi } = useContext(SettingsContext)

  const [fm, setFm] = useState<FileManagerBase | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [adminDrive, setAdminDrive] = useState<DriveInfo | null>(null)
  const [currentDrive, setCurrentDrive] = useState<DriveInfo | undefined>()
  const [currentStamp, setCurrentStamp] = useState<PostageBatch | undefined>()

  const [initializationError, setInitializationError] = useState<boolean>(false)
  const [showError, setShowError] = useState<boolean>(false)
  // TODO: rethink this: maybe caching files/drives happen elsewhere
  const syncFiles = useCallback((manager: FileManagerBase, fi?: FileInfo, remove?: boolean): void => {
    // append/remove directly to avoid cache issues
    if (fi) {
      if (remove) {
        setFiles(prev => prev.filter(f => f.topic.toString() !== fi.topic.toString()))
      } else {
        setFiles(prev => {
          const existingIndex = prev.findIndex(f => f.topic.toString() === fi.topic.toString())

          if (existingIndex >= 0) {
            const updated = [...prev]
            updated[existingIndex] = fi

            return updated
          }

          return [...prev, fi]
        })
      }

      return
    }

    setFiles([...manager.fileInfoList])
  }, [])

  const syncDrives = useCallback((manager: FileManagerBase, di?: DriveInfo, remove?: boolean): void => {
    // append/remove directly to avoid cache issues
    if (di) {
      if (remove) {
        setDrives(prev => prev.filter(d => d.id.toString() !== di.id.toString()))
      } else {
        if (di.isAdmin) {
          setAdminDrive(di)
        } else {
          setDrives(prev => {
            const existingIndex = prev.findIndex(d => d.id.toString() === di.id.toString())

            if (existingIndex >= 0) {
              const updated = [...prev]
              updated[existingIndex] = di

              return updated
            }

            return [...prev, di]
          })
        }
      }

      return
    }

    const { adminDrive: tmpAdminDrive, userDrives } = findDrives(manager.getDrives())
    setAdminDrive(tmpAdminDrive)
    setDrives(userDrives)
  }, [])

  const init = useCallback(async (): Promise<FileManagerBase | null> => {
    const pk = getSignerPk()

    if (!apiUrl || !pk) return null

    setFm(null)
    setFiles([])
    setDrives([])
    setAdminDrive(null)
    setInitializationError(false)
    setCurrentDrive(undefined)
    setCurrentStamp(undefined)

    const bee = new Bee(apiUrl, { signer: pk })
    const manager = new FileManagerBase(bee)

    const handleInitialized = (success: boolean) => {
      setInitializationError(!success)

      if (success) {
        setFm(manager)
        syncDrives(manager)
        syncFiles(manager)
      }
    }

    const handleDriveCreated = ({ driveInfo }: { driveInfo: DriveInfo }) => {
      syncDrives(manager, driveInfo)
    }

    const handleDriveDestroyed = ({ driveInfo }: { driveInfo: DriveInfo }) => {
      syncDrives(manager, driveInfo, true)
      syncFiles(manager)
    }

    manager.emitter.on(FileManagerEvents.FILEMANAGER_INITIALIZED, handleInitialized)
    manager.emitter.on(FileManagerEvents.DRIVE_CREATED, handleDriveCreated)
    manager.emitter.on(FileManagerEvents.DRIVE_DESTROYED, handleDriveDestroyed)
    manager.emitter.on(FileManagerEvents.FILE_UPLOADED, ({ fileInfo }: { fileInfo: FileInfo }) =>
      syncFiles(manager, fileInfo),
    )
    manager.emitter.on(FileManagerEvents.FILE_VERSION_RESTORED, ({ restored }: { restored: FileInfo }) =>
      syncFiles(manager, restored),
    )
    manager.emitter.on(FileManagerEvents.FILE_TRASHED, ({ fileInfo }: { fileInfo: FileInfo }) =>
      syncFiles(manager, fileInfo),
    )
    manager.emitter.on(FileManagerEvents.FILE_RECOVERED, ({ fileInfo }: { fileInfo: FileInfo }) =>
      syncFiles(manager, fileInfo),
    )
    manager.emitter.on(FileManagerEvents.FILE_FORGOTTEN, ({ fileInfo }: { fileInfo: FileInfo }) =>
      syncFiles(manager, fileInfo, true),
    )

    try {
      await manager.initialize()

      return manager
    } catch (error) {
      return null
    }
  }, [apiUrl, syncDrives, syncFiles])

  const resync = useCallback(async (): Promise<void> => {
    const prevDriveId = currentDrive?.id.toString()
    const prevStamp = currentStamp

    const manager = await init()

    if (prevDriveId && manager) {
      const refreshedDrive = manager.getDrives().find(d => d.id.toString() === prevDriveId)
      setCurrentDrive(refreshedDrive)

      const isValidCurrentStamp = (await getUsableStamps(beeApi)).find(
        s => s.batchID.toString() === prevStamp?.batchID.toString(),
      )

      setCurrentStamp(isValidCurrentStamp)
    }
  }, [currentDrive?.id, currentStamp, init, setCurrentDrive, setCurrentStamp, beeApi])

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
        resync,
        init,
        showError,
        setShowError,
      }}
    >
      {children}
    </Context.Provider>
  )
}

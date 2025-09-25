import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { BeeDev, PrivateKey } from '@ethersphere/bee-js'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { FileManagerBase, FileManagerEvents } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from './Settings'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'

const KEY_STORAGE = 'privateKey'

function ensurePrivateKey(): PrivateKey {
  const fromLocalPk = localStorage.getItem(KEY_STORAGE)

  if (!fromLocalPk) {
    throw new Error(`Missing private key in localStorage under key "${KEY_STORAGE}".`)
  }

  return new PrivateKey(fromLocalPk)
}

interface ContextInterface {
  fm: FileManagerBase | null
  files: FileInfo[]
  currentDrive?: DriveInfo
  drives: DriveInfo[]
  adminDrive: DriveInfo | null
  initializationError: boolean
  setCurrentDrive: (d: DriveInfo) => void
  refreshFiles: () => void
  refreshDrives: () => void
}

const initialValues: ContextInterface = {
  fm: null,
  files: [],
  currentDrive: undefined,
  drives: [],
  adminDrive: null,
  initializationError: false,
  setCurrentDrive: () => {}, // eslint-disable-line
  refreshFiles: () => {}, // eslint-disable-line
  refreshDrives: () => {}, // eslint-disable-line
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
  const [currentDrive, setCurrentDrive] = useState<DriveInfo | undefined>()
  const [initializationError, setInitializationError] = useState<boolean>(false)

  const signerPk = (): PrivateKey | undefined => {
    try {
      return ensurePrivateKey()
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error('Private key error:', err)

      return
    }
  }

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

  useEffect(() => {
    if (!apiUrl) return

    const pk = signerPk()

    if (!pk) {
      return
    }

    const bee = new BeeDev(apiUrl, { signer: pk })

    ;(async () => {
      const manager = new FileManagerBase(bee)

      const syncFiles = () => {
        setFiles([...manager.fileInfoList])
      }

      const handleInitialized = (success: boolean) => {
        setFm(manager)

        if (success) {
          setInitializationError(false)
          const allDrives = manager.getDrives()
          setAdminDrive(allDrives.find(d => d.isAdmin) || null)
          setDrives(allDrives.filter(d => !d.isAdmin))
          syncFiles()
        } else {
          setInitializationError(true)
          setAdminDrive(null)
          setDrives([])
          setFiles([])
        }
      }

      manager.emitter.on(FileManagerEvents.FILEMANAGER_INITIALIZED, handleInitialized)
      manager.emitter.on(FileManagerEvents.DRIVE_CREATED, ({ driveInfo }: { driveInfo: DriveInfo }) => {
        setDrives(manager.getDrives().filter(d => !d.isAdmin))
      })
      manager.emitter.on(FileManagerEvents.DRIVE_DESTROYED, ({ driveInfo }) => {
        setDrives(manager.getDrives().filter(d => !d.isAdmin))
        syncFiles()
      })
      manager.emitter.on(FileManagerEvents.FILE_UPLOADED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_VERSION_RESTORED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_TRASHED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_RECOVERED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_FORGOTTEN, syncFiles)

      await manager.initialize()
    })()

    return () => {
      setFm(null)
    }
  }, [apiUrl])

  return (
    <Context.Provider
      value={{
        fm,
        files,
        currentDrive,
        setCurrentDrive,
        drives,
        adminDrive,
        initializationError,
        refreshFiles,
        refreshDrives,
      }}
    >
      {children}
    </Context.Provider>
  )
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { BeeDev, PrivateKey } from '@ethersphere/bee-js'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { FileManagerBase, FileManagerEvents } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from '../../../providers/Settings'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'

const KEY_STORAGE = 'privateKey'

function ensurePrivateKey(): PrivateKey {
  const fromLocalPk = localStorage.getItem(KEY_STORAGE)

  if (!fromLocalPk) {
    throw new Error(`Missing private key in localStorage under key "${KEY_STORAGE}".`)
  }

  return new PrivateKey(fromLocalPk)
}

interface FMContextValue {
  fm: FileManagerBase | null
  files: FileInfo[]
  currentDrive?: DriveInfo
  drives: DriveInfo[]
  setCurrentDrive: (d: DriveInfo) => void
  refreshFiles: () => void
}

const initialValues: FMContextValue = {
  fm: null,
  files: [],
  currentDrive: undefined,
  drives: [],
  setCurrentDrive: () => {}, // eslint-disable-line
  refreshFiles: () => {}, // eslint-disable-line
}

export const FMContext = createContext<FMContextValue>(initialValues)

export function FMProvider({ children }: { children: ReactNode }) {
  const { apiUrl } = useContext(SettingsContext)
  const [fm, setFm] = useState<FileManagerBase | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [currentDrive, setCurrentDrive] = useState<DriveInfo | undefined>()
  const managerRef = useRef<FileManagerBase | null>(null)
  const initInFlight = useRef<Promise<void> | null>(null)

  const rescanFromNode = useCallback((): Promise<void> => {
    if (!managerRef.current) return Promise.resolve()

    if (initInFlight.current) return initInFlight.current
    initInFlight.current = managerRef.current
      .initialize()
      .catch(e => undefined)
      .finally(() => {
        if (managerRef.current) setFiles([...managerRef.current.fileInfoList])
        initInFlight.current = null
      }) as Promise<void>

    return initInFlight.current
  }, [])

  const refreshFiles = useCallback((): void => {
    if (managerRef.current) setFiles([...managerRef.current.fileInfoList])
    void rescanFromNode()
  }, [rescanFromNode])

  useEffect(() => {
    if (!apiUrl || managerRef.current) return

    let pk: PrivateKey
    try {
      pk = ensurePrivateKey()
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error('Private key error:', err)

      return
    }

    const bee = new BeeDev(apiUrl, { signer: pk })

    ;(async () => {
      const manager = new FileManagerBase(bee)
      managerRef.current = manager

      const syncFiles = () => setFiles([...manager.fileInfoList])

      manager.emitter.on(FileManagerEvents.FILEMANAGER_INITIALIZED, success => {
        if (success) {
          setDrives(manager.getDrives().filter(d => !d.isAdmin))
          syncFiles()
          setFm(manager)
        } else {
          // eslint-disable-next-line no-console
          console.error('Failed to initialize FileManager')
        }
      })
      manager.emitter.on(FileManagerEvents.DRIVE_CREATED, ({ driveInfo }) => {
        // TODO: maybe: setDrives(manager.getDrives())
        setDrives(d => [...d, driveInfo])
      })
      manager.emitter.on(FileManagerEvents.DRIVE_DESTROYED, ({ drive }) => {
        // TODO: maybe: setDrives(manager.getDrives())
        setDrives(prev => prev.filter(d => d.id !== drive.id))
        syncFiles()
      })
      manager.emitter.on(FileManagerEvents.FILE_UPLOADED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_VERSION_RESTORED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_TRASHED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_RECOVERED, syncFiles)
      manager.emitter.on(FileManagerEvents.FILE_FORGOTTEN, syncFiles)

      await manager.initialize()
    })()
  }, [apiUrl])

  return (
    <FMContext.Provider value={{ fm, files, currentDrive, setCurrentDrive, drives, refreshFiles }}>
      {children}
    </FMContext.Provider>
  )
}

// TODO: rename: useFmContext
export function useFM(): FMContextValue {
  return useContext(FMContext)
}

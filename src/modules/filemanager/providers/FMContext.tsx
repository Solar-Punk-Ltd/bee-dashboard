import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { Bee, PrivateKey, PostageBatch } from '@ethersphere/bee-js'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { FileManagerBase, FileManagerEvents } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from '../../../providers/Settings'

const KEY_STORAGE = 'privateKey'

// function generatePrivateKey(seed: string): string {
//   const bytes = crypto.getRandomValues(Bytes.fromUtf8(seed).toUint8Array())

//   return (
//     '0x' +
//     Array.from(bytes)
//       .map(b => b.toString(16).padStart(2, '0'))
//       .join('')
//   )
// }

type ViteEnv = { VITE_FM_DEV_PRIVATE_KEY?: string; MODE?: string }
type CraEnv = { REACT_APP_FM_DEV_PRIVATE_KEY?: string; NODE_ENV?: string }

function getViteEnv(): ViteEnv | undefined {
  try {
    return (import.meta as unknown as { env?: ViteEnv }).env
  } catch {
    return undefined
  }
}

function getCraEnv(): CraEnv | undefined {
  try {
    return (process as unknown as { env?: CraEnv }).env
  } catch {
    return undefined
  }
}

function getBuildMode(): string {
  return getViteEnv()?.MODE ?? getCraEnv()?.NODE_ENV ?? ''
}

function getDevEnvPk(): string | undefined {
  return getViteEnv()?.VITE_FM_DEV_PRIVATE_KEY ?? getCraEnv()?.REACT_APP_FM_DEV_PRIVATE_KEY
}

function ensurePrivateKey(opts: { devAutogen: boolean }): PrivateKey {
  const fromLocalPk = localStorage.getItem(KEY_STORAGE)

  if (fromLocalPk) return new PrivateKey(fromLocalPk)

  // TODO: handle privkey
  const devEnv = getDevEnvPk() || 'TODO'
  const pk = new PrivateKey(PrivateKey.fromUtf8(devEnv))
  localStorage.setItem(KEY_STORAGE, pk.toString())

  return pk
}

interface FMContextValue {
  fm: FileManagerBase | null
  files: FileInfo[]
  currentBatch?: PostageBatch
  setCurrentBatch: (b: PostageBatch) => void
  refreshFiles: () => void
}

// TODO: use the exact same convention as in SettingsContext
export const FMContext = createContext<FMContextValue>({
  fm: null,
  files: [],
  setCurrentBatch: () => {
    throw new Error('setCurrentBatch() called outside FMProvider')
  },
  refreshFiles: () => {
    throw new Error('refreshFiles() called outside FMProvider')
  },
})

// TODO: refactor with drive handling
function hasLabel(x: unknown): x is { label?: string } {
  return typeof x === 'object' && x !== null && 'label' in (x as Record<string, unknown>)
}

export function FMProvider({ children }: { children: ReactNode }) {
  const { apiUrl } = useContext(SettingsContext)
  const [fm, setFm] = useState<FileManagerBase | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [currentBatch, setCurrentBatch] = useState<PostageBatch | undefined>()
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
    if (!apiUrl) return

    let pk: PrivateKey
    try {
      pk = ensurePrivateKey({ devAutogen: false })
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error('Invalid private key in env:', err)

      return
    }

    const bee = new Bee(apiUrl, { signer: pk })

    ;(async () => {
      try {
        const all = await bee.getPostageBatches()
        const firstDrive =
          all.find(s => s.usable && hasLabel(s) && s.label !== 'owner' && s.label !== 'owner-stamp') ??
          all.find(s => s.usable)

        if (firstDrive) setCurrentBatch(firstDrive)
      } catch {
        // TODO: Handle the error
      }

      const manager = new FileManagerBase(bee)
      managerRef.current = manager
      const sync = () => setFiles([...manager.fileInfoList])

      // TODO: handle failed init FILEMANAGER_INITIALIZED === false
      manager.emitter.on(FileManagerEvents.FILEMANAGER_INITIALIZED, sync)
      manager.emitter.on(FileManagerEvents.FILE_UPLOADED, sync)
      manager.emitter.on(FileManagerEvents.FILE_VERSION_RESTORED, sync)
      manager.emitter.on(FileManagerEvents.FILE_TRASHED, sync)
      manager.emitter.on(FileManagerEvents.FILE_RECOVERED, sync)
      manager.emitter.on(FileManagerEvents.FILE_FORGOTTEN, sync)

      await manager.initialize()
      setFiles([...manager.fileInfoList])

      setFm(manager)
    })()
  }, [apiUrl])

  return (
    <FMContext.Provider value={{ fm, files, currentBatch, setCurrentBatch, refreshFiles }}>
      {children}
    </FMContext.Provider>
  )
}

export function useFM(): FMContextValue {
  return useContext(FMContext)
}

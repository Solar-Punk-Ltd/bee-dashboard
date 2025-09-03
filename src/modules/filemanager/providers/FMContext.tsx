import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { Bee, PrivateKey, PostageBatch } from '@ethersphere/bee-js'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { FileManagerBase, FileManagerEvents } from '@solarpunkltd/file-manager-lib'
import { Context as SettingsContext } from '../../../providers/Settings'

const KEY_STORAGE = 'privateKey'

function normalizeHexKey(pk: string): string | null {
  if (!pk) return null
  const k = pk.startsWith('0x') ? pk.slice(2) : pk

  return /^[0-9a-fA-F]{64}$/.test(k) ? `0x${k.toLowerCase()}` : null
}

function generatePrivateKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  return (
    '0x' +
    Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  )
}

function consumePkFromUrl(): string | null {
  try {
    const url = new URL(window.location.href)
    const pk = url.searchParams.get('pk')

    if (!pk) return null
    const norm = normalizeHexKey(pk)
    url.searchParams.delete('pk')
    window.history.replaceState({}, '', url.toString())

    if (!norm) return null
    localStorage.setItem(KEY_STORAGE, norm)

    return norm
  } catch {
    return null
  }
}

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

function ensurePrivateKey(opts: { devAutogen: boolean }): string | null {
  const fromUrl = consumePkFromUrl()

  if (fromUrl) return fromUrl
  const fromLocal = normalizeHexKey(localStorage.getItem(KEY_STORAGE) || '')

  if (fromLocal) return fromLocal
  const mode = getBuildMode()
  const devEnv = getDevEnvPk()

  if (devEnv && mode !== 'production') {
    const norm = normalizeHexKey(devEnv)

    if (norm) {
      localStorage.setItem(KEY_STORAGE, norm)

      return norm
    }
  }

  if (mode !== 'production' && opts.devAutogen) {
    const gen = generatePrivateKey()
    localStorage.setItem(KEY_STORAGE, gen)

    return gen
  }

  return null
}

declare global {
  interface Window {
    fmExportKey: () => string | null
    fmExportKeyLink: () => string | null
    fmImportKey: (pk: string) => string
  }
}
window.fmExportKey = () => localStorage.getItem(KEY_STORAGE)
window.fmExportKeyLink = () => {
  const base = window.location.origin + window.location.pathname + window.location.hash.split('?')[0]
  const pk = localStorage.getItem(KEY_STORAGE)

  return pk ? `${base}?pk=${pk}` : null
}
window.fmImportKey = (pk: string) => {
  const norm = normalizeHexKey(pk)

  if (!norm) throw new Error('Invalid private key')
  localStorage.setItem(KEY_STORAGE, norm)

  return norm
}

interface FMContextValue {
  fm: FileManagerBase | null
  files: FileInfo[]
  currentBatch?: PostageBatch
  setCurrentBatch: (b: PostageBatch) => void
  refreshFiles: () => void
}

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
    const raw = ensurePrivateKey({ devAutogen: false })

    if (!raw) return

    let signer: PrivateKey
    try {
      signer = new PrivateKey(raw.startsWith('0x') ? raw.slice(2) : raw)
    } catch {
      return
    }

    const bee = new Bee(apiUrl, { signer })

    ;(async () => {
      try {
        const all = await bee.getAllPostageBatch()
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

      manager.emitter.on(FileManagerEvents.FILEMANAGER_INITIALIZED, sync)
      manager.emitter.on(FileManagerEvents.FILE_UPLOADED, sync)
      manager.emitter.on(FileManagerEvents.FILE_VERSION_RESTORED, sync)
      manager.emitter.on(FileManagerEvents.FILE_TRASHED, sync)
      manager.emitter.on(FileManagerEvents.FILE_RECOVERED, sync)
      manager.emitter.on(FileManagerEvents.FILE_FORGOTTEN, sync)

      try {
        await manager.initialize()
        setFiles([...manager.fileInfoList])
      } catch {
        // TODO: Handle the error
      }

      setFm(manager)
    })()
  }, [apiUrl])

  useEffect(() => {
    const refreshFromNetwork = () => {
      if (!managerRef.current) return
      managerRef.current
        .initialize()
        .then(() => {
          if (managerRef.current) setFiles([...managerRef.current.fileInfoList])
        })
        .catch(() => undefined)
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'fm:pulse') refreshFromNetwork()
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshFromNetwork()
    }
    const onFocus = () => refreshFromNetwork()

    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)

    let iv: number | null = null
    const start = () => {
      if (iv !== null) return
      iv = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshFromNetwork()
      }, 15000)
    }
    const stop = () => {
      if (iv !== null) {
        clearInterval(iv)
        iv = null
      }
    }

    onVis()
    start()

    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
      stop()
    }
  }, [])

  return (
    <FMContext.Provider value={{ fm, files, currentBatch, setCurrentBatch, refreshFiles }}>
      {children}
    </FMContext.Provider>
  )
}

export function useFM(): FMContextValue {
  return useContext(FMContext)
}

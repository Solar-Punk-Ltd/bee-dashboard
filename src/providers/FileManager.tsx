import { Bee, PostageBatch } from '@ethersphere/bee-js'
import type { FileRecord, FolderInfo, NodeEntry } from '@solarpunkltd/file-manager-lib'
import { DriveInfo, FileManagerBase, FileManagerEvents, ListDepth, NodeType } from '@solarpunkltd/file-manager-lib'
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { FILE_MANAGER_EVENTS } from '../modules/filemanager/constants/common'
import { getUsableStamps } from '../modules/filemanager/utils/bee'
import { getSignerPk } from '../modules/filemanager/utils/common'

import { CheckState, Context as BeeContext } from './Bee'
import { Context as SettingsContext } from './Settings'
import { Context as SwarmIdProvider } from './SwarmId'

interface DriveContents {
  files: FileRecord[]
  folders: FolderInfo[]
  trashFiles: FileRecord[]
  trashFolders: FolderInfo[]
}

const EMPTY_CONTENTS: DriveContents = { files: [], folders: [], trashFiles: [], trashFolders: [] }

interface ContextInterface {
  fm: FileManagerBase | null
  initDone: boolean
  /// Every record across every loaded drive, active and trashed
  files: FileRecord[]
  // Current drive, active namespace.
  driveFiles: FileRecord[]
  folders: FolderInfo[]
  // Current drive, trash namespace.
  trashFiles: FileRecord[]
  trashFolders: FolderInfo[]
  currentDrive?: DriveInfo
  currentStamp?: PostageBatch
  drives: DriveInfo[]
  expiredDrives: DriveInfo[]
  adminDrive: DriveInfo | null
  initializationError: boolean
  showError?: boolean
  shallReset: boolean
  setCurrentDrive: (d: DriveInfo | undefined) => void
  setCurrentStamp: (s: PostageBatch | undefined) => void
  resync: () => Promise<void>
  loadFolder: (path?: string, driveId?: string) => Promise<void>
  reloadTrash: (driveId?: string) => Promise<void>
  isRecordLoading: boolean
  init: () => Promise<FileManagerBase | null>
  setShowError: (show: boolean) => void
  syncDrives: () => Promise<void>
  refreshStamp: (batchId: string) => Promise<PostageBatch | undefined>
}

const initialValues: ContextInterface = {
  fm: null,
  initDone: false,
  files: [],
  driveFiles: [],
  folders: [],
  trashFiles: [],
  trashFolders: [],
  currentDrive: undefined,
  currentStamp: undefined,
  drives: [],
  expiredDrives: [],
  adminDrive: null,
  initializationError: false,
  showError: false,
  shallReset: false,
  setCurrentDrive: () => {},
  setCurrentStamp: () => {},
  resync: async () => {},
  loadFolder: async () => {},
  reloadTrash: async () => {},
  isRecordLoading: false,
  // eslint-disable-next-line require-await
  init: async () => null,
  setShowError: () => {},
  syncDrives: async () => {},
  // eslint-disable-next-line require-await
  refreshStamp: async () => undefined,
}

export const Context = createContext<ContextInterface>(initialValues)
export const Consumer = Context.Consumer

interface Props {
  children: ReactNode
}

// --- path helpers -----------------------------------------------------------

/** The lib emits root-relative paths, but a few call sites still pass a leading '/'. */
const normalizePath = (path: string): string => path.replace(/^\/+/, '')

const isUnder = (path: string, base: string): boolean => path === base || path.startsWith(`${base}/`)

const rebase = (path: string, from: string, to: string): string =>
  path === from ? to : `${to}${path.slice(from.length)}`

const parentOf = (path: string): string => {
  const slash = path.lastIndexOf('/')

  return slash === -1 ? '' : path.slice(0, slash)
}

// --- list helpers -----------------------------------------------------------

const byTopic = (a: { topic: string }, b: { topic: string }): boolean => a.topic.toString() === b.topic.toString()

function upsert<T extends { topic: string }>(list: T[], item: T): T[] {
  const ix = list.findIndex(x => byTopic(x, item))

  if (ix === -1) return [...list, item]

  const next = [...list]
  next[ix] = item

  return next
}

function removeTopic<T extends { topic: string }>(list: T[], topic: string): T[] {
  return list.filter(x => x.topic.toString() !== topic.toString())
}

/**
 * Fold a shallow listing of one folder into an accumulated list.
 *
 * A shallow listing is authoritative for that folder's *direct children only*, so the merge drops
 * the previously known children of `parent` and keeps everything else — siblings and already-loaded
 * subtrees survive, and entries deleted elsewhere in the meantime do not linger under `parent`.
 */
function mergeChildren<T extends { path: string }>(prev: T[], fresh: T[], parent: string): T[] {
  return [...prev.filter(item => parentOf(item.path) !== parent), ...fresh]
}

/** Move every node under `from` (inclusive) out of `list`, rebased onto `to`. */
function detachSubtree<T extends { path: string }>(list: T[], from: string, to: string): { kept: T[]; moved: T[] } {
  const kept: T[] = []
  const moved: T[] = []

  list.forEach(item => {
    if (isUnder(item.path, from)) {
      moved.push({ ...item, path: rebase(item.path, from, to) })
    } else {
      kept.push(item)
    }
  })

  return { kept, moved }
}

const findDrives = (
  allDrives: readonly DriveInfo[],
  usableStamps: PostageBatch[],
): { adminDrive: DriveInfo | null; userDrives: DriveInfo[]; expiredDrives: DriveInfo[] } => {
  let adminDrive: DriveInfo | null = null
  const userDrives: DriveInfo[] = []
  const expiredDrives: DriveInfo[] = []

  allDrives.forEach(d => {
    const isNotExpired = usableStamps.some(s => s.batchID.toString() === d.batchId.toString())

    if (isNotExpired) {
      if (d.isAdmin) {
        adminDrive = d
      } else {
        userDrives.push(d)
      }
      // TODO: handle admin drive expiration!
    } else if (!d.isAdmin) {
      expiredDrives.push(d)
    }
  })

  return { adminDrive, userDrives, expiredDrives }
}

const splitEntries = (entries: NodeEntry[]): { files: FileRecord[]; folders: FolderInfo[] } => ({
  files: entries.filter((e): e is FileRecord => e.type === NodeType.File),
  folders: entries
    .filter((e): e is FolderInfo => e.type === NodeType.Folder)
    .map(f => ({ ...f, path: normalizePath(f.path) })),
})

export function Provider({ children }: Props) {
  const initInProgressRef = useRef<boolean>(false)
  const isBeeApiInitialized = useRef<boolean>(false)

  const { status } = useContext(BeeContext)
  const { apiUrl } = useContext(SettingsContext)
  const { swarmClient } = useContext(SwarmIdProvider)

  const apiUrlRef = useRef<string>(apiUrl)

  const [beeInstance, setBeeInstance] = useState<Bee | null>(null)
  const [fm, setFm] = useState<FileManagerBase | null>(null)
  const [initDone, setInitDone] = useState<boolean>(false)
  const [shallReset, setShallReset] = useState<boolean>(false)
  const [contents, setContents] = useState<Record<string, DriveContents>>({})
  const [loadingCount, setLoadingCount] = useState(0)
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [expiredDrives, setExpiredDrives] = useState<DriveInfo[]>([])
  const [adminDrive, setAdminDrive] = useState<DriveInfo | null>(null)
  const [currentDrive, setCurrentDrive] = useState<DriveInfo | undefined>()
  const [currentStamp, setCurrentStamp] = useState<PostageBatch | undefined>()

  const [initializationError, setInitializationError] = useState<boolean>(false)
  const [showError, setShowError] = useState<boolean>(false)

  const patchDrive = useCallback((driveId: string | undefined, fn: (c: DriveContents) => DriveContents): void => {
    if (!driveId) return

    setContents(prev => ({ ...prev, [driveId]: fn(prev[driveId] ?? EMPTY_CONTENTS) }))
  }, [])

  const dropDrive = useCallback((driveId: string): void => {
    setContents(prev => {
      if (!(driveId in prev)) return prev

      const next = { ...prev }
      delete next[driveId]

      return next
    })
  }, [])

  const syncDrives = useCallback(
    async (manager: FileManagerBase, di?: DriveInfo, remove?: boolean): Promise<void> => {
      if (!beeInstance) {
        return
      }

      const usableStamps = await getUsableStamps(beeInstance)

      if (di) {
        const isNotExpired = usableStamps.some(s => s.batchID.toString() === di.batchId.toString())

        if (isNotExpired) {
          if (remove) {
            setDrives(prev => prev.filter(d => d.id.toString() !== di.id.toString()))

            return
          }

          if (di.isAdmin) {
            setAdminDrive(di)

            return
          }

          setDrives(prev => {
            const existingIndex = prev.findIndex(d => d.id.toString() === di.id.toString())

            if (existingIndex >= 0) {
              const updated = [...prev]
              updated[existingIndex] = di

              return updated
            }

            return [...prev, di]
          })

          return
        }

        if (remove) {
          setExpiredDrives(prev => prev.filter(d => d.id.toString() !== di.id.toString()))

          return
        }

        if (!di.isAdmin) {
          setExpiredDrives(prev => {
            const exists = prev.some(d => d.id.toString() === di.id.toString())

            return exists ? prev : [...prev, di]
          })

          return
        }

        // TODO: handle admin drive expiration!
        return
      }

      const { adminDrive: tmpAdminDrive, userDrives, expiredDrives } = findDrives(manager.driveList, usableStamps)
      setAdminDrive(tmpAdminDrive)
      setDrives(userDrives)
      setExpiredDrives(expiredDrives)
    },
    [beeInstance],
  )

  const syncDrivesPublic = useCallback(async () => {
    if (fm) {
      await syncDrives(fm)
    }
  }, [fm, syncDrives])

  const refreshStamp = useCallback(
    async (batchId: string): Promise<PostageBatch | undefined> => {
      if (!beeInstance) {
        return
      }

      const usableStamps = await getUsableStamps(beeInstance)
      const refreshedStamp = usableStamps.find(s => s.batchID.toString() === batchId)

      setCurrentStamp(prev => {
        if (prev && prev.batchID.toString() === batchId && refreshedStamp) {
          return refreshedStamp
        }

        return prev
      })

      return refreshedStamp
    },
    [beeInstance],
  )

  // --- loaders --------------------------------------------------------------

  const tracked = useCallback(async (load: () => Promise<void>): Promise<void> => {
    setLoadingCount(n => n + 1)

    try {
      await load()
    } finally {
      setLoadingCount(n => n - 1)
    }
  }, [])

  const loadFolderContents = useCallback(
    (manager: FileManagerBase, driveId: string, path: string): Promise<void> =>
      tracked(async () => {
        const parent = normalizePath(path)
        const { files, folders } = splitEntries(await manager.listFolder(driveId, parent || '/', ListDepth.Shallow))

        patchDrive(driveId, c => ({
          ...c,
          files: mergeChildren(c.files, files, parent),
          folders: mergeChildren(c.folders, folders, parent),
        }))
      }),
    [patchDrive, tracked],
  )

  const loadTrashContents = useCallback(
    (manager: FileManagerBase, driveId: string): Promise<void> =>
      tracked(async () => {
        const { files, folders } = splitEntries(await manager.listTrash(driveId, ListDepth.Shallow))
        patchDrive(driveId, c => ({ ...c, trashFiles: files, trashFolders: folders }))
      }),
    [patchDrive, tracked],
  )

  const loadFolder = useCallback(
    async (path = '', driveId?: string): Promise<void> => {
      const id = driveId ?? currentDrive?.id.toString()

      if (!fm || !id) return

      await loadFolderContents(fm, id, path)
    },
    [fm, currentDrive, loadFolderContents],
  )

  const reloadTrash = useCallback(
    async (driveId?: string): Promise<void> => {
      const id = driveId ?? currentDrive?.id.toString()

      if (!fm || !id) return

      await loadTrashContents(fm, id)
    },
    [fm, currentDrive, loadTrashContents],
  )

  const init = useCallback(async (): Promise<FileManagerBase | null> => {
    const pk = getSignerPk()

    if (!beeInstance || !pk || initInProgressRef.current || !swarmClient) return null

    initInProgressRef.current = true

    setFm(null)
    setInitDone(false)
    setContents({})
    setDrives([])
    setAdminDrive(null)
    setInitializationError(false)
    setCurrentDrive(undefined)
    setCurrentStamp(undefined)
    setShallReset(false)

    const manager = new FileManagerBase(swarmClient)

    const handleInitialized = (success: boolean) => {
      setInitializationError(!success)
      setInitDone(true)

      if (success) {
        if (manager.adminStamp && !manager.adminStamp.usable) {
          // eslint-disable-next-line no-console
          console.warn('Admin stamp exists but is not usable')
          setShallReset(true)

          return
        }

        setFm(manager)
        syncDrives(manager)
      }
    }

    const handleResetState = (isInvalid: boolean) => {
      setShallReset(isInvalid)
      setContents({})
      setDrives([])
      setExpiredDrives([])
      setAdminDrive(null)
      setCurrentDrive(undefined)
      setCurrentStamp(undefined)
    }

    // --- file events: a record only ever lives in one of the two namespaces ---

    const upsertFile = ({ record }: { record?: FileRecord }) => {
      if (!record) return

      patchDrive(record.driveId, c => ({ ...c, files: upsert(c.files, record) }))
    }

    const handleFileTrashed = ({ driveId, record }: { driveId: string; record?: FileRecord }) => {
      if (!record) return

      patchDrive(driveId, c => ({
        ...c,
        files: removeTopic(c.files, record.topic),
        trashFiles: upsert(c.trashFiles, record),
      }))
    }

    const handleFileRecovered = ({ driveId, record }: { driveId: string; record?: FileRecord }) => {
      if (!record) return

      patchDrive(driveId, c => ({
        ...c,
        files: upsert(c.files, record),
        trashFiles: removeTopic(c.trashFiles, record.topic),
      }))
    }

    const handleFileForgotten = ({ driveId, record }: { driveId: string; record?: FileRecord }) => {
      if (!record) return

      patchDrive(driveId, c => ({
        ...c,
        files: removeTopic(c.files, record.topic),
        trashFiles: removeTopic(c.trashFiles, record.topic),
      }))
    }

    // --- folder events: a folder carries its whole subtree between namespaces ---

    const handleFolderCreated = ({ folderInfo }: { folderInfo: FolderInfo }) => {
      const normalized: FolderInfo = { ...folderInfo, path: normalizePath(folderInfo.path) }
      patchDrive(normalized.driveId, c => ({ ...c, folders: upsert(c.folders, normalized) }))
    }

    const handleFolderMoved = ({
      driveId,
      fromPath,
      toPath,
    }: {
      driveId: string
      fromPath: string
      toPath: string
    }) => {
      const from = normalizePath(fromPath)
      const to = normalizePath(toPath)

      patchDrive(driveId, c => {
        const movedFiles = detachSubtree(c.files, from, to)
        const movedFolders = detachSubtree(c.folders, from, to)

        return {
          ...c,
          files: [...movedFiles.kept, ...movedFiles.moved],
          folders: [...movedFolders.kept, ...movedFolders.moved],
        }
      })
    }

    const handleFolderTrashed = ({
      driveId,
      path,
      trashedPath,
    }: {
      driveId: string
      path: string
      trashedPath: string
    }) => {
      const from = normalizePath(path)
      const to = normalizePath(trashedPath)

      patchDrive(driveId, c => {
        const files = detachSubtree(c.files, from, to)
        const folders = detachSubtree(c.folders, from, to)

        return {
          files: files.kept,
          folders: folders.kept,
          trashFiles: [...c.trashFiles, ...files.moved],
          trashFolders: [...c.trashFolders, ...folders.moved],
        }
      })
    }

    const handleFolderRecovered = ({
      driveId,
      trashedPath,
      restoredPath,
    }: {
      driveId: string
      trashedPath: string
      restoredPath: string
    }) => {
      const from = normalizePath(trashedPath)
      const to = normalizePath(restoredPath)

      patchDrive(driveId, c => {
        const files = detachSubtree(c.trashFiles, from, to)
        const folders = detachSubtree(c.trashFolders, from, to)

        return {
          files: [...c.files, ...files.moved],
          folders: [...c.folders, ...folders.moved],
          trashFiles: files.kept,
          trashFolders: folders.kept,
        }
      })
    }

    const handleFolderForgotten = ({ driveId, path }: { driveId: string; path: string }) => {
      const base = normalizePath(path)
      const drop = <T extends { path: string }>(list: T[]): T[] => list.filter(item => !isUnder(item.path, base))

      patchDrive(driveId, c => ({
        files: drop(c.files),
        folders: drop(c.folders),
        trashFiles: drop(c.trashFiles),
        trashFolders: drop(c.trashFolders),
      }))
    }

    manager.emitter.on(FileManagerEvents.STATE_INVALID, handleResetState)
    manager.emitter.on(FileManagerEvents.INITIALIZED, handleInitialized)
    manager.emitter.on(FileManagerEvents.DRIVE_CREATED, ({ driveInfo }: { driveInfo: DriveInfo }) =>
      syncDrives(manager, driveInfo),
    )
    manager.emitter.on(FileManagerEvents.DRIVE_FORGOTTEN, ({ driveInfo }: { driveInfo: DriveInfo }) => {
      syncDrives(manager, driveInfo, true)
      dropDrive(driveInfo.id.toString())
    })

    manager.emitter.on(FileManagerEvents.FILE_UPLOADED, (payload: { record: FileRecord }) => {
      upsertFile(payload)
      window.dispatchEvent(new CustomEvent(FILE_MANAGER_EVENTS.FILE_UPLOADED, { detail: { fileInfo: payload.record } }))
    })
    manager.emitter.on(FileManagerEvents.FILE_UPDATED, upsertFile)
    manager.emitter.on(FileManagerEvents.FILE_MOVED, upsertFile)
    manager.emitter.on(FileManagerEvents.FILE_VERSION_RESTORED, ({ restored }: { restored: FileRecord }) =>
      upsertFile({ record: restored }),
    )
    manager.emitter.on(FileManagerEvents.FILE_TRASHED, handleFileTrashed)
    manager.emitter.on(FileManagerEvents.FILE_RECOVERED, handleFileRecovered)
    manager.emitter.on(FileManagerEvents.FILE_FORGOTTEN, handleFileForgotten)

    manager.emitter.on(FileManagerEvents.FOLDER_CREATED, handleFolderCreated)
    manager.emitter.on(FileManagerEvents.FOLDER_MOVED, handleFolderMoved)
    manager.emitter.on(FileManagerEvents.FOLDER_TRASHED, handleFolderTrashed)
    manager.emitter.on(FileManagerEvents.FOLDER_RECOVERED, handleFolderRecovered)
    manager.emitter.on(FileManagerEvents.FOLDER_FORGOTTEN, handleFolderForgotten)
    manager.emitter.on(FileManagerEvents.TRASH_EMPTIED, ({ driveId }: { driveId: string }) =>
      patchDrive(driveId, c => ({ ...c, trashFiles: [], trashFolders: [] })),
    )

    try {
      await manager.initialize()

      return manager
    } catch {
      setInitDone(true)

      return null
    } finally {
      initInProgressRef.current = false
    }
  }, [beeInstance, swarmClient, syncDrives, patchDrive, dropDrive])

  const resync = useCallback(async (): Promise<void> => {
    const prevDriveId = currentDrive?.id.toString()
    const prevStamp = currentStamp

    const manager = await init()

    if (prevDriveId && manager && beeInstance) {
      const refreshedDrive = manager.driveList.find(d => d.id.toString() === prevDriveId)
      // setCurrentDrive triggers the drive-load effect below, which lists the drive and fills its slot.
      setCurrentDrive(refreshedDrive)

      const uStamps: PostageBatch[] = await getUsableStamps(beeInstance)
      const isValidCurrentStamp = uStamps.find(s => s.batchID.toString() === prevStamp?.batchID.toString())

      setCurrentStamp(isValidCurrentStamp)
    }
  }, [beeInstance, currentDrive?.id, currentStamp, init])

  useEffect(() => {
    if (!fm || !currentDrive) return

    loadFolderContents(fm, currentDrive.id.toString(), '').catch(e => {
      // eslint-disable-next-line no-console
      console.error('Failed to load drive files', e)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fm, currentDrive?.id])

  useEffect(() => {
    apiUrlRef.current = apiUrl
  }, [apiUrl])

  useEffect(() => {
    const isConnecting = status.all === CheckState.CONNECTING
    const isApiOk = status.apiConnection.isEnabled && status.apiConnection.checkState === CheckState.OK
    const currentApiUrl = apiUrlRef.current
    const pk = getSignerPk()

    if (!currentApiUrl || !pk) {
      isBeeApiInitialized.current = false
      setBeeInstance(null)

      return
    }

    if (isConnecting) {
      return
    }

    if (isBeeApiInitialized.current) {
      return
    }

    if (!isApiOk) {
      return
    }

    isBeeApiInitialized.current = true
    setBeeInstance(new Bee(currentApiUrl, { signer: pk }))
  }, [status.all, status.apiConnection, swarmClient])

  useEffect(() => {
    isBeeApiInitialized.current = false
    setBeeInstance(null)
    setInitDone(false)
    initInProgressRef.current = false
  }, [apiUrl])

  useEffect(() => {
    if (swarmClient) {
      return
    }

    setFm(null)
    setInitDone(false)
    setContents({})
    setDrives([])
    setExpiredDrives([])
    setAdminDrive(null)
    setCurrentDrive(undefined)
    setCurrentStamp(undefined)
    setInitializationError(false)
    setShallReset(false)
  }, [swarmClient])

  useEffect(() => {
    if (!beeInstance || initInProgressRef.current) {
      return
    }

    const initFromLocalState = async () => {
      await init()
    }

    initFromLocalState()
  }, [beeInstance, init])

  useEffect(() => {
    if (fm && drives.length === 0 && !adminDrive) {
      syncDrives(fm)
    }
  }, [fm, drives.length, adminDrive, syncDrives])

  const current = (currentDrive && contents[currentDrive.id]) || EMPTY_CONTENTS

  const allFiles = useMemo(() => Object.values(contents).flatMap(c => [...c.files, ...c.trashFiles]), [contents])

  const contextValue = useMemo(
    () => ({
      fm,
      initDone,
      files: allFiles,
      driveFiles: current.files,
      folders: current.folders,
      trashFiles: current.trashFiles,
      trashFolders: current.trashFolders,
      currentDrive,
      currentStamp,
      drives,
      expiredDrives,
      adminDrive,
      initializationError,
      showError,
      shallReset,
      setCurrentDrive,
      setCurrentStamp,
      resync,
      loadFolder,
      reloadTrash,
      isRecordLoading: loadingCount > 0,
      init,
      setShowError,
      syncDrives: syncDrivesPublic,
      refreshStamp,
    }),
    [
      fm,
      initDone,
      allFiles,
      current,
      currentDrive,
      currentStamp,
      drives,
      expiredDrives,
      adminDrive,
      initializationError,
      showError,
      shallReset,
      setCurrentDrive,
      setCurrentStamp,
      resync,
      loadFolder,
      reloadTrash,
      loadingCount,
      init,
      setShowError,
      syncDrivesPublic,
      refreshStamp,
    ],
  )

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

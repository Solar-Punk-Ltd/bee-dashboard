import type { DriveInfo, FileRecord, UpdateItem, UploadItem } from '@solarpunkltd/file-manager-lib'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { ItemType, useView } from '../../../pages/filemanager/ViewContext'
import { Context as FMContext } from '../../../providers/FileManager'
import { Context as SettingsContext } from '../../../providers/Settings'
import { uuidV4 } from '../../../utils'
import { FILE_MANAGER_EVENTS } from '../constants/common'
import {
  DownloadProgress,
  DownloadState,
  FileTransferType,
  TrackDownloadProps,
  TransferStatus,
} from '../constants/transfers'
import { AbortManager } from '../utils/abortManager'
import { validateStampStillExists, verifyDriveSpace } from '../utils/bee'
import { formatBytes, isTrashed, safeSetState, truncateNameMiddle } from '../utils/common'
import { abortDownload } from '../utils/download'

import { ConflictAction, useUploadConflictDialog } from './useUploadConflictDialog'

const SAMPLE_WINDOW_MS = 500
const ETA_SMOOTHING = 0.3
const MAX_UPLOAD_FILES = 10
const MAX_PARALLEL_UPLOAD_FILES = 2
const ABORT_EVENT = 'abort'

type ResolveResult = {
  cancelled: boolean
  finalName?: string
  isReplace: boolean
  replaceTopic?: string
  replaceHistory?: string
}

type TransferItem = {
  uuid: string
  name: string
  size?: string
  percent: number
  status: TransferStatus
  kind?: FileTransferType
  driveName?: string
  startedAt?: number
  etaSec?: number
  elapsedSec?: number
}

type ETAState = {
  lastTs?: number
  lastProcessed: number
  lastEta?: number
}

type UploadMeta = Record<string, string | number | File[]>

type UploadTask = {
  uuid: string
  file: File
  finalName: string
  prettySize?: string
  isReplace: boolean
  replaceTopic?: string
  replaceHistory?: string
  driveId: string
  driveName: string
}

const isNameInvalid = (
  finalName: string,
  isReplace: boolean,
  replaceHistory?: string,
  replaceTopic?: string,
): boolean => {
  const invalidCombo = isReplace && (!replaceHistory || !replaceTopic)
  const invalidName = !finalName || finalName.trim().length === 0

  return invalidCombo || invalidName
}

const normalizeCustomMetadata = (meta: UploadMeta): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta)) out[k] = typeof v === 'string' ? v : String(v)

  return out
}

// Parent folder path of a full drive-relative path ('' for a drive-root entry).
const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
// Bare filename (last segment) of a full path.
const baseOf = (path: string): string => path.split('/').pop() ?? path

const buildUploadMeta = (
  files: File[] | FileList,
  path?: string,
  existingFile?: FileRecord,
  isFolder = false,
): UploadMeta => {
  const arr = Array.from(files as File[])
  const totalSize = arr.reduce((acc, f) => acc + (f.size || 0), 0)
  const primary = arr[0]

  const previousAccumulated = existingFile
    ? Number(existingFile.customMetadata?.accumulatedSize || existingFile.customMetadata?.size || 0)
    : 0
  const accumulatedSize = previousAccumulated + files.length

  const meta: UploadMeta = {
    size: String(totalSize),
    fileCount: String(arr.length),
    mime: isFolder ? ItemType.Folder : primary?.type || 'application/octet-stream',
    accumulatedSize: String(accumulatedSize),
  }

  if (path) meta.path = path

  return meta
}

const calculateETA = (
  etaState: ETAState,
  progress: { processed: number; total: number },
  startedAt: number,
  now: number,
): { etaSec?: number; updatedState: ETAState } => {
  const dt = etaState.lastTs ? (now - etaState.lastTs) / 1000 : 0

  if (dt >= SAMPLE_WINDOW_MS / 1000) {
    const dBytes = Math.max(0, progress.processed - etaState.lastProcessed)
    const instSpeed = dBytes > 0 && dt > 0 ? dBytes / dt : 0
    const remaining = Math.max(0, progress.total - progress.processed)
    const rawEta = instSpeed > 0 ? remaining / instSpeed : undefined

    const avgDt = (now - startedAt) / 1000
    const avgSpeed = avgDt > 0 && progress.processed > 0 ? progress.processed / avgDt : 0
    const avgEta = avgSpeed > 0 ? remaining / avgSpeed : undefined

    const freshEta = rawEta ?? avgEta
    let etaSec: number | undefined

    if (freshEta !== undefined) {
      etaSec =
        etaState.lastEta !== undefined ? (1 - ETA_SMOOTHING) * etaState.lastEta + ETA_SMOOTHING * freshEta : freshEta
    }

    return {
      etaSec,
      updatedState: {
        lastTs: now,
        lastProcessed: progress.processed,
        lastEta: etaSec,
      },
    }
  }

  return {
    etaSec: etaState.lastEta,
    updatedState: etaState,
  }
}

const updateTransferItems = <T extends TransferItem>(items: T[], uuid: string, update: Partial<T>): T[] => {
  return items.map(item => {
    const matches = item.uuid === uuid

    return matches ? { ...item, ...update } : item
  })
}

const getUploadCancelPromise = (signal: AbortSignal | undefined): { promise: Promise<never>; cleanup: () => void } => {
  let reject: (reason?: Error) => void
  const abortHandler = () => {
    reject(new Error('Upload cancelled'))
  }
  const promise = new Promise<never>((_, rej) => {
    reject = rej
    signal?.addEventListener(ABORT_EVENT, abortHandler)
  })

  return { promise, cleanup: () => signal?.removeEventListener(ABORT_EVENT, abortHandler) }
}

const createTransferItem = (
  uuid: string,
  name: string,
  size: string | undefined,
  kind: FileTransferType,
  driveName?: string,
  status: TransferStatus = TransferStatus.Uploading,
): TransferItem => ({
  uuid,
  name,
  size,
  percent: 0,
  status,
  kind,
  driveName,
  startedAt: status === TransferStatus.Queued ? undefined : Date.now(),
  etaSec: undefined,
  elapsedSec: undefined,
})

interface TransferProps {
  setErrorMessage?: (error: string) => void
}

export function useTransfers({ setErrorMessage }: TransferProps) {
  const { fm, adminDrive, currentDrive, currentStamp, files, setShowError, refreshStamp } = useContext(FMContext)
  const { beeApi } = useContext(SettingsContext)
  const { viewFolders } = useView()
  const [openConflict, conflictPortal] = useUploadConflictDialog()

  // Current folder path within the drive manifest (empty string = drive root). Uploads land here.
  const currentPath = viewFolders.map(f => f.folderName).join('/')

  const isMountedRef = useRef<boolean>(true)
  const uploadAbortsRef = useRef<AbortManager>(new AbortManager())
  const uploadTaskQueueRef = useRef<UploadTask[]>([])
  const runningRef = useRef<boolean>(false)
  const cancelledQueuedRef = useRef<Set<string>>(new Set())
  const cancelledUploadingRef = useRef<Set<string>>(new Set())
  const cancelledDownloadingRef = useRef<Set<string>>(new Set())

  const [uploadItems, setUploadItems] = useState<TransferItem[]>([])
  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])

  const isUploading = uploadItems.some(
    i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error && i.status !== TransferStatus.Cancelled,
  )
  const isDownloading = downloadItems.some(
    i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error && i.status !== TransferStatus.Cancelled,
  )

  const clearAllFlagsFor = useCallback((uuid: string) => {
    cancelledQueuedRef.current.delete(uuid)
    cancelledUploadingRef.current.delete(uuid)
    uploadAbortsRef.current.abort(uuid)
    uploadTaskQueueRef.current = uploadTaskQueueRef.current.filter(t => {
      return t.uuid !== uuid
    })
  }, [])

  const ensureQueuedRow = useCallback(
    (uuid: string, name: string, kind: FileTransferType, size?: string, driveName?: string) => {
      safeSetState(
        isMountedRef,
        setUploadItems,
      )(prev => {
        const idx = prev.findIndex(p => p.uuid === uuid && p.status !== TransferStatus.Done)
        const base = createTransferItem(uuid, name, size, kind, driveName, TransferStatus.Queued)

        if (idx === -1) return [...prev, base]

        clearAllFlagsFor(uuid)

        const copy = [...prev]
        copy[idx] = base

        return copy
      })
    },
    [clearAllFlagsFor],
  )

  const collectSameDrive = useCallback(
    (id: string): FileRecord[] => files.filter(fi => fi.driveId.toString() === id),
    [files],
  )

  const resolveConflict = useCallback(
    async (originalName: string, sameDrive: FileRecord[], allTakenNames: Set<string>): Promise<ResolveResult> => {
      // A file "already exists" only if it sits in the CURRENT folder under the same name — compare
      // against the full target path (currentPath + name), not the bare filename against every path.
      const fullTarget = currentPath ? `${currentPath}/${originalName}` : originalName
      const taken = sameDrive.filter(fi => fi.path === fullTarget)

      if (!taken.length && !allTakenNames.has(originalName)) {
        return { cancelled: false, finalName: originalName, isReplace: false }
      }

      const existing = taken[0]
      const isTrashedExisting = existing ? isTrashed(existing) : false

      if (!existing && allTakenNames.has(originalName)) {
        return { cancelled: false, finalName: originalName, isReplace: false }
      }

      const choice = await openConflict({
        originalName,
        existingNames: allTakenNames,
        isTrashedExisting,
      })

      if (choice.action === ConflictAction.Cancel) {
        return { cancelled: true, isReplace: false }
      }

      if (choice.action === ConflictAction.KeepBoth) {
        return { cancelled: false, finalName: (choice.newName ?? '').trim(), isReplace: false }
      }

      return {
        cancelled: false,
        finalName: originalName,
        isReplace: true,
        replaceTopic: existing?.topic.toString(),
        replaceHistory: existing?.content.historyRef.toString(),
      }
    },
    [openConflict, currentPath],
  )

  const executeUploadTask = useCallback(
    async (task: UploadTask) => {
      if (!fm) return

      const taskDrive = fm.driveList.find(d => d.id.toString() === task.driveId)

      if (!taskDrive) {
        return
      }

      const startedAt = Date.now()

      safeSetState(
        isMountedRef,
        setUploadItems,
      )(prev =>
        updateTransferItems(prev, task.uuid, {
          status: TransferStatus.Uploading,
          kind: task.isReplace ? FileTransferType.Update : FileTransferType.Upload,
          startedAt,
        }),
      )

      uploadAbortsRef.current.create(task.uuid)
      const signal = uploadAbortsRef.current.getSignal(task.uuid)

      const { promise: checkCancellation, cleanup: cleanupCancelPromise } = getUploadCancelPromise(signal)

      try {
        if (signal?.aborted) {
          throw new Error('Upload cancelled')
        }

        if (task.isReplace) {
          // Replace = new content for an existing file's topic → updateFile keeps its version history
          // (a plain uploadFile would mint a new topic and duplicate the file).
          const existingRecord = files.find(f => f.topic.toString() === task.replaceTopic)

          if (!existingRecord) {
            throw new Error('The file to replace was not found')
          }

          const changes: UpdateItem = { item: { file: task.file } }

          await Promise.race([
            fm.updateFile(taskDrive.id, existingRecord, changes, undefined, { signal }),
            checkCancellation,
          ])
        } else {
          const item: UploadItem = {
            path: currentPath ? `${currentPath}/${task.finalName}` : task.finalName,
            file: task.file,
            customMetadata: normalizeCustomMetadata(buildUploadMeta([task.file])),
          }

          await Promise.race([fm.uploadFile(taskDrive.id, item, undefined, { signal }), checkCancellation])
        }

        // The new lib no longer streams byte progress, so completion is marked here on resolve.
        safeSetState(
          isMountedRef,
          setUploadItems,
        )(prev =>
          updateTransferItems(prev, task.uuid, {
            percent: 100,
            status: TransferStatus.Done,
            kind: task.isReplace ? FileTransferType.Update : FileTransferType.Upload,
            etaSec: 0,
            elapsedSec: Math.round((Date.now() - startedAt) / 1000),
          }),
        )
      } catch (error) {
        const wasCancelled = cancelledUploadingRef.current.has(task.uuid) || signal?.aborted

        if (!wasCancelled) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          setErrorMessage?.(`Upload failed: ${errorMsg}`)
          setShowError(true)
        }

        safeSetState(
          isMountedRef,
          setUploadItems,
        )(prev =>
          updateTransferItems(prev, task.uuid, {
            status: wasCancelled ? TransferStatus.Cancelled : TransferStatus.Error,
          }),
        )
      } finally {
        cleanupCancelPromise()

        const wasCancelled = cancelledUploadingRef.current.has(task.uuid) || signal?.aborted

        if (!wasCancelled) {
          uploadAbortsRef.current.abort(task.uuid)
          cancelledUploadingRef.current.delete(task.uuid)
          cancelledQueuedRef.current.delete(task.uuid)
        }
      }
    },
    [fm, files, currentPath, setShowError, setErrorMessage],
  )

  const trackDownload = useCallback((props: TrackDownloadProps) => {
    if (!isMountedRef.current) {
      return () => {
        // No-op function for unmounted component
      }
    }

    let startedAt: number | undefined
    let etaState: ETAState = {
      lastTs: undefined,
      lastProcessed: 0,
      lastEta: undefined,
    }

    setDownloadItems(prev => {
      const row = createTransferItem(
        props.uuid,
        props.name,
        props.size,
        FileTransferType.Download,
        props.driveName,
        TransferStatus.Downloading,
      )
      row.startedAt = undefined
      const idx = prev.findIndex(p => p.uuid === props.uuid)

      if (idx === -1) return [...prev, row]
      const out = [...prev]
      out[idx] = { ...row, startedAt: prev[idx].startedAt ?? row.startedAt }

      return out
    })

    const onProgress = (dp: DownloadProgress) => {
      if (!isMountedRef.current) return

      const now = Date.now()

      if (!startedAt) {
        startedAt = now
        etaState.lastTs = now
      }

      let percent = 0
      let etaSec: number | undefined

      if (props.expectedSize && props.expectedSize > 0 && dp.progress >= 0) {
        percent = Math.floor((dp.progress / props.expectedSize) * 100)
        const result = calculateETA(etaState, { processed: dp.progress, total: props.expectedSize }, startedAt, now)
        etaSec = result.etaSec
        etaState = result.updatedState
      }

      setDownloadItems(prev =>
        updateTransferItems(prev, props.uuid, {
          percent: Math.max(prev.find(it => it.uuid === props.uuid)?.percent || 0, percent),
          etaSec,
          startedAt: prev.find(it => it.uuid === props.uuid)?.startedAt ?? startedAt,
        }),
      )

      if (!dp.isDownloading) {
        const finishedAt = Date.now()

        setDownloadItems(prev => {
          const currentItem = prev.find(it => it.uuid === props.uuid)
          const elapsedSec = currentItem?.startedAt ? Math.round((finishedAt - currentItem.startedAt) / 1000) : 0

          if (dp.state === DownloadState.Cancelled || dp.state === DownloadState.Error) {
            const wasCancelled = dp.state === DownloadState.Cancelled || cancelledDownloadingRef.current.has(props.uuid)

            cancelledDownloadingRef.current.delete(props.uuid)

            return updateTransferItems(prev, props.uuid, {
              status: wasCancelled ? TransferStatus.Cancelled : TransferStatus.Error,
              etaSec: undefined,
              elapsedSec: 0,
              percent: currentItem?.percent ?? 0,
            })
          }

          return updateTransferItems(prev, props.uuid, {
            percent: 100,
            status: TransferStatus.Done,
            etaSec: 0,
            elapsedSec,
          })
        })
      }
    }

    return onProgress
  }, [])

  const { allTaken, reserved, sameDrive } = useMemo(() => {
    if (!currentDrive) {
      return { allTaken: new Set(''), reserved: new Set(''), sameDrive: [] }
    }

    const progressNames = new Set<string>(uploadItems.filter(u => u.driveName === currentDrive.name).map(u => u.name))
    const sameDrive = collectSameDrive(currentDrive.id.toString())
    // Names taken IN THE CURRENT FOLDER only (basenames of siblings) — used for conflict detection and
    // "keep both" copy-name suggestions. A same-named file in another folder is not a conflict here.
    const onDiskNames = new Set<string>(
      sameDrive.filter((fi: FileRecord) => parentOf(fi.path) === currentPath).map((fi: FileRecord) => baseOf(fi.path)),
    )
    const reserved = new Set<string>()

    const allTaken = new Set<string>([
      ...Array.from(onDiskNames),
      ...Array.from(reserved),
      ...Array.from(progressNames),
    ])

    return {
      allTaken,
      reserved,
      sameDrive,
    }
  }, [currentDrive, collectSameDrive, uploadItems, currentPath])

  const createUploadTask = useCallback(
    async (file: File, drive: DriveInfo): Promise<UploadTask | null> => {
      const uuid = uuidV4()

      const meta = buildUploadMeta([file])
      const prettySize = formatBytes(meta.size)

      let { finalName, isReplace, replaceTopic, replaceHistory } = await resolveConflict(file.name, sameDrive, allTaken)
      finalName = finalName ?? ''

      if (isNameInvalid(finalName, isReplace, replaceHistory, replaceTopic)) {
        return null
      }

      if (reserved.has(finalName)) {
        const retryTaken = new Set<string>([...Array.from(allTaken), finalName])
        const retry = await resolveConflict(finalName, sameDrive, retryTaken)
        finalName = retry.finalName ?? ''
        isReplace = retry.isReplace
        replaceTopic = retry.replaceTopic
        replaceHistory = retry.replaceHistory
      }

      if (isNameInvalid(finalName, isReplace, replaceHistory, replaceTopic)) {
        return null
      }

      reserved.add(finalName)

      ensureQueuedRow(
        uuid,
        finalName,
        isReplace ? FileTransferType.Update : FileTransferType.Upload,
        prettySize,
        drive.name,
      )

      return {
        uuid,
        file,
        finalName,
        prettySize,
        isReplace: Boolean(isReplace),
        replaceTopic,
        replaceHistory,
        driveId: drive.id.toString(),
        driveName: drive.name,
      }
    },
    [allTaken, ensureQueuedRow, reserved, resolveConflict, sameDrive],
  )

  const preflight = useCallback(
    async (filesArr: File[]): Promise<UploadTask[]> => {
      if (!currentDrive || !fm) return []

      if (!currentStamp || !currentStamp.usable) {
        setErrorMessage?.('Stamp is not usable.')
        setShowError(true)

        return []
      }

      const tasks: UploadTask[] = []
      const inFlightSize = uploadTaskQueueRef.current.reduce((sum, t) => sum + t.file.size, 0)
      const inFlightCount = uploadTaskQueueRef.current.length
      let currentFileSizeSum = inFlightSize

      for (let i = 0; i < filesArr.length; i++) {
        const file = filesArr[i]
        currentFileSizeSum += file.size
        const fileCount = inFlightCount + i + 1

        const { ok } = verifyDriveSpace({
          fm,
          redundancyLevel: currentDrive.redundancyLevel,
          stamp: currentStamp,
          useInfoSize: true,
          driveId: currentDrive.id.toString(),
          adminRedundancy: adminDrive?.redundancyLevel,
          fileSize: currentFileSizeSum,
          fileCount,
          cb: err => {
            setErrorMessage?.(err + ' (' + truncateNameMiddle(file.name) + ')')
            setShowError(true)
          },
        })

        if (!ok) {
          break
        }

        const task = await createUploadTask(file, currentDrive)

        if (!task) {
          break
        }

        tasks.push(task)
      }

      return tasks
    },
    [fm, currentDrive, currentStamp, adminDrive, createUploadTask, setErrorMessage, setShowError],
  )

  const runUploadQueue = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true

    const processNextTask = async (): Promise<void> => {
      while (uploadTaskQueueRef.current.length > 0) {
        const task = uploadTaskQueueRef.current.shift()

        if (!task) break

        if (cancelledQueuedRef.current.has(task.uuid)) {
          safeSetState(
            isMountedRef,
            setUploadItems,
          )(prev => updateTransferItems(prev, task.uuid, { status: TransferStatus.Cancelled }))
          cancelledQueuedRef.current.delete(task.uuid)
        } else {
          await executeUploadTask(task)
        }
      }
    }

    const workers: Promise<void>[] = []
    for (let i = 0; i < MAX_PARALLEL_UPLOAD_FILES; i++) {
      workers.push(processNextTask())
    }

    await Promise.all(workers)

    runningRef.current = false

    // Race guard: uploadFiles may have appended tasks and called runUploadQueue() again
    if (uploadTaskQueueRef.current.length > 0) {
      void runUploadQueue()
    }

    if (currentStamp) {
      await refreshStamp(currentStamp.batchID.toString())
    }
  }, [currentStamp, executeUploadTask, refreshStamp])

  const verifyUploadConditions = useCallback(
    async (filesArr: File[]): Promise<boolean> => {
      if (filesArr.length === 0) {
        setErrorMessage?.('Nothing to upload.')
        setShowError(true)

        return false
      }

      if (!fm || !currentDrive) {
        setErrorMessage?.('File manager is not ready or no drive is selected.')
        setShowError(true)

        return false
      }

      if (!currentStamp || !currentStamp.usable) {
        setErrorMessage?.('Stamp is not usable.')
        setShowError(true)

        return false
      }

      const currentlyQueued = uploadTaskQueueRef.current.length
      const newFilesCount = filesArr.length
      const totalAfterAdd = currentlyQueued + newFilesCount

      if (totalAfterAdd > MAX_UPLOAD_FILES) {
        setErrorMessage?.(
          `You’re trying to upload ${totalAfterAdd} files, but the limit is ${MAX_UPLOAD_FILES}. Please upload fewer files.`,
        )
        setShowError(true)

        return false
      }

      if (beeApi) {
        const batchID = currentStamp.batchID
        const stampValid = await validateStampStillExists(beeApi, batchID)

        if (!stampValid) {
          setErrorMessage?.(
            `The selected stamp ${batchID.toString().slice(0, 4)} is no longer valid or has been deleted. Please select a different stamp.`,
          )
          setShowError(true)

          return false
        }
      }

      return true
    },
    [fm, currentStamp, currentDrive, beeApi, setShowError, setErrorMessage],
  )

  const uploadFolder = useCallback(
    async (picked: File[], folderName?: string): Promise<void> => {
      if (!fm || !currentDrive) {
        setErrorMessage?.('File manager is not ready or no drive is selected.')
        setShowError(true)

        return
      }

      if (!currentStamp || !currentStamp.usable) {
        setErrorMessage?.('Stamp is not usable.')
        setShowError(true)

        return
      }

      // Directory markers are empty File([]) entries (type ItemType.Folder / trailing-slash name).
      // The lib rebuilds the folder hierarchy from each file's relative path, so only real files are sent.
      const realFiles = picked.filter(f => f.type !== ItemType.Folder && !f.name.endsWith('/'))

      if (!realFiles.length) {
        setErrorMessage?.('The selected folder has no files to upload.')
        setShowError(true)

        return
      }

      const totalSize = realFiles.reduce((sum, f) => sum + (f.size || 0), 0)

      const { ok } = verifyDriveSpace({
        fm,
        redundancyLevel: currentDrive.redundancyLevel,
        stamp: currentStamp,
        useInfoSize: true,
        driveId: currentDrive.id.toString(),
        adminRedundancy: adminDrive?.redundancyLevel,
        fileSize: totalSize,
        fileCount: realFiles.length,
        cb: err => {
          setErrorMessage?.(err)
          setShowError(true)
        },
      })

      if (!ok) {
        return
      }

      const uuid = uuidV4()
      const displayName = folderName ?? 'folder'
      const startedAt = Date.now()

      ensureQueuedRow(uuid, displayName, FileTransferType.Upload, formatBytes(totalSize) ?? '0', currentDrive.name)
      safeSetState(
        isMountedRef,
        setUploadItems,
      )(prev => updateTransferItems(prev, uuid, { status: TransferStatus.Uploading, startedAt }))

      uploadAbortsRef.current.create(uuid)
      const signal = uploadAbortsRef.current.getSignal(uuid)

      // Each File's name is its path relative to the picked folder, e.g. "myFolder/sub/a.txt".
      const items: UploadItem[] = realFiles.map(f => {
        const relativePath = f.name.replace(/^\/+/, '')

        return {
          path: relativePath,
          file: f,
          customMetadata: normalizeCustomMetadata(buildUploadMeta([f], relativePath)),
        }
      })

      try {
        const result = await fm.uploadFiles(currentDrive.id, items, currentPath, undefined, { signal })
        const failedCount = result.failed?.length ?? 0

        safeSetState(
          isMountedRef,
          setUploadItems,
        )(prev =>
          updateTransferItems(prev, uuid, {
            percent: 100,
            status: failedCount ? TransferStatus.Error : TransferStatus.Done,
            etaSec: 0,
            elapsedSec: Math.round((Date.now() - startedAt) / 1000),
          }),
        )

        if (failedCount) {
          setErrorMessage?.(`${failedCount} of ${items.length} file(s) failed to upload.`)
          setShowError(true)
        }
      } catch (error) {
        const wasCancelled = signal?.aborted

        if (!wasCancelled) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          setErrorMessage?.(`Folder upload failed: ${errorMsg}`)
          setShowError(true)
        }

        safeSetState(
          isMountedRef,
          setUploadItems,
        )(prev =>
          updateTransferItems(prev, uuid, {
            status: wasCancelled ? TransferStatus.Cancelled : TransferStatus.Error,
          }),
        )
      } finally {
        uploadAbortsRef.current.abort(uuid)

        if (currentStamp) {
          await refreshStamp(currentStamp.batchID.toString())
        }
      }
    },
    [
      fm,
      currentDrive,
      currentStamp,
      adminDrive,
      currentPath,
      ensureQueuedRow,
      setErrorMessage,
      setShowError,
      refreshStamp,
    ],
  )

  const uploadFiles = useCallback(
    async (picked: FileList | File[], isFolder = false, folderName?: string): Promise<void> => {
      const filesArr = Array.from(picked)

      if (isFolder) {
        await uploadFolder(filesArr, folderName)

        return
      }

      if (!(await verifyUploadConditions(filesArr))) {
        return
      }

      const tasks = await preflight(filesArr)
      uploadTaskQueueRef.current = uploadTaskQueueRef.current.concat(tasks)
      runUploadQueue()
    },
    [uploadFolder, verifyUploadConditions, preflight, runUploadQueue],
  )

  const cancelOrDismissUpload = useCallback(
    (uuid: string) => {
      safeSetState(
        isMountedRef,
        setUploadItems,
      )(prev => {
        const row = prev.find(r => r.uuid === uuid)

        if (!row) return prev

        if (row.status === TransferStatus.Queued) {
          cancelledQueuedRef.current.add(row.uuid)
          uploadTaskQueueRef.current = uploadTaskQueueRef.current.filter(t => t.uuid !== row.uuid)

          return prev.map(r => (r.uuid === row.uuid ? { ...r, status: TransferStatus.Cancelled } : r))
        }

        if (row.status === TransferStatus.Uploading) {
          cancelledUploadingRef.current.add(row.uuid)
          uploadAbortsRef.current.abort(row.uuid)

          return prev.map(r => (r.uuid === uuid ? { ...r, status: TransferStatus.Cancelled } : r))
        }

        clearAllFlagsFor(row.uuid)

        return prev.filter(r => r.uuid !== uuid)
      })
    },
    [clearAllFlagsFor],
  )

  const cancelOrDismissDownload = useCallback((uuid: string) => {
    safeSetState(
      isMountedRef,
      setDownloadItems,
    )(prev => {
      const row = prev.find(r => r.uuid === uuid)

      if (!row) return prev

      if (row.status === TransferStatus.Downloading) {
        cancelledDownloadingRef.current.add(uuid)
        abortDownload(uuid)

        return prev.map(r => (r.uuid === uuid ? { ...r, status: TransferStatus.Cancelled } : r))
      }

      cancelledDownloadingRef.current.delete(uuid)

      return prev.filter(r => r.uuid !== uuid)
    })
  }, [])

  const dismissAllUploads = useCallback(() => {
    uploadAbortsRef.current.clear()
    uploadTaskQueueRef.current = []
    cancelledQueuedRef.current.clear()
    cancelledUploadingRef.current.clear()
    setUploadItems([])
  }, [])

  const dismissAllDownloads = useCallback(() => {
    setDownloadItems([])
    cancelledDownloadingRef.current.clear()
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const handleFileUploaded = (e: Event) => {
      const { fileInfo } = (e as CustomEvent).detail || {}

      if (!fileInfo) return

      setUploadItems(prev => {
        const item = prev.find(it => it.name === fileInfo.path && it.status === TransferStatus.Uploading)

        if (!item) return prev

        const elapsedSec = item.startedAt ? Math.round((Date.now() - item.startedAt) / 1000) : 0

        return updateTransferItems(prev, item.uuid, {
          percent: 100,
          status: TransferStatus.Done,
          etaSec: 0,
          elapsedSec,
        })
      })
    }

    window.addEventListener(FILE_MANAGER_EVENTS.FILE_UPLOADED, handleFileUploaded as EventListener)

    return () => {
      window.removeEventListener(FILE_MANAGER_EVENTS.FILE_UPLOADED, handleFileUploaded as EventListener)
    }
  }, [])

  return {
    isUploading,
    uploadItems,
    isDownloading,
    downloadItems,
    conflictPortal,
    uploadFiles,
    trackDownload,
    cancelOrDismissUpload,
    cancelOrDismissDownload,
    dismissAllUploads,
    dismissAllDownloads,
  }
}

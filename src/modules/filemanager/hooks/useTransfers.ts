import { useCallback, useState, useContext, useRef, useEffect } from 'react'
import { Context as FMContext } from '../../../providers/FileManager'
import { Context as SettingsContext } from '../../../providers/Settings'
import { ItemType } from '../../../pages/filemanager/ViewContext'
import type { FileInfo, FileInfoOptions, UploadProgress } from '@solarpunkltd/file-manager-lib'
import { ConflictAction, useUploadConflictDialog } from './useUploadConflictDialog'
import { formatBytes, safeSetState, truncateNameMiddle } from '../utils/common'
import {
  DownloadProgress,
  DownloadState,
  FileTransferType,
  TrackDownloadProps,
  TransferStatus,
} from '../constants/transfers'
import { validateStampStillExists, verifyDriveSpace } from '../utils/bee'
import { isTrashed } from '../utils/common'
import { abortDownload } from '../utils/download'
import { AbortManager } from '../utils/abortManager'
import { uuidV4 } from '../../../utils'
import { FILE_MANAGER_EVENTS } from '../constants/common'

const SAMPLE_WINDOW_MS = 500
const ETA_SMOOTHING = 0.3
const MAX_UPLOAD_FILES = 10
const ABORT_EVENT = 'abort'

type ResolveResult = {
  cancelled: boolean
  finalName?: string
  isReplace?: boolean
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

type PrepareUploadEntryParams = {
  originalName: string
  filesToUpload: File[]
  sameDrive: FileInfo[]
  allTaken: Set<string>
  reservedNames?: Set<string>
  isFolder?: boolean
}

type PreparedUploadEntry = {
  finalName: string
  prettySize: string
  isReplace: boolean
  replaceTopic?: string
  replaceHistory?: string
  existingFile?: FileInfo
}

const normalizeCustomMetadata = (meta: UploadMeta): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta)) out[k] = typeof v === 'string' ? v : String(v)

  return out
}

const buildUploadMeta = (
  files: File[] | FileList,
  path?: string,
  existingFile?: FileInfo,
  isFolder = false,
): UploadMeta => {
  const arr = Array.from(files as File[])
  const totalSize = arr.reduce((acc, f) => acc + (f.size || 0), 0)
  const primary = arr[0]

  const previousAccumulated = existingFile
    ? Number(existingFile.customMetadata?.accumulatedSize || existingFile.customMetadata?.size || 0)
    : 0
  const accumulatedSize = previousAccumulated + totalSize

  const meta: UploadMeta = {
    size: String(totalSize),
    fileCount: String(arr.length),
    mime: isFolder ? ItemType.Folder : primary?.type || 'application/octet-stream',
    files: arr,
    accumulatedSize: String(accumulatedSize),
  }

  if (path) meta.path = path

  return meta
}

const calculateETA = (
  etaState: ETAState,
  progress: UploadProgress,
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
  const [openConflict, conflictPortal] = useUploadConflictDialog()
  const isMountedRef = useRef(true)
  const uploadAbortsRef = useRef<AbortManager>(new AbortManager())
  const queueRef = useRef<UploadTask[]>([])
  const runningRef = useRef(false)
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
    queueRef.current = queueRef.current.filter(t => {
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

        if (idx !== -1) {
          clearAllFlagsFor(uuid)
        }

        if (idx === -1) return [...prev, base]
        const copy = [...prev]
        copy[idx] = base

        return copy
      })
    },
    [clearAllFlagsFor],
  )

  const collectSameDrive = useCallback(
    (id: string): FileInfo[] => files.filter(fi => fi.driveId.toString() === id),
    [files],
  )

  const resolveConflict = useCallback(
    async (originalName: string, sameDrive: FileInfo[], allTakenNames: Set<string>): Promise<ResolveResult> => {
      const taken = sameDrive.filter(fi => fi.name === originalName)

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
        return { cancelled: true }
      }

      if (choice.action === ConflictAction.KeepBoth) {
        return { cancelled: false, finalName: (choice.newName ?? '').trim(), isReplace: false }
      }

      return {
        cancelled: false,
        finalName: originalName,
        isReplace: true,
        replaceTopic: existing?.topic.toString(),
        replaceHistory: existing?.file.historyRef.toString(),
      }
    },
    [openConflict],
  )

  const trackUpload = useCallback(
    (
      uuid: string,
      name: string,
      size?: string,
      kind: FileTransferType = FileTransferType.Upload,
      driveName?: string,
    ) => {
      if (!isMountedRef.current) {
        return () => {
          // no-op
        }
      }

      const startedAt = Date.now()

      let etaState: ETAState = {
        lastTs: startedAt,
        lastProcessed: 0,
        lastEta: undefined,
      }

      setUploadItems(prev => {
        const existing = prev.find(p => p.uuid === uuid)
        const actualDriveName = existing?.driveName || driveName

        const idx = prev.findIndex(p => p.uuid === uuid)
        const base = createTransferItem(uuid, name, size, kind, actualDriveName, TransferStatus.Uploading)

        if (idx === -1) return [...prev, base]
        const copy = [...prev]
        copy[idx] = base

        return copy
      })

      const onProgress = (progress: UploadProgress) => {
        const signal = uploadAbortsRef.current.getSignal(uuid)

        if (cancelledUploadingRef.current.has(uuid) || !isMountedRef.current || signal?.aborted) return

        if (progress.total > 0) {
          const now = Date.now()
          const chunkPercentage = Math.floor((progress.processed / progress.total) * 100)

          const { etaSec, updatedState } = calculateETA(etaState, progress, startedAt, now)
          etaState = updatedState

          const isComplete = progress.processed >= progress.total

          setUploadItems(prev => {
            const existing = prev.find(it => it.uuid === uuid && it.status === TransferStatus.Uploading)

            if (!existing || existing.status === TransferStatus.Done) return prev

            if (isComplete) {
              return updateTransferItems(prev, uuid, {
                percent: 100,
                status: TransferStatus.Done,
                kind,
                etaSec: 0,
                elapsedSec: Math.round((now - startedAt) / 1000),
              })
            }

            return updateTransferItems(prev, uuid, {
              percent: Math.max(existing.percent, chunkPercentage),
              kind,
              etaSec,
            })
          })
        }
      }

      return onProgress
    },
    [],
  )

  const processUploadTask = useCallback(
    async (task: UploadTask) => {
      if (!fm) return

      const taskDrive = fm.driveList.find(d => d.id.toString() === task.driveId)

      if (!taskDrive) {
        return
      }

      const existingFile = task.isReplace ? files.find(f => f.topic.toString() === task.replaceTopic) : undefined

      const info: FileInfoOptions = {
        name: task.finalName,
        files: [task.file],
        customMetadata: normalizeCustomMetadata(buildUploadMeta([task.file], undefined, existingFile)),
        topic: task.isReplace ? task.replaceTopic : undefined,
      }

      const progressCb = trackUpload(
        task.uuid,
        task.finalName,
        task.prettySize,
        task.isReplace ? FileTransferType.Update : FileTransferType.Upload,
        taskDrive.name,
      )

      safeSetState(
        isMountedRef,
        setUploadItems,
      )(prev =>
        updateTransferItems(prev, task.uuid, {
          status: TransferStatus.Uploading,
          kind: task.isReplace ? FileTransferType.Update : FileTransferType.Upload,
          startedAt: Date.now(),
        }),
      )

      uploadAbortsRef.current.create(task.uuid)
      const signal = uploadAbortsRef.current.getSignal(task.uuid)

      let reject: (reason?: Error) => void
      const abortHandler = () => {
        reject(new Error('Upload cancelled'))
      }

      const checkCancellation = new Promise<never>((_, rej) => {
        reject = rej
        signal?.addEventListener(ABORT_EVENT, abortHandler)
      })

      try {
        if (signal?.aborted) {
          throw new Error('Upload cancelled')
        }

        const uploadPromise = fm.upload(
          taskDrive,
          { ...info, onUploadProgress: progressCb },
          { actHistoryAddress: task.isReplace ? task.replaceHistory : undefined },
        )

        await Promise.race([uploadPromise, checkCancellation])

        if (currentStamp) {
          await refreshStamp(currentStamp.batchID.toString())
        }
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
        signal?.removeEventListener(ABORT_EVENT, abortHandler)

        const wasCancelled = cancelledUploadingRef.current.has(task.uuid) || signal?.aborted

        if (!wasCancelled) {
          uploadAbortsRef.current.abort(task.uuid)
          cancelledUploadingRef.current.delete(task.uuid)
          cancelledQueuedRef.current.delete(task.uuid)
        }
      }
    },
    [fm, files, currentStamp, trackUpload, refreshStamp, setShowError, setErrorMessage],
  )

  const trackDownload = useCallback(
    (props: TrackDownloadProps) => {
      if (!isMountedRef.current) {
        return () => {
          // No-op function for unmounted component
        }
      }

      const driveName = props.driveName ?? currentDrive?.name

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
          driveName,
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
              const wasCancelled =
                dp.state === DownloadState.Cancelled || cancelledDownloadingRef.current.has(props.uuid)

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
    },
    // currentDrive casues rerenders and flickering during the progress tracking
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const prepareUploadEntry = useCallback(
    async ({
      originalName,
      filesToUpload,
      sameDrive,
      allTaken,
      reservedNames,
      isFolder = false,
    }: PrepareUploadEntryParams): Promise<PreparedUploadEntry | null> => {
      const meta = buildUploadMeta(filesToUpload, undefined, undefined, isFolder)
      const sizeSource = typeof meta.size === 'string' || typeof meta.size === 'number' ? meta.size : filesToUpload
      const prettySize = formatBytes(sizeSource) ?? '0'

      // eslint-disable-next-line prefer-const
      let { finalName, isReplace, replaceTopic, replaceHistory, cancelled } = await resolveConflict(
        originalName,
        sameDrive,
        allTaken,
      )

      finalName = finalName?.trim() ?? ''
      const initialReplace = Boolean(isReplace)
      const initialInvalidCombo = initialReplace && (!replaceTopic || !replaceHistory)
      const initialInvalidName = !finalName

      if (cancelled || initialInvalidCombo || initialInvalidName) {
        return null
      }

      if (reservedNames?.has(finalName)) {
        const retryTaken = new Set<string>([...Array.from(allTaken), finalName])
        const retry = await resolveConflict(finalName, sameDrive, retryTaken)

        finalName = retry.finalName?.trim() ?? ''
        isReplace = retry.isReplace
        replaceTopic = retry.replaceTopic
        replaceHistory = retry.replaceHistory

        const retryReplace = Boolean(isReplace)
        const retryInvalidCombo = retryReplace && (!replaceTopic || !replaceHistory)
        const retryInvalidName = !finalName

        if (retry.cancelled || retryInvalidCombo || retryInvalidName) {
          return null
        }
      }

      const finalReplace = Boolean(isReplace)
      const existingFile =
        finalReplace && replaceTopic ? files.find(f => f.topic.toString() === replaceTopic) : undefined

      return {
        finalName,
        prettySize,
        isReplace: finalReplace,
        replaceTopic,
        replaceHistory,
        existingFile,
      }
    },
    [resolveConflict, files],
  )

  const uploadFiles = useCallback(
    (picked: FileList | File[], isFolder = false, folderName?: string): void => {
      const filesArr = Array.from(picked)

      if (!currentDrive || !fm) return
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const manager = fm!
      const drive = currentDrive

      if (filesArr.length === 0 || !fm || !currentDrive || !currentStamp) return

      const sameDrive = collectSameDrive(drive.id.toString())
      const onDiskNames = new Set<string>(sameDrive.map((fi: FileInfo) => fi.name))
      const reserved = new Set<string>()
      const progressNames = new Set<string>(uploadItems.filter(u => u.driveName === drive.name).map(u => u.name))
      const tasks: UploadTask[] = []
      const allTaken = new Set<string>([
        ...Array.from(onDiskNames),
        ...Array.from(reserved),
        ...Array.from(progressNames),
      ])

      async function processFolder() {
        if (!folderName) {
          return
        }
        const prepared = await prepareUploadEntry({
          originalName: folderName ? folderName : 'New Folder',
          filesToUpload: filesArr,
          sameDrive,
          allTaken,
          isFolder: true,
        })

        if (!prepared) {
          return
        }

        const info: FileInfoOptions = {
          name: prepared.finalName,
          files: filesArr,
          customMetadata: normalizeCustomMetadata(buildUploadMeta(filesArr, undefined, prepared.existingFile, true)),
          topic: prepared.isReplace ? prepared.replaceTopic : undefined,
        }

        const uuid = uuidV4()
        const progressCallback = trackUpload(
          uuid,
          prepared.finalName,
          prepared.prettySize,
          prepared.isReplace ? FileTransferType.Update : FileTransferType.Upload,
          drive.name,
        )

        void manager.upload(
          drive,
          { ...info, onUploadProgress: progressCallback },
          { actHistoryAddress: prepared.isReplace ? prepared.replaceHistory : undefined },
        )
      }

      if (isFolder) {
        processFolder()
      } else {
        const currentlyQueued = queueRef.current.length
        const newFilesCount = filesArr.length
        const totalAfterAdd = currentlyQueued + newFilesCount

        if (totalAfterAdd > MAX_UPLOAD_FILES) {
          setErrorMessage?.(
            `You’re trying to upload ${totalAfterAdd} files, but the limit is ${MAX_UPLOAD_FILES}. Please upload fewer files.`,
          )
          setShowError(true)

          return
        }
        // TODO: move out this function from the cb and use as a util for better readaility
        const preflight = async (): Promise<UploadTask[]> => {
          // Track cumulative file sizes for capacity verification
          let fileSizeSum = 0
          let fileCount = 0

          const processFile = async (file: File): Promise<UploadTask | null> => {
            if (!currentStamp || !currentStamp.usable) {
              setErrorMessage?.('Stamp is not usable.')
              setShowError(true)

              return null
            }

            const uuid = uuidV4()

            fileSizeSum += file.size
            fileCount += 1

            const { ok } = verifyDriveSpace({
              fm,
              redundancyLevel: currentDrive.redundancyLevel,
              stamp: currentStamp,
              useInfoSize: true,
              driveId: currentDrive.id.toString(),
              adminRedundancy: adminDrive?.redundancyLevel,
              fileSize: fileSizeSum,
              fileCount,
              cb: err => {
                setErrorMessage?.(err + ' (' + truncateNameMiddle(file.name) + ')')
                setShowError(true)
              },
            })

            if (!ok) return null

            const prepared = await prepareUploadEntry({
              originalName: file.name,
              filesToUpload: [file],
              sameDrive,
              allTaken,
              reservedNames: reserved,
            })

            if (!prepared) {
              return null
            }

            reserved.add(prepared.finalName)

            ensureQueuedRow(
              uuid,
              prepared.finalName,
              prepared.isReplace ? FileTransferType.Update : FileTransferType.Upload,
              prepared.prettySize,
              currentDrive.name,
            )

            return {
              uuid,
              file,
              finalName: prepared.finalName,
              prettySize: prepared.prettySize,
              isReplace: prepared.isReplace,
              replaceTopic: prepared.replaceTopic,
              replaceHistory: prepared.replaceHistory,
              driveId: currentDrive.id.toString(),
              driveName: currentDrive.name,
            }
          }

          for (const file of filesArr) {
            const task = await processFile(file)

            if (task) {
              tasks.push(task)
            } else {
              // Stop processing remaining files if capacity check failed
              break
            }
          }

          return tasks
        }

        const runQueue = async () => {
          if (runningRef.current) return
          runningRef.current = true

          try {
            while (queueRef.current.length > 0) {
              const task = queueRef.current[0]

              if (!task) break

              const isCancelled = cancelledQueuedRef.current.has(task.uuid)

              if (isCancelled) {
                safeSetState(
                  isMountedRef,
                  setUploadItems,
                )(prev => updateTransferItems(prev, task.uuid, { status: TransferStatus.Cancelled }))
                cancelledQueuedRef.current.delete(task.uuid)
                queueRef.current.shift()
              } else {
                await processUploadTask(task)
                queueRef.current.shift()
              }
            }
          } finally {
            runningRef.current = false

            if (queueRef.current.length > 0) {
              runQueue()
            }
          }
        }

        void (async () => {
          if (!currentStamp || !currentStamp.usable) {
            setErrorMessage?.('Stamp is not usable.')
            setShowError(true)

            return
          }

          if (beeApi) {
            const stampValid = await validateStampStillExists(beeApi, currentStamp.batchID)

            if (!stampValid) {
              setErrorMessage?.(
                'The selected stamp is no longer valid or has been deleted. Please select a different stamp.',
              )
              setShowError(true)

              return
            }
          }

          const tasks = await preflight()
          queueRef.current = queueRef.current.concat(tasks)
          runQueue()
        })()
      }
    },
    [
      fm,
      currentDrive,
      currentStamp,
      collectSameDrive,
      ensureQueuedRow,
      processUploadTask,
      uploadItems,
      adminDrive,
      setShowError,
      setErrorMessage,
      beeApi,
      trackUpload,
      prepareUploadEntry,
    ],
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
          queueRef.current = queueRef.current.filter(t => t.uuid !== row.uuid)

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
    queueRef.current = []
    cancelledQueuedRef.current.clear()
    cancelledUploadingRef.current.clear()
    setUploadItems([])
  }, [])

  const dismissAllDownloads = useCallback(() => {
    setDownloadItems([])
    cancelledDownloadingRef.current.clear()
  }, [])

  useEffect(() => {
    const handleFileUploaded = (e: Event) => {
      const { fileInfo } = (e as CustomEvent).detail || {}

      if (!fileInfo) return

      setUploadItems(prev => {
        const item = prev.find(it => it.name === fileInfo.name && it.status === TransferStatus.Uploading)

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
      isMountedRef.current = false
    }
  }, [])

  return {
    uploadFiles,
    isUploading,
    uploadItems,
    trackDownload,
    isDownloading,
    downloadItems,
    conflictPortal,
    cancelOrDismissUpload,
    cancelOrDismissDownload,
    dismissAllUploads,
    dismissAllDownloads,
  }
}

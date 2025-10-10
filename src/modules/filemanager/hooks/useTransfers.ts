import { useCallback, useState, useContext, useRef, useEffect } from 'react'
import { Context as FMContext } from '../../../providers/FileManager'
import type { FileInfo, FileInfoOptions } from '@solarpunkltd/file-manager-lib'
import { ConflictAction, useUploadConflictDialog } from './useUploadConflictDialog'
import { formatBytes } from '../utils/common'
import { FileTransferType, TransferStatus } from '../constants/fileTransfer'
import { isTrashed } from '../utils/common'

type ResolveResult = {
  cancelled: boolean
  finalName?: string
  isReplace?: boolean
  replaceTopic?: string
  replaceHistory?: string
}

const SAMPLE_WINDOW_MS = 500
const ETA_SMOOTHING = 0.3

export type TransferItem = {
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

type UploadMeta = Record<string, string | number>

const normalizeCustomMetadata = (meta: UploadMeta): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta)) out[k] = typeof v === 'string' ? v : String(v)

  return out
}

const buildUploadMeta = (files: File[] | FileList, path?: string): UploadMeta => {
  const arr = Array.from(files as File[])
  const totalSize = arr.reduce((acc, f) => acc + (f.size || 0), 0)
  const primary = arr[0]
  const meta: UploadMeta = {
    size: String(totalSize),
    fileCount: String(arr.length),
    mime: primary?.type || 'application/octet-stream',
  }

  if (path) meta.path = path

  return meta
}

const makeUploadInfo = (args: {
  name: string
  files: File[]
  meta: Record<string, string | number>
  topic?: string
}): FileInfoOptions => {
  const info = {
    name: args.name,
    customMetadata: normalizeCustomMetadata(args.meta),
    topic: args.topic,
  }

  return {
    info,
    files: args.files,
  }
}

type UploadTask = {
  file: File
  finalName: string
  prettySize?: string
  isReplace: boolean
  replaceTopic?: string
  replaceHistory?: string
}

export function useTransfers() {
  const { fm, currentDrive, files } = useContext(FMContext)
  const [openConflict, conflictPortal] = useUploadConflictDialog()
  const isMountedRef = useRef(true)
  const queueRef = useRef<UploadTask[]>([])
  const runningRef = useRef(false)
  const cancelledNamesRef = useRef<Set<string>>(new Set())
  const uploadAbortersRef = useRef<Map<string, AbortController>>(new Map())
  const cancelledUploadingRef = useRef<Set<string>>(new Set())
  const pendingForgetRef = useRef<Set<string>>(new Set())

  const [uploadItems, setUploadItems] = useState<TransferItem[]>([])
  const isUploading = uploadItems.some(i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error)

  const clearAllFlagsFor = useCallback((name: string) => {
    cancelledNamesRef.current.delete(name)
    cancelledUploadingRef.current.delete(name)
    pendingForgetRef.current.delete(name)
    uploadAbortersRef.current.delete(name)
    queueRef.current = queueRef.current.filter(t => t.finalName !== name)
  }, [])

  const ensureQueuedRow = useCallback(
    (name: string, kind: FileTransferType, size?: string, driveName?: string) => {
      clearAllFlagsFor(name)

      setUploadItems(prev => {
        const idx = prev.findIndex(p => p.name === name)
        const base: TransferItem = {
          name,
          size,
          percent: 0,
          status: TransferStatus.Queued,
          kind,
          driveName,
          startedAt: undefined,
          etaSec: undefined,
          elapsedSec: undefined,
        }

        if (idx === -1) return [...prev, base]
        const copy = [...prev]
        copy[idx] = base

        return copy
      })
    },
    [clearAllFlagsFor],
  )

  async function withAbortSignal<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    const originalFetch = window.fetch
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const merged: RequestInit = { ...(init || {}) }

      if (!merged.signal) merged.signal = signal

      return originalFetch(input as RequestInfo | URL, merged)
    }) as typeof window.fetch

    try {
      return await fn()
    } finally {
      window.fetch = originalFetch
    }
  }

  const trackUploadProgress = useCallback(
    (name: string, size?: string, kind: FileTransferType = FileTransferType.Upload) => {
      const driveName = currentDrive?.name
      const startedAt = Date.now()

      let lastTs = startedAt
      let lastProcessed = 0
      let lastEta: number | undefined

      if (!isMountedRef.current) {
        return () => {
          /* no-op */
        }
      }

      setUploadItems(prev => {
        const idx = prev.findIndex(p => p.name === name)
        const base: TransferItem = {
          name,
          size,
          percent: 0,
          status: TransferStatus.Uploading,
          kind,
          driveName,
          startedAt,
          etaSec: undefined,
          elapsedSec: undefined,
        }

        if (idx === -1) return [...prev, base]
        const copy = [...prev]
        copy[idx] = base

        return copy
      })

      const onProgress = (progress: { total: number; processed: number }) => {
        if (cancelledUploadingRef.current.has(name)) return

        if (progress.total > 0) {
          const now = Date.now()
          const pct = Math.floor((progress.processed / progress.total) * 100)

          let etaSec: number | undefined
          const dt = (now - lastTs) / 1000

          if (dt >= SAMPLE_WINDOW_MS / 1000) {
            const dBytes = Math.max(0, progress.processed - lastProcessed)
            const instSpeed = dBytes > 0 && dt > 0 ? dBytes / dt : 0
            const remaining = Math.max(0, progress.total - progress.processed)
            const rawEta = instSpeed > 0 ? remaining / instSpeed : undefined

            const avgDt = (now - startedAt) / 1000
            const avgSpeed = avgDt > 0 && progress.processed > 0 ? progress.processed / avgDt : 0
            const avgEta = avgSpeed > 0 ? remaining / avgSpeed : undefined

            const freshEta = rawEta ?? avgEta

            if (freshEta !== undefined) {
              etaSec = lastEta !== undefined ? (1 - ETA_SMOOTHING) * lastEta + ETA_SMOOTHING * freshEta : freshEta
              lastEta = etaSec
            }

            lastTs = now
            lastProcessed = progress.processed
          } else {
            etaSec = lastEta
          }

          if (isMountedRef.current && !cancelledUploadingRef.current.has(name)) {
            setUploadItems(prev =>
              prev.map(it =>
                it.name !== name || it.status === TransferStatus.Error
                  ? it
                  : { ...it, percent: Math.max(it.percent, pct), kind, etaSec },
              ),
            )
          }

          if (
            progress.processed >= progress.total &&
            isMountedRef.current &&
            !cancelledUploadingRef.current.has(name)
          ) {
            const finishedAt = Date.now()
            setUploadItems(prev =>
              prev.map(it =>
                it.name === name && it.status !== TransferStatus.Error
                  ? {
                      ...it,
                      percent: 100,
                      status: TransferStatus.Done,
                      etaSec: 0,
                      elapsedSec: Math.round((finishedAt - (it.startedAt || startedAt)) / 1000),
                    }
                  : it,
              ),
            )
          }
        }
      }

      return onProgress
    },
    [currentDrive?.name],
  )

  const collectSameDrive = useCallback(
    (id: string): FileInfo[] => files.filter(fi => fi.driveId.toString() === id),
    [files],
  )

  // TODO: find the history of the same name -> can taken.length be > 1?
  const resolveConflict = useCallback(
    async (originalName: string, sameDrive: FileInfo[], allTakenNames: Set<string>): Promise<ResolveResult> => {
      const taken = sameDrive.filter(fi => fi.name === originalName)

      if (!taken.length && !allTakenNames.has(originalName)) {
        return { cancelled: false, finalName: originalName, isReplace: false }
      }

      const existing = taken[0]
      const isTrashedExisting = existing ? isTrashed(existing) : false

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

  const processUploadTask = useCallback(
    async (task: UploadTask) => {
      if (!fm || !currentDrive) return
      const info = makeUploadInfo({
        name: task.finalName,
        files: [task.file],
        meta: buildUploadMeta([task.file]),
        topic: task.isReplace ? task.replaceTopic : undefined,
      })

      const progressCb = trackUploadProgress(
        task.finalName,
        task.prettySize,
        task.isReplace ? FileTransferType.Update : FileTransferType.Upload,
      )

      setUploadItems(prev =>
        prev.map(it =>
          it.name === task.finalName
            ? {
                ...it,
                status: TransferStatus.Uploading,
                kind: task.isReplace ? FileTransferType.Update : FileTransferType.Upload,
                startedAt: it.startedAt ?? Date.now(),
              }
            : it,
        ),
      )

      const controller = new AbortController()
      uploadAbortersRef.current.set(task.finalName, controller)

      try {
        await withAbortSignal(controller.signal, async () => {
          await fm.upload(
            currentDrive,
            { ...info, onUploadProgress: progressCb },
            { actHistoryAddress: task.isReplace ? task.replaceHistory : undefined },
          )
        })
      } catch {
        setUploadItems(prev =>
          prev.map(it => (it.name === task.finalName ? { ...it, status: TransferStatus.Error } : it)),
        )
      } finally {
        uploadAbortersRef.current.delete(task.finalName)
        cancelledUploadingRef.current.delete(task.finalName)
        cancelledNamesRef.current.delete(task.finalName)
      }
    },
    [fm, currentDrive, trackUploadProgress],
  )

  const uploadFiles = useCallback(
    (picked: FileList | File[]): void => {
      const sel = Array.from(picked)

      if (sel.length === 0 || !fm || !currentDrive) return

      const preflight = async (): Promise<UploadTask[]> => {
        const progressNames = new Set<string>(uploadItems.map(u => u.name))

        const sameDrive: FileInfo[] = collectSameDrive(currentDrive.id.toString())
        const onDiskNames = new Set<string>(sameDrive.map((fi: FileInfo) => fi.name))

        const reserved = new Set<string>()

        const tasks: UploadTask[] = []

        for (const file of sel) {
          const meta = buildUploadMeta([file])
          const prettySize = formatBytes(meta.size)

          const allTaken = new Set<string>([
            ...Array.from(onDiskNames),
            ...Array.from(reserved),
            ...Array.from(progressNames),
          ])

          let { finalName, isReplace, replaceTopic, replaceHistory } = await resolveConflict(
            file.name,
            sameDrive,
            allTaken,
          )
          finalName = finalName ?? ''

          const invalidCombo = Boolean(isReplace) && (!replaceHistory || !replaceTopic)
          const invalidName = !finalName || finalName.trim().length === 0

          if (!invalidCombo && !invalidName) {
            if (reserved.has(finalName)) {
              const retryTaken = new Set<string>([...Array.from(allTaken), finalName])
              const retry = await resolveConflict(finalName, sameDrive, retryTaken)
              finalName = retry.finalName ?? ''
              isReplace = retry.isReplace
              replaceTopic = retry.replaceTopic
              replaceHistory = retry.replaceHistory
            }

            const retryInvalidCombo = Boolean(isReplace) && (!replaceHistory || !replaceTopic)
            const retryInvalidName = !finalName || finalName.trim().length === 0

            if (!retryInvalidCombo && !retryInvalidName) {
              reserved.add(finalName)
              ensureQueuedRow(
                finalName,
                isReplace ? FileTransferType.Update : FileTransferType.Upload,
                prettySize,
                currentDrive.name,
              )
              tasks.push({
                file,
                finalName,
                prettySize,
                isReplace: Boolean(isReplace),
                replaceTopic,
                replaceHistory,
              })
            }
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

            const isCancelled = cancelledNamesRef.current.has(task.finalName)

            if (isCancelled) {
              setUploadItems(prev =>
                prev.map(it => (it.name === task.finalName ? { ...it, status: TransferStatus.Error } : it)),
              )
              cancelledNamesRef.current.delete(task.finalName)
              queueRef.current.shift()
            } else {
              await processUploadTask(task)
              queueRef.current.shift()
            }
          }
        } finally {
          runningRef.current = false
        }
      }

      void (async () => {
        const tasks = await preflight()
        queueRef.current = queueRef.current.concat(tasks)
        runQueue()
      })()
    },
    [fm, currentDrive, collectSameDrive, resolveConflict, ensureQueuedRow, processUploadTask, uploadItems],
  )

  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const isDownloading = downloadItems.some(i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error)

  const trackDownload = (
    name: string,
    size?: string,
    expectedSize?: number,
    mode: 'open' | 'download' = 'download',
  ): ((bytesDownloaded: number, downloadingFlag: boolean) => void) => {
    const driveName = currentDrive?.name

    if (!isMountedRef.current) {
      return () => {
        // No-op function for unmounted component
      }
    }

    setDownloadItems(prev => {
      const row: TransferItem = {
        name,
        size,
        percent: 0,
        status: TransferStatus.Uploading,
        kind: mode === 'open' ? FileTransferType.Open : FileTransferType.Download,
        driveName,
        startedAt: undefined,
        etaSec: undefined,
        elapsedSec: undefined,
      }
      const idx = prev.findIndex(p => p.name === name)

      if (idx === -1) return [...prev, row]
      const out = [...prev]
      out[idx] = { ...row, startedAt: prev[idx].startedAt ?? row.startedAt }

      return out
    })

    let startedAt: number | undefined
    let lastTs: number | undefined
    let lastBytes = 0
    let lastEta: number | undefined

    const onProgress = (bytesDownloaded: number, downloadingFlag: boolean) => {
      let percent = 0

      if (!isMountedRef.current) return

      setDownloadItems(prev => {
        const now = Date.now()

        if (!startedAt) {
          startedAt = now
          lastTs = now
        }

        let etaSec: number | undefined
        const out = prev.map(it => {
          if (it.name !== name) return it

          const rowStarted = it.startedAt ?? startedAt
          const safeStarted = rowStarted ?? now

          if (expectedSize && expectedSize > 0 && bytesDownloaded >= 0) {
            percent = Math.floor((bytesDownloaded / expectedSize) * 100)
            const tsRef = lastTs ?? safeStarted
            const dt = (now - tsRef) / 1000

            if (dt >= SAMPLE_WINDOW_MS / 1000) {
              const dBytes = Math.max(0, bytesDownloaded - lastBytes)
              const instSpeed = dBytes > 0 && dt > 0 ? dBytes / dt : 0
              const remaining = Math.max(0, expectedSize - bytesDownloaded)
              const rawEta = instSpeed > 0 ? remaining / instSpeed : undefined

              const avgDt = (now - safeStarted) / 1000
              const avgSpeed = avgDt > 0 && bytesDownloaded > 0 ? bytesDownloaded / avgDt : 0
              const avgEta = avgSpeed > 0 ? remaining / avgSpeed : undefined

              const freshEta = rawEta ?? avgEta

              if (freshEta !== undefined) {
                etaSec = lastEta !== undefined ? (1 - ETA_SMOOTHING) * lastEta + ETA_SMOOTHING * freshEta : freshEta
                lastEta = etaSec
              }

              lastTs = now
              lastBytes = bytesDownloaded
            } else {
              etaSec = lastEta
            }
          }

          return {
            ...it,
            percent: Math.max(it.percent, percent),
            etaSec,
            startedAt: rowStarted ?? startedAt,
          }
        })

        if (!downloadingFlag) {
          const finishedAt = Date.now()

          return out.map(it => {
            if (it.name !== name) return it

            if (bytesDownloaded === -1) {
              return { ...it, status: TransferStatus.Error, etaSec: undefined, elapsedSec: 0, percent: it.percent ?? 0 }
            }

            return {
              ...it,
              percent: 100,
              status: TransferStatus.Done,
              etaSec: 0,
              elapsedSec: it.startedAt !== undefined ? Math.round((finishedAt - it.startedAt) / 1000) : 0,
            }
          })
        }

        return out
      })
    }

    return onProgress
  }

  const cancelOrDismissUpload = (name: string) => {
    setUploadItems(prev => {
      const row = prev.find(r => r.name === name)

      if (!row) return prev

      if (row.status === TransferStatus.Queued) {
        cancelledNamesRef.current.add(name)
        queueRef.current = queueRef.current.filter(t => t.finalName !== name)

        return prev.map(r => (r.name === name ? { ...r, status: TransferStatus.Error } : r))
      }

      if (row.status === TransferStatus.Uploading) {
        cancelledUploadingRef.current.add(name)
        const ac = uploadAbortersRef.current.get(name)

        if (ac) {
          try {
            ac.abort()
          } catch {
            /* no-op */
          }
          uploadAbortersRef.current.delete(name)
        }

        return prev.map(r => (r.name === name ? { ...r, status: TransferStatus.Error } : r))
      }

      clearAllFlagsFor(name)

      return prev.filter(r => r.name !== name)
    })
  }

  const dismissDownload = (name: string) => {
    if (isMountedRef.current) {
      setDownloadItems(prev => prev.filter(it => it.name !== name))
    }
  }

  const dismissAllUploads = () => {
    if (!isMountedRef.current) return
    setUploadItems([])
    cancelledNamesRef.current.clear()
    cancelledUploadingRef.current.clear()
  }

  const dismissAllDownloads = () => {
    if (isMountedRef.current) {
      setDownloadItems([])
    }
  }

  useEffect(() => {
    return () => {
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
    dismissDownload,
    dismissAllUploads,
    dismissAllDownloads,
    cancelOrDismissUpload,
  }
}

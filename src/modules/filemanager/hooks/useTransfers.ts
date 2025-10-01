import { useCallback, useState, useContext } from 'react'
import { Context as FMContext } from '../../../providers/FileManager'
import type { FileInfo, FileInfoOptions } from '@solarpunkltd/file-manager-lib'
import { ConflictAction, useUploadConflictDialog } from './useUploadConflictDialog'
import { formatBytes } from '../utils/common'
import { FileTransferType, TransferStatus } from '../constants/fileTransfer'

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

export function useTransfers() {
  const { fm, currentDrive, files } = useContext(FMContext)
  const [openConflict, conflictPortal] = useUploadConflictDialog()

  const [uploadItems, setUploadItems] = useState<TransferItem[]>([])
  const isUploading = uploadItems.some(i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error)

  const trackUploadProgress = useCallback(
    (name: string, size?: string, kind: FileTransferType = FileTransferType.Upload) => {
      const driveName = currentDrive?.name
      const startedAt = Date.now()

      let lastTs = startedAt
      let lastProcessed = 0
      let lastEta: number | undefined

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

          setUploadItems(prev =>
            prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, pct), kind, etaSec } : it)),
          )

          if (progress.processed >= progress.total) {
            const finishedAt = Date.now()
            setUploadItems(prev =>
              prev.map(it =>
                it.name === name
                  ? {
                      ...it,
                      percent: 100,
                      status: TransferStatus.Done,
                      etaSec: 0,
                      elapsedSec: Math.round((finishedAt - (it.startedAt || startedAt)) / 1000), // NEW
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
    async (
      originalName: string,
      sameDrive: FileInfo[],
    ): Promise<{ finalName: string; isReplace: boolean; replaceTopic?: string; replaceHistory?: string }> => {
      const taken = sameDrive.filter(fi => fi.name === originalName)

      if (!taken.length) {
        return { finalName: originalName, isReplace: false }
      }

      const choice = await openConflict({ originalName, existingNames: taken.map(fi => fi.name) })

      if (choice.action === ConflictAction.Cancel) {
        return { finalName: originalName, isReplace: false }
      }

      if (choice.action === ConflictAction.KeepBoth) {
        return { finalName: choice.newName?.trim() || '', isReplace: false }
      }

      return {
        finalName: originalName,
        isReplace: true,
        replaceTopic: taken[0].topic.toString(),
        replaceHistory: taken[0].file.historyRef.toString(),
      }
    },
    [openConflict],
  )

  const uploadFiles = useCallback(
    (picked: FileList | File[]): void => {
      const filesArr = Array.from(picked)

      if (filesArr.length === 0) return

      function markError(name: string) {
        setUploadItems(prev => prev.map(it => (it.name === name ? { ...it, status: TransferStatus.Error } : it)))
      }

      async function processOne(file: File, reservedNames: Set<string>) {
        if (!fm || !currentDrive) return

        const meta = buildUploadMeta([file])
        const prettySize = formatBytes(meta.size)
        const sameDrive = collectSameDrive(currentDrive.id.toString())

        let { finalName, isReplace, replaceTopic, replaceHistory } = await resolveConflict(file.name, sameDrive)
        finalName = finalName ?? ''

        const invalidCombo = isReplace && (!replaceHistory || !replaceTopic)
        const invalidName = !finalName || finalName.trim().length === 0

        if (invalidCombo || invalidName) return

        if (reservedNames.has(finalName)) {
          const retry = await resolveConflict(finalName, sameDrive)
          finalName = retry.finalName ?? ''
          isReplace = retry.isReplace
          replaceTopic = retry.replaceTopic
          replaceHistory = retry.replaceHistory

          const retryInvalidCombo = isReplace && (!replaceHistory || !replaceTopic)
          const retryInvalidName = !finalName || finalName.trim().length === 0

          if (retryInvalidCombo || retryInvalidName) return
        }

        reservedNames.add(finalName)

        const progressCallback = trackUploadProgress(
          finalName,
          prettySize,
          isReplace ? FileTransferType.Update : FileTransferType.Upload,
        )

        const info = makeUploadInfo({
          name: finalName,
          files: [file],
          meta,
          topic: isReplace ? replaceTopic : undefined,
        })

        fm.upload(
          currentDrive,
          { ...info, onUploadProgress: progressCallback },
          { actHistoryAddress: isReplace ? replaceHistory : undefined },
        ).catch(() => markError(finalName))
      }

      async function processAll() {
        const reservedNames = new Set<string>()
        for (const file of filesArr) {
          await processOne(file, reservedNames)
        }
      }

      void processAll()
    },
    [fm, currentDrive, collectSameDrive, resolveConflict, setUploadItems, trackUploadProgress],
  )

  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const isDownloading = downloadItems.some(i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error)

  const trackDownload = (
    name: string,
    size?: string,
    expectedSize?: number,
  ): ((bytesDownloaded: number, downloadingFlag: boolean) => void) => {
    const driveName = currentDrive?.name

    setDownloadItems(prev => {
      const row: TransferItem = {
        name,
        size,
        percent: 0,
        status: TransferStatus.Uploading,
        kind: FileTransferType.Download,
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

          if (expectedSize && expectedSize > 0) {
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

          return out.map(it =>
            it.name === name
              ? {
                  ...it,
                  percent: 100,
                  status: TransferStatus.Done,
                  etaSec: 0,
                  elapsedSec: it.startedAt !== undefined ? Math.round((finishedAt - it.startedAt) / 1000) : 0,
                }
              : it,
          )
        }

        return out
      })
    }

    return onProgress
  }

  const dismissUpload = (name: string) => {
    setUploadItems(prev => prev.filter(it => it.name !== name))
  }

  const dismissDownload = (name: string) => {
    setDownloadItems(prev => prev.filter(it => it.name !== name))
  }

  const dismissAllUploads = () => setUploadItems([])
  const dismissAllDownloads = () => setDownloadItems([])

  return {
    uploadFiles,
    isUploading,
    uploadItems,
    trackDownload,
    isDownloading,
    downloadItems,
    conflictPortal,
    dismissUpload,
    dismissDownload,
    dismissAllUploads,
    dismissAllDownloads,
  }
}

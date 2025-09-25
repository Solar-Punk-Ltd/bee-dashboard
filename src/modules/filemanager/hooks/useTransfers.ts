import { useCallback, useState, useContext } from 'react'
import { Context as FMContext } from '../../../providers/FileManager'
import type { FileInfo, FileInfoOptions } from '@solarpunkltd/file-manager-lib'
import { ConflictAction, useUploadConflictDialog } from './useUploadConflictDialog'
import { formatBytes } from '../utils/common'
import { FileTransferType, TransferStatus } from '../constants/fileTransfer'

export type TransferItem = {
  name: string
  size?: string
  percent: number
  status: TransferStatus
  kind?: FileTransferType
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

  const trackUploadProgress = (name: string, size?: string, kind: FileTransferType = FileTransferType.Upload) => {
    setUploadItems(prev => {
      const idx = prev.findIndex(p => p.name === name)
      const base: TransferItem = { name, size, percent: 0, status: TransferStatus.Uploading, kind }

      if (idx === -1) return [...prev, base]
      const copy = [...prev]
      copy[idx] = base

      return copy
    })

    const onProgress = (progress: { total: number; processed: number }) => {
      if (progress.total > 0) {
        const percent = Math.floor((progress.processed / progress.total) * 100)

        setUploadItems(prev =>
          prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, percent), kind } : it)),
        )

        if (progress.processed >= progress.total) {
          setUploadItems(prev =>
            prev.map(it => (it.name === name ? { ...it, percent: 100, status: TransferStatus.Done } : it)),
          )
        }
      }
    }

    return onProgress
  }

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
    [fm, currentDrive, collectSameDrive, resolveConflict, setUploadItems],
  )

  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const isDownloading = downloadItems.some(i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error)

  const trackDownload = (
    name: string,
    size?: string,
    expectedSize?: number,
  ): ((bytesDownloaded: number, downloadingFlag: boolean) => void) => {
    setDownloadItems(prev => {
      const row: TransferItem = {
        name,
        size: size,
        percent: 0,
        status: TransferStatus.Uploading,
        kind: FileTransferType.Download,
      }
      const idx = prev.findIndex(p => p.name === name)

      if (idx === -1) return [...prev, row]
      const out = [...prev]
      out[idx] = row

      return out
    })

    const onProgress = (bytesDownloaded: number, downloadingFlag: boolean) => {
      let percent = 0

      if (expectedSize && expectedSize > 0) {
        percent = Math.floor((bytesDownloaded / expectedSize) * 100)
      }

      setDownloadItems(prev =>
        prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, percent) } : it)),
      )

      if (!downloadingFlag) {
        setDownloadItems(prev =>
          prev.map(it => (it.name === name ? { ...it, percent: 100, status: TransferStatus.Done } : it)),
        )
      }
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

import { useCallback, useState } from 'react'
import { useFM } from '../providers/FMContext'
import type { FileInfo, FileInfoOptions } from '@solarpunkltd/file-manager-lib'
import { ConflictAction, useUploadConflictDialog } from './useUploadConflictDialog'
import { formatBytes } from '../utils/common'
import { FileTransferType, TransferStatus } from '../constants/constants'

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

export function useFMTransfers() {
  const { fm, currentDrive, refreshFiles, files } = useFM()
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
    async (picked: FileList | File[]): Promise<void> => {
      if (!fm || !currentDrive) return

      const arr = Array.from(picked)

      if (arr.length === 0) return

      const originalName = arr[0].name
      const meta = buildUploadMeta(arr)
      const prettySize = formatBytes(meta.size)

      const sameDrive = collectSameDrive(currentDrive.id.toString())
      const { finalName, isReplace, replaceTopic, replaceHistory } = await resolveConflict(originalName, sameDrive)

      if (isReplace && (!replaceHistory || !replaceTopic)) return

      if (finalName.trim().length === 0) return

      const progressCallback = trackUploadProgress(
        finalName,
        prettySize,
        isReplace ? FileTransferType.Update : FileTransferType.Upload,
      )

      const info = makeUploadInfo({
        name: finalName,
        files: arr,
        meta,
        topic: isReplace ? replaceTopic : undefined,
      })

      try {
        await fm.upload(
          currentDrive,
          {
            ...info,
            onUploadProgress: progressCallback,
          },
          {
            actHistoryAddress: isReplace ? replaceHistory : undefined,
          },
        )
      } catch {
        setUploadItems(prev => prev.map(it => (it.name === finalName ? { ...it, status: TransferStatus.Error } : it)))

        return
      }

      refreshFiles()
    },
    [fm, currentDrive, collectSameDrive, resolveConflict, refreshFiles],
  )

  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const isDownloading = downloadItems.some(i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error)
  const downloadCount = downloadItems.length

  const trackDownload = (
    name: string,
    size?: string,
    expectedSize?: number,
  ): ((bytesDownloaded: number, isDownloading: boolean) => void) => {
    // TODO: status: uploading in downloads?
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

    const onProgress = (bytesDownloaded: number, isDownloading: boolean) => {
      let percent = 0

      if (expectedSize && expectedSize > 0) {
        percent = Math.floor((bytesDownloaded / expectedSize) * 100)
      }

      setDownloadItems(prev =>
        prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, percent) } : it)),
      )

      if (!isDownloading) {
        setDownloadItems(prev =>
          prev.map(it => (it.name === name ? { ...it, percent: 100, status: TransferStatus.Done } : it)),
        )
      }
    }

    // TODO: if error needed?
    // setDownloadItems(prev => prev.map(it => (it.name === name ? { ...it, status: TransferStatus.Error } : it)))
    return onProgress
  }

  return {
    uploadFiles,
    isUploading,
    uploadItems,
    trackDownload,
    isDownloading,
    downloadCount,
    downloadItems,
    conflictPortal,
  }
}

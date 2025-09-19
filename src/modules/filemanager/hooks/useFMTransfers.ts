import { useCallback, useEffect, useRef, useState } from 'react'
import { useFM } from '../providers/FMContext'
import type { FileInfo, FileInfoOptions } from '@solarpunkltd/file-manager-lib'
import { useUploadConflictDialog } from './useUploadConflictDialog'
import { indexStrToBigint, formatBytes } from '../utils/common'
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

const latestOf = (a: FileInfo, b: FileInfo): FileInfo => {
  const av = indexStrToBigint(a.version)
  const bv = indexStrToBigint(b.version)

  if (av === undefined) {
    return b
  }

  if (bv === undefined) {
    return a
  }

  if (av === bv) {
    return Number(a.timestamp || 0) >= Number(b.timestamp || 0) ? a : b
  }

  return av > bv ? a : b
}
// TODO: what is this? refactor
const pickLatestByName = (rows: FileInfo[], name: string): FileInfo | undefined => {
  const sameName = rows.filter(f => f.name === name)

  if (!sameName.length) return undefined

  return sameName.reduce(latestOf)
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
  const timers = useRef<Map<string, number>>(new Map())
  const endTimers = useRef<Map<string, number>>(new Map())
  const isUploading = uploadItems.some(i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error)

  const clearTimer = (name: string): void => {
    const id = timers.current.get(name)

    if (id != null) {
      clearTimeout(id)
      timers.current.delete(name)
    }
  }
  const clearEndTimer = (name: string): void => {
    const id = endTimers.current.get(name)

    if (id != null) {
      clearTimeout(id)
      endTimers.current.delete(name)
    }
  }

  // TODO: use onUploadProgress instead or together
  const startUploadRamp = useCallback(
    (name: string, size?: string, kind: FileTransferType = FileTransferType.Upload): void => {
      setUploadItems(prev => {
        const idx = prev.findIndex(p => p.name === name)
        const base: TransferItem = { name, size, percent: 0, status: TransferStatus.Uploading, kind }

        if (idx === -1) return [...prev, base]
        const copy = [...prev]
        copy[idx] = base

        return copy
      })
      clearTimer(name)
      clearEndTimer(name)

      const begin = Date.now()
      const DURATION = 1500
      const tick = () => {
        const t = Math.min(1, (Date.now() - begin) / DURATION)
        const p = Math.floor(t * 75)
        setUploadItems(prev =>
          prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, p), kind } : it)),
        )

        if (t < 1) {
          const id = window.setTimeout(tick, 60)
          timers.current.set(name, id)
        } else {
          timers.current.delete(name)
        }
      }
      const id = window.setTimeout(tick, 0)
      timers.current.set(name, id)
    },
    [],
  )
  // TODO: use onUploadProgress and incorporate into the timers
  const finishUploadRamp = useCallback((name: string): void => {
    clearTimer(name)
    setUploadItems(prev =>
      prev.map(it =>
        it.name === name ? { ...it, percent: Math.max(it.percent, 75), status: TransferStatus.Finalizing } : it,
      ),
    )
    const begin = Date.now()
    const DURATION = 700
    const endTick = () => {
      const t = Math.min(1, (Date.now() - begin) / DURATION)
      const p = 75 + Math.floor(t * 25)
      setUploadItems(prev => prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, p) } : it)))

      if (t < 1) {
        const id = window.setTimeout(endTick, 60)
        endTimers.current.set(name, id)
      } else {
        endTimers.current.delete(name)
        setUploadItems(prev =>
          prev.map(it => (it.name === name ? { ...it, percent: 100, status: TransferStatus.Done } : it)),
        )
      }
    }
    const id = window.setTimeout(endTick, 60)
    endTimers.current.set(name, id)
  }, [])

  useEffect(() => {
    return () => {
      timers.current.forEach(id => clearTimeout(id))
      timers.current.clear()
      endTimers.current.forEach(id => clearTimeout(id))
      endTimers.current.clear()
    }
  }, [])

  const collectSameDrive = useCallback(
    (batchId: string): FileInfo[] => files.filter(fi => fi.batchId.toString() === batchId),
    [files],
  )

  const resolveConflict = useCallback(
    async (
      originalName: string,
      sameDrive: FileInfo[],
    ): Promise<{ finalName: string; isReplace: boolean; replaceTopic?: string; replaceHistory?: string }> => {
      const taken = new Set(sameDrive.map(fi => fi.name))

      if (!taken.has(originalName)) {
        return { finalName: originalName, isReplace: false }
      }

      const choice = await openConflict({ originalName, existingNames: taken })

      if (choice.action === 'cancel') return { finalName: originalName, isReplace: false }

      if (choice.action === 'keep-both') {
        return { finalName: choice.newName.trim(), isReplace: false }
      }

      const latest = pickLatestByName(sameDrive, originalName)

      return {
        finalName: originalName,
        isReplace: true,
        replaceTopic: latest?.topic.toString(),
        replaceHistory: latest?.file.historyRef.toString(),
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

      const sameDrive = collectSameDrive(currentDrive.batchId.toString())
      const { finalName, isReplace, replaceTopic, replaceHistory } = await resolveConflict(originalName, sameDrive)

      if (finalName.trim().length === 0) return

      startUploadRamp(finalName, prettySize, isReplace ? FileTransferType.Update : FileTransferType.Upload)

      const info = makeUploadInfo({
        name: finalName,
        files: arr,
        meta,
        topic: isReplace ? replaceTopic : undefined,
      })

      try {
        // todo: startUploadRamp
        fm.upload(
          currentDrive,
          {
            ...info,
            onUploadProgress: () => {
              return
            },
          },
          {
            actHistoryAddress: replaceHistory,
          },
        )
      } catch {
        clearTimer(finalName)
        clearEndTimer(finalName)
        setUploadItems(prev => prev.map(it => (it.name === finalName ? { ...it, status: TransferStatus.Error } : it)))

        return
      }

      finishUploadRamp(finalName)

      refreshFiles()
    },
    [fm, currentDrive, collectSameDrive, resolveConflict, startUploadRamp, finishUploadRamp, refreshFiles],
  )

  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const downloadTimer = useRef<number | null>(null)
  const isDownloading = downloadItems.some(i => i.status !== TransferStatus.Done && i.status !== TransferStatus.Error)
  const downloadCount = downloadItems.length

  const trackDownload = useCallback(async (name: string, task: () => Promise<void>, opts?: { size?: string }) => {
    // TODO: status: uploading in downloads?
    setDownloadItems(prev => {
      const row: TransferItem = {
        name,
        size: opts?.size,
        percent: 1,
        status: TransferStatus.Uploading,
        kind: FileTransferType.Download,
      }
      const idx = prev.findIndex(p => p.name === name)

      if (idx === -1) return [...prev, row]
      const out = [...prev]
      out[idx] = row

      return out
    })

    const begin = Date.now()
    const DURATION = 1500
    const ramp = () => {
      const t = Math.min(1, (Date.now() - begin) / DURATION)
      const p = Math.max(1, Math.floor(t * 75))
      setDownloadItems(prev => prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, p) } : it)))

      if (t < 1) downloadTimer.current = window.setTimeout(ramp, 60)
    }
    requestAnimationFrame(ramp)

    try {
      await task()

      if (downloadTimer.current) {
        clearTimeout(downloadTimer.current)
        downloadTimer.current = null
      }

      const endBegin = Date.now()
      const END_DURATION = 700
      const endTick = () => {
        const t = Math.min(1, (Date.now() - endBegin) / END_DURATION)
        const p = 75 + Math.floor(t * 25)
        setDownloadItems(prev => prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, p) } : it)))

        if (t < 1) window.setTimeout(endTick, 60)
        else {
          setDownloadItems(prev =>
            prev.map(it => (it.name === name ? { ...it, percent: 100, status: TransferStatus.Done } : it)),
          )
        }
      }
      endTick()
    } catch {
      if (downloadTimer.current) {
        clearTimeout(downloadTimer.current)
        downloadTimer.current = null
      }
      setDownloadItems(prev => prev.map(it => (it.name === name ? { ...it, status: TransferStatus.Error } : it)))
    }
  }, [])

  return {
    uploadFiles,
    isUploading,
    uploadItems,
    trackDownload, // processStreams + downloadTodisk
    isDownloading,
    downloadCount,
    downloadItems,
    conflictPortal,
  }
}

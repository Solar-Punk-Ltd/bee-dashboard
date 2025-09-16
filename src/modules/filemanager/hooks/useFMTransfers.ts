import { useCallback, useEffect, useRef, useState } from 'react'
import { useFM } from '../providers/FMContext'
import type { FileInfo, FileInfoOptions } from '@solarpunkltd/file-manager-lib'
import { useUploadConflictDialog } from './useUploadConflictDialog'
import { indexStrToBigint, formatBytes } from '../utils/fm'

// TODO: use enum states
export type TransferItem = {
  name: string
  size?: string
  percent: number
  status: 'uploading' | 'finalizing' | 'done' | 'error'
  kind?: 'upload' | 'update' | 'download'
}

type ConflictChoice = { action: 'cancel' } | { action: 'keep-both'; newName: string } | { action: 'replace' }

type OpenConflictFn = (args: { originalName: string; existingNames: Set<string> | string[] }) => Promise<ConflictChoice>

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

const pickLatestByName = (rows: FileInfo[], name: string): FileInfo | undefined => {
  const sameName = rows.filter(f => f.name === name)

  if (!sameName.length) return undefined

  return sameName.reduce(latestOf)
}

// const waitForUploadEvent = (
//   manager: FileManager,
//   criteria: { name: string; batchId: string; topic?: string },
//   ms = 90_000,
// ): Promise<void> => {
//   return new Promise<void>((resolve, reject) => {
//     const emitter = manager.emitter as {
//       on?: (evt: string, cb: (payload: ShareItem | { fileInfo?: FileInfo } | FileInfo) => void) => void
//       off?: (evt: string, cb: (payload: ShareItem | { fileInfo?: FileInfo } | FileInfo) => void) => void
//     }

//     if (!emitter?.on) {
//       resolve()

//       return
//     }

//     const onUploaded = ({ fileInfo }: { fileInfo: FileInfo }) => {
//       if (!fileInfo) return

//       const nameOk = fileInfo.name === criteria.name
//       const batchOk = fileInfo.batchId.toString() === criteria.batchId
//       const topicOk = criteria.topic ? fileInfo.topic.toString() === criteria.topic : true

//       if (nameOk && batchOk && topicOk) {
//         clearTimeout(timer)
//         emitter.off?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
//         resolve()
//       }
//     }

//     const timer = window.setTimeout(() => {
//       emitter?.off?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
//       reject(new Error('upload event timeout'))
//     }, ms)

//     emitter.on?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
//   })
// }

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
  // TODO: refactor JSX.Element state
  const [openConflict, conflictPortal] = useUploadConflictDialog() as unknown as [OpenConflictFn, JSX.Element | null]

  const [uploadItems, setUploadItems] = useState<TransferItem[]>([])
  const timers = useRef<Map<string, number>>(new Map())
  const endTimers = useRef<Map<string, number>>(new Map())
  const isUploading = uploadItems.some(i => i.status !== 'done' && i.status !== 'error')
  const uploadCount = uploadItems.length

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
  const startUploadRamp = useCallback((name: string, size?: string, kind: 'upload' | 'update' = 'upload'): void => {
    setUploadItems(prev => {
      const idx = prev.findIndex(p => p.name === name)
      const base: TransferItem = { name, size, percent: 0, status: 'uploading', kind }

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
  }, [])
  // TODO: use onUploadProgress and incorporate into the timers
  const finishUploadRamp = useCallback((name: string): void => {
    clearTimer(name)
    setUploadItems(prev =>
      prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, 75), status: 'finalizing' } : it)),
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
        setUploadItems(prev => prev.map(it => (it.name === name ? { ...it, percent: 100, status: 'done' } : it)))
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
    ): Promise<{ finalName: string; isReplace: boolean; replaceTopic?: string }> => {
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
      const topic = latest ? latest.topic.toString() : undefined

      return { finalName: originalName, isReplace: true, replaceTopic: topic }
    },
    [openConflict],
  )

  // file
  // file -> file (1)
  // file (1) -> file (2)

  // const runUpload = useCallback(
  //   async (manager: FileManager, info: FileInfoOptions, wait: { name: string; batchId: string; topic?: string }) => {
  //     // manager.emitter.on(FileManagerEvents.FILE_UPLOADED, onUploaded())

  //     const uploadPromise = manager.upload(info, { onUploadProgress: () => {} })

  //     // TODO: review timeout values
  //     // const withTimeout = <T>(p: Promise<T>, ms: number) =>
  //     //   Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('upload timeout')), ms))])
  //     // const eventP = waitForUploadEvent(manager, wait, 90_000)

  //     // await Promise.race([withTimeout(uploadPromise, 90_000), eventP])
  //   },
  //   [],
  // )

  const uploadFiles = useCallback(
    async (picked: FileList | File[]): Promise<void> => {
      if (!fm || !currentDrive) return

      const arr = Array.from(picked)

      if (arr.length === 0) return

      const originalName = arr[0].name
      const meta = buildUploadMeta(arr)
      const prettySize = formatBytes(meta.size)

      const sameDrive = collectSameDrive(currentDrive.batchId.toString())
      const { finalName, isReplace, replaceTopic } = await resolveConflict(originalName, sameDrive)

      if (finalName.trim().length === 0) return

      startUploadRamp(finalName, prettySize, isReplace ? 'update' : 'upload')

      const info = makeUploadInfo({
        name: finalName,
        files: arr,
        meta,
        topic: isReplace ? replaceTopic : undefined,
      })

      try {
        // await runUpload(fm, info, { name: finalName, batchId: batchIdStr, topic: isReplace ? replaceTopic : undefined })
        // todo: startUploadRamp?}
        fm.upload(currentDrive, {
          ...info,
          onUploadProgress: () => {
            return
          },
        })
      } catch {
        clearTimer(finalName)
        clearEndTimer(finalName)
        setUploadItems(prev => prev.map(it => (it.name === finalName ? { ...it, status: 'error' } : it)))

        return
      }

      finishUploadRamp(finalName)

      refreshFiles()
    },
    [fm, currentDrive, collectSameDrive, resolveConflict, startUploadRamp, finishUploadRamp, refreshFiles],
  )

  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const downloadTimer = useRef<number | null>(null)
  const isDownloading = downloadItems.some(i => i.status !== 'done' && i.status !== 'error')
  const downloadCount = downloadItems.length

  const trackDownload = useCallback(async (name: string, task: () => Promise<void>, opts?: { size?: string }) => {
    // TODO: status: uploading in downloads?
    setDownloadItems(prev => {
      const row: TransferItem = { name, size: opts?.size, percent: 1, status: 'uploading', kind: 'download' }
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
        else setDownloadItems(prev => prev.map(it => (it.name === name ? { ...it, percent: 100, status: 'done' } : it)))
      }
      endTick()
    } catch {
      if (downloadTimer.current) {
        clearTimeout(downloadTimer.current)
        downloadTimer.current = null
      }
      setDownloadItems(prev => prev.map(it => (it.name === name ? { ...it, status: 'error' } : it)))
    }
  }, [])

  const downloadBlob = useCallback(
    async (name: string, blobPromise: Promise<Blob>, opts?: { size?: string }) => {
      return await trackDownload(
        name,
        async () => {
          const blob = await blobPromise
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = name
          a.rel = 'noopener'
          a.style.display = 'none'
          document.body.appendChild(a)
          requestAnimationFrame(() => {
            a.click()
            setTimeout(() => {
              a.remove()
              URL.revokeObjectURL(url)
            }, 0)
          })
        },
        opts,
      )
    },
    [trackDownload],
  )

  return {
    uploadFiles,
    isUploading,
    uploadCount,
    uploadItems,
    trackDownload, // processStreams + downloadTodisk
    downloadBlob, // TODO: use as downloadTodisk fallback
    isDownloading,
    downloadCount,
    downloadItems,
    conflictPortal,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFM } from '../providers/FMContext'
import { buildUploadMeta } from '../utils/buildUploadMeta'
import type { FileInfo, FileInfoOptions, FileManager, ShareItem } from '@solarpunkltd/file-manager-lib'
import { FileManagerEvents } from '@solarpunkltd/file-manager-lib'
import type { BatchId } from '@ethersphere/bee-js'
import { useUploadConflictDialog } from './useUploadConflictDialog'

export type TransferItem = {
  name: string
  size?: string
  percent: number
  status: 'uploading' | 'finalizing' | 'done' | 'error'
  kind?: 'upload' | 'update' | 'download'
}

type CurrentBatch = { batchID: BatchId; label?: string }
type FMContextShape = {
  fm: FileManager | null
  currentBatch: CurrentBatch | null
  files: FileInfo[]
  refreshFiles?: () => void | Promise<void>
}

type ConflictChoice = { action: 'cancel' } | { action: 'keep-both'; newName: string } | { action: 'replace' }

type OpenConflictFn = (args: { originalName: string; existingNames: Set<string> | string[] }) => Promise<ConflictChoice>

type UploadMeta = Record<string, string | number>

const normalizeCustomMetadata = (meta: UploadMeta): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta)) out[k] = typeof v === 'string' ? v : String(v)

  return out
}

/** Best-effort safe string */
const toStringSafe = (v: unknown): string => {
  if (v == null) return ''

  if (typeof v === 'string') return v

  return String(v)
}

const formatBytes = (v?: string | number): string | undefined => {
  let n: number

  if (typeof v === 'string') n = Number(v)
  else if (typeof v === 'number') n = v
  else n = NaN

  if (!Number.isFinite(n) || n < 0) return undefined

  if (n < 1024) return `${n} B`

  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let val = n / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }

  return `${val.toFixed(1)} ${units[i]}`
}

const getBatchIdString = (fi: FileInfo): string => toStringSafe((fi.batchId as BatchId | string) ?? '')

const sameDriveAs = (fi: FileInfo, wanted: string): boolean => getBatchIdString(fi) === wanted

const latestOf = (a: FileInfo, b: FileInfo): FileInfo => {
  let av = BigInt(0)
  let bv = BigInt(0)
  try {
    av = BigInt(a.version ?? '0')
  } catch {
    av = BigInt(0)
  }
  try {
    bv = BigInt(b.version ?? '0')
  } catch {
    bv = BigInt(0)
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

/** Wait until FILE_UPLOADED event matches criteria (or timeout). */
const waitForUploadEvent = (
  manager: FileManager,
  criteria: { name: string; batchId: string; topic?: string },
  ms = 90_000,
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const emitter = manager.emitter as {
      on?: (evt: string, cb: (payload: ShareItem | { fileInfo?: FileInfo } | FileInfo) => void) => void
      off?: (evt: string, cb: (payload: ShareItem | { fileInfo?: FileInfo } | FileInfo) => void) => void
    }

    if (!emitter?.on) {
      resolve()

      return
    }

    const onUploaded = (payload: ShareItem | { fileInfo?: FileInfo } | FileInfo) => {
      const fi: FileInfo | undefined =
        (payload as ShareItem)?.fileInfo ?? (payload as { fileInfo?: FileInfo })?.fileInfo ?? (payload as FileInfo)

      if (!fi) return

      const fiBatch = toStringSafe((fi.batchId as BatchId | string) ?? '')
      const fiName = fi.name ?? ''
      const fiTopic = (fi.topic as { toString?: () => string } | string | undefined) && toStringSafe(fi.topic)

      const nameOk = fiName === criteria.name
      const batchOk = fiBatch === criteria.batchId
      const topicOk = criteria.topic ? fiTopic === criteria.topic : true

      if (nameOk && batchOk && topicOk) {
        clearTimeout(timer)
        emitter.off?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
        resolve()
      }
    }

    const timer = window.setTimeout(() => {
      emitter?.off?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
      reject(new Error('upload event timeout'))
    }, ms)

    emitter.on?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
  })
}

/** Build upload payload for FileManager.upload() */
const makeUploadInfo = (args: {
  batchId: string
  name: string
  files: File[]
  meta: Record<string, string | number>
  topic?: string
}): FileInfoOptions => {
  const info: FileInfoOptions['info'] = {
    batchId: args.batchId,
    name: args.name,
    customMetadata: normalizeCustomMetadata(args.meta),
  }

  if (args.topic) info.topic = args.topic

  return {
    info,
    files: args.files,
  }
}

export function useFMTransfers() {
  const { fm, currentBatch, refreshFiles, files } = useFM() as unknown as FMContextShape
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach(id => clearTimeout(id))
      timers.current.clear()
      endTimers.current.forEach(id => clearTimeout(id))
      endTimers.current.clear()
    }
  }, [])

  /** Split helpers to keep complexity down */
  const collectSameDrive = useCallback(
    (batchId: string): FileInfo[] => files.filter(fi => sameDriveAs(fi, batchId)),
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
      const topic = latest ? toStringSafe(latest.topic) : undefined

      return { finalName: originalName, isReplace: true, replaceTopic: topic }
    },
    [openConflict],
  )

  const runUpload = useCallback(
    async (manager: FileManager, info: FileInfoOptions, wait: { name: string; batchId: string; topic?: string }) => {
      const uploadPromise = manager.upload(info)
      const withTimeout = <T>(p: Promise<T>, ms: number) =>
        Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('upload timeout')), ms))])
      const eventP = waitForUploadEvent(manager, wait, 90_000)
      await Promise.race([withTimeout(uploadPromise, 90_000), eventP])
    },
    [],
  )

  const uploadFiles = useCallback(
    async (picked: FileList | File[]): Promise<void> => {
      if (!fm || !currentBatch) return

      const arr = Array.from(picked) as File[]

      if (arr.length === 0) return

      const originalName = arr[0].name
      const meta = buildUploadMeta(arr) as UploadMeta
      const prettySize = formatBytes(meta.size)
      const batchIdStr = toStringSafe(currentBatch.batchID as unknown as string)

      const sameDrive = collectSameDrive(batchIdStr)
      const { finalName, isReplace, replaceTopic } = await resolveConflict(originalName, sameDrive)

      if (finalName.trim().length === 0) return

      startUploadRamp(finalName, prettySize, isReplace ? 'update' : 'upload')

      const info = makeUploadInfo({
        batchId: batchIdStr,
        name: finalName,
        files: arr,
        meta,
        topic: isReplace ? replaceTopic : undefined,
      })

      try {
        await runUpload(fm, info, { name: finalName, batchId: batchIdStr, topic: isReplace ? replaceTopic : undefined })
      } catch {
        clearTimer(finalName)
        clearEndTimer(finalName)
        setUploadItems(prev => prev.map(it => (it.name === finalName ? { ...it, status: 'error' } : it)))

        return
      }

      finishUploadRamp(finalName)

      if (typeof refreshFiles === 'function') {
        void refreshFiles()
      }
    },
    [fm, currentBatch, collectSameDrive, resolveConflict, startUploadRamp, runUpload, finishUploadRamp, refreshFiles],
  )

  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const downloadTimer = useRef<number | null>(null)
  const isDownloading = downloadItems.some(i => i.status !== 'done' && i.status !== 'error')
  const downloadCount = downloadItems.length

  const trackDownload = useCallback(async (name: string, task: () => Promise<void>, opts?: { size?: string }) => {
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
    trackDownload,
    downloadBlob,
    isDownloading,
    downloadCount,
    downloadItems,
    conflictPortal,
  }
}

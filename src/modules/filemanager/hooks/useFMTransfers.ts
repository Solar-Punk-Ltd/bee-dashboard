import { useCallback, useEffect, useRef, useState } from 'react'
import { useFM } from '../providers/FMContext'
import { buildUploadMeta } from '../utils/buildUploadMeta'
import type { FileInfo, FileInfoOptions } from '@solarpunkltd/file-manager-lib'
import { useUploadConflictDialog } from './useUploadConflictDialog'
import { FileManagerEvents } from '@solarpunkltd/file-manager-lib'

export type TransferItem = {
  name: string
  size?: string
  percent: number
  status: 'uploading' | 'finalizing' | 'done' | 'error'
  kind?: 'upload' | 'update' | 'download'
}

export function useFMTransfers() {
  const { fm, currentBatch, refreshFiles, files } = useFM()
  const [openConflict, conflictPortal] = useUploadConflictDialog()

  const [uploadItems, setUploadItems] = useState<TransferItem[]>([])
  const timers = useRef<Map<string, number>>(new Map())
  const endTimers = useRef<Map<string, number>>(new Map())
  const isUploading = uploadItems.some(i => i.status !== 'done' && i.status !== 'error')
  const uploadCount = uploadItems.length

  const formatBytes = (v?: string | number) => {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN

    if (!Number.isFinite(n) || n < 0) return undefined

    if (n < 1024) return `${n} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let val = n / 1024,
      i = 0
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024
      i++
    }

    return `${val.toFixed(1)} ${units[i]}`
  }

  const clearTimer = (name: string) => {
    const id = timers.current.get(name)

    if (id != null) {
      clearTimeout(id)
      timers.current.delete(name)
    }
  }
  const clearEndTimer = (name: string) => {
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
    const begin = Date.now(),
      DURATION = 1500
    const tick = () => {
      const t = Math.min(1, (Date.now() - begin) / DURATION)
      const p = Math.floor(t * 75)
      setUploadItems(prev =>
        prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, p), kind } : it)),
      )

      if (t < 1) {
        const id = window.setTimeout(tick, 60)
        timers.current.set(name, id)
      } else timers.current.delete(name)
    }
    const id = window.setTimeout(tick, 0)
    timers.current.set(name, id)
  }, [])

  const finishUploadRamp = useCallback((name: string): void => {
    clearTimer(name)
    setUploadItems(prev =>
      prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, 75), status: 'finalizing' } : it)),
    )
    const begin = Date.now(),
      DURATION = 700
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

  useEffect(
    () => () => {
      timers.current.forEach(id => clearTimeout(id))
      timers.current.clear()
      endTimers.current.forEach(id => clearTimeout(id))
      endTimers.current.clear()
    },
    [],
  )

  const waitForUploadEvent = (
    manager: any,
    criteria: { name: string; batchId: string; topic?: string },
    ms = 90_000,
  ) => {
    return new Promise<void>((resolve, reject) => {
      const emitter = manager?.emitter

      if (!emitter?.on) {
        resolve()

        return
      }
      const onUploaded = (payload: any) => {
        try {
          const fi = payload?.fileInfo ?? payload
          const fiBatch = (fi?.batchId ?? fi?.batchID)?.toString?.() ?? ''
          const fiName = fi?.name ?? ''
          const fiTopic = fi?.topic?.toString?.()
          const ok =
            fiName === criteria.name &&
            fiBatch === criteria.batchId &&
            (criteria.topic ? fiTopic === criteria.topic : true)

          if (ok) {
            clearTimeout(timer)
            emitter.off?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
            resolve()
          }
        } catch {
          /* ignore */
        }
      }
      const timer = window.setTimeout(() => {
        try {
          emitter.off?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
        } catch {}
        reject(new Error('upload event timeout'))
      }, ms)
      emitter.on?.(FileManagerEvents.FILE_UPLOADED, onUploaded)
    })
  }

  const uploadFiles = useCallback(
    async (picked: FileList | File[]): Promise<void> => {
      if (!fm || !currentBatch) return
      const arr = Array.from(picked) as File[]

      if (arr.length === 0) return

      const originalName = arr[0].name
      const meta = buildUploadMeta(arr)
      const prettySize = formatBytes(meta.size)

      const sameDrive = (files || []).filter(
        fi => String((fi as any).batchId ?? (fi as any).batchID ?? '') === currentBatch.batchID.toString(),
      )

      const taken = new Set(sameDrive.map(fi => fi.name))
      let finalName = originalName
      let replaceTopic: unknown | undefined
      let isReplace = false

      if (taken.has(originalName)) {
        const choice = await openConflict({ originalName, existingNames: taken })

        if (choice.action === 'cancel') return

        if (choice.action === 'keep-both') {
          finalName = choice.newName
        } else {
          isReplace = true
          const sameName = sameDrive.filter(fi => fi.name === originalName)
          const latest = sameName.reduce((a, b) => {
            const av = BigInt(a?.version ?? '0'),
              bv = BigInt(b.version ?? '0')

            if (av === bv) return Number(a.timestamp || 0) >= Number(b.timestamp || 0) ? a : b

            return av > bv ? a : b
          })
          replaceTopic = latest?.topic
        }
      }

      startUploadRamp(finalName, prettySize, isReplace ? 'update' : 'upload')

      let includeTopic = Boolean(isReplace && replaceTopic)
      let existing: FileInfo | undefined

      if (isReplace) {
        const candidates = sameDrive.filter(fi => fi.name === originalName)
        existing = candidates.reduce((a, b) => {
          const av = BigInt(a?.version ?? '0'),
            bv = BigInt(b.version ?? '0')

          if (av === bv) return Number(a.timestamp || 0) >= Number(b.timestamp || 0) ? a : b

          return av > bv ? a : b
        }, candidates[0])
      }

      try {
        const existingOwner = (existing as any)?.owner?.toString?.()?.toLowerCase?.()
        const currentOwner = (
          (fm as any)?.owner ||
          (fm as any)?.address ||
          (fm as any)?.signerAddress ||
          (await (fm as any)?.getOwner?.()) ||
          (await (fm as any)?.getAddress?.())
        )
          ?.toString?.()
          ?.toLowerCase?.()

        if (includeTopic && existingOwner && currentOwner && existingOwner !== currentOwner) {
          includeTopic = false
        }
      } catch {
        /* best-effort */
      }

      const topicStr = includeTopic ? (replaceTopic as any)?.toString?.() ?? String(replaceTopic) : undefined
      const chainRefStr = includeTopic
        ? String(
            (existing as any)?.file?.historyRef ??
              (existing as any)?.historyRef ??
              (existing as any)?.actHistoryRef ??
              '',
          ) || undefined
        : undefined

      const payloadBase: FileInfoOptions = {
        info: {
          batchId: currentBatch.batchID.toString(),
          name: finalName,
          customMetadata: meta,
          ...(topicStr ? { topic: topicStr } : {}),
        },
        files: arr as File[],
      }

      const uploadOpts: Record<string, any> = {
        redundancyLevel: 1,
      }

      const withTimeout = <T>(p: Promise<T>, ms: number) =>
        Promise.race<T>([
          p,
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error('upload timeout')), ms)) as Promise<T>,
        ])

      try {
        const uploadP = fm.upload(payloadBase as any, uploadOpts)
        uploadP.catch(() => void 0)
        const eventP = waitForUploadEvent(
          fm,
          { name: finalName, batchId: currentBatch.batchID.toString(), topic: topicStr },
          90_000,
        )
        await Promise.race([withTimeout(uploadP, 90_000), eventP])
      } catch {
        clearTimer(finalName)
        clearEndTimer(finalName)
        setUploadItems(prev => prev.map(it => (it.name === finalName ? { ...it, status: 'error' } : it)))

        return
      }

      finishUploadRamp(finalName)
      await Promise.resolve(refreshFiles?.())
    },
    [fm, currentBatch, refreshFiles, files, openConflict, startUploadRamp, finishUploadRamp],
  )

  // -------------------- Downloads --------------------
  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const downloadTimer = useRef<number | null>(null)
  const isDownloading = downloadItems.some(i => i.status !== 'done' && i.status !== 'error')
  const downloadCount = downloadItems.length

  const trackDownload = useCallback(async (name: string, task: () => Promise<void>, opts?: { size?: string }) => {
    setDownloadItems(prev => {
      const row: TransferItem = { name, size: opts?.size, percent: 1, status: 'uploading', kind: 'download' }
      const idx = prev.findIndex(p => p.name === name)
      const out = idx === -1 ? [...prev, row] : Object.assign([...prev], { [idx]: row })

      return out as TransferItem[]
    })
    const begin = Date.now(),
      DURATION = 1500
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
      const endBegin = Date.now(),
        END_DURATION = 700
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

import { useCallback, useRef, useState } from 'react'
import { useFM } from '../providers/FMContext'
import { buildUploadMeta } from '../utils/buildUploadMeta'
import type { FileInfoOptions } from '@solarpunkltd/file-manager-lib'

export type TransferItem = {
  name: string
  size?: string
  percent: number
  status: 'uploading' | 'finalizing' | 'done' | 'error'
}

const formatBytes = (v?: string | number) => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN

  if (!Number.isFinite(n) || n < 0) return undefined

  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let val = n / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }

  return `${val.toFixed(1)} ${units[i]}`
}

export function useFMTransfers() {
  const { fm, currentBatch, refreshFiles } = useFM()
  const [uploadItems, setUploadItems] = useState<TransferItem[]>([])
  const rampTimer = useRef<number | null>(null)

  const isUploading = uploadItems.some(i => i.status !== 'done' && i.status !== 'error')
  const uploadCount = uploadItems.length

  const startLinearRamp = useCallback((name: string, size?: string) => {
    setUploadItems(prev =>
      prev.find(p => p.name === name) ? prev : [...prev, { name, size, percent: 0, status: 'uploading' }],
    )
    const begin = Date.now()
    const DURATION = 1500
    const tick = () => {
      const t = Math.min(1, (Date.now() - begin) / DURATION)
      const p = Math.floor(t * 75)
      setUploadItems(prev =>
        prev.map(it =>
          it.name === name && it.status === 'uploading' ? { ...it, percent: Math.max(it.percent, p) } : it,
        ),
      )

      if (t < 1) rampTimer.current = window.setTimeout(tick, 60)
    }
    tick()
  }, [])

  const finishLastQuarter = useCallback((name: string) => {
    if (rampTimer.current) {
      clearTimeout(rampTimer.current)
      rampTimer.current = null
    }
    setUploadItems(prev =>
      prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, 75), status: 'finalizing' } : it)),
    )
    const begin = Date.now()
    const DURATION = 700
    const tick = () => {
      const t = Math.min(1, (Date.now() - begin) / DURATION)
      const p = 75 + Math.floor(t * 25)
      setUploadItems(prev => prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, p) } : it)))

      if (t < 1) {
        window.setTimeout(tick, 60)
      } else {
        setUploadItems(prev => prev.map(it => (it.name === name ? { ...it, percent: 100, status: 'done' } : it)))
      }
    }
    tick()
  }, [])

  const uploadFiles = useCallback(
    async (picked: FileList | File[]) => {
      if (!fm || !currentBatch) return
      const arr = Array.from(picked)

      if (arr.length === 0) return

      const firstName = arr[0].name
      const meta = buildUploadMeta(arr)
      const prettySize = formatBytes(meta.size)

      startLinearRamp(firstName, prettySize)

      const payload: FileInfoOptions = {
        info: {
          batchId: currentBatch.batchID.toString(),
          name: firstName,
          customMetadata: meta,
        },
        files: arr,
      }

      try {
        await fm.upload(payload)
        finishLastQuarter(firstName)
        refreshFiles?.()
      } catch {
        setUploadItems(prev => prev.map(it => (it.name === firstName ? { ...it, status: 'error' } : it)))
      }
    },
    [fm, currentBatch, refreshFiles, startLinearRamp, finishLastQuarter],
  )

  return {
    uploadFiles,
    isUploading,
    uploadCount,
    uploadItems,
  }
}

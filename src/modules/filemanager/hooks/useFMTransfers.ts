import { useCallback, useRef, useState } from 'react'
import { useFM } from '../providers/FMContext'

export type TransferItem = {
  name: string
  size?: string
  percent: number
  status: 'uploading' | 'finalizing' | 'done' | 'error'
}

type UploadMeta = { size: string; fileCount: string; mime: string }
type UploadPayload = {
  info: { batchId: string; name: string; customMetadata: UploadMeta }
  files: File[]
}

function buildUploadMeta(files: File[] | FileList): UploadMeta {
  const arr = Array.from(files as File[])
  const totalSize = arr.reduce((acc, f) => acc + (f.size || 0), 0)
  const primary = arr[0]

  return { size: String(totalSize), fileCount: String(arr.length), mime: primary?.type || 'application/octet-stream' }
}

export function useFMTransfers() {
  const { fm, currentBatch, refreshFiles } = useFM()

  const [uploadItems, setUploadItems] = useState<TransferItem[]>([])
  const uploadTimer = useRef<number | null>(null)
  const isUploading = uploadItems.some(i => i.status !== 'done' && i.status !== 'error')
  const uploadCount = uploadItems.length

  const startUploadRamp = useCallback((name: string): void => {
    setUploadItems(prev =>
      prev.find(p => p.name === name) ? prev : [...prev, { name, percent: 0, status: 'uploading' }],
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

      if (t < 1) uploadTimer.current = window.setTimeout(tick, 60)
    }
    tick()
  }, [])

  const finishUploadRamp = useCallback((name: string): void => {
    if (uploadTimer.current) {
      clearTimeout(uploadTimer.current)
      uploadTimer.current = null
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
    async (picked: FileList | File[]): Promise<void> => {
      if (!fm || !currentBatch) return
      const arr = Array.from(picked)

      if (arr.length === 0) return
      const name = arr[0].name
      startUploadRamp(name)
      const info: UploadPayload = {
        info: { batchId: currentBatch.batchID.toString(), name, customMetadata: buildUploadMeta(arr) },
        files: arr,
      }
      try {
        const uploader = fm as unknown as { upload: (p: UploadPayload) => Promise<unknown> }
        await uploader.upload(info)
        finishUploadRamp(name)
        refreshFiles()
        try {
          localStorage.setItem('fm:pulse', String(Date.now()))
        } catch {
          // TODO: Handle the error
        }
      } catch {
        setUploadItems(prev => prev.map(it => (it.name === name ? { ...it, status: 'error' } : it)))
      }
    },
    [fm, currentBatch, refreshFiles, startUploadRamp, finishUploadRamp],
  )

  const [downloadItems, setDownloadItems] = useState<TransferItem[]>([])
  const downloadTimer = useRef<number | null>(null)
  const isDownloading = downloadItems.some(i => i.status !== 'done' && i.status !== 'error')
  const downloadCount = downloadItems.length

  const trackDownload = useCallback(
    async (name: string, task: () => Promise<void>, opts?: { size?: string }): Promise<void> => {
      setDownloadItems(prev => {
        const row: TransferItem = { name, size: opts?.size, percent: 1, status: 'uploading' }
        const idx = prev.findIndex(p => p.name === name)

        if (idx === -1) return [...prev, row]
        const copy = [...prev]
        copy[idx] = row

        return copy
      })
      const begin = Date.now()
      const DURATION = 1500
      const ramp = () => {
        const t = Math.min(1, (Date.now() - begin) / DURATION)
        const p = Math.max(1, Math.floor(t * 75))
        setDownloadItems(prev =>
          prev.map(it =>
            it.name === name && it.status === 'uploading' ? { ...it, percent: Math.max(it.percent, p) } : it,
          ),
        )

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
          setDownloadItems(prev =>
            prev.map(it => (it.name === name ? { ...it, percent: Math.max(it.percent, p) } : it)),
          )

          if (t < 1) {
            window.setTimeout(endTick, 60)
          } else {
            setDownloadItems(prev => prev.map(it => (it.name === name ? { ...it, percent: 100, status: 'done' } : it)))
          }
        }
        endTick()
      } catch {
        if (downloadTimer.current) {
          clearTimeout(downloadTimer.current)
          downloadTimer.current = null
        }
        setDownloadItems(prev => prev.map(it => (it.name === name ? { ...it, status: 'error' } : it)))
      }
    },
    [],
  )

  const downloadBlob = useCallback(
    async (name: string, blobPromise: Promise<Blob>, opts?: { size?: string }): Promise<void> => {
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
  }
}

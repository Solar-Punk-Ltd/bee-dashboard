import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { useFM } from '../providers/FMContext'

export type DownloadItem = {
  name: string
  size?: string
  percent: number
  status: 'downloading' | 'finalizing' | 'done' | 'error'
}

type DlState = { items: DownloadItem[] }
let state: DlState = { items: [] }
const listeners = new Set<(s: DlState) => void>()

function emit(next: DlState) {
  state = next
  listeners.forEach(l => l(state))
}

function upsertItem(name: string, patch: Partial<DownloadItem>) {
  const next: DownloadItem[] = (() => {
    const idx = state.items.findIndex(i => i.name === name)

    if (idx === -1) {
      const base: DownloadItem = { name, percent: 0, status: 'downloading', size: undefined }
      const merged = { ...base, ...patch } as DownloadItem

      return [...state.items, merged]
    }
    const curr = state.items[idx]
    const updated = { ...curr, ...patch } as DownloadItem
    const copy = state.items.slice()
    copy[idx] = updated

    return copy
  })()
  emit({ items: next })
}

function finalizeItem(name: string, patch?: Partial<DownloadItem>) {
  const next: DownloadItem[] = state.items.map(i =>
    i.name === name ? ({ ...i, ...patch, percent: 100, status: 'done' as const } as DownloadItem) : i,
  )
  emit({ items: next })
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

const isUint8Array = (x: unknown): x is Uint8Array => x instanceof Uint8Array
const isArrayBuffer = (x: unknown): x is ArrayBuffer => typeof ArrayBuffer !== 'undefined' && x instanceof ArrayBuffer
const isBlob = (x: unknown): x is Blob => typeof Blob !== 'undefined' && x instanceof Blob
const hasBufferLike = (x: unknown): x is { buffer: ArrayBufferLike; byteLength: number } =>
  Boolean(x) &&
  typeof x === 'object' &&
  'buffer' in (x as Record<string, unknown>) &&
  'byteLength' in (x as Record<string, unknown>)

function bytesToBlob(bytes: Uint8Array, mime?: string): Blob {
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

async function partToUint8(part: unknown): Promise<Uint8Array | undefined> {
  if (part == null) return undefined

  if (isUint8Array(part)) return part

  if (isBlob(part)) {
    const ab = await part.arrayBuffer()

    return new Uint8Array(ab)
  }

  if (typeof part === 'object' && part !== null && 'data' in part) {
    const nested = (part as { data?: unknown }).data

    return partToUint8(nested)
  }

  if (isArrayBuffer(part)) return new Uint8Array(part)

  if (hasBufferLike(part)) {
    try {
      return new Uint8Array(part.buffer)
    } catch {
      /* noop */
    }
  }

  try {
    if (typeof Response !== 'undefined') {
      const ab = await new Response(part as BodyInit).arrayBuffer()

      return new Uint8Array(ab)
    }
  } catch {
    /* noop */
  }

  return undefined
}

async function toBestBlob(result: unknown, mime?: string): Promise<Blob> {
  if (Array.isArray(result)) {
    const buffers = (await Promise.all(result.map(p => partToUint8(p)))).filter(Boolean) as Uint8Array[]

    if (!buffers.length) throw new Error('No downloadable parts')
    const best = buffers.reduce((a, b) => (b.byteLength > a.byteLength ? b : a))

    return bytesToBlob(best, mime)
  }

  const single = await partToUint8(result)

  if (!single) throw new Error('Could not get bytes')

  return bytesToBlob(single, mime)
}

function guessMimeFromName(name?: string): string | undefined {
  if (!name) return undefined
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    txt: 'text/plain',
    json: 'application/json',
    csv: 'text/csv',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  }

  return ext ? map[ext] : undefined
}

function openSentryWindow() {
  try {
    return window.open('', '_blank') || null
  } catch {
    return null
  }
}

export function useFMDownloads() {
  const { fm, refreshFiles } = useFM()
  const [local, setLocal] = useState<DlState>(state)
  const rampTimer = useRef<number | null>(null)

  useEffect(() => {
    const listener = (s: DlState) => setLocal(s)
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  }, [])

  const startLinearRamp = useCallback((name: string, sizeHint?: string) => {
    upsertItem(name, { percent: 0, status: 'downloading', size: sizeHint })
    const begin = Date.now()
    const DURATION = 1500
    const tick = () => {
      const t = Math.min(1, (Date.now() - begin) / DURATION)
      const p = Math.floor(t * 75)
      upsertItem(name, { percent: p, status: 'downloading' as const })

      if (t < 1) rampTimer.current = window.setTimeout(tick, 60)
    }
    tick()
  }, [])

  const finishLastQuarter = useCallback((name: string) => {
    if (rampTimer.current) {
      clearTimeout(rampTimer.current)
      rampTimer.current = null
    }
    upsertItem(name, { percent: 75, status: 'finalizing' as const })
    const begin = Date.now()
    const DURATION = 700
    const tick = () => {
      const t = Math.min(1, (Date.now() - begin) / DURATION)
      const p = 75 + Math.floor(t * 25)
      upsertItem(name, { percent: p, status: 'finalizing' as const })

      if (t < 1) {
        window.setTimeout(tick, 60)
      } else {
        finalizeItem(name)
      }
    }
    tick()
  }, [])

  const performDownload = useCallback(
    async (fileInfo: FileInfo) => {
      if (!fm) throw new Error('FileManager not ready')
      const res = await fm.download(fileInfo)
      const mimeFromMeta = fileInfo.customMetadata?.mime
      const mime = mimeFromMeta || guessMimeFromName(fileInfo.name) || 'application/octet-stream'
      const blob = await toBestBlob(res as unknown, mime)

      return blob
    },
    [fm],
  )

  const downloadFile = useCallback(
    async (fileInfo: FileInfo) => {
      const name = fileInfo.name || 'download'
      const sizeHint = formatBytes(fileInfo.customMetadata?.size)
      try {
        startLinearRamp(name, sizeHint)
        const blob = await performDownload(fileInfo)
        finishLastQuarter(name)

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 15000)

        refreshFiles?.()
      } catch {
        upsertItem(name, { status: 'error' as const })
      }
    },
    [performDownload, refreshFiles, startLinearRamp, finishLastQuarter],
  )

  const viewFile = useCallback(
    async (fileInfo: FileInfo) => {
      const name = fileInfo.name || 'file'
      const sizeHint = formatBytes(fileInfo.customMetadata?.size)
      const win = openSentryWindow()

      try {
        startLinearRamp(name, sizeHint)
        const blob = await performDownload(fileInfo)
        finishLastQuarter(name)

        const url = URL.createObjectURL(blob)

        if (win) {
          try {
            win.location.replace(url)
          } catch {
            window.open(url, '_blank')
          }

          const timer = window.setInterval(() => {
            try {
              if (win.closed) {
                URL.revokeObjectURL(url)
                window.clearInterval(timer)
              }
            } catch {
              /* noop */
            }
          }, 5000)

          window.setTimeout(() => {
            try {
              URL.revokeObjectURL(url)
            } catch {
              /* noop */
            }
          }, 120000)
        } else {
          window.open(url, '_blank')
          window.setTimeout(() => {
            try {
              URL.revokeObjectURL(url)
            } catch {
              /* noop */
            }
          }, 120000)
        }
      } catch {
        if (win) {
          try {
            win.close()
          } catch {
            /* noop */
          }
        }
        upsertItem(name, { status: 'error' as const })
      }
    },
    [performDownload, startLinearRamp, finishLastQuarter],
  )

  const isDownloading = local.items.some(i => i.status !== 'done' && i.status !== 'error')
  const downloadCount = local.items.length
  const downloadItems = local.items

  return {
    isDownloading,
    downloadCount,
    downloadItems,
    downloadFile,
    viewFile,
  }
}

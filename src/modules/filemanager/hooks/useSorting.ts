import { useEffect, useMemo, useState } from 'react'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'

export type SortKey = 'name' | 'size' | 'timestamp' | 'drive'
export type SortDir = 'asc' | 'desc'
export type SortState = { key: SortKey; dir: SortDir }

type Options = {
  persist?: boolean
  defaultState?: SortState
  storageKey?: string
  getDriveName?: (fi: FileInfo) => string
}

const STORAGE_KEY = 'fm.sort.v1'
const DEFAULT_STATE: SortState = { key: 'timestamp', dir: 'desc' }

const coerceNumber = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v

  if (typeof v === 'string') {
    const n = Number(v)

    if (Number.isFinite(n)) return n
  }

  return 0
}

const getSize = (fi: FileInfo): number => {
  const cm = (fi.customMetadata ?? {}) as Record<string, unknown>

  if (cm && Object.prototype.hasOwnProperty.call(cm, 'size')) {
    return coerceNumber(cm.size)
  }

  return coerceNumber((fi as unknown as { size?: number | string }).size)
}

const getTs = (fi: FileInfo): number => coerceNumber((fi as unknown as { timestamp?: number | string }).timestamp)

const isValidState = (s: Partial<SortState>): s is SortState =>
  (s.key === 'name' || s.key === 'size' || s.key === 'timestamp' || s.key === 'drive') &&
  (s.dir === 'asc' || s.dir === 'desc')

export function useSorting(
  items: FileInfo[],
  opts: Options = {},
): {
  sorted: FileInfo[]
  sort: SortState
  toggle: (key: SortKey) => void
  reset: () => void
} {
  const { persist = true, defaultState = DEFAULT_STATE, storageKey = STORAGE_KEY, getDriveName } = opts

  const [sort, setSort] = useState<SortState>(() => {
    if (!persist) return defaultState
    try {
      const raw = localStorage.getItem(storageKey)

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SortState>

        if (isValidState(parsed)) return parsed
      }
    } catch {
      // ignore storage/JSON errors and use default
    }

    return defaultState
  })

  useEffect(() => {
    if (!persist) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(sort))
    } catch {
      // ignore storage errors
    }
  }, [persist, storageKey, sort])

  const toggle = (key: SortKey): void => {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const reset = (): void => setSort(defaultState)

  const sorted = useMemo<FileInfo[]>(() => {
    const arr = [...items]
    const mul = sort.dir === 'asc' ? 1 : -1

    arr.sort((a, b) => {
      if (sort.key === 'name') {
        const an = (a.name ?? '').toLocaleLowerCase()
        const bn = (b.name ?? '').toLocaleLowerCase()

        if (an < bn) return -1 * mul

        if (an > bn) return Number(mul)

        return 0
      }

      if (sort.key === 'size') {
        const av = getSize(a)
        const bv = getSize(b)

        if (av < bv) return -1 * mul

        if (av > bv) return Number(mul)

        return 0
      }

      if (sort.key === 'drive') {
        const ad = (getDriveName?.(a) ?? '').toLocaleLowerCase()
        const bd = (getDriveName?.(b) ?? '').toLocaleLowerCase()

        if (ad < bd) return -1 * mul

        if (ad > bd) return Number(mul)

        return 0
      }

      const av = getTs(a)
      const bv = getTs(b)

      if (av < bv) return -1 * mul

      if (av > bv) return Number(mul)

      return 0
    })

    return arr
  }, [items, sort, getDriveName])

  return { sorted, sort, toggle, reset }
}

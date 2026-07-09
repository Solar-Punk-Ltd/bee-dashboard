import { DriveInfo, FileRecord } from '@solarpunkltd/file-manager-lib'
import { useCallback, useMemo } from 'react'

import { ViewType } from '../constants/transfers'
import { indexStrToBigint, isTrashed } from '../utils/common'

interface UseFileFilteringProps {
  files: FileRecord[]
  currentDrive: DriveInfo | null
  view: ViewType
  isSearchMode: boolean
  query: string
  scope: string
  includeActive: boolean
  includeTrashed: boolean
}

interface UseFileFilteringReturn {
  rows: FileRecord[]
  searchRows: FileRecord[]
  listToRender: FileRecord[]
  statusIncluded: (fi: FileRecord) => boolean
  matchesQuery: (fi: FileRecord) => boolean
}

export function useFileFiltering(props: UseFileFilteringProps): UseFileFilteringReturn {
  const { files, currentDrive, view, isSearchMode, query, scope, includeActive, includeTrashed } = props

  const q = query.trim().toLowerCase().normalize('NFC')

  const statusIncluded = useCallback(
    (fi: FileRecord): boolean => {
      const trashed = isTrashed(fi)

      if (trashed && !includeTrashed) return false

      if (!trashed && !includeActive) return false

      return true
    },
    [includeActive, includeTrashed],
  )

  const matchesQuery = useCallback(
    (fi: FileRecord): boolean => {
      if (!q) return true
      const name = fi.path.toLowerCase().normalize('NFC')
      const mime = (fi.customMetadata?.mime || '').toLowerCase().normalize('NFC')
      const topic = String(fi.topic ?? '')
        .toLowerCase()
        .normalize('NFC')

      return name.includes(q) || mime.includes(q) || topic.includes(q)
    },
    [q],
  )

  const rows = useMemo((): FileRecord[] => {
    if (!currentDrive) return []

    const sameDrive = files.filter(fi => fi.driveId.toString() === currentDrive.id.toString())

    const nameCount = sameDrive.reduce<Record<string, number>>((acc, fi) => {
      acc[fi.path] = (acc[fi.path] || 0) + 1

      return acc
    }, {})

    const keyOf = (fi: FileRecord): string => {
      if (nameCount[fi.path] > 1) return `N:${fi.path}`
      const hist = fi.file.historyRef.toString()

      if (hist) return `H:${hist}`
      const t = fi.topic.toString()

      if (t) return `T:${t}`

      return `N:${fi.path}`
    }

    const map = new Map<string, FileRecord>()
    sameDrive.forEach(fi => {
      const key = keyOf(fi)
      const prev = map.get(key)

      if (!prev) {
        map.set(key, fi)

        return
      }

      const vi = indexStrToBigint(fi.version?.toString())
      const pi = indexStrToBigint(prev.version?.toString())

      if (vi === undefined || pi === undefined) {
        return
      }

      if (vi > pi) {
        map.set(key, fi)

        return
      }

      if (vi === pi && Number(fi.timestamp || 0) > Number(prev.timestamp || 0)) {
        map.set(key, fi)
      }
    })

    const latest = Array.from(map.values())

    return view === ViewType.Trash ? latest.filter(isTrashed) : latest.filter(fi => !isTrashed(fi))
  }, [files, currentDrive, view])

  const searchRows = useMemo((): FileRecord[] => {
    if (!isSearchMode) return []

    const source =
      scope === 'selected' && currentDrive
        ? files.filter(f => f.driveId.toString() === currentDrive.id.toString())
        : files

    const filtered = source.filter(f => statusIncluded(f) && matchesQuery(f))

    const keyOf = (fi: FileRecord): string => {
      const hist = fi.file.historyRef.toString()

      if (hist) return `H:${hist}`
      const t = fi.topic.toString()

      return `T:${t}|N:${fi.path}`
    }

    const latest = new Map<string, FileRecord>()
    for (const fi of filtered) {
      const k = keyOf(fi)
      const prev = latest.get(k)

      if (!prev) {
        latest.set(k, fi)
      } else {
        const a = indexStrToBigint(fi.version?.toString())
        const b = indexStrToBigint(prev.version?.toString())

        if (a === undefined || b === undefined) {
          // TODO: Skip if version parsing fails?
          // TODO: review keyof everywhere
        } else if (a > b || (a === b && Number(fi.timestamp || 0) > Number(prev.timestamp || 0))) {
          latest.set(k, fi)
        }
      }
    }

    return Array.from(latest.values()).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
  }, [isSearchMode, scope, currentDrive, files, matchesQuery, statusIncluded])

  const listToRender = isSearchMode ? searchRows : rows

  return {
    rows,
    searchRows,
    listToRender,
    statusIncluded,
    matchesQuery,
  }
}

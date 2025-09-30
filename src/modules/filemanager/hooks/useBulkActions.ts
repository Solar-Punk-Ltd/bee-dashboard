import { useCallback, useMemo, useRef, useState, useContext } from 'react'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { Context as FMContext } from '../../../providers/FileManager'
import { startDownloadingQueue } from '../utils/download'
import { formatBytes } from '../utils/common'

type IdGetter = (fi: FileInfo) => string

export function useBulkActions(opts: {
  listToRender: FileInfo[]
  idGetter?: IdGetter
  trackDownload: (
    name: string,
    size?: string,
    expectedSize?: number,
  ) => (bytesDownloaded: number, isDownloading: boolean) => void
}) {
  const { listToRender, trackDownload } = opts

  // TODO: refactor idOf
  const idOf: IdGetter = useMemo(
    () =>
      opts.idGetter ??
      ((fi: FileInfo) => fi.file?.historyRef?.toString?.() || fi.topic?.toString?.() || `${fi.driveId}:${fi.name}`),
    [opts.idGetter],
  )

  const { fm, refreshFiles } = useContext(FMContext)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const allIds = useMemo(() => listToRender.map(idOf), [listToRender, idOf])
  const selectedCount = useMemo(() => allIds.filter(id => selectedIds.has(id)).length, [allIds, selectedIds])
  const allChecked = useMemo(() => allIds.length > 0 && selectedCount === allIds.length, [allIds.length, selectedCount])
  const someChecked = useMemo(() => selectedCount > 0 && !allChecked, [selectedCount, allChecked])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedFiles = useMemo(
    () => listToRender.filter(fi => selectedIds.has(idOf(fi))),
    [listToRender, selectedIds, idOf],
  )

  const toggleOne = useCallback(
    (fi: FileInfo, checked: boolean) => {
      const id = idOf(fi)
      setSelectedIds(prev => {
        const next = new Set(prev)

        if (checked) next.add(id)
        else next.delete(id)

        return next
      })
    },
    [idOf],
  )

  const selectAll = useCallback(() => setSelectedIds(new Set(allIds)), [allIds])
  const clearAll = useCallback(() => setSelectedIds(new Set()), [])

  const bulkUploadFromPicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const bulkDownload = useCallback(
    async (list: FileInfo[]) => {
      if (!fm || !list?.length) return
      for (const fi of list) {
        const rawSize = fi.customMetadata?.size as string | number | undefined
        const prettySize = formatBytes(rawSize)
        const expected = rawSize ? Number(rawSize) : undefined
        const tracker = trackDownload(fi.name, prettySize, expected)
        await startDownloadingQueue(fm, [fi], tracker)
      }
    },
    [fm, trackDownload],
  )

  const bulkTrash = useCallback(
    async (list: FileInfo[]) => {
      if (!fm || !list?.length) return
      await Promise.allSettled(list.map(f => fm.trashFile(f)))
      await Promise.resolve(refreshFiles?.())
      clearAll()
    },
    [fm, refreshFiles, clearAll],
  )

  const bulkRestore = useCallback(
    async (list: FileInfo[]) => {
      if (!fm || !list?.length) return
      await Promise.allSettled(list.map(f => fm.recoverFile(f)))
      await Promise.resolve(refreshFiles?.())
      clearAll()
    },
    [fm, refreshFiles, clearAll],
  )

  const bulkForget = useCallback(
    async (list: FileInfo[]) => {
      if (!fm || !list?.length) return
      await Promise.allSettled(list.map(f => fm.forgetFile(f)))
      await Promise.resolve(refreshFiles?.())
      clearAll()
    },
    [fm, refreshFiles, clearAll],
  )

  return useMemo(
    () => ({
      // selection
      selectedIds,
      setSelectedIds,
      selectedFiles,
      selectedCount,
      allChecked,
      someChecked,
      toggleOne,
      selectAll,
      clearAll,
      // file input (for bulk upload)
      fileInputRef,
      bulkUploadFromPicker,
      // actions
      bulkDownload,
      bulkTrash,
      bulkRestore,
      bulkForget,
      // helpers
      idOf,
    }),
    [
      selectedIds,
      selectedFiles,
      selectedCount,
      allChecked,
      someChecked,
      toggleOne,
      selectAll,
      clearAll,
      bulkUploadFromPicker,
      bulkDownload,
      bulkTrash,
      bulkRestore,
      bulkForget,
      idOf,
    ],
  )
}

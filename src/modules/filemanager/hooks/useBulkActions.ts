import { useCallback, useMemo, useRef, useState, useContext } from 'react'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { Context as FMContext } from '../../../providers/FileManager'
import { DownloadProgress, startDownloadingQueue } from '../utils/download'
import { formatBytes, getFileId } from '../utils/common'

interface BulkActionsProps {
  listToRender: FileInfo[]
  trackDownload: (name: string, size?: string, expectedSize?: number) => (dp: DownloadProgress) => void
}

export function useBulkActions(props: BulkActionsProps) {
  const { listToRender, trackDownload } = props

  const { fm, refreshFiles } = useContext(FMContext)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const allIds = useMemo(() => listToRender.map(getFileId), [listToRender])
  const selectedCount = useMemo(() => allIds.filter(id => selectedIds.has(id)).length, [allIds, selectedIds])
  const allChecked = useMemo(() => allIds.length > 0 && selectedCount === allIds.length, [allIds.length, selectedCount])
  const someChecked = useMemo(() => selectedCount > 0 && !allChecked, [selectedCount, allChecked])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedFiles = useMemo(
    () => listToRender.filter(fi => selectedIds.has(getFileId(fi))),
    [listToRender, selectedIds],
  )

  const toggleOne = useCallback((fi: FileInfo, checked: boolean) => {
    const id = getFileId(fi)
    setSelectedIds(prev => {
      const next = new Set(prev)

      if (checked) next.add(id)
      else next.delete(id)

      return next
    })
  }, [])

  const selectAll = useCallback(() => setSelectedIds(new Set(allIds)), [allIds])
  const clearAll = useCallback(() => setSelectedIds(new Set()), [])

  const bulkUploadFromPicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const bulkDownload = useCallback(
    async (list: FileInfo[]) => {
      if (!fm || !list.length) return

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
      if (!fm || !list.length) return

      await Promise.allSettled(list.map(f => fm.trashFile(f)))

      refreshFiles()
      clearAll()
    },
    [fm, refreshFiles, clearAll],
  )

  const bulkRestore = useCallback(
    async (list: FileInfo[]) => {
      if (!fm || !list?.length) return
      await Promise.allSettled(list.map(f => fm.recoverFile(f)))
      await Promise.resolve(refreshFiles())
      clearAll()
    },
    [fm, refreshFiles, clearAll],
  )

  const bulkForget = useCallback(
    async (list: FileInfo[]) => {
      if (!fm || !list.length) return

      await Promise.allSettled(list.map(f => fm.forgetFile(f)))
      await Promise.resolve(refreshFiles())
      clearAll()
    },
    [fm, refreshFiles, clearAll],
  )

  return useMemo(
    () => ({
      selectedIds,
      setSelectedIds,
      selectedFiles,
      selectedCount,
      allChecked,
      someChecked,
      toggleOne,
      selectAll,
      clearAll,
      fileInputRef,
      bulkUploadFromPicker,
      bulkDownload,
      bulkTrash,
      bulkRestore,
      bulkForget,
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
    ],
  )
}

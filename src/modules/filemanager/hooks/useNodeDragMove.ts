import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'

import { Context as FMContext } from '../../../providers/FileManager'
import { Context as SettingsContext } from '../../../providers/Settings'
import { verifyDriveSpace } from '../utils/bee'
import { basename, isUnder, joinPath, parentOf, safeSetState } from '../utils/common'

import { useDriveStamp } from './useDriveStamp'

/**
 * Private drag flavour for rows moved inside the browser. Its presence in `dataTransfer.types` is
 * what separates an internal move from an OS file drop (which `useDragAndDrop` handles as an
 * upload) — the payload itself is unreadable until `drop`, so the type is the only signal `dragover`
 * gets.
 */
export const NODE_DRAG_MIME = 'application/x-fm-node'

interface DragPayload {
  driveId: string
  paths: string[]
}

export type DragProps = React.HTMLAttributes<HTMLElement> & { draggable?: boolean }
export type DropProps = React.HTMLAttributes<HTMLElement>

interface UseNodeDragMoveResult {
  isMoving: boolean
  /** Paths currently being dragged — rows use it to dim themselves. */
  draggedPaths: string[]
  /** Folder path the pointer is currently over and may be dropped on. */
  dropTarget: string | null
  getDragProps: (paths: string[]) => DragProps
  getDropProps: (folderPath: string) => DropProps
}

/**
 * Drag-to-move for file and folder rows.
 *
 * Moves go through `fm.move`, which is intra-drive only — a relocated node keeps its drive's stamp
 * — so the drag payload carries its drive id and a drop from a foreign drive is refused rather than
 * attempted.
 */
export function useNodeDragMove(enabled: boolean, onError?: (msg: string) => void): UseNodeDragMoveResult {
  const { fm, currentDrive, refreshStamp } = useContext(FMContext)
  const { beeApi } = useContext(SettingsContext)
  const driveStamp = useDriveStamp()

  const [isMoving, setIsMoving] = useState(false)
  const [draggedPaths, setDraggedPaths] = useState<string[]>([])
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // `dragover` fires far more often than React re-renders settle, so validity is read off a ref and
  // only the highlight goes through state.
  const draggedRef = useRef<string[]>([])
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const driveId = currentDrive?.id.toString()

  const clearDrag = useCallback(() => {
    draggedRef.current = []
    setDraggedPaths([])
    setDropTarget(null)
  }, [])

  /** The subset of the dragged nodes that a drop on `folderPath` would actually relocate. */
  const movablePaths = useCallback((folderPath: string): string[] => {
    const paths = draggedRef.current

    if (paths.length === 0) return []

    // A folder cannot become its own descendant, and that is a property of the whole drag: allowing
    // the rest through would half-apply a multi-selection.
    if (paths.some(path => isUnder(folderPath, path))) return []

    // Dropping onto the folder something already sits in is a no-op, not an error.
    return paths.filter(path => parentOf(path) !== folderPath)
  }, [])

  const move = useCallback(
    async (paths: string[], folderPath: string): Promise<void> => {
      if (!fm || !currentDrive || !beeApi || !driveStamp) {
        onError?.('File manager is not ready yet — try again in a moment.')

        return
      }

      setIsMoving(true)

      let from = ''
      try {
        const { ok } = await verifyDriveSpace({
          fm,
          bee: beeApi,
          redundancyLevel: currentDrive.redundancyLevel,
          stamp: driveStamp,
          useInfoSize: true,
          driveId: currentDrive.id.toString(),
          fileSize: 0,
          cb: err => onError?.(err || 'Not enough space left on the drive to move these items.'),
        })

        if (!ok) return

        // Sequential on purpose: every move rewrites the drive manifest, so concurrent moves would
        // race on the same feed index.
        for (const path of paths) {
          from = path
          await fm.move(path, joinPath(folderPath, basename(path)), currentDrive.id)
        }

        refreshStamp(driveStamp.batchID.toString())
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        onError?.(`Could not move ${basename(from)}: ${reason}`)
      } finally {
        safeSetState(isMountedRef, setIsMoving)(false)
      }
    },
    [fm, currentDrive, beeApi, driveStamp, refreshStamp, onError],
  )

  const getDragProps = useCallback(
    (paths: string[]): DragProps => {
      if (!enabled || !driveId) return { draggable: false }

      return {
        draggable: true,
        onDragStart: (e: React.DragEvent<HTMLElement>) => {
          const payload: DragPayload = { driveId, paths }

          draggedRef.current = paths

          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData(NODE_DRAG_MIME, JSON.stringify(payload))
          // Firefox refuses to start a drag without a standard flavour set.
          e.dataTransfer.setData('text/plain', paths.join('\n'))

          // Chromium aborts a drag whose `dragstart` handler inserts or removes DOM nodes, and
          // React flushes this state synchronously before the event finishes — which is what the
          // drop-only parent row does inside a folder. Defer the flush past the event; the ref
          // above already carries everything the drag itself needs.
          window.setTimeout(() => {
            if (draggedRef.current === paths) setDraggedPaths(paths)
          }, 0)
        },
        onDragEnd: clearDrag,
      }
    },
    [enabled, driveId, clearDrag],
  )

  const getDropProps = useCallback(
    (folderPath: string): DropProps => {
      if (!enabled || !driveId) return {}

      const accepts = (e: React.DragEvent<HTMLElement>): boolean =>
        Array.from(e.dataTransfer.types).includes(NODE_DRAG_MIME) && movablePaths(folderPath).length > 0

      return {
        onDragEnter: (e: React.DragEvent<HTMLElement>) => {
          if (!accepts(e)) return

          e.preventDefault()
          setDropTarget(folderPath)
        },
        onDragOver: (e: React.DragEvent<HTMLElement>) => {
          if (!accepts(e)) return

          // Without preventDefault the browser treats the row as a non-target and never fires drop.
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          setDropTarget(folderPath)
        },
        onDragLeave: (e: React.DragEvent<HTMLElement>) => {
          // Moving onto a child element still leaves the row: ignore those to stop the highlight
          // flickering.
          const next = e.relatedTarget as Node | null

          if (next && e.currentTarget.contains(next)) return

          setDropTarget(prev => (prev === folderPath ? null : prev))
        },
        onDrop: (e: React.DragEvent<HTMLElement>) => {
          if (!accepts(e)) return

          e.preventDefault()
          e.stopPropagation()

          const paths = movablePaths(folderPath)

          let payload: DragPayload | null = null
          try {
            payload = JSON.parse(e.dataTransfer.getData(NODE_DRAG_MIME)) as DragPayload
          } catch {
            payload = null
          }

          clearDrag()

          if (!payload || payload.driveId !== driveId) {
            onError?.('Items can only be moved within the drive they belong to.')

            return
          }

          void move(paths, folderPath)
        },
      }
    },
    [enabled, driveId, movablePaths, clearDrag, move, onError],
  )

  return { isMoving, draggedPaths, dropTarget, getDragProps, getDropProps }
}

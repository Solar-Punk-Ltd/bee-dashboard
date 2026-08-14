import type { Bee, PostageBatch, RedundancyLevel } from '@ethersphere/bee-js'
import type { DriveInfo, FileManagerBase, FileRecord } from '@solarpunkltd/file-manager-lib'

import { verifyDriveSpace } from './bee'

export enum FileOperation {
  Trash = 'trash',
  Recover = 'recover',
  Forget = 'forget',
}

export type OperableNode = Pick<FileRecord, 'path' | 'driveId'>

interface FileOperationOptions {
  fm: FileManagerBase
  bee: Bee | null
  fi: OperableNode
  redundancyLevel: RedundancyLevel
  driveId: string
  stamp: PostageBatch
  adminStamp?: PostageBatch
  adminRedundancy?: RedundancyLevel
  operation: FileOperation
  onError?: (error: string) => void
  onSuccess?: () => void
}

export async function performFileOperation({
  fm,
  bee,
  fi,
  redundancyLevel,
  driveId,
  stamp,
  adminStamp,
  adminRedundancy,
  operation,
  onError,
  onSuccess,
}: FileOperationOptions): Promise<boolean> {
  try {
    const isForget = operation === FileOperation.Forget
    const verifyStamp = isForget ? adminStamp || stamp : stamp

    const { ok } = await verifyDriveSpace({
      fm,
      bee,
      redundancyLevel,
      stamp: verifyStamp,
      useInfoSize: !isForget,
      adminRedundancy: isForget ? adminRedundancy : undefined,
      driveId,
      fileSize: 0,
      cb: err => {
        onError?.(err || `Could not ${operation} file due to insufficient space: ${fi.path}`)
      },
    })

    if (!ok) return false

    const drive = fm.driveList.find(d => d.id === fi.driveId)

    if (!drive) {
      throw new Error(`Drive for ${fi.path} not found`)
    }

    switch (operation) {
      case FileOperation.Trash:
        await fm.trash(drive.id, fi.path)
        break
      case FileOperation.Recover:
        await fm.recover(drive.id, fi.path)
        break
      case FileOperation.Forget:
        await fm.forget(drive.id, fi.path)
        break
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }

    onSuccess?.()

    return true
  } catch (error) {
    onError?.(error instanceof Error ? error.message : `Failed to ${operation} file: ${fi.path}`)

    return false
  }
}

export async function performBulkFileOperation({
  fm,
  bee,
  files,
  operation,
  stamps,
  adminStamp,
  adminDrive,
  onError,
  onFileComplete,
}: {
  fm: FileManagerBase
  bee: Bee | null
  files: FileRecord[]
  operation: FileOperation
  stamps: PostageBatch[]
  adminStamp?: PostageBatch
  adminDrive?: DriveInfo
  onError?: (error: string) => void
  onFileComplete?: (file: FileRecord, index: number) => void
}): Promise<void> {
  if (!fm || !files?.length) return

  for (let i = 0; i < files.length; i++) {
    const fi = files[i]
    const defaultErrorMsg = `Could not ${operation} file due to insufficient space: ${fi.path}`

    try {
      const currentStamp = stamps.find(s => s.batchID.toString() === fi.batchId.toString())

      if (!currentStamp && operation !== FileOperation.Forget) {
        onError?.(`Stamp not found for file: ${fi.path}`)

        return
      }

      if (!fi.driveId) {
        onError?.(`Missing record drive ID for: ${fi.path}`)

        return
      }

      if (!currentStamp) return

      const success = await performFileOperation({
        fm,
        bee,
        fi,
        redundancyLevel: fi.redundancyLevel || 0,
        driveId: fi.driveId,
        stamp: currentStamp,
        adminStamp,
        operation,
        adminRedundancy: adminDrive?.redundancyLevel,
        onError,
      })

      if (!success) {
        throw new Error(defaultErrorMsg)
      }

      onFileComplete?.(fi, i)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      onError?.(errorMsg || defaultErrorMsg)

      return
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isPickerSupported = (): boolean => typeof (window as any).showSaveFilePicker === 'function'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isDirectoryPickerSupported = (): boolean => typeof (window as any).showDirectoryPicker === 'function'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isElementPickerSupported = (el: any): boolean => typeof (el as HTMLInputElement).showPicker === 'function'

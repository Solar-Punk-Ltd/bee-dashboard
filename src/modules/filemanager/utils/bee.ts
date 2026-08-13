import { BatchId, Bee, BZZ, Duration, PostageBatch, RedundancyLevel, Size } from '@ethersphere/bee-js'
import { DriveInfo, FileManagerBase, FileRecord } from '@solarpunkltd/file-manager-lib'
import React from 'react'

import { getHumanReadableFileSize } from '../../../utils/file'
import { ActionTag } from '../constants/transfers'

export const getUsableStamps = async (bee: Bee): Promise<PostageBatch[]> => {
  try {
    return (await bee.getPostageBatches())
      .filter(s => s.usable)
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
  } catch {
    return []
  }
}

export const validateStampStillExists = async (bee: Bee, batchId: BatchId): Promise<boolean> => {
  try {
    const stamp = await bee.getPostageBatch(batchId.toString())

    return stamp.usable
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to validate stamp ${batchId.toString().slice(0, 8)}...:`, error)

    return false
  }
}

export const fmGetStorageCost = async (
  capacity: number,
  validityEndDate: Date,
  encryption: boolean,
  erasureCodeLevel: RedundancyLevel,
  beeApi: Bee | null,
): Promise<BZZ | undefined> => {
  try {
    if (Size.fromBytes(capacity).toGigabytes() >= 0 && validityEndDate.getTime() >= new Date().getTime()) {
      const cost = await beeApi?.getStorageCost(
        Size.fromBytes(capacity),
        Duration.fromEndDate(validityEndDate),
        undefined,
        encryption,
        erasureCodeLevel,
      )

      return cost
    }

    return undefined
  } catch {
    return undefined
  }
}

export const fmFetchCost = async (
  capacity: number,
  validityEndDate: Date,
  encryption: boolean,
  erasureCodeLevel: RedundancyLevel,
  beeApi: Bee | null,
  setCost: (cost: BZZ) => void,
  currentFetch: React.MutableRefObject<Promise<void> | null>,
  onError?: (error: unknown) => void,
) => {
  if (currentFetch.current) {
    await currentFetch.current
  }

  let isCurrentFetch = true

  const fetchPromise = (async () => {
    try {
      const cost = await fmGetStorageCost(capacity, validityEndDate, encryption, erasureCodeLevel, beeApi)

      if (isCurrentFetch) {
        if (cost) {
          setCost(cost)
        } else {
          setCost(BZZ.fromDecimalString('0'))
          onError?.(new Error('Storage cost unavailable - node may be syncing'))
        }
      }
    } catch (error) {
      if (isCurrentFetch) {
        setCost(BZZ.fromDecimalString('0'))
        onError?.(error)
      }
    }
  })()

  currentFetch.current = fetchPromise
  await fetchPromise

  isCurrentFetch = false
  currentFetch.current = null
}

export interface CreateDriveOptions {
  beeApi: Bee | null
  fm: FileManagerBase | null
  size: Size
  duration: Duration
  label: string
  encryption: boolean
  redundancyLevel: RedundancyLevel
  adminRedundancy: RedundancyLevel
  isAdmin: boolean
  resetState: boolean
  existingBatch: PostageBatch | null
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

export const handleCreateDrive = async (options: CreateDriveOptions): Promise<void> => {
  const {
    beeApi,
    fm,
    size,
    duration,
    label,
    encryption,
    redundancyLevel,
    adminRedundancy,
    isAdmin,
    resetState,
    existingBatch,
    onSuccess,
    onError,
  } = { ...options }

  if (!beeApi || !fm) {
    // eslint-disable-next-line no-console
    console.error('Error creating drive: Bee API or FM is invalid!')

    onError?.('Error creating drive: Bee API or FM is invalid!')

    return
  }

  try {
    let batchId: BatchId

    if (!existingBatch) {
      const stamps = await getUsableStamps(beeApi)
      const adminStamp = stamps.find(s => s.batchID.toString() === fm.adminStamp?.batchId)

      if (!adminStamp) {
        onError?.('Drive stamp not found')

        return
      }

      if (!isAdmin) {
        if (!fm.adminStamp) {
          // eslint-disable-next-line no-console
          console.error('Error creating drive: admin stamp is not available')

          throw new Error('Error creating drive: admin stamp is not available')
        }

        await verifyDriveSpace({
          fm,
          bee: beeApi,
          redundancyLevel,
          stamp: adminStamp,
          adminRedundancy,
          cb: err => {
            throw new Error(err)
          },
        })
      }

      batchId = await beeApi.buyStorage(size, duration, { label }, undefined, encryption, redundancyLevel)
    } else {
      const isValid = await validateStampStillExists(beeApi, existingBatch.batchID)

      if (!isValid) {
        throw new Error(
          'The stamp is no longer valid or has been deleted. Please select a different stamp from the list.',
        )
      }

      await verifyDriveSpace({
        fm,
        redundancyLevel,
        stamp: existingBatch,
        adminRedundancy,
        bee: beeApi,
        cb: err => {
          throw new Error(err)
        },
      })

      batchId = existingBatch.batchID
    }

    if (isAdmin) {
      await fm.createAdminDrive(batchId, redundancyLevel, resetState)
    } else {
      await fm.createDrive(batchId, label, redundancyLevel)
    }

    onSuccess?.()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error creating drive:', e instanceof Error ? e.message : String(e))
    onError?.(e)
  }
}

export interface DestroyDriveOptions {
  beeApi?: Bee | null
  fm: FileManagerBase | null
  drive: DriveInfo
  adminDrive: DriveInfo | null
  isDestroy: boolean
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

export const handleDestroyAndForgetDrive = async (options: DestroyDriveOptions): Promise<void> => {
  const { beeApi, fm, adminDrive, drive, isDestroy, onSuccess, onError } = { ...options }

  if (!beeApi) {
    onError?.('Bee API is invalid!')

    return
  }

  if (!fm || !fm.adminStamp || !adminDrive) {
    onError?.('FM is invalid!')

    return
  }

  try {
    const stamps = await getUsableStamps(beeApi)
    const adminStamp = stamps.find(s => s.batchID.toString() === fm.adminStamp?.batchId)

    if (!adminStamp) {
      throw new Error('Drive stamp not found')
    }

    await verifyDriveSpace({
      fm,
      bee: beeApi,
      driveId: drive.id.toString(),
      redundancyLevel: drive.redundancyLevel,
      stamp: adminStamp,
      isRemove: true,
      adminRedundancy: adminDrive.redundancyLevel,
      cb: err => {
        throw new Error(err)
      },
    })

    if (!isDestroy) {
      await fm.forgetDrive(drive.id)
      onSuccess?.()

      return
    }

    const driveStamp = stamps.find(s => s.batchID.toString() === drive.batchId.toString())

    const ttlDays = driveStamp?.duration.toDays() ?? 0

    if (!driveStamp || ttlDays <= 2) {
      // eslint-disable-next-line no-console
      console.warn(`Stamp not found or TTL ${ttlDays} <= 2 days, skipping drive destruction: forgetting the drive.`)
      await fm.forgetDrive(drive.id)
      onSuccess?.()

      return
    }

    // fm does not dilute the stamp it's the client's responsibility
    const halvings = Math.floor(Math.log2(ttlDays))
    await beeApi.diluteBatch(drive.batchId, driveStamp.depth + halvings)

    onSuccess?.()
  } catch (e) {
    onError?.(e)
  }
}

export interface StampCapacityMetrics {
  capacityPct: number
  usedSize: string
  stampSize: string
  usedBytes: number
  stampSizeBytes: number
  remainingBytes: number
}

export const calculateStampCapacityMetrics = (
  stamp: PostageBatch,
  files: FileRecord[],
  redundancyLevel?: RedundancyLevel,
  useReportedOnly?: boolean,
): StampCapacityMetrics => {
  let stampSizeBytes = 0
  let remainingReportedBytes = 0

  if (redundancyLevel !== undefined) {
    stampSizeBytes = stamp.calculateSize(false, redundancyLevel).toBytes()
    remainingReportedBytes = stamp.calculateRemainingSize(false, redundancyLevel).toBytes()
  } else {
    stampSizeBytes = stamp.size.toBytes()
    remainingReportedBytes = stamp.remainingSize.toBytes()
  }

  const usedBytesReported = stampSizeBytes - remainingReportedBytes
  const pctReportedStampUsage = stamp.usage * 100

  let usedSizeMaxBytes = usedBytesReported
  let pctFromDriveUsage = pctReportedStampUsage
  let remainingBytes = remainingReportedBytes

  if (!useReportedOnly) {
    const usedBytesFromFiles = files
      .map(f => {
        let rawSize = 0

        const lifecycle = (f.customMetadata?.lifecycle || '').toString().toLowerCase()
        const isLifecycleOperation =
          lifecycle === ActionTag.Trashed || lifecycle === ActionTag.Recovered || lifecycle === ActionTag.Restored

        if (
          (f.customMetadata?.size && !isLifecycleOperation) ||
          (f.customMetadata?.size && !f.customMetadata?.accumulatedSize)
        ) {
          rawSize = Number(f.customMetadata.size)
        }
        const accumulatedSize = Number(f.customMetadata?.accumulatedSize || rawSize || 0)

        return accumulatedSize
      })
      .reduce((acc, current) => acc + current, 0)

    const remainingBytesFromFiles = stampSizeBytes - usedBytesFromFiles > 0 ? stampSizeBytes - usedBytesFromFiles : 0
    remainingBytes = Math.min(remainingReportedBytes, remainingBytesFromFiles)

    usedSizeMaxBytes = Math.max(usedBytesFromFiles, usedBytesReported)
    pctFromDriveUsage = stampSizeBytes > 0 ? (usedSizeMaxBytes / stampSizeBytes) * 100 : 0
  }

  const usedSizeMax = getHumanReadableFileSize(usedSizeMaxBytes)
  const capacityPct = Math.max(pctFromDriveUsage, pctReportedStampUsage)
  const stampSize = getHumanReadableFileSize(stampSizeBytes)

  return {
    capacityPct,
    usedSize: usedSizeMax,
    stampSize,
    usedBytes: usedSizeMaxBytes,
    stampSizeBytes,
    remainingBytes,
  }
}

export interface DriveSpaceOptions {
  fm: FileManagerBase
  bee: Bee | null
  driveId?: string
  redundancyLevel: RedundancyLevel
  stamp: PostageBatch
  adminRedundancy?: RedundancyLevel
  useInfoSize?: boolean
  isRemove?: boolean
  fileSize?: number
  fileCount?: number
  cb?: (msg: string) => void
}

export const verifyDriveSpace = async (
  options: DriveSpaceOptions,
): Promise<{ remainingBytes: number; totalSizeBytes: number; ok: boolean }> => {
  const { fm, bee, driveId, redundancyLevel, stamp, adminRedundancy, useInfoSize, isRemove, fileSize, fileCount, cb } =
    {
      ...options,
    }

  if (!bee) {
    // eslint-disable-next-line no-console
    console.warn('Bee api is null')

    return { remainingBytes: 0, totalSizeBytes: 0, ok: false }
  }

  const stamps = await getUsableStamps(bee)
  const adminStamp = stamps.find(s => s.batchID.toString() === fm.adminStamp?.batchId)

  if (!adminStamp) {
    // eslint-disable-next-line no-console
    console.warn('Fm Admin stamp is null')

    return { remainingBytes: 0, totalSizeBytes: 0, ok: false }
  }

  const drives = [...fm.driveList]
  let filesPerDrives: FileRecord[] = []

  // new drivelist state size calc.
  if (isRemove) {
    const driveIx = drives.findIndex(d => d.id.toString() === driveId?.toString())

    if (driveIx === -1) {
      cb?.(`Admin drive not found during stamp verification`)

      return { remainingBytes: 0, totalSizeBytes: 0, ok: false }
    }

    drives.splice(driveIx, 1)
    filesPerDrives = fm.recordList.filter(fi => fi.driveId !== driveId)
  } else {
    filesPerDrives = driveId ? fm.recordList.filter(fi => fi.driveId === driveId) : []
  }

  // admin stamp capacity calcl., needed for forget, destroy, create
  if (adminRedundancy !== undefined && adminStamp) {
    // upper limit estimate on the drivelist metadata state size based on the number of drives and files
    const estimatedDlSizeBytes = stamp.usage
    const { remainingBytes: remainingAdminBytes } = calculateStampCapacityMetrics(adminStamp, [], adminRedundancy)

    const ok = remainingAdminBytes >= estimatedDlSizeBytes

    if (!ok) {
      cb?.(
        `Insufficient admin drive capacity. Required: ~${getHumanReadableFileSize(
          estimatedDlSizeBytes,
        )} bytes, Available: ${getHumanReadableFileSize(
          remainingAdminBytes,
        )} bytes. Please top up the admin drive/stamp.`,
      )

      return { remainingBytes: remainingAdminBytes, totalSizeBytes: estimatedDlSizeBytes, ok }
    }
  }

  // other fileinfo metadata size calc.
  const estimatedFiSize = 150 // TODO: is this even needed?
  const count = fileCount ?? 1
  const estimateReqSizeBytes = Number(Boolean(useInfoSize)) * estimatedFiSize * count + (fileSize ? fileSize : 0)
  const { remainingBytes } = calculateStampCapacityMetrics(stamp, filesPerDrives, redundancyLevel)

  const ok = remainingBytes >= estimateReqSizeBytes

  if (!ok) {
    cb?.(
      `Insufficient capacity. Required: ~${getHumanReadableFileSize(
        estimateReqSizeBytes,
      )} bytes, Available: ${getHumanReadableFileSize(remainingBytes)} bytes. Please top up the drive/stamp.`,
    )
  }

  return { remainingBytes, totalSizeBytes: estimateReqSizeBytes, ok }
}

import { BatchId, Bee, BZZ, Duration, PostageBatch, RedundancyLevel, Size } from '@ethersphere/bee-js'
import { FileManagerBase, DriveInfo, FileInfo, estimateDriveListMetadataSize } from '@solarpunkltd/file-manager-lib'
import { getHumanReadableFileSize } from '../../../utils/file'
import { indexStrToBigint } from './common'

export const getUsableStamps = async (bee: Bee | null): Promise<PostageBatch[]> => {
  if (!bee) {
    return []
  }

  try {
    return (await bee.getPostageBatches())
      .filter(s => s.usable)
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
  } catch {
    return []
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
  } catch (e) {
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
  erasureCodeLevel: RedundancyLevel
  isAdmin: boolean
  resetState: boolean
  existingBatch: PostageBatch | null
  drives?: DriveInfo[]
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
    erasureCodeLevel,
    isAdmin,
    resetState,
    existingBatch,
    drives,
    onSuccess,
    onError,
  } = { ...options }

  if (!beeApi || !fm) {
    onError?.('Error creating drive: Bee API or FM is invalid!')

    return
  }

  try {
    let batchId: BatchId

    if (!existingBatch) {
      batchId = await beeApi.buyStorage(size, duration, { label }, undefined, encryption, erasureCodeLevel)
    } else {
      batchId = existingBatch.batchID

      const estimatedDlSize = estimateDriveListMetadataSize(drives || [])
      const remainingBytes = existingBatch.remainingSize.toBytes()

      if (remainingBytes < estimatedDlSize) {
        onError?.(
          `Insufficient admin drive capacity. Required: ~${estimatedDlSize} bytes, Available: ${remainingBytes} bytes`,
        )

        return
      }
    }

    await fm.createDrive(batchId, label, isAdmin, erasureCodeLevel, resetState)

    onSuccess?.()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error creating drive:', e instanceof Error ? e.message : String(e))
    onError?.(e)
  }
}

interface StampCapacityMetrics {
  capacityPct: number
  usedSize: string
  totalSize: string
  usedBytes: number
  totalBytes: number
  remainingBytes: number
}

export const calculateStampCapacityMetrics = (
  stamp: PostageBatch | null,
  drive?: DriveInfo | null,
  files?: FileInfo[],
): StampCapacityMetrics => {
  if (!stamp) {
    return {
      capacityPct: 0,
      usedSize: '—',
      totalSize: '—',
      usedBytes: 0,
      totalBytes: 0,
      remainingBytes: 0,
    }
  }

  let usedBytes = 0
  let totalBytes = 0
  let capacityPct = 0
  let remainingBytes = 0

  if (drive) {
    totalBytes = stamp.calculateSize(false, drive.redundancyLevel).toBytes()

    const swarmRemainingBytes = stamp.calculateRemainingSize(false, drive.redundancyLevel).toBytes()
    const swarmUsedBytes = totalBytes - swarmRemainingBytes
    const swarmUtilizationPct = (swarmUsedBytes / totalBytes) * 100

    if (files) {
      const solarPunkUsedBytes = files
        ?.filter(file => file.driveId === drive?.id)
        .map(file => {
          const fileSize = Number(file.customMetadata?.size || 0)
          const versionCount = Number((indexStrToBigint(file.version) ?? BigInt(0)) + BigInt(1))

          return fileSize * versionCount
        })
        .reduce((acc, current) => acc + current, 0)

      if (swarmUtilizationPct < 50) {
        usedBytes = solarPunkUsedBytes
        remainingBytes = totalBytes - usedBytes
      } else {
        usedBytes = Math.max(swarmUsedBytes, solarPunkUsedBytes)
        remainingBytes = totalBytes - usedBytes
      }
    } else {
      remainingBytes = swarmRemainingBytes
      usedBytes = swarmUsedBytes
    }
    capacityPct = ((totalBytes - remainingBytes) / totalBytes) * 100
  } else {
    capacityPct = stamp.usage * 100
    usedBytes = stamp.size.toBytes() - stamp.remainingSize.toBytes()
    totalBytes = stamp.size.toBytes()
    remainingBytes = totalBytes - usedBytes
  }

  const usedSize = getHumanReadableFileSize(usedBytes)
  const totalSize = getHumanReadableFileSize(totalBytes)

  return {
    capacityPct,
    usedSize,
    totalSize,
    usedBytes,
    totalBytes,
    remainingBytes,
  }
}

export interface DestroyDriveOptions {
  beeApi?: Bee | null
  fm: FileManagerBase | null
  drive: DriveInfo
  drives: DriveInfo[]
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

export const handleDestroyDrive = async (options: DestroyDriveOptions): Promise<void> => {
  const { beeApi, drives, fm, drive, onSuccess, onError } = { ...options }

  if (!beeApi || !fm || !fm.adminStamp) {
    onError?.('Error destroying drive: Bee API or FM is invalid!')

    return
  }

  try {
    const stamp = (await getUsableStamps(beeApi)).find(s => s.batchID.toString() === drive.batchId.toString())

    if (!stamp) {
      throw new Error(`Postage stamp (${drive.batchId}) for the current drive (${drive.name}) not found`)
    }

    const estimatedDlSize = estimateDriveListMetadataSize(drives)
    const remainingBytes = fm.adminStamp.remainingSize.toBytes()

    if (remainingBytes < estimatedDlSize) {
      onError?.(
        `Insufficient admin drive capacity. Required: ~${estimatedDlSize} bytes, Available: ${remainingBytes} bytes. Please top up the admin drive.`,
      )

      return
    }

    const ttlDays = stamp.duration.toDays()

    if (ttlDays <= 2) {
      // eslint-disable-next-line no-console
      console.warn(`Stamp TTL ${ttlDays} <= 2 days, skipping drive destruction: forgetting the drive.`)
      await fm.forgetDrive(drive)

      return
    }

    await fm.destroyDrive(drive, stamp)

    onSuccess?.()
  } catch (e) {
    onError?.(e)
  }
}

export const handleForgetDrive = async (options: DestroyDriveOptions): Promise<void> => {
  const { fm, drive, onSuccess, onError } = { ...options }

  if (!fm) return

  try {
    await fm.forgetDrive(drive)
    onSuccess?.()
  } catch (e) {
    onError?.(e)
  }
}

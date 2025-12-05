import { BatchId, Bee, BZZ, Duration, PostageBatch, RedundancyLevel, Size } from '@ethersphere/bee-js'
import { FileManagerBase, DriveInfo, estimateDriveListMetadataSize } from '@solarpunkltd/file-manager-lib'
import { getHumanReadableFileSize } from '../../../utils/file'

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

      const drivesLen = fm.getDrives().length
      const estimatedDlSize = estimateDriveListMetadataSize(drivesLen, 0)
      const { remainingBytes } = calculateStampCapacityMetrics(existingBatch, erasureCodeLevel)

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
  redundancyLevel?: RedundancyLevel,
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

  let totalBytes = 0
  let remainingBytes = 0

  if (redundancyLevel !== undefined) {
    totalBytes = stamp.calculateSize(false, redundancyLevel).toBytes()
    remainingBytes = stamp.calculateRemainingSize(false, redundancyLevel).toBytes()
  } else {
    totalBytes = stamp.size.toBytes()
    remainingBytes = stamp.remainingSize.toBytes()
  }

  const usedBytes = totalBytes - remainingBytes
  const pctFromStampUsage = stamp.usage * 100
  const pctFromDriveUsage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0
  const capacityPct = Math.max(pctFromDriveUsage, pctFromStampUsage)
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
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

export const handleDestroyDrive = async (options: DestroyDriveOptions): Promise<void> => {
  const { beeApi, fm, drive, onSuccess, onError } = { ...options }

  if (!beeApi || !fm || !fm.adminStamp) {
    onError?.('Error destroying drive: Bee API or FM is invalid!')

    return
  }

  try {
    const stamp = (await getUsableStamps(beeApi)).find(s => s.batchID.toString() === drive.batchId.toString())

    if (!stamp) {
      throw new Error(`Postage stamp (${drive.batchId}) for the current drive (${drive.name}) not found`)
    }

    const drivesLen = fm.getDrives().length
    const filesPerDriveLen = fm.fileInfoList.filter(fi => fi.driveId !== drive.id).length
    const estimatedDlSize = estimateDriveListMetadataSize(drivesLen - 1, filesPerDriveLen)
    const { remainingBytes } = calculateStampCapacityMetrics(stamp, drive.redundancyLevel)

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
// TODO: reuse verification code
export const handleForgetDrive = async (options: DestroyDriveOptions): Promise<void> => {
  const { beeApi, fm, drive, onSuccess, onError } = { ...options }

  if (!beeApi || !fm || !fm.adminStamp) {
    onError?.('Error destroying drive: Bee API or FM is invalid!')

    return
  }

  try {
    const stamp = (await getUsableStamps(beeApi)).find(s => s.batchID.toString() === drive.batchId.toString())

    if (!stamp) {
      throw new Error(`Postage stamp (${drive.batchId}) for the current drive (${drive.name}) not found`)
    }

    const drivesLen = fm.getDrives().length
    const filesPerDriveLen = fm.fileInfoList.filter(fi => fi.driveId !== drive.id).length
    const estimatedDlSize = estimateDriveListMetadataSize(drivesLen - 1, filesPerDriveLen)
    const { remainingBytes } = calculateStampCapacityMetrics(stamp, drive.redundancyLevel)

    if (remainingBytes < estimatedDlSize) {
      onError?.(
        `Insufficient admin drive capacity. Required: ~${estimatedDlSize} bytes, Available: ${remainingBytes} bytes. Please top up the admin drive.`,
      )

      return
    }

    if (!stamp) {
      throw new Error(`Postage stamp (${drive.batchId}) for the current drive (${drive.name}) not found`)
    }

    await fm.forgetDrive(drive)
    onSuccess?.()
  } catch (e) {
    onError?.(e)
  }
}

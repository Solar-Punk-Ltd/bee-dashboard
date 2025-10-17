import { BatchId, Bee, Duration, PostageBatch, RedundancyLevel, Size } from '@ethersphere/bee-js'
import { FileManagerBase, DriveInfo } from '@solarpunkltd/file-manager-lib'
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
): Promise<string | undefined> => {
  try {
    if (Size.fromBytes(capacity).toGigabytes() >= 0 && validityEndDate.getTime() >= new Date().getTime()) {
      const cost = await beeApi?.getStorageCost(
        Size.fromBytes(capacity),
        Duration.fromEndDate(validityEndDate),
        undefined,
        encryption,
        erasureCodeLevel,
      )

      return cost ? cost.toSignificantDigits(2) : undefined
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
  setCost: (cost: string) => void,
  currentFetch: React.MutableRefObject<Promise<void> | null>,
) => {
  if (currentFetch.current) {
    await currentFetch.current
  }

  let isCurrentFetch = true

  const fetchPromise = (async () => {
    const cost = await fmGetStorageCost(capacity, validityEndDate, encryption, erasureCodeLevel, beeApi)

    if (isCurrentFetch) {
      setCost(cost ?? '0')
    }
  })()

  currentFetch.current = fetchPromise
  await fetchPromise

  isCurrentFetch = false
  currentFetch.current = null
}

export const handleCreateDrive = async (
  beeApi: Bee | null,
  fm: FileManagerBase | null,
  size: Size,
  duration: Duration,
  label: string,
  encryption: boolean,
  erasureCodeLevel: RedundancyLevel,
  isAdmin: boolean,
  existingBatch: PostageBatch | null,
  setLoading?: (loading: boolean) => void,
  onSuccess?: (batch?: PostageBatch) => void,
  onError?: (error: unknown) => void,
): Promise<void> => {
  if (!beeApi || !fm) return

  try {
    setLoading?.(true)

    let batchId: BatchId
    let batch: PostageBatch

    if (!existingBatch) {
      batchId = await beeApi.buyStorage(size, duration, { label }, undefined, encryption, erasureCodeLevel)

      batch = await beeApi.getPostageBatch(batchId)
    } else {
      batchId = existingBatch.batchID
      batch = existingBatch
    }

    await fm.createDrive(batchId, label, isAdmin, erasureCodeLevel)

    onSuccess?.(batch)
  } catch (e) {
    onError?.(e)
  } finally {
    setLoading?.(false)
  }
}

export const calculateStampCapacityMetrics = (stamp: PostageBatch | null, drive?: DriveInfo | null) => {
  if (!stamp) {
    return {
      capacityPct: 0,
      usedSize: '—',
      totalSize: '—',
      usedBytes: 0,
      totalBytes: 0,
    }
  }

  let usedBytes = 0
  let totalBytes = 0
  let capacityPct = 0

  if (drive) {
    totalBytes = stamp.calculateSize(false, drive.redundancyLevel).toBytes()
    const remainingBytes = stamp.calculateRemainingSize(false, drive.redundancyLevel).toBytes()
    usedBytes = totalBytes - remainingBytes
    capacityPct = ((totalBytes - remainingBytes) / totalBytes) * 100
  } else {
    capacityPct = stamp.usage * 100
    usedBytes = stamp.size.toBytes() - stamp.remainingSize.toBytes()
    totalBytes = stamp.size.toBytes()
  }
  const usedSize = getHumanReadableFileSize(usedBytes)
  const totalSize = getHumanReadableFileSize(totalBytes)

  return {
    capacityPct,
    usedSize,
    totalSize,
    usedBytes,
    totalBytes,
  }
}

export const handleDestroyDrive = async (
  beeApi: Bee | null,
  fm: FileManagerBase | null,
  drive: DriveInfo,
  onSuccess?: () => void,
  onError?: (error: unknown) => void,
): Promise<void> => {
  if (!beeApi || !fm) {
    return
  }

  try {
    const stamp = (await getUsableStamps(beeApi)).find(s => s.batchID.toString() === drive.batchId.toString())

    if (!stamp) {
      throw new Error('Postage stamp for the current drive not found')
    }

    await fm.destroyDrive(drive, stamp)

    onSuccess?.()
  } catch (e) {
    onError?.(e)
  }
}

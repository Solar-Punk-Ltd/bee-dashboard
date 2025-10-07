import { BatchId, Bee, Duration, PostageBatch, RedundancyLevel, Size } from '@ethersphere/bee-js'
import { FileManagerBase, DriveInfo } from '@solarpunkltd/file-manager-lib'
import { ByteMetric } from './common'

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

// TODO: overall signal handling and try-catch seems to complicated
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
  signal?: AbortSignal,
): Promise<void> => {
  if (!beeApi || !fm) return

  const safe = (fn: () => void) => {
    if (!signal?.aborted) fn()
  }

  try {
    safe(() => setLoading?.(true))

    if (signal?.aborted) return

    let batchId: BatchId
    let batch: PostageBatch

    if (!existingBatch) {
      batchId = await beeApi.buyStorage(size, duration, { label }, undefined, encryption, erasureCodeLevel)

      if (signal?.aborted) return

      batch = await beeApi.getPostageBatch(batchId)
    } else {
      batchId = existingBatch.batchID
      batch = existingBatch
    }

    if (signal?.aborted) return

    await fm.createDrive(batchId, label, isAdmin, erasureCodeLevel)

    if (signal?.aborted) return

    safe(() => onSuccess?.(batch))
  } catch (e) {
    if (!signal?.aborted) {
      safe(() => onError?.(e))
    }
  } finally {
    safe(() => setLoading?.(false))
  }
}

export const calculateStampCapacityMetrics = (stamp: PostageBatch | null, digits = 2) => {
  if (!stamp) {
    return {
      capacityPct: 0,
      usedSize: '—',
      totalSize: '—',
    }
  }

  const capacityPct = stamp.usage * 100

  const usedByes = stamp.size.toGigabytes() - stamp.remainingSize.toGigabytes()
  const totalBytes = stamp.size.toGigabytes()

  const usedSize =
    usedByes <= 1 ? `${(usedByes * 1000).toFixed(digits)} ${ByteMetric.MB}` : `${usedByes.toFixed(2)} ${ByteMetric.GB}`
  const totalSize =
    totalBytes <= 1
      ? `${(totalBytes * 1000).toFixed(digits)} ${ByteMetric.MB}`
      : `${totalBytes.toFixed(2)} ${ByteMetric.GB}`

  return {
    capacityPct,
    usedSize,
    totalSize,
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

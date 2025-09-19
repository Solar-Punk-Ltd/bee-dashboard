import { Bee, Duration, PostageBatch, RedundancyLevel, Size } from '@ethersphere/bee-js'
import { FileManagerBase } from '@solarpunkltd/file-manager-lib'

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
): Promise<string> => {
  try {
    if (Size.fromBytes(capacity).toGigabytes() >= 0 && validityEndDate.getTime() >= new Date().getTime()) {
      const cost = await beeApi?.getStorageCost(
        Size.fromBytes(capacity),
        Duration.fromEndDate(validityEndDate),
        undefined,
        encryption,
        erasureCodeLevel,
      )

      return cost ? cost.toSignificantDigits(2) : '0'
    }

    return '0'
  } catch (e) {
    //TODO It needs to be discussed what happens to the error
    return '0'
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
    try {
      const cost = await fmGetStorageCost(capacity, validityEndDate, encryption, erasureCodeLevel, beeApi)

      if (isCurrentFetch) {
        setCost(cost)
      }
    } catch (error) {
      if (isCurrentFetch) {
        setCost('0')
      }
      // eslint-disable-next-line no-console
      console.error('Failed to fetch storage cost:', error)
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
  setLoading: (loading: boolean) => void,
  onSuccess?: () => void,
  onError?: (error: unknown) => void,
): Promise<void> => {
  if (!beeApi || !fm) return

  try {
    setLoading(true)
    const batchId = await beeApi.buyStorage(size, duration, { label }, undefined, encryption, erasureCodeLevel)
    await fm.createDrive(batchId, label, isAdmin, erasureCodeLevel)
    onSuccess?.()
  } catch (e) {
    onError?.(e)
    // eslint-disable-next-line no-console
    console.error('Failed to create drive:', e)
  } finally {
    setLoading(false)
  }
}

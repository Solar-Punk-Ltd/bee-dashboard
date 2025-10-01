import { FeedIndex, RedundancyLevel } from '@ethersphere/bee-js'

export const FEED_INDEX_ZERO = FeedIndex.fromBigInt(BigInt(0))

export const erasureCodeMarks = Object.entries(RedundancyLevel)
  .filter(([_, value]) => typeof value === 'number')
  .map(([key, value]) => ({
    value: value as number,
    label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase(),
  }))

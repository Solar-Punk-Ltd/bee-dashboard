import { FeedIndex, RedundancyLevel } from '@ethersphere/bee-js'

export const FEED_INDEX_ZERO = FeedIndex.fromBigInt(BigInt(0))

export const erasureCodeMarks = Object.entries(RedundancyLevel)
  .filter(([_, value]) => typeof value === 'number')
  .map(([key, value]) => ({
    value: value as number,
    label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase(),
  }))

export const SELECT_VALUE_LABEL = 'Select a value'

export const desiredLifetimeOptions = [
  { value: 0, label: SELECT_VALUE_LABEL },
  { value: 1, label: '1 week' },
  { value: 2, label: '1 month' },
  { value: 3, label: '3 months' },
  { value: 4, label: '6 months' },
  { value: 5, label: '1 year' },
]

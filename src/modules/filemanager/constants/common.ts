import { FeedIndex, RedundancyLevel } from '@ethersphere/bee-js'
import { capitalizeFirstLetter } from '../utils/common'

export const FEED_INDEX_ZERO = FeedIndex.fromBigInt(BigInt(0))

export const erasureCodeMarks = Object.entries(RedundancyLevel)
  .filter(([_, value]) => typeof value === 'number')
  .map(([key, value]) => ({
    value: value as number,
    label: capitalizeFirstLetter(key),
  }))

export const ADMIN_DRIVE_FULL_MESSAGE =
  'Admin drive capacity is full. Please top up the admin drive to create new drives.'
export const ADMIN_DRIVE_FULL_TOOLTIP = 'Admin drive is full. Top up the admin drive to create new drives.'

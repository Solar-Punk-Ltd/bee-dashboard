import { Bee, PostageBatch } from '@ethersphere/bee-js'

import { MouseEvent } from 'react'
import { desiredLifetimeOptions } from '../constants/constants'
export function preventDefault(event: MouseEvent) {
  event.preventDefault()
}

export function getDaysLeft(expiryDate: string): number {
  const now = new Date()
  const expiry = new Date(expiryDate)
  const diffMs = expiry.getTime() - now.getTime()

  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

export const getUsableStamps = async (bee: Bee | null): Promise<PostageBatch[]> => {
  if (!bee) {
    return []
  }

  try {
    return (await bee.getPostageBatches())
      .filter(s => s.usable)
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error getting usable stamps: ', error)

    return []
  }
}

export const fromBytesConversion = (size: number, metric: string) => {
  switch (metric) {
    case 'GB':
      return size / 1000 / 1000 / 1000
    case 'MB':
      return size / 1000 / 1000
    default:
      return 0
  }
}

export function getExpiryDateByLifetime(lifetimeValue: number): Date {
  const now = new Date()
  const selected = desiredLifetimeOptions.find(opt => opt.value === lifetimeValue)
  // eslint-disable-next-line no-console
  console.log('getExpiryDateByLifetime called with:', lifetimeValue)
  // eslint-disable-next-line no-console
  console.log('Selected lifetime option:', selected)

  if (!selected) return now

  switch (selected.label) {
    case '1 week':
      now.setDate(now.getDate() + 7)
      break
    case '1 month':
      now.setMonth(now.getMonth() + 1)
      break
    case '3 months':
      now.setMonth(now.getMonth() + 3)
      break
    case '6 months':
      now.setMonth(now.getMonth() + 6)
      break
    case '1 year':
      now.setFullYear(now.getFullYear() + 1)
      break
    default:
      break
  }

  // eslint-disable-next-line no-console
  console.log('Calculated expiry date:', now)

  return now
}

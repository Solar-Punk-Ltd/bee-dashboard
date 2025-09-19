import { MouseEvent } from 'react'

import { FileInfo, FileStatus } from '@solarpunkltd/file-manager-lib'
export function preventDefault(event: MouseEvent) {
  event.preventDefault()
}

export function getDaysLeft(expiryDate: Date): number {
  const now = new Date()

  const diffMs = expiryDate.getTime() - now.getTime()

  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
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

const lifetimeAdjustments = new Map<number, (date: Date) => void>([
  //TODO It needs to be discussed the minimum value for value upgrade
  [0, date => date.setMinutes(date.getMinutes() + 1)],
  [1, date => date.setDate(date.getDate() + 7)],
  [2, date => date.setMonth(date.getMonth() + 1)],
  [3, date => date.setMonth(date.getMonth() + 3)],
  [4, date => date.setMonth(date.getMonth() + 6)],
  [5, date => date.setFullYear(date.getFullYear() + 1)],
])

export function getExpiryDateByLifetime(lifetimeValue: number, actualValidity?: Date): Date {
  const now = actualValidity || new Date()

  const adjustDate = lifetimeAdjustments.get(lifetimeValue)

  if (adjustDate) {
    adjustDate(now)
  }

  return now
}

export const indexStrToBigint = (indexStr?: string): bigint | undefined => {
  if (!indexStr) {
    return undefined
  }

  const isHex = /[a-fA-F]/.test(indexStr) || indexStr.startsWith('0') || indexStr.length > 10

  if (isHex) {
    return BigInt(parseInt(indexStr, 16))
  }

  return BigInt(parseInt(indexStr, 10))
}

export const formatBytes = (v?: string | number): string | undefined => {
  let n: number

  if (typeof v === 'string') n = Number(v)
  else if (typeof v === 'number') n = v
  else n = NaN

  if (!Number.isFinite(n) || n < 0) return undefined

  if (n < 1024) return `${n} B`

  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let val = n / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }

  return `${val.toFixed(1)} ${units[i]}`
}

export const isTrashed = (fi: FileInfo): boolean => fi.status === FileStatus.Trashed

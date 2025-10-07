import { FileInfo, FileStatus } from '@solarpunkltd/file-manager-lib'

export function getDaysLeft(expiryDate: Date): number {
  const now = new Date()

  const diffMs = expiryDate.getTime() - now.getTime()

  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export enum ByteMetric {
  TB = 'TB',
  GB = 'GB',
  MB = 'MB',
  KB = 'KB',
  B = 'B',
}

const BYTE_CONVERSION_FACTORS: Record<ByteMetric, number> = {
  [ByteMetric.TB]: 1000 ** 4,
  [ByteMetric.GB]: 1000 ** 3,
  [ByteMetric.MB]: 1000 ** 2,
  [ByteMetric.KB]: 1000,
  [ByteMetric.B]: 1,
}

export const fromBytesConversion = (size: number, metric: ByteMetric): number => {
  const factor = BYTE_CONVERSION_FACTORS[metric]

  return size / factor
}

const lifetimeAdjustments = new Map<number, (date: Date) => void>([
  //TODO: It needs to be discussed what the minimum value for value upgrade is
  [0, date => date.setMinutes(date.getMinutes() + 1)],
  [1, date => date.setDate(date.getDate() + 7)],
  [2, date => date.setMonth(date.getMonth() + 1)],
  [3, date => date.setMonth(date.getMonth() + 3)],
  [4, date => date.setMonth(date.getMonth() + 6)],
  [5, date => date.setFullYear(date.getFullYear() + 1)],
])
// TODO: is this correct?
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

export type Point = { x: number; y: number }

export enum Dir {
  Down = 'down',
  Up = 'up',
}

export function getFileId(fi: FileInfo): string {
  return fi.topic.toString()
}

export const KEY_STORAGE = 'privateKey'
export const FM_STORAGE_STATE = 'fmState'

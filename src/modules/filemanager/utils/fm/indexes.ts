import { FeedIndex } from '@ethersphere/bee-js'

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

export const FEED_INDEX_ZERO = FeedIndex.fromBigInt(BigInt(0))

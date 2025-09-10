import type { BatchId } from '@ethersphere/bee-js'
import type { FileInfo } from '@solarpunkltd/file-manager-lib'
import { toStr } from './strings'

export const batchIdToString = (id: string | BatchId | undefined): string =>
  typeof id === 'string' ? id : id?.toString() ?? ''

export function normalizeBatchId(v: unknown): string {
  const s = toStr((v as { toString?: () => string })?.toString?.() ?? v).trim()

  return s.startsWith('0x') ? s.slice(2).toLowerCase() : s.toLowerCase()
}

export function getBatchIdForFile(fi: FileInfo, fallback?: unknown): string | undefined {
  const direct = fi?.batchId

  if (direct) return batchIdToString(direct as string | BatchId | undefined)

  if (fallback != null) return toStr(fallback)

  return undefined
}

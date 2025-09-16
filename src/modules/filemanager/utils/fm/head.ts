import type { FileInfo, FileStatus } from '@solarpunkltd/file-manager-lib'

export const isTrashed = (fi: FileInfo): boolean => (fi.status as FileStatus | undefined) === 'trashed'

export function sameTopic(a: FileInfo, b: FileInfo): boolean {
  try {
    return a.topic === b.topic.toString()
  } catch {
    return false
  }
}
// TODO: use latestOf
export function pickLatest(a: FileInfo, b: FileInfo): FileInfo {
  let av = BigInt(0),
    bv = BigInt(0)
  try {
    av = BigInt(a?.version ?? '0')
  } catch {}
  try {
    bv = BigInt(b?.version ?? '0')
  } catch {}

  if (av === bv) return Number(a.timestamp || 0) >= Number(b.timestamp || 0) ? a : b

  return av > bv ? a : b
}

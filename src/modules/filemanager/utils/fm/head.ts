import type { FileInfo, FileStatus } from '@solarpunkltd/file-manager-lib'
import { normTopic, toStr } from './strings'

export const historyKey = (fi: FileInfo): string => {
  const ref = (fi.file as { historyRef?: unknown })?.historyRef

  return ref ? toStr(ref) : ''
}

export const isTrashed = (fi: FileInfo): boolean => (fi.status as FileStatus | undefined) === 'trashed'

export function sameTopic(a?: FileInfo, b?: FileInfo): boolean {
  try {
    return normTopic(a?.topic) === normTopic(b?.topic)
  } catch {
    return false
  }
}

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

export function getHeadCandidate(
  fmObj: { fileInfoList?: FileInfo[] } | null | undefined,
  seed: FileInfo,
): FileInfo | null {
  try {
    const list: FileInfo[] = fmObj?.fileInfoList || []

    if (!list.length) return null
    const hist = historyKey(seed)
    const seedTopicNorm = normTopic(seed.topic)
    const same = list.filter(f => {
      if (hist) return historyKey(f) === hist

      if (seedTopicNorm) return normTopic(f.topic) === seedTopicNorm

      return f.name === seed.name
    })

    return same.length ? same.reduce(pickLatest) : null
  } catch {
    return null
  }
}

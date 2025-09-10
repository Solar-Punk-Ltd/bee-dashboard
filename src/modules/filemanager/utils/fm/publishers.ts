import type { FileInfo, FileManager } from '@solarpunkltd/file-manager-lib'
import { sameTopic } from './head'
import { toStr } from './strings'
import { FeedIndex } from '@ethersphere/bee-js'

/** Minimal shape we need for publisher discovery. */
export type FMExtra = {
  fileInfoList?: FileInfo[]
  bee?: { getNodeAddresses?: () => Promise<{ publicKey?: string }> }
}

/** Anything that can call getVersion. */
export type GetVersionCapable =
  | Pick<FileManager, 'getVersion'>
  | { getVersion: (fi: FileInfo, version?: unknown) => Promise<FileInfo> }

export async function getCandidatePublishers(fm: FMExtra, seed: FileInfo): Promise<string[]> {
  const out = new Set<string>()

  if (seed.actPublisher) out.add(toStr(seed.actPublisher))

  try {
    const pub = await fm.bee?.getNodeAddresses?.()

    if (pub?.publicKey) out.add(String(pub.publicKey))
  } catch {
    /* ignore */
  }

  try {
    const list: FileInfo[] = fm.fileInfoList || []
    for (const f of list) if (sameTopic(f, seed) && f.actPublisher) out.add(toStr(f.actPublisher))
  } catch {
    /* ignore */
  }

  return Array.from(out)
}

export async function hydrateWithPublishers(
  fmLike: GetVersionCapable,
  fmAny: FMExtra,
  seed: FileInfo,
  version?: unknown,
): Promise<FileInfo> {
  const pubs = await getCandidatePublishers(fmAny, seed)

  for (const p of pubs) {
    try {
      const variant: FileInfo = { ...seed, actPublisher: p }
      const res = await fmLike.getVersion(variant, version as FeedIndex)

      return res.actPublisher ? res : { ...res, actPublisher: p }
    } catch {
      /* try next */
    }
  }

  const res = await fmLike.getVersion(seed, version as FeedIndex)

  return res.actPublisher || pubs.length === 0 ? res : { ...res, actPublisher: pubs[0] }
}

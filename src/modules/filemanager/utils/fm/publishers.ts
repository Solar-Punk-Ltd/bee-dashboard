import { FileInfo, FileManagerBase } from '@solarpunkltd/file-manager-lib'
import { Bee } from '@ethersphere/bee-js'

export async function getCandidatePublishers(bee: Bee, fm: FileManagerBase, seed: FileInfo): Promise<string[]> {
  const out = new Set<string>()

  if (seed.actPublisher) out.add(seed.actPublisher.toString())

  try {
    const pub = await bee.getNodeAddresses()

    if (pub.publicKey) out.add(pub.publicKey.toString())
  } catch {
    /* ignore */
  }

  try {
    const list: FileInfo[] = fm.fileInfoList
    for (const f of list) {
      if (f.topic.toString() === seed.topic.toString() && f.actPublisher) out.add(f.actPublisher.toString())
    }
  } catch {
    /* ignore */
  }

  return Array.from(out)
}

export async function hydrateWithPublishers(
  bee: Bee,
  fm: FileManagerBase,
  seed: FileInfo,
  version?: string,
): Promise<FileInfo> {
  const pubs = await getCandidatePublishers(bee, fm, seed)

  for (const p of pubs) {
    try {
      const variant: FileInfo = { ...seed, actPublisher: p }
      const res = await fm.getVersion(variant, version)

      return res.actPublisher ? res : { ...res, actPublisher: p }
    } catch {
      /* try next */
    }
  }

  const res = await fm.getVersion(seed, version)

  return res.actPublisher || pubs.length === 0 ? res : { ...res, actPublisher: pubs[0] }
}

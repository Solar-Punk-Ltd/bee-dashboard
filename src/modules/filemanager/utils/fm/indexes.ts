export const HEX_INDEX_BYTES = 8
export const HEX_INDEX_CHARS = HEX_INDEX_BYTES * 2

export const indexToHex8 = (i: bigint) => `0x${i.toString(16).padStart(HEX_INDEX_CHARS, '0')}`

export const padIndexHex = (hexNoPrefix: string) => hexNoPrefix.toLowerCase().padStart(HEX_INDEX_CHARS, '0')

export function toHexIndex(v?: string | number | bigint): string | undefined {
  if (v == null || v === '') return undefined
  const s = String(v)

  return s.startsWith('0x') ? `0x${padIndexHex(s.slice(2))}` : indexToHex8(BigInt(s))
}

export function parseIndexSafe(v: unknown): bigint {
  try {
    if (v == null) return BigInt(0)
    const s = String(v).trim()

    return s.startsWith('0x') ? BigInt(s) : BigInt(s || '0')
  } catch {
    return BigInt(0)
  }
}

export function parseIndexLoose(v: unknown): bigint | null {
  try {
    if (v == null) return null

    if (typeof v === 'bigint') return v

    return BigInt(String(v).trim())
  } catch {
    return null
  }
}

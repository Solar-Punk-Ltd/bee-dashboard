type BeeBytes = { toUint8Array: () => Uint8Array }
type HasGetReader = { getReader: () => ReadableStreamDefaultReader<Uint8Array> }
type HasArrayBuffer = { arrayBuffer: () => Promise<ArrayBuffer> }
type HasBlob = { blob: () => Promise<Blob> }

const hasToUint8Array = (x: unknown): x is BeeBytes =>
  typeof x === 'object' && x !== null && typeof (x as BeeBytes).toUint8Array === 'function'
const hasGetReader = (x: unknown): x is HasGetReader =>
  typeof x === 'object' &&
  x !== null &&
  'getReader' in (x as HasGetReader) &&
  typeof (x as HasGetReader).getReader === 'function'
const hasArrayBufferFn = (x: unknown): x is HasArrayBuffer =>
  typeof x === 'object' &&
  x !== null &&
  'arrayBuffer' in (x as HasArrayBuffer) &&
  typeof (x as HasArrayBuffer).arrayBuffer === 'function'
const hasBlobFn = (x: unknown): x is HasBlob =>
  typeof x === 'object' && x !== null && 'blob' in (x as HasBlob) && typeof (x as HasBlob).blob === 'function'

export async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    let res = await reader.read()
    while (!res.done) {
      const chunk = res.value

      if (chunk) {
        chunks.push(chunk)
        total += chunk.byteLength
      }
      res = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }

  return out
}

export type DownloadPart = Blob | Uint8Array | BeeBytes | ReadableStream<Uint8Array> | HasArrayBuffer | HasBlob

export async function normalizeToBlob(part: DownloadPart, mime?: string): Promise<Blob> {
  const type = mime || 'application/octet-stream'

  if (part instanceof Blob) return part

  if (hasToUint8Array(part)) return new Blob([part.toUint8Array()], { type })

  if (part instanceof Uint8Array) return new Blob([part], { type })

  if (hasGetReader(part)) {
    const u8 = await streamToUint8Array(part as unknown as ReadableStream<Uint8Array>)

    return new Blob([u8], { type })
  }

  if (hasBlobFn(part)) {
    const b = await (part as HasBlob).blob()

    return b.type ? b : new Blob([await b.arrayBuffer()], { type })
  }

  if (hasArrayBufferFn(part)) {
    const buf = await (part as HasArrayBuffer).arrayBuffer()

    return new Blob([buf], { type })
  }
  throw new Error('Unsupported downloaded part type')
}

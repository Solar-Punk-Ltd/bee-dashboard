import { FileInfo, FileManager } from '@solarpunkltd/file-manager-lib'
import { getExtensionFromName, guessMime, VIEWERS } from './view'
import { Zip, ZipDeflate } from 'fflate'

type FileInfoWithHandle = {
  info: FileInfo
  handle?: FileSystemFileHandle
  cancelled?: boolean
}

const processStream = async (
  stream: ReadableStream<Uint8Array>,
  fileHandle: FileSystemFileHandle,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
): Promise<void> => {
  const reader = stream.getReader()

  let writable: WritableStreamDefaultWriter<Uint8Array> | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writable = (await (fileHandle as any).createWritable()) as WritableStreamDefaultWriter<Uint8Array>

    let done = false
    let progress = 0
    while (!done) {
      const { value, done: streamDone } = await reader.read()

      if (value) {
        await writable.write(value)
        progress += value.length
      }

      done = streamDone

      if (onDownloadProgress) onDownloadProgress(progress, !done)
    }
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error('Failed to process stream: ', e)
  } finally {
    reader.releaseLock()

    if (writable) {
      await writable.close()
    }
  }
}

const streamToBlob = async (
  stream: ReadableStream<Uint8Array>,
  mimeType: string,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
): Promise<Blob | undefined> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  try {
    let done = false
    let progress = 0
    while (!done) {
      const { value, done: streamDone } = await reader.read()

      if (value) {
        chunks.push(value)
        progress += value.length
      }
      done = streamDone

      if (onDownloadProgress) onDownloadProgress(progress, !done)
    }
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error during stream processing: ', error)

    return
  } finally {
    reader.releaseLock()
  }

  const combined = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }

  return new Blob([combined], { type: mimeType })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isPickerSupported = (): boolean => typeof (window as any).showSaveFilePicker === 'function'

const getFileHandles = async (infoList: FileInfo[]): Promise<FileInfoWithHandle[] | undefined> => {
  if (!isPickerSupported()) return infoList.map(info => ({ info }))

  const handles: FileInfoWithHandle[] = []

  for (let i = 0; i < infoList.length; i++) {
    const info = infoList[i]
    const name = info.name
    const mimeType = guessMime(name, info.customMetadata)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = (await (window as any).showSaveFilePicker({
        suggestedName: name,
        types: [{ accept: { [mimeType]: [`.${getExtensionFromName(name)}`] } }],
      })) as FileSystemFileHandle

      handles.push({ info, handle })
    } catch (error: unknown) {
      const errName = (error as { name?: string })?.name

      if (errName === 'AbortError' || errName === 'NotAllowedError' || errName === 'SecurityError') {
        handles.push({ info, cancelled: true })
      } else {
        return undefined
      }
    }
  }

  return handles
}

const savePicker = async (suggestedName: string): Promise<FileSystemFileHandle | undefined> => {
  if (!isPickerSupported()) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [{ accept: { 'application/zip': ['.zip'] } }],
    })

    return handle as FileSystemFileHandle
  } catch (e: unknown) {
    const n = (e as { name?: string })?.name

    if (n === 'AbortError' || n === 'NotAllowedError' || n === 'SecurityError') return

    return
  }
}

const downloadToDisk = async (
  streams: ReadableStream<Uint8Array>[],
  handle: FileSystemFileHandle,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
): Promise<void> => {
  try {
    for (const stream of streams) {
      // TODO: is await needed here?
      await processStream(stream, handle, onDownloadProgress)
    }
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error during download to disk: ', error)
  }
}

const openInAppFrame = (name: string, mime: string, url: string): boolean => {
  const viewer = VIEWERS.find(v => v.test(mime))

  if (!viewer) return false

  window.dispatchEvent(
    new CustomEvent('fm:open-preview', {
      detail: { name, mime, url },
    }),
  )

  return true
}

const downloadToBlob = async (
  streams: ReadableStream<Uint8Array>[],
  info: FileInfo,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
  isOpenWindow?: boolean,
): Promise<void> => {
  try {
    for (const stream of streams) {
      const mime = guessMime(info.name, info.customMetadata)
      const blob = await streamToBlob(stream, mime, onDownloadProgress)

      if (blob) {
        const url = URL.createObjectURL(blob)

        let openSuccess = false

        if (isOpenWindow) {
          openSuccess = openInAppFrame(info.name, mime, url)
        }

        if (!openSuccess) {
          downloadFromUrl(url, info.name)
        }
      }
    }
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error during download and open: ', error)
  }
}

const downloadFromUrl = (url: string, fileName: string): void => {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

export const startDownloadingQueue = async (
  fm: FileManager,
  infoList: FileInfo[],
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
  isOpenWindow?: boolean,
): Promise<void> => {
  try {
    const fileHandles: FileInfoWithHandle[] | undefined = isOpenWindow
      ? infoList.map(info => ({ info }))
      : await getFileHandles(infoList)

    if (!fileHandles) return

    for (const fh of fileHandles) {
      if (fh.cancelled) {
        onDownloadProgress?.(-1, false)
      } else {
        const dataStreams = (await fm.download(fh.info)) as ReadableStream<Uint8Array>[]

        if (isOpenWindow || !fh.handle) {
          await downloadToBlob(dataStreams, fh.info, onDownloadProgress, isOpenWindow)
        } else {
          await downloadToDisk(dataStreams, fh.handle, onDownloadProgress)
        }
      }
    }
  } catch {
    // TODO: handle error
  }
}

export const startDownloadingZip = async (
  fm: FileManager,
  infoList: FileInfo[],
  onDownloadProgress?: (bytesDownloaded: number, isDownloading: boolean) => void,
): Promise<void> => {
  if (!infoList?.length) return

  const zipName =
    infoList.length === 1 ? `${infoList[0].name}.zip` : `swarm-fm-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`

  let handle: FileSystemFileHandle | undefined
  try {
    handle = await savePicker(zipName)
  } catch (e: unknown) {
    onDownloadProgress?.(-1, false)

    return
  }

  if (!handle) {
    onDownloadProgress?.(-1, false)

    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer = (await (handle as any).createWritable()) as WritableStreamDefaultWriter<Uint8Array>

  let pending = Promise.resolve()
  let totalBytes = 0

  const zip = new Zip((err, chunk, final) => {
    if (err) {
      onDownloadProgress?.(-1, false)

      return
    }
    pending = pending.then(() => writer.write(chunk))

    if (final) {
      pending = pending.then(() => writer.close()).then(() => onDownloadProgress?.(totalBytes, false))
    }
  })

  for (const fi of infoList) {
    const entry = new ZipDeflate(fi.name)
    zip.add(entry)

    const streams = (await fm.download(fi)) as ReadableStream<Uint8Array>[]
    for (const s of streams) {
      const reader = s.getReader()
      for (;;) {
        const { value, done } = await reader.read()

        if (value) {
          entry.push(value, false)
          totalBytes += value.length
          onDownloadProgress?.(totalBytes, true)
        }

        if (done) break
      }
    }
    entry.push(new Uint8Array(0), true)
  }

  zip.end()
}

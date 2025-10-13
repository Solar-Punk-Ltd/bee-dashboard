import { FileInfo, FileManager } from '@solarpunkltd/file-manager-lib'
import { getExtensionFromName, guessMime, VIEWERS } from './view'
import { AbortManager } from './abortManager'

const downloadAborts = new AbortManager()

export function createDownloadAbort(name: string): void {
  downloadAborts.create(name)
}

export function abortDownload(name: string): void {
  downloadAborts.abort(name)
}

const processStream = async (
  stream: ReadableStream<Uint8Array>,
  fileHandle: FileSystemFileHandle,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const reader = stream.getReader()
  let writable: WritableStreamDefaultWriter<Uint8Array> | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writable = (await (fileHandle as any).createWritable()) as WritableStreamDefaultWriter<Uint8Array>

    let done = false
    let progress = 0
    while (!done) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const { value, done: streamDone } = await reader.read()

      if (value) {
        await writable.write(value)
        progress += value.length
      }
      done = streamDone
      onDownloadProgress?.(progress, !done)
    }
  } catch (e: unknown) {
    if ((e as { name?: string }).name === 'AbortError') onDownloadProgress?.(-1, false)
    // eslint-disable-next-line no-console
    else console.error('Failed to process stream: ', e)
  } finally {
    reader.releaseLock()
    try {
      if (signal?.aborted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (writable as any)?.abort?.()
      } else {
        await writable?.close()
      }
    } catch {
      /* no-op */
    }
  }
}

const streamToBlob = async (
  stream: ReadableStream<Uint8Array>,
  mimeType: string,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
  signal?: AbortSignal,
): Promise<Blob | undefined> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  try {
    let done = false
    let progress = 0
    while (!done) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const { value, done: streamDone } = await reader.read()

      if (value) {
        chunks.push(value)
        progress += value.length
      }
      done = streamDone
      onDownloadProgress?.(progress, !done)
    }
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'AbortError') {
      onDownloadProgress?.(-1, false)
    } else {
      // eslint-disable-next-line no-console
      console.error('Error during stream processing: ', error)
    }

    return
  } finally {
    reader.releaseLock()
  }

  const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    combined.set(c, offset)
    offset += c.length
  }

  return new Blob([combined], { type: mimeType })
}

interface FileInfoWithHandle {
  info: FileInfo
  handle?: FileSystemFileHandle
  cancelled?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isPickerSupported = (): boolean => typeof (window as any).showSaveFilePicker === 'function'

const getFileHandles = async (infoList: FileInfo[]): Promise<FileInfoWithHandle[] | undefined> => {
  const defaultDownloadFolder = 'downloads'

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
        startIn: defaultDownloadFolder,
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

const downloadToDisk = async (
  streams: ReadableStream<Uint8Array>[],
  handle: FileSystemFileHandle,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
  signal?: AbortSignal,
): Promise<void> => {
  try {
    for (const stream of streams) {
      await processStream(stream, handle, onDownloadProgress, signal)
    }
  } catch (error: unknown) {
    if ((error as { name?: string }).name !== 'AbortError') {
      // eslint-disable-next-line no-console
      console.error('Error during download to disk: ', error)
    }
  }
}

const downloadToBlob = async (
  streams: ReadableStream<Uint8Array>[],
  info: FileInfo,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
  isOpenWindow?: boolean,
  signal?: AbortSignal,
): Promise<void> => {
  try {
    for (const stream of streams) {
      const mime = guessMime(info.name, info.customMetadata)
      const blob = await streamToBlob(stream, mime, onDownloadProgress, signal)

      if (blob) {
        const url = URL.createObjectURL(blob)
        let opened = false

        if (isOpenWindow) {
          opened = openNewWindow(info.name, mime, url)
        }

        if (!opened) {
          downloadFromUrl(url, info.name)
        }
      }
    }
  } catch (error: unknown) {
    if ((error as { name?: string }).name !== 'AbortError') {
      // eslint-disable-next-line no-console
      console.error('Error during download and open: ', error)
    }
  }
}

const openNewWindow = (name: string, mime: string, url: string): boolean => {
  const viewer = VIEWERS.find(v => v.test(mime))
  const win = window.open('', '_blank')

  if (viewer && win) {
    viewer.render(win, url, mime, name)

    return true
  }

  win?.close()

  return false
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
      const name = fh.info.name
      createDownloadAbort(name)
      const signal = downloadAborts.getSignal(name)

      if (fh.cancelled) {
        onDownloadProgress?.(-1, false)
      } else {
        await downloadAborts.withSignal(name, async () => {
          const dataStreams = (await fm.download(fh.info)) as ReadableStream<Uint8Array>[]

          if (isOpenWindow || !fh.handle) {
            await downloadToBlob(dataStreams, fh.info, onDownloadProgress, isOpenWindow, signal)
          } else {
            await downloadToDisk(dataStreams, fh.handle, onDownloadProgress, signal)
          }
        })
      }

      abortDownload(name)
    }
  } catch (error: unknown) {
    if ((error as { name?: string }).name !== 'AbortError') {
      // eslint-disable-next-line no-console
      console.error('Error during downloading queue: ', error)
    }
  }
}

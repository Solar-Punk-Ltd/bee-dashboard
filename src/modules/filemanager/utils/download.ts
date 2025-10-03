import { FileInfo, FileManager } from '@solarpunkltd/file-manager-lib'
import { getExtensionFromName, guessMime, VIEWERS } from './view'

export interface DownloadProgress {
  progress: number
  isDownloading: boolean
}

interface FileInfoWithHandle {
  info: FileInfo
  handle?: FileSystemFileHandle
}

const processStream = async (
  stream: ReadableStream<Uint8Array>,
  fileHandle: FileSystemFileHandle,
  onDownloadProgress?: (dp: DownloadProgress) => void,
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

      if (onDownloadProgress) onDownloadProgress({ progress, isDownloading: !done })
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
  onDownloadProgress?: (dp: DownloadProgress) => void,
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

      if (onDownloadProgress) onDownloadProgress({ progress, isDownloading: !done })
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

const getFileHandles = async (infoList: FileInfo[]): Promise<FileInfoWithHandle[] | undefined> => {
  const defaultDownloadFolder = 'downloads'
  const fileHandles: FileInfoWithHandle[] = []

  for (const info of infoList) {
    const name = info.name
    const mimeType = guessMime(name, info.customMetadata)
    let handle: FileSystemFileHandle | undefined

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle = (await (window as any).showSaveFilePicker({
        suggestedName: name,
        startIn: defaultDownloadFolder,
        types: [
          {
            accept: {
              [mimeType]: [`.${getExtensionFromName(name)}`],
            },
          },
        ],
      })) as FileSystemFileHandle
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') {
        return
      }

      // eslint-disable-next-line no-console
      console.error(`Error getting file handle ${error}, using fallback download`)
    }

    fileHandles.push({
      info,
      handle,
    })
  }

  return fileHandles
}

const downloadToDisk = (
  streams: ReadableStream<Uint8Array>[],
  handle: FileSystemFileHandle,
  onDownloadProgress?: (dp: DownloadProgress) => void,
): void => {
  try {
    for (const stream of streams) {
      processStream(stream, handle, onDownloadProgress)
    }
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error during download to disk: ', error)
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

const downloadToBlob = async (
  streams: ReadableStream<Uint8Array>[],
  info: FileInfo,
  onDownloadProgress?: (dp: DownloadProgress) => void,
  isOpenWindow?: boolean,
): Promise<void> => {
  for (const stream of streams) {
    const mime = guessMime(info.name, info.customMetadata)
    const blob = await streamToBlob(stream, mime, onDownloadProgress)

    if (blob) {
      const url = URL.createObjectURL(blob)

      let openSuccess = false

      if (isOpenWindow) {
        openSuccess = openNewWindow(info.name, mime, url)
      }

      if (!openSuccess) {
        downloadFromUrl(url, info.name)
      }
    }
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
  onDownloadProgress?: (dp: DownloadProgress) => void,
  isOpenWindow?: boolean,
): Promise<void> => {
  let fileHandles: FileInfoWithHandle[] | undefined

  if (isOpenWindow) {
    fileHandles = infoList.map(info => ({ info }))
  } else {
    fileHandles = await getFileHandles(infoList)
  }

  if (!fileHandles) {
    return
  }

  for (const { info, handle } of fileHandles) {
    const dataStreams = (await fm.download(info)) as ReadableStream<Uint8Array>[]

    if (isOpenWindow || !handle) {
      downloadToBlob(dataStreams, info, onDownloadProgress, isOpenWindow)

      return
    }

    if (handle) {
      downloadToDisk(dataStreams, handle, onDownloadProgress)
    }
  }
}

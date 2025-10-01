import { FileInfo, FileManager } from '@solarpunkltd/file-manager-lib'

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

async function streamToBlob(
  stream: ReadableStream<Uint8Array>,
  mimeType: string,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
): Promise<Blob | undefined> {
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

interface FileInfoWithHandle {
  info: FileInfo
  handle?: FileSystemFileHandle
}

async function getFileHandles(infoList: FileInfo[]): Promise<FileInfoWithHandle[] | undefined> {
  const defaultDownloadFolder = 'downloads'
  const fileHandles: FileInfoWithHandle[] = []

  for (let i = 0; i < infoList.length; i++) {
    const name = infoList[i].name
    const mimeType = infoList[i].customMetadata?.mimeType || 'application/octet-stream'
    let handle: FileSystemFileHandle | undefined

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle = (await (window as any).showSaveFilePicker({
        suggestedName: name,
        startIn: defaultDownloadFolder,
        types: [
          {
            accept: {
              [mimeType]: [`.${name.split('.').pop()}`],
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
      info: infoList[i],
      handle,
    })
  }

  return fileHandles
}

async function downloadToDisk(
  streams: ReadableStream<Uint8Array>[],
  info: FileInfo,
  fileHandle?: FileSystemFileHandle,
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
): Promise<void> {
  try {
    for (const stream of streams) {
      // Fallback for browsers that do not support the File System Access API
      if (!fileHandle) {
        const blob = await streamToBlob(
          stream,
          info.customMetadata?.mimeType || 'application/octet-stream',
          onDownloadProgress,
        )

        if (blob) {
          downloadFileFallback(blob, info.name)
        }
      } else {
        await processStream(stream, fileHandle, onDownloadProgress)
      }
    }
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error during downloading to disk: ', error)
  }
}

function downloadFileFallback(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
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
  fileInfoList: FileInfo[],
  onDownloadProgress?: (progress: number, isDownloading: boolean) => void,
): Promise<void> => {
  try {
    const fileHandles = await getFileHandles(fileInfoList)

    if (!fileHandles) {
      return
    }

    for (let i = 0; i < fileHandles.length; i++) {
      const info = fileHandles[i].info
      const dataStreams = (await fm.download(info)) as ReadableStream<Uint8Array>[]

      await downloadToDisk(dataStreams, info, fileHandles[i].handle, onDownloadProgress)
    }
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error during downloading queue: ', error)
  }
}

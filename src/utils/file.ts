import { Bee, PostageBatch, Reference } from '@ethersphere/bee-js'
import { isSupportedImageType } from './image'
import { isSupportedVideoType } from './video'
import { FileInfo, FileManager } from '@solarpunkltd/file-manager-lib'
import { FileTypes } from '../constants'
import { Bytes } from 'ethers'

const indexHtmls = ['index.html', 'index.htm']

interface DetectedIndex {
  indexPath: string
  commonPrefix?: string
}

export function detectIndexHtml(files: FilePath[]): DetectedIndex | false {
  const paths = files.map(getPath)

  if (!paths.length) {
    return false
  }

  const exactMatch = paths.find(x => indexHtmls.includes(x))

  if (exactMatch) {
    return { indexPath: exactMatch }
  }

  const sortedPaths = paths.sort((a, b) => a.localeCompare(b))
  const firstSegments = sortedPaths[0].split('/')
  const lastSegments = sortedPaths[sortedPaths.length - 1].split('/')
  let matchingSegments = 0

  for (; matchingSegments < firstSegments.length; matchingSegments++) {
    if (firstSegments[matchingSegments] !== lastSegments[matchingSegments]) {
      break
    }
  }

  const commonPrefix = firstSegments.slice(0, matchingSegments).join('/') + '/'

  const allStartWithSamePrefix = paths.every(x => x.startsWith(commonPrefix))

  if (allStartWithSamePrefix) {
    const match = paths.find(x => indexHtmls.map(y => commonPrefix + y).includes(x))

    if (match) {
      return { indexPath: match, commonPrefix }
    }
  }

  return false
}

export function getHumanReadableFileSize(bytes: number): string {
  if (bytes >= 1e15) {
    return (bytes / 1e15).toFixed(2) + ' PB'
  }

  if (bytes >= 1e12) {
    return (bytes / 1e12).toFixed(2) + ' TB'
  }

  if (bytes >= 1e9) {
    return (bytes / 1e9).toFixed(2) + ' GB'
  }

  if (bytes >= 1e6) {
    return (bytes / 1e6).toFixed(2) + ' MB'
  }

  if (bytes >= 1e3) {
    return (bytes / 1e3).toFixed(2) + ' kB'
  }

  return bytes + ' bytes'
}

export function getAssetNameFromFiles(files: FilePath[]): string {
  if (files.length === 1) return files[0].name

  if (files.length > 0) {
    const prefix = getPath(files[0]).split('/')[0]

    // Only if all files have a common prefix we can use it as a folder name
    if (files.every(f => getPath(f).split('/')[0] === prefix)) return prefix
  }

  return 'unknown'
}

export function getMetadata(files: FilePath[]): Metadata {
  const size = files.reduce((total, item) => total + item.size, 0)
  const name = getAssetNameFromFiles(files)
  const type = files.length === 1 ? files[0].type : 'folder'
  const count = files.length
  const isWebsite = Boolean(detectIndexHtml(files))
  const isVideo = isSupportedVideoType(type)
  const isImage = isSupportedImageType(type)

  return { size, name, type, isWebsite, count, isVideo, isImage }
}

export function getPath(file: FilePath): string {
  return (file.path || file.webkitRelativePath || file.name).replace(/^\//g, '') // remove the starting slash
}

/**
 * Utility function that is needed to have correct directory structure as webkitRelativePath is read only
 */
export function packageFile(file: FilePath, pathOverwrite?: string): FilePath {
  let path = pathOverwrite || getPath(file)

  if (!path.startsWith('/') && path.includes('/')) {
    path = `/${path}`
  }

  return {
    path: path,
    fullPath: path,
    // bytes: file.bytes, // recently added
    webkitRelativePath: path,
    lastModified: file.lastModified,
    name: file.name,
    size: file.size,
    type: file.type,
    stream: file.stream,
    slice: (start: number, end: number) => file.slice(start, end),
    text: file.text,
    arrayBuffer: async () => await file.arrayBuffer(),
  }
}

export function getFileType(input: string): string {
  const index = input.indexOf('/')

  const type = index !== -1 ? input.substring(0, index) : input
  const fileTypes = Object.values(FileTypes)

  if (fileTypes.includes(type as FileTypes)) {
    return type
  }

  return 'other'
}

export const fromBytesConversion = (size: number, metric: string) => {
  switch (metric) {
    case 'GB':
      return size / 1000 / 1000 / 1000
    case 'MB':
      return size / 1000 / 1000
    default:
      return 0
  }
}

export const sizeToBytes = (size: number, metric: string) => {
  switch (metric) {
    case 'GB':
      return size * 1000 * 1000 * 1000
    case 'MB':
      return size * 1000 * 1000
    default:
      return 0
  }
}

export const formatDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}

export const startDownloadingQueue = async (
  filemanager: FileManager,
  fileInfoList: FileInfo[],
): Promise<string[][] | undefined> => {
  try {
    const dataPromises: Promise<string[]>[] = []
    // eslint-disable-next-line no-console
    console.log('fileInfoList', fileInfoList)
    const downloadTasks = fileInfoList.map(infoItem => ({
      promise: filemanager.download(new Reference(infoItem.file.reference), {
        actPublisher: infoItem.actPublisher.toString(),
        actHistoryAddress: infoItem.file.historyRef.toString(),
      }),
      fileInfo: infoItem,
    }))

    const data: Bytes[] = []
    await Promise.allSettled(downloadTasks.map(task => task.promise)).then(results => {
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (Array.isArray(result.value)) {
            data.push(result.value[0].toUint8Array())
          } else {
            // eslint-disable-next-line no-console
            console.error('Unexpected result value type:', typeof result.value)
          }

          const fileInfo = downloadTasks[index].fileInfo

          downloadFile(data[index], fileInfo.customMetadata?.type || 'application/octet-stream', fileInfo.name)
        } else {
          // eslint-disable-next-line no-console
          console.error('Failed to download file:', {
            fileName: downloadTasks[index].fileInfo.name,
            error: result.reason,
          })
        }
      })
    })

    return data.map(byteArray => [Array.from(byteArray).join(',')])
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error downloading file with: ', error)
  }
}

async function downloadFile(data: Bytes, fileName: string, mimeType = 'application/octet-stream'): Promise<void> {
  const uint8Array = data instanceof Uint8Array ? data : Uint8Array.from(data)
  const blob = new Blob([uint8Array], { type: mimeType })

  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: 'File',
          accept: {
            [mimeType]: [`.${fileName.split('.').pop()}`],
          },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    //const blob = new Blob([blob], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }
}

export const getUsableStamps = async (bee: Bee | null): Promise<PostageBatch[]> => {
  if (!bee) {
    return []
  }
  try {
    return (await bee.getAllPostageBatch())
      .filter(s => s.usable)
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Error getting usable stamps: ', error)

    return []
  }
}

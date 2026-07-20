import { GetGranteesResult, PostageBatch } from '@ethersphere/bee-js'
import { FileManagerBase, FileRecord, FileStatus, FolderInfo } from '@solarpunkltd/file-manager-lib'
import type { ReactElement } from 'react'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import GeneralIcon from 'remixicon-react/FileTextLineIcon'
import HardDriveIcon from 'remixicon-react/HardDrive2LineIcon'
import AccessIcon from 'remixicon-react/ShieldKeyholeLineIcon'

import { erasureCodeMarks, FEED_INDEX_ZERO } from '../constants/common'

import { indexStrToBigint, truncateNameMiddle } from './common'

export type FileProperty = { key: string; label: string; value: string; raw?: string }
export type FilePropertyGroup = { title: string; icon?: ReactElement; properties: FileProperty[] }

type KnownCustomMeta = Record<string, string> & {
  size?: string
  mime?: string
  path?: string
  fileCount?: string
  expiresAt?: string
}

const dash = '—'

const formatBytes = (bytes?: number | string) => {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes

  if (!Number.isFinite(n as number) || (n as number) < 0) return dash

  if ((n as number) < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = (n as number) / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }

  return `${v.toFixed(1)} ${units[i]}`
}

const truncateMiddle = (s?: string, start = 8, end = 8) => {
  if (!s) return dash

  return s.length <= start + end + 3 ? s : `${s.slice(0, start)}...${s.slice(-end)}`
}

const fmtDate = (ts?: number) => {
  if (ts === undefined || !Number.isFinite(ts)) return dash
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return dash
  }
}

async function getCreatedTs(fm: FileManagerBase, fi: FileRecord): Promise<number | undefined> {
  try {
    const v0 = await fm.getFileVersion(fi, FEED_INDEX_ZERO.toString())

    return v0.timestamp
  } catch {
    return undefined
  }
}

function extractGranteeCount(r: GetGranteesResult): number {
  const obj = r as unknown as Record<string, unknown>
  const pk = obj.publicKeys

  if (Array.isArray(pk)) return pk.length
  const gs = obj.grantees

  if (Array.isArray(gs)) return gs.length

  return 0
}

export async function getGranteeCount(fm: FileManagerBase, fi: FileRecord): Promise<number | undefined> {
  try {
    const result = await fm.getGrantees(fi)

    return extractGranteeCount(result)
  } catch {
    return undefined
  }
}

function buildGeneralGroup(
  fi: FileRecord,
  mime?: string,
  size?: number | string,
  path?: string,
  fileCount?: string,
): FilePropertyGroup {
  return {
    title: 'General',
    icon: <GeneralIcon size="14px" color="rgb(237, 129, 49)" />,
    properties: [
      { key: 'type', label: 'Type', value: mime ?? dash },
      { key: 'size', label: 'Size', value: size !== undefined && size !== null ? formatBytes(size) : dash },
      { key: 'count', label: 'Items', value: fileCount ?? '1' },
      { key: 'path', label: 'Location', value: truncateNameMiddle(path || dash, 35, 10, 10) },
      {
        key: 'hash',
        label: 'Swarm hash',
        value: truncateMiddle(fi.content.reference.toString()),
        raw: fi.content.reference.toString(),
      },
      {
        key: 'ver',
        label: 'Versions',
        value: ((indexStrToBigint(fi.version?.toString()) ?? BigInt(0)) + BigInt(1)).toString(),
      },
      { key: 'status', label: 'Status', value: !fi.status ? FileStatus.Active : fi.status },
    ],
  }
}

function buildDatesGroup(createdTs?: number, modifiedTs?: number, expires?: string): FilePropertyGroup {
  return {
    title: 'Dates',
    icon: <CalendarIcon size="14px" color="rgb(237, 129, 49)" />,
    properties: [
      { key: 'created', label: 'Created', value: fmtDate(createdTs) },
      { key: 'modified', label: 'Modified', value: fmtDate(modifiedTs) },
      { key: 'expires', label: 'Expires', value: expires ?? dash },
    ],
  }
}

function buildAccessGroup(fi: FileRecord, granteeCount?: number): FilePropertyGroup {
  return {
    title: 'Access & Permissions',
    icon: <AccessIcon size="14px" color="rgb(237, 129, 49)" />,
    properties: [
      {
        key: 'owner',
        label: 'Owner',
        value: truncateMiddle(fi.owner.toString()),
        raw: fi.owner.toString(),
      },
      { key: 'shared', label: 'Sharing', value: fi.shared ? 'Shared' : 'Private' },
      {
        key: 'grantees',
        label: 'Grantees',
        value: granteeCount !== undefined && granteeCount !== null ? `${granteeCount}` : dash,
      },
      {
        key: 'actpub',
        label: 'ACT Publisher',
        value: truncateMiddle(fi.actPublisher.toString()),
        raw: fi.actPublisher.toString(),
      },
      {
        key: 'topic',
        label: 'Topic',
        value: truncateMiddle(fi.topic.toString()),
        raw: fi.topic.toString(),
      },
      {
        key: 'historyRef',
        label: 'ACT History',
        value: truncateMiddle(fi.content.historyRef.toString()),
        raw: fi.content.historyRef.toString(),
      },
    ],
  }
}

function buildStorageGroup(fi: FileRecord, driveName: string, stamp?: PostageBatch): FilePropertyGroup {
  const stampValue = stamp
    ? truncateNameMiddle(stamp.label, 35, 10, 10) + ' (' + truncateMiddle(fi.batchId.toString(), 4, 4) + ')'
    : truncateMiddle(fi.batchId.toString())

  const redundancyLabel =
    fi.redundancyLevel !== undefined
      ? (erasureCodeMarks.find(mark => mark.value === fi.redundancyLevel)?.label ?? fi.redundancyLevel.toString())
      : dash

  return {
    title: 'Storage',
    icon: <HardDriveIcon size="14px" color="rgb(237, 129, 49)" />,
    properties: [
      {
        key: 'batch',
        label: 'Batch ID',
        value: stampValue,
        raw: fi.batchId.toString(),
      },
      { key: 'drive', label: 'Drive', value: truncateNameMiddle(driveName, 35, 10, 10) },
      { key: 'redundancy', label: 'Redundancy', value: redundancyLabel },
    ],
  }
}

export function buildFolderInfoGroups(
  folder: FolderInfo,
  driveName: string,
  itemCount: number,
  stamp?: PostageBatch,
): FilePropertyGroup[] {
  const manifestRef = folder.manifestRef?.reference?.toString()
  const historyRef = folder.manifestRef?.historyRef?.toString()

  const stampValue = stamp
    ? truncateNameMiddle(stamp.label, 35, 10, 10) + ' (' + truncateMiddle(folder.batchId.toString(), 4, 4) + ')'
    : truncateMiddle(folder.batchId.toString())

  const redundancyLabel =
    folder.redundancyLevel !== undefined
      ? (erasureCodeMarks.find(mark => mark.value === folder.redundancyLevel)?.label ??
        folder.redundancyLevel.toString())
      : dash

  return [
    {
      title: 'General',
      icon: <GeneralIcon size="14px" color="rgb(237, 129, 49)" />,
      properties: [
        { key: 'type', label: 'Type', value: 'Folder' },
        { key: 'count', label: 'Items', value: `${itemCount}` },
        { key: 'path', label: 'Location', value: truncateNameMiddle(folder.path || dash, 35, 10, 10) },
        {
          key: 'manifest',
          label: 'Manifest hash',
          value: manifestRef ? truncateMiddle(manifestRef) : dash,
          raw: manifestRef,
        },
        {
          key: 'ver',
          label: 'Versions',
          value: ((indexStrToBigint(folder.version?.toString()) ?? BigInt(0)) + BigInt(1)).toString(),
        },
        { key: 'status', label: 'Status', value: !folder.status ? FileStatus.Active : folder.status },
      ],
    },
    {
      title: 'Access & Permissions',
      icon: <AccessIcon size="14px" color="rgb(237, 129, 49)" />,
      properties: [
        { key: 'owner', label: 'Owner', value: truncateMiddle(folder.owner.toString()), raw: folder.owner.toString() },
        {
          key: 'actpub',
          label: 'ACT Publisher',
          value: truncateMiddle(folder.actPublisher.toString()),
          raw: folder.actPublisher.toString(),
        },
        { key: 'topic', label: 'Topic', value: truncateMiddle(folder.topic.toString()), raw: folder.topic.toString() },
        {
          key: 'historyRef',
          label: 'ACT History',
          value: historyRef ? truncateMiddle(historyRef) : dash,
          raw: historyRef,
        },
      ],
    },
    {
      title: 'Storage',
      icon: <HardDriveIcon size="14px" color="rgb(237, 129, 49)" />,
      properties: [
        { key: 'batch', label: 'Batch ID', value: stampValue, raw: folder.batchId.toString() },
        { key: 'drive', label: 'Drive', value: truncateNameMiddle(driveName, 35, 10, 10) },
        { key: 'redundancy', label: 'Redundancy', value: redundancyLabel },
      ],
    },
  ]
}

export async function buildGetInfoGroups(
  fm: FileManagerBase,
  fi: FileRecord,
  driveName: string,
  stamp?: PostageBatch,
): Promise<FilePropertyGroup[]> {
  const cm = fi.customMetadata as KnownCustomMeta | undefined
  const size = cm?.size
  const mime = cm?.mime
  // Location = the folder that holds the file, derived from the record's real path (authoritative),
  // not customMetadata.path (which single-file uploads don't set). Root files show just the drive name.
  const parentPath = fi.path.includes('/') ? fi.path.slice(0, fi.path.lastIndexOf('/')) : ''
  const path = parentPath ? `${driveName}/${parentPath}` : driveName
  const fileCount = cm?.fileCount
  const expires = cm?.expiresAt || stamp?.duration.toEndDate().toLocaleDateString()

  const [createdTs, granteeCount] = await Promise.all([getCreatedTs(fm, fi), getGranteeCount(fm, fi)])

  return [
    buildGeneralGroup(fi, mime, size, path, fileCount),
    buildDatesGroup(createdTs, fi.timestamp, expires),
    buildAccessGroup(fi, granteeCount),
    buildStorageGroup(fi, driveName, stamp),
  ]
}

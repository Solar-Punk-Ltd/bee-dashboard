import type { ReactElement } from 'react'
import { FileStatus, FileInfo, FileManagerBase } from '@solarpunkltd/file-manager-lib'
import { GetGranteesResult } from '@ethersphere/bee-js'

import GeneralIcon from 'remixicon-react/FileTextLineIcon'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import AccessIcon from 'remixicon-react/ShieldKeyholeLineIcon'
import HardDriveIcon from 'remixicon-react/HardDrive2LineIcon'
import { indexStrToBigint } from '../../utils/common'
import { FEED_INDEX_ZERO } from '../../constants/constants'

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

const truncateMiddle = (s?: string, start = 10, end = 8) => {
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

async function getCreatedTs(fm: FileManagerBase, fi: FileInfo): Promise<number | undefined> {
  try {
    const v0 = await fm.getVersion(fi, FEED_INDEX_ZERO.toString())

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

export async function getGranteeCount(fm: FileManagerBase, fi: FileInfo): Promise<number | undefined> {
  try {
    const result = await fm.getGrantees(fi)

    return extractGranteeCount(result)
  } catch {
    return undefined
  }
}

function buildGeneralGroup(
  fi: FileInfo,
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
      { key: 'size', label: 'Size', value: size != null ? formatBytes(size) : dash },
      { key: 'count', label: 'Items', value: fileCount ?? '1' },
      { key: 'path', label: 'Location', value: path || dash },
      {
        key: 'hash',
        label: 'Swarm hash',
        value: truncateMiddle(fi.file.reference.toString()),
        raw: fi.file.reference.toString(),
      },
      {
        key: 'topic',
        label: 'Topic',
        value: truncateMiddle(fi.topic.toString()),
        raw: fi.topic.toString(),
      },
      { key: 'ver', label: 'Versions', value: ((indexStrToBigint(fi.version) ?? BigInt(0)) + BigInt(1)).toString() },
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
      { key: 'accessed', label: 'Last Accessed', value: dash },
      { key: 'expires', label: 'Expires', value: expires ?? dash },
    ],
  }
}

function buildAccessGroup(fi: FileInfo, granteeCount?: number): FilePropertyGroup {
  return {
    title: 'Access & Permissions',
    icon: <AccessIcon size="14px" color="rgb(237, 129, 49)" />,
    properties: [
      {
        key: 'owner',
        label: 'Owner',
        value: truncateMiddle(fi.owner.toString(), 12, 8),
        raw: fi.owner.toString(),
      },
      { key: 'shared', label: 'Sharing', value: fi.shared ? 'Shared' : 'Private' },
      { key: 'grantees', label: 'Grantees', value: granteeCount != null ? `${granteeCount}` : dash },
      {
        key: 'actpub',
        label: 'ACT Publisher',
        value: truncateMiddle(fi.actPublisher.toString(), 12, 8),
        raw: fi.actPublisher.toString(),
      },
      {
        key: 'historyRef',
        label: 'ACT History',
        value: truncateMiddle(fi.file.historyRef.toString(), 12, 8),
        raw: fi.file.historyRef.toString(),
      },
    ],
  }
}

function buildStorageGroup(fi: FileInfo, driveName: string): FilePropertyGroup {
  return {
    title: 'Storage',
    icon: <HardDriveIcon size="14px" color="rgb(237, 129, 49)" />,
    properties: [
      {
        key: 'batch',
        label: 'Batch ID',
        value: truncateMiddle(fi.batchId.toString(), 12, 10),
        raw: fi.batchId.toString(),
      },
      { key: 'drive', label: 'Drive', value: driveName },
      { key: 'redundancy', label: 'Redundancy', value: fi.redundancyLevel?.toString() ?? dash },
    ],
  }
}

export async function buildGetInfoGroups(
  fm: FileManagerBase,
  fi: FileInfo,
  driveName: string,
): Promise<FilePropertyGroup[]> {
  const cm = fi.customMetadata as KnownCustomMeta | undefined
  const size = cm?.size
  const mime = cm?.mime
  const path = cm?.path
  const fileCount = cm?.fileCount
  const expires = cm?.expiresAt

  const [createdTs, granteeCount] = await Promise.all([getCreatedTs(fm, fi), getGranteeCount(fm, fi)])

  return [
    buildGeneralGroup(fi, mime, size, path, fileCount),
    buildDatesGroup(createdTs, fi.timestamp, expires),
    buildAccessGroup(fi, granteeCount),
    buildStorageGroup(fi, driveName),
  ]
}

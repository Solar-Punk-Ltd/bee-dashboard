import type { ReactElement } from 'react'
import type { FileInfo, FileManagerBase } from '@solarpunkltd/file-manager-lib'
import type { GetGranteesResult } from '@ethersphere/bee-js'

import GeneralIcon from 'remixicon-react/FileTextLineIcon'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import AccessIcon from 'remixicon-react/ShieldKeyholeLineIcon'
import HardDriveIcon from 'remixicon-react/HardDrive2LineIcon'

export type FileProperty = { key: string; label: string; value: string; raw?: string }
export type FilePropertyGroup = { title: string; icon?: ReactElement; properties: FileProperty[] }

type KnownCustomMeta = Record<string, string> & {
  size?: string
  mime?: string
  path?: string
  fileCount?: string
  expiresAt?: string
}

type FileInfoExtra = {
  owner?: string
  actPublisher?: string
  batchId?: string | { toString(): string }
  redundancyLevel?: number
  status?: string | number
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
  if (!Number.isFinite(ts as number) || !ts) return dash
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return dash
  }
}

const statusLabel = (s: unknown) => {
  if (s == null) return 'active'

  if (typeof s === 'string') return s

  if (typeof s === 'number') return s === 0 ? 'active' : 'trashed'

  return String(s)
}

async function getCreatedTs(fm: FileManagerBase, fi: FileInfo): Promise<number | undefined> {
  try {
    const v0 = await fm.getVersion(fi, '0')

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

export async function getGranteeCount(
  fm: Pick<FileManagerBase, 'getGrantees'>,
  fi: FileInfo,
): Promise<number | undefined> {
  if (!fm.getGrantees) return undefined
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
  status?: string | number,
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
        value: fi.file?.reference ? truncateMiddle(String(fi.file.reference)) : dash,
        raw: fi.file?.reference ? String(fi.file.reference) : undefined,
      },
      {
        key: 'topic',
        label: 'Topic',
        value: fi.topic ? truncateMiddle(String(fi.topic)) : dash,
        raw: fi.topic ? String(fi.topic) : undefined,
      },
      { key: 'ver', label: 'Versions', value: (BigInt(fi.version ?? '0') + BigInt(1)).toString() },
      { key: 'status', label: 'Status', value: statusLabel(status) },
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
      { key: 'accessed', label: 'Last Accessed', value: '—' },
      { key: 'expires', label: 'Expires', value: expires ?? '—' },
    ],
  }
}

function buildAccessGroup(fi: FileInfo & FileInfoExtra, granteeCount?: number): FilePropertyGroup {
  const owner = fi.owner
  const actPublisher = fi.actPublisher
  const historyRef = fi.file?.historyRef

  return {
    title: 'Access & Permissions',
    icon: <AccessIcon size="14px" color="rgb(237, 129, 49)" />,
    properties: [
      {
        key: 'owner',
        label: 'Owner',
        value: owner ? truncateMiddle(String(owner), 12, 8) : '—',
        raw: owner ? String(owner) : undefined,
      },
      { key: 'shared', label: 'Sharing', value: fi.shared ? 'Shared' : 'Private' },
      { key: 'grantees', label: 'Grantees', value: granteeCount != null ? `${granteeCount}` : '—' },
      {
        key: 'actpub',
        label: 'ACT Publisher',
        value: actPublisher ? truncateMiddle(String(actPublisher), 12, 8) : '—',
        raw: actPublisher ? String(actPublisher) : undefined,
      },
      {
        key: 'historyRef',
        label: 'ACT History',
        value: historyRef ? truncateMiddle(String(historyRef)) : '—',
        raw: historyRef ? String(historyRef) : undefined,
      },
    ],
  }
}

function buildStorageGroup(fi: FileInfo & FileInfoExtra, driveLabel?: string): FilePropertyGroup {
  const batchId = fi.batchId
  const redundancyLevel = fi.redundancyLevel

  return {
    title: 'Storage',
    icon: <HardDriveIcon size="14px" color="rgb(237, 129, 49)" />,
    properties: [
      {
        key: 'batch',
        label: 'Batch ID',
        value: batchId ? truncateMiddle(String(batchId), 12, 10) : '—',
        raw: batchId ? String(batchId) : undefined,
      },
      { key: 'drive', label: 'Drive', value: driveLabel ?? '—' },
      { key: 'redundancy', label: 'Redundancy', value: redundancyLevel != null ? String(redundancyLevel) : '—' },
    ],
  }
}

export async function buildGetInfoGroups(
  fm: FileManagerBase,
  fi: FileInfo,
  opts?: { driveLabel?: string },
): Promise<FilePropertyGroup[]> {
  const cm = fi.customMetadata as KnownCustomMeta | undefined
  const size = cm?.size
  const mime = cm?.mime
  const path = cm?.path
  const fileCount = cm?.fileCount
  const expires = cm?.expiresAt

  const [createdTs, granteeCount] = await Promise.all([getCreatedTs(fm, fi), getGranteeCount(fm, fi)])
  const fiExtra = fi as FileInfo & FileInfoExtra

  return [
    buildGeneralGroup(fi, mime, size, path, fileCount, fiExtra.status),
    buildDatesGroup(createdTs, fi.timestamp, expires),
    buildAccessGroup(fiExtra, granteeCount),
    buildStorageGroup(fiExtra, opts?.driveLabel),
  ]
}

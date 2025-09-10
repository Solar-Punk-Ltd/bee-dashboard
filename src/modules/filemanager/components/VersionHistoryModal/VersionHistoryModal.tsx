import { ReactElement, useEffect, useMemo, useState, useCallback } from 'react'
import './VersionHistoryModal.scss'
import '../../styles/global.scss'

import { FMButton } from '../FMButton/FMButton'
import { createPortal } from 'react-dom'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import HistoryIcon from 'remixicon-react/HistoryLineIcon'
import UserIcon from 'remixicon-react/UserLineIcon'
import DownloadIcon from 'remixicon-react/Download2LineIcon'

import { useFM } from '../../providers/FMContext'
import type { FileInfo, FileManager, ReferenceWithPath, FileInfoOptions } from '@solarpunkltd/file-manager-lib'
import type { FeedIndex } from '@ethersphere/bee-js'
import { useFMTransfers } from '../../hooks/useFMTransfers'
import { useUploadConflictDialog } from '../../hooks/useUploadConflictDialog'
import { ConfirmModal } from '../ConfirmModal/ConfirmModal'

const HEX_INDEX_BYTES = 8
const HEX_INDEX_CHARS = HEX_INDEX_BYTES * 2

const toHexIndexStr = (i: bigint): string => `0x${i.toString(16).padStart(HEX_INDEX_CHARS, '0')}`
const padIndexHex = (hexNoPrefix: string): string => {
  const h = hexNoPrefix.toLowerCase()

  return h.length >= HEX_INDEX_CHARS ? h : h.padStart(HEX_INDEX_CHARS, '0')
}
const toHexIndex = (v?: string | number | bigint): string | undefined => {
  if (v == null || v === '') return undefined
  const s = String(v)

  return s.startsWith('0x') ? `0x${padIndexHex(s.slice(2))}` : `0x${padIndexHex(BigInt(s).toString(16))}`
}
const parseIndex = (v: unknown): bigint | null => {
  try {
    if (v == null) return null

    if (typeof v === 'bigint') return v
    const s = String(v).trim()

    return BigInt(s)
  } catch {
    return null
  }
}
const safeStr = (x: unknown): string => {
  try {
    const s = (x as { toString?: () => string })?.toString?.() ?? String(x ?? '')

    return s !== '[object Object]' ? s : ''
  } catch {
    return ''
  }
}
const sameTopic = (a?: FileInfo, b?: FileInfo): boolean => {
  try {
    return a?.topic?.toString?.() === b?.topic?.toString?.()
  } catch {
    return false
  }
}
const keyOf = (fi: FileInfo): string => {
  const t = fi.topic?.toString?.() ?? ''
  const idx = parseIndex(fi.version)
  const idxHex = idx != null ? toHexIndexStr(idx) : String(fi.version ?? '').toLowerCase()

  return `${t}:${idxHex}`
}
const getHeadByTopic = (list: FileInfo[], topic?: unknown): FileInfo | null => {
  try {
    const t = (topic as { toString?: () => string } | undefined)?.toString?.()

    if (!t) return null
    const same = list.filter(f => f.topic?.toString?.() === t)

    if (!same.length) return null

    return same.reduce((a, b) => (BigInt(a.version ?? '0') >= BigInt(b.version ?? '0') ? a : b))
  } catch {
    return null
  }
}

type BeeAddresses = { publicKey?: string }
type BeeLike = { getNodeAddresses?: () => Promise<BeeAddresses> }
type FMWithBee = FileManager & { bee?: BeeLike }

type BeeBytes = { toUint8Array: () => Uint8Array }
const hasToUint8Array = (x: unknown): x is BeeBytes =>
  typeof x === 'object' && x !== null && typeof (x as BeeBytes).toUint8Array === 'function'
type HasGetReader = { getReader: () => ReadableStreamDefaultReader<Uint8Array> }
const hasGetReader = (x: unknown): x is HasGetReader =>
  typeof x === 'object' && x !== null && 'getReader' in (x as HasGetReader)
type HasArrayBuffer = { arrayBuffer: () => Promise<ArrayBuffer> }
const hasArrayBufferFn = (x: unknown): x is HasArrayBuffer =>
  typeof x === 'object' && x !== null && 'arrayBuffer' in (x as HasArrayBuffer)
type HasBlob = { blob: () => Promise<Blob> }
const hasBlobFn = (x: unknown): x is HasBlob => typeof x === 'object' && x !== null && 'blob' in (x as HasBlob)

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let res = await reader.read()
  while (!res.done) {
    if (res.value) {
      chunks.push(res.value)
      total += res.value.byteLength
    }
    res = await reader.read()
  }
  reader.releaseLock()
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }

  return out
}

type DownloadPart = Blob | Uint8Array | BeeBytes | ReadableStream<Uint8Array> | HasArrayBuffer | HasBlob

async function normalizeToBlob(part: DownloadPart, mime?: string): Promise<Blob> {
  const type = mime || 'application/octet-stream'

  if (part instanceof Blob) return part

  if (hasToUint8Array(part)) return new Blob([part.toUint8Array()], { type })

  if (part instanceof Uint8Array) return new Blob([part], { type })

  if (hasGetReader(part)) {
    const u8 = await streamToUint8Array(part as unknown as ReadableStream<Uint8Array>)

    return new Blob([u8], { type })
  }

  if (hasBlobFn(part)) {
    const b = await part.blob()

    return b.type ? b : new Blob([await b.arrayBuffer()], { type })
  }

  if (hasArrayBufferFn(part)) {
    const buf = await part.arrayBuffer()

    return new Blob([buf], { type })
  }
  throw new Error('Unsupported downloaded part type')
}

async function getCandidatePublishers(fm: FMWithBee, seed: FileInfo): Promise<string[]> {
  const out = new Set<string>()

  if (seed.actPublisher) out.add(String(seed.actPublisher))
  const beePub = await fm.bee?.getNodeAddresses?.()

  if (beePub?.publicKey) out.add(String(beePub.publicKey))
  const list = fm.fileInfoList || []
  for (const f of list) {
    if (sameTopic(f, seed) && f.actPublisher) out.add(String(f.actPublisher))
  }

  return Array.from(out)
}

async function hydrateWithPublishers(
  fmLike: Pick<FileManager, 'getVersion'>,
  fmFull: FMWithBee,
  seed: FileInfo,
  version?: string,
): Promise<FileInfo> {
  const pubs = await getCandidatePublishers(fmFull, seed)
  for (const p of pubs) {
    const variant: FileInfo = { ...seed, actPublisher: p }
    try {
      const res = await fmLike.getVersion(
        variant,
        (version as unknown as FeedIndex) || (seed.version as unknown as FeedIndex),
      )

      return res
    } catch {
      /* try next publisher */
    }
  }

  return fmLike.getVersion(seed, (version as unknown as FeedIndex) || (seed.version as unknown as FeedIndex))
}

type ConflictChoice = { action: 'keep-both' | 'replace' | 'cancel'; newName?: string }

interface VersionHistoryModalProps {
  fileInfo: FileInfo
  onCancelClick: () => void
}
type FMContextLike = {
  fm?: FileManager | null
  refreshFiles?: () => void | Promise<void>
  files?: FileInfo[]
  currentBatch?: { batchID: { toString(): string } } | null
}
type RestoreDebug = {
  name?: string
  topicStr: string
  ownerRaw: string
  ownerStr: string
  ownerLooksEth: boolean
  idxRaw: string
  idxHex?: string
  hasFileRef: boolean
  hasHistoryRef: boolean
  headTopic: string
  headOwner: string
}

const truncateMiddle = (s: string, max = 42): string => {
  const str = String(s || '')

  if (str.length <= max) return str
  const half = Math.floor((max - 1) / 2)

  return `${str.slice(0, half)}…${str.slice(-half)}`
}

function ErrorPanel({ error, debug }: { error: string | null; debug: RestoreDebug | null }) {
  if (!error) return null

  return (
    <div className="fm-modal-white-section fm-soft-text">
      {error}
      {debug && (
        <pre
          style={{
            marginTop: 8,
            maxHeight: 220,
            overflow: 'auto',
            background: '#111',
            color: '#eee',
            padding: 8,
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          {JSON.stringify(debug, null, 2)}
        </pre>
      )}
    </div>
  )
}

function LoadingPanel({ loading }: { loading: boolean }) {
  if (!loading) return null

  return <div className="fm-loading">Loading…</div>
}

function EmptyPanel({ show }: { show: boolean }) {
  if (!show) return null

  return <div className="fm-empty">No versions found for this file.</div>
}

function ConflictWarningPanel({ text }: { text: string | null }) {
  if (!text) return null

  return (
    <div className="fm-modal-white-section fm-soft-text" style={{ borderLeft: '3px solid var(--fm-accent, #6aa7ff)' }}>
      {text}
    </div>
  )
}

type RenameConfirmState = {
  version: FileInfo
  headName: string
  targetName: string
} | null

function RenameConfirmDialog({
  data,
  onConfirm,
  onCancel,
}: {
  data: RenameConfirmState
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}) {
  if (!data) return null

  return (
    <ConfirmModal
      title="Restore this version?"
      message={
        <>
          Restoring will rename:&nbsp;
          <b className="vh-name" title={data.headName}>
            {truncateMiddle(data.headName, 44)}
          </b>{' '}
          →{' '}
          <b className="vh-name" title={data.targetName}>
            {truncateMiddle(data.targetName, 44)}
          </b>
          .
        </>
      }
      confirmLabel="Restore"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

function VersionsList({
  versions,
  headFi,
  downloadBlob,
  getVersionBlob,
  restoreVersion,
}: {
  versions: FileInfo[]
  headFi: FileInfo | null
  downloadBlob: ReturnType<typeof useFMTransfers>['downloadBlob']
  getVersionBlob: (fi: FileInfo) => Promise<Blob>
  restoreVersion: (fi: FileInfo) => Promise<void>
}) {
  if (!versions.length) return null

  return (
    <div className="fm-version-history-list">
      {versions.map(item => {
        const vStr = item.version ?? '0'
        const idx = parseIndex(vStr) ?? BigInt(0)
        const isCurrent = (parseIndex(headFi?.version) ?? BigInt(0)) === idx
        const modified = item.timestamp != null ? new Date(item.timestamp).toLocaleString() : '—'
        const key = `${item.topic?.toString?.() ?? ''}:${toHexIndexStr(idx)}`
        const willRename = (headFi?.name || '') !== (item.name || '')

        return (
          <div key={key} className="fm-modal-white-section vh-row">
            <div className="vh-left">
              <div className="vh-meta">
                <span className="vh-chip" title={`Version ${idx.toString()}`}>
                  v{idx.toString()}
                </span>
                {isCurrent && <span className="vh-tag vh-tag--current">Current</span>}
                <span className="vh-dot">•</span>
                <span className="vh-meta-item" title={modified}>
                  <CalendarIcon size="12" /> {modified}
                </span>
                <span className="vh-dot">•</span>
                <span className="vh-meta-item" title="Publisher">
                  <UserIcon size="12" />
                </span>
              </div>

              {willRename && !isCurrent && (
                <div
                  className="vh-rename"
                  title={`Restoring will rename: “${headFi?.name || ''}” → “${item.name || ''}”`}
                >
                  Restoring will rename:{' '}
                  <b className="vh-name" title={headFi?.name || ''}>
                    {truncateMiddle(headFi?.name || '', 44)}
                  </b>{' '}
                  →{' '}
                  <b className="vh-name" title={item.name || ''}>
                    {truncateMiddle(item.name || '', 44)}
                  </b>
                </div>
              )}
            </div>

            <div className="vh-actions">
              <FMButton
                label="Download"
                variant="secondary"
                icon={<DownloadIcon size="15" />}
                onClick={() =>
                  downloadBlob(item.name || 'download', getVersionBlob(item), {
                    size: item.customMetadata?.size,
                  })
                }
              />
              {!isCurrent && <FMButton label="Restore" variant="primary" onClick={() => void restoreVersion(item)} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function VersionHistoryModal({ fileInfo, onCancelClick }: VersionHistoryModalProps): ReactElement {
  const { fm, refreshFiles, files, currentBatch } = useFM() as unknown as FMContextLike
  const fmTyped: FileManager | null = (fm || null) as FileManager | null
  const fmWithBee: FMWithBee | null = (fm || null) as FMWithBee | null

  const { downloadBlob } = useFMTransfers()
  const [openConflict, conflictPortal] = useUploadConflictDialog()
  const modalRoot = document.querySelector('.fm-main') || document.body

  const [restoreDebug, setRestoreDebug] = useState<RestoreDebug | null>(null)
  const [allVersions, setAllVersions] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflictWarning, setConflictWarning] = useState<string | null>(null)

  const [renameConfirm, setRenameConfirm] = useState<RenameConfirmState>(null)

  const pageSize = 5
  const [currentPage, setCurrentPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(allVersions.length / pageSize))
  const pageVersions = useMemo(
    () => allVersions.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [allVersions, currentPage],
  )
  const hasPrev = currentPage > 0
  const hasNext = currentPage + 1 < totalPages

  const headFi = useMemo<FileInfo | null>(() => {
    if (!fmTyped) return null

    return getHeadByTopic(fmTyped.fileInfoList || [], fileInfo.topic) || fileInfo
  }, [fmTyped, fileInfo])

  const headIdx = useMemo<bigint>(() => parseIndex(headFi?.version) ?? BigInt(0), [headFi])
  const headTopicStr = useMemo(() => headFi?.topic?.toString?.() ?? '', [headFi])

  const enumerateAll = useCallback(async (): Promise<FileInfo[]> => {
    if (!fmTyped || !headFi) return []
    const rows: FileInfo[] = []
    const seen = new Set<string>()
    const pushUnique = (fi: FileInfo): void => {
      const k = keyOf(fi)

      if (!seen.has(k)) {
        rows.push(fi)
        seen.add(k)
      }
    }

    const headAnchor: FileInfo = { ...headFi, version: toHexIndexStr(headIdx) }
    pushUnique(headFi)

    const MAX_RELATIVE = 2048
    for (let off = 1; off <= MAX_RELATIVE; off++) {
      try {
        const v = await fmTyped.getVersion(headAnchor, String(off) as unknown as FeedIndex)

        if (!v) break
        pushUnique(v)
      } catch {
        break
      }
    }

    if (rows.length === 1 && headIdx > BigInt(0)) {
      let misses = 0
      const MAX_MISSES = 8
      const HARD_LIMIT = 4096
      for (let i = headIdx - BigInt(1); i >= BigInt(0) && rows.length < HARD_LIMIT; i--) {
        const hex = toHexIndexStr(i)
        let ok = false
        try {
          pushUnique(await fmTyped.getVersion(headAnchor, hex as unknown as FeedIndex))
          ok = true
        } catch {
          try {
            pushUnique(await fmTyped.getVersion(headAnchor, i.toString() as unknown as FeedIndex))
            ok = true
          } catch {
            ok = false
          }
        }

        if (ok) misses = 0
        else if (++misses >= MAX_MISSES) break
      }
    }

    return rows
  }, [fmTyped, headFi, headIdx])

  const getVersionBlob = useCallback(
    async (fi: FileInfo): Promise<Blob> => {
      if (!fmTyped || !fmWithBee) throw new Error('FileManager not available')
      const idx = parseIndex(fi.version) ?? BigInt(0)
      const versionParam = toHexIndexStr(idx)
      const anchor: FileInfo = { ...fi, version: versionParam }

      const hydrated = await hydrateWithPublishers(
        { getVersion: fmTyped.getVersion.bind(fmTyped) },
        fmWithBee,
        anchor,
        versionParam,
      )

      const pubs = await getCandidatePublishers(fmWithBee, anchor)
      const toDownload: FileInfo = hydrated.actPublisher
        ? hydrated
        : { ...hydrated, actPublisher: pubs[0] || hydrated.actPublisher }

      const mime = toDownload.customMetadata?.mime || 'application/octet-stream'

      let paths: string[] | undefined
      try {
        const list: ReferenceWithPath[] = await fmTyped.listFiles(toDownload)

        if (list.length > 0) {
          const baseName = toDownload.name || ''
          const matching = list.find(e => e.path === baseName || e.path.endsWith('/' + baseName))
          paths = matching ? [matching.path] : list.map(e => e.path)
        }
      } catch {
        paths = undefined
      }

      const res = await fmTyped.download(toDownload, paths)
      const arr = Array.isArray(res) ? res : [res]

      if (arr.length === 0) throw new Error('No content returned')

      const blobs = await Promise.all(arr.map(p => normalizeToBlob(p as DownloadPart, mime)))

      if (blobs.length === 1) return blobs[0]

      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const names = Array.isArray(paths) && paths.length === blobs.length ? paths : blobs.map((_, i) => `file-${i}`)
      await Promise.all(blobs.map(async (b, i) => zip.file(names[i], await b.arrayBuffer())))

      return zip.generateAsync({ type: 'blob' })
    },
    [fmTyped, fmWithBee],
  )

  useEffect(() => {
    setCurrentPage(0)
    setError(null)

    if (!fmTyped || !headFi) {
      setAllVersions([])

      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const list = await enumerateAll()

        if (!cancelled) setAllVersions(list)
      } catch {
        if (!cancelled) setError('Failed to load version history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fmTyped, headFi, enumerateAll])

  const getBatchIdStr = useCallback(
    (fi: FileInfo): string | undefined => {
      if (fi.batchId != null) return String(fi.batchId)

      const metaBatch = fi.customMetadata?.batchId

      if (metaBatch) return String(metaBatch)

      if (currentBatch) return currentBatch.batchID.toString()

      return undefined
    },
    [currentBatch],
  )

  const [openConflictDialog] = [openConflict]

  const promptUniqueName = useCallback(
    async (
      initial: string,
      taken: Set<string>,
      forbidReplaceMsg: string,
      maxAttempts = 6,
    ): Promise<{ cancelled: boolean; name?: string }> => {
      let proposed = initial
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const choice = (await openConflictDialog({
          originalName: proposed,
          existingNames: taken,
        })) as ConflictChoice

        if (!choice || choice.action === 'cancel') return { cancelled: true }

        if (choice.action === 'keep-both') {
          const candidate = (choice.newName || '').trim()

          if (candidate && !taken.has(candidate)) {
            return { cancelled: false, name: candidate }
          }
          setConflictWarning('That name is already taken. Please enter a different one.')
          proposed = candidate || proposed
        } else {
          setConflictWarning(forbidReplaceMsg)
        }
      }

      return { cancelled: true }
    },
    [openConflictDialog],
  )

  const restoreAcrossHistoryAsCopy = useCallback(
    async (versionFi: FileInfo, finalName: string): Promise<boolean> => {
      if (!fmTyped || !fmWithBee) return false
      const batchId = getBatchIdStr(versionFi)

      if (!batchId) {
        setError('Failed to restore: could not resolve drive (stamp) for this file.')

        return false
      }

      const idx = parseIndex(versionFi.version) ?? BigInt(0)
      const versionParam = toHexIndexStr(idx)
      const anchor: FileInfo = { ...versionFi, version: versionParam }

      const hydrated = await hydrateWithPublishers(
        { getVersion: fmTyped.getVersion.bind(fmTyped) },
        fmWithBee,
        anchor,
        versionParam,
      )

      const ref = hydrated.file?.reference
      const histRef = hydrated.file?.historyRef

      if (!ref || !histRef) {
        setError('Failed to restore: selected version has no content references.')

        return false
      }

      const payload: FileInfoOptions = {
        info: {
          batchId: String(batchId),
          name: finalName,
          file: {
            reference: typeof ref === 'string' ? ref : ref.toString(),
            historyRef: typeof histRef === 'string' ? histRef : histRef.toString(),
          },
          customMetadata: hydrated.customMetadata ?? {},
        },
      }

      try {
        await fmTyped.upload(payload)
        await Promise.resolve(refreshFiles?.())
        onCancelClick()

        return true
      } catch {
        setError('Failed to restore this version')

        return false
      }
    },
    [fmTyped, fmWithBee, getBatchIdStr, refreshFiles, onCancelClick],
  )

  const restoreWithinSameHistory = useCallback(
    async (versionFi: FileInfo): Promise<void> => {
      if (!fmTyped) return

      const resolveOwnerRaw = (): string =>
        safeStr(versionFi.owner) ||
        safeStr(headFi?.owner) ||
        safeStr((fmTyped as unknown as { owner?: string }).owner) ||
        safeStr((fmTyped as unknown as { address?: string }).address) ||
        safeStr((fmTyped as unknown as { signerAddress?: string }).signerAddress)

      const normalizeOwnerHexLocal = (s: string): string => {
        const HEX40 = /^[0-9a-fA-F]{40}$/
        const ETH_RE = /^0x[0-9a-fA-F]{40}$/
        const t = s.trim()

        if (ETH_RE.test(t)) return t

        if (HEX40.test(t)) return `0x${t.toLowerCase()}`

        return t
      }

      const validateInputs = (
        topicStr: string,
        ownerStr: string,
        fileRef?: unknown,
        histRef?: unknown,
      ): string | null => {
        if (!topicStr) return 'Failed to restore: could not resolve feed topic.'

        if (!ownerStr || !/^0x[0-9a-fA-F]{40}$/.test(ownerStr)) {
          return 'Failed to restore: owner address is not a valid Ethereum address.'
        }

        if (!fileRef || !histRef) return 'Failed to restore: missing file reference(s) on the selected version.'

        return null
      }

      const shouldUseFallback = (e: unknown): boolean => {
        const errObj = e as Error
        const msg = String(errObj?.message || e || '')
        const stack = errObj?.stack || ''

        return (
          /uint8ArrayToHex|Bytes\.toHex|FeedIndex\.equals/i.test(stack) ||
          /Cannot read properties of undefined \(reading 'toString'\)/i.test(msg)
        )
      }

      const mapError = (msg: string): string => {
        if (/postage|batch|stamp|insufficient/i.test(msg)) {
          return 'Failed to restore: need a valid postage stamp on this drive.'
        }

        if (/feed.*not.*found/i.test(msg)) return 'Failed to restore: feed not found for this owner/topic.'

        if (/has to be defined|version.*defined/i.test(msg)) {
          return 'Failed to restore: version index was not resolved.'
        }

        return 'Failed to restore this version'
      }

      const buildFallbackPayload = (batchId: string): FileInfoOptions => ({
        info: {
          batchId,
          name: versionFi.name,
          topic: topicStr,
          file: {
            reference:
              typeof versionFi.file.reference === 'string'
                ? versionFi.file.reference
                : versionFi.file.reference.toString(),
            historyRef:
              typeof versionFi.file.historyRef === 'string'
                ? versionFi.file.historyRef
                : versionFi.file.historyRef.toString(),
          },
          customMetadata: versionFi.customMetadata ?? {},
        },
      })

      const doRefreshAndClose = async () => {
        await Promise.resolve(refreshFiles?.())
        onCancelClick()
      }

      const topicStr = safeStr(versionFi.topic) || safeStr(headFi?.topic) || safeStr(fileInfo.topic)
      const ownerRaw = resolveOwnerRaw()
      const ownerStr = normalizeOwnerHexLocal(ownerRaw)
      const idxHex = toHexIndex(versionFi.version ?? '0') || toHexIndex(0)
      const fileRef = versionFi.file?.reference
      const histRef = versionFi.file?.historyRef

      setRestoreDebug({
        name: versionFi.name,
        topicStr,
        ownerRaw,
        ownerStr,
        ownerLooksEth: /^0x[0-9a-fA-F]{40}$/.test(ownerStr),
        idxRaw: String(versionFi.version ?? ''),
        idxHex,
        hasFileRef: Boolean(fileRef),
        hasHistoryRef: Boolean(histRef),
        headTopic: safeStr(headFi?.topic),
        headOwner: safeStr(headFi?.owner),
      })

      const err = validateInputs(topicStr, ownerStr, fileRef, histRef)

      if (err) {
        setError(err)

        return
      }

      const fixed: FileInfo = { ...versionFi, topic: topicStr, owner: ownerStr, version: idxHex }

      try {
        await fmTyped.restoreVersion(fixed)
        await doRefreshAndClose()

        return
      } catch (e) {
        if (shouldUseFallback(e)) {
          const batchId =
            (versionFi.batchId && String(versionFi.batchId)) ||
            (headFi?.batchId && String(headFi.batchId)) ||
            currentBatch?.batchID?.toString()

          if (!batchId) {
            setError('Failed to restore this version')

            return
          }

          try {
            await fmTyped.upload(buildFallbackPayload(batchId))
            await doRefreshAndClose()

            return
          } catch {
            // fall through to generic error mapping below
          }
        }

        const msg = String((e as Error)?.message || e || '')
        setError(mapError(msg))
      }
    },
    [fmTyped, headFi, fileInfo, refreshFiles, onCancelClick, currentBatch],
  )

  const restoreVersion = useCallback(
    async (versionFi: FileInfo): Promise<void> => {
      if (!fmTyped) return

      const targetName = versionFi.name || ''
      const headName = headFi?.name || ''
      const headTopic = headTopicStr

      const batchWanted = currentBatch?.batchID?.toString?.() ?? getBatchIdStr(versionFi)
      const sameDrive = (files || []).filter(fi => {
        const b = String(fi.batchId ?? '')

        return Boolean(batchWanted) && b === batchWanted
      })

      const nameConflicts = sameDrive.filter(fi => (fi.name || '') === targetName)
      const otherHistoryConflicts = nameConflicts.filter(fi => (fi.topic?.toString?.() ?? '') !== headTopic)

      if (targetName && headName && targetName !== headName && otherHistoryConflicts.length === 0) {
        setRenameConfirm({ version: versionFi, headName, targetName })

        return
      }

      if (otherHistoryConflicts.length > 0) {
        const taken = new Set<string>(sameDrive.map(fi => fi.name || ''))
        const forbidMsg =
          'Replace is not available because another file with that name belongs to a different history. Please choose “Keep both” and enter a different name.'
        const res = await promptUniqueName(targetName, taken, forbidMsg, 8)

        if (res.cancelled || !res.name) return
        const ok = await restoreAcrossHistoryAsCopy(versionFi, res.name)

        if (ok) return
      }

      await restoreWithinSameHistory(versionFi)
    },
    [
      fmTyped,
      headFi?.name,
      headTopicStr,
      currentBatch?.batchID,
      files,
      getBatchIdStr,
      promptUniqueName,
      restoreAcrossHistoryAsCopy,
      restoreWithinSameHistory,
    ],
  )

  const modalTitle = (
    <>
      Version history –{' '}
      <span className="vh-title" title={headFi?.name ?? fileInfo.name}>
        {truncateMiddle(headFi?.name ?? fileInfo.name, 56)}
      </span>
      {headFi && (
        <span className="vh-title-sub" title={`Version v${(parseIndex(headFi.version) ?? BigInt(0)).toString()}`}>
          {' '}
          (version v{(parseIndex(headFi.version) ?? BigInt(0)).toString()})
        </span>
      )}
    </>
  )

  const showEmpty = !error && !loading && pageVersions.length === 0

  return createPortal(
    <div className="fm-modal-container">
      {conflictPortal}
      <div className="fm-modal-window fm-upgrade-drive-modal">
        <div className="fm-modal-window-header">
          <HistoryIcon size="21px" />
          <span className="fm-main-font-color">{modalTitle}</span>
        </div>

        <div className="fm-modal-window-body fm-expiring-notification-modal-body">
          <ErrorPanel error={error} debug={restoreDebug} />
          <LoadingPanel loading={Boolean(loading)} />
          <EmptyPanel show={showEmpty} />
          <ConflictWarningPanel text={conflictWarning} />

          <RenameConfirmDialog
            data={renameConfirm}
            onConfirm={async () => {
              if (renameConfirm) {
                await restoreWithinSameHistory(renameConfirm.version)
                setRenameConfirm(null)
              }
            }}
            onCancel={() => setRenameConfirm(null)}
          />

          <VersionsList
            versions={!error && !loading ? pageVersions : []}
            headFi={headFi}
            downloadBlob={downloadBlob}
            getVersionBlob={getVersionBlob}
            restoreVersion={restoreVersion}
          />
        </div>

        <div className="fm-modal-window-footer vh-footer">
          <div className="vh-footer-left">
            <FMButton label="Close" variant="secondary" onClick={onCancelClick} />
          </div>
          <div className="vh-footer-right">
            <span className="vh-page">
              Page {Math.min(currentPage + 1, totalPages)} / {totalPages} · total {allVersions.length}
            </span>
            {hasPrev && <FMButton label="Previous" variant="secondary" onClick={() => setCurrentPage(p => p - 1)} />}
            {hasNext && <FMButton label="Next" variant="primary" onClick={() => setCurrentPage(p => p + 1)} />}
          </div>
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

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

import {
  toStr,
  parseIndexSafe,
  indexToHex8,
  normalizeToBlob,
  getCandidatePublishers,
  hydrateWithPublishers,
} from '../../utils/fm'
import type { DownloadPart } from '../../utils/fm'

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

const keyOf = (fi: FileInfo): string => {
  const t = toStr(fi.topic)
  const idx = parseIndexSafe(fi.version)
  const idxHex = indexToHex8(idx)

  return `${t}:${idxHex}`
}

const getHeadByTopic = (list: FileInfo[], topic?: unknown): FileInfo | null => {
  try {
    const t = toStr(topic)

    if (!t) return null
    const same = list.filter(f => toStr(f.topic) === t)

    if (!same.length) return null

    return same.reduce((a, b) => {
      const av = parseIndexSafe(a.version)
      const bv = parseIndexSafe(b.version)

      if (av === bv) {
        return Number(a.timestamp || 0) >= Number(b.timestamp || 0) ? a : b
      }

      return av > bv ? a : b
    })
  } catch {
    return null
  }
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
        const idx = parseIndexSafe(vStr)
        const isCurrent = parseIndexSafe(headFi?.version) === idx
        const modified = item.timestamp != null ? new Date(item.timestamp).toLocaleString() : '—'
        const key = `${toStr(item.topic)}:${indexToHex8(idx)}`
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
  const fmWithBee = (fm || null) as
    | (FileManager & { bee?: { getNodeAddresses?: () => Promise<{ publicKey?: string }> } })
    | null

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

  const headIdx = useMemo(() => parseIndexSafe(headFi?.version), [headFi])
  const headTopicStr = useMemo(() => toStr(headFi?.topic), [headFi])

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

    const headAnchor: FileInfo = { ...headFi, version: indexToHex8(headIdx) }
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
        const hex = indexToHex8(i)
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
      const idx = parseIndexSafe(fi.version)
      const versionParam = indexToHex8(idx)
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

      const idx = parseIndexSafe(versionFi.version)
      const versionParam = indexToHex8(idx)
      const anchor: FileInfo = { ...versionFi, version: versionParam }

      const hydrated = await hydrateWithPublishers(
        {
          getVersion: (fi: FileInfo, v: FeedIndex) => fmTyped.getVersion(fi, v as FeedIndex),
        },
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
            reference: typeof ref === 'string' ? ref : toStr(ref),
            historyRef: typeof histRef === 'string' ? histRef : toStr(histRef),
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
        toStr(versionFi.owner) ||
        toStr(headFi?.owner) ||
        toStr((fmTyped as unknown as { owner?: string }).owner) ||
        toStr((fmTyped as unknown as { address?: string }).address) ||
        toStr((fmTyped as unknown as { signerAddress?: string }).signerAddress)

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
              typeof versionFi.file.reference === 'string' ? versionFi.file.reference : toStr(versionFi.file.reference),
            historyRef:
              typeof versionFi.file.historyRef === 'string'
                ? versionFi.file.historyRef
                : toStr(versionFi.file.historyRef),
          },
          customMetadata: versionFi.customMetadata ?? {},
        },
      })

      const doRefreshAndClose = async () => {
        await Promise.resolve(refreshFiles?.())
        onCancelClick()
      }

      const topicStr = toStr(versionFi.topic) || toStr(headFi?.topic) || toStr(fileInfo.topic)
      const ownerRaw = resolveOwnerRaw()
      const ownerStr = normalizeOwnerHexLocal(ownerRaw)
      const idxHex = indexToHex8(parseIndexSafe(versionFi.version ?? '0'))
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
        headTopic: toStr(headFi?.topic),
        headOwner: toStr(headFi?.owner),
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
      const otherHistoryConflicts = nameConflicts.filter(fi => (toStr(fi.topic) ?? '') !== headTopic)

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
        <span className="vh-title-sub" title={`Version v${parseIndexSafe(headFi.version).toString()}`}>
          {' '}
          (version v{parseIndexSafe(headFi.version).toString()})
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

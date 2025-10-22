import { ReactElement, useState, useMemo, useEffect, useRef, useContext } from 'react'
import './AdminStatusBar.scss'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { Tooltip } from '../Tooltip/Tooltip'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { UpgradeDriveModal } from '../UpgradeDriveModal/UpgradeDriveModal'
import { calculateStampCapacityMetrics } from '../../utils/bee'
import { Context as FMContext } from '../../../../providers/FileManager'

interface AdminStatusBarProps {
  adminStamp: PostageBatch | null
  adminDrive: DriveInfo | null
  loading: boolean
  setErrorMessage?: (error: string) => void
}

export function AdminStatusBar({
  adminStamp,
  adminDrive,
  loading,
  setErrorMessage,
}: AdminStatusBarProps): ReactElement {
  const { setShowError, refreshStamp } = useContext(FMContext)

  const [isUpgradeDriveModalOpen, setIsUpgradeDriveModalOpen] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [actualStamp, setActualStamp] = useState<PostageBatch | null>(adminStamp)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setActualStamp(adminStamp)
  }, [adminStamp])

  useEffect(() => {
    if (!adminDrive) return

    const id = adminDrive.id.toString()
    const batchId = adminStamp?.batchID.toString() || ''

    const onStart = (e: Event) => {
      const { driveId } = (e as CustomEvent).detail || {}

      if (driveId === id) {
        setIsUpgrading(true)
      }
    }

    const onEnd = async (e: Event) => {
      const { driveId, success, error } = (e as CustomEvent).detail || {}

      if (!success) {
        if (error) {
          setErrorMessage?.(error)
        }

        setShowError(true)
      }

      if (driveId === id && batchId) {
        setIsUpgrading(false)

        const upgradedStamp = await refreshStamp(batchId)

        if (!isMountedRef.current) return

        if (upgradedStamp) {
          setActualStamp(upgradedStamp)
        }
      }
    }

    window.addEventListener('fm:drive-upgrade-start', onStart as EventListener)
    window.addEventListener('fm:drive-upgrade-end', onEnd as EventListener)

    return () => {
      window.removeEventListener('fm:drive-upgrade-start', onStart as EventListener)
      window.removeEventListener('fm:drive-upgrade-end', onEnd as EventListener)
    }
  }, [adminDrive, adminStamp?.batchID, setErrorMessage, setShowError, refreshStamp])

  const { capacityPct, usedSize, totalSize } = useMemo(
    () => calculateStampCapacityMetrics(actualStamp, adminDrive),
    [actualStamp, adminDrive],
  )

  const expiresAt = useMemo(
    () => (actualStamp ? actualStamp.duration.toEndDate().toLocaleDateString() : '—'),
    [actualStamp],
  )

  const isBusy = loading || isUpgrading
  const blurCls = isBusy ? ' is-loading' : ''

  return (
    <div className={`fm-admin-status-bar-container${blurCls}`} aria-busy={isBusy ? 'true' : 'false'}>
      <div className="fm-admin-status-bar-left">
        <div className="fm-drive-item-capacity">
          Capacity <ProgressBar value={capacityPct} width="150px" /> {usedSize} / {totalSize}
        </div>

        <div>File Manager Available: Until: {expiresAt}</div>

        <Tooltip
          label="The File Manager works only while your storage remains valid. If it expires, all catalogue metadata is
            permanently lost."
        />
      </div>

      {isUpgradeDriveModalOpen && actualStamp && adminDrive && (
        <UpgradeDriveModal
          stamp={actualStamp}
          drive={adminDrive}
          onCancelClick={() => setIsUpgradeDriveModalOpen(false)}
          setErrorMessage={setErrorMessage}
        />
      )}

      <div
        className="fm-admin-status-bar-upgrade-button"
        onClick={() => !isBusy && actualStamp && adminDrive && setIsUpgradeDriveModalOpen(true)}
        aria-disabled={isBusy ? 'true' : 'false'}
      >
        {isBusy ? 'Working…' : 'Manage'}
      </div>

      {loading && (
        <div className="fm-drive-item-creating-overlay" aria-live="polite">
          <div className="fm-mini-spinner" />
          <span>Creating admin drive...</span>
        </div>
      )}

      {isUpgrading && (
        <div className="fm-drive-item-creating-overlay" aria-live="polite">
          <div className="fm-mini-spinner" />
          <span>Upgrading admin drive…</span>
        </div>
      )}
    </div>
  )
}

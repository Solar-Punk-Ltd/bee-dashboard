import { ReactElement, useState, useMemo, useEffect } from 'react'
import './AdminStatusBar.scss'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { Tooltip } from '../Tooltip/Tooltip'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { UpgradeDriveModal } from '../UpgradeDriveModal/UpgradeDriveModal'
import { calculateStampCapacityMetrics } from '../../utils/bee'

interface AdminStatusBarProps {
  adminStamp: PostageBatch | null
  adminDrive: DriveInfo | null
  loading: boolean
}
// TODO: refresh admin drive and stamp info after upload, new drive etc.
export function AdminStatusBar({ adminStamp, adminDrive, loading }: AdminStatusBarProps): ReactElement {
  const [isUpgradeDriveModalOpen, setIsUpgradeDriveModalOpen] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)

  useEffect(() => {
    if (!adminDrive) return

    const id = adminDrive.id.toString()

    const onStart = (e: Event) => {
      const { driveId } = (e as CustomEvent).detail || {}

      if (driveId === id) setIsUpgrading(true)
    }

    const onEnd = (e: Event) => {
      const { driveId } = (e as CustomEvent).detail || {}

      if (driveId === id) setIsUpgrading(false)
    }

    window.addEventListener('fm:drive-upgrade-start', onStart as EventListener)
    window.addEventListener('fm:drive-upgrade-end', onEnd as EventListener)

    return () => {
      window.removeEventListener('fm:drive-upgrade-start', onStart as EventListener)
      window.removeEventListener('fm:drive-upgrade-end', onEnd as EventListener)
    }
  }, [adminDrive])

  const { capacityPct, usedSize, totalSize } = useMemo(
    () => calculateStampCapacityMetrics(adminStamp, adminDrive),
    [adminStamp, adminDrive],
  )

  const expiresAt = useMemo(
    () => (adminStamp ? adminStamp.duration.toEndDate().toLocaleDateString() : '—'),
    [adminStamp],
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

      {isUpgradeDriveModalOpen && adminStamp && adminDrive && (
        <UpgradeDriveModal
          stamp={adminStamp}
          drive={adminDrive}
          onCancelClick={() => setIsUpgradeDriveModalOpen(false)}
        />
      )}

      <div
        className="fm-admin-status-bar-upgrade-button"
        onClick={() => !isBusy && adminStamp && adminDrive && setIsUpgradeDriveModalOpen(true)}
        aria-disabled={isBusy ? 'true' : 'false'}
      >
        {isBusy ? 'Working…' : 'Manage'}
      </div>

      {loading && (
        <div className="fm-drive-item-creating-overlay" aria-live="polite">
          <div className="fm-mini-spinner" />
          <span>Creating admin drive…</span>
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

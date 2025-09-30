import { ReactElement, useState } from 'react'

import './AdminStatusBar.scss'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { Tooltip } from '../Tooltip/Tooltip'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { UpgradeDriveModal } from '../UpgradeDriveModal/UpgradeDriveModal'

interface AdminStatusBarProps {
  adminStamp?: PostageBatch | null
  adminDrive?: DriveInfo | null
  loading?: boolean
}

export function AdminStatusBar({ adminStamp, adminDrive, loading }: AdminStatusBarProps): ReactElement {
  const [isUpgradeDriveModalOpen, setIsUpgradeDriveModalOpen] = useState(false)

  const capacityPct = (() => {
    if (!adminStamp) return 0
    try {
      return Math.max(0, Math.min(100, adminStamp.usage * 100))
    } catch {
      return 0
    }
  })()

  const usedGb = adminStamp ? (adminStamp.size.toGigabytes() - adminStamp.remainingSize.toGigabytes()).toFixed(1) : '—'
  const totalGb = adminStamp ? adminStamp.size.toGigabytes().toFixed(1) : '—'
  const expiresAt = adminStamp ? adminStamp.duration.toEndDate().toLocaleDateString() : '—'

  const blurCls = loading ? ' is-loading' : ''

  return (
    <div className={`fm-admin-status-bar-container${blurCls}`} aria-busy={loading ? 'true' : 'false'}>
      <div className="fm-admin-status-bar-left">
        <div className="fm-drive-item-capacity">
          Capacity <ProgressBar value={capacityPct} width="150px" /> {usedGb} GB / {totalGb} GB
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
          onCancelClick={() => setIsUpgradeDriveModalOpen(false)}
          drive={adminDrive}
        />
      )}

      <div
        className="fm-admin-status-bar-upgrade-button"
        onClick={() => !loading && adminStamp && adminDrive && setIsUpgradeDriveModalOpen(true)}
        aria-disabled={loading ? 'true' : 'false'}
      >
        {loading ? 'Loading…' : 'Manage'}
      </div>

      {loading && <div className="fm-admin-status-bar-loader" aria-hidden="true" />}
    </div>
  )
}

import { ReactElement, useState } from 'react'

import './AdminStatusBar.scss'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { Tooltip } from '../Tooltip/Tooltip'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { UpgradeDriveModal } from '../UpgradeDriveModal/UpgradeDriveModal'

interface AdminStatusBarProps {
  adminStamp: PostageBatch
  adminDrive: DriveInfo
}

export function AdminStatusBar({ adminStamp, adminDrive }: AdminStatusBarProps): ReactElement {
  const [isUpgradeDriveModalOpen, setIsUpgradeDriveModalOpen] = useState(false)

  return (
    <div className="fm-admin-status-bar-container">
      <div className="fm-admin-status-bar-left">
        {
          <div className="fm-drive-item-capacity">
            Capacity <ProgressBar value={adminStamp.usage * 100} width="150px" />{' '}
            {(adminStamp.size.toGigabytes() - adminStamp.remainingSize.toGigabytes()).toFixed(1)} GB /{' '}
            {adminStamp.size.toGigabytes().toFixed(1)} GB
          </div>
        }

        <div>File Manager Available: Until: {adminStamp.duration.toEndDate().toLocaleDateString()}</div>
        <Tooltip
          label="The File Manager works only while your storage remains valid. If it expires, all catalogue metadata is
            permanently lost."
        />
      </div>
      {isUpgradeDriveModalOpen && (
        <UpgradeDriveModal
          stamp={adminStamp}
          onCancelClick={() => setIsUpgradeDriveModalOpen(false)}
          drive={adminDrive}
        />
      )}
      <div className="fm-admin-status-bar-upgrade-button" onClick={() => setIsUpgradeDriveModalOpen(true)}>
        Manage
      </div>
    </div>
  )
}

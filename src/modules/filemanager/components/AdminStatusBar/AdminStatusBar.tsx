import { ReactElement } from 'react'

import './AdminStatusBar.scss'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { Tooltip } from '../Tooltip/Tooltip'
import { PostageBatch } from '@ethersphere/bee-js'

interface AdminStatusBarProps {
  adminStamp?: PostageBatch
}

export function AdminStatusBar({ adminStamp }: AdminStatusBarProps): ReactElement {
  return (
    <div className="fm-admin-status-bar-container">
      <div className="fm-admin-status-bar-left">
        {adminStamp && (
          <div className="fm-drive-item-capacity">
            Capacity <ProgressBar value={adminStamp.usage * 100} width="150px" />{' '}
            {(adminStamp.size.toGigabytes() - adminStamp.remainingSize.toGigabytes()).toFixed(1)} GB /{' '}
            {adminStamp.size.toGigabytes().toFixed(1)} GB
          </div>
        )}

        <div>File Manager Available: Until: {adminStamp?.duration.toEndDate().toLocaleDateString()}</div>
        <Tooltip
          label="The File Manager works only while your storage remains valid. If it expires, all catalogue metadata is
            permanently lost."
        />
      </div>
      <div className="fm-admin-status-bar-upgrade-button">Manage</div>
    </div>
  )
}

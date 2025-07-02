import { ReactElement } from 'react'
import InfoIcon from 'remixicon-react/InformationLineIcon'

import './OwnerStatusBar.scss'
import { ProgressBar } from '../ProgressBar/ProgressBar'

export function OwnerStatusBar(): ReactElement {
  return (
    <div className="fm-owner-status-bar-container">
      <div className="fm-owner-status-bar-left">
        <InfoIcon />
        <div>Capacity: 8 GB/10 GB</div>
        <ProgressBar value={35} width={150} />
        <div>Expiration: 2025-05-25</div>
      </div>
      <div className="fm-owner-status-bar-upgrade-button">Upgrade</div>
    </div>
  )
}

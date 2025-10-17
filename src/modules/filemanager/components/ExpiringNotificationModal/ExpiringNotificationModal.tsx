import { ReactElement, useState } from 'react'
import { Warning } from '@material-ui/icons'
import './ExpiringNotificationModal.scss'
import '../../styles/global.scss'

import { Button } from '../Button/Button'
import { createPortal } from 'react-dom'
import DriveIcon from 'remixicon-react/HardDrive2LineIcon'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import AlertIcon from 'remixicon-react/AlertLineIcon'
import { UpgradeDriveModal } from '../UpgradeDriveModal/UpgradeDriveModal'
import { getDaysLeft } from '../../utils/common'

import { PostageBatch, Size } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'

interface ExpiringNotificationModalProps {
  stamps: PostageBatch[]
  drives: DriveInfo[]
  onCancelClick: () => void
}

export function ExpiringNotificationModal({
  stamps,
  drives,
  onCancelClick,
}: ExpiringNotificationModalProps): ReactElement {
  const [showUpgradeDriveModal, setShowUpgradeDriveModal] = useState(false)
  const [actualStamp, setActualStamp] = useState<PostageBatch | undefined>(undefined)
  const [actualDrive, setActualDrive] = useState<DriveInfo | undefined>(undefined)
  const modalRoot = document.querySelector('.fm-main') || document.body

  if (stamps.length === 0) return <></>

  return createPortal(
    <div className="fm-modal-container">
      <div className="fm-modal-window fm-upgrade-drive-modal">
        <div className="fm-modal-window-header fm-red-font">
          <AlertIcon size="21px" /> Drives Expiring soon
        </div>
        <div>The following drives will expire soon. Extend them to keep your data accessible.</div>

        <div className="fm-modal-window-body fm-expiring-notification-modal-body">
          {stamps.map(stamp => {
            const daysLeft = getDaysLeft(stamp.duration.toEndDate())
            let daysClass = ''

            const drive = drives.find(d => d.batchId.toString() === stamp.batchID.toString())

            if (!drive) return null

            if (daysLeft < 10) {
              daysClass = 'fm-red-font'
            } else if (daysLeft < 30) {
              daysClass = 'fm-swarm-orange-font'
            }

            return (
              <div key={stamp.label} className="fm-modal-white-section fm-space-between">
                <div className="fm-expiring-notification-modal-section-left fm-space-between">
                  <DriveIcon size="20" color="rgb(237, 129, 49)" />
                  <div>
                    <div className="fm-expiring-notification-modal-section-left-header fm-emphasized-text">
                      {stamp.label} {drive.isAdmin && <Warning style={{ fontSize: '16px' }} />}
                    </div>
                    <div className="fm-expiring-notification-modal-section-left-value">
                      {Size.fromBytes(stamp.size.toBytes() * stamp.usage).toFormattedString()} /{' '}
                      {stamp.size.toFormattedString()}
                    </div>
                  </div>
                </div>
                <div className="fm-expiring-notification-modal-section-right">
                  <div className="fm-expiring-notification-modal-section-right-header">
                    <CalendarIcon size="14" /> Expiry date: {stamp.duration.toEndDate().toLocaleDateString()}
                  </div>
                  <div className={daysClass}>{daysLeft} days left</div>
                  <div className="fm-expiring-notification-modal-section-right-button">
                    <Button
                      label="Upgrade"
                      variant="primary"
                      onClick={() => {
                        setActualStamp(stamp)
                        setActualDrive(drive)
                        setShowUpgradeDriveModal(true)
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="fm-modal-window-footer">
          <div className="fm-expiring-notification-modal-footer-one-button">
            <Button label="Cancel" variant="secondary" onClick={onCancelClick} />
          </div>
        </div>
      </div>
      {showUpgradeDriveModal && actualStamp && actualDrive && (
        <UpgradeDriveModal
          stamp={actualStamp}
          onCancelClick={onCancelClick}
          containerColor="none"
          drive={actualDrive}
        />
      )}
    </div>,
    modalRoot,
  )
}

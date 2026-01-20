import { ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../Button/Button'
import '../../styles/global.scss'
import './UpgradeTimeoutModal.scss'

interface UpgradeTimeoutModalProps {
  driveName: string
  onCancel: () => void
}

export function UpgradeTimeoutModal({ driveName, onCancel }: UpgradeTimeoutModalProps): ReactElement {
  const modalRoot = document.querySelector('.fm-main') || document.body

  return createPortal(
    <div className="fm-modal-container fm-upgrade-timeout-modal">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Drive upgrade taking longer than expected</div>

        <div className="fm-modal-window-body">
          <div className="fm-modal-white-section">
            <p>
              The upgrade for <strong>{driveName}</strong> is taking longer than expected (more than 60 seconds).
            </p>
            <p>The upgrade may still be processing on the Bee node. You can:</p>
            <ul>
              <li>
                <strong>Refresh</strong> to reload the page and check if the capacity has been updated
              </li>
              <li>
                <strong>Cancel</strong> to dismiss this message and check back later
              </li>
            </ul>
            <p style={{ marginTop: '12px', fontSize: '0.9em', color: '#666' }}>
              <em>Note: The upgrade may still take some time to complete even after refreshing.</em>
            </p>
          </div>
        </div>

        <div className="fm-modal-window-footer">
          <Button label="Cancel" variant="secondary" onClick={onCancel} />
          <Button label="Refresh" variant="primary" onClick={() => window.location.reload()} />
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

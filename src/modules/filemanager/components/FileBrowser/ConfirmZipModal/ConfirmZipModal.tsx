import { ReactElement } from 'react'
import '../../../styles/global.scss'
import './ConfirmZipModal.scss'
import { Button } from '../../Button/Button'
import { createPortal } from 'react-dom'

interface ConfirmZipModalProps {
  fileCount: number
  onZipAll: () => void
  onIndividual: () => void
  onCancel: () => void
}

export function ConfirmZipModal({ fileCount, onZipAll, onIndividual, onCancel }: ConfirmZipModalProps): ReactElement {
  const modalRoot = document.querySelector('.fm-main') || document.body

  return createPortal(
    <div className="fm-modal-container fm-confirm-modal">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Download Multiple Files</div>

        <div className="fm-modal-window-body">
          <div className="fm-modal-white-section">
            You selected <b>{fileCount}</b> file{fileCount > 1 ? 's' : ''}. How would you like to download?
          </div>
        </div>

        <div className="fm-modal-window-footer">
          <Button label="Zip all" variant="primary" onClick={onZipAll} />
          <Button label="Individually" variant="primary" onClick={onIndividual} />
          <Button label="Cancel" variant="secondary" onClick={onCancel} />
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

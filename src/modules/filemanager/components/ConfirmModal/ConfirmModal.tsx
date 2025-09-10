import { ReactElement } from 'react'
import '../../styles/global.scss'
import './ConfirmModal.scss'
import { FMButton } from '../FMButton/FMButton'
import { createPortal } from 'react-dom'

interface ConfirmModalProps {
  title?: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmModal({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmModalProps): ReactElement {
  const modalRoot = document.querySelector('.fm-main') || document.body

  return createPortal(
    <div className="fm-modal-container fm-confirm-modal">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">{title}</div>
        <div className="fm-modal-window-body">
          <div className="fm-modal-white-section">{message}</div>
        </div>
        <div className="fm-modal-window-footer">
          <FMButton label={cancelLabel} variant="secondary" onClick={onCancel} />
          <FMButton label={confirmLabel} variant="primary" onClick={() => void onConfirm()} />
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

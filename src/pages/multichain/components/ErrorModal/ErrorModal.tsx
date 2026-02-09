import { ReactElement } from 'react'

import { Button } from '../Button/Button'

import './ErrorModal.scss'

interface ErrorModalProps {
  label: string
  onClick: () => void
}

// TODO: move to a common component
export function ErrorModal({ label, onClick }: ErrorModalProps): ReactElement {
  return (
    <div className="multichain-error-modal-container">
      <div className="multichain-modal-window">
        <div className="multichain-error-modal-message">{label}</div>
        <div className="multichain-error-modal-button-container">
          <Button variant="primary" label="OK" width={100} onClick={onClick} />
        </div>
      </div>
    </div>
  )
}

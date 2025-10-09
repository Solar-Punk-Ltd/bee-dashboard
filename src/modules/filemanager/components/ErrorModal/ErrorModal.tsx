import { ReactElement, useContext } from 'react'
import './ErrorModal.scss'
import { Button } from '../Button/Button'
import { Context as FMContext } from '../../../../providers/FileManager'

interface ErrorModalProps {
  label: string
}

export function ErrorModal({ label }: ErrorModalProps): ReactElement {
  const { setShowUploadError } = useContext(FMContext)

  return (
    <div className="fm-error-modal-container">
      <div className="fm-modal-window">
        <div className="fm-error-modal-message">{label}</div>
        <div className="fm-error-modal-button-container">
          <Button variant="primary" label="OK" width={100} onClick={() => setShowUploadError(false)} />
        </div>
      </div>
    </div>
  )
}

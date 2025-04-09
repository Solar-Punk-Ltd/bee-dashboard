import type { ReactElement } from 'react'
import { useFileManagerGlobalStyles } from '../styles/globalFileManagerStyles'

interface WarningModalProps {
  modalDisplay: (value: boolean) => void
  onConfirm: () => void
  title: string
  message: string
}

const WarningModal = ({ modalDisplay, onConfirm, title, message }: WarningModalProps): ReactElement => {
  const classes = useFileManagerGlobalStyles()

  return (
    <div className={classes.modal}>
      <div className={classes.modalContainer} style={{ width: '400px', height: '200px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className={classes.modalHeader}>{title}</div>
          <div style={{ color: '#333333' }}>{message}</div>
          <div style={{ display: 'flex', gap: '25px', justifyContent: 'right' }}>
            <div
              className={`${classes.buttonElementBase} ${classes.generalButtonElement}`}
              style={{ width: '160px' }}
              onClick={() => modalDisplay(false)}
            >
              Cancel
            </div>
            <div
              className={`${classes.buttonElementBase} ${classes.deleteButtonElement}`}
              style={{ width: '160px', backgroundColor: '#DE3700', color: '#FFFFFF' }}
              onClick={onConfirm}
            >
              Destroy
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WarningModal

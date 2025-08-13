import { ReactElement, useState } from 'react'
import '../../styles/global.scss'
import './DestroyDriveModal.scss'
import { FMButton } from '../FMButton/FMButton'
import { createPortal } from 'react-dom'
import { BatchId, PostageBatch } from '@ethersphere/bee-js'

interface DestroyDriveModalProps {
  stamp: PostageBatch
  onCancelClick: () => void
}

export function DestroyDriveModal({ stamp, onCancelClick }: DestroyDriveModalProps): ReactElement {
  const [driveNameInput, setDriveNameInput] = useState('')
  const batchIdStr = stamp.batchID.toString()
  const shortBatchId = batchIdStr.length > 12 ? `${batchIdStr.slice(0, 4)}...${batchIdStr.slice(-4)}` : batchIdStr

  const destroyDriveText = `DESTROY DRIVE ${stamp.label || shortBatchId}`

  const modalRoot = document.querySelector('.fm-main') || document.body

  const handleDestroyVolume = async (batchId: BatchId) => {
    await destroyVolume(batchId)
    onCancelClick()
  }

  //TODO the destroyVolume function below is a mocked function for drive destroying. It needs to be changed to the real destroyVolume function.
  const destroyVolume = (batchId: BatchId) => {
    // Mocked API call
    return new Promise(resolve => {
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log(`Drive ${shortBatchId} destroyed`)
        resolve(true)
      }, 1000)
    })
  }

  return createPortal(
    <div className="fm-modal-container">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header fm-red-font">Destroy entire drive</div>
        <div className="fm-modal-window-body">
          <div className="fm-modal-body-destroy">
            <div className="fm-emphasized-text">Destroy Drive? This Action Is Permanent</div>
            <div>All files stored only on this drive will become inaccessible.</div>
            <div>
              While the data may still temporarily persist on Swarm, it will be permanently removed once the storage
              expires and the data is garbage collected by the network. The File Manager will no longer recognise or
              recover these files.
            </div>
            <div>Confirmation:</div>
            <div>Requires typing a fixed expression to prevent accidental deletion. This action cannot be undone.</div>
            <div>
              Type: <span className="fm-emphasized-text">{destroyDriveText}</span>
            </div>
            <div className="fm-modal-window-input-container">
              <input
                type="text"
                id="drive-name"
                placeholder={destroyDriveText}
                value={driveNameInput}
                onChange={e => setDriveNameInput(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="fm-modal-window-footer">
          <FMButton
            label="Destroy entire drive"
            variant="danger"
            disabled={destroyDriveText !== driveNameInput}
            onClick={() => handleDestroyVolume(stamp.batchID)}
          />
          <FMButton label="Cancel" variant="secondary" onClick={onCancelClick} />
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

import { ReactElement, useState } from 'react'
import './CreateDriveModal.scss'
import '../../styles/global.scss'

import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { FMButton } from '../FMButton/FMButton'
import { FMSlider } from '../FMSlider/FMSlider'
import { createPortal } from 'react-dom'

const initialCapacityOptions = [
  { value: '5', label: '5 GB' },
  { value: '10', label: '10 GB' },
  { value: '20', label: '20 GB' },
  { value: '50', label: '50 GB' },
  { value: '100', label: '100 GB' },
]

const desiredLifetimeOptions = [
  { value: '1', label: '1 year' },
  { value: '2', label: '2 year' },
  { value: '3', label: '3 year' },
  { value: '5', label: '5 year' },
]

const marks = [
  {
    value: 0,
    label: 'No',
  },
  {
    value: 1,
    label: 'Medium',
  },
  {
    value: 2,
    label: 'Strong',
  },
  {
    value: 3,
    label: 'Insane',
  },
  {
    value: 4,
    label: 'Paranoid',
  },
]

interface CreateDriveModalProps {
  onCancelClick: () => void
}

export function CreateDriveModal({ onCancelClick }: CreateDriveModalProps): ReactElement {
  const [capacity, setCapacity] = useState('personal')
  const [lifetime, setLifetime] = useState('personal')
  const [sliderValue, setSliderValue] = useState(0)

  const modalRoot = document.querySelector('.fm-main') || document.body

  return createPortal(
    <div className="fm-modal-container">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Create new drive</div>
        <div className="fm-modal-window-body">
          <div className="fm-modal-window-input-container">
            <label htmlFor="drive-name">Drive name:</label>
            <input type="text" id="drive-name" placeholder="My important files" />
          </div>
          <div className="fm-modal-window-input-container">
            <CustomDropdown
              id="drive-type"
              label="Initial capacity:"
              options={initialCapacityOptions}
              value={capacity}
              onChange={setCapacity}
              placeholder="Select a value"
              infoText="Amount of data you can store on the drive. Later you can upgrade it."
            />
          </div>
          <div className="fm-modal-window-input-container">
            <CustomDropdown
              id="drive-type"
              label="Desired lifetime:"
              options={desiredLifetimeOptions}
              value={lifetime}
              onChange={setLifetime}
              placeholder="Select a value"
              infoText="Might change over time depending on the network"
            />
          </div>
          <FMSlider defaultValue={0} marks={marks} onChange={value => setSliderValue(value)} />

          <div>
            <div>Estimated Cost: XX.XXX BZZ</div>
            <div>(Based on current network conditions)</div>
          </div>
        </div>
        <div className="fm-modal-window-footer">
          <FMButton label="Create drive" variant="primary" />
          <FMButton label="Cancel" variant="secondary" onClick={onCancelClick} />
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

import { ReactElement, useContext, useEffect, useRef, useState } from 'react'

import { Duration, RedundancyLevel, Size, Utils } from '@ethersphere/bee-js'
import './CreateDriveModal.scss'
import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { Button } from '../Button/Button'
import { fmFetchCost, handleCreateDrive } from '../../utils/bee'
import { formatBytes, getExpiryDateByLifetime } from '../../utils/common'
import { erasureCodeMarks } from '../../constants/common'
import { desiredLifetimeOptions } from '../../constants/stamps'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { FMSlider } from '../Slider/Slider'
import { Context as FMContext } from '../../../../providers/FileManager'

const minMarkValue = Math.min(...erasureCodeMarks.map(mark => mark.value))
const maxMarkValue = Math.max(...erasureCodeMarks.map(mark => mark.value))

interface CreateDriveModalProps {
  onCancelClick: () => void
  onDriveCreated: () => void
  onCreationStarted: () => void
  onCreationError: () => void
}
// TODO: select existing batch id or create a new one - just like in InitialModal
export function CreateDriveModal({
  onCancelClick,
  onDriveCreated,
  onCreationStarted,
  onCreationError,
}: CreateDriveModalProps): ReactElement {
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)
  const [capacity, setCapacity] = useState(0)
  const [lifetimeIndex, setLifetimeIndex] = useState<number>(-1)
  const [validityEndDate, setValidityEndDate] = useState(new Date())
  const [label, setLabel] = useState('')
  const [capacityIndex, setCapacityIndex] = useState(-1)
  const [encryptionEnabled] = useState(false)
  const [erasureCodeLevel, setErasureCodeLevel] = useState(RedundancyLevel.OFF)
  const [cost, setCost] = useState('0')

  const [sizeMarks, setSizeMarks] = useState<{ value: number; label: string }[]>([])
  const { beeApi } = useContext(SettingsContext)
  const { fm } = useContext(FMContext)
  const currentFetch = useRef<Promise<void> | null>(null)

  const handleCapacityChange = (value: number, index: number) => {
    setCapacity(index >= 0 ? value : 0)
    setCapacityIndex(index)
  }

  useEffect(() => {
    const newSizes = Array.from(Utils.getStampEffectiveBytesBreakpoints(encryptionEnabled, erasureCodeLevel).values())

    setSizeMarks(
      newSizes.map(size => ({
        value: size,
        label: formatBytes(size) ?? '0 B',
      })),
    )

    setCapacity(capacityIndex >= 0 ? newSizes[capacityIndex] : 0)
  }, [encryptionEnabled, erasureCodeLevel, capacityIndex])

  useEffect(() => {
    const hasName = label.trim().length > 0
    const hasCapacity = capacity > 0
    const hasLifetime = lifetimeIndex >= 0
    const isValidDate = validityEndDate.getTime() > Date.now()

    if (hasCapacity && hasLifetime && isValidDate) {
      fmFetchCost(capacity, validityEndDate, false, erasureCodeLevel, beeApi, setCost, currentFetch)
    } else {
      setCost('0')
    }

    setIsCreateEnabled(hasName && hasCapacity && hasLifetime && isValidDate)
  }, [capacity, validityEndDate, beeApi, label, erasureCodeLevel, lifetimeIndex])

  useEffect(() => {
    if (lifetimeIndex >= 0) {
      setValidityEndDate(getExpiryDateByLifetime(lifetimeIndex))
    } else {
      setValidityEndDate(new Date(0))
    }
  }, [lifetimeIndex])

  return (
    <div className="fm-modal-container">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Create new drive</div>
        <div className="fm-modal-window-body">
          <div className="fm-modal-window-input-container">
            <label htmlFor="drive-name">Drive name:</label>
            <input
              type="text"
              id="drive-name"
              placeholder="My important files"
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          <div className="fm-modal-window-input-container">
            <CustomDropdown
              id="drive-type"
              label="Initial capacity:"
              options={sizeMarks}
              value={capacity}
              onChange={handleCapacityChange}
              placeholder="Select a value"
              infoText="Amount of data you can store on the drive. Later you can upgrade it."
            />
          </div>
          <div className="fm-modal-window-input-container">
            <CustomDropdown
              id="drive-type"
              label="Desired lifetime:"
              options={desiredLifetimeOptions}
              value={lifetimeIndex}
              onChange={setLifetimeIndex}
              placeholder="Select a value"
              infoText="Might change over time depending on the network"
            />
          </div>
          <div className="fm-modal-window-input-container">
            <FMSlider
              label="Security Level"
              defaultValue={0}
              marks={erasureCodeMarks}
              onChange={value => setErasureCodeLevel(value)}
              minValue={minMarkValue}
              maxValue={maxMarkValue}
              step={1}
            />
          </div>

          <div>
            <div>Estimated Cost: {cost} BZZ</div>
            <div>Estimated Cost: {lifetimeIndex >= 0 && capacity > 0 ? `${cost} BZZ` : '—'}</div>
          </div>
        </div>
        <div className="fm-modal-window-footer">
          <Button
            label="Create drive"
            variant="primary"
            disabled={!isCreateEnabled}
            onClick={async () => {
              if (isCreateEnabled && fm && beeApi) {
                onCreationStarted()
                onCancelClick()

                await handleCreateDrive(
                  beeApi,
                  fm,
                  Size.fromBytes(capacity),
                  Duration.fromEndDate(validityEndDate),
                  label,
                  encryptionEnabled,
                  erasureCodeLevel,
                  false,
                  null,
                  undefined,
                  () => onDriveCreated(),
                  () => onCreationError(),
                )
              }
            }}
          />
          <Button label="Cancel" variant="secondary" onClick={onCancelClick} />
        </div>
      </div>
    </div>
  )
}

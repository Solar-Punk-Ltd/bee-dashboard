import { ReactElement, useContext, useEffect, useRef, useState } from 'react'

import { BZZ, Duration, RedundancyLevel, Size, Utils } from '@ethersphere/bee-js'
import './CreateDriveModal.scss'
import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { FMButton } from '../FMButton/FMButton'
import { fromBytesConversion, getExpiryDateByLifetime } from '../../utils/utils'
import { desiredLifetimeOptions } from '../../constants/constants'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { FMSlider } from '../FMSlider/FMSlider'

const erasureCodeMarks = Object.entries(RedundancyLevel)
  .filter(([key, value]) => typeof value === 'number')
  .map(([key, value]) => ({
    value: value as number,
    label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase(),
  }))

const minMarkValue = Math.min(...erasureCodeMarks.map(mark => mark.value))
const maxMarkValue = Math.max(...erasureCodeMarks.map(mark => mark.value))

interface CreateDriveModalProps {
  onCancelClick: () => void
  handleCreateDrive: (size: Size, duration: Duration, label: string) => void
}

export function CreateDriveModal({ onCancelClick, handleCreateDrive }: CreateDriveModalProps): ReactElement {
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)
  const [capacity, setCapacity] = useState(0)
  const [lifetimeIndex, setLifetimeIndex] = useState(0)
  const [validityEndDate, setValidityEndDate] = useState(new Date())
  const [label, setLabel] = useState('')
  const [sliderValue, setSliderValue] = useState(0)
  const [cost, setCost] = useState('0')
  const { beeApi } = useContext(SettingsContext)
  const currentFetch = useRef<Promise<void> | null>(null)

  const sizes = Array.from(Utils.getStampEffectiveBytesBreakpoints().values())
  const firstIndex = sizes.findIndex(size => size === 628910000)
  const lastIndex = sizes.findIndex(size => size === 908810000000)

  const realSizes = sizes.slice(firstIndex, lastIndex + 1)

  const sizeMarks = realSizes.map((size, index) => ({
    value: size,
    label: `${fromBytesConversion(size, 'GB').toFixed(2)} GB`,
  }))

  const createPostageStamp = () => {
    try {
      if (isCreateEnabled) {
        onCancelClick()
        handleCreateDrive(Size.fromBytes(capacity), Duration.fromEndDate(validityEndDate), label)
      }
    } catch (e) {}
  }

  useEffect(() => {
    const fetchCost = async () => {
      if (currentFetch.current) {
        await currentFetch.current
      }
      const fetchPromise = (async () => {
        let cost: BZZ | undefined = undefined
        try {
          if (Size.fromBytes(capacity).toGigabytes() >= 0 && validityEndDate.getTime() >= new Date().getTime()) {
            cost = await beeApi?.getStorageCost(Size.fromBytes(capacity), Duration.fromEndDate(validityEndDate))
            setCost(cost ? cost.toSignificantDigits(2) : '0')
          } else {
            setCost('0')
          }
        } catch (e) {}
      })()
      currentFetch.current = fetchPromise
      await fetchPromise
      currentFetch.current = null
    }

    if (capacity > 0 && validityEndDate.getTime() > new Date().getTime()) {
      fetchCost()

      if (label) {
        setIsCreateEnabled(true)
      }
    } else {
      setCost('0')
      setIsCreateEnabled(false)
    }
  }, [capacity, validityEndDate, beeApi, label])

  useEffect(() => {
    setValidityEndDate(getExpiryDateByLifetime(lifetimeIndex))
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
              value={lifetimeIndex}
              onChange={setLifetimeIndex}
              placeholder="Select a value"
              infoText="Might change over time depending on the network"
            />
          </div>
          <FMSlider
            defaultValue={0}
            marks={erasureCodeMarks}
            onChange={value => setSliderValue(value)}
            minValue={minMarkValue}
            maxValue={maxMarkValue}
            step={1}
          />

          <div>
            <div>Estimated Cost: {cost} BZZ</div>
            <div>(Based on current network conditions)</div>
          </div>
        </div>
        <div className="fm-modal-window-footer">
          <FMButton label="Create drive" variant="primary" disabled={!isCreateEnabled} onClick={createPostageStamp} />
          <FMButton label="Cancel" variant="secondary" onClick={onCancelClick} />
        </div>
      </div>
    </div>
  )
}

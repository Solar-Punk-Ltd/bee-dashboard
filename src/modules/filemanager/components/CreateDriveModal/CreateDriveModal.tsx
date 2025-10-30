import { ReactElement, useContext, useEffect, useRef, useState } from 'react'

import { BZZ, Duration, RedundancyLevel, Size, Utils } from '@ethersphere/bee-js'
import './CreateDriveModal.scss'
import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { Button } from '../Button/Button'
import { fmFetchCost, handleCreateDrive } from '../../utils/bee'
import { getExpiryDateByLifetime } from '../../utils/common'
import { erasureCodeMarks } from '../../constants/common'
import { desiredLifetimeOptions } from '../../constants/stamps'
import { Context as BeeContext } from '../../../../providers/Bee'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { FMSlider } from '../Slider/Slider'
import { Context as FMContext } from '../../../../providers/FileManager'
import { getHumanReadableFileSize } from '../../../../utils/file'

const minMarkValue = Math.min(...erasureCodeMarks.map(mark => mark.value))
const maxMarkValue = Math.max(...erasureCodeMarks.map(mark => mark.value))

interface CreateDriveModalProps {
  onCancelClick: () => void
  onDriveCreated: () => void
  onCreationStarted: () => void
  onCreationError: (name: string) => void
}
// TODO: select existing batch id or create a new one - just like in InitialModal
export function CreateDriveModal({
  onCancelClick,
  onDriveCreated,
  onCreationStarted,
  onCreationError,
}: CreateDriveModalProps): ReactElement {
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)
  const [isBalanceSufficient, setIsBalanceSufficient] = useState(true)
  const [capacity, setCapacity] = useState(0)
  const [lifetimeIndex, setLifetimeIndex] = useState(-1)
  const [validityEndDate, setValidityEndDate] = useState(new Date())
  const [driveName, setDriveName] = useState('')
  const [capacityIndex, setCapacityIndex] = useState(-1)
  const [encryptionEnabled] = useState(false)
  const [erasureCodeLevel, setErasureCodeLevel] = useState(RedundancyLevel.OFF)
  const [cost, setCost] = useState('0')

  const [sizeMarks, setSizeMarks] = useState<{ value: number; label: string }[]>([])
  const { walletBalance } = useContext(BeeContext)
  const { beeApi } = useContext(SettingsContext)
  const { fm } = useContext(FMContext)
  const currentFetch = useRef<Promise<void> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleCapacityChange = (value: number, index: number) => {
    setCapacityIndex(index)
  }

  useEffect(() => {
    const newSizes = Array.from(Utils.getStampEffectiveBytesBreakpoints(encryptionEnabled, erasureCodeLevel).values())

    setSizeMarks(
      newSizes.map(size => ({
        value: size,
        label: getHumanReadableFileSize(size),
      })),
    )

    setCapacity(newSizes[capacityIndex])
  }, [encryptionEnabled, erasureCodeLevel, capacityIndex])

  useEffect(() => {
    if (capacity > 0 && validityEndDate.getTime() > new Date().getTime()) {
      fmFetchCost(
        capacity,
        validityEndDate,
        false,
        erasureCodeLevel,
        beeApi,
        (cost: BZZ) => {
          if (!isMountedRef.current) return

          setIsBalanceSufficient(true)

          if ((walletBalance && cost.gte(walletBalance.bzzBalance)) || !walletBalance) {
            setIsBalanceSufficient(false)
          }
          setCost(cost.toSignificantDigits(2))
        },
        currentFetch,
      )

      if (driveName && driveName.trim().length > 0) {
        setIsCreateEnabled(true)
      } else {
        setIsCreateEnabled(false)
      }
    } else {
      setCost('0')
      setIsCreateEnabled(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity, validityEndDate, beeApi, driveName, walletBalance])

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
              value={driveName}
              onChange={e => setDriveName(e.target.value)}
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
              infoText="Amount of data you can store on the drive. Usable capacity
              may differ slightly. Later you can upgrade it."
            />
          </div>
          <div className="fm-modal-info-warning">
            Drive sizes shown above are system-calculated based on your current stamp configuration
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
            <div>
              Estimated Cost: {cost} BZZ {isBalanceSufficient ? '' : '(Insufficient balance)'}
            </div>
            <div>(Based on current network conditions)</div>
          </div>
        </div>
        <div className="fm-modal-window-footer">
          <Button
            label="Create drive"
            variant="primary"
            disabled={!isCreateEnabled || !isBalanceSufficient}
            onClick={async () => {
              if (isCreateEnabled && fm && beeApi && walletBalance) {
                onCreationStarted()
                onCancelClick()

                await handleCreateDrive(
                  beeApi,
                  fm,
                  Size.fromBytes(capacity),
                  Duration.fromEndDate(validityEndDate),
                  driveName,
                  encryptionEnabled,
                  erasureCodeLevel,
                  false,
                  null,
                  undefined,
                  () => onDriveCreated(),
                  () => onCreationError(driveName),
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

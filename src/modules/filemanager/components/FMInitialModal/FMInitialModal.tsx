import { ReactElement, useContext, useEffect, useRef, useState } from 'react'

import { Duration, RedundancyLevel, Size, Utils } from '@ethersphere/bee-js'
import CircularProgress from '@material-ui/core/CircularProgress'
import './FMInitialModal.scss'
import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { FMButton } from '../FMButton/FMButton'
import { fmFetchCost, handleCreateDrive } from '../../utils/bee'
import { getExpiryDateByLifetime } from '../../utils/common'
import { desiredLifetimeOptions } from '../../constants/constants'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { FMSlider } from '../FMSlider/FMSlider'
import { useFM } from '../../providers/FMContext'
import { ADMIN_STAMP_LABEL } from '@solarpunkltd/file-manager-lib'

interface FMInitialModalProps {
  handleVisibility: (isVisible: boolean) => void
}

const erasureCodeMarks = Object.entries(RedundancyLevel)
  .filter(([_, value]) => typeof value === 'number')
  .map(([key, value]) => ({
    value: value as number,
    label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase(),
  }))

const minMarkValue = Math.min(...erasureCodeMarks.map(mark => mark.value))
const maxMarkValue = Math.max(...erasureCodeMarks.map(mark => mark.value))

export function FMInitialModal({ handleVisibility }: FMInitialModalProps): ReactElement {
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)
  const [capacity, setCapacity] = useState(0)
  const [lifetimeIndex, setLifetimeIndex] = useState(0)
  const [validityEndDate, setValidityEndDate] = useState(new Date())
  const [isAdminStampCreationInProgress, setIsAdminStampCreationInProgress] = useState(false)
  const [erasureCodeLevel, setErasureCodeLevel] = useState(RedundancyLevel.OFF)
  const [cost, setCost] = useState('0')
  const { beeApi } = useContext(SettingsContext)
  const { fm } = useFM()
  const currentFetch = useRef<Promise<void> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const newSizes = Array.from(Utils.getStampEffectiveBytesBreakpoints(false, erasureCodeLevel).values())

    setCapacity(newSizes[2])
  }, [erasureCodeLevel])

  useEffect(() => {
    if (validityEndDate.getTime() > new Date().getTime()) {
      fmFetchCost(
        capacity,
        validityEndDate,
        false,
        erasureCodeLevel,
        beeApi,
        (cost: string) => {
          if (isMountedRef.current) {
            setCost(cost)
          }
        },
        currentFetch,
      )

      if (lifetimeIndex >= 0 && isMountedRef.current) {
        setIsCreateEnabled(true)
      }
    } else {
      if (isMountedRef.current) {
        setCost('0')
        setIsCreateEnabled(false)
      }
    }
  }, [validityEndDate, beeApi, capacity, erasureCodeLevel, lifetimeIndex])

  useEffect(() => {
    setValidityEndDate(getExpiryDateByLifetime(lifetimeIndex))
  }, [lifetimeIndex])

  return isAdminStampCreationInProgress ? (
    <div className="fm-initialization-modal-container">
      <div className="fm-modal-window">
        <div className="fm-initilization-progress-content">
          <div>Your registration is being created...</div>

          <CircularProgress size={18} />
        </div>
      </div>
    </div>
  ) : (
    <div className="fm-initialization-modal-container">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Welcome to File Manager</div>
        <div>You are now initializing the file manager and to do this you need to register.</div>
        <div className="fm-modal-window-body">
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
            <div>(Based on current network conditions)</div>
          </div>
        </div>
        <div className="fm-modal-window-footer">
          <FMButton
            label="Purchase"
            variant="primary"
            disabled={!isCreateEnabled}
            onClick={async () => {
              await handleCreateDrive(
                beeApi,
                fm,
                Size.fromBytes(capacity),
                Duration.fromEndDate(validityEndDate),
                ADMIN_STAMP_LABEL,
                false,
                erasureCodeLevel,
                true,
                (loading: boolean) => {
                  if (isMountedRef.current) {
                    setIsAdminStampCreationInProgress(loading)
                  }
                },
                () => {
                  if (isMountedRef.current) {
                    handleVisibility(false)
                  }
                },
                () => {
                  if (isMountedRef.current) {
                    handleVisibility(true)
                  }
                },
              )
              window.location.reload()
            }}
          />
        </div>
      </div>
    </div>
  )
}

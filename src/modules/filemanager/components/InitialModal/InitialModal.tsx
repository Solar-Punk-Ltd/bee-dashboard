import { ReactElement, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { Duration, PostageBatch, RedundancyLevel, Size, Utils } from '@ethersphere/bee-js'
import type { FileManagerBase } from '@solarpunkltd/file-manager-lib'
import CircularProgress from '@material-ui/core/CircularProgress'
import './InitialModal.scss'
import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { Button } from '../Button/Button'
import { fmFetchCost, getUsableStamps, handleCreateDrive } from '../../utils/bee'
import { getExpiryDateByLifetime } from '../../utils/common'
import { erasureCodeMarks } from '../../constants/common'
import { desiredLifetimeOptions } from '../../constants/stamps'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { FMSlider } from '../Slider/Slider'
import { Context as FMContext } from '../../../../providers/FileManager'
import { ADMIN_STAMP_LABEL } from '@solarpunkltd/file-manager-lib'
import { ProgressBar } from '../ProgressBar/ProgressBar'

interface InitialModalProps {
  handleVisibility: (isVisible: boolean) => void
}

const minMarkValue = Math.min(...erasureCodeMarks.map(mark => mark.value))
const maxMarkValue = Math.max(...erasureCodeMarks.map(mark => mark.value))

const BATCH_ID_PLACEHOLDER = 'Select a batch ID'

const createBatchIdOptions = (usableStamps: PostageBatch[]) => [
  { label: BATCH_ID_PLACEHOLDER, value: -1 },
  ...usableStamps.map((stamp, index) => {
    const batchId = stamp.batchID.toHex().slice(0, 8)
    const label = `${batchId}${stamp.label ? ` - ${stamp.label}` : ''}`

    return {
      label,
      value: index,
    }
  }),
]
// TODO: refactor InitialModal and Provider together
export function InitialModal({ handleVisibility }: InitialModalProps): ReactElement {
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)
  const [capacity, setCapacity] = useState(0)
  const [lifetimeIndex, setLifetimeIndex] = useState(0)
  const [validityEndDate, setValidityEndDate] = useState(new Date())
  const [isAdminStampCreationInProgress, setIsAdminStampCreationInProgress] = useState(false)
  const [erasureCodeLevel, setErasureCodeLevel] = useState(RedundancyLevel.OFF)
  const [cost, setCost] = useState('0')
  const [usableStamps, setUsableStamps] = useState<PostageBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<PostageBatch | null>(null)
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number>(-1)

  const { beeApi } = useContext(SettingsContext)
  const { setAdminStamp, refreshDrives, init } = useContext(FMContext)

  const currentFetch = useRef<Promise<void> | null>(null)
  const isMountedRef = useRef(true)

  const safeSet =
    <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
    (value: React.SetStateAction<T>) => {
      if (isMountedRef.current) setter(value)
    }

  // use guarded setters
  const safeSetProgress = safeSet(setIsAdminStampCreationInProgress)
  const handleExistingAdminDrive = useCallback(() => {
    if (!selectedBatch || !isMountedRef.current) return

    setAdminStamp(selectedBatch)
    refreshDrives()
    handleVisibility(false)
  }, [selectedBatch, setAdminStamp, refreshDrives, handleVisibility])

  const handleNewAdminDriveSuccess = useCallback(
    (batch?: PostageBatch) => {
      if (!isMountedRef.current) return

      setAdminStamp(batch || null)
      refreshDrives()
      handleVisibility(false)
    },
    [setAdminStamp, refreshDrives, handleVisibility],
  )

  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  const createNewAdminDriveWithFm = useCallback(
    async (fmInstance: FileManagerBase) => {
      controllerRef.current?.abort()
      controllerRef.current = new AbortController()
      await handleCreateDrive(
        beeApi,
        fmInstance,
        Size.fromBytes(capacity),
        Duration.fromEndDate(validityEndDate),
        ADMIN_STAMP_LABEL,
        false,
        erasureCodeLevel,
        true,
        selectedBatch,
        safeSetProgress,
        handleNewAdminDriveSuccess,
        undefined,
        controllerRef.current.signal,
      )
    },
    [beeApi, capacity, validityEndDate, erasureCodeLevel, selectedBatch, handleNewAdminDriveSuccess, safeSetProgress],
  )

  const handleAdminDriveReady = useCallback(
    (hasExistingDrive: boolean, fmInstance: FileManagerBase) => {
      if (hasExistingDrive) {
        if (selectedBatch) {
          handleExistingAdminDrive()
        }
      } else {
        createNewAdminDriveWithFm(fmInstance)
      }
    },
    [selectedBatch, handleExistingAdminDrive, createNewAdminDriveWithFm],
  )

  const handleFileManagerInit = useCallback(async () => {
    safeSetProgress(true)

    try {
      const ok = await init(selectedBatch?.batchID.toString(), handleAdminDriveReady)

      if (!ok) {
        safeSetProgress(false)
      }
    } catch {
      safeSetProgress(false)
    }
  }, [init, selectedBatch, handleAdminDriveReady, safeSetProgress])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const getStamps = async () => {
      const stamps = await getUsableStamps(beeApi)

      if (isMounted) {
        setUsableStamps([...stamps])
      }
    }

    if (beeApi) {
      getStamps()
    }

    return () => {
      isMounted = false
    }
  }, [beeApi])

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

  useEffect(() => {
    if (selectedBatchIndex >= 0 && selectedBatchIndex < usableStamps.length) {
      setSelectedBatch(usableStamps[selectedBatchIndex])
    } else {
      setSelectedBatch(null)
    }
  }, [usableStamps, selectedBatchIndex])

  return isAdminStampCreationInProgress ? (
    <div className="fm-initialization-modal-container">
      <div className="fm-modal-window">
        <div className="fm-initilization-progress-content">
          <div>Your admin drive is being created...</div>

          <CircularProgress size={18} />
        </div>
      </div>
    </div>
  ) : (
    <div className="fm-initialization-modal-container">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Welcome to File Manager</div>
        <div>You are now initializing the file manager</div>
        {usableStamps.length > 0 && (
          <div className="fm-modal-window-input-container">
            <CustomDropdown
              id="batch-id-selector"
              label="Selected existing batch ID:"
              options={createBatchIdOptions(usableStamps)}
              value={selectedBatchIndex}
              onChange={(index: number) => {
                setSelectedBatchIndex(index)

                if (index === -1) {
                  setSelectedBatch(null)
                }
              }}
              placeholder={BATCH_ID_PLACEHOLDER}
            />
            {selectedBatch && (
              <div className="fm-drive-item-content">
                <div className="fm-drive-item-capacity">
                  Capacity <ProgressBar value={selectedBatch.usage * 100} width="64px" />{' '}
                  {selectedBatch.size.toGigabytes() - selectedBatch.remainingSize.toGigabytes()} GB /{' '}
                  {selectedBatch.size.toGigabytes()} GB
                </div>
                <div className="fm-drive-item-capacity">
                  Expiry date: {selectedBatch.duration.toEndDate().toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        )}
        {!selectedBatch && (
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
        )}
        <div className="fm-modal-window-footer">
          <Button
            label={selectedBatch ? 'Create Drive' : 'Purchase Stamp & Create Drive'}
            variant="primary"
            disabled={selectedBatch ? false : !isCreateEnabled}
            onClick={handleFileManagerInit}
          />
        </div>
      </div>
    </div>
  )
}

import { BeeModes, BZZ, DAI, Duration, PostageBatch, RedundancyLevel, Size, Utils } from '@ethersphere/bee-js'
import { ReactElement, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { Context as BeeContext } from '../../../../providers/Bee'
import { Context as FMContext } from '../../../../providers/FileManager'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { getHumanReadableFileSize } from '../../../../utils/file'
import { erasureCodeMarks } from '../../constants/common'
import { desiredLifetimeOptions } from '../../constants/stamps'
import { TOOLTIPS } from '../../constants/tooltips'
import { calculateStampCapacityMetrics, fmFetchCost, getUsableStamps, handleCreateDrive } from '../../utils/bee'
import { getExpiryDateByLifetime, safeSetState } from '../../utils/common'
import { Button } from '../Button/Button'
import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { FMSlider } from '../Slider/Slider'
import { Tooltip } from '../Tooltip/Tooltip'

import './CreateDriveModal.scss'

const minMarkValue = Math.min(...erasureCodeMarks.map(mark => mark.value))
const maxMarkValue = Math.max(...erasureCodeMarks.map(mark => mark.value))
const maxDriveNameLength = 40

const BATCH_ID_PLACEHOLDER = 'Purchase a new stamp, or reuse one you already own'

const createBatchIdOptions = (stamps: PostageBatch[]) => [
  { label: BATCH_ID_PLACEHOLDER, value: -1 },
  ...stamps.map((stamp, index) => {
    const batchId = stamp.batchID.toHex().slice(0, 8)
    const label = `${batchId}${stamp.label ? ` - ${stamp.label}` : ''}`

    return {
      label,
      value: index,
    }
  }),
]

interface CreateDriveModalProps {
  onCancelClick: () => void
  onDriveCreated: () => void
  onCreationStarted: (driveName: string) => void
  onCreationError: (name: string) => void
}

export function CreateDriveModal({
  onCancelClick,
  onDriveCreated,
  onCreationStarted,
  onCreationError,
}: CreateDriveModalProps): ReactElement {
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)
  const [isBalanceSufficient, setIsBalanceSufficient] = useState(true)
  const [isxDaiBalanceSufficient, setIsxDaiBalanceSufficient] = useState(true)
  const [capacity, setCapacity] = useState(0)
  const [lifetimeIndex, setLifetimeIndex] = useState(-1)
  const [validityEndDate, setValidityEndDate] = useState(new Date())
  const [driveName, setDriveName] = useState('')
  const [capacityIndex, setCapacityIndex] = useState(-1)
  const [encryptionEnabled] = useState(false)
  const [erasureCodeLevel, setErasureCodeLevel] = useState(RedundancyLevel.OFF)
  const [cost, setCost] = useState('0')
  const [usableStamps, setUsableStamps] = useState<PostageBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<PostageBatch | null>(null)
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number>(-1)

  const [sizeMarks, setSizeMarks] = useState<{ value: number; label: string }[]>([])
  const { walletBalance, nodeInfo } = useContext(BeeContext)
  const { beeApi } = useContext(SettingsContext)
  const { fm, drives, expiredDrives, adminDrive } = useContext(FMContext)
  const currentFetch = useRef<Promise<void> | null>(null)
  const isMountedRef = useRef(true)
  const [duplicate, setDuplicate] = useState(false)

  const trimmedName = driveName.trim()
  const allExistingDriveNames = new Set(
    [...(drives || []), ...(expiredDrives || []), ...(adminDrive ? [adminDrive] : [])].map(d => d.name.trim()),
  )
  const nameExists = trimmedName.length > 0 && allExistingDriveNames.has(trimmedName)
  const validationError = duplicate && nameExists ? 'Drive already exists. Please choose another name.' : ''

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (duplicate && !nameExists) {
      setDuplicate(false)
    }
  }, [duplicate, nameExists])

  useEffect(() => {
    const getStamps = async () => {
      if (!beeApi) {
        return
      }

      const stamps = await getUsableStamps(beeApi)

      safeSetState(isMountedRef, setUsableStamps)([...stamps])
    }

    if (beeApi) {
      getStamps()
    }
  }, [beeApi])

  const nonFullStamps = useMemo(() => {
    return usableStamps.filter(s => {
      const { capacityPct } = calculateStampCapacityMetrics(s, [], erasureCodeLevel)

      return capacityPct < 100
    })
  }, [usableStamps, erasureCodeLevel])

  useEffect(() => {
    if (selectedBatchIndex >= 0 && selectedBatchIndex < nonFullStamps.length) {
      setSelectedBatch(nonFullStamps[selectedBatchIndex])
    } else {
      setSelectedBatch(null)
    }
  }, [nonFullStamps, selectedBatchIndex])

  const { capacityPct, usedSize, stampSize } = useMemo(() => {
    if (!selectedBatch) {
      return { capacityPct: 0, usedSize: '—', stampSize: '—' }
    }

    return calculateStampCapacityMetrics(selectedBatch, [], erasureCodeLevel)
  }, [selectedBatch, erasureCodeLevel])

  const handleCapacityChange = (_: number, index: number) => {
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
    if (selectedBatch) {
      setCost('0')
      setIsBalanceSufficient(true)
      setIsxDaiBalanceSufficient(true)
      setIsCreateEnabled(Boolean(trimmedName) && !nameExists)

      return
    }

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
          setIsxDaiBalanceSufficient(true)

          if ((walletBalance && cost.gte(walletBalance.bzzBalance)) || !walletBalance) {
            setIsBalanceSufficient(false)
          }
          setCost(cost.toSignificantDigits(2))

          const zeroDAI = DAI.fromDecimalString('0')

          if ((walletBalance && zeroDAI.eq(walletBalance.nativeTokenBalance)) || !walletBalance) {
            setIsxDaiBalanceSufficient(false)
          }
        },
        currentFetch,
      )

      const canCreate = Boolean(trimmedName) && !nameExists
      setIsCreateEnabled(canCreate)
    } else {
      setCost('0')
      setIsCreateEnabled(false)
    }
  }, [capacity, validityEndDate, beeApi, walletBalance, nameExists, erasureCodeLevel, trimmedName, selectedBatch])

  useEffect(() => {
    setValidityEndDate(getExpiryDateByLifetime(lifetimeIndex))
  }, [lifetimeIndex])

  const isUltraLightNode = nodeInfo?.beeMode === BeeModes.ULTRA_LIGHT
  const isCreateDriveDisabled = isUltraLightNode || !isCreateEnabled || !isBalanceSufficient || !isxDaiBalanceSufficient

  return (
    <div className="fm-modal-container">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Create new drive</div>
        <div className="fm-modal-window-scrollable">
          <div className="fm-modal-window-body">
            <div className="fm-modal-window-input-container">
              <label htmlFor="drive-name" className="fm-input-label">
                Drive name: <Tooltip label={TOOLTIPS.DRIVE_NAME} />
              </label>
              <input
                type="text"
                id="drive-name"
                placeholder="My important files"
                value={driveName}
                onChange={e => setDriveName(e.target.value)}
                onBlur={() => setDuplicate(true)}
                maxLength={maxDriveNameLength}
              />
              {validationError && <div className="fm-error-text">{validationError}</div>}
            </div>
            {nonFullStamps.length > 0 && (
              <div className="fm-modal-window-input-container">
                <CustomDropdown
                  id="drive-batch-id-selector"
                  options={createBatchIdOptions(nonFullStamps)}
                  value={selectedBatchIndex}
                  label="Reuse an existing stamp (optional)"
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
                      Capacity <ProgressBar value={capacityPct} width="64px" /> {usedSize} / {stampSize}
                    </div>
                    <div className="fm-drive-item-capacity">
                      Expiry date: {selectedBatch.duration.toEndDate().toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!selectedBatch && (
              <>
                <div className="fm-modal-window-input-container">
                  <label htmlFor="drive-initial-capacity" className="fm-input-label">
                    Initial capacity: <Tooltip label={TOOLTIPS.DRIVE_INITIAL_CAPACITY} />
                  </label>
                  <CustomDropdown
                    id="drive-initial-capacity"
                    options={sizeMarks}
                    value={capacity}
                    onChange={handleCapacityChange}
                    placeholder="Select a value"
                  />
                </div>
                <div className="fm-modal-info-warning">
                  Drive sizes are calculated automatically from your current stamp configuration.
                </div>
                <div className="fm-modal-window-input-container">
                  <label htmlFor="drive-desired-lifetime" className="fm-input-label">
                    Desired lifetime: <Tooltip label={TOOLTIPS.DRIVE_DESIRED_LIFETIME} />
                  </label>
                  <CustomDropdown
                    id="drive-desired-lifetime"
                    options={desiredLifetimeOptions}
                    value={lifetimeIndex}
                    onChange={setLifetimeIndex}
                    placeholder="Select a value"
                  />
                </div>
              </>
            )}
            <div className="fm-modal-window-input-container">
              <label htmlFor="drive-security-level" className="fm-input-label">
                Security Level <Tooltip label={TOOLTIPS.DRIVE_SECURITY_LEVEL} />
              </label>
              <FMSlider
                id="drive-security-level"
                defaultValue={0}
                marks={erasureCodeMarks}
                onChange={value => setErasureCodeLevel(value)}
                minValue={minMarkValue}
                maxValue={maxMarkValue}
                step={1}
              />
            </div>

            {!selectedBatch && (
              <div>
                <div className="fm-modal-estimated-cost-container">
                  <div className="fm-emphasized-text">Estimated Cost:</div>
                  <div>
                    {cost} BZZ {isBalanceSufficient ? '' : '(Insufficient balance)'}
                    {isxDaiBalanceSufficient ? '' : ' (Insufficient xDAI balance)'}
                  </div>
                  <Tooltip label={TOOLTIPS.DRIVE_ESTIMATED_COST} bottomTooltip={true} />
                </div>
                <div>(Based on current network conditions)</div>
              </div>
            )}
            {isUltraLightNode && (
              <div>
                Creating a drive requires running a light node. Please{' '}
                <a
                  href="https://docs.ethswarm.org/docs/desktop/configuration/#upgrading-from-an-ultra-light-to-a-light-node"
                  target="_blank"
                  rel="noreferrer"
                >
                  upgrade
                </a>{' '}
                to continue.
              </div>
            )}
          </div>
        </div>
        <div className="fm-modal-window-footer">
          <Button
            label={selectedBatch ? 'Create drive' : 'Purchase Stamp & Create drive'}
            variant="primary"
            disabled={isCreateDriveDisabled}
            onClick={async () => {
              if (!trimmedName || nameExists) {
                setDuplicate(true)

                return
              }

              if (isCreateEnabled && (selectedBatch || walletBalance) && adminDrive) {
                onCreationStarted(driveName)
                onCancelClick()

                await handleCreateDrive({
                  beeApi,
                  fm,
                  size: Size.fromBytes(capacity),
                  duration: Duration.fromEndDate(validityEndDate),
                  label: trimmedName,
                  encryption: encryptionEnabled,
                  redundancyLevel: erasureCodeLevel,
                  adminRedundancy: adminDrive?.redundancyLevel,
                  isAdmin: false,
                  resetState: false,
                  existingBatch: selectedBatch,
                  onSuccess: () => onDriveCreated(),
                  onError: () => onCreationError(trimmedName),
                })
              }
            }}
          />
          <Button label="Cancel" variant="secondary" onClick={onCancelClick} />
        </div>
      </div>
    </div>
  )
}

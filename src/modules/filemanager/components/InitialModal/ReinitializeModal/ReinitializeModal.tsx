import { ReactElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import '../InitialModal.scss'
import { BZZ, Duration, PostageBatch, RedundancyLevel, Size, Utils } from '@ethersphere/bee-js'
import { CustomDropdown } from '../../CustomDropdown/CustomDropdown'
import { Button } from '../../Button/Button'
import { calculateStampCapacityMetrics, fmFetchCost, getUsableStamps, handleCreateDrive } from '../../../utils/bee'
import { getExpiryDateByLifetime, safeSetState } from '../../../utils/common'
import { erasureCodeMarks } from '../../../constants/common'
import { desiredLifetimeOptions } from '../../../constants/stamps'
import { Context as SettingsContext } from '../../../../../providers/Settings'
import { Context as BeeContext } from '../../../../../providers/Bee'
import { FMSlider } from '../../Slider/Slider'
import { Context as FMContext } from '../../../../../providers/FileManager'
import { ADMIN_STAMP_LABEL } from '@solarpunkltd/file-manager-lib'
import { ProgressBar } from '../../ProgressBar/ProgressBar'

interface ReinitializeModalProps {
  onConfirm: () => void
  onCancel: () => void
}

const minMarkValue = Math.min(...erasureCodeMarks.map(mark => mark.value))
const maxMarkValue = Math.max(...erasureCodeMarks.map(mark => mark.value))

const BATCH_ID_PLACEHOLDER = 'Select a batch ID'

const createBatchIdOptions = (usableStamps: PostageBatch[]) => [
  { label: BATCH_ID_PLACEHOLDER, value: -1 },
  ...usableStamps.map((stamp, index) => {
    const batchId = stamp.batchID.toHex().slice(0, 8)
    const label = `${batchId}${stamp.label ? ` - ${stamp.label}` : ''}`

    return { label, value: index }
  }),
]

export function ReinitializeModal({ onConfirm, onCancel }: ReinitializeModalProps): ReactElement {
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)
  const [isBalanceSufficient, setIsBalanceSufficient] = useState(true)
  const [capacity, setCapacity] = useState(0)
  const [lifetimeIndex, setLifetimeIndex] = useState(0)
  const [validityEndDate, setValidityEndDate] = useState(new Date())
  const [erasureCodeLevel, setErasureCodeLevel] = useState(RedundancyLevel.OFF)
  const [cost, setCost] = useState('0')
  const [usableStamps, setUsableStamps] = useState<PostageBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<PostageBatch | null>(null)
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number>(-1)

  const { walletBalance } = useContext(BeeContext)
  const { beeApi } = useContext(SettingsContext)
  const { fm } = useContext(FMContext)

  const currentFetch = useRef<Promise<void> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

  const handleReinitialize = useCallback(async () => {
    await handleCreateDrive(
      beeApi,
      fm,
      Size.fromBytes(capacity),
      Duration.fromEndDate(validityEndDate),
      ADMIN_STAMP_LABEL,
      false,
      erasureCodeLevel,
      true,
      selectedBatch,
      onConfirm,
      onConfirm,
      // eslint-disable-next-line no-console
      () => console.error('Reinitialization failed'),
    )
  }, [beeApi, fm, capacity, validityEndDate, erasureCodeLevel, selectedBatch, onConfirm])

  useEffect(() => {
    const getStamps = async () => {
      const stamps = await getUsableStamps(beeApi)
      safeSetState(isMountedRef, setUsableStamps)([...stamps])
    }

    if (beeApi) getStamps()
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
        (cost: BZZ) => {
          setIsBalanceSufficient(true)

          if ((walletBalance && cost.gte(walletBalance.bzzBalance)) || !walletBalance) {
            safeSetState(isMountedRef, setIsBalanceSufficient)(false)
          }
          safeSetState(isMountedRef, setCost)(cost.toSignificantDigits(2))
        },
        currentFetch,
      )

      if (lifetimeIndex >= 0) setIsCreateEnabled(true)
    } else {
      setCost('0')
      setIsCreateEnabled(false)
    }
  }, [validityEndDate, beeApi, capacity, erasureCodeLevel, lifetimeIndex, walletBalance])

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

  const { capacityPct, usedSize, totalSize } = useMemo(
    () => calculateStampCapacityMetrics(selectedBatch),
    [selectedBatch],
  )

  return (
    <div className="fm-initialization-modal-container">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Admin Drive Expired</div>
        <div className="fm-modal-window-body">
          <p>
            We detected that your <b>admin drive</b> has expired. To continue using the File Manager, you need to
            reinitialize a new state.
          </p>
          <p className="fm-warning-text">
            <b>Warning:</b> All previous data will be permanently lost after reinitialization.
          </p>

          <div className="fm-modal-window-input-container">
            <CustomDropdown
              id="batch-id-selector"
              label="Select an existing batch ID or create a new stamp:"
              options={createBatchIdOptions(usableStamps)}
              value={selectedBatchIndex}
              onChange={(index: number) => setSelectedBatchIndex(index)}
              placeholder={BATCH_ID_PLACEHOLDER}
            />
            {selectedBatch && (
              <div className="fm-drive-item-content">
                <div className="fm-drive-item-capacity">
                  Capacity <ProgressBar value={capacityPct} width="64px" /> {usedSize} / {totalSize}
                </div>
                <div className="fm-drive-item-capacity">
                  Expiry date: {selectedBatch.duration.toEndDate().toLocaleDateString()}
                </div>
              </div>
            )}
          </div>

          {!selectedBatch && (
            <>
              <div className="fm-modal-window-input-container">
                <CustomDropdown
                  id="drive-type"
                  label="Desired lifetime:"
                  options={desiredLifetimeOptions}
                  value={lifetimeIndex}
                  onChange={setLifetimeIndex}
                  placeholder="Select a value"
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

              <div className="fm-modal-window-cost">
                Estimated Cost: {cost} BZZ {isBalanceSufficient ? '' : '(Insufficient balance)'}
              </div>
            </>
          )}
        </div>

        <div className="fm-modal-window-footer">
          <Button
            label={selectedBatch ? 'Reinitialize' : 'Buy Stamp & Reinitialize'}
            variant="primary"
            disabled={selectedBatch ? false : !isCreateEnabled || !isBalanceSufficient}
            onClick={handleReinitialize}
          />
          <Button label="Cancel" variant="secondary" onClick={onCancel} />
        </div>
      </div>
    </div>
  )
}

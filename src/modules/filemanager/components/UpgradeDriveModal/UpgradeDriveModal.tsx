/* eslint-disable no-console */
import { ReactElement, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import './UpgradeDriveModal.scss'
import '../../styles/global.scss'
import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { Button } from '../Button/Button'
import { createPortal } from 'react-dom'
import DriveIcon from 'remixicon-react/HardDrive2LineIcon'
import DatabaseIcon from 'remixicon-react/Database2LineIcon'
import WalletIcon from 'remixicon-react/Wallet3LineIcon'
import ExternalLinkIcon from 'remixicon-react/ExternalLinkLineIcon'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import { desiredLifetimeOptions } from '../../constants/common'
import { Context as BeeContext } from '../../../../providers/Bee'
import { ByteMetric, fromBytesConversion, getExpiryDateByLifetime } from '../../utils/common'
import { Context as SettingsContext } from '../../../../providers/Settings'
import {
  BatchId,
  BeeRequestOptions,
  capacityBreakpoints,
  Duration,
  PostageBatch,
  RedundancyLevel,
  Size,
  Utils,
} from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { SELECT_VALUE_LABEL } from '../../constants/common'

interface UpgradeDriveModalProps {
  stamp: PostageBatch
  drive: DriveInfo
  onCancelClick: () => void
  containerColor?: string
}

const defaultErasureCodeLevel = RedundancyLevel.OFF
const encryption_off = 'ENCRYPTION_OFF'

export function UpgradeDriveModal({
  stamp,
  onCancelClick,
  containerColor,
  drive,
}: UpgradeDriveModalProps): ReactElement {
  const { nodeAddresses, walletBalance } = useContext(BeeContext)
  const [capacity, setCapacity] = useState(Size.fromBytes(0))
  const [capacityExtensionCost, setCapacityExtensionCost] = useState('')
  const [capacityIndex, setCapacityIndex] = useState(0)
  const [durationExtensionCost, setDurationExtensionCost] = useState('')
  const [lifetimeIndex, setLifetimeIndex] = useState(0)

  const [validityEndDate, setValidityEndDate] = useState(new Date())
  const { beeApi } = useContext(SettingsContext)
  const modalRoot = document.querySelector('.fm-main') || document.body
  const [sizeMarks, setSizeMarks] = useState<{ value: number; label: string }[]>([])
  const [extensionCost, setExtensionCost] = useState('0')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCapacityChange = (value: number, index: number) => {
    setCapacity(Size.fromBytes(value))
    setCapacityIndex(index)
  }

  const handleCostCalculation = useCallback(
    async (
      batchId: BatchId,
      capacity: Size,
      duration: Duration,
      options: BeeRequestOptions | undefined,
      encryption: boolean,
      erasureCodeLevel: RedundancyLevel,
      isCapacityExtensionSet: boolean,
      isDurationExtensionSet: boolean,
    ) => {
      const cost = await beeApi?.getExtensionCost(batchId, capacity, duration, options, encryption, erasureCodeLevel)
      const costText = cost ? cost.toSignificantDigits(2) : '0'

      if (isCapacityExtensionSet && isDurationExtensionSet) {
        setDurationExtensionCost('')
        setCapacityExtensionCost('')
        setExtensionCost(costText)
      } else if (!isCapacityExtensionSet && isDurationExtensionSet) {
        setCapacityExtensionCost('0')
        setDurationExtensionCost(costText)
        setExtensionCost(costText)
      } else if (isCapacityExtensionSet && !isDurationExtensionSet) {
        setDurationExtensionCost('0')
        setCapacityExtensionCost(costText)
        setExtensionCost(costText)
      } else {
        setDurationExtensionCost('0')
        setCapacityExtensionCost('0')
        setExtensionCost('0')
      }
    },
    [beeApi],
  )

  useEffect(() => {
    const fetchSizes = () => {
      const sizes = Array.from(Utils.getStampEffectiveBytesBreakpoints(false, defaultErasureCodeLevel).values())

      const capacityValues = capacityBreakpoints[encryption_off][defaultErasureCodeLevel]
      const fromIndex = capacityValues.findIndex(item => item.batchDepth === stamp.depth)

      const newSizes = sizes.slice(fromIndex + 1)

      const updatedSizes = [
        { value: 0, label: SELECT_VALUE_LABEL },
        ...newSizes.map(size => {
          const metric = size >= 1000 ? ByteMetric.GB : ByteMetric.MB
          const convertedSize = fromBytesConversion(size - stamp.size.toBytes(), metric).toFixed(3)

          return {
            value: size,
            label: `${convertedSize} ${metric}`,
          }
        }),
      ]
      setSizeMarks(updatedSizes)
    }

    fetchSizes()
  }, [stamp.depth, stamp.size])

  useEffect(() => {
    let isCapacitySet = false
    let isDurationSet = false
    let duration = Duration.ZERO
    const fetchExtensionCost = () => {
      if (capacityIndex !== 0 && lifetimeIndex !== 0) {
        isCapacitySet = true
        isDurationSet = true
        duration = Duration.fromEndDate(validityEndDate)
      } else if (capacityIndex !== 0 && lifetimeIndex === 0) {
        isCapacitySet = true
        isDurationSet = false
        duration = Duration.ZERO
      } else if (capacityIndex === 0 && lifetimeIndex !== 0) {
        isCapacitySet = false
        isDurationSet = true
        duration = Duration.fromEndDate(validityEndDate)
      } else {
        isCapacitySet = false
        isDurationSet = false
      }
      handleCostCalculation(
        stamp.batchID,
        capacity,
        duration,
        undefined,
        false,
        defaultErasureCodeLevel,
        isCapacitySet,
        isDurationSet,
      )
    }
    fetchExtensionCost()
  }, [capacity, validityEndDate, capacityIndex, handleCostCalculation, lifetimeIndex, stamp.batchID])

  useEffect(() => {
    setValidityEndDate(getExpiryDateByLifetime(lifetimeIndex, stamp.duration.toEndDate()))
  }, [lifetimeIndex, stamp.duration])

  const additionalInfo = useMemo(() => {
    let additionalCapacityText = ''
    let additionalDurationText = ''

    if (capacity.toBytes() === 0) {
      additionalCapacityText = 'Not selected'
    } else {
      const additionalCapacityBytes = Math.max(capacity.toBytes() - stamp.size.toBytes(), 0)
      const metric = additionalCapacityBytes >= 1000 ? ByteMetric.GB : ByteMetric.MB
      additionalCapacityText = fromBytesConversion(additionalCapacityBytes, metric).toFixed(3) + ' ' + metric
    }

    if (durationExtensionCost !== '') {
      additionalDurationText = '(' + extensionCost + ' xBZZ)'
    }

    console.log('bagoy extensionCost: ', extensionCost)

    return additionalCapacityText + additionalDurationText
  }, [capacity, stamp.size, durationExtensionCost, extensionCost])

  const batchIdStr = stamp.batchID.toString()
  const shortBatchId = batchIdStr.length > 12 ? `${batchIdStr.slice(0, 4)}...${batchIdStr.slice(-4)}` : batchIdStr

  return createPortal(
    <div className={`fm-modal-container${containerColor === 'none' ? ' fm-modal-container-no-bg' : ''}`}>
      <div className="fm-modal-window fm-upgrade-drive-modal">
        <div className="fm-modal-window-header">
          <DriveIcon size="18px" /> Upgrade {drive.name || stamp.label || shortBatchId}
        </div>
        <div>Choose extension period and additional storage for your drive.</div>
        <div className="fm-modal-window-body">
          <div className="fm-upgrade-drive-modal-wallet">
            <div className="fm-upgrade-drive-modal-wallet-header fm-emphasized-text">
              <WalletIcon size="14px" color="rgb(237, 129, 49)" /> Wallet information
            </div>
            {walletBalance && nodeAddresses ? (
              <div className="fm-upgrade-drive-modal-wallet-info-container">
                <div className="fm-upgrade-drive-modal-wallet-info">
                  <div>Balance</div>
                  <div>{`${walletBalance.bzzBalance.toSignificantDigits(4)} xBZZ`}</div>
                </div>
                <div className="fm-upgrade-drive-modal-wallet-info">
                  <div>Wallet address:</div>
                  <div className="fm-value-snippet">{`${walletBalance.walletAddress.slice(
                    0,
                    4,
                  )}...${walletBalance.walletAddress.slice(-4)}`}</div>
                </div>
              </div>
            ) : (
              <div>Wallet information is not available</div>
            )}
            <div className="fm-upgrade-drive-modal-info fm-swarm-orange-font">
              <a
                className="fm-upgrade-drive-modal-info-link fm-pointer"
                href="https://www.ethswarm.org/get-bzz#how-to-get-bzz"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon size="14px" />
                Need help topping up?
              </a>
            </div>
          </div>
        </div>
        <div className="fm-modal-window-body">
          <div className="fm-upgrade-drive-modal-input-row">
            <div className="fm-modal-window-input-container">
              <CustomDropdown
                id="drive-type"
                label="Additional storage"
                icon={<DatabaseIcon size="14px" color="rgb(237, 129, 49)" />}
                options={sizeMarks}
                value={capacity.toBytes()}
                onChange={handleCapacityChange}
                placeholder={SELECT_VALUE_LABEL}
              />
            </div>
            <div className="fm-modal-window-input-container">
              <CustomDropdown
                id="drive-type"
                label="Duration"
                icon={<CalendarIcon size="14px" color="rgb(237, 129, 49)" />}
                options={desiredLifetimeOptions}
                value={lifetimeIndex}
                onChange={(value, index) => {
                  setLifetimeIndex(value)
                }}
                placeholder={SELECT_VALUE_LABEL}
              />
            </div>
          </div>

          <div className="fm-modal-white-section">
            <div className="fm-emphasized-text">Summary</div>
            <div>Drive: {drive.name}</div>
            <div>
              BatchId: {stamp.label} ({shortBatchId})
            </div>
            <div>Expiry: {stamp.duration.toEndDate().toLocaleDateString()}</div>
            <div>Additional storage: {additionalInfo}</div>
            <div>
              Extension period:{' '}
              {durationExtensionCost === '0'
                ? 'Not selected'
                : `${desiredLifetimeOptions[lifetimeIndex]?.label} ${
                    capacityExtensionCost === '' ? '' : '(' + extensionCost + ' xBZZ)'
                  }`}
            </div>

            <div className="fm-upgrade-drive-modal-info fm-emphasized-text">
              Total: <span className="fm-swarm-orange-font">{extensionCost} xBZZ</span>
            </div>
          </div>
        </div>
        <div className="fm-modal-window-footer">
          <Button
            label={isSubmitting ? 'Confirming…' : 'Confirm upgrade'}
            variant="primary"
            disabled={extensionCost === '0' || isSubmitting}
            onClick={async () => {
              if (!beeApi) return
              try {
                setIsSubmitting(true)
                window.dispatchEvent(
                  new CustomEvent('fm:drive-upgrade-start', {
                    detail: { driveId: drive.id.toString() },
                  }),
                )

                onCancelClick()

                await beeApi.extendStorage(
                  stamp.batchID,
                  capacity,
                  durationExtensionCost === '0'
                    ? Duration.ZERO
                    : Duration.fromEndDate(validityEndDate, stamp.duration.toEndDate()),
                  undefined,
                  false,
                  defaultErasureCodeLevel,
                )

                window.dispatchEvent(
                  new CustomEvent('fm:drive-upgrade-end', {
                    detail: { driveId: drive.id.toString(), success: true },
                  }),
                )
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Upgrade failed'
                window.dispatchEvent(
                  new CustomEvent('fm:drive-upgrade-end', {
                    detail: { driveId: drive.id.toString(), success: false, error: msg },
                  }),
                )
              }
            }}
          />
          <Button label="Cancel" variant="secondary" disabled={isSubmitting} onClick={onCancelClick} />
        </div>

        {isSubmitting && (
          <div className="fm-drive-item-creating-overlay">
            <div className="fm-mini-spinner" />
            <span>Please wait…</span>
          </div>
        )}
      </div>
    </div>,
    modalRoot,
  )
}

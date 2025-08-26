import { ReactElement, useContext, useEffect, useState } from 'react'
import './UpgradeDriveModal.scss'
import '../../styles/global.scss'
import { CustomDropdown } from '../CustomDropdown/CustomDropdown'
import { FMButton } from '../FMButton/FMButton'
import { createPortal } from 'react-dom'
import DriveIcon from 'remixicon-react/HardDrive2LineIcon'
import DatabaseIcon from 'remixicon-react/Database2LineIcon'
import WalletIcon from 'remixicon-react/Wallet3LineIcon'
import ExternalLinkIcon from 'remixicon-react/ExternalLinkLineIcon'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import { desiredLifetimeOptions } from '../../constants/constants'
import { Context as BeeContext } from '../../../../providers/Bee'
import { fromBytesConversion, getExpiryDateByLifetime } from '../../utils/utils'
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

interface UpgradeDriveModalProps {
  stamp: PostageBatch
  onCancelClick: () => void
  containerColor?: string
}

export function UpgradeDriveModal({ stamp, onCancelClick, containerColor }: UpgradeDriveModalProps): ReactElement {
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

  // TODO: Mocked erasure code level, the erasure codel should be fetched from stamp metadata
  const mockedErasureCodeLevel = RedundancyLevel.OFF
  // TODO: Flag for a mocked encryption, the encryption setting should be fetched from stamp metadata
  const mockedEncryption = 'ENCRYPTION_OFF'

  const handleCapacityChange = (value: number, index: number) => {
    setCapacity(Size.fromBytes(value))
    setCapacityIndex(index)
  }

  const handleCostCalculation = async (
    batchId: BatchId,
    capacity: Size,
    duration: Duration,
    options: BeeRequestOptions | undefined,
    encryption: boolean,
    erasureCodeLevel: RedundancyLevel,
    isCapacityExtensionSet: boolean,
    isDurationExtensionSet: boolean,
  ) => {
    const cost = await beeApi?.getExtensionCost(batchId, capacity, duration, undefined, false, mockedErasureCodeLevel)
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
  }

  useEffect(() => {
    const fetchSizes = async () => {
      const sizes = Array.from(await Utils.getStampEffectiveBytesBreakpoints(false, mockedErasureCodeLevel).values())

      const capacityValues = capacityBreakpoints[mockedEncryption][mockedErasureCodeLevel]
      const fromIndex = capacityValues.findIndex(item => item.batchDepth === stamp.depth)

      const newSizes = sizes.slice(fromIndex + 1)

      const updatedSizes = [
        { value: 0, label: 'Select a value' },
        ...newSizes.map(size => ({
          value: size,
          label: `${fromBytesConversion(size - stamp.size.toBytes(), 'GB').toFixed(3)} GB`,
        })),
      ]
      setSizeMarks(updatedSizes)
    }

    fetchSizes()
  }, [])

  useEffect(() => {
    const fetchExtensionCost = () => {
      if (capacityIndex !== 0 && lifetimeIndex !== 0) {
        handleCostCalculation(
          stamp.batchID,
          capacity,
          Duration.fromEndDate(validityEndDate),
          undefined,
          false,
          mockedErasureCodeLevel,
          true,
          true,
        )
      } else if (capacityIndex !== 0 && lifetimeIndex === 0) {
        handleCostCalculation(
          stamp.batchID,
          capacity,
          Duration.ZERO,
          undefined,
          false,
          mockedErasureCodeLevel,
          true,
          false,
        )
      } else if (capacityIndex === 0 && lifetimeIndex !== 0) {
        handleCostCalculation(
          stamp.batchID,
          capacity,
          Duration.fromEndDate(validityEndDate),
          undefined,
          false,
          mockedErasureCodeLevel,
          false,
          true,
        )
      } else {
        setDurationExtensionCost('0')
        setCapacityExtensionCost('0')
        setExtensionCost('0')
      }
    }
    fetchExtensionCost()
  }, [capacity, validityEndDate])

  useEffect(() => {
    setValidityEndDate(getExpiryDateByLifetime(lifetimeIndex, stamp.duration.toEndDate()))
  }, [lifetimeIndex])

  const batchIdStr = stamp.batchID.toString()
  const shortBatchId = batchIdStr.length > 12 ? `${batchIdStr.slice(0, 4)}...${batchIdStr.slice(-4)}` : batchIdStr

  return createPortal(
    <div className={`fm-modal-container${containerColor === 'none' ? ' fm-modal-container-no-bg' : ''}`}>
      <div className="fm-modal-window fm-upgrade-drive-modal">
        <div className="fm-modal-window-header">
          <DriveIcon size="18px" /> Upgrade {stamp?.label || shortBatchId}
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
                placeholder="Select a value"
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
                placeholder="Select a value"
              />
            </div>
          </div>

          <div className="fm-modal-white-section">
            <div className="fm-emphasized-text">Summary</div>
            <div>Drive: {stamp?.label || shortBatchId}</div>
            <div>
              Additional storage:{' '}
              {capacity.toBytes() === 0
                ? 'Not selected'
                : `${
                    fromBytesConversion(Math.max(capacity.toBytes() - stamp.size.toBytes(), 0), 'GB').toFixed(3) + ' GB'
                  } ${durationExtensionCost === '' ? '' : '(' + extensionCost + ' xBZZ)'}`}
            </div>
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
          <FMButton
            label="Confirm upgrade"
            variant="primary"
            disabled={extensionCost === '0'}
            onClick={() => {
              beeApi?.extendStorage(
                stamp.batchID,
                capacity,
                durationExtensionCost === '0'
                  ? Duration.ZERO
                  : Duration.fromEndDate(validityEndDate, stamp.duration.toEndDate()),
                undefined,
                false,
                mockedErasureCodeLevel,
              )
              onCancelClick()
            }}
          />
          <FMButton label="Cancel" variant="secondary" onClick={onCancelClick} />
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

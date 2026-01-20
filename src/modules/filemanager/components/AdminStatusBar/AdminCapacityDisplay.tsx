import { ReactElement } from 'react'
import { ProgressBar } from '../ProgressBar/ProgressBar'

interface AdminCapacityDisplayProps {
  capacityPct: number
  usedSize: string
  totalSize: string
  isUpgrading: boolean
}

export function AdminCapacityDisplay({
  capacityPct,
  usedSize,
  totalSize,
  isUpgrading,
}: AdminCapacityDisplayProps): ReactElement {
  return (
    <div
      className={`fm-drive-item-capacity ${isUpgrading ? 'fm-drive-item-capacity-updating' : ''}`}
      title={isUpgrading ? 'Capacity is updating... This may take a few moments.' : ''}
    >
      Capacity <ProgressBar value={capacityPct} width="150px" /> {usedSize} / {totalSize}
    </div>
  )
}

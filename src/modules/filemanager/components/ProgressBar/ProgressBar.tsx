import { ReactElement } from 'react'

import './ProgressBar.scss'

interface ProgressBarProps {
  value: number
  width?: string
  color?: string
  backgroundColor?: string
}
// TODO: seems wierd for the user 0.0000015745 / 0.68 GB
export function ProgressBar({
  value,
  width = '200px',
  color = '#ed8131',
  backgroundColor = 'white',
}: ProgressBarProps): ReactElement {
  return (
    <div className="fm-progress-bar" style={{ width: `${width}`, backgroundColor: `${backgroundColor}` }}>
      <div className="fm-progress-bar-fill" style={{ width: `${value}%`, backgroundColor: `${color}` }}></div>
    </div>
  )
}

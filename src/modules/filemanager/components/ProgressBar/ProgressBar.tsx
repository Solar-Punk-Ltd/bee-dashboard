import { ReactElement } from 'react'

import './ProgressBar.scss'

interface ProgressBarProps {
  value: number
  width?: number
  color?: string
  backgroundColor?: string
}

export function ProgressBar({
  value,
  width = 200,
  color = '#ed8131',
  backgroundColor = 'white',
}: ProgressBarProps): ReactElement {
  return (
    <div className="fm-progress-bar" style={{ width: `${width}px`, backgroundColor: `${backgroundColor}` }}>
      <div className="fm-progress-bar-fill" style={{ width: `${value}%`, backgroundColor: `${color}` }}></div>
    </div>
  )
}

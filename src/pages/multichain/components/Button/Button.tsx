import { ReactElement } from 'react'

import './Button.scss'

interface ButtonProps {
  label: string
  onClick?: () => void
  icon?: ReactElement
  size?: 'small' | 'medium'
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  width?: number
}

// TODO: move to a common component
export function Button({
  label,
  onClick,
  icon,
  size = 'medium',
  variant = 'primary',
  disabled,
  width,
}: ButtonProps): ReactElement {
  return (
    <div
      className={`multichain-button multichain-button-${variant} multichain-button-${size}${icon ? ' multichain-button-icon' : ''}${
        disabled ? ' multichain-button-disabled' : ''
      }`}
      onClick={disabled ? undefined : onClick}
      style={{ width: width ? `${width}px` : undefined }}
    >
      {icon} {label}
    </div>
  )
}

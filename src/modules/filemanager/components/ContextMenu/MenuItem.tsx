import React, { ReactElement } from 'react'

import './ContextMenu.scss'

interface MenuItemProps {
  disabled?: boolean
  danger?: boolean
  onClick?: () => void
  children: React.ReactNode
}

/** A single row inside a {@link ContextMenu}. Shared so file and folder menus look identical. */
export function MenuItem({ disabled, danger, onClick, children }: MenuItemProps): ReactElement {
  return (
    <div
      className={`fm-context-item${danger ? ' red' : ''}`}
      aria-disabled={disabled ? 'true' : 'false'}
      style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </div>
  )
}

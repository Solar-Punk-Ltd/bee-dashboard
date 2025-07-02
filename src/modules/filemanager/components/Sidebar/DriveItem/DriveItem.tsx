import { ReactElement, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Drive from 'remixicon-react/HardDrive2LineIcon'
import DriveFill from 'remixicon-react/HardDrive2FillIcon'
import MoreFill from 'remixicon-react/MoreFillIcon'
import './DriveItem.scss'
import { ProgressBar } from '../../ProgressBar/ProgressBar'
import { ActionButton } from '../../ActionButton/ActionButton'
import { ContextMenu } from '../../ContextMenu/ContextMenu'

export function DriveItem(): ReactElement {
  const [isHovered, setIsHovered] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const contextRef = useRef<HTMLDivElement | null>(null)

  function handleMoreClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setShowContext(true)
    setPos({
      x: e.clientX,
      y: e.clientY,
    })
  }

  function handleCloseContext() {
    setShowContext(false)
  }

  // Ha a context menün kívül kattintunk, zárjuk be
  useEffect(() => {
    if (!showContext) return

    function handleDocumentClick(e: MouseEvent) {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setShowContext(false)
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)

    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [showContext])

  return (
    <div className="fm-drive-item-container" style={{ position: 'relative' }}>
      <div
        className="fm-drive-item-info"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="fm-drive-item-header">
          <div className="fm-drive-item-icon">
            {isHovered ? <DriveFill size="16px"></DriveFill> : <Drive size="16px"></Drive>}
          </div>
          <div>Drive A</div>
        </div>
        <div className="fm-drive-item-content">
          <div className="fm-drive-item-capacity">
            Capacity <ProgressBar value={20} width={64}></ProgressBar> 8.7 GB/10 GB
          </div>
          <div className="fm-drive-item-capacity">Expiry date 2025-08-20</div>
        </div>
      </div>
      <div className="fm-drive-item-actions">
        <span style={{ position: 'relative' }}>
          <MoreFill size="13" style={{ cursor: 'pointer' }} onClick={handleMoreClick} />
          {showContext &&
            createPortal(
              <div
                ref={contextRef}
                style={{
                  position: 'fixed',
                  top: pos.y,
                  left: pos.x,
                  zIndex: 1000,
                }}
              >
                <ContextMenu>
                  <div className="fm-context-item" onClick={handleCloseContext}>
                    Rename
                  </div>
                  <div className="fm-context-item" style={{ color: 'rgb(220, 38, 38)' }} onClick={handleCloseContext}>
                    Destroy entire drive
                  </div>
                </ContextMenu>
              </div>,
              document.body,
            )}
        </span>
        <ActionButton label="Upgrade" fontSize="10px"></ActionButton>
      </div>
    </div>
  )
}

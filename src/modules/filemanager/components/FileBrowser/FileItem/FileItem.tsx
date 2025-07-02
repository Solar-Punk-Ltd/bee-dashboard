import { ReactElement, useState, useRef, useEffect } from 'react'
import './FileItem.scss'
import { GetIconElement } from '../../../utils/GetIconElement'
import { ContextMenu } from '../../ContextMenu/ContextMenu'

interface FileItemProps {
  icon: string
  name: string
  size: string
  dateMod: string
}

export function FileItem({ icon, name, size, dateMod }: FileItemProps): ReactElement {
  const [showContext, setShowContext] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const contextRef = useRef<HTMLDivElement | null>(null)

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    setShowContext(true)
    setPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  function handleClick() {
    setShowContext(false)
  }

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
    <div
      className="fm-file-item-content"
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      style={{ position: 'relative' }}
    >
      <div className="fm-file-item-content-item fm-checkbox">
        <input type="checkbox" style={{ accentColor: 'rgb(237,129,49)' }} />
      </div>
      <div className="fm-file-item-content-item fm-name">
        <GetIconElement icon={icon}></GetIconElement>
        {name}
      </div>
      <div className="fm-file-item-content-item fm-size">{size}</div>
      <div className="fm-file-item-content-item fm-date-mod">{dateMod}</div>
      {showContext && (
        <div
          ref={contextRef}
          style={{
            position: 'absolute',
            top: pos.y,
            left: pos.x,
            zIndex: 1000,
          }}
        >
          <ContextMenu>
            <div className="fm-context-item">View / Open</div>
            <div className="fm-context-item">Download</div>
            <div className="fm-context-item">Rename</div>
            <div className="fm-context-item-border"></div>
            <div className="fm-context-item">Version history</div>
            <div className="fm-context-item" style={{ color: 'rgb(220, 38, 38)' }}>
              Delete
            </div>
            <div className="fm-context-item-border"></div>
            <div className="fm-context-item">Get info</div>
          </ContextMenu>
        </div>
      )}
    </div>
  )
}

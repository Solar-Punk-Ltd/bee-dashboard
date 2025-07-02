import { ReactElement, useState, useRef, useEffect } from 'react'
import './FileBrowser.scss'
import { FileBrowserTopBar } from './FileBrowserTopBar/FileBrowserTopBar'
import DownIcon from 'remixicon-react/ArrowDownSLineIcon'
import UpIcon from 'remixicon-react/ArrowUpSLineIcon'
import { FileItem } from './FileItem/FileItem'
import { ContextMenu } from '../ContextMenu/ContextMenu'

export function FileBrowser(): ReactElement {
  const [showContext, setShowContext] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const contextRef = useRef<HTMLDivElement | null>(null)

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('.fm-file-item-content')) {
      return
    }
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
    <div className="fm-file-browser-container">
      <FileBrowserTopBar label="Drive A" />
      <div className="fm-file-browser-content">
        <div className="fm-file-browser-content-header">
          <div className="fm-file-browser-content-header-item fm-checkbox">
            <input type="checkbox" style={{ accentColor: 'rgb(237,129,49)' }} />
          </div>
          <div className="fm-file-browser-content-header-item fm-name">
            Name
            <div className="fm-file-browser-content-header-item-icon">
              <DownIcon size="16px" />
            </div>
          </div>
          <div className="fm-file-browser-content-header-item fm-size">
            Size
            <div className="fm-file-browser-content-header-item-icon">
              <DownIcon size="16px" />
            </div>
          </div>
          <div className="fm-file-browser-content-header-item fm-date-mod">
            Date mod.
            <div className="fm-file-browser-content-header-item-icon">
              <DownIcon size="16px" />
            </div>
          </div>
        </div>
        <div
          className="fm-file-browser-content-body"
          style={{ flex: '1 1 auto', position: 'relative' }}
          onContextMenu={handleContextMenu}
          onClick={handleClick}
        >
          <FileItem icon="image" name="File1.jpg" size="1.2MB" dateMod="2025-05-19" />
          <FileItem icon="doc" name="Report.pdf" size="0.5MB" dateMod="2025-05-25" />
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
                <div className="fm-context-item">New folder</div>
                <div className="fm-context-item">Upload file</div>
                <div className="fm-context-item">Upload folder</div>
                <div className="fm-context-item-border"></div>
                <div className="fm-context-item">Paste</div>
                <div className="fm-context-item-border"></div>
                <div className="fm-context-item">Refresh</div>
              </ContextMenu>
            </div>
          )}
        </div>
        <div className="fm-file-browser-content-footer">
          <div style={{ textDecoration: 'underline' }}>Uploading file_x.zip (67%)...</div>
          <div style={{ textDecoration: 'underline' }}>Downloading Report.pdf (45%)...</div>
          <div>2 Drives expiring soon</div>
        </div>
      </div>
    </div>
  )
}

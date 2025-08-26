import { ReactElement, useState } from 'react'
import './GetInfoModal.scss'
import { FMButton } from '../FMButton/FMButton'
import { createPortal } from 'react-dom'
import InfoIcon from 'remixicon-react/InformationLineIcon'
import ClipboardIcon from 'remixicon-react/FileCopyLineIcon'

interface FileProperty {
  key: string
  label: string
  value: string
  raw?: string
}

interface FilePropertyGroup {
  title: string
  icon?: ReactElement
  properties: FileProperty[]
}

interface GetInfoModalProps {
  name: string
  properties: FilePropertyGroup[]
  onCancelClick: () => void
}

export function GetInfoModal({ name, onCancelClick, properties }: GetInfoModalProps): ReactElement {
  const modalRoot = document.querySelector('.fm-main') || document.body
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopy = async (prop: FileProperty) => {
    try {
      await navigator.clipboard.writeText(prop.raw ?? prop.value)
      setCopiedKey(prop.key)
      window.setTimeout(() => setCopiedKey(null), 1200)
    } catch {
      /* ignore */
    }
  }

  return createPortal(
    <div className="fm-modal-container">
      <div className="fm-modal-window fm-get-info-modal">
        <div className="fm-modal-window-header">
          <InfoIcon /> <span className="fm-main-font-color">File Information - {name}</span>
        </div>
        <div className="fm-modal-window-body fm-get-info-body">
          {properties.map(group => (
            <div key={group.title} className="fm-get-info-modal-group">
              <div className="fm-get-info-modal-group-title">
                {group.icon}
                {group.title}
              </div>
              <div className="fm-get-info-modal-group-properties">
                {group.properties.map(prop => (
                  <div key={prop.key} className="fm-get-info-modal-property-row">
                    <span className="fm-get-info-modal-property-label">{prop.label}</span>
                    <span className="fm-get-info-modal-property-value">
                      {prop.value}
                      {(prop.raw || prop.value.includes('...')) && (
                        <button
                          className="fm-copy-btn"
                          onClick={() => handleCopy(prop)}
                          aria-label={`Copy ${prop.label}`}
                          type="button"
                          title={copiedKey === prop.key ? 'Copied!' : 'Copy'}
                        >
                          <ClipboardIcon size="14px" />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="fm-modal-window-footer">
          <div className="fm-get-info-modal-footer-one-button">
            <FMButton label="Close" variant="secondary" onClick={onCancelClick} />
          </div>
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

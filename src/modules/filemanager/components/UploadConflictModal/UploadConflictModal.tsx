import { ReactElement, useMemo, useState } from 'react'
import './UploadConflictModal.scss'
import '../../styles/global.scss'
import { FMButton } from '../FMButton/FMButton'
import WarningIcon from 'remixicon-react/ErrorWarningLineIcon'

interface Props {
  filename: string
  suggestedName: string
  onKeepBoth: (newName: string) => void
  onReplace: () => void
  onCancel: () => void
}

export function UploadConflictModal({ filename, suggestedName, onKeepBoth, onReplace, onCancel }: Props): ReactElement {
  const [customName, setCustomName] = useState<string>(suggestedName)
  const isNameValid = useMemo(() => Boolean(customName && customName.trim().length > 0), [customName])

  return (
    <div className="fm-modal-container">
      <div className="fm-modal-window fm-upload-conflict-modal">
        <div className="fm-modal-window-header">
          <WarningIcon size="18px" />
          <span className="fm-main-font-color">File already exists</span>
        </div>

        <div className="fm-modal-window-body">
          <div className="fm-modal-white-section">
            <div className="fm-conflict-row">
              <div className="fm-emphasized-text">A file named “{filename}” already exists in this drive.</div>
              <div className="fm-soft-text">What would you like to do?</div>
            </div>

            <div className="fm-conflict-option">
              <div className="fm-conflict-option-title">Keep both</div>
              <div className="fm-conflict-option-sub">
                Upload the new file as a separate item with a different name.
              </div>
              <div className="fm-conflict-rename-row">
                <label htmlFor="conflict-newname">New name</label>
                <input
                  id="conflict-newname"
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  className="fm-input"
                  placeholder={suggestedName}
                />
              </div>
              <FMButton
                label="Keep both"
                variant="secondary"
                onClick={() => isNameValid && onKeepBoth(customName.trim())}
                disabled={!isNameValid}
              />
            </div>

            <div className="fm-conflict-sep" />

            <div className="fm-conflict-option">
              <div className="fm-conflict-option-title">Replace</div>
              <div className="fm-conflict-option-sub">
                Replace the existing file by uploading this as a new version of “{filename}”.
              </div>
              <FMButton label="Replace" variant="primary" onClick={onReplace} />
            </div>
          </div>
        </div>

        <div className="fm-modal-window-footer">
          <div className="fm-expiring-notification-modal-footer-one-button">
            <FMButton label="Cancel" variant="secondary" onClick={onCancel} />
          </div>
        </div>
      </div>
    </div>
  )
}

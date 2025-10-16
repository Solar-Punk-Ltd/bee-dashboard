import { useState, ReactElement } from 'react'
import './PrivateKeyModal.scss'
import { Button } from '../Button/Button'
import { setSignerPk } from '../../utils/common'
import { PrivateKey } from '@ethersphere/bee-js'

type Props = { onSaved: () => void }

export function PrivateKeyModal({ onSaved }: Props): ReactElement {
  const [value, setValue] = useState('')
  const [showError, setShowError] = useState(false)

  const handleSave = () => {
    try {
      new PrivateKey(value)
      setSignerPk(value)
      onSaved()
    } catch {
      setShowError(true)
    }
  }

  return (
    <div className="fm-initialization-modal-container">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">Enter Private Key</div>
        <div>To use the File Manager, we need a signer private key stored locally on this device.</div>

        <div className="fm-modal-window-body">
          <div className="fm-modal-window-input-container">
            <label
              htmlFor="fm-private-key"
              className="fm-emphasized-text"
              style={{ display: 'block', marginBottom: 6 }}
            >
              Private key
            </label>
            <input
              id="fm-private-key"
              type="password"
              className={`fm-input${showError ? ' has-error' : ''}`}
              placeholder="0x…"
              autoComplete="off"
              value={value}
              onChange={e => {
                setShowError(false)
                setValue(e.target.value)
              }}
              spellCheck={false}
            />
            {showError && <div className="fm-input-hint-error">Invalid private key. Please paste a valid hex key.</div>}
            <div className="fm-input-hint">Saved only in your browser’s local storage.</div>
          </div>
        </div>

        <div className="fm-modal-window-footer">
          <Button label="Save" variant="primary" onClick={handleSave} />
        </div>
      </div>
    </div>
  )
}

export default PrivateKeyModal

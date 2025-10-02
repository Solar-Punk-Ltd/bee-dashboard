import { useMemo, useState, ReactElement } from 'react'
import './PrivateKeyModal.scss'
import { Button } from '../Button/Button'

const KEY_STORAGE = 'privateKey'

type Props = {
  onSaved: () => void
}

function normalizePk(input: string): string {
  const s = input.trim()

  // allow both with and without 0x
  return s.startsWith('0x') ? s : `0x${s}`
}

function isValidPk(pk: string): boolean {
  // 0x + 64 hex chars
  return /^0x[a-fA-F0-9]{64}$/.test(pk)
}

export function PrivateKeyModal({ onSaved }: Props): ReactElement {
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const normalized = useMemo(() => normalizePk(value), [value])
  const valid = isValidPk(normalized)
  const showError = touched && !valid

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
              Private key (hex, 64 chars)
            </label>
            <input
              id="fm-private-key"
              type="password"
              className={`fm-input${showError ? ' has-error' : ''}`}
              placeholder="0x…"
              autoComplete="off"
              value={value}
              onChange={e => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
              spellCheck={false}
            />
            {showError && (
              <div className="fm-input-hint-error">Expected a 64-character hex string (with or without 0x).</div>
            )}
            <div className="fm-input-hint">This is saved only in your browser’s local storage.</div>
          </div>
        </div>

        <div className="fm-modal-window-footer">
          <Button
            label="Save"
            variant="primary"
            disabled={!valid}
            onClick={() => {
              const pk = normalizePk(value)

              if (!isValidPk(pk)) return
              localStorage.setItem(KEY_STORAGE, pk)
              onSaved()
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default PrivateKeyModal

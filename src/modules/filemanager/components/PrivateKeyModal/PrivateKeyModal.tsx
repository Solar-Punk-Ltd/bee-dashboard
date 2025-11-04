import { useState, ReactElement, useEffect } from 'react'
import './PrivateKeyModal.scss'
import { Button } from '../Button/Button'
import { setSignerPk, getSigner } from '../../utils/common'
import { PrivateKey } from '@ethersphere/bee-js'
import ClipboardIcon from 'remixicon-react/FileCopyLineIcon'

type Props = { onSaved: () => void }

export function PrivateKeyModal({ onSaved }: Props): ReactElement {
  const [value, setValue] = useState('')
  const [confirmValue, setConfirmValue] = useState('')
  const [showError, setShowError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    handleGenerateNew()
  }, [])

  const handleCopyPrivateKey = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // eslint-disable-next-line no-console
      console.debug('Failed to copy private key to clipboard')
    }
  }

  const handleGenerateNew = () => {
    const id = crypto.randomUUID()
    const signer = getSigner(id)
    const privKey = signer.toHex()

    setValue(privKey)
    setConfirmValue('')
    setCopied(false)
    setShowError(false)
  }

  const handleBlur = () => {
    if (!value.trim()) {
      return
    }

    try {
      new PrivateKey(value)
      setShowError(false)
    } catch {
      setShowError(true)
      setCopied(false)
    }
  }

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
        <div>To use the File Manager, we need a private key to initialized it.</div>

        <div className="fm-modal-window-body">
          <div className="fm-modal-window-input-container">
            <label htmlFor="fm-private-key" className="fm-emphasized-text fm-private-key-label">
              <span>Private key</span>
              <button
                onClick={handleGenerateNew}
                type="button"
                className="fm-generate-btn"
                onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
                onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
              >
                Generate New
              </button>
            </label>

            <div className="fm-private-key-input-row">
              <input
                id="fm-private-key"
                type="text"
                className={`fm-input${showError ? ' has-error' : ''} fm-private-key-input`}
                autoComplete="off"
                value={value}
                onChange={e => {
                  setValue(e.target.value)
                  setCopied(false)
                  setShowError(false)
                }}
                onBlur={handleBlur}
                spellCheck={false}
              />
              <button
                className="fm-copy-btn"
                onClick={handleCopyPrivateKey}
                aria-label="Copy private key"
                type="button"
                title={copied ? 'Copied!' : 'Copy'}
              >
                <ClipboardIcon size="16px" />
              </button>
            </div>
            <div className="fm-input-hint-error">{showError ? 'Invalid private key.' : ''}</div>
          </div>

          <div className="fm-modal-window-input-container fm-confirm-key-container">
            <label htmlFor="fm-private-key-confirm" className="fm-emphasized-text fm-confirm-key-label">
              Confirm Private Key
            </label>
            <input
              id="fm-private-key-confirm"
              type="text"
              className="fm-input fm-confirm-key-input"
              placeholder="Paste or type your private key again"
              autoComplete="off"
              value={confirmValue}
              onChange={e => setConfirmValue(e.target.value)}
              spellCheck={false}
            />
            <div className="fm-input-hint fm-confirm-key-hint">
              {confirmValue && value === confirmValue
                ? '✓ Private keys match!'
                : 'Save the private key securely, then paste or type it again to confirm.'}
            </div>
          </div>
        </div>

        <div className="fm-modal-window-footer">
          <Button
            label="Save"
            variant="primary"
            onClick={handleSave}
            disabled={!value || !confirmValue || value !== confirmValue || showError}
          />
        </div>
      </div>
    </div>
  )
}

export default PrivateKeyModal

import React, { ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FolderAddIcon from 'remixicon-react/FolderAddLineIcon'

import { safeSetState } from '../../utils/common'
import { Button } from '../Button/Button'

import '../../styles/global.scss'
import '../RenameFileModal/RenameFileModal.scss'

const maxFolderNameLength = 60

interface NewFolderModalProps {
  parentLabel: string
  takenNames?: Set<string> | string[]
  onCancelClick: () => void
  onProceed: (name: string) => void | Promise<void>
}

export function NewFolderModal({
  parentLabel,
  takenNames,
  onCancelClick,
  onProceed,
}: NewFolderModalProps): ReactElement {
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0)

    return () => clearTimeout(t)
  }, [])

  const taken = useMemo(() => {
    if (!takenNames) return new Set<string>()

    return Array.isArray(takenNames) ? new Set(takenNames) : takenNames
  }, [takenNames])

  const trimmed = useMemo(() => value.trim(), [value])

  const error = useMemo(() => {
    if (!touched) return ''

    if (!trimmed) return 'Name is required.'

    if (/[\\/:*?"<>|]+/.test(trimmed)) return 'Name contains invalid characters.'

    if (taken.has(trimmed)) return 'An item with this name already exists here. Please choose another.'

    return ''
  }, [touched, trimmed, taken])

  const canSubmit = trimmed.length > 0 && !/[\\/:*?"<>|]+/.test(trimmed) && !taken.has(trimmed)

  const handleSubmit = async () => {
    if (!canSubmit || submitting) {
      setTouched(true)

      return
    }
    try {
      setSubmitting(true)
      await onProceed(trimmed)
    } finally {
      safeSetState(isMountedRef, setSubmitting)(false)
    }
  }

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancelClick()
    }
  }

  const modalRoot = (document.querySelector('.fm-main') as HTMLElement) || document.body

  return createPortal(
    <div className="fm-modal-container fm-rename-modal">
      <div className="fm-modal-window">
        <div className="fm-modal-window-header">
          <FolderAddIcon size="21px" />
          <span className="fm-main-font-color">New folder</span>
        </div>

        <div className="fm-modal-window-body">
          <div className="fm-modal-white-section">
            <label htmlFor="fm-new-folder-input" className="fm-soft-text" style={{ display: 'block', marginBottom: 8 }}>
              Folder name
            </label>
            <input
              id="fm-new-folder-input"
              ref={inputRef}
              type="text"
              className="fm-input fm-rename-input"
              value={value}
              onChange={e => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={onKeyDown}
              placeholder="Enter a folder name"
              maxLength={maxFolderNameLength}
            />
            {error && (
              <div className="fm-error-text" style={{ marginTop: 8 }}>
                {error}
              </div>
            )}
            <div className="fm-soft-text" style={{ marginTop: 10, fontSize: 12, color: '#333' }}>
              Creates an empty folder in {parentLabel}.
            </div>
          </div>
        </div>

        <div className="fm-modal-window-footer fm-space-between">
          <Button label="Cancel" variant="secondary" onClick={onCancelClick} />
          <Button
            label="Create"
            variant="primary"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
          />
        </div>
      </div>
    </div>,
    modalRoot,
  )
}

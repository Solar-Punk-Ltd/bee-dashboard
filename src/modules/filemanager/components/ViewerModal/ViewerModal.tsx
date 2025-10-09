import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { VIEWERS } from '../../utils/view'
import './ViewerModal.scss'

type ViewerPayload = { name: string; mime: string; url: string }

export function ViewerModal({
  open,
  payload,
  onClose,
}: {
  open: boolean
  payload: ViewerPayload | null
  onClose: () => void
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)

  const viewer = useMemo(() => (payload ? VIEWERS.find(v => v.test(payload.mime)) ?? null : null), [payload])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    let el = document.getElementById('fm-modal-root') as HTMLElement | null

    if (!el) {
      el = document.createElement('div')
      el.id = 'fm-modal-root'
      document.body.appendChild(el)
    }
    rootRef.current = el
  }, [])

  useEffect(() => {
    if (!open || !payload || !viewer) return
    const frame = frameRef.current
    const url = payload.url

    const tryRender = () => {
      const win = frame?.contentWindow

      if (!win) return
      try {
        viewer.render(win, url, payload.mime, payload.name)
      } catch {
        const a = document.createElement('a')
        a.href = url
        a.download = payload.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        onClose()
      }
    }

    if (frame?.contentWindow?.document?.readyState === 'complete') {
      tryRender()
    } else {
      frame?.addEventListener('load', tryRender, { once: true })
    }

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [open, payload, viewer, onClose])

  if (!open || !payload || !rootRef.current) return null

  const onBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const isPdf = payload?.mime === 'application/pdf'

  return createPortal(
    <div className="fm-modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="fm-modal" role="dialog" aria-modal="true" aria-label={payload.name}>
        <div className="fm-modal__header">
          <div className="fm-modal__title" title={payload.name}>
            {payload.name}
          </div>
          <button className="fm-modal__close" onClick={onClose} aria-label="Close">
            <span aria-hidden>×</span>
          </button>
        </div>
        <div className="fm-modal__body fm-modal__body--viewer">
          <iframe
            ref={frameRef}
            className="fm-modal__frame"
            title={`viewer-${payload.name}`}
            sandbox={isPdf ? undefined : 'allow-scripts allow-same-origin allow-popups allow-downloads'}
          />
        </div>
      </div>
    </div>,
    rootRef.current,
  )
}

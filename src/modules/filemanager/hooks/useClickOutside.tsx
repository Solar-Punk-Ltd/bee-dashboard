import { useEffect } from 'react'

export function useClickOutside<T extends Element>(ref: React.RefObject<T>, onClickOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return

    function handleDocumentClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside()
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)

    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [ref, onClickOutside, active])
}

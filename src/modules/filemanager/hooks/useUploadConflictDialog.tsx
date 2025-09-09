import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { UploadConflictModal } from '../components/UploadConflictModal/UploadConflictModal'

export type ConflictResult = { action: 'keep-both'; newName: string } | { action: 'replace' } | { action: 'cancel' }

type Request = {
  originalName: string
  existingNames: Set<string>
  resolve: (r: ConflictResult) => void
}

function splitExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')

  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' }

  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

function nextCopyName(originalName: string, taken: Set<string>): string {
  const { base, ext } = splitExt(originalName)
  let n = 1
  let candidate = `${base} (${n})${ext}`
  while (taken.has(candidate)) {
    n += 1
    candidate = `${base} (${n})${ext}`
  }

  return candidate
}

export function useUploadConflictDialog(): [
  (args: { originalName: string; existingNames: Set<string> | string[] }) => Promise<ConflictResult>,
  JSX.Element | null,
] {
  const [req, setReq] = useState<Request | null>(null)

  const portal = useMemo(() => {
    if (!req) return null
    const modalRoot = document.querySelector('.fm-main') || document.body
    const suggested = nextCopyName(req.originalName, req.existingNames)

    return createPortal(
      <UploadConflictModal
        filename={req.originalName}
        suggestedName={suggested}
        onKeepBoth={(newName: string) => {
          const { resolve } = req
          setReq(null)
          resolve({ action: 'keep-both', newName })
        }}
        onReplace={() => {
          const { resolve } = req
          setReq(null)
          resolve({ action: 'replace' })
        }}
        onCancel={() => {
          const { resolve } = req
          setReq(null)
          resolve({ action: 'cancel' })
        }}
      />,
      modalRoot,
    )
  }, [req])

  const open = useCallback(
    async (args: { originalName: string; existingNames: Set<string> | string[] }): Promise<ConflictResult> => {
      const existing = Array.isArray(args.existingNames) ? new Set(args.existingNames) : args.existingNames

      return await new Promise<ConflictResult>(resolve => {
        setReq({ originalName: args.originalName, existingNames: existing, resolve })
      })
    },
    [],
  )

  return [open, portal]
}

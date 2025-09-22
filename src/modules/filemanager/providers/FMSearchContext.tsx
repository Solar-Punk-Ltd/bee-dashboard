import { createContext, useContext, useMemo, useRef, useState, ReactNode } from 'react'

type Scope = 'selected' | 'all'

export interface FMSearchState {
  query: string
  scope: Scope
  includeActive: boolean
  includeTrashed: boolean
  setQuery: (q: string) => void
  clear: () => void
  setScope: (s: Scope) => void
  setIncludeActive: (v: boolean) => void
  setIncludeTrashed: (v: boolean) => void
}

const Ctx = createContext<FMSearchState | undefined>(undefined)

export function FMSearchProvider({ children }: { children: ReactNode }) {
  const [query, _setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [includeActive, setIncludeActive] = useState(true)
  const [includeTrashed, setIncludeTrashed] = useState(true)

  const preSearchState = useRef<{ scope: Scope; includeActive: boolean; includeTrashed: boolean } | null>(null)
  const inSearch = useRef(false)

  const setQuery = (q: string) => {
    const trimmed = q.trim()

    if (!inSearch.current && trimmed.length > 0) {
      preSearchState.current = { scope, includeActive, includeTrashed }
      inSearch.current = true
    }

    if (inSearch.current && trimmed.length === 0) {
      const prev = preSearchState.current

      if (prev) {
        setScope(prev.scope)
        setIncludeActive(prev.includeActive)
        setIncludeTrashed(prev.includeTrashed)
      }
      preSearchState.current = null
      inSearch.current = false
    }

    _setQuery(q)
  }

  const clear = () => {
    setQuery('')
  }

  const value = useMemo<FMSearchState>(
    () => ({
      query,
      scope,
      includeActive,
      includeTrashed,
      setQuery,
      clear,
      setScope,
      setIncludeActive,
      setIncludeTrashed,
    }),
    [query, scope, includeActive, includeTrashed],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFMSearch(): FMSearchState {
  const v = useContext(Ctx)

  if (!v) throw new Error('useFMSearch must be used within FMSearchProvider')

  return v
}

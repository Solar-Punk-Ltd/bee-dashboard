import { createContext, useContext, useMemo, useState, ReactNode } from 'react'

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
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [includeActive, setIncludeActive] = useState(true)
  const [includeTrashed, setIncludeTrashed] = useState(true)

  const value = useMemo<FMSearchState>(
    () => ({
      query,
      scope,
      includeActive,
      includeTrashed,
      setQuery,
      clear: () => setQuery(''),
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

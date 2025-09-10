import { ReactElement, useMemo, useState, useEffect, useRef } from 'react'
import SearchIcon from 'remixicon-react/SearchLineIcon'
import FileIcon from 'remixicon-react/File2LineIcon'
import FilterIcon from 'remixicon-react/FilterLineIcon' // ← NEW
import './Header.scss'
import { useFMSearch } from '../../providers/FMSearchContext'
import { useFM } from '../../providers/FMContext'
import type { BatchId } from '@ethersphere/bee-js'

type CurrentBatch = { batchID: BatchId; label?: string }

const toStringSafe = (x: unknown): string => {
  if (x == null) return ''

  if (typeof x === 'string') return x
  try {
    const s = (x as { toString?: () => string }).toString?.() ?? String(x)

    return s !== '[object Object]' ? s : ''
  } catch {
    return ''
  }
}

export function Header(): ReactElement {
  const {
    query,
    setQuery,
    clear,
    scope,
    setScope,
    includeActive,
    setIncludeActive,
    includeTrashed,
    setIncludeTrashed,
  } = useFMSearch()

  const { currentBatch } = useFM() as { currentBatch: CurrentBatch | null }
  const currentDriveLabel = useMemo(() => {
    if (!currentBatch) return ''

    return currentBatch.label || toStringSafe(currentBatch.batchID)
  }, [currentBatch])

  const [openFilters, setOpenFilters] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!openFilters) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node

      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpenFilters(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenFilters(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)

    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [openFilters])

  return (
    <div className="fm-header-container">
      <div className="fm-header-left">
        <div className="fm-header-logo" aria-hidden>
          <FileIcon />
        </div>
        <div className="fm-header-title">File Manager</div>
      </div>

      <div className="fm-header-search">
        <SearchIcon className="fm-header-search-icon" size="16px" aria-hidden />
        <input
          type="text"
          placeholder="Search files by name or type…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') clear()
          }}
          aria-label="Search files"
        />
        {query && (
          <button
            type="button"
            className="fm-header-search-clear"
            aria-label="Clear search"
            onClick={clear}
            title="Clear"
          >
            ×
          </button>
        )}
      </div>

      <div className="fm-header-actions">
        <button
          ref={btnRef}
          type="button"
          className="fm-filter-btn"
          aria-haspopup="menu"
          aria-expanded={openFilters}
          onClick={() => setOpenFilters(v => !v)}
          title="Filters"
        >
          <FilterIcon size="16px" />
          <span>Filters</span>
        </button>

        {openFilters && (
          <div className="fm-filter-menu" role="menu" ref={menuRef}>
            <div className="fm-filter-group" role="radiogroup" aria-label="Search scope">
              <div className="fm-filter-group-title">Scope</div>
              <label className="fm-filter-row">
                <input
                  type="radio"
                  name="fm-scope"
                  checked={scope === 'selected'}
                  onChange={() => setScope('selected')}
                />
                <span title={currentDriveLabel ? `Search in ${currentDriveLabel}` : 'Search in selected drive'}>
                  Selected{currentDriveLabel ? ` — ${currentDriveLabel}` : ''}
                </span>
              </label>
              <label className="fm-filter-row">
                <input type="radio" name="fm-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
                <span>All drives</span>
              </label>
            </div>

            <div className="fm-filter-sep" />

            <div className="fm-filter-group" aria-label="Status">
              <div className="fm-filter-group-title">Status</div>
              <label className="fm-filter-row">
                <input type="checkbox" checked={includeActive} onChange={e => setIncludeActive(e.target.checked)} />
                <span>Active</span>
              </label>
              <label className="fm-filter-row">
                <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
                <span>Trash</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

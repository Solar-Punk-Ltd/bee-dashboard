import { ReactElement } from 'react'
import DownIcon from 'remixicon-react/ArrowDownSLineIcon'
import { useBulkActions } from '../../../hooks/useBulkActions'
import type { SortDir, SortKey } from '../../../hooks/useSorting'

interface FileBrowserHeaderProps {
  isSearchMode: boolean
  bulk: ReturnType<typeof useBulkActions>
  sortKey: SortKey
  sortDir: SortDir
  onSortName: () => void
  onSortSize: () => void
  onSortDate: () => void
  onSortDrive: () => void
  onClearSort: () => void
}

const Arrow = ({ active, dir }: { active: boolean; dir: SortDir }) => {
  let title: string | undefined

  if (active) {
    title = dir === 'asc' ? 'Ascending' : 'Descending'
  } else {
    title = undefined
  }

  return (
    <div
      className={'fm-file-browser-content-header-item-icon' + (active ? '' : ' is-inactive')}
      aria-hidden={title ? 'false' : 'true'}
      aria-label={title}
      title={title}
    >
      <DownIcon size="16px" />
    </div>
  )
}

function HeaderCell({
  label,
  isActive,
  dir,
  onToggle,
  onClear,
  ariaSort,
  'data-testid': testId,
}: {
  label: string
  isActive: boolean
  dir: SortDir
  onToggle: () => void
  onClear: () => void
  ariaSort: 'ascending' | 'descending' | 'none'
  'data-testid'?: string
}) {
  return (
    <div className="fm-header-cell" role="columnheader" aria-sort={ariaSort} data-testid={testId}>
      <button
        type="button"
        className="fm-header-button"
        onClick={onToggle}
        data-dir={isActive ? dir : undefined}
        aria-label={
          isActive
            ? `Sort by ${label.toLowerCase()}, currently ${dir === 'asc' ? 'ascending' : 'descending'}`
            : `Sort by ${label.toLowerCase()}`
        }
        title={isActive ? `Currently ${dir === 'asc' ? 'Ascending' : 'Descending'}` : 'Click to sort'}
      >
        <span>{label}</span>
        <Arrow active={isActive} dir={dir} />
      </button>

      {isActive && (
        <button
          type="button"
          className="fm-sort-clear"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            onClear()
          }}
          aria-label="Reset sorting to default"
          title="Clear sorting"
        >
          ×
        </button>
      )}
    </div>
  )
}

export function FileBrowserHeader({
  isSearchMode,
  bulk,
  sortKey,
  sortDir,
  onSortName,
  onSortSize,
  onSortDate,
  onSortDrive,
  onClearSort,
}: FileBrowserHeaderProps): ReactElement {
  const ariaSort = (thisKey: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sortKey !== thisKey) return 'none'

    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  return (
    <div className="fm-file-browser-content-header" role="row">
      <input
        type="checkbox"
        checked={bulk.allChecked}
        ref={el => {
          if (el) el.indeterminate = bulk.someChecked
        }}
        onChange={e => (e.target.checked ? bulk.selectAll() : bulk.clearAll())}
      />

      <div className="fm-file-browser-content-header-item fm-name">
        <HeaderCell
          label="Name"
          isActive={sortKey === 'name'}
          dir={sortDir}
          onToggle={onSortName}
          onClear={onClearSort}
          ariaSort={ariaSort('name')}
          data-testid="hdr-name"
        />
      </div>

      {isSearchMode && (
        <div className="fm-file-browser-content-header-item fm-drive">
          <HeaderCell
            label="Drive"
            isActive={sortKey === 'drive'}
            dir={sortDir}
            onToggle={onSortDrive}
            onClear={onClearSort}
            ariaSort={ariaSort('drive')}
            data-testid="hdr-drive"
          />
        </div>
      )}

      <div className="fm-file-browser-content-header-item fm-size">
        <HeaderCell
          label="Size"
          isActive={sortKey === 'size'}
          dir={sortDir}
          onToggle={onSortSize}
          onClear={onClearSort}
          ariaSort={ariaSort('size')}
          data-testid="hdr-size"
        />
      </div>

      <div className="fm-file-browser-content-header-item fm-date-mod">
        <HeaderCell
          label="Date mod."
          isActive={sortKey === 'timestamp'}
          dir={sortDir}
          onToggle={onSortDate}
          onClear={onClearSort}
          ariaSort={ariaSort('timestamp')}
          data-testid="hdr-date"
        />
      </div>
    </div>
  )
}

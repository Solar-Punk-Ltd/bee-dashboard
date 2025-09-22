import { ReactElement } from 'react'
import CloseIcon from 'remixicon-react/CloseLineIcon'
import ArrowDownIcon from 'remixicon-react/ArrowDownSLineIcon'
import './FileProgressWindow.scss'
import { GetIconElement } from '../../utils/GetIconElement'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { FileTransferType, TransferBarColor, TransferStatus } from '../../constants/constants'
import { formatBytes } from '../../utils/common'

type ProgressItem = {
  name: string
  percent?: number
  size?: string
  kind?: FileTransferType
  status?: TransferStatus
}

interface FileProgressWindowProps {
  numberOfFiles?: number
  items?: ProgressItem[]
  type: FileTransferType
  onCancelClick: () => void
  onRowClose?: (name: string) => void
  onCloseAll?: () => void
}

export function FileProgressWindow({
  numberOfFiles,
  items,
  type,
  onCancelClick,
  onRowClose,
  onCloseAll,
}: FileProgressWindowProps): ReactElement | null {
  const count = items?.length ?? numberOfFiles ?? 0
  const rows: ProgressItem[] =
    items && items.length > 0
      ? items
      : Array.from({ length: count }, (_, i) => ({ name: `Pending file ${i + 1}`, percent: 0, size: '' }))

  const getTransferInfo = (item: ProgressItem, pct?: number) => {
    const transferType = item?.kind ?? type
    const cap = transferType.charAt(0).toUpperCase() + transferType.slice(1)

    return {
      statusText: pct === 100 ? 'Done' : `${cap}ing…`,
      barColor: TransferBarColor[cap as keyof typeof TransferBarColor],
    }
  }

  const allDone =
    rows.length > 0 &&
    rows.every(r =>
      Number.isFinite(r.percent) ? Math.round(r.percent as number) >= 100 : r.status === TransferStatus.Done,
    )

  return (
    <div className="fm-file-progress-window">
      <div className="fm-file-progress-window-header">
        <div className="fm-emphasized-text">
          {count} {type}
          {count === 1 ? '' : 's'}
        </div>

        <div className="fm-file-progress-window-header-actions">
          <button
            className="fm-file-progress-window-header-btn fm-file-progress-window-header-dismiss"
            aria-label="Dismiss all"
            type="button"
            disabled={!allDone}
            onClick={() => {
              onCloseAll?.()
            }}
          >
            <CloseIcon size="16" />
          </button>

          <button
            className="fm-file-progress-window-header-btn fm-file-progress-window-header-hide"
            aria-label="Hide"
            type="button"
            onClick={onCancelClick}
          >
            <ArrowDownIcon size="16" />
          </button>
        </div>
      </div>

      {rows.map(file => {
        // round & clamp
        const pctNum = Number.isFinite(file.percent)
          ? Math.max(0, Math.min(100, Math.round(file.percent as number)))
          : undefined

        const isComplete = (pctNum ?? 0) >= 100 || file.status === TransferStatus.Done
        const transferInfo = getTransferInfo(file, pctNum)

        return (
          <div className="fm-file-progress-window-file-item" key={`${file.name}`}>
            <div className="fm-file-progress-window-file-type-icon">
              <GetIconElement size="14" icon={file.name} color="black" />
            </div>

            <div className="fm-file-progress-window-file-datas">
              <div
                className="fm-file-progress-window-file-item-header"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <div
                  title={file.name}
                  style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {file.name}
                </div>

                <div aria-live="polite">{typeof pctNum === 'number' ? `${pctNum}%` : ''}</div>

                <button
                  className="fm-file-progress-window-row-close"
                  aria-label={isComplete ? 'Dismiss' : 'Dismiss (disabled until complete)'}
                  disabled={!isComplete}
                  onClick={() => {
                    if (isComplete) onRowClose?.(file.name)
                  }}
                  type="button"
                >
                  <CloseIcon size="14" />
                </button>
              </div>

              <ProgressBar
                value={typeof pctNum === 'number' ? pctNum : 0}
                width="100%"
                backgroundColor="rgb(229, 231, 235)"
                color={transferInfo.barColor}
              />

              <div
                className="fm-file-progress-window-file-item-footer"
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}
              >
                <div>{formatBytes(file.size) ?? '—'}</div>
                <div>{transferInfo.statusText}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

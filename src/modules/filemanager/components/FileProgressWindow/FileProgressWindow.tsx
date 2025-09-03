import { ReactElement } from 'react'
import CloseIcon from 'remixicon-react/CloseLineIcon'
import './FileProgressWindow.scss'
import { GetIconElement } from '../../utils/GetIconElement'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { FileTransferType, TransferBarColor } from '../../constants/constants'

type ProgressItem = {
  name: string
  percent?: number
  size?: string
}

interface FileProgressWindowProps {
  numberOfFiles?: number
  items?: ProgressItem[]
  type: FileTransferType
  onCancelClick: () => void
}

function prettySize(s?: string): string {
  const n = Number(s)

  if (!Number.isFinite(n) || n < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  let val = n
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  const num = i === 0 ? Math.round(val) : Number(val.toFixed(val < 10 ? 1 : 0))

  return `${num} ${units[i]}`
}

export function FileProgressWindow({
  numberOfFiles,
  items,
  type,
  onCancelClick,
}: FileProgressWindowProps): ReactElement | null {
  const count = items?.length ?? numberOfFiles ?? 0

  const rows: ProgressItem[] =
    items && items.length > 0
      ? items
      : Array.from({ length: count }, (_, i) => ({
          name: `Pending file ${i + 1}`,
          percent: 0,
          size: '',
        }))

  const noun = type === FileTransferType.Download ? 'download' : 'upload'

  const statusText = (pct?: number): string => {
    if (pct === 100) return 'Done'

    if (type === FileTransferType.Download) return 'Downloading…'

    return 'Uploading…'
  }

  const barColor = type === FileTransferType.Download ? TransferBarColor.Download : TransferBarColor.Upload

  return (
    <div className="fm-file-progress-window">
      <div className="fm-file-progress-window-header">
        <div className="fm-emphasized-text">
          {count} {noun}
          {count === 1 ? '' : 's'}
        </div>
        <div className="fm-file-progress-window-header-close" onClick={onCancelClick} role="button" aria-label="Close">
          <CloseIcon size="16" />
        </div>
      </div>

      {rows.map(file => {
        const pct = typeof file.percent === 'number' ? Math.max(0, Math.min(100, Math.floor(file.percent))) : undefined

        return (
          <div className="fm-file-progress-window-file-item" key={file.name}>
            <div className="fm-file-progress-window-file-type-icon">
              <GetIconElement size="14" icon={file.name || 'file'} color="black" />
            </div>

            <div className="fm-file-progress-window-file-datas">
              <div
                className="fm-file-progress-window-file-item-header"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <div
                  title={file.name}
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                </div>
                <div aria-live="polite">{typeof pct === 'number' ? `${pct}%` : ''}</div>
              </div>

              <ProgressBar
                value={typeof pct === 'number' ? pct : 0}
                width="100%"
                backgroundColor="rgb(229, 231, 235)"
                color={barColor}
              />

              <div
                className="fm-file-progress-window-file-item-footer"
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}
              >
                <div>{prettySize(file.size)}</div>
                <div>{statusText(pct)}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

import { ReactElement } from 'react'
import CloseIcon from 'remixicon-react/CloseLineIcon'
import './FileProgressWindow.scss'
import { GetIconElement } from '../../utils/GetIconElement'
import { ProgressBar } from '../ProgressBar/ProgressBar'
import { FileTransferType, TransferBarColor } from '../../constants/constants'
import { formatBytes } from '../../utils/common'

type ProgressItem = {
  name: string
  percent?: number
  size?: string
  kind?: FileTransferType
}

interface FileProgressWindowProps {
  numberOfFiles?: number
  items?: ProgressItem[]
  type: FileTransferType
  onCancelClick: () => void
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
      : Array.from({ length: count }, (_, i) => ({ name: `Pending file ${i + 1}`, percent: 0, size: '' }))

  const getTransferInfo = (item: ProgressItem, pct?: number) => {
    const transferType = item?.kind ?? type
    const capitalizedType = transferType.charAt(0).toUpperCase() + transferType.slice(1)

    return {
      statusText: pct === 100 ? 'Done' : `${capitalizedType}ing…`,
      barColor: TransferBarColor[capitalizedType as keyof typeof TransferBarColor],
    }
  }

  return (
    <div className="fm-file-progress-window">
      <div className="fm-file-progress-window-header">
        <div className="fm-emphasized-text">
          {count} {type}
          {count === 1 ? '' : 's'}
        </div>
        <div className="fm-file-progress-window-header-close" onClick={onCancelClick} role="button" aria-label="Close">
          <CloseIcon size="16" />
        </div>
      </div>

      {rows.map(file => {
        const pct = typeof file.percent === 'number' ? Math.max(0, Math.min(100, Math.floor(file.percent))) : undefined
        const transferInfo = getTransferInfo(file, pct)

        return (
          <div className="fm-file-progress-window-file-item" key={file.name}>
            <div className="fm-file-progress-window-file-type-icon">
              <GetIconElement size="14" icon={file.name} color="black" />
            </div>

            <div className="fm-file-progress-window-file-datas">
              <div
                className="fm-file-progress-window-file-item-header"
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, minWidth: 0 }}
              >
                <div
                  title={file.name}
                  style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {file.name}
                </div>
                <div aria-live="polite">{typeof pct === 'number' ? `${pct}%` : ''}</div>
              </div>

              <ProgressBar
                value={typeof pct === 'number' ? pct : 0}
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

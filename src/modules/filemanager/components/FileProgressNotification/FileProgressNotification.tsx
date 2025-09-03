import { ReactElement, useEffect, useState } from 'react'
import './FileProgressNotification.scss'
import UpIcon from 'remixicon-react/ArrowUpSLineIcon'
import DownIcon from 'remixicon-react/ArrowDownSLineIcon'
import { FileProgressWindow } from '../FileProgressWindow/FileProgressWindow'
import { FileTransferType } from '../../constants/constants'

type ProgressItem = { name: string; percent?: number; size?: string }

interface FileProgressNotificationProps {
  label?: string
  type: FileTransferType
  open?: boolean
  count?: number
  items?: ProgressItem[]
}

export function FileProgressNotification({
  label,
  type,
  open,
  count,
  items,
}: FileProgressNotificationProps): ReactElement | null {
  const [showFileProgressWindow, setShowFileProgressWindow] = useState(Boolean(open))

  useEffect(() => {
    if (open) setShowFileProgressWindow(true)
  }, [open])

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="fm-file-progress-notification"
        onClick={() => setShowFileProgressWindow(true)}
        role="button"
        aria-label={label}
      >
        <span>{label}</span>
        {type === FileTransferType.Upload && <UpIcon size="16px" style={{ marginLeft: 6 }} />}
        {type === FileTransferType.Download && <DownIcon size="16px" style={{ marginLeft: 6 }} />}
      </div>

      {showFileProgressWindow && (
        <FileProgressWindow
          numberOfFiles={items && items.length ? undefined : count}
          items={items}
          type={type}
          onCancelClick={() => setShowFileProgressWindow(false)}
        />
      )}
    </div>
  )
}

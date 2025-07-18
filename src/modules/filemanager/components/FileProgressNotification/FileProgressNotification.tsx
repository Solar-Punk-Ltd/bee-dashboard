import { ReactElement, useState } from 'react'
import './FileProgressNotification.scss'
import UpIcon from 'remixicon-react/ArrowUpSLineIcon'
import DownIcon from 'remixicon-react/ArrowDownSLineIcon'
import { FileProgressWindow } from '../FileProgressWindow/FileProgressWindow'

interface FileProgressNotificationProps {
  label?: string
  percent?: string
  type?: 'upload' | 'download'
}

export function FileProgressNotification({ label, percent, type }: FileProgressNotificationProps): ReactElement | null {
  const [showFileProgressWindow, setShowFileProgressWindow] = useState(false)

  return (
    <>
      <div className="fm-file-progress-notification" onClick={() => setShowFileProgressWindow(true)}>
        {label}
        {type === 'upload' && <UpIcon size="16px" color="green" />}
        {type === 'download' && <DownIcon size="16px" color="red" />}

        {showFileProgressWindow && (
          <FileProgressWindow
            numberOfFiles={3}
            type={type}
            onCancelClick={() => {
              setShowFileProgressWindow(false)
            }}
          />
        )}
      </div>
    </>
  )
}

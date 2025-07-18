import { ReactElement, useState } from 'react'
import './FileProgressWindow.scss'
import { GetIconElement } from '../../utils/GetIconElement'
import { ProgressBar } from '../ProgressBar/ProgressBar'

interface FileProgressWindowProps {
  numberOfFiles?: number
  type?: 'upload' | 'download'
  onCancelClick: () => void
}

export function FileProgressWindow({
  numberOfFiles,
  type,
  onCancelClick,
}: FileProgressWindowProps): ReactElement | null {
  const [showFileProgressWindow, setShowFileProgressWindow] = useState(false)

  return (
    <>
      <div className="fm-file-progress-window">
        <div className="fm-file-progress-window-header fm-emphasized-text">
          {numberOfFiles} {type}
        </div>

        <div className="fm-file-progress-window-file-item">
          <div className="">
            <GetIconElement icon="image" color="black" />
          </div>
          <div className="fm-file-progress-window-file-datas">
            <div className="fm-file-progress-window-file-item-header">
              <div>filename.zip</div>
              <div>67%</div>
            </div>
            <ProgressBar value={20} width={150} backgroundColor="rgb(229, 231, 235)" />
          </div>
        </div>
      </div>
    </>
  )
}

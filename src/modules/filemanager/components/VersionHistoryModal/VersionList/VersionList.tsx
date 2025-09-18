import './VersionList.scss'
import '../../../styles/global.scss'

import { FMButton } from '../../FMButton/FMButton'
import CalendarIcon from 'remixicon-react/CalendarLineIcon'
import UserIcon from 'remixicon-react/UserLineIcon'
import DownloadIcon from 'remixicon-react/Download2LineIcon'

import type { FileInfo } from '@solarpunkltd/file-manager-lib'

import { useFM } from '../../../providers/FMContext'
import { indexStrToBigint } from '../../../utils/common'
import { startDownloadingQueue } from 'src/modules/filemanager/utils/download'

const truncateMiddle = (s: string, max = 42): string => {
  const str = String(s)

  if (str.length <= max) return str
  const half = Math.floor((max - 1) / 2)

  return `${str.slice(0, half)}…${str.slice(-half)}`
}

interface VersionListProps {
  versions: FileInfo[]
  headFi: FileInfo
  restoreVersion: (fi: FileInfo) => Promise<void>
}

export function VersionsList({ versions, headFi, restoreVersion }: VersionListProps) {
  const { fm } = useFM()

  if (!versions.length || !fm) return null

  return (
    <div className="fm-version-history-list">
      {versions.map(item => {
        const idx = indexStrToBigint(item.version)

        if (idx === undefined) return null

        const isCurrent = indexStrToBigint(headFi.version) === idx
        const modified = item.timestamp !== undefined ? new Date(item.timestamp).toLocaleString() : '—'
        const key = `${item.topic.toString()}:${idx.toString()}`
        const willRename = headFi.name !== item.name

        return (
          <div key={key} className="fm-modal-white-section vh-row">
            <div className="vh-left">
              <div className="vh-meta">
                <span className="vh-chip" title={`Version ${idx.toString()}`}>
                  v{idx.toString()}
                </span>
                {isCurrent && <span className="vh-tag vh-tag--current">Current</span>}
                <span className="vh-dot">•</span>
                <span className="vh-meta-item" title={modified}>
                  <CalendarIcon size="12" /> {modified}
                </span>
                <span className="vh-dot">•</span>
                <span className="vh-meta-item" title="Publisher">
                  <UserIcon size="12" />
                </span>
              </div>

              {willRename && !isCurrent && (
                <div className="vh-rename" title={`Restoring will rename: “${headFi.name}” → “${item.name}”`}>
                  Restoring will rename:{' '}
                  <b className="vh-name" title={headFi.name}>
                    {truncateMiddle(headFi.name || '', 44)}
                  </b>{' '}
                  →{' '}
                  <b className="vh-name" title={item.name}>
                    {truncateMiddle(item.name, 44)}
                  </b>
                </div>
              )}
            </div>

            <div className="vh-actions">
              <FMButton
                label="Download"
                variant="secondary"
                icon={<DownloadIcon size="15" />}
                onClick={() =>
                  startDownloadingQueue(fm, [item], () => {
                    // eslint-disable-next-line no-console
                    console.log('TODO downloading: ', item.name)
                  })
                }
              />
              {!isCurrent && <FMButton label="Restore" variant="primary" onClick={() => void restoreVersion(item)} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

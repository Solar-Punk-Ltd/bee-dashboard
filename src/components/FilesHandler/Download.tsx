import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import NotificationSign from '../NotificationSign'
import DownloadIcon from '../icons/DownloadIcon'
import { Context as FileManagerContext } from '../../providers/FileManager'
import { useContext, useState } from 'react'
import { startDownloadingQueue } from '../../utils/file'
import { useFileManagerGlobalStyles } from '../../styles/globalFileManagerStyles'

const useStyles = makeStyles(() =>
  createStyles({
    absoluteRight: {
      position: 'absolute',
      right: '5px',
      top: '2px',
    },
  }),
)

interface Props {
  notificationText?: string
}

const Download = (props: Props): ReactElement => {
  const classes = useStyles()
  const classesGlobal = useFileManagerGlobalStyles()
  const { fileDownLoadQueue, filemanager, setFileDownLoadQueue } = useContext(FileManagerContext)
  const [isActive, setIsActive] = useState(false)

  return (
    <div
      className={classesGlobal.dropdownElementContainer}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
    >
      <DownloadIcon color={isActive ? '#F2F2F2' : '#DE7700'} />

      <div>Download</div>
      {props.notificationText ? (
        <div className={classes.absoluteRight}>
          <NotificationSign text={props.notificationText} />
        </div>
      ) : null}
      <div className={classesGlobal.dropdownContainer} style={{ width: '200px' }}>
        <div
          onClick={() => {
            if (filemanager) {
              startDownloadingQueue(filemanager, fileDownLoadQueue)
            }
          }}
        >
          Start downloading queue
        </div>
        <div
          onClick={() => {
            if (setFileDownLoadQueue) {
              setFileDownLoadQueue([])
            }
          }}
        >
          Clear queue
        </div>
      </div>
    </div>
  )
}

export default Download

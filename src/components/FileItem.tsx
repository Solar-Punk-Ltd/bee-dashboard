import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useState } from 'react'
import Preview from './FileItemPreview'
import FileTypeIcon from './icons/FileTypeIcon'
import FileItemEdit from './FileItemEdit'
import SharedIcon from './icons/SharedIcon'
import DownloadQueueIcon from './icons/DownloadQueueIcon'
import FolderEnteringIcon from './icons/FolderEnteringIcon'
import FileNoteIcon from './icons/FileNoteIcon'
import FileLabelIcon from './icons/FileLabelIcon'
import NotificationSign from './NotificationSign'
import FileModal from './FileModal/FileModal'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      position: 'relative',
      backgroundColor: '#ffffff',
      fontSize: '12px',
      cursor: 'pointer',
      display: 'flex',
      justifyContent: 'space-between',
    },
    leftSide: {
      display: 'flex',
      width: '48px',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: '#33333333',
      paddingBottom: '5px',
    },
    folderLeftSide: {
      display: 'flex',
      width: '48px',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: '#333333',
    },
    middleSide: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      padding: '5px',
      justifyContent: '',
      flexGrow: 1,
    },
    rightSide: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'end',
    },
    flexDisplay: {
      display: 'flex',
      alignItems: 'center',
    },
    fileNameRow: {
      display: 'flex',
      gap: '15px',
      fontSize: '20px',
      marginLeft: '28px',
      marginRight: '10px',
    },
    fileDataText: {
      fontWeight: 'bold',
      marginLeft: '30px',
    },
    icons: {
      display: 'flex',
      gap: '5px',
      paddingTop: '5px',
      paddingRight: '5px',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileTypeIcon: {
      marginTop: 'auto',
    },
  }),
)

interface Props {
  name: string
  type: string
  size: string
  hash: string
  expires: string
  preview?: string
  note?: boolean
  tag?: boolean
  shared?: 'me' | 'others'
  warning?: boolean
  addedToQueue?: boolean
}

const FileItem = ({
  name,
  type,
  size,
  hash,
  expires,
  preview,
  note,
  tag,
  shared,
  warning,
  addedToQueue,
}: Props): ReactElement => {
  const classes = useStyles()
  const [showFileModal, setShowFileModal] = useState(false)

  return (
    <div>
      <div className={classes.container} onClick={() => setShowFileModal(true)}>
        <div className={type !== 'folder' ? classes.leftSide : classes.folderLeftSide}>
          {type !== 'folder' && preview ? <Preview /> : null}
          {type === 'folder' ? <FolderEnteringIcon /> : null}
          <div className={classes.fileTypeIcon}>
            <FileTypeIcon type={type} />
          </div>
        </div>
        <div className={classes.middleSide}>
          <div className={classes.fileNameRow}>
            {name}
            <DownloadQueueIcon added={addedToQueue} />
          </div>
          <div className={classes.flexDisplay}>
            <div className={classes.fileDataText}>
              {expires} - {size} GB
            </div>
          </div>
        </div>
        <div className={classes.rightSide}>
          <div className={classes.icons}>
            {note ? <FileNoteIcon /> : null}
            {tag ? <FileLabelIcon /> : null}
            {shared ? <SharedIcon sharedBy={shared} /> : null}
            {warning ? <NotificationSign text="!" /> : null}
          </div>
          <FileItemEdit />
        </div>
      </div>
      {showFileModal ? <FileModal modalDisplay={value => setShowFileModal(value)} /> : null}
    </div>
  )
}

export default FileItem

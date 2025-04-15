import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import ImageLineIcon from 'remixicon-react/ImageLineIcon'
import DraftFillIcon from 'remixicon-react/DraftFillIcon'
import File2FillIcon from 'remixicon-react/File2FillIcon'
import VideoIcon from './VideoIcon'
import AudioIcon from './AudioIcon'
import FolderIcon from './FolderIcon'
import { FileTypes } from '../../constants'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      position: 'relative',
    },
  }),
)

interface Props {
  type: string
}

const FileTypeIcon = ({ type }: Props): ReactElement => {
  const classes = useStyles()

  return (
    <div className={classes.container}>
      {type === FileTypes.Video && <VideoIcon />}
      {type === FileTypes.Audio && <AudioIcon />}
      {type === FileTypes.Image && <ImageLineIcon size="20" />}
      {type === FileTypes.Document && <DraftFillIcon size="20" />}
      {type === FileTypes.Folder && <FolderIcon />}
      {type === 'other' && <File2FillIcon size="20" />}
    </div>
  )
}

export default FileTypeIcon

import { createStyles, makeStyles } from '@material-ui/core'

import { ReactElement, useContext } from 'react'
import FileUpload from './FileUpload/FileUpload'
import VolumeManage from './VolumeManage/VolumeManage'
import { Context as StampContext } from '../providers/Stamps'
import Volume from './VolumeManage/Volume'
import { Bee } from '@upcoming/bee-js'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      position: 'relative',
      height: '65px',
      boxSizing: 'border-box',
      fontSize: '12px',
      display: 'flex',
      gap: '10px',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: 'white',
      marginBottom: '20px',
    },
    flex: {
      display: 'flex',
      height: '100%',
    },
  }),
)

const FilesHandler = (): ReactElement => {
  const classes = useStyles()
  // const bee = new Bee('http://localhost:1633')
  const { usableStamps } = useContext(StampContext)

  // eslint-disable-next-line no-alert
  alert(usableStamps[0].duration.toEndDate(new Date()))

  return (
    <div className={classes.container}>
      <div className={classes.flex}>
        {usableStamps?.map((stamp, index) => (
          <div key={index} className={classes.flex}>
            <Volume
              label={stamp.label}
              size={stamp.amount}
              validity={stamp.duration.toEndDate(new Date()).getTime()}
              notificationText="!"
            />
          </div>
        ))}
        <VolumeManage />
      </div>
      <div className={classes.flex}>
        <FileUpload usableStamps={usableStamps} />
      </div>
    </div>
  )
}

export default FilesHandler

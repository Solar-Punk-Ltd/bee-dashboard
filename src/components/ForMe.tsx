import { createStyles, makeStyles } from '@material-ui/core'
import { useState } from 'react'
import type { ReactElement } from 'react'
import ShareIcon from './ShareIcon'
import SwarmCheckedIcon from './SwarmCheckedIcon'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      position: 'relative',
      backgroundColor: '#ffffff',
      fontSize: '12px',
      display: 'flex',
      width: '65px',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      cursor: 'pointer',
      fontFamily: '"iAWriterMonoV", monospace',
      '&:hover': {
        backgroundColor: '#f0f0f0',
      },
    },
    flex: {
      display: 'flex',
    },
    absolute: {
      position: 'absolute',
      left: '15px',
    },
  }),
)

const ForMe = (): ReactElement => {
  const classes = useStyles()
  const [clicked, setClicked] = useState(false)

  return (
    <div className={classes.container} onClick={() => setClicked(!clicked)}>
      <div className={classes.flex}>
        <div className={classes.absolute}>
          <SwarmCheckedIcon color={clicked ? '#DE7700' : '#33333333'} />
        </div>
        <ShareIcon color={clicked ? '#333333' : '#33333333'} />
      </div>
      <div>For Me</div>
    </div>
  )
}

export default ForMe

import { createStyles, makeStyles } from '@material-ui/core'

import type { ReactElement } from 'react'
import HomeIcon from './HomeIcon'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      position: 'relative',
      paddingTop: '10px',
      paddingBottom: '10px',
      height: '48px',
      width: '64px',
      boxSizing: 'border-box',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      backdropFilter: 'blur(10px)',
      boxShadow: '2px 2px 7px 0px #0000001A',
    },
  }),
)

const FileHome = (): ReactElement => {
  const classes = useStyles()

  return (
    <div className={classes.container}>
      <HomeIcon />
      Home
    </div>
  )
}

export default FileHome

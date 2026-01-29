import { ReactElement, ReactNode } from 'react'
import { makeStyles } from 'tss-react/mui'
import { Typography } from '@mui/material'
import ListItem from '@mui/material/ListItem'

const useStyles = makeStyles()(theme => ({
  header: {
    backgroundColor: '#F7F7F7',
    marginBottom: theme.spacing(0.25),
  },
  typography: {
    color: '#242424',
  },
}))

interface Props {
  children?: ReactNode | ReactNode[]
}

export default function ExpandableListItemNote({ children }: Props): ReactElement | null {
  const { classes } = useStyles()

  return (
    <ListItem className={classes.header}>
      <Typography variant="body1" className={classes.typography}>
        {children}
      </Typography>
    </ListItem>
  )
}

import Box from '@mui/material/Box'
import LinearProgress, { LinearProgressProps } from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import React, { ReactElement } from 'react'

interface Props {
  linearProgressProps?: LinearProgressProps
  value: number
  indeterminate?: boolean
}

export function LinearProgressWithLabel({ indeterminate, ...props }: Props): ReactElement {
  return (
    <Box display="flex" alignItems="center">
      <Box width="100%" mr={1}>
        <LinearProgress variant={indeterminate ? 'indeterminate' : 'determinate'} {...props} />
      </Box>
      <Box minWidth={35}>
        <Typography variant="body2" color="textSecondary">
          {indeterminate ? 'Syncing...' : `${Math.round(props.value)}%`}
        </Typography>
      </Box>
    </Box>
  )
}

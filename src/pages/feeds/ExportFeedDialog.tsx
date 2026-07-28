import { Box, Typography } from '@mui/material'
import { saveAs } from 'file-saver'
import { useSnackbar } from 'notistack'
import { ReactElement } from 'react'
import Clipboard from 'remixicon-react/ClipboardLineIcon'
import Download from 'remixicon-react/DownloadLineIcon'
import { makeStyles } from 'tss-react/mui'

import { Code } from '../../components/Code'
import ExpandableListItemActions from '../../components/ExpandableListItemActions'
import { SwarmButton } from '../../components/SwarmButton'
import { SwarmDialog } from '../../components/SwarmDialog'
import { TitleWithClose } from '../../components/TitleWithClose'
import { Identity } from '../../providers/Feeds'
import { exportIdentity } from '../../utils/identity'

interface Props {
  identity: Identity
  onClose: () => void
}

const useStyles = makeStyles()(() => ({
  wrapper: {
    maxWidth: '100%',
  },
}))

export function ExportFeedDialog({ identity, onClose }: Props): ReactElement {
  const { enqueueSnackbar } = useSnackbar()

  const { classes } = useStyles()

  const exportData = exportIdentity(identity)

  function onDownload() {
    saveAs(
      new Blob([exportData], {
        type: 'application/json',
      }),
      identity.name + '.json',
    )
  }

  function onCopy() {
    navigator.clipboard.writeText(exportData).then(() => enqueueSnackbar('Copied to Clipboard', { variant: 'success' }))
  }

  return (
    <SwarmDialog>
      <Box mb={4}>
        <TitleWithClose onClose={onClose}>Export</TitleWithClose>
      </Box>
      <Box mb={2}>
        <Typography align="center">
          We exported the identity and feed reference associated with this feed as a JSON file.
        </Typography>
      </Box>
      <Box mb={4} className={classes.wrapper}>
        <Code prettify>{exportData}</Code>
      </Box>
      <ExpandableListItemActions>
        <SwarmButton iconType={Download} onClick={onDownload}>
          Download JSON File
        </SwarmButton>
        <SwarmButton iconType={Clipboard} onClick={onCopy}>
          Copy To Clipboard
        </SwarmButton>
      </ExpandableListItemActions>
    </SwarmDialog>
  )
}

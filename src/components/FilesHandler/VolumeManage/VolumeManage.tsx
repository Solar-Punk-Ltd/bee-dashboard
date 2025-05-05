/* eslint-disable no-alert */
import type { ReactElement } from 'react'
import { useContext, useState } from 'react'
import MoreFillIcon from 'remixicon-react/MoreFillIcon'
import ManageVolumesModal from './ManageVolumesModal'
import { useFileManagerGlobalStyles } from '../../../styles/globalFileManagerStyles'
import { CircularProgress } from '@mui/material'
import { Context as FileManagerContext } from '../../../providers/FileManager'

const VolumeManage = (): ReactElement => {
  const classes = useFileManagerGlobalStyles()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { isVolumeCreationPending } = useContext(FileManagerContext)

  return (
    <div>
      <div className={classes.filesHandlerItemContainer} onClick={() => setIsModalOpen(true)}>
        {isVolumeCreationPending ? (
          <CircularProgress
            size={16}
            sx={{
              color: '#DE7700',
            }}
            thickness={22}
          />
        ) : (
          <MoreFillIcon size={16} />
        )}
        <div>Manage</div>
      </div>
      {isModalOpen && <ManageVolumesModal modalDisplay={(value: boolean) => setIsModalOpen(value)} />}
    </div>
  )
}

export default VolumeManage

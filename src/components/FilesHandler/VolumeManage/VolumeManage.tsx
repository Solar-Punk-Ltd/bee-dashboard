/* eslint-disable no-alert */
import type { ReactElement } from 'react'
import { useState } from 'react'
import MoreFillIcon from 'remixicon-react/MoreFillIcon'
import ManageVolumesModal from './ManageVolumesModal'
import { useFileManagerGlobalStyles } from '../../../styles/globalFileManagerStyles'
import { CircularProgress } from '@mui/material'

const VolumeManage = (): ReactElement => {
  const classes = useFileManagerGlobalStyles()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  return (
    <div>
      <div className={classes.filesHandlerItemContainer} onClick={() => setIsModalOpen(true)}>
        {isPending ? (
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
      {isModalOpen && (
        <ManageVolumesModal modalDisplay={(value: boolean) => setIsModalOpen(value)} setIsPending={setIsPending} />
      )}
    </div>
  )
}

export default VolumeManage

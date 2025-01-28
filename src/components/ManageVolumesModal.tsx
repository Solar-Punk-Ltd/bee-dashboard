/* eslint-disable no-alert */
import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useState } from 'react'
import NotificationSign from './NotificationSign'
import VolumeModal from './VolumeModal'

const useStyles = makeStyles(() =>
  createStyles({
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 999,
    },
    modalContainer: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: '#EDEDED',
      padding: '20px',
      width: '552px',
      height: '696px',
    },
    modalHeader: {
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '20px',
      fontWeight: 700,
      lineHeight: '26px',
    },
    modalContent: {
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: '28px',
    },
    flexCenter: {
      display: 'flex',
      gap: '20px',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    },
    volumenButtonContainer: {
      position: 'relative',
    },
    buttonElement: {
      backgroundColor: '#FFFFFF',
      width: '256px',
      height: '42px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      '&:hover': {
        backgroundColor: '#DE7700',
        color: '#FFFFFF',
      },
    },
    buttonElementNotificationSign: {
      position: 'absolute',
      right: '-25px',
      top: '0',
    },
    buttonNewVolume: {
      backgroundColor: '#DE7700',
      color: '#FFFFFF',
    },
    newButtonContainer: {
      display: 'flex',
      justifyContent: 'center',
    },
    cancelButtonContainer: {
      display: 'flex',
      justifyContent: 'right',
    },
  }),
)

interface ManageModalProps {
  modalDisplay: (value: boolean) => void
}

const ManageVolumesModal = (props: ManageModalProps): ReactElement => {
  const classes = useStyles()
  const [newVolumeModalDisplay, setNewVolumeModalDisplay] = useState(false)

  const infoArray = [
    { text: 'Vol-1', warning: false },
    { text: 'MYVIDS', warning: false },
    { text: 'Vol-3', warning: false },
    { text: 'Vol-4', warning: false },
    { text: 'Vol-5', warning: true },
  ]

  return (
    <div className={classes.modal}>
      <div className={classes.modalContainer}>
        <div className={classes.modalHeader}>Manage volumes</div>
        <div className={classes.modalContent}>
          {
            "Info, Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s..."
          }
        </div>
        <div className={classes.flexCenter}>
          {infoArray.map((info, index) => (
            <div key={index} className={classes.volumenButtonContainer}>
              <div className={classes.buttonElement}>{info.text}</div>
              <div className={classes.buttonElementNotificationSign}>
                {info.warning ? <NotificationSign text="!" /> : null}
              </div>
            </div>
          ))}
        </div>
        <div className={classes.newButtonContainer}>
          <div
            className={`${classes.buttonElement} ${classes.buttonNewVolume}`}
            onClick={() => setNewVolumeModalDisplay(true)}
          >
            New volume
          </div>
        </div>
        <div className={classes.cancelButtonContainer}>
          <div
            className={classes.buttonElement}
            style={{ width: '160px', zIndex: '110' }}
            onClick={() => props.modalDisplay(false)}
          >
            Cancel
          </div>
        </div>
      </div>
      {newVolumeModalDisplay && <VolumeModal modalDisplay={(value: boolean) => setNewVolumeModalDisplay(value)} />}
    </div>
  )
}

export default ManageVolumesModal

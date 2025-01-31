import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useState } from 'react'
import VolumePropertiesModal from './VolumePropertiesModal'
import VolumeSharingModal from './VolumeSharingModal'

const useStyles = makeStyles(() =>
  createStyles({
    modal: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(5px)',
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    },
    modalContainer: {
      display: 'flex',
      gap: '20px',
      flexDirection: 'column',
      // justifyContent: 'space-between',
      backgroundColor: '#EDEDED',
      padding: '20px',
      width: '552px',
      height: '696px',
    },
    tabPanel: {
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
      backgroundColor: '#F7F7F7',
      height: '42px',
      fontFamily: '"iAWriterMonoV", monospace',
    },
    tabPanelItem: {
      cursor: 'pointer',
      display: 'flex',
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    tabPanelItemActive: {
      display: 'flex',
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      color: 'black',
    },
  }),
)

interface VolumeModalProps {
  modalDisplay: (value: boolean) => void
  new?: boolean
}

const VolumeModal = (props: VolumeModalProps): ReactElement => {
  const classes = useStyles()
  const [activeTab, setActiveTab] = useState('Properties')

  const alreadyAddedWithACT = [
    '0x9cbDe6569BA1220E46f256371368A05f480bb78C',
    '0x9cbDe6569BA1220E46f256371368A05f480bb78C',
    '0x9cbDe6569BA1220E46f256371368A05f480bb78C',
  ]

  return (
    <div className={classes.modal}>
      <div className={classes.modalContainer}>
        <div className={classes.tabPanel}>
          <div
            className={`${classes.tabPanelItem} ${activeTab === 'Properties' ? classes.tabPanelItemActive : null}`}
            onClick={() => setActiveTab('Properties')}
          >
            Properties
          </div>
          <div
            className={`${classes.tabPanelItem} ${activeTab === 'Sharing' ? classes.tabPanelItemActive : null}`}
            onClick={() => setActiveTab('Sharing')}
          >
            Sharing
          </div>
        </div>
        {activeTab === 'Properties' ? (
          <VolumePropertiesModal modalDisplay={props.modalDisplay} newVolume={props.new ? props.new : false} />
        ) : null}
        {activeTab === 'Sharing' ? (
          <VolumeSharingModal
            textToBeDisabled={alreadyAddedWithACT}
            modalDisplay={value => props.modalDisplay(value)}
          />
        ) : null}
      </div>
    </div>
  )
}

export default VolumeModal

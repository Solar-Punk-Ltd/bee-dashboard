import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import { SwarmTextInput } from '../SwarmTextInput'

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
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: '#EDEDED',
      padding: '20px',
      width: '552px',
      height: '696px',
      fontFamily: '"iAWriterMonoV", monospace',
      color: '#333333',
    },
    modalHeader: {
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '24px',
      fontWeight: 400,
      lineHeight: '32px',
    },
    fileInfoContainer: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: '50px',
      backgroundColor: '#CFCDCD',
    },
    item: {
      backgroundColor: '#CFCDCD',
      padding: '20px',
      fontFamily: "'iAWriterMonoV', monospace",
      color: '#333333',
    },
    itemValue: {
      fontWeight: 700,
    },
    buttonElement: {
      backgroundColor: '#FFFFFF',
      width: '256px',
      height: '42px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      '&:hover': {
        backgroundColor: '#DE7700',
        color: '#FFFFFF',
      },
    },
  }),
)

interface VolumeModalProps {
  modalDisplay: (value: boolean) => void
}

const UploadModal = (props: VolumeModalProps): ReactElement => {
  const classes = useStyles()

  return (
    <div className={classes.modal}>
      <div className={classes.modalContainer}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'space-between' }}>
          <div className={classes.modalHeader}>Upload Confirmation</div>
          <div className={classes.fileInfoContainer}>
            <div className={classes.item}>
              <div>Target Volume:</div>
              <div className={classes.itemValue}>MYVID</div>
            </div>
            <div className={classes.item}>
              <div>Selected items count:</div>
              <div className={classes.itemValue}>1</div>
            </div>
            <div className={classes.item}>
              <div>Validity:</div>
              <div className={classes.itemValue}>2025/12/31</div>
            </div>
            <div className={classes.item}>
              <div>Selected item types:</div>
              <div className={classes.itemValue}>Files, Folders</div>
            </div>
            <div className={classes.item}>
              <div>Free space:</div>
              <div className={classes.itemValue}>3.64GB</div>
            </div>
            <div className={classes.item}>
              <div>Neccessary space:</div>
              <div className={classes.itemValue}>1.08GB</div>
            </div>
          </div>
          <SwarmTextInput name="addDetails" label="Add details" multiline={true} rows={4} required={false} />
          <SwarmTextInput name="addLabels" label="Add labels" multiline={true} rows={4} required={false} />
        </div>
        <div style={{ display: 'flex', gap: '25px', justifyContent: 'right' }}>
          <div className={classes.buttonElement} style={{ width: '160px' }} onClick={() => props.modalDisplay(false)}>
            Cancel
          </div>
          <div
            className={classes.buttonElement}
            style={{ width: '160px', backgroundColor: '#DE7700', color: '#FFFFFF' }}
            onClick={() => props.modalDisplay(false)}
          >
            Upload
          </div>
        </div>
      </div>
    </div>
  )
}

export default UploadModal

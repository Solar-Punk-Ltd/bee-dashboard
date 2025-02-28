import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { SwarmTextInput } from '../SwarmTextInput'
import DateSlider from './DateSlider'
import SizeSlider from './SizeSlider'
import { bytesConversion } from '../../utils/file'
import { Bee, Duration } from '@upcoming/bee-js'

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
    buttonElementCancel: {
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
    buttonContainer: {
      display: 'flex',
      gap: '20px',
      justifyContent: 'right',
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
    flex: {
      display: 'flex',
      gap: '20px',
    },
    inputContainer: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '168px',
      backgroundColor: '#ffffff',
      justifyContent: 'left',
      alignItems: 'top',
      padding: '5px 15px',
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '10px',
    },
    inputContainerName: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '42px',
      backgroundColor: '#ffffff',
      justifyContent: 'left',
      alignItems: 'top',
      padding: '5px 15px',
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '10px',
    },
    textarea: {
      paddingLeft: '0px',
      height: '100%',
      resize: 'none',
      border: 'none',
      width: '100%',
      '&:focus': {
        outline: 'none',
      },
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '14px',
    },
    infoContainer: {
      height: '42px',
      backgroundColor: '#F7F7F7',
      color: '#878787',
      padding: '5px 15px',
      fontSize: '14x',
    },

    copyIconContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      cursor: 'pointer',
      backgroundColor: '#FFFFFF',
      height: '53px',
      width: '53px',
    },
    mark: {
      height: 16,
      width: 2,
      backgroundColor: '#878787',
      marginTop: -7,
    },
    markLabel: {
      fontSize: '10px',
      color: '#333333',
      fontFamily: '"iAWriterMonoV", monospace',
    },
    thumb: {
      height: 24,
      width: 24,
      backgroundColor: 'red',
      borderRadius: '50%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      '&:focus, &:hover, &$active': {
        boxShadow: 'inherit',
      },
    },
    costContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '24px',
    },
    volumeSliders: {
      display: 'flex',
      flexDirection: 'column',
      gap: '150px',
      alignItems: 'center',
      marginRight: '10px',
    },
    createButtonEnabled: {
      backgroundColor: '#DE7700',
      color: '#FFFFFF',
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
    createButtonDisabled: {
      backgroundColor: '#878787',
      color: '#FFFFFF',
      cursor: 'not-allowed',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    },
  }),
)

interface VolumePropertiesModalProps {
  newVolume: boolean
  modalDisplay: (value: boolean) => void
}

const NewVolumePropertiesModal = ({ newVolume, modalDisplay }: VolumePropertiesModalProps): ReactElement => {
  const classes = useStyles()
  const [size, setSize] = useState(bytesConversion(0, 'GB'))
  const [validity, setValidity] = useState(new Date())
  const [cost, setCost] = useState('')
  const [label, setLabel] = useState('')
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)

  const bee = new Bee('http://localhost:1633')

  const createPostageStamp = async () => {
    if (size > 0 && validity.getTime() > new Date().getTime()) {
      await bee.buyStorage(size, Duration.fromEndDate(validity), { label: label })
      modalDisplay(false)
    }
  }

  useEffect(() => {
    const fetchCost = async () => {
      if (size > bytesConversion(0, 'GB') && validity.getTime() > new Date().getTime()) {
        const cost = await bee.getStorageCost(size, Duration.fromEndDate(validity))
        setCost(cost.toSignificantDigits(2))
      } else {
        setCost('0')
      }
    }

    fetchCost()

    if (size > 0 && validity.getTime() > new Date().getTime()) {
      setIsCreateEnabled(true)
    } else {
      setIsCreateEnabled(false)
    }
  }, [size, validity])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: '1' }}>
      <div
        id="PropertiesContainer"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{}}>
              <SwarmTextInput name="name" label="label" required={false} onChange={e => setLabel(e.target.value)} />
            </div>
          </div>
        </div>
        <div className={classes.volumeSliders}>
          <SizeSlider onChange={value => setSize(bytesConversion(value, 'GB'))} exactValue={0} />
          <DateSlider
            type="date"
            upperLabel="Extend validity to:"
            exactValue={new Date().getTime()}
            lowerLabel="Current:"
            onDateChange={value => setValidity(new Date(value))}
          />
        </div>
        <div className={classes.costContainer}>
          Cost: &nbsp; <span style={{ fontWeight: 700 }}>{cost !== null ? cost : '0'} BZZ</span>
        </div>

        <div className={classes.buttonContainer}>
          <div className={classes.buttonElementCancel} style={{ width: '160px' }} onClick={() => modalDisplay(false)}>
            Cancel
          </div>
          <div
            className={isCreateEnabled ? classes.createButtonEnabled : classes.createButtonDisabled}
            style={{ width: '160px' }}
            onClick={createPostageStamp}
          >
            Create
          </div>{' '}
          :
        </div>
      </div>
    </div>
  )
}

export default NewVolumePropertiesModal

import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import DestroyIcon from '../icons/DestroyIcon'
import DownloadIcon from '../icons/DownloadIcon'
import { SwarmTextInput } from '../SwarmTextInput'
import { ActiveVolume } from './VolumeModal'
import DateSlider from './DateSlider'
import SizeSlider from './SizeSlider'
import { bytesConversion, getHumanReadableFileSize } from '../../utils/file'
import { Bee } from '@upcoming/bee-js'

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
    buttonElementUpdate: {
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
    buttonElementNotificationSign: {
      position: 'absolute',
      right: '-25px',
      top: '0',
    },
    buttonNewVolume: {
      backgroundColor: '#DE7700',
      color: '#FFFFFF',
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
    downloadButtonContainer: {
      display: 'flex',
      padding: '40px 60px',
      flexDirection: 'column',
      width: '113px !important',
      height: '64px',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      cursor: 'pointer',
      '&:hover': {
        backgroundColor: '#DE7700',
        color: '#FFFFFF',
      },
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
  }),
)

interface VolumePropertiesModalProps {
  newVolume: boolean
  modalDisplay: (value: boolean) => void
  activeVolume: ActiveVolume
}

const VolumePropertiesModal = ({ newVolume, modalDisplay, activeVolume }: VolumePropertiesModalProps): ReactElement => {
  const classes = useStyles()
  const [isHoveredDestroy, setIsHoveredDestroy] = useState(false)
  const [isHoveredDownload, setIsHoveredDownload] = useState(false)
  const [size, setSize] = useState(bytesConversion(activeVolume.volume.size, 'GB'))
  const [validity, setValidity] = useState(0)
  const [cost, setCost] = useState('')

  const bee = new Bee('http://localhost:1633')

  useEffect(() => {
    const fetchCost = async () => {
      if (size > bytesConversion(activeVolume.volume.size, 'GB')) {
        const cost = await bee.getSizeExtensionCost(activeVolume.volume.batchID, size)
        setCost(cost.toSignificantDigits(5))
      } else {
        setCost('0')
      }
    }

    fetchCost()
  }, [activeVolume, size])

  const handleMouseEnterDestroy = () => {
    setIsHoveredDestroy(true)
  }

  const handleMouseLeaveDestroy = () => {
    setIsHoveredDestroy(false)
  }

  const handleMouseEnterDownload = () => {
    setIsHoveredDownload(true)
  }

  const handleMouseLeaveDownload = () => {
    setIsHoveredDownload(false)
  }

  const updateVolume = async () => {
    if (size > bytesConversion(activeVolume.volume.size, 'GB')) {
      await bee.extendStorageSize(activeVolume.volume.batchID, 8)
    }
  }

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
            {!newVolume ? (
              <div className={classes.infoContainer}>
                <div style={{ fontSize: '10px' }}>Volume</div>
                <div>{activeVolume?.volume.label}</div>
              </div>
            ) : (
              <div style={{}}>
                <SwarmTextInput name="name" label="Volume name (max. 6 char)" required={false} />
              </div>
            )}
          </div>
          {!newVolume ? (
            <div
              style={{
                display: 'flex',
                gap: '20px',
                backgroundColor: '#CFCDCD',
                padding: '20px',
                boxSizing: 'border-box',
              }}
            >
              <div
                className={classes.downloadButtonContainer}
                onMouseEnter={handleMouseEnterDestroy}
                onMouseLeave={handleMouseLeaveDestroy}
              >
                <DestroyIcon color={isHoveredDestroy ? '#FFFFFF' : '#333333'} />
                <div style={{ textAlign: 'center' }}>Destroy volume</div>
              </div>
              <div
                className={classes.downloadButtonContainer}
                onMouseEnter={handleMouseEnterDownload}
                onMouseLeave={handleMouseLeaveDownload}
              >
                <DownloadIcon color={isHoveredDownload ? '#FFFFFF' : '#333333'} />
                <div style={{ textAlign: 'center' }}>Download now</div>
              </div>
            </div>
          ) : null}
        </div>
        <div className={classes.volumeSliders}>
          <SizeSlider
            onChange={value => setSize(bytesConversion(value, 'GB'))}
            exactValue={activeVolume?.volume.size ?? 0}
            lowerLabel={`Current/used: ${getHumanReadableFileSize(
              activeVolume?.volume.size ?? 0,
            )}/${getHumanReadableFileSize(activeVolume?.volume.remainingSize ?? 0)}`}
          />
          <DateSlider
            type="date"
            upperLabel="Extend validity to:"
            exactValue={activeVolume?.validity}
            lowerLabel="Current:"
            onDateChange={date => {
              setValidity(validity)
            }}
          />
        </div>
        <div className={classes.costContainer}>
          Cost: &nbsp; <span style={{ fontWeight: 700 }}>{cost !== null ? cost : '0'} BZZ</span>
        </div>

        <div className={classes.buttonContainer}>
          <div className={classes.buttonElementCancel} style={{ width: '160px' }} onClick={() => modalDisplay(false)}>
            Cancel
          </div>
          <div className={classes.buttonElementUpdate} style={{ width: '160px' }} onClick={() => updateVolume()}>
            {newVolume ? 'Create' : 'Update'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default VolumePropertiesModal

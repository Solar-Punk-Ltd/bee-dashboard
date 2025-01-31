import { createStyles, makeStyles, Slider } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useState } from 'react'
import DownloadIcon from './DownloadIcon'
import { SwarmTextInput } from './SwarmTextInput'
import DestroyIcon from './DestroyIcon'
import SwarmIcon from './SwarmIcon'
import SliderFileManager from './SliderFileManager'

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
      //   width: '129px',
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
      //   border: '20px solid #CFCDCD',
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
  }),
)

interface VolumePropertiesModalProps {
  newVolume: boolean
  modalDisplay: (value: boolean) => void
}

const VolumePropertiesModal = (props: VolumePropertiesModalProps): ReactElement => {
  const classes = useStyles()
  const [isHoveredDestroy, setIsHoveredDestroy] = useState(false)
  const [isHoveredDownload, setIsHoveredDownload] = useState(false)

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

  const sizeMarks = [
    {
      value: 0,
    },
    {
      value: 10,
    },
    {
      value: 20,
    },
    {
      value: 30,
    },
  ]

  const dateMarks = [
    {
      value: 10,
    },
    {
      value: 20,
    },
    {
      value: 30,
    },
  ]

  const erasureCodeMarks = [
    {
      value: 1,
    },
    {
      value: 2,
    },
    {
      value: 3,
    },
    {
      value: 3,
    },
  ]

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
            {!props.newVolume ? (
              <div className={classes.infoContainer}>
                <div style={{ fontSize: '10px' }}>Volume</div>
                <div>MYVIDS</div>
              </div>
            ) : (
              <div style={{}}>
                <SwarmTextInput name="name" label="Volume name (max. 6 char)" required={false} />
              </div>
            )}
          </div>
          {!props.newVolume ? (
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
        <SliderFileManager
          upperLabel="Size:"
          defaultValue={9.16}
          marks={sizeMarks}
          min={0}
          max={40}
          step={0.01}
          upperMetric="GB"
          lowerLabel="Current/used:"
          lowerMetric="GB"
          disabledRange={{ min: 0, max: 9.16 }}
        />
        <SliderFileManager
          upperLabel="Validity:"
          defaultValue={20}
          marks={dateMarks}
          min={0}
          max={31}
          step={1}
          lowerLabel="Current:"
          upperMetric="/02/2025"
          lowerMetric="/02/2022"
          disabledRange={{ min: 0, max: 6 }}
        />
        <SliderFileManager
          upperLabel="Data protection:"
          defaultValue={1}
          type="text"
          marks={erasureCodeMarks}
          min={1}
          max={4}
          step={1}
          lowerLabel="Current:"
          disabledRange={{ min: 0, max: 0 }}
        />
        <div className={classes.costContainer}>
          Cost: &nbsp; <span style={{ fontWeight: 700 }}>123.45 BZZ</span>
        </div>

        <div className={classes.buttonContainer}>
          <div
            className={classes.buttonElementCancel}
            style={{ width: '160px' }}
            onClick={() => props.modalDisplay(false)}
          >
            Cancel
          </div>
          <div
            className={classes.buttonElementUpdate}
            style={{ width: '160px' }}
            onClick={() => props.modalDisplay(false)}
          >
            {props.newVolume ? 'Create' : 'Update'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default VolumePropertiesModal

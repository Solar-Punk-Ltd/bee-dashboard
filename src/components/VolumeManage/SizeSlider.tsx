import { createStyles, makeStyles, Slider } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useState } from 'react'
import VolumeSliderCustomInput from './VolumeSliderCustomInput'
import { bytesConversion, sizeToBytes } from '../../utils/file'
import OverMaxRangeIcon from '../icons/OverMaxRangeIcon'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      width: '93%',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      height: '16px',
      fontSize: '10px',
      fontFamily: '"iAWriterMonoV", monospace',
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
    boldSliderLabel: {
      display: 'inline-box',
      fontWeight: 'bold',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
    upperBoldSliderLabel: {
      cursor: 'pointer',
      display: 'inline-box',
      fontWeight: 'bold',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
    lowerBoldSliderLabel: {
      width: '100%',
      cursor: 'pointer',
      fontWeight: 'bold',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
    thumbVisible: {
      display: 'block',
    },
    thumbInvisible: {
      display: 'none',
    },
    leftRangeIcon: {
      position: 'relative',
      top: '6px',
      left: '0',
    },
    rightRangeIcon: {
      position: 'relative',
      top: '6px',
      right: '0',
      marginLeft: '2px',
      width: '7px',
    },
    overMaxRangeIconPlaceholder: {
      display: 'flex',
      width: '7px',
    },
  }),
)

interface Props {
  onChange: (value: number) => void
  lowerLabel?: string
  step?: number
  sliderValue?: number
  exactValue: number
}

const SizeSlider = ({ onChange, lowerLabel, step, exactValue }: Props): ReactElement => {
  const classes = useStyles()
  const [value, setValue] = useState<number>(0)
  const [selectedSize, setSelectedSize] = useState<number>(exactValue ?? 0)
  const [showCustomSize, setShowCustomSize] = useState(false)
  const [metric, setMetric] = useState('GB')
  const [isCustomValueSelected, setIsCustomValueSelected] = useState(false)
  const [isOverMaxIconVisible, setIsOverMaxIconVisible] = useState(false)

  const sizeMarks = [
    {
      value: 0,
      label: 'by 0GB',
    },
    {
      value: 1,
      label: 'by 4GB',
    },
    {
      value: 2,
      label: 'by 16GB',
    },
    {
      value: 3,
      label: 'by 128GB',
    },
    {
      value: 4,
      label: 'by 512GB',
    },
  ]

  const handleChange = (event: any, newValue: number | number[]) => {
    setValue(newValue as number)
    setSelectedSize((exactValue ?? 0) + sizes[newValue as number])

    onChange((exactValue ?? 0) + sizes[newValue as number])

    setMetric('GB')
  }

  const handleCustomChange = (size: number, metric: string) => {
    if (sizeToBytes(size, metric) > exactValue) {
      setSelectedSize(sizeToBytes(size, metric))
      onChange((exactValue ?? 0) + sizeToBytes(size, metric))
    }
    setMetric(metric)
  }

  const handleShowCustomSize = () => {
    setIsCustomValueSelected(true)

    setShowCustomSize(!showCustomSize)

    if (selectedSize > sizes[4]) {
      setIsOverMaxIconVisible(true)
    }
    // TODO It need to be discussed
    // if (selectedSize < exactValue) {
    //   setIsInvalidValueModalVisible(true)
    // }
  }

  const handleSliderClick = () => {
    setIsCustomValueSelected(false)
    setShowCustomSize(false)
    setIsOverMaxIconVisible(false)
  }

  const sizes = [0, sizeToBytes(4, 'GB'), sizeToBytes(16, 'GB'), sizeToBytes(128, 'GB'), sizeToBytes(512, 'GB')]

  return (
    <div className={classes.container}>
      <div>
        {showCustomSize ? (
          <VolumeSliderCustomInput
            defaultSize={Number(bytesConversion(selectedSize, metric).toFixed(0))}
            handleCustomChange={(value: number, metric: string) => handleCustomChange(value, metric)}
            metric={metric}
          />
        ) : null}
        <div className={classes.upperBoldSliderLabel} onClick={handleShowCustomSize}>
          {bytesConversion(selectedSize, metric).toFixed(2)} {metric}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }} onClick={handleSliderClick}>
        <Slider
          step={step}
          marks={sizeMarks}
          min={0}
          max={4}
          value={value}
          valueLabelDisplay="off"
          onChange={handleChange}
          classes={{
            mark: classes.mark,
            markLabel: classes.markLabel,
            thumb: isCustomValueSelected ? classes.thumbInvisible : classes.thumbVisible,
          }}
        />

        <div className={classes.rightRangeIcon}>
          {isOverMaxIconVisible ? <OverMaxRangeIcon /> : <div className={classes.overMaxRangeIconPlaceholder}></div>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'right' }}>
        <div style={{ display: 'flex', justifyContent: 'right' }}>
          <div className={classes.lowerBoldSliderLabel}>{lowerLabel}</div>
        </div>
      </div>
      {/* TODO It need to be discussed */}
      {/* {isInvalidValueModalVisible ? (
        <InvalidValueModal modalDisplay={() => setIsInvalidValueModalVisible(false)} />
      ) : null} */}
    </div>
  )
}

export default SizeSlider

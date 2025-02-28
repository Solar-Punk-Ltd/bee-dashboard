import { createStyles, makeStyles, Slider, TextField } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useState } from 'react'
import OverMaxRangeIcon from '../icons/OverMaxRangeIcon'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      width: '93%',
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
      fontWeight: 'bold',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
    rightRangeIcon: {
      position: 'relative',
      top: '6px',
      right: '0',
      marginLeft: '2px',
      width: '7px',
    },
    input: {
      color: '#333333',
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '10px',
      padding: '0px',
      paddingBottom: '2px',
      margin: '0px',
      marginTop: '1px',
      marginLeft: '5px',
      border: '0px',
      '&:hover': {
        cursor: 'pointer',
      },
    },
    thumbVisible: {
      display: 'block',
    },
    thumbInvisible: {
      display: 'none',
    },
    overMaxRangeIconPlaceholder: {
      display: 'flex',
      width: '7px',
    },
  }),
)

interface Props {
  color?: string
  type: 'number' | 'date' | 'bytes'
  marks?: { value: number }[]
  upperLabel?: string
  lowerLabel?: string
  min?: number
  max?: number
  step?: number
  sliderValue?: number
  defaultValue?: number
  exactValue?: number
  onDateChange: (value: Date) => void
}

const DateSlider = ({ upperLabel, exactValue, onDateChange }: Props): ReactElement => {
  const classes = useStyles()
  const [dateValue, setDateValue] = useState<Date>(new Date(exactValue ?? 0))
  const [sliderValue, setSliderValue] = useState<number>(0)
  const [isThumbVisible, setIsThumbVisible] = useState(false)
  const [isOverMaxIconVisible, setIsOverMaxIconVisible] = useState(false)
  //   const dateInputRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: any, newValue: number | number[]) => {
    const newDate = new Date(exactValue ?? 0)
    setIsThumbVisible(true)
    setIsOverMaxIconVisible(false)
    switch (newValue) {
      case 1:
        newDate.setDate(newDate.getDate() + 7) // 1 hét
        break
      case 2:
        newDate.setMonth(newDate.getMonth() + 1) // 1 hónap
        break
      case 3:
        newDate.setMonth(newDate.getMonth() + 3) // 3 hónap
        break
      case 4:
        newDate.setMonth(newDate.getMonth() + 6) // 6 hónap
        break
      case 5:
        newDate.setFullYear(newDate.getFullYear() + 1) // 1 év
        break
      default:
      // newDate.setDate(newDate.getDate())
    }
    setDateValue(newDate)
    setSliderValue(newValue as number)
    onDateChange(newDate)
  }

  const handleDatePickerChange = (event: any) => {
    setDateValue(new Date(event.target.value))

    if (new Date(event.target.value).getTime() > (exactValue ?? 0)) {
      setIsOverMaxIconVisible(true)
    } else {
      setIsOverMaxIconVisible(false)
    }
    setIsThumbVisible(false)
  }

  const dateSliderMarks = [
    { value: 0, label: 'Current' },
    { value: 1, label: 'By 1 week' },
    { value: 2, label: 'By 1 month' },
    { value: 3, label: 'By 3 months' },
    { value: 4, label: 'By 6 months' },
    { value: 5, label: 'By 1 year' },
  ]

  return (
    <div className={classes.container}>
      <div>
        <div style={{ display: 'flex' }}>
          {upperLabel}

          <TextField
            type="date"
            value={dateValue.toISOString().split('T')[0]}
            onChange={handleDatePickerChange}
            InputProps={{
              classes: {
                input: classes.input,
              },
            }}
          ></TextField>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Slider
          step={1}
          min={0}
          max={5}
          defaultValue={exactValue}
          value={sliderValue}
          marks={dateSliderMarks}
          valueLabelDisplay="off"
          onChange={handleChange}
          classes={{
            mark: classes.mark,
            markLabel: classes.markLabel,
            thumb: isThumbVisible ? classes.thumbVisible : classes.thumbInvisible,
          }}
        />
        <div className={classes.rightRangeIcon}>
          {isOverMaxIconVisible ? <OverMaxRangeIcon /> : <div className={classes.overMaxRangeIconPlaceholder}></div>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'right' }}>
        <div style={{ width: '135px', display: 'flex', justifyContent: 'right' }}>
          (Current:{' '}
          <span className={classes.boldSliderLabel}>{new Date(exactValue ?? 0).toLocaleDateString('en-GB')}</span>)
        </div>
      </div>
    </div>
  )
}

export default DateSlider

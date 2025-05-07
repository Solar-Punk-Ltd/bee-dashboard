import type { ReactElement } from 'react'
import { useContext, useEffect, useRef, useState } from 'react'
import { SwarmTextInput } from '../../SwarmTextInput'
import DateSlider from './DateSlider'
import SizeSlider from './SizeSlider'
import { BZZ, Duration, Size, BeeResponseError } from '@ethersphere/bee-js'
import { Context as SettingsContext } from '../../../providers/Settings'
import { Context as FileManagerContext } from '../../../providers/FileManager'
import { VOLUME_CHARACTER_NUMBER } from '../../../constants'
import { useFileManagerGlobalStyles } from '../../../styles/globalFileManagerStyles'

interface VolumePropertiesModalProps {
  newVolume: boolean
  modalDisplay: (value: boolean) => void
}

const NewVolumePropertiesModal = ({ newVolume, modalDisplay }: VolumePropertiesModalProps): ReactElement => {
  const classes = useFileManagerGlobalStyles()
  const [size, setSize] = useState(Size.fromBytes(0))
  const [validity, setValidity] = useState(new Date())
  const [cost, setCost] = useState('')
  const [label, setLabel] = useState('')
  const [isCreateEnabled, setIsCreateEnabled] = useState(false)
  const { beeApi } = useContext(SettingsContext)
  const { setIsNewVolumeCreated, setErrorText, setShowErrorModal, setIsVolumeCreationPending } =
    useContext(FileManagerContext)
  const currentFetch = useRef<Promise<void> | null>(null)

  const createPostageStamp = async () => {
    try {
      if (isCreateEnabled) {
        setIsVolumeCreationPending(true)
        modalDisplay(false)
        await beeApi?.buyStorage(size, Duration.fromEndDate(validity), { label })
        setIsNewVolumeCreated(true)
      }
    } catch (e) {
      let errorMessage = ''

      if (e instanceof BeeResponseError) {
        // eslint-disable-next-line no-console
        console.error('Bee API Error:', {
          message: e.message,
          method: e.method,
          url: e.url,
          status: e.status,
          statusText: e.statusText,
          responseBody: e.responseBody,
        })

        if (e.responseBody) {
          errorMessage = (e.responseBody as any).message
        }
      } else {
        // eslint-disable-next-line no-console
        console.error('Unexpected error:', e)
        errorMessage = 'Unexpected error: ' + e
      }

      // eslint-disable-next-line no-console
      console.error('Error message:', errorMessage)

      setErrorText(errorMessage)
      setShowErrorModal(true)
    } finally {
      setIsVolumeCreationPending(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target

    if (value.length <= VOLUME_CHARACTER_NUMBER) {
      setLabel(value)
    }
  }

  useEffect(() => {
    label ? setIsCreateEnabled(true) : setIsCreateEnabled(false)
  }, [label])

  useEffect(() => {
    const fetchCost = async () => {
      if (currentFetch.current) {
        await currentFetch.current
      }
      const fetchPromise = (async () => {
        let cost: BZZ | undefined = undefined
        try {
          if (size.toGigabytes() >= 0 && validity.getTime() >= new Date().getTime()) {
            cost = await beeApi?.getStorageCost(size, Duration.fromEndDate(validity))
            setCost(cost ? cost.toSignificantDigits(2) : '0')
          } else {
            setCost('0')
          }
        } catch (e) {
          setShowErrorModal(true)
        }
      })()
      currentFetch.current = fetchPromise
      await fetchPromise
      currentFetch.current = null
    }
    fetchCost()
  }, [size, validity])

  return (
    <div className={classes.propertiesContainer}>
      <div>
        <div style={{ display: 'flex' }}>
          <div style={{}}>
            <SwarmTextInput
              name="name"
              label="label"
              required={true}
              onChange={e => handleInputChange(e)}
              defaultValue={label}
            />
          </div>
        </div>
      </div>
      <div className={classes.volumeSliders}>
        <SizeSlider onChange={value => setSize(value)} exactValue={Size.fromBytes(0)} newVolume={true} />
        <DateSlider
          type="date"
          upperLabel="Validity:"
          exactValue={new Date()}
          lowerLabel="Current:"
          onDateChange={value => setValidity(new Date(value))}
          newVolume={true}
        />
      </div>
      <div className={classes.costContainer}>
        Cost: &nbsp; <span style={{ fontWeight: 700 }}>{cost !== null ? cost : '0'} BZZ</span>
      </div>

      <div className={classes.modalContent}>{'Creating a postage stamp might take several minutes.'}</div>

      <div className={classes.bottomButtonContainer}>
        <div
          className={`${classes.buttonElementBase} ${classes.generalButtonElement}`}
          style={{ width: '160px' }}
          onClick={() => modalDisplay(false)}
        >
          Cancel
        </div>
        <div
          className={`${classes.buttonElementBase} ${
            isCreateEnabled ? classes.updateButtonElement : classes.disabledUpdateButtonElement
          }`}
          style={{ width: '160px' }}
          onClick={async () => await createPostageStamp()}
        >
          Create
        </div>{' '}
      </div>
    </div>
  )
}

export default NewVolumePropertiesModal

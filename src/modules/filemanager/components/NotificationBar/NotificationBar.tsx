import { ReactElement, useContext, useEffect, useState } from 'react'
import './NotificationBar.scss'
import UpIcon from 'remixicon-react/ArrowUpSLineIcon'
import { ExpiringNotificationModal } from '../ExpiringNotificationModal/ExpiringNotificationModal'
import { getUsableStamps } from '../../utils/utils'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { PostageBatch } from '@ethersphere/bee-js'

export function NotificationBar(): ReactElement | null {
  const [showExpiringModal, setShowExpiringModal] = useState(false)
  const [stampsToExpire, setStampsToExpire] = useState([] as PostageBatch[])
  const { beeApi } = useContext(SettingsContext)

  const showExpiration = stampsToExpire.length > 0
  const NUMBER_OF_DAYS_WARNING = 7
  const DAYS_TO_MILLISECONDS_MULTIPLIER = 24 * 60 * 60 * 1000

  useEffect(() => {
    const getStamps = async () => {
      const stamps = await (
        await getUsableStamps(beeApi)
      ).filter(stamp => {
        return (
          stamp.duration &&
          stamp.duration.toEndDate().getTime() <= Date.now() + NUMBER_OF_DAYS_WARNING * DAYS_TO_MILLISECONDS_MULTIPLIER
        )
      })
      setStampsToExpire([...stamps])
    }
    getStamps()
  }, [beeApi])

  if (!showExpiration) return null

  return (
    <>
      <div className="fm-notification-bar fm-red-font" onClick={() => setShowExpiringModal(true)}>
        {stampsToExpire.length} drive{stampsToExpire.length !== 1 ? 's' : ''} expiring soon <UpIcon size="16px" />
      </div>
      {showExpiringModal && (
        <ExpiringNotificationModal
          stamps={stampsToExpire}
          onCancelClick={() => {
            setShowExpiringModal(false)
          }}
        />
      )}
    </>
  )
}

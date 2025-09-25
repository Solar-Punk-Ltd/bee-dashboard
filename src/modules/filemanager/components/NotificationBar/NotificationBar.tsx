import { ReactElement, useContext, useEffect, useState } from 'react'
import './NotificationBar.scss'
import UpIcon from 'remixicon-react/ArrowUpSLineIcon'
import { ExpiringNotificationModal } from '../ExpiringNotificationModal/ExpiringNotificationModal'
import { getUsableStamps } from '../../utils/bee'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { PostageBatch } from '@ethersphere/bee-js'

export function NotificationBar(): ReactElement | null {
  const [showExpiringModal, setShowExpiringModal] = useState(false)
  const [stampsToExpire, setStampsToExpire] = useState<PostageBatch[]>([])
  const { beeApi } = useContext(SettingsContext)

  const showExpiration = stampsToExpire.length > 0
  const NUMBER_OF_DAYS_WARNING = 7
  const DAYS_TO_MILLISECONDS_MULTIPLIER = 24 * 60 * 60 * 1000

  // TODO: map between drive and stamp, show only drives that are expiring
  useEffect(() => {
    let isMounted = true

    const getStamps = async () => {
      const stamps = (await getUsableStamps(beeApi)).filter(stamp => {
        return (
          stamp.duration &&
          stamp.duration.toEndDate().getTime() <= Date.now() + NUMBER_OF_DAYS_WARNING * DAYS_TO_MILLISECONDS_MULTIPLIER
        )
      })

      if (isMounted) {
        setStampsToExpire([...stamps])
      }
    }

    getStamps()

    return () => {
      isMounted = false
    }
  }, [beeApi, DAYS_TO_MILLISECONDS_MULTIPLIER])

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

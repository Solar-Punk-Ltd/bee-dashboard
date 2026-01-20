import { ReactElement, useState, useMemo, useEffect, useContext, useCallback } from 'react'
import './AdminStatusBar.scss'
import { Tooltip } from '../Tooltip/Tooltip'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { Context as FMContext } from '../../../../providers/FileManager'
import { ConfirmModal } from '../ConfirmModal/ConfirmModal'
import { useAdminDriveUpgrade } from '../../hooks/useAdminDriveUpgrade'
import { useAdminCapacityMetrics } from '../../hooks/useAdminCapacityMetrics'
import { AdminCapacityDisplay } from './AdminCapacityDisplay'
import { AdminStatusModals } from './AdminStatusModals'

interface AdminStatusBarProps {
  adminStamp: PostageBatch | null
  adminDrive: DriveInfo | null
  loading: boolean
  isCreationInProgress: boolean
  setErrorMessage?: (error: string) => void
}

export function AdminStatusBar({
  adminStamp,
  adminDrive,
  loading,
  isCreationInProgress,
  setErrorMessage,
}: AdminStatusBarProps): ReactElement {
  const { drives, setShowError } = useContext(FMContext)

  const [isUpgradeDriveModalOpen, setIsUpgradeDriveModalOpen] = useState(false)
  const [isUpgradeTimeoutModalOpen, setIsUpgradeTimeoutModalOpen] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [actualStamp, setActualStamp] = useState<PostageBatch | null>(adminStamp)
  const [showProgressModal, setShowProgressModal] = useState(true)

  useEffect(() => {
    setShowProgressModal(isCreationInProgress || loading)
  }, [isCreationInProgress, loading, setShowProgressModal])

  useEffect(() => {
    if (!adminStamp || !actualStamp) {
      setActualStamp(adminStamp)

      return
    }

    if (actualStamp.batchID.toString() !== adminStamp.batchID.toString()) {
      setActualStamp(adminStamp)

      return
    }

    const incomingSize = adminStamp.size.toBytes()
    const currentSize = actualStamp.size.toBytes()
    const incomingExpiry = adminStamp.duration.toEndDate().getTime()
    const currentExpiry = actualStamp.duration.toEndDate().getTime()

    if (incomingSize > currentSize || incomingExpiry > currentExpiry) {
      setActualStamp(adminStamp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminStamp])

  useAdminDriveUpgrade({
    adminDrive,
    adminStamp,
    setIsUpgrading,
    setIsUpgradeTimeoutModalOpen,
    setActualStamp,
    setErrorMessage,
    setShowError,
  })

  const handleTimeoutCancel = useCallback(() => {
    setIsUpgrading(false)
    setIsUpgradeTimeoutModalOpen(false)
  }, [])

  const { capacityPct, usedSize, totalSize } = useAdminCapacityMetrics(actualStamp, adminDrive, drives)

  const expiresAt = useMemo(
    () => (actualStamp ? actualStamp.duration.toEndDate().toLocaleDateString() : '—'),
    [actualStamp],
  )

  const isBusy = loading || isUpgrading || isCreationInProgress
  const blurCls = isBusy ? ' is-loading' : ''
  const statusVerb = isCreationInProgress ? 'Creating' : 'Loading'
  const statusText = statusVerb + '  admin drive, please do not reload'

  return (
    <div>
      <div className={`fm-admin-status-bar-container${blurCls}`} aria-busy={isBusy ? 'true' : 'false'}>
        <div className="fm-admin-status-bar-left">
          <AdminCapacityDisplay
            capacityPct={capacityPct}
            usedSize={usedSize}
            totalSize={totalSize}
            isUpgrading={isUpgrading}
          />

          <div>File Manager Available: Until: {expiresAt}</div>

          <Tooltip
            label="The File Manager works only while your storage remains valid. If it expires, all catalogue metadata is
            permanently lost."
          />
        </div>

        <AdminStatusModals
          isUpgradeDriveModalOpen={isUpgradeDriveModalOpen}
          setIsUpgradeDriveModalOpen={setIsUpgradeDriveModalOpen}
          isUpgradeTimeoutModalOpen={isUpgradeTimeoutModalOpen}
          actualStamp={actualStamp}
          adminDrive={adminDrive}
          setErrorMessage={setErrorMessage}
          handleTimeoutCancel={handleTimeoutCancel}
          isUpgrading={isUpgrading}
        />

        <div
          className="fm-admin-status-bar-upgrade-button"
          onClick={() => !isBusy && actualStamp && adminDrive && setIsUpgradeDriveModalOpen(true)}
          aria-disabled={isBusy ? 'true' : 'false'}
        >
          {isBusy ? 'Working…' : 'Manage'}
        </div>

        {showProgressModal && (
          <ConfirmModal
            title="Admin Drive Creation"
            isProgress
            spinnerMessage={statusText}
            showFooter={false}
            showMinimize={true}
            onMinimize={() => setShowProgressModal(false)}
          />
        )}
      </div>
      {!showProgressModal && (loading || isCreationInProgress) && (
        <div className="fm-admin-status-bar-progress-pill-container">
          <div className="fm-admin-status-progress-pill" onClick={() => setShowProgressModal(true)}>
            {statusText}
          </div>
        </div>
      )}
    </div>
  )
}

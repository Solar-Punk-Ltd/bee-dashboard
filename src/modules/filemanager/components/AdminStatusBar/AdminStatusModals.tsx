import { ReactElement } from 'react'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { UpgradeDriveModal } from '../UpgradeDriveModal/UpgradeDriveModal'
import { UpgradeTimeoutModal } from '../UpgradeTimeoutModal/UpgradeTimeoutModal'

interface AdminStatusModalsProps {
  isUpgradeDriveModalOpen: boolean
  setIsUpgradeDriveModalOpen: (open: boolean) => void
  isUpgradeTimeoutModalOpen: boolean
  actualStamp: PostageBatch | null
  adminDrive: DriveInfo | null
  setErrorMessage?: (error: string) => void
  handleTimeoutCancel: () => void
  isUpgrading: boolean
}

export function AdminStatusModals({
  isUpgradeDriveModalOpen,
  setIsUpgradeDriveModalOpen,
  isUpgradeTimeoutModalOpen,
  actualStamp,
  adminDrive,
  setErrorMessage,
  handleTimeoutCancel,
  isUpgrading,
}: AdminStatusModalsProps): ReactElement | null {
  return (
    <>
      {isUpgradeDriveModalOpen && actualStamp && adminDrive && (
        <UpgradeDriveModal
          stamp={actualStamp}
          drive={adminDrive}
          onCancelClick={() => setIsUpgradeDriveModalOpen(false)}
          setErrorMessage={setErrorMessage}
        />
      )}

      {isUpgradeTimeoutModalOpen && adminDrive && actualStamp && (
        <UpgradeTimeoutModal driveName={adminDrive.name} onCancel={handleTimeoutCancel} />
      )}

      {isUpgrading && (
        <div className="fm-drive-item-creating-overlay" aria-live="polite">
          <div className="fm-mini-spinner" />
          <span>Upgrading admin drive…</span>
        </div>
      )}
    </>
  )
}

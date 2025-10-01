import { ReactElement, useEffect, useState, useContext } from 'react'
import { createPortal } from 'react-dom'
import Drive from 'remixicon-react/HardDrive2LineIcon'
import DriveFill from 'remixicon-react/HardDrive2FillIcon'
import MoreFill from 'remixicon-react/MoreFillIcon'
import './DriveItem.scss'
import { ProgressBar } from '../../ProgressBar/ProgressBar'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { Button } from '../../Button/Button'
import { DestroyDriveModal } from '../../DestroyDriveModal/DestroyDriveModal'
import { UpgradeDriveModal } from '../../UpgradeDriveModal/UpgradeDriveModal'
import { ViewType } from '../../../constants/fileTransfer'
import { useView } from '../../../../../pages/filemanager/ViewContext'
import { Context as FMContext } from '../../../../../providers/FileManager'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'

interface DriveItemProps {
  drive: DriveInfo
  stamp: PostageBatch
  isSelected: boolean
}

const formatUsedGB = (n: number): string => {
  if (n === 0) return '0'

  if (n < 1) return Number(n.toPrecision(3)).toString()

  return n.toFixed(2)
}

export function DriveItem({ drive, stamp, isSelected }: DriveItemProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false)
  const [isDestroyDriveModalOpen, setIsDestroyDriveModalOpen] = useState(false)
  const [isUpgradeDriveModalOpen, setIsUpgradeDriveModalOpen] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)

  const { fm, refreshDrives } = useContext(FMContext)

  const { showContext, pos, contextRef, setPos, setShowContext } = useContextMenu<HTMLDivElement>()

  const { setView, setActualItemView } = useView()

  function handleMenuClick(e: React.MouseEvent) {
    setShowContext(true)
    setPos({ x: e.clientX, y: e.clientY })
  }

  function handleDestroyDriveClick() {
    setShowContext(false)
  }

  useEffect(() => {
    const id = drive.id.toString()
    const onStart = (e: Event) => {
      const { driveId } = (e as CustomEvent).detail || {}

      if (driveId === id) setIsUpgrading(true)
    }
    const onEnd = async (e: Event) => {
      const { driveId, success } = (e as CustomEvent).detail || {}

      if (driveId === id) {
        if (success) await Promise.resolve(refreshDrives?.())
        setIsUpgrading(false)
      }
    }

    window.addEventListener('fm:drive-upgrade-start', onStart as EventListener)
    window.addEventListener('fm:drive-upgrade-end', onEnd as EventListener)

    return () => {
      window.removeEventListener('fm:drive-upgrade-start', onStart as EventListener)
      window.removeEventListener('fm:drive-upgrade-end', onEnd as EventListener)
    }
  }, [drive.id, refreshDrives])

  return (
    <div
      className={`fm-drive-item-container${isSelected ? ' fm-drive-item-container-selected' : ''}`}
      onClick={() => {
        setView(ViewType.File)
        setActualItemView?.(drive.name)
      }}
    >
      <div
        className="fm-drive-item-info"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="fm-drive-item-header">
          <div className="fm-drive-item-icon">{isHovered ? <DriveFill size="16px" /> : <Drive size="16px" />}</div>
          <div>{drive.name}</div>
        </div>
        <div className="fm-drive-item-content">
          <div className="fm-drive-item-capacity">
            {(() => {
              const usedGB = stamp.size.toGigabytes() - stamp.remainingSize.toGigabytes()
              const totalGB = stamp.size.toGigabytes()

              return (
                <>
                  Capacity <ProgressBar value={stamp.usage * 100} width="64px" /> {formatUsedGB(usedGB)} GB /{' '}
                  {totalGB.toFixed(2)} GB
                </>
              )
            })()}
          </div>
          <div className="fm-drive-item-capacity">Expiry date: {stamp.duration.toEndDate().toLocaleDateString()}</div>
        </div>
      </div>
      <div className="fm-drive-item-actions">
        <MoreFill
          size="13"
          className={`fm-pointer${isUpgrading ? ' fm-disabled' : ''}`}
          onClick={!isUpgrading ? handleMenuClick : undefined}
          aria-disabled={isUpgrading ? 'true' : 'false'}
        />
        {showContext &&
          createPortal(
            <div
              ref={contextRef}
              className="fm-drive-item-context-menu"
              style={{
                top: pos.y,
                left: pos.x,
              }}
            >
              <ContextMenu>
                <div
                  className="fm-context-item red"
                  onClick={() => {
                    handleDestroyDriveClick()
                    setIsDestroyDriveModalOpen(true)
                  }}
                >
                  Destroy entire drive
                </div>
              </ContextMenu>
            </div>,

            document.body,
          )}
        <Button
          label="Upgrade"
          variant="primary"
          size="small"
          disabled={isUpgrading}
          onClick={() => setIsUpgradeDriveModalOpen(true)}
        />
      </div>
      {isUpgradeDriveModalOpen && (
        <UpgradeDriveModal stamp={stamp} drive={drive} onCancelClick={() => setIsUpgradeDriveModalOpen(false)} />
      )}

      {isUpgrading && (
        <div className="fm-drive-item-creating-overlay" aria-live="polite">
          <div className="fm-mini-spinner" />
          <span>Upgrading drive…</span>
        </div>
      )}

      {isDestroyDriveModalOpen && (
        <DestroyDriveModal
          drive={drive}
          onCancelClick={() => setIsDestroyDriveModalOpen(false)}
          doDestroy={async () => {
            if (!fm) return

            try {
              await fm.destroyDrive(drive)
              await Promise.resolve(refreshDrives?.())
              setIsDestroyDriveModalOpen(false)
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('Error destroying drive:', error)
            }
          }}
        />
      )}
    </div>
  )
}

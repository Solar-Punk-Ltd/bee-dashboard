import { ReactElement, useState, useContext, useEffect, useRef, useMemo } from 'react'
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
import { calculateStampCapacityMetrics, handleDestroyDrive } from '../../../utils/bee'
import { Context as SettingsContext } from '../../../../../providers/Settings'

interface DriveItemProps {
  drive: DriveInfo
  stamp: PostageBatch
  isSelected: boolean
}

export function DriveItem({ drive, stamp, isSelected }: DriveItemProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false)
  const [isDestroyDriveModalOpen, setIsDestroyDriveModalOpen] = useState(false)
  const [isUpgradeDriveModalOpen, setIsUpgradeDriveModalOpen] = useState(false)
  const { fm, refreshDrives } = useContext(FMContext)
  const { beeApi } = useContext(SettingsContext)
  const isMountedRef = useRef(true)
  const [isUpgrading, setIsUpgrading] = useState(false)

  const { showContext, pos, contextRef, setPos, setShowContext } = useContextMenu<HTMLDivElement>()

  const { setView, setActualItemView } = useView()

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

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

  const { capacityPct, usedSize, totalSize } = useMemo(() => calculateStampCapacityMetrics(stamp, 3), [stamp])

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
            Capacity <ProgressBar value={capacityPct} width="64px" /> {usedSize} / {totalSize}
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
            await handleDestroyDrive(
              beeApi,
              fm,
              drive,
              () => {
                refreshDrives?.()

                if (isMountedRef.current) {
                  setIsDestroyDriveModalOpen(false)
                }
              },
              error => {
                // eslint-disable-next-line no-console
                console.error('Error destroying drive:', error)

                if (isMountedRef.current) {
                  setIsDestroyDriveModalOpen(false)
                }
              },
            )
          }}
        />
      )}
    </div>
  )
}

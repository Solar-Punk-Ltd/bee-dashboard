import { ReactElement, useState, useContext, useEffect, useRef } from 'react'
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
import { getUsableStamps } from 'src/modules/filemanager/utils/bee'
import { Context as SettingsContext } from '../../../../../providers/Settings'

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
  const { fm, refreshFiles } = useContext(FMContext)
  const { beeApi } = useContext(SettingsContext)
  const isMountedRef = useRef(true)

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
        <MoreFill size="13" className="fm-pointer" onClick={handleMenuClick} />
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

        <Button label="Upgrade" variant="primary" size="small" onClick={() => setIsUpgradeDriveModalOpen(true)} />
      </div>
      {isUpgradeDriveModalOpen && (
        <UpgradeDriveModal stamp={stamp} onCancelClick={() => setIsUpgradeDriveModalOpen(false)} drive={drive} />
      )}
      {isDestroyDriveModalOpen && (
        <DestroyDriveModal
          drive={drive}
          onCancelClick={() => setIsDestroyDriveModalOpen(false)}
          doDestroy={async () => {
            if (!fm || !beeApi) return

            try {
              const stamp = (await getUsableStamps(beeApi)).find(s => s.batchID.toString() === drive.batchId.toString())

              if (!stamp) throw new Error('Postage stamp for the current drive not found')

              await fm.destroyDrive(drive, stamp)
              await Promise.resolve(refreshFiles?.())
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('Error destroying drive:', error)
            } finally {
              if (isMountedRef.current) {
                setIsDestroyDriveModalOpen(false)
              }
            }
          }}
        />
      )}
    </div>
  )
}

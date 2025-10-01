import { ReactElement, useContext, useEffect, useState } from 'react'

import './Sidebar.scss'
import Add from 'remixicon-react/AddLineIcon'
import Folder from 'remixicon-react/Folder3LineIcon'
import FolderFill from 'remixicon-react/Folder3FillIcon'
import ArrowRight from 'remixicon-react/ArrowRightSLineIcon'
import ArrowDown from 'remixicon-react/ArrowDownSLineIcon'
import Delete from 'remixicon-react/DeleteBin6LineIcon'
import DeleteFill from 'remixicon-react/DeleteBin6FillIcon'
import { DriveItem } from './DriveItem/DriveItem'
import { CreateDriveModal } from '../CreateDriveModal/CreateDriveModal'
import { ViewType } from '../../constants/fileTransfer'
import { PostageBatch } from '@ethersphere/bee-js'
import { Context as SettingsContext } from '../../../../providers/Settings'
import { useView } from '../../../../pages/filemanager/ViewContext'
import { Context as FMContext } from '../../../../providers/FileManager'
import { getUsableStamps } from '../../utils/bee'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'

export function Sidebar(): ReactElement {
  const [hovered, setHovered] = useState<string | null>(null)
  const [isMyDrivesOpen, setIsMyDriveOpen] = useState(false)
  const [isTrashOpen, setIsTrashOpen] = useState(false)
  const [isCreateDriveOpen, setIsCreateDriveOpen] = useState(false)
  const [usableStamps, setUsableStamps] = useState<PostageBatch[]>([])
  const [isDriveCreationInProgress, setIsDriveCreationInProgress] = useState(false)

  const { beeApi } = useContext(SettingsContext)
  const { setView, view } = useView()
  const { fm, currentDrive, drives, setCurrentDrive, refreshDrives } = useContext(FMContext)

  useEffect(() => {
    let isMounted = true

    const getStamps = async () => {
      const stamps = await getUsableStamps(beeApi)

      if (isMounted) {
        setUsableStamps([...stamps])
      }
    }

    if (beeApi) {
      getStamps()
    }

    return () => {
      isMounted = false
    }
  }, [beeApi, drives])

  useEffect(() => {
    if (fm && !currentDrive) {
      if (drives.length === 0) return

      setCurrentDrive(drives[0])
      setView(ViewType.File)
    }
  }, [fm, drives, currentDrive, setCurrentDrive, setView])

  const isCurrent = (di: DriveInfo) => currentDrive?.id.toString() === di.id.toString()

  return (
    <div className="fm-sidebar">
      <div className="fm-sidebar-content">
        <div className="fm-sidebar-item" onClick={() => setIsCreateDriveOpen(true)}>
          <div className="fm-sidebar-item-icon">
            <Add size="16px" />
          </div>
          <div>Create new drive</div>
        </div>

        {isCreateDriveOpen && (
          <CreateDriveModal
            onCancelClick={() => setIsCreateDriveOpen(false)}
            onDriveCreated={() => {
              setIsCreateDriveOpen(false)
              setIsDriveCreationInProgress(false)
              refreshDrives()
            }}
            onCreationStarted={() => setIsDriveCreationInProgress(true)}
            onCreationError={() => setIsDriveCreationInProgress(false)}
          />
        )}

        <div
          className="fm-sidebar-item"
          onMouseEnter={() => setHovered('my-drives')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setIsMyDriveOpen(!isMyDrivesOpen)}
        >
          <div className="fm-sidebar-item-icon">
            {isMyDrivesOpen ? <ArrowDown size="16px" /> : <ArrowRight size="16px" />}
          </div>
          <div className="fm-sidebar-item-icon" style={{ opacity: hovered === 'my-drives' ? 1 : 1 }}>
            {hovered === 'my-drives' ? <FolderFill size="16px" /> : <Folder size="16px" />}
          </div>
          <div>My Drives</div>
        </div>

        {isMyDrivesOpen && isDriveCreationInProgress && (
          <div className="fm-drive-item-container fm-drive-item-creating" aria-live="polite">
            <div className="fm-drive-item-info">
              <div className="fm-drive-item-header">
                <div className="fm-drive-item-icon">
                  <Folder size="16px" />
                </div>
                <div>Creating drive…</div>
              </div>
              <div className="fm-drive-item-content">
                <div className="fm-drive-item-capacity">Initializing drive metadata</div>
              </div>
            </div>
            <div className="fm-drive-item-actions" />
            <div className="fm-drive-item-creating-overlay">
              <div className="fm-mini-spinner" />
              <span>Please wait…</span>
            </div>
          </div>
        )}
        {isMyDrivesOpen &&
          drives.map(d => {
            const isSelected = isCurrent(d) && view === ViewType.File
            const stamp = usableStamps.find(s => s.batchID.toString() === d.batchId.toString() && !d.isAdmin)

            return (
              stamp && (
                <div
                  key={d.id.toString()}
                  onClick={() => {
                    setCurrentDrive(d)
                    setView(ViewType.File)
                  }}
                >
                  <DriveItem drive={d} stamp={stamp} isSelected={isSelected} />
                </div>
              )
            )
          })}

        <div
          className="fm-sidebar-item"
          onMouseEnter={() => setHovered('trash')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setIsTrashOpen(!isTrashOpen)}
        >
          <div className="fm-sidebar-item-icon">
            {isTrashOpen ? <ArrowDown size="16px" /> : <ArrowRight size="16px" />}
          </div>
          <div className="fm-sidebar-item-icon">
            {hovered === 'trash' ? <DeleteFill size="16px" /> : <Delete size="16px" />}
          </div>
          <div>Trash</div>
        </div>

        {isTrashOpen && (
          <div className="fm-drive-items-container fm-drive-items-container-open">
            {drives.map(d => {
              const selected = isCurrent(d) && view === ViewType.Trash

              return (
                <div
                  key={`${d.id.toString()}-trash`}
                  className={`fm-sidebar-item fm-trash-item${selected ? ' is-selected' : ''}`}
                  onClick={() => {
                    setCurrentDrive(d)
                    setView(ViewType.Trash)
                  }}
                  title={`${d.name} Trash`}
                >
                  {d.name} Trash
                </div>
              )
            })}
          </div>
        )}
      </div>

      {isDriveCreationInProgress && <div className="fm-sidebar-drive-creation">Creating drive . . .</div>}
    </div>
  )
}

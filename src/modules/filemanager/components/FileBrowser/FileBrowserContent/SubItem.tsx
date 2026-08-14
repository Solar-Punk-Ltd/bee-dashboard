import { FolderInfo, ListDepth, NodeType } from '@solarpunkltd/file-manager-lib'
import { ReactElement, useCallback, useContext, useState } from 'react'

import { ItemType } from '../../../../../pages/filemanager/ViewContext'
import { Context as FMContext } from '../../../../../providers/FileManager'
import { TOOLTIPS } from '../../../constants/tooltips'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { useNodeOperations } from '../../../hooks/useNodeOperations'
import { FileOperation } from '../../../utils/fileOperations'
import { GetIconElement } from '../../../utils/GetIconElement'
import { buildFolderInfoGroups, FilePropertyGroup } from '../../../utils/infoGroups'
import { ConfirmModal } from '../../ConfirmModal/ConfirmModal'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { MenuItem } from '../../ContextMenu/MenuItem'
import { GetInfoModal } from '../../GetInfoModal/GetInfoModal'
import { Tooltip } from '../../Tooltip/Tooltip'

interface SubItemProps {
  name: string
  path: string
  type: ItemType
  trashInfo?: FolderInfo
  setErrorMessage?: (error: string) => void
  onDoubleClick?: () => void
}

const basename = (p: string): string | undefined => p.split('/').filter(Boolean).pop()

export function SubItem({ name, path, type, trashInfo, setErrorMessage, onDoubleClick }: SubItemProps): ReactElement {
  const displayName = basename(name)
  const { fm, currentDrive, setShowError } = useContext(FMContext)
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const [showGetInfoModal, setShowGetInfoModal] = useState(false)
  const [infoGroups, setInfoGroups] = useState<FilePropertyGroup[] | null>(null)
  const [pendingOperation, setPendingOperation] = useState<FileOperation | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const reportError = useCallback(
    (msg: string) => {
      setErrorMessage?.(msg)
      setShowError(true)
    },
    [setErrorMessage, setShowError],
  )

  const driveId = trashInfo?.driveId ?? currentDrive?.id.toString()
  const { run } = useNodeOperations(driveId, reportError)
  const isTrashed = Boolean(trashInfo)

  const openGetInfo = async (): Promise<void> => {
    handleCloseContext()

    if (!fm || !currentDrive) return

    if (trashInfo) {
      const trashed = await fm.listTrash(currentDrive.id, ListDepth.Deep)
      const prefix = `${trashInfo.path}/`

      setInfoGroups(
        buildFolderInfoGroups(trashInfo, currentDrive.name, trashed.filter(n => n.path.startsWith(prefix)).length),
      )
      setShowGetInfoModal(true)

      return
    }

    const lastSlash = path.lastIndexOf('/')
    const parentPath = lastSlash >= 0 ? path.slice(0, lastSlash) : ''

    const [siblings, children] = await Promise.all([
      fm.listFolder(currentDrive.id, parentPath, ListDepth.Shallow),
      fm.listFolder(currentDrive.id, path, ListDepth.Shallow),
    ])

    const folder = siblings.find(n => n.type === NodeType.Folder && basename(n.path) === name) as FolderInfo | undefined

    if (!folder) return

    setInfoGroups(buildFolderInfoGroups(folder, currentDrive.name, children.length))
    setShowGetInfoModal(true)
  }

  const confirmOperation = useCallback(async () => {
    if (!pendingOperation || !driveId) return

    setIsBusy(true)
    try {
      await run(pendingOperation, { path, driveId })
    } finally {
      setIsBusy(false)
      setPendingOperation(null)
    }
  }, [pendingOperation, driveId, run, path])

  const confirmCopy: Record<string, { title: ReactElement; message: ReactElement; label: string }> = {
    [FileOperation.Trash]: {
      title: (
        <>
          Move folder to trash?
          <Tooltip label={TOOLTIPS.FILE_OPERATION_TRASH} iconSize="14px" />
        </>
      ),
      message: (
        <>
          <b title={path}>{displayName}</b> and everything inside it will be moved to trash.
        </>
      ),
      label: 'Move to trash',
    },
    [FileOperation.Recover]: {
      title: (
        <>
          Restore from trash?
          <Tooltip label={TOOLTIPS.FILE_OPERATION_RESTORE_FROM_TRASH} iconSize="14px" />
        </>
      ),
      message: (
        <>
          <b>{displayName}</b> will be restored to where it was trashed from.
        </>
      ),
      label: 'Restore',
    },
    [FileOperation.Forget]: {
      title: (
        <>
          Forget permanently?
          <Tooltip label={TOOLTIPS.FILE_OPERATION_FORGET} iconSize="14px" />
        </>
      ),
      message: (
        <>
          This removes <b>{displayName}</b> and everything inside it from your view.
          <br />
          The data remains on Swarm until the drive expires.
        </>
      ),
      label: 'Forget',
    },
  }

  const pendingCopy = pendingOperation ? confirmCopy[pendingOperation] : null

  return (
    <div
      className="fm-file-item-content"
      onDoubleClick={onDoubleClick}
      onContextMenu={e => {
        if (e.shiftKey) return
        handleContextMenu(e)
      }}
      onClick={handleCloseContext}
    >
      <div className="fm-file-item-content-item fm-checkbox">
        <input type="checkbox" checked={false} readOnly onClick={e => e.stopPropagation()} />
      </div>
      <div className="fm-file-item-content-item fm-name">
        <GetIconElement name={name} metadata={type === ItemType.Folder ? { mime: ItemType.Folder } : undefined} />
        {displayName}
      </div>

      {showContext && (
        <div
          ref={contextRef}
          className="fm-file-item-context-menu"
          style={{ position: 'fixed', top: pos.y, left: pos.x }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <ContextMenu>
            <>
              {isTrashed ? (
                <>
                  <MenuItem
                    danger
                    onClick={() => {
                      handleCloseContext()
                      setPendingOperation(FileOperation.Recover)
                    }}
                  >
                    Restore
                  </MenuItem>
                  <MenuItem
                    danger
                    onClick={() => {
                      handleCloseContext()
                      setPendingOperation(FileOperation.Forget)
                    }}
                  >
                    Forget permanently
                  </MenuItem>
                </>
              ) : (
                <MenuItem
                  danger
                  onClick={() => {
                    handleCloseContext()
                    setPendingOperation(FileOperation.Trash)
                  }}
                >
                  Move to trash
                </MenuItem>
              )}
              <div className="fm-context-item-border" />
              <MenuItem onClick={openGetInfo}>Get info</MenuItem>
            </>
          </ContextMenu>
        </div>
      )}

      {pendingCopy && (
        <ConfirmModal
          title={pendingCopy.title}
          message={pendingCopy.message}
          confirmLabel={pendingCopy.label}
          cancelLabel="Cancel"
          isProgress={isBusy}
          spinnerMessage={`${pendingCopy.label}…`}
          onConfirm={confirmOperation}
          onCancel={() => setPendingOperation(null)}
        />
      )}

      {showGetInfoModal && infoGroups && (
        <GetInfoModal
          name={displayName ?? name}
          title="Folder Information"
          properties={infoGroups}
          onCancelClick={() => setShowGetInfoModal(false)}
        />
      )}
    </div>
  )
}

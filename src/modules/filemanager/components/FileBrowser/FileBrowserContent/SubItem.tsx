import { FolderInfo, ListDepth, NodeType } from '@solarpunkltd/file-manager-lib'
import { ReactElement, useContext, useState } from 'react'

import { ItemType } from '../../../../../pages/filemanager/ViewContext'
import { Context as FMContext } from '../../../../../providers/FileManager'
import { useContextMenu } from '../../../hooks/useContextMenu'
import { GetIconElement } from '../../../utils/GetIconElement'
import { buildFolderInfoGroups, FilePropertyGroup } from '../../../utils/infoGroups'
import { ContextMenu } from '../../ContextMenu/ContextMenu'
import { GetInfoModal } from '../../GetInfoModal/GetInfoModal'

interface SubItemProps {
  name: string
  path: string
  type: ItemType
  onDoubleClick?: () => void
}

const basename = (p: string): string | undefined => p.split('/').filter(Boolean).pop()

export function SubItem({ name, path, type, onDoubleClick }: SubItemProps): ReactElement {
  const displayName = basename(name)
  const { fm, currentDrive } = useContext(FMContext)
  const { showContext, pos, contextRef, handleContextMenu, handleCloseContext } = useContextMenu<HTMLDivElement>()
  const [showGetInfoModal, setShowGetInfoModal] = useState(false)
  const [infoGroups, setInfoGroups] = useState<FilePropertyGroup[] | null>(null)

  const openGetInfo = async (): Promise<void> => {
    handleCloseContext()

    if (!fm || !currentDrive) return

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
            <div className="fm-context-item" onClick={openGetInfo}>
              Get info
            </div>
          </ContextMenu>
        </div>
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

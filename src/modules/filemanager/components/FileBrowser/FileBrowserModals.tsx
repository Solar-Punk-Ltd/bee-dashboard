import { ReactElement } from 'react'
import type { FileInfo, DriveInfo } from '@solarpunkltd/file-manager-lib'
import { ConfirmModal } from '../ConfirmModal/ConfirmModal'
import { DeleteFileModal } from '../DeleteFileModal/DeleteFileModal'
import { DestroyDriveModal } from '../DestroyDriveModal/DestroyDriveModal'
import { FileAction } from '../../constants/fileTransfer'

interface FileBrowserModalsProps {
  showDeleteModal: boolean
  selectedFiles: FileInfo[]
  fileCountText: string
  currentDrive: DriveInfo | null
  confirmBulkForget: boolean
  showDestroyDriveModal: boolean
  onDeleteCancel: () => void
  onDeleteProceed: (action: FileAction) => void
  onForgetConfirm: () => Promise<void>
  onForgetCancel: () => void
  onDestroyCancel: () => void
  onDestroyConfirm: () => Promise<void>
}

export function FileBrowserModals({
  showDeleteModal,
  selectedFiles,
  fileCountText,
  currentDrive,
  confirmBulkForget,
  showDestroyDriveModal,
  onDeleteCancel,
  onDeleteProceed,
  onForgetConfirm,
  onForgetCancel,
  onDestroyCancel,
  onDestroyConfirm,
}: FileBrowserModalsProps): ReactElement {
  return (
    <>
      {showDeleteModal && (
        <DeleteFileModal
          names={selectedFiles.map(f => f.name)}
          currentDriveName={currentDrive?.name}
          onCancelClick={onDeleteCancel}
          onProceed={onDeleteProceed}
        />
      )}

      {confirmBulkForget && (
        <ConfirmModal
          title="Forget permanently?"
          message={
            <>
              This removes <b>{selectedFiles.length}</b> {fileCountText} from your view.
              <br />
              The data remains on Swarm until the drive expires.
            </>
          }
          confirmLabel="Forget"
          cancelLabel="Cancel"
          onConfirm={onForgetConfirm}
          onCancel={onForgetCancel}
        />
      )}

      {showDestroyDriveModal && currentDrive && (
        <DestroyDriveModal drive={currentDrive} onCancelClick={onDestroyCancel} doDestroy={onDestroyConfirm} />
      )}
    </>
  )
}

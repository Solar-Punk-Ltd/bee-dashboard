import { useEffect } from 'react'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo } from '@solarpunkltd/file-manager-lib'
import { FILE_MANAGER_EVENTS } from '../constants/common'

interface UseAdminDriveUpgradeOptions {
  adminDrive: DriveInfo | null
  adminStamp: PostageBatch | null
  setIsUpgrading: (value: boolean) => void
  setIsUpgradeTimeoutModalOpen: (value: boolean) => void
  setActualStamp: (value: PostageBatch) => void
  setErrorMessage?: (error: string) => void
  setShowError: (value: boolean) => void
}

export function useAdminDriveUpgrade({
  adminDrive,
  adminStamp,
  setIsUpgrading,
  setIsUpgradeTimeoutModalOpen,
  setActualStamp,
  setErrorMessage,
  setShowError,
}: UseAdminDriveUpgradeOptions) {
  useEffect(() => {
    if (!adminDrive || !adminStamp) return

    const id = adminDrive.id.toString()

    const onStart = (e: Event) => {
      const { driveId } = (e as CustomEvent).detail || {}

      if (driveId === id) {
        setIsUpgrading(true)
      }
    }

    const onEnd = (e: Event) => {
      const { driveId, success, error, updatedStamp } = (e as CustomEvent).detail || {}

      if (driveId !== id) {
        return
      }

      setIsUpgrading(false)

      if (!success) {
        if (error) {
          setErrorMessage?.(error)
        }
        setShowError(true)

        return
      }

      if (updatedStamp) {
        setActualStamp(updatedStamp)
      }
    }

    const onTimeout = (e: Event) => {
      const { driveId } = (e as CustomEvent).detail || {}

      if (driveId === id) {
        setIsUpgradeTimeoutModalOpen(true)
      }
    }

    window.addEventListener(FILE_MANAGER_EVENTS.DRIVE_UPGRADE_START, onStart as EventListener)
    window.addEventListener(FILE_MANAGER_EVENTS.DRIVE_UPGRADE_END, onEnd as EventListener)
    window.addEventListener(FILE_MANAGER_EVENTS.DRIVE_UPGRADE_TIMEOUT, onTimeout as EventListener)

    return () => {
      window.removeEventListener(FILE_MANAGER_EVENTS.DRIVE_UPGRADE_START, onStart as EventListener)
      window.removeEventListener(FILE_MANAGER_EVENTS.DRIVE_UPGRADE_END, onEnd as EventListener)
      window.removeEventListener(FILE_MANAGER_EVENTS.DRIVE_UPGRADE_TIMEOUT, onTimeout as EventListener)
    }
  }, [
    adminDrive,
    adminStamp,
    setIsUpgrading,
    setIsUpgradeTimeoutModalOpen,
    setActualStamp,
    setErrorMessage,
    setShowError,
  ])
}

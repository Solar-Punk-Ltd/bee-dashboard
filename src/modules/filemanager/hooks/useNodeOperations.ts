import { PostageBatch } from '@ethersphere/bee-js'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'

import { Context as FMContext } from '../../../providers/FileManager'
import { Context as SettingsContext } from '../../../providers/Settings'
import { getUsableStamps } from '../utils/bee'
import { safeSetState } from '../utils/common'
import { FileOperation, OperableNode, performFileOperation } from '../utils/fileOperations'

interface UseNodeOperationsResult {
  run: (operation: FileOperation, node: OperableNode) => Promise<boolean>
  driveStamp?: PostageBatch
}

export function useNodeOperations(driveId?: string, onError?: (msg: string) => void): UseNodeOperationsResult {
  const { fm, adminDrive, currentDrive, refreshStamp } = useContext(FMContext)
  const { beeApi } = useContext(SettingsContext)

  const [driveStamp, setDriveStamp] = useState<PostageBatch | undefined>(undefined)
  const isMountedRef = useRef(true)

  const targetDriveId = driveId ?? currentDrive?.id.toString()

  useEffect(() => {
    isMountedRef.current = true

    const resolve = async (): Promise<void> => {
      if (!beeApi || !fm || !targetDriveId) return

      const drive = fm.driveList.find(d => d.id.toString() === targetDriveId)

      if (!drive) return

      const stamps = await getUsableStamps(beeApi)
      const found = stamps.find(s => s.batchID.toString() === drive.batchId.toString())

      safeSetState(isMountedRef, setDriveStamp)(found)
    }

    resolve()

    return () => {
      isMountedRef.current = false
    }
  }, [beeApi, fm, targetDriveId])

  const run = useCallback(
    async (operation: FileOperation, node: OperableNode): Promise<boolean> => {
      if (!fm || !beeApi || !driveStamp || !targetDriveId) {
        onError?.('File manager is not ready yet — try again in a moment.')

        return false
      }

      const drive = fm.driveList.find(d => d.id.toString() === targetDriveId)

      if (!drive) {
        onError?.(`Drive for ${node.path} not found`)

        return false
      }

      const stamps = await getUsableStamps(beeApi)
      const adminStamp = stamps.find(s => s.batchID.toString() === fm.adminStamp?.batchId)

      return await performFileOperation({
        fm,
        bee: beeApi,
        fi: node,
        redundancyLevel: drive.redundancyLevel,
        driveId: drive.id.toString(),
        stamp: driveStamp,
        adminStamp,
        adminRedundancy: adminDrive?.redundancyLevel,
        operation,
        onError,
        onSuccess: () => {
          // Forgetting rewrites admin state; trash/recover only touch the drive's own manifests.
          const stampToRefresh = operation === FileOperation.Forget ? (adminStamp ?? driveStamp) : driveStamp
          refreshStamp(stampToRefresh.batchID.toString())
        },
      })
    },
    [fm, beeApi, driveStamp, targetDriveId, adminDrive, refreshStamp, onError],
  )

  return { run, driveStamp }
}

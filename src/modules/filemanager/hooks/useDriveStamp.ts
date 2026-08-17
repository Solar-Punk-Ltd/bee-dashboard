import { PostageBatch } from '@ethersphere/bee-js'
import { useContext, useEffect, useRef, useState } from 'react'

import { Context as FMContext } from '../../../providers/FileManager'
import { Context as SettingsContext } from '../../../providers/Settings'
import { getUsableStamps } from '../utils/bee'
import { safeSetState } from '../utils/common'

/**
 * Resolves the usable postage stamp backing a drive, defaulting to the current drive.
 *
 * Every node operation (trash, recover, forget, move) has to verify drive space against it before
 * writing, so it is shared rather than re-resolved per hook.
 */
export function useDriveStamp(driveId?: string): PostageBatch | undefined {
  const { fm, currentDrive } = useContext(FMContext)
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

  return driveStamp
}

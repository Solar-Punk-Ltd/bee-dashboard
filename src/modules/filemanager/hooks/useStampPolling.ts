import { useRef, useCallback } from 'react'
import { PostageBatch } from '@ethersphere/bee-js'
import { POLLING_TIMEOUT_MS, POLLING_INTERVAL_MS } from '../constants/common'

interface UseStampPollingOptions {
  onStampUpdated: (stamp: PostageBatch) => void
  onPollingStateChange: (isPolling: boolean) => void
  onTimeout?: (finalStamp: PostageBatch | null) => void
  refreshStamp: (batchId: string) => Promise<PostageBatch | null | undefined>
}

export function useStampPolling({
  onStampUpdated,
  onPollingStateChange,
  onTimeout,
  refreshStamp,
}: UseStampPollingOptions) {
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    onPollingStateChange(false)
  }, [onPollingStateChange])

  const startPolling = useCallback(
    (originalStamp: PostageBatch) => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      onPollingStateChange(true)

      const batchId = originalStamp.batchID.toString()
      const oldSize = originalStamp.size.toBytes()
      const oldExpiry = originalStamp.duration.toEndDate().getTime()

      timeoutRef.current = setTimeout(async () => {
        stopPolling()

        try {
          const finalStamp = await refreshStamp(batchId)

          if (finalStamp) {
            const newSize = finalStamp.size.toBytes()
            const newExpiry = finalStamp.duration.toEndDate().getTime()
            const capacityUpdated = newSize > oldSize
            const durationUpdated = newExpiry > oldExpiry

            if (capacityUpdated || durationUpdated) {
              onStampUpdated(finalStamp)

              return
            }
          }

          if (onTimeout) {
            onTimeout(finalStamp || null)
          }
        } catch (error) {
          if (onTimeout) {
            onTimeout(null)
          }
        }
      }, POLLING_TIMEOUT_MS)

      pollingIntervalRef.current = setInterval(async () => {
        try {
          const updatedStamp = await refreshStamp(batchId)

          if (!updatedStamp) {
            return
          }

          const newSize = updatedStamp.size.toBytes()
          const newExpiry = updatedStamp.duration.toEndDate().getTime()
          const capacityUpdated = newSize > oldSize
          const durationUpdated = newExpiry > oldExpiry

          if (capacityUpdated || durationUpdated) {
            onStampUpdated(updatedStamp)
            stopPolling()
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[useStampPolling] Polling tick failed', { batchId, error: e })
        }
      }, POLLING_INTERVAL_MS)
    },
    [refreshStamp, onStampUpdated, onPollingStateChange, onTimeout, stopPolling],
  )

  return {
    startPolling,
    stopPolling,
  }
}

import { Box } from '@mui/material'
import { ReactElement, useContext, useEffect, useState } from 'react'

import { DocumentationText } from '../../components/DocumentationText'
import { LinearProgressWithLabel } from '../../components/ProgressBar'
import { Context as SettingsContext } from '../../providers/Settings'

interface Props {
  reference?: string
}

const PROBE_RETRY_DELAY_MS = 500
const PROBE_TIMEOUT_MS = 10 * 1000

export function AssetSyncing({ reference }: Props): ReactElement {
  const { beeApi } = useContext(SettingsContext)

  const [syncProgress, setSyncProgress] = useState<number>(0)
  const [probeFailed, setProbeFailed] = useState<boolean>(false)

  useEffect(() => {
    if (!beeApi || !reference) return

    let isMounted = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    // deferred: false already guarantees the upload was pushed to and acknowledged by the
    // network before the upload call resolved. This is just a cheap local sanity check
    // (HEAD on the root chunk, served from local storage) - not a network-wide verification.
    const check = async (isRetry: boolean) => {
      // fetch() ignores requestOptions.timeout, so bound the request explicitly - otherwise a
      // hung request never resolves or rejects, and neither the retry nor the failure state
      // would ever trigger.
      const abortController = new AbortController()
      const abortTimer = setTimeout(() => abortController.abort(), PROBE_TIMEOUT_MS)

      try {
        await beeApi.probeData(reference, { signal: abortController.signal })

        if (isMounted) setSyncProgress(100)
      } catch {
        if (!isRetry) {
          retryTimer = setTimeout(() => check(true), PROBE_RETRY_DELAY_MS)
        } else if (isMounted) {
          setProbeFailed(true)
        }
      } finally {
        clearTimeout(abortTimer)
      }
    }

    check(false)

    return () => {
      isMounted = false

      if (retryTimer) {
        clearTimeout(retryTimer)
      }
    }
  }, [beeApi, reference])

  return (
    <>
      <Box mb={2}>
        <DocumentationText>
          Files are not immediately accessible on the Swarm network. Please wait until your upload is synced to the
          network.{' '}
          {/* TODO: syncing article was removed, now the only available doc. is at https://docs.ethswarm.org/api/#tag/Tag */}
          {/* <a href="https://docs.ethswarm.org/docs/develop/access-the-swarm/syncing">Learn more about syncing</a>. */}
        </DocumentationText>
      </Box>
      <Box mb={4}>
        <LinearProgressWithLabel value={syncProgress} indeterminate={syncProgress < 100 && !probeFailed} />
      </Box>
      {probeFailed && (
        <Box mb={2}>
          <DocumentationText>
            Upload succeeded, but we couldn&apos;t confirm it locally. Try refreshing this page — your file has very
            likely still been uploaded successfully.
          </DocumentationText>
        </Box>
      )}
    </>
  )
}

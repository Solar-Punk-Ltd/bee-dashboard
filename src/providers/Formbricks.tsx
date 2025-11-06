import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import formbricks from '@formbricks/js'

export function FormbricksProvider(): null {
  const location = useLocation()
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return

    if (typeof window === 'undefined') return

    const environmentId = process.env.REACT_APP_FORMBRICKS_ENV_ID
    const appUrl = process.env.REACT_APP_FORMBRICKS_APP_URL

    if (!environmentId || !appUrl) {
      return
    }

    try {
      formbricks.setup({ environmentId, appUrl })
      initializedRef.current = true
    } catch {
      // no-op
    }
  }, [])

  useEffect(() => {
    if (!initializedRef.current) return

    try {
      formbricks?.registerRouteChange()
    } catch {
      // no-op
    }
  }, [location])

  return null
}

export default FormbricksProvider

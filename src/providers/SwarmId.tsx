import type { PrivateKey } from '@ethersphere/bee-js'
import type { ConnectionInfo } from '@snaha/swarm-id'
import { SwarmIdClient } from '@snaha/swarm-id'
import type { SwarmClient } from '@solarpunkltd/file-manager-lib'
import { BeeClient, SwarmIdSwarmClient } from '@solarpunkltd/file-manager-lib'
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { getSignerPk } from '../modules/filemanager/utils/common'
import { LocalStorageKeys } from '../utils/localStorage'

import { Context as SettingsContext } from './Settings'

export enum SwarmBackend {
  BeeApi = 'beeApi',
  SwarmId = 'swarm-id',
}

export enum SwarmConnectionStatus {
  Idle = 'idle',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export const SWARM_ID_IFRAME_ORIGIN = 'https://swarm-id.snaha.net'
const DEFAULT_BACKEND: SwarmBackend = SwarmBackend.BeeApi

export interface SwarmIdentity {
  /** Ethereum address (40 hex) — feed owner. */
  owner: string
  /** Compressed secp256k1 public key (66 hex) — identity / self grantee. */
  publicKey: string
  /** Compressed public key of whoever performs ACT encryption. Not the same as `publicKey`. */
  actPublisher: string
}

export interface SwarmNodeInfo {
  beeMode: string
  chequebookEnabled: boolean
  swapEnabled: boolean
}

interface ContextInterface {
  backend: SwarmBackend
  setBackend: (backend: SwarmBackend) => void
  status: SwarmConnectionStatus
  error: Error | null
  swarmClient: SwarmClient | null
  identity: SwarmIdentity | null
  connectionInfo: ConnectionInfo | null
  nodeInfo: SwarmNodeInfo | null
  hasPrivateKey: boolean
  notifyPrivateKeySaved: () => void
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

const initialValues: ContextInterface = {
  backend: DEFAULT_BACKEND,
  setBackend: () => {},
  status: SwarmConnectionStatus.Idle,
  error: null,
  swarmClient: null,
  identity: null,
  connectionInfo: null,
  nodeInfo: null,
  hasPrivateKey: false,
  notifyPrivateKeySaved: () => {},
  connect: async () => {},
  disconnect: async () => {},
}

export const Context = createContext<ContextInterface>(initialValues)
export const Consumer = Context.Consumer

interface Props {
  children: ReactNode
}

function readPersistedBackend(): SwarmBackend {
  const stored = localStorage.getItem(LocalStorageKeys.swarmBackend)

  return stored === SwarmBackend.SwarmId || stored === SwarmBackend.BeeApi ? stored : DEFAULT_BACKEND
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

function requireSignerPk(): PrivateKey {
  const pk = getSignerPk()

  if (!pk) {
    throw new Error('No file manager private key set. Create one on this page before connecting.')
  }

  return pk
}

export function Provider({ children }: Props) {
  const { beeApi, apiUrl } = useContext(SettingsContext)

  const [backend, setBackendState] = useState<SwarmBackend>(readPersistedBackend)
  const [status, setStatus] = useState<SwarmConnectionStatus>(SwarmConnectionStatus.Idle)
  const [error, setError] = useState<Error | null>(null)
  const [swarmClient, setSwarmClient] = useState<SwarmClient | null>(null)
  const [identity, setIdentity] = useState<SwarmIdentity | null>(null)
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null)
  const [nodeInfo, setNodeInfo] = useState<SwarmNodeInfo | null>(null)
  const [hasPrivateKey, setHasPrivateKey] = useState<boolean>(() => getSignerPk() !== undefined)

  const notifyPrivateKeySaved = useCallback(() => setHasPrivateKey(getSignerPk() !== undefined), [])

  const awaitingAuthRef = useRef<boolean>(false)
  const swarmIdClientRef = useRef<SwarmIdClient | null>(null)

  const resetConnection = useCallback(() => {
    setSwarmClient(null)
    setIdentity(null)
    setNodeInfo(null)
    setError(null)
    setStatus(SwarmConnectionStatus.Idle)
    awaitingAuthRef.current = false
  }, [])

  const destroySwarmIdClient = useCallback(() => {
    const client = swarmIdClientRef.current

    if (!client) {
      return
    }

    swarmIdClientRef.current = null
    setConnectionInfo(null)

    try {
      client.destroy()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to destroy SwarmIdClient', err)
    }
  }, [])

  const setBackend = useCallback(
    (next: SwarmBackend) => {
      if (next === backend) {
        return
      }

      localStorage.setItem(LocalStorageKeys.swarmBackend, next)
      resetConnection()

      if (backend === SwarmBackend.SwarmId) {
        destroySwarmIdClient()
      }

      setBackendState(next)
    },
    [backend, resetConnection, destroySwarmIdClient],
  )

  const handleConnectionChange = useCallback((info: ConnectionInfo) => {
    setConnectionInfo(info)

    if (info.identity) {
      awaitingAuthRef.current = false
      setStatus(SwarmConnectionStatus.Connected)

      return
    }

    setStatus(awaitingAuthRef.current ? SwarmConnectionStatus.Connecting : SwarmConnectionStatus.Idle)
  }, [])

  /** Creates and initializes the swarm-id client on first use — the iframe is not mounted before that. */
  const ensureSwarmIdClient = useCallback(async (): Promise<SwarmIdClient> => {
    if (swarmIdClientRef.current) {
      return swarmIdClientRef.current
    }

    const client = new SwarmIdClient({
      iframeOrigin: SWARM_ID_IFRAME_ORIGIN,
      metadata: {
        name: 'Bee Dashboard',
        description: 'Swarm Bee Dashboard file manager',
      },
      onConnectionChange: handleConnectionChange,
    })

    await client.initialize()

    swarmIdClientRef.current = client

    return client
  }, [handleConnectionChange])

  const connectBee = useCallback(async (): Promise<void> => {
    if (!beeApi) {
      throw new Error(`Bee API is not available at ${apiUrl}`)
    }

    const pk = requireSignerPk()

    const client = new BeeClient(beeApi, pk)
    await client.initialize()

    setSwarmClient(client)
    setIdentity({ owner: client.owner, publicKey: client.publicKey, actPublisher: client.actPublisher })
    setStatus(SwarmConnectionStatus.Connected)
  }, [beeApi, apiUrl])

  const connectSwarmId = useCallback(async (): Promise<void> => {
    awaitingAuthRef.current = true

    const client = await ensureSwarmIdClient()
    setConnectionInfo(client.connectionInfo)

    if (client.connectionInfo.identity) {
      awaitingAuthRef.current = false
      setStatus(SwarmConnectionStatus.Connected)

      return
    }

    await client.connect()
  }, [ensureSwarmIdClient])

  const connect = useCallback(async (): Promise<void> => {
    setError(null)
    setStatus(SwarmConnectionStatus.Connecting)

    try {
      requireSignerPk()

      if (backend === SwarmBackend.BeeApi) {
        await connectBee()
      } else {
        await connectSwarmId()
      }
    } catch (err) {
      awaitingAuthRef.current = false
      setError(toError(err))
      setStatus(SwarmConnectionStatus.Error)
    }
  }, [backend, connectBee, connectSwarmId])

  const disconnect = useCallback(async (): Promise<void> => {
    setError(null)
    awaitingAuthRef.current = false

    try {
      if (backend === SwarmBackend.SwarmId && swarmIdClientRef.current) {
        await swarmIdClientRef.current.disconnect()
      }
    } catch (err) {
      setError(toError(err))
    }

    setSwarmClient(null)
    setIdentity(null)
    setNodeInfo(null)
    setStatus(SwarmConnectionStatus.Idle)
  }, [backend])

  useEffect(() => {
    if (backend === SwarmBackend.BeeApi) {
      resetConnection()
    }
  }, [beeApi, backend, resetConnection])

  useEffect(() => {
    if (backend !== SwarmBackend.SwarmId || status !== SwarmConnectionStatus.Connected || swarmClient) {
      return
    }

    const client = swarmIdClientRef.current

    if (!client) {
      return
    }

    let cancelled = false

    const build = async (): Promise<void> => {
      const adapter = new SwarmIdSwarmClient(client, requireSignerPk().toHex())
      await adapter.initialize()

      if (cancelled) {
        return
      }

      setSwarmClient(adapter)
      setIdentity({ owner: adapter.owner, publicKey: adapter.publicKey, actPublisher: adapter.actPublisher })
    }

    build().catch(err => {
      if (cancelled) {
        return
      }

      setError(toError(err))
      setStatus(SwarmConnectionStatus.Error)
    })

    return () => {
      cancelled = true
    }
  }, [backend, status, swarmClient])

  // Auth can land long after connect() resolved, so the node probe hangs off the status instead.
  useEffect(() => {
    if (backend !== SwarmBackend.SwarmId || status !== SwarmConnectionStatus.Connected || !swarmIdClientRef.current) {
      return
    }

    let cancelled = false

    swarmIdClientRef.current.getNodeInfo().then(
      info => {
        if (!cancelled) setNodeInfo(info)
      },
      () => {
        if (!cancelled) setNodeInfo(null)
      },
    )

    return () => {
      cancelled = true
    }
  }, [backend, status])

  useEffect(() => destroySwarmIdClient, [destroySwarmIdClient])

  const contextValue = useMemo(
    () => ({
      backend,
      setBackend,
      status,
      error,
      swarmClient,
      identity,
      connectionInfo,
      nodeInfo,
      hasPrivateKey,
      notifyPrivateKeySaved,
      connect,
      disconnect,
    }),
    [
      backend,
      setBackend,
      status,
      error,
      swarmClient,
      identity,
      connectionInfo,
      nodeInfo,
      hasPrivateKey,
      notifyPrivateKeySaved,
      connect,
      disconnect,
    ],
  )

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

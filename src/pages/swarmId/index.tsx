import { Alert, Box, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material'
import type { ConnectionInfo } from '@snaha/swarm-id'
import { ReactElement, useContext, useState } from 'react'
import KeyIcon from 'remixicon-react/Key2LineIcon'
import LinkIcon from 'remixicon-react/LinkIcon'
import UnlinkIcon from 'remixicon-react/LinkUnlinkIcon'

import ExpandableList from '../../components/ExpandableList'
import ExpandableListItem from '../../components/ExpandableListItem'
import ExpandableListItemKey from '../../components/ExpandableListItemKey'
import { SwarmButton } from '../../components/SwarmButton'
import { PrivateKeyModal } from '../../modules/filemanager/components/PrivateKeyModal/PrivateKeyModal'
import { getSignerPk } from '../../modules/filemanager/utils/common'
import { Context as SettingsContext } from '../../providers/Settings'
import {
  Context as SwarmIdContext,
  SWARM_ID_IFRAME_ORIGIN,
  SwarmBackend,
  SwarmConnectionStatus,
  SwarmIdentity,
  SwarmNodeInfo,
} from '../../providers/SwarmId'

const BACKEND_LABELS: Record<SwarmBackend, string> = {
  beeApi: 'Bee API — dashboard node + local private key (BeeClient)',
  'swarm-id': `Swarm ID — hosted identity at ${SWARM_ID_IFRAME_ORIGIN} (SwarmIdClient)`,
}

function yesNo(value: boolean | undefined): string {
  if (value === undefined) {
    return '-'
  }

  return value ? 'Yes' : 'No'
}

function KeyRow({ label, value }: { label: string; value?: string }): ReactElement {
  if (!value) {
    return <ExpandableListItem label={label} value="-" />
  }

  return <ExpandableListItemKey label={label} value={value} />
}

function BeeBackendInfo({ apiUrl, identity }: { apiUrl: string; identity: SwarmIdentity | null }): ReactElement {
  return (
    <ExpandableList label="Bee backend" defaultOpen>
      <ExpandableListItem label="Bee API" value={apiUrl} />
      <KeyRow label="Owner (feed owner address)" value={identity?.owner} />
      <KeyRow label="Public key (identity)" value={identity?.publicKey} />
      <KeyRow label="ACT publisher (node key)" value={identity?.actPublisher} />
    </ExpandableList>
  )
}

function SwarmIdIdentityInfo({ identity }: { identity: ConnectionInfo['identity'] }): ReactElement {
  return (
    <ExpandableList label="Swarm ID identity" defaultOpen>
      <ExpandableListItem label="Iframe origin" value={SWARM_ID_IFRAME_ORIGIN} />
      <ExpandableListItem label="Name" value={identity?.name ?? '-'} />
      <ExpandableListItem label="Id" value={identity?.id ?? '-'} />
      <KeyRow label="Address" value={identity?.address} />
      <KeyRow label="Public key" value={identity?.publicKey} />
    </ExpandableList>
  )
}

function SwarmIdAppKeyInfo({ appKey }: { appKey: ConnectionInfo['appKey'] }): ReactElement {
  return (
    <ExpandableList
      label="App key"
      info="Origin-scoped key that signs this dApp's feeds. A different origin means a different drive list."
      defaultOpen
    >
      <KeyRow label="Address" value={appKey?.address} />
      <KeyRow label="Public key" value={appKey?.publicKey} />
    </ExpandableList>
  )
}

function SwarmIdCapabilitiesInfo({
  connectionInfo,
  nodeInfo,
}: {
  connectionInfo: ConnectionInfo | null
  nodeInfo: SwarmNodeInfo | null
}): ReactElement {
  const partition = connectionInfo?.partition

  return (
    <ExpandableList label="Capabilities" defaultOpen>
      <ExpandableListItem label="Can upload" value={yesNo(connectionInfo?.canUpload)} />
      <ExpandableListItem label="Upload mode" value={connectionInfo?.uploadMode ?? '-'} />
      <ExpandableListItem label="Storage partitioned" value={yesNo(connectionInfo?.storagePartitioned)} />
      <ExpandableListItem label="Partition" value={partition === undefined ? '-' : String(partition)} />
      <ExpandableListItem label="Bee mode" value={nodeInfo?.beeMode ?? '-'} />
      <ExpandableListItem label="Chequebook enabled" value={yesNo(nodeInfo?.chequebookEnabled)} />
      <ExpandableListItem label="SWAP enabled" value={yesNo(nodeInfo?.swapEnabled)} />
    </ExpandableList>
  )
}

function SwarmIdBackendInfo({
  connectionInfo,
  nodeInfo,
}: {
  connectionInfo: ConnectionInfo | null
  nodeInfo: SwarmNodeInfo | null
}): ReactElement {
  return (
    <>
      <SwarmIdIdentityInfo identity={connectionInfo?.identity} />
      <SwarmIdAppKeyInfo appKey={connectionInfo?.appKey} />
      <SwarmIdCapabilitiesInfo connectionInfo={connectionInfo} nodeInfo={nodeInfo} />
    </>
  )
}

function PrivateKeySection({
  hasPrivateKey,
  disabled,
  onEdit,
}: {
  hasPrivateKey: boolean
  disabled: boolean
  onEdit: () => void
}): ReactElement {
  const pk = hasPrivateKey ? getSignerPk() : undefined

  return (
    <ExpandableList
      label="Identity key"
      info="Stored in this browser only. Both backends derive the file manager state feed from it."
      defaultOpen
    >
      <ExpandableListItem label="Key" value={hasPrivateKey ? 'set' : 'not set'} />
      <KeyRow label="Address" value={pk?.publicKey().address().toString()} />
      {!hasPrivateKey && (
        <Box mt={1}>
          <Alert severity="warning">
            A private key is required before either backend can connect. It cannot be recovered once lost.
          </Alert>
        </Box>
      )}
      <Box mt={2} display="flex" gap={1}>
        <SwarmButton iconType={KeyIcon} onClick={onEdit} disabled={disabled}>
          {hasPrivateKey ? 'Replace private key' : 'Create private key'}
        </SwarmButton>
      </Box>
    </ExpandableList>
  )
}

export default function SwarmIdPage(): ReactElement {
  const { apiUrl } = useContext(SettingsContext)
  const {
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
  } = useContext(SwarmIdContext)

  const [isEditingKey, setIsEditingKey] = useState<boolean>(false)

  const isBusy = status === SwarmConnectionStatus.Connecting
  const isConnected = status === SwarmConnectionStatus.Connected

  return (
    <>
      <ExpandableList label="Backend" defaultOpen>
        <Box p={2} bgcolor="background.paper">
          <RadioGroup value={backend} onChange={event => setBackend(event.target.value as SwarmBackend)}>
            {(Object.keys(BACKEND_LABELS) as SwarmBackend[]).map(key => (
              <FormControlLabel
                key={key}
                value={key}
                control={<Radio disabled={isBusy} />}
                label={BACKEND_LABELS[key]}
              />
            ))}
          </RadioGroup>
          <Typography variant="body2" color="textSecondary">
            Switching the backend drops the current connection. The selection is remembered locally.
          </Typography>
        </Box>
      </ExpandableList>

      <PrivateKeySection
        hasPrivateKey={hasPrivateKey}
        disabled={isBusy || isConnected}
        onEdit={() => setIsEditingKey(true)}
      />

      <ExpandableList label="Connection" defaultOpen>
        <ExpandableListItem label="Status" value={status} />
        <ExpandableListItem
          label="SwarmClient"
          value={swarmClient ? 'ready' : 'not available'}
          tooltip="The port instance FileManagerProvider will consume"
        />
        {error && (
          <Box mt={1}>
            <Alert severity="error">{error.message}</Alert>
          </Box>
        )}
        {!hasPrivateKey && (
          <Box mt={1}>
            <Alert severity="info">Create an identity key above before connecting.</Alert>
          </Box>
        )}
        {backend === SwarmBackend.SwarmId && !isConnected && (
          <Box mt={1}>
            <Alert severity="info">
              Connect only mounts the Swarm ID frame. Authentication is a second, separate step: click the &quot;Login
              with Swarm ID&quot; button it renders, which opens the login window. Safari is download-only — the write
              path is blocked by storage partitioning.
            </Alert>
          </Box>
        )}
        <Box mt={2} display="flex" gap={1}>
          <SwarmButton
            iconType={LinkIcon}
            onClick={connect}
            loading={isBusy}
            disabled={isBusy || isConnected || !hasPrivateKey}
          >
            Connect
          </SwarmButton>
          <SwarmButton
            iconType={UnlinkIcon}
            cancel
            onClick={disconnect}
            disabled={isBusy || (!isConnected && !swarmClient)}
          >
            Disconnect
          </SwarmButton>
        </Box>
      </ExpandableList>

      {backend === SwarmBackend.BeeApi ? (
        <BeeBackendInfo apiUrl={apiUrl} identity={identity} />
      ) : (
        <SwarmIdBackendInfo connectionInfo={connectionInfo} nodeInfo={nodeInfo} />
      )}

      {isEditingKey && (
        <Box position="fixed" top={0} left={0} width="100%" height="100%" zIndex={1300} bgcolor="rgba(0, 0, 0, 0.5)">
          <PrivateKeyModal
            onSaved={() => {
              setIsEditingKey(false)
              notifyPrivateKeySaved()
            }}
            onCancel={() => setIsEditingKey(false)}
          />
        </Box>
      )}
    </>
  )
}

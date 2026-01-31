import { ChainState } from '@ethersphere/bee-js'
import { useContext, useEffect, useState } from 'react'

import { Context } from '../providers/Settings'

import ExpandableListItem from './ExpandableListItem'

export function ChainSync() {
  const { beeApi } = useContext(Context)
  const [chainState, setChainState] = useState<ChainState | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      if (!beeApi) {
        return
      }

      // eslint-disable-next-line no-console
      beeApi.getChainState().then(setChainState).catch(console.error)
    }, 3_000)

    return () => clearInterval(interval)
  })

  return (
    <ExpandableListItem label="Chain state" value={chainState ? `${chainState.block} / ${chainState.chainTip}` : '-'} />
  )
}

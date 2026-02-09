import { MultichainWidget } from '@upcoming/multichain-widget'
import React, { ReactElement } from 'react'

import '@upcoming/multichain-widget/styles.css'
import '@rainbow-me/rainbowkit/styles.css'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: any
}

export function MultichainPage({ settings }: Props): ReactElement {
  return (
    <div className="multichain-main">
      <MultichainWidget
        theme={undefined}
        hooks={undefined}
        settings={undefined}
        intent={undefined}
        destination={undefined}
        dai={undefined}
        bzz={undefined}
      />
    </div>
  )
}

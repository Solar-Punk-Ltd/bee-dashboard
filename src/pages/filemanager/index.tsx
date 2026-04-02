import { FileManagerWidget } from '@solarpunkltd/file-manager-widget'
import { ReactElement } from 'react'

import '@solarpunkltd/file-manager-widget/styles.css'

export function FileManagerPage(): ReactElement {
  return (
    <div className="fm-widget-main">
      <FileManagerWidget />
    </div>
  )
}

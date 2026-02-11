import { FileManagerWidget } from '@solarpunkltd/file-manager-widget'
import { ReactElement } from 'react'

export function FileManagerPage(): ReactElement {
  return (
    <div className="fm-widget-main">
      <FileManagerWidget />
    </div>
  )
}

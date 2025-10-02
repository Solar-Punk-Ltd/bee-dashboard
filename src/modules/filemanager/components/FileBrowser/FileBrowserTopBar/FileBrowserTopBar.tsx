import { ReactElement } from 'react'
import './FileBrowserTopBar.scss'
import { useView } from '../../../../../pages/filemanager/ViewContext'
import { ViewType } from '../../../../filemanager/constants/fileTransfer'

export function FileBrowserTopBar(): ReactElement {
  const { view, actualItemView } = useView()

  const viewText = view === ViewType.Trash ? ' Trash' : ''

  return (
    <div className="fm-file-browser-top-bar">
      {actualItemView}
      {viewText}
    </div>
  )
}

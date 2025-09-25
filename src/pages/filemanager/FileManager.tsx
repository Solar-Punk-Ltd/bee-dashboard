import { ReactElement } from 'react'
import './FileManager.scss'
import { FMSearchProvider } from '../../modules/filemanager/providers/FMSearchContext'
import { FileManagerContent } from './FileManagerContent'

export function FileManagerPage(): ReactElement {
  return (
    <FMSearchProvider>
      <FileManagerContent />
    </FMSearchProvider>
  )
}

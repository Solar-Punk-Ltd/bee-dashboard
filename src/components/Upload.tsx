import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'
import { useState } from 'react'
import SwarmIcon from '../assets/swarmIcon.png'
import UploadModal from './UploadModal'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      position: 'relative',
      backgroundColor: '#DE7700',
      fontSize: '12px',
      fontFamily: '"iAWriterMonoV", monospace',
      width: '65px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      cursor: 'pointer',
      color: '#FCFCFC',
      '&:hover': {
        backgroundColor: '#DE7700',
      },
      '&:hover $dropdown': {
        display: 'flex',
      },
    },
    dropdown: {
      display: 'none',
      backgroundColor: '#ffffff',
      position: 'absolute',
      top: '100%',
      zIndex: 1,
      width: '90px',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      boxSizing: 'border-box',
      color: '#333333',
      '& div': {
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '10px',
      },
      '& div:hover': {
        backgroundColor: '#DE7700',
        color: '#ffffff',
      },
    },
  }),
)

const Upload = (): ReactElement => {
  const classes = useStyles()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files

    if (files && files.length > 0) {
      const file = files[0]
      setSelectedFile(file)
      setIsModalOpen(true)
    }
  }

  const handleUploadClick = () => {
    const fileInput = document.getElementById('file-upload') as HTMLInputElement

    if (fileInput) {
      fileInput.click()
    }
  }

  const handleCloseConfirmationModal = () => {
    setIsModalOpen(false)
  }

  return (
    <div className={classes.container}>
      <img src={SwarmIcon} alt="" height="16" />
      <div>Upload</div>

      <div className={classes.dropdown}>
        <div onClick={handleUploadClick}>{'> Vol-1'}</div>
        <div>{'> MYVIDS'}</div>
        <div>{'> Vol-3'}</div>
        <div>{'> Vol-4'}</div>
        <div>{'> Vol-5'}</div>
      </div>

      <input type="file" onChange={handleFileChange} style={{ display: 'none' }} id="file-upload" />
      {isModalOpen ? <UploadModal modalDisplay={value => setIsModalOpen(value)} /> : null}
    </div>
  )
}

export default Upload

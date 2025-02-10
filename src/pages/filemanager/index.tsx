import { ReactElement, useEffect, useState } from 'react'
import { FileInfo, FileManager } from '@solarpunkltd/file-manager-lib'
import { createStyles, makeStyles, Typography } from '@material-ui/core'
import FileItem from '../../components/FileItem'

const useStyles = makeStyles(() =>
  createStyles({
    errorTextContainer: {
      display: 'flex',
      gap: '10px',
    },
    noFilesText: {
      width: '100%',
      textAlign: 'center',
      marginTop: '200px',
      fontFamily: '"iAWriterMonoV", monospace',
      fontSize: '18px',
    },
    fileListContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    flexDisplay: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
    },
  }),
)
export default function FM(): ReactElement {
  const classes = useStyles()
  const filemanager = new FileManager()
  filemanager.initialize()
  const [fileList, setFileList] = useState<FileInfo[]>([])
  const [fileListError, setFileListError] = useState(false)

  useEffect(() => {
    function fetchFiles() {
      try {
        const files = filemanager.getFileInfoList()
        setFileList(files)
      } catch (error) {
        setFileListError(true)
      }
    }

    fetchFiles()
  }, [])

  return (
    <div>
      {fileList.length === 0 && <div className={classes.noFilesText}>There’re no items!</div>}
      {fileList.length > 0 && (
        <div className={classes.fileListContainer}>
          {fileList.map((file, index) => (
            <div key={index}>
              <FileItem
                name={file.customMetadata?.name ? file.customMetadata.name : ''}
                type={file.customMetadata?.type ? file.customMetadata.type : 'other'}
                size={file.customMetadata?.size ? file.customMetadata.size : ''}
                hash={file.eFileRef}
                expires={file.customMetadata?.valid ? file.customMetadata.valid : ''}
                preview={file.customMetadata?.preview ? file.customMetadata.preview : ''}
              ></FileItem>
            </div>
          ))}
        </div>
      )}
      {fileListError && (
        <div className={classes.errorTextContainer}>
          <Typography variant="h1" align="center">
            Uh oh, some error happened
          </Typography>
        </div>
      )}
    </div>
  )
}

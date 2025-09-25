import { ReactElement, useContext, useEffect, useState } from 'react'
import { Header } from '../../modules/filemanager/components/Header/Header'
import { Sidebar } from '../../modules/filemanager/components/Sidebar/Sidebar'
import { AdminStatusBar } from '../../modules/filemanager/components/AdminStatusBar/AdminStatusBar'
import { FileBrowser } from '../../modules/filemanager/components/FileBrowser/FileBrowser'
import { ViewProvider } from './ViewContext'
import { InitialModal } from '../../modules/filemanager/components/InitialModal/InitialModal'
import { Context as FMContext } from '../../providers/FileManager'
import { getUsableStamps } from '../../modules/filemanager/utils/bee'
import { Context as SettingsContext } from '../../providers/Settings'
import { PostageBatch } from '@ethersphere/bee-js'

export function FileManagerContent(): ReactElement {
  const [showInitialModal, setShowInitialModal] = useState(false)
  const [adminStamp, setAdminStamp] = useState<PostageBatch | undefined>(undefined)
  const { beeApi } = useContext(SettingsContext)

  const { fm, adminDrive, initializationError } = useContext(FMContext)

  useEffect(() => {
    if (!fm) return

    if (adminDrive) {
      setShowInitialModal(false)
    } else {
      setShowInitialModal(true)
    }
  }, [fm, adminDrive])

  useEffect(() => {
    let isMounted = true

    const getAdminStamp = async () => {
      try {
        const stamps = await getUsableStamps(beeApi)
        const stamp = stamps.find(s => s.batchID.toString() === adminStamp?.batchID.toString())

        if (!isMounted) return

        if (!stamp) {
          setShowInitialModal(true)
        } else {
          setAdminStamp(stamp)
          setShowInitialModal(false)
        }
      } catch (error) {
        if (isMounted) {
          // eslint-disable-next-line no-console
          console.error('Failed to fetch admin stamp:', error)
        }
      }
    }

    if (beeApi && adminStamp) {
      getAdminStamp()
    }

    return () => {
      isMounted = false
    }
  }, [beeApi, adminStamp])

  if (!fm) {
    return (
      <div className="fm-main">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          Initializing File Manager...
        </div>
      </div>
    )
  }

  if (initializationError) {
    return (
      <div className="fm-main">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            gap: '16px',
          }}
        >
          <div>Failed to initialize File Manager</div>
        </div>
      </div>
    )
  }

  if (showInitialModal) {
    return (
      <div className="fm-main">
        <InitialModal
          handleVisibility={(isVisible: boolean) => setShowInitialModal(isVisible)}
          setAdminStamp={setAdminStamp}
        />
      </div>
    )
  }

  return (
    <ViewProvider>
      <div className="fm-main">
        <Header />
        <div className="fm-main-content">
          <Sidebar />
          <FileBrowser />
        </div>
        <AdminStatusBar adminStamp={adminStamp} />
      </div>
    </ViewProvider>
  )
}

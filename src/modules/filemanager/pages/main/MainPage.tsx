import { ReactElement, useContext, useEffect, useState } from 'react'
import './MainPage.scss'
import { Header } from '../../components/Header/Header'
import { Sidebar } from '../../components/Sidebar/Sidebar'
import { AdminStatusBar } from '../../components/AdminStatusBar/AdminStatusBar'
import { FileBrowser } from '../../components/FileBrowser/FileBrowser'
import { FMFileViewProvider } from '../../providers/FMFileViewContext'
import { FMInitialModal } from '../../components/FMInitialModal/FMInitialModal'
import { FMProvider } from '../../providers/FMContext'
import { getUsableStamps } from '../../utils/bee'
import { Context as SettingsContext, Provider as SettingsProvider } from '../../../../providers/Settings'
import { PostageBatch } from '@ethersphere/bee-js'
import { FMSearchProvider } from '../../providers/FMSearchContext'

export function MainPage(): ReactElement {
  const [showInitialModal, setShowInitialModal] = useState(false)
  const [adminStamp, setAdminStamp] = useState<PostageBatch | undefined>(undefined)
  const { beeApi } = useContext(SettingsContext)

  useEffect(() => {
    const getStamps = async () => {
      const stamps = await getUsableStamps(beeApi)
      const hasAdminStamp = stamps.some(stamp => stamp.label === 'admin')

      if (!hasAdminStamp) {
        setShowInitialModal(true)
      } else {
        setShowInitialModal(false)
        const adminStamp = stamps.find(stamp => stamp.label === 'admin')

        if (adminStamp) setAdminStamp(adminStamp)
      }
    }
    getStamps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInitialModal])

  return (
    <SettingsProvider>
      <FMProvider>
        <FMSearchProvider>
          <FMFileViewProvider>
            <div className="fm-main">
              {showInitialModal && (
                <FMInitialModal handleVisibility={(isVisible: boolean) => setShowInitialModal(isVisible)} />
              )}
              <Header />
              <div className="fm-main-content">
                <Sidebar />
                <FileBrowser />
              </div>
              <AdminStatusBar adminStamp={adminStamp} />
            </div>
          </FMFileViewProvider>
        </FMSearchProvider>
      </FMProvider>
    </SettingsProvider>
  )
}

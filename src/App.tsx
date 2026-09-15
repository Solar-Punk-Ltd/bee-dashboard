import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { FileManagerProvider as FileManagerWidgetProvider } from '@solarpunkltd/file-manager-widget'
import { SnackbarProvider } from 'notistack'
import { ReactElement, ReactNode, useContext } from 'react'
import { HashRouter as Router } from 'react-router-dom'

import Dashboard from './layout/Dashboard'
import { Provider as BeeProvider } from './providers/Bee'
import { Provider as FeedsProvider } from './providers/Feeds'
import { Provider as FileProvider } from './providers/File'
import { Provider as PlatformProvider } from './providers/Platform'
import { Context as SettingsContext, Provider as SettingsProvider } from './providers/Settings'
import { Provider as StampsProvider } from './providers/Stamps'
import { Provider as TopUpProvider } from './providers/TopUp'
import { Provider as BalanceProvider } from './providers/WalletBalance'
import BaseRouter from './routes'
import { theme } from './theme'

import './App.css'

function FileManagerProvider({ children }: { children: ReactNode }): ReactElement {
  const { apiUrl } = useContext(SettingsContext)

  return <FileManagerWidgetProvider settings={{ apiUrl, pollInterval: 30_000 }}>{children}</FileManagerWidgetProvider>
}

interface Props {
  beeApiUrl?: string
  defaultRpcUrl?: string
  lockedApiSettings?: boolean
  isDesktop?: boolean
  desktopUrl?: string
  errorReporting?: (err: Error) => void
  giftWalletFees?: { bzz: string; dai: string }
}

const App = ({
  beeApiUrl,
  defaultRpcUrl,
  lockedApiSettings,
  isDesktop,
  desktopUrl,
  errorReporting,
  giftWalletFees,
}: Props): ReactElement => {
  const mainApp = (
    <div className="App">
      <ThemeProvider theme={theme}>
        <SettingsProvider
          beeApiUrl={beeApiUrl}
          defaultRpcUrl={defaultRpcUrl}
          lockedApiSettings={lockedApiSettings}
          isDesktop={isDesktop}
          desktopUrl={desktopUrl}
          giftWalletFees={giftWalletFees}
        >
          <TopUpProvider>
            <BeeProvider>
              <BalanceProvider>
                <StampsProvider>
                  <FileProvider>
                    <FileManagerProvider>
                      <FeedsProvider>
                        <PlatformProvider>
                          <SnackbarProvider preventDuplicate anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
                            <Router>
                              <>
                                <CssBaseline />
                                <Dashboard errorReporting={errorReporting}>
                                  <BaseRouter />
                                </Dashboard>
                              </>
                            </Router>
                          </SnackbarProvider>
                        </PlatformProvider>
                      </FeedsProvider>
                    </FileManagerProvider>
                  </FileProvider>
                </StampsProvider>
              </BalanceProvider>
            </BeeProvider>
          </TopUpProvider>
        </SettingsProvider>
      </ThemeProvider>
    </div>
  )

  return mainApp
}

export default App

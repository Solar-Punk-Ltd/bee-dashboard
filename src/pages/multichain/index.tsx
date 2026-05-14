import { BeeModes } from '@ethersphere/bee-js'
import { MultichainWidget } from '@upcoming/multichain-widget'
import React, { ReactElement, useContext, useEffect, useRef, useState } from 'react'

import { CheckState, Context as BeeContext } from '../../providers/Bee'
import { Context as SettingsContext } from '../../providers/Settings'

import { ErrorModal } from './components/ErrorModal/ErrorModal'

import '@upcoming/multichain-widget/styles.css'
import '@rainbow-me/rainbowkit/styles.css'
import './Multichain.scss'

// from multichain-widget
enum Intent {
  InitialFunding = 'initial-funding',
  PostageBatch = 'postage-batch',
  Arbitrary = 'arbitrary',
}

interface MultichainTheme {
  borderRadius?: string
  backgroundColor?: string
  textColor?: string
  errorTextColor?: string
  fontSize?: string
  fontWeight?: number
  fontFamily?: string
  smallFontSize?: string
  smallFontWeight?: number
  secondaryTextColor?: string
  inputBackgroundColor?: string
  inputBorderColor?: string
  inputTextColor?: string
  inputVerticalPadding?: string
  inputHorizontalPadding?: string
  buttonBackgroundColor?: string
  buttonTextColor?: string
  buttonSecondaryBackgroundColor?: string
  buttonSecondaryTextColor?: string
  buttonVerticalPadding?: string
  buttonHorizontalPadding?: string
  labelSpacing?: string
}

interface Props {
  intent?: Intent
  theme?: MultichainTheme
}

const defaultMultichainTheme: MultichainTheme = {
  backgroundColor: '#ededed',
  textColor: '#000000',
  errorTextColor: '',
  fontSize: '0.85rem',
  fontWeight: 500,
  fontFamily: ['iAWriterQuattroV', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'].join(','),
  inputBackgroundColor: '#f3f3f3',
  inputTextColor: '#000000',
  buttonSecondaryBackgroundColor: '#AAAAAA',
  buttonSecondaryTextColor: '#f3f3f3',
}

const getFundIntent = (beeMode: BeeModes | undefined): Intent => {
  if (beeMode === BeeModes.ULTRA_LIGHT) {
    return Intent.InitialFunding
  }

  return Intent.Arbitrary
}

export function MultichainPage({ intent, theme }: Props): ReactElement {
  const { nodeInfo, status, walletBalance } = useContext(BeeContext)
  const { beeApi, rpcProviderUrl } = useContext(SettingsContext)

  const isMountedRef = useRef(true)

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [fundIntent, setFundIntent] = useState<Intent>(intent || getFundIntent(nodeInfo?.beeMode))
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [showError, setShowError] = useState<boolean>(false)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const setShowErrorState = () => {
      if (status.all === CheckState.ERROR) {
        setErrorMessage('Bee node connection error. Please check your node status.')
        setShowError(true)
      }
    }

    setShowErrorState()
  }, [status.all])

  useEffect(() => {
    const setIntentState = () => {
      setFundIntent(getFundIntent(nodeInfo?.beeMode))
    }

    setIntentState()
  }, [nodeInfo?.beeMode])

  useEffect(() => {
    const setStates = () => {
      if (beeApi && walletBalance?.walletAddress) {
        setIsLoading(false)
        setWalletAddress(walletBalance.walletAddress.toString())
      }
    }

    setStates()
  }, [beeApi, walletBalance?.walletAddress])

  if (isLoading) {
    return (
      <div className="multichain-widget-main">
        <div className="multichain-widget-loading" aria-live="polite">
          <div className="multichain-widget-spinner" aria-hidden="true" />
          <div className="multichain-widget-loading-title">Multichain app loading…</div>
          <div className="multichain-widget-loading-subtitle">Please wait a few seconds</div>
        </div>
      </div>
    )
  }

  return (
    <div className="multichain-widget-main">
      <MultichainWidget
        theme={theme || defaultMultichainTheme}
        hooks={{
          beforeTransactionStart: async (_: string) => {},
          // eslint-disable-next-line require-await
          onFatalError: async (e: unknown) => {
            setErrorMessage(`An error occured during swap: ${e}`)
            setShowError(true)
          },
          // eslint-disable-next-line require-await
          onCompletion: async () => {
            setErrorMessage('Multichain transaction completed successfully!')
            setShowError(true)
          },
          // eslint-disable-next-line require-await
          onUserAbort: async () => {
            setErrorMessage('User cancelled the swap operation')
            setShowError(true)
          },
        }}
        settings={{ gnosisJsonRpcProviders: [rpcProviderUrl] }}
        intent={fundIntent}
        destination={walletAddress}
        dai={undefined}
        bzz={undefined}
      ></MultichainWidget>
      {showError && (
        <ErrorModal
          label={errorMessage}
          onClick={() => {
            setShowError(false)
            setErrorMessage('')
          }}
        />
      )}
    </div>
  )
}

import { createContext, ReactElement, ReactNode, useState } from 'react'

// These need to be numeric values as they are used as indexes in the TabsContainer
export enum Platforms {
  macOS = 0,
  Linux,
  Windows,
  iOS,
  Android,
}

export enum SupportedPlatforms {
  macOS = Platforms.macOS,
  Linux = Platforms.Linux,
}

interface ContextInterface {
  platform: SupportedPlatforms
  setPlatform: (platform: SupportedPlatforms) => void
}

const initialValues: ContextInterface = {
  platform: SupportedPlatforms.macOS,
  setPlatform: () => {},
}

export const Context = createContext<ContextInterface>(initialValues)
export const Consumer = Context.Consumer

interface Props {
  children: ReactNode
}

function isSupportedPlatform(platform: unknown): platform is SupportedPlatforms {
  return Object.keys(SupportedPlatforms).includes(platform as string)
}

function getOS(): Platforms | null {
  const userAgent = window.navigator.userAgent

  if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(userAgent)) return Platforms.macOS

  if (/iPhone|iPad|iPod/.test(userAgent)) return Platforms.iOS

  if (/Win32|Win64|Windows|WinCE/.test(userAgent)) return Platforms.Windows

  if (/Android/.test(userAgent)) return Platforms.Android

  if (/Linux/.test(userAgent)) return Platforms.Linux

  return null
}

export function Provider({ children }: Props): ReactElement {
  const [platform, setPlatform] = useState<SupportedPlatforms>(() => {
    const os = getOS()

    return isSupportedPlatform(os) ? os : SupportedPlatforms.Linux
  })

  return <Context.Provider value={{ platform, setPlatform }}>{children}</Context.Provider>
}

import React from 'react'

declare module 'react' {
  interface InputHTMLAttributes<T> extends React.HTMLAttributes<T> {
    webkitdirectory?: boolean
  }
}

export {}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
}

export {}

declare global {
  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }
}

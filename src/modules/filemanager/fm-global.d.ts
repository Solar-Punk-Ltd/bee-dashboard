import React from 'react'

declare module 'react' {
  interface InputHTMLAttributes<T> extends React.HTMLAttributes<T> {
    webkitdirectory?: boolean
  }
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
}
declare global {
  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }
}

export {}

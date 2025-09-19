import { FeedIndex } from '@ethersphere/bee-js'

export enum FileTransferType {
  Upload = 'upload',
  Download = 'download',
  Update = 'update',
}

export enum TransferStatus {
  Uploading = 'uploading',
  Done = 'done',
  Error = 'error',
}

export enum TransferBarColor {
  Upload = '#22c55e',
  Update = '#f59e0b',
  Download = '#3b82f6',
}

export enum ViewType {
  File = 'file',
  Trash = 'trash',
}

export const desiredLifetimeOptions = [
  { value: 0, label: 'Select a value' },
  { value: 1, label: '1 week' },
  { value: 2, label: '1 month' },
  { value: 3, label: '3 months' },
  { value: 4, label: '6 months' },
  { value: 5, label: '1 year' },
]

export const FEED_INDEX_ZERO = FeedIndex.fromBigInt(BigInt(0))
export enum FileAction {
  Trash = 'trash',
  Forget = 'forget',
  Destroy = 'destroy',
}

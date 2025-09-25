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

export enum ActionTag {
  Trashed = 'trashed',
  Recovered = 'recovered',
  Restored = 'restored',
}

export enum FileAction {
  Trash = 'trash',
  Forget = 'forget',
  Destroy = 'destroy',
}

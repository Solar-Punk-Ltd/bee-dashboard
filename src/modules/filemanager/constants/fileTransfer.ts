export enum FileTransferType {
  Upload = 'upload',
  Download = 'download',
  Update = 'update',
  Open = 'open',
}

export enum TransferStatus {
  Uploading = 'uploading',
  Done = 'done',
  Error = 'error',
  Queued = 'queued',
}

export const TransferBarColor: Record<Capitalize<FileTransferType>, string> = {
  Upload: 'rgb(16, 185, 129)',
  Download: 'rgb(59, 130, 246)',
  Update: 'rgb(234, 179, 8)',
  Open: 'rgb(59, 130, 246)',
}

export enum ViewType {
  File = 'file',
  Trash = 'trash',
}
// TODO: lifecycle shall use the same enum
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

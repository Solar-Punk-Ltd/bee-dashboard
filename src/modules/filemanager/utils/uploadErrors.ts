export enum UploadErrorType {
  TIMEOUT = 'TIMEOUT',
  NODE_UNREACHABLE = 'NODE_UNREACHABLE',
  NODE_CRASH = 'NODE_CRASH',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CAPACITY_ERROR = 'CAPACITY_ERROR',
  CANCELLED = 'CANCELLED',
  UNKNOWN = 'UNKNOWN',
}

export interface CategorizedError {
  type: UploadErrorType
  message: string
  userMessage: string
  isRetriable: boolean
  suggestedAction: string
}

export function categorizeUploadError(error: unknown): CategorizedError {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  if (isTimeoutError(lowerMessage)) {
    return createTimeoutError(errorMessage)
  }

  if (isNodeUnreachableError(lowerMessage)) {
    return createNodeUnreachableError(errorMessage)
  }

  if (isNodeCrashError(lowerMessage)) {
    return createNodeCrashError(errorMessage)
  }

  if (isCapacityError(lowerMessage)) {
    return createCapacityError(errorMessage)
  }

  if (isCancelledError(lowerMessage)) {
    return createCancelledError(errorMessage)
  }

  if (isNetworkError(lowerMessage)) {
    return createNetworkError(errorMessage)
  }

  return createUnknownError(errorMessage)
}

function isTimeoutError(message: string): boolean {
  return message.includes('timeout') || message.includes('timed out') || message.includes('request took too long')
}

function isNodeUnreachableError(message: string): boolean {
  return (
    message.includes('failed to fetch') ||
    message.includes('connection refused') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up')
  )
}

function isNodeCrashError(message: string): boolean {
  return (
    message.includes('internal server error') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable')
  )
}

function isCapacityError(message: string): boolean {
  return message.includes('insufficient capacity') || message.includes('stamp') || message.includes('capacity')
}

function isCancelledError(message: string): boolean {
  return message.includes('cancel') || message.includes('abort')
}

function isNetworkError(message: string): boolean {
  return message.includes('network') || message.includes('connection')
}

function createTimeoutError(message: string): CategorizedError {
  return {
    type: UploadErrorType.TIMEOUT,
    message,
    userMessage: 'Upload timed out. This usually happens with large files or slow connections.',
    isRetriable: true,
    suggestedAction: 'The upload will be retried automatically. You can also try uploading smaller files.',
  }
}

function createNodeUnreachableError(message: string): CategorizedError {
  return {
    type: UploadErrorType.NODE_UNREACHABLE,
    message,
    userMessage: 'Cannot reach the Bee node. The node may be down or network connection is lost.',
    isRetriable: true,
    suggestedAction:
      'Check if your Bee node is running and accessible. The upload will be retried automatically when the node becomes available.',
  }
}

function createNodeCrashError(message: string): CategorizedError {
  return {
    type: UploadErrorType.NODE_CRASH,
    message,
    userMessage: 'The Bee node became unstable during upload.',
    isRetriable: true,
    suggestedAction:
      'This can happen with large files on slower systems. The upload will be retried. Consider restarting your Bee node if this persists.',
  }
}

function createCapacityError(message: string): CategorizedError {
  return {
    type: UploadErrorType.CAPACITY_ERROR,
    message,
    userMessage: 'Insufficient stamp capacity for this upload.',
    isRetriable: false,
    suggestedAction: 'Please top up your stamp or use a larger stamp.',
  }
}

function createCancelledError(message: string): CategorizedError {
  return {
    type: UploadErrorType.CANCELLED,
    message,
    userMessage: 'Upload was cancelled.',
    isRetriable: false,
    suggestedAction: 'You can start the upload again if needed.',
  }
}

function createNetworkError(message: string): CategorizedError {
  return {
    type: UploadErrorType.NETWORK_ERROR,
    message,
    userMessage: 'Network error occurred during upload.',
    isRetriable: true,
    suggestedAction: 'Check your internet connection. The upload will be retried automatically.',
  }
}

function createUnknownError(message: string): CategorizedError {
  return {
    type: UploadErrorType.UNKNOWN,
    message,
    userMessage: `Upload failed: ${message}`,
    isRetriable: true,
    suggestedAction:
      'The upload will be retried automatically. If this persists, please check the error message above.',
  }
}

export function calculateRetryDelay(retryCount: number): number {
  const baseDelay = 2000
  const maxDelay = 60000
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)

  return delay + Math.random() * 1000
}

export function getUploadTimeout(fileSizeBytes: number): number {
  const minTimeout = 60000
  const maxTimeout = 600000

  const fileSizeMB = fileSizeBytes / (1024 * 1024)
  const calculatedTimeout = minTimeout + fileSizeMB * 1000

  return Math.min(Math.max(calculatedTimeout, minTimeout), maxTimeout)
}

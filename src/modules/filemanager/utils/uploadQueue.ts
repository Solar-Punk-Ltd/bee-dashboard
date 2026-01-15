export interface QueuedUpload {
  uuid: string
  fileName: string
  fileSize: number
  driveId: string
  driveName: string
  timestamp: number
  retryCount: number
  lastError?: string
  fileData?: string
}

const QUEUE_KEY = 'fm_upload_queue'
const MAX_RETRY_COUNT = 3
const MAX_QUEUE_SIZE = 50

export class UploadQueue {
  private static instance: UploadQueue

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): UploadQueue {
    if (!UploadQueue.instance) {
      UploadQueue.instance = new UploadQueue()
    }

    return UploadQueue.instance
  }

  getQueue(): QueuedUpload[] {
    try {
      const stored = localStorage.getItem(QUEUE_KEY)

      return stored ? JSON.parse(stored) : []
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to read upload queue:', error)

      return []
    }
  }

  private saveQueue(queue: QueuedUpload[]): void {
    try {
      const limitedQueue = queue.slice(0, MAX_QUEUE_SIZE)
      localStorage.setItem(QUEUE_KEY, JSON.stringify(limitedQueue))
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to save upload queue:', error)
    }
  }

  addToQueue(upload: Omit<QueuedUpload, 'timestamp' | 'retryCount'>): void {
    const queue = this.getQueue()
    const queuedUpload: QueuedUpload = {
      ...upload,
      timestamp: Date.now(),
      retryCount: 0,
    }

    queue.push(queuedUpload)
    this.saveQueue(queue)
  }

  removeFromQueue(uuid: string): void {
    const queue = this.getQueue()
    const filtered = queue.filter(u => u.uuid !== uuid)
    this.saveQueue(filtered)
  }

  updateInQueue(uuid: string, updates: Partial<QueuedUpload>): void {
    const queue = this.getQueue()
    const index = queue.findIndex(u => u.uuid === uuid)

    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates }
      this.saveQueue(queue)
    }
  }

  getRetriableUploads(): QueuedUpload[] {
    const queue = this.getQueue()

    return queue.filter(u => u.retryCount < MAX_RETRY_COUNT)
  }

  incrementRetry(uuid: string, error: string): void {
    const queue = this.getQueue()
    const index = queue.findIndex(u => u.uuid === uuid)

    if (index !== -1) {
      queue[index].retryCount += 1
      queue[index].lastError = error
      this.saveQueue(queue)
    }
  }

  clearFailedUploads(): void {
    const queue = this.getQueue()
    const filtered = queue.filter(u => u.retryCount < MAX_RETRY_COUNT)
    this.saveQueue(filtered)
  }

  clearQueue(): void {
    localStorage.removeItem(QUEUE_KEY)
  }

  getFailedUploads(): QueuedUpload[] {
    const queue = this.getQueue()

    return queue.filter(u => u.retryCount >= MAX_RETRY_COUNT)
  }
}

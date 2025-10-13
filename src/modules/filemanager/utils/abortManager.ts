export class AbortManager {
  private controllers = new Map<string, AbortController>()

  create(key: string): AbortController | undefined {
    if (!this.controllers.has(key)) {
      this.controllers.set(key, new AbortController())
    }

    return this.controllers.get(key)
  }

  getSignal(key: string): AbortSignal | undefined {
    return this.controllers.get(key)?.signal
  }

  abort(key: string): void {
    const controller = this.controllers.get(key)
    controller?.abort()
    this.controllers.delete(key)
  }

  has(key: string): boolean {
    return this.controllers.has(key)
  }

  clear(): void {
    this.controllers.forEach(controller => controller.abort())
    this.controllers.clear()
  }

  async withSignal<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const signal = this.getSignal(key)

    if (!signal) return fn()

    const originalFetch = window.fetch
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const merged: RequestInit = { ...(init || {}), signal: init?.signal ?? signal }

      return originalFetch(input as RequestInfo | URL, merged)
    }) as typeof window.fetch

    try {
      return await fn()
    } finally {
      window.fetch = originalFetch
    }
  }
}

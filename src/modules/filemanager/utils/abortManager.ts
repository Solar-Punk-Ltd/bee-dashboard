/**
 * Manages AbortController instances for cancellable operations
 */
export class AbortManager {
  private controllers = new Map<string, AbortController>()

  /**
   * Creates and stores a new AbortController for the given key
   */
  create(key: string): AbortController {
    if (!this.controllers.has(key)) {
      this.controllers.set(key, new AbortController())
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.controllers.get(key)!
  }

  /**
   * Gets the AbortSignal for the given key
   */
  getSignal(key: string): AbortSignal | undefined {
    return this.controllers.get(key)?.signal
  }

  /**
   * Aborts and cleans up the controller for the given key
   */
  abort(key: string): void {
    const controller = this.controllers.get(key)
    controller?.abort()
    this.controllers.delete(key)
  }

  /**
   * Checks if a controller exists for the given key
   */
  has(key: string): boolean {
    return this.controllers.has(key)
  }

  /**
   * Clears all controllers
   */
  clear(): void {
    this.controllers.forEach(controller => controller.abort())
    this.controllers.clear()
  }

  /**
   * Executes an async function with abort signal injection into fetch
   */
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

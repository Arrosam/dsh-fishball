/**
 * Listeners for Fishball's published state (the settings view's event streams). One
 * failing listener, such as a stream the browser already closed, never stops delivery to
 * the others; the failure goes to `onError`.
 */
export class StateFeed {
  #listeners = new Set()
  #onError

  /** @param onError - called with each listener failure. */
  constructor(onError) {
    this.#onError = onError
  }

  /** @returns an unsubscribe function. */
  subscribe(listener) {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Deliver one value to every current listener. */
  publish(value) {
    for (const listener of [...this.#listeners]) {
      try { listener(value) } catch (error) { this.#onError(error) }
    }
  }
}

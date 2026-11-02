/**
 * The one-time welcome card (DESIGN §10f, revision 12). The browser reports the card shown as
 * soon as it renders, and the Host stores that, so it never shows again in any browser, even if
 * you left without pressing anything. Stored here, not in the browser, for the same reason as
 * the brand icon (src/preferences.js).
 */
import { NOTICE } from './constants.js'

export class Welcome {
  #store
  #onChange

  /** @param store - Store (notices table); onChange - state changed. */
  constructor(store, { onChange }) {
    this.#store = store
    this.#onChange = onChange
  }

  /** Snapshot field `welcome`: show until it has shown once. */
  snapshot() {
    return { show: this.#store.notices.get(NOTICE.welcome) === undefined }
  }

  /** Durably record the card as shown; a repeat changes nothing. */
  async markSeen() {
    if (this.#store.notices.get(NOTICE.welcome) !== undefined) return
    await this.#store.notices.put(NOTICE.welcome, { seenAt: new Date().toISOString() })
    this.#onChange()
  }
}

/**
 * Your display choices (DESIGN §10): which brand icon the sidebar shows. Stored here, not in
 * the browser, so every browser you open shows the same one.
 */
import { PREFERENCE } from './constants.js'

export class Preferences {
  #store
  #onChange

  /** @param store - Store (preferences table); onChange - state changed. */
  constructor(store, { onChange }) {
    this.#store = store
    this.#onChange = onChange
  }

  snapshot() {
    return { brandStyle: this.#store.preferences.get(PREFERENCE.recordKey)?.brandStyle ?? PREFERENCE.defaultBrandStyle }
  }

  /** Durably set the brand icon; the caller has checked it is one of BRAND_STYLE. */
  async setBrandStyle(brandStyle) {
    await this.#store.preferences.put(PREFERENCE.recordKey, { brandStyle, changedAt: new Date().toISOString() })
    this.#onChange()
  }
}

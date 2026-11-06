/**
 * Your display choices (DESIGN §10, slim §7): which brand icon the sidebar shows, and whether it
 * has a Fishball row or only the brand button. Stored here, not in the browser, so every browser
 * you open shows the same ones.
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
    const record = this.#store.preferences.get(PREFERENCE.recordKey)
    return {
      brandStyle: record?.brandStyle ?? PREFERENCE.defaultBrandStyle,
      sidebarEntry: record?.sidebarEntry ?? PREFERENCE.defaultSidebarEntry,
    }
  }

  /** Durably set the brand icon; the caller has checked it is one of BRAND_STYLE. */
  setBrandStyle(brandStyle) {
    return this.#save({ brandStyle })
  }

  /** Durably set the sidebar entry; the caller has checked it is one of SIDEBAR_ENTRY. */
  setSidebarEntry(sidebarEntry) {
    return this.#save({ sidebarEntry })
  }

  /** Both choices share one record, so a change keeps the other choice as it is. */
  async #save(change) {
    await this.#store.preferences.put(PREFERENCE.recordKey, { ...this.snapshot(), ...change, changedAt: new Date().toISOString() })
    this.#onChange()
  }
}

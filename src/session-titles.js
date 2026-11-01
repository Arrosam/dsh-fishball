/**
 * Current titles of a changing set of sessions, read synchronously by the snapshot (the
 * settings page's managed-sessions list, DESIGN §10e).
 *
 * The snapshot is synchronous, but a cold session's title needs an asynchronous read of its
 * log. So titles are kept in memory: read once when a session joins the set, then followed
 * through DSH's `session/title` events, so a session that is named later (one start_session
 * could not name, or one you rename) shows its new title without a restart. Nothing is stored: a restart
 * reads them again.
 */
import { EVENT, SESSION_INFO } from './constants.js'
import { titleFrom, titleOf } from './session-info.js'

export class SessionTitles {
  #ctx
  #onChange
  /** sessionId -> title; '' while DSH has none, absent until read. */
  #titles = new Map()
  /** Sessions whose title is being read: one read each, however often follow() runs. */
  #reading = new Set()
  /** The sessions to follow. */
  #wanted = new Set()

  /**
   * @param ctx - fishball row context (on, sessions, sessionController).
   * @param deps.onChange - after a title changed.
   */
  constructor(ctx, { onChange }) {
    this.#ctx = ctx
    this.#onChange = onChange
    ctx.on(EVENT.sessionEvent, (session, event) => {
      if (event.type !== SESSION_INFO.titleEvent || !this.#wanted.has(session.id)) return
      this.#set(session.id, titleFrom([event]))
    })
  }

  /** Follow exactly these sessions: new ones are read, others are forgotten. */
  follow(sessionIds) {
    this.#wanted = new Set(sessionIds)
    for (const id of [...this.#titles.keys()]) if (!this.#wanted.has(id)) this.#titles.delete(id)
    for (const id of this.#wanted) if (!this.#titles.has(id)) void this.#read(id)
  }

  /** @returns the title, or null while it is not known (not read yet, untitled, or unreadable). */
  get(sessionId) {
    const title = this.#titles.get(sessionId)
    return title ? title : null
  }

  /** Read one title; an unreadable session counts as untitled (its id shows instead). */
  async #read(sessionId) {
    if (this.#reading.has(sessionId)) return
    this.#reading.add(sessionId)
    try {
      const title = await titleOf(this.#ctx, sessionId)
      // A title event that arrived during the read is newer: keep it.
      if (this.#wanted.has(sessionId) && !this.#titles.has(sessionId)) this.#set(sessionId, title)
    } finally {
      this.#reading.delete(sessionId)
    }
  }

  #set(sessionId, title) {
    if (this.#titles.get(sessionId) === title) return
    this.#titles.set(sessionId, title)
    this.#onChange()
  }
}

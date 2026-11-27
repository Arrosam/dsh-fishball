/**
 * Reading one conversation snapshot (../support/page.mjs SNAPSHOT) by turn, and opening the manager's
 * Fishball page: shared by the page rows and the paging / stream rows.
 */
import { openDsh } from '../support/page.mjs'
import { PAGE, SESSION_ROUTE } from './constants.mjs'

export const show = (v) => JSON.stringify(v)
/** The data-chat-turn of the row whose text holds `marker`. */
export const turnOf = (snap, marker) => snap?.rows.find((r) => r.text.includes(marker))?.turn ?? null
export const rowsOf = (snap, turn, kind) => (snap?.rows ?? []).filter((r) => r.turn === turn && (kind === undefined || r.kind === kind))
export const replies = (snap, turn) => rowsOf(snap, turn, PAGE.kinds.reply).filter((r) => r.part === PAGE.response)
export const messages = (snap, turn) => rowsOf(snap, turn, PAGE.kinds.message)
export const controlOf = (snap, turn) => snap?.controls.find((c) => c.turn === turn) ?? null

/** The manager session through the same core route fishball-page reads. */
export async function managerSession(h) {
  const id = (await h.request(SESSION_ROUTE, { method: 'POST', body: {} })).json?.sessionId
  if (typeof id !== 'string') throw new Error('no manager session')
  return id
}

/** A logged-in tab on the Fishball page; `opened` is the first snapshot with the page mark and `ready(snapshot)`. */
export async function openFishballPage(h, ready = () => true) {
  const tab = await openDsh(h, PAGE.root, PAGE.selectors)
  return { tab, opened: await tab.until((s) => s.page && ready(s)) }
}

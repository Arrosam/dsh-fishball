/**
 * The one place that binds the R-FIX-FUI F1 rows to the code under test.
 *
 * - `viewModule()`: fishball-ui `src/pairing/index.js` (`pairingView`) and `text.js` (`PAIRING_TEXT`,
 *   the specified copy), bound to the current DSH;
 * - `expectedView(...)`: the requirement's view model written out from the copy, the oracle;
 * - `rowWorld(t)`: fishball-ui's REAL Node row (`index.js`) applied in a real Cordis root of the
 *   current DSH, which provides a recording `connection` (its `fetch.register`).
 * Nothing of the implementation is read; only exports and registrations are observed.
 */
import assert from 'node:assert/strict'
import { importBound, rowModule } from 'fishball-test-helpers/bind'
import { importDsh } from 'fishball-test-helpers/dsh'
import { settle } from 'fishball-test-helpers/wait'
import { ID_PREFIX, STATE } from '../support/pairing.mjs'
import { ROUTE, SUBJECT, VIEW } from './constants.mjs'

export async function viewModule() {
  const view = await importBound(SUBJECT.view)
  const text = await importBound(SUBJECT.text)
  assert.equal(typeof view[SUBJECT.viewExport], 'function', `fishball-ui src/pairing/index.js exports no ${SUBJECT.viewExport}()`)
  assert.equal(typeof text[SUBJECT.textExport], 'object', 'no PAIRING_TEXT')
  return { pairingView: view[SUBJECT.viewExport], TEXT: text[SUBJECT.textExport] }
}

/** `lastSeen` as the requirement formats it (`neverSeen`, or Intl medium/short in the zone; a bad zone → default). */
export function lastSeenText(TEXT, lang, lastSeenAt, timeZone) {
  if (lastSeenAt === null) return TEXT[lang].neverSeen
  const options = { ...VIEW.timeFormat }
  let zoneOk = timeZone !== undefined
  if (zoneOk) { try { new Intl.DateTimeFormat(VIEW.locale[lang], { timeZone }) } catch { zoneOk = false } }
  if (zoneOk) options.timeZone = timeZone
  return new Intl.DateTimeFormat(VIEW.locale[lang], options).format(new Date(lastSeenAt))
}
const inUseName = (inUse) => (typeof inUse?.name === 'string' ? inUse.name : ID_PREFIX + inUse.id)

/** The requirement's view model for one core view (the oracle). */
export function expectedView(TEXT, view, lang, timeZone) {
  const l = VIEW.langs.includes(lang) ? lang : VIEW.defaultLang
  const T = TEXT[l]
  const out = { state: view?.state, title: T.title, lines: [], confirm: null, choices: [], failed: T.chooseFailed }
  if (view === undefined) return out
  const label = (choice) => ({ choice, label: T[VIEW.choiceLabel[choice]] })
  if (view.state === STATE.warnMatch) {
    out.lines.push({ kind: STATE.warnMatch, text: T.warnMatch(inUseName(view.warning.inUse), lastSeenText(TEXT, l, view.warning.lastSeenAt, timeZone)) })
    out.confirm = T.confirm
    out.choices = view.choices.map(label)
  } else if (view.state === STATE.warnMismatch) {
    out.lines.push({ kind: STATE.warnMismatch, text: T.warnMismatch(inUseName(view.warning.inUse), lastSeenText(TEXT, l, view.warning.lastSeenAt, timeZone)) })
    out.choices = view.choices.map(label)
  } else if (VIEW.stateText[view.state]) {
    out.lines.push({ kind: view.state, text: T[VIEW.stateText[view.state]] })
  }
  if (view.nameIssue) {
    const tail = typeof view.nameIssue.inUse?.name === 'string' ? T.nameInUse(view.nameIssue.inUse.name) : T.nameless(view.nameIssue.inUse.id)
    out.lines.push({ kind: view.nameIssue.code, text: T[VIEW.nameText[view.nameIssue.code]] + VIEW.separator + tail })
  }
  return out
}

/** A plain, comparable copy of a view-model result. */
export const plain = (v) => JSON.parse(JSON.stringify(v))
export const deepFrozen = (v) => v === null || typeof v !== 'object' || (Object.isFrozen(v) && Object.values(v).every(deepFrozen))

/** fishball-ui's row in a real Cordis root of the current DSH: `{routes}`, every route it registered. */
export async function rowWorld(t) {
  const { Context } = await importDsh('cordis')
  const root = new Context()
  const routes = []
  root.provide(ROUTE.connection, { fetch: { register(route) { routes.push(route); return () => {} } } })
  const fiber = root.plugin(await rowModule(SUBJECT.row))
  await fiber
  await settle()
  t.after(async () => { await fiber.dispose?.(); await settle() })
  return { routes }
}

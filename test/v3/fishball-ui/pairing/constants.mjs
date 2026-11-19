/**
 * Vocabulary for the R-FIX-FUI F1 rows (the pairing warning UI; R-ID-07, R-ID-10, R-NAME-03,
 * R-NAME-08). Every value is the requirement's (relayed by the lead, 2026-11-18) or core's frozen
 * K3a `ui.pairing` seam; the copy is fishball-ui's `src/pairing/text.js` `PAIRING_TEXT`, which the
 * requirement names as the specified copy, so the oracles format with it.
 */
import path from 'node:path'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

export const SUBJECT = Object.freeze({
  view: path.join(V3.ui.dir, 'src', 'pairing', 'index.js'),
  viewExport: 'pairingView',
  text: path.join(V3.ui.dir, 'src', 'pairing', 'text.js'),
  textExport: 'PAIRING_TEXT',
  row: path.join(V3.ui.dir, 'index.js'),
})

/** Core's pairing words (K3a; F-PAIR's PAIRING_STATE, CHOICE and refusals). */
export const STATE = Object.freeze({
  unpaired: 'unpaired', paired: 'paired', warnMatch: 'warn-match', warnMismatch: 'warn-mismatch',
  needToken: 'need-token', needId: 'need-id', idMismatch: 'id-mismatch',
})
export const CHOICE = Object.freeze({ continue: 'continue', newTokenAndId: 'new-token-and-id', newToken: 'new-token' })
export const REFUSAL = Object.freeze({ notOffered: 'not-offered', notConfirmed: 'not-confirmed', notSaved: 'not-saved' })
export const NAME_CODE = Object.freeze({ taken: 'name-taken', invalid: 'name-invalid' })

/** The view model's rules (the requirement). */
export const VIEW = Object.freeze({
  langs: Object.freeze(['en', 'zh']),
  defaultLang: 'en',
  /** `Intl` locale per language and the format options of a last-seen time. */
  locale: Object.freeze({ en: 'en', zh: 'zh-CN' }),
  timeFormat: Object.freeze({ dateStyle: 'medium', timeStyle: 'short' }),
  /** Line text key per one-line state; label key per choice. */
  stateText: Object.freeze({ 'need-token': 'needToken', 'need-id': 'needId', 'id-mismatch': 'idMismatch' }),
  choiceLabel: Object.freeze({ continue: 'continue', 'new-token-and-id': 'newTokenAndId', 'new-token': 'newToken' }),
  nameText: Object.freeze({ 'name-taken': 'nameTaken', 'name-invalid': 'nameInvalid' }),
  idPrefix: 'ID: ',
  separator: ' ',
  keys: Object.freeze(['state', 'title', 'lines', 'confirm', 'choices', 'failed']),
})

/** The routes (the requirement). */
export const ROUTE = Object.freeze({
  stream: '/api/fishball/pairing',
  choose: '/api/fishball/pairing/choose',
  /** Page-relative, as the browser asks for them (DSH serves the page under any base). */
  relativeStream: 'api/fishball/pairing',
  relativeChoose: 'api/fishball/pairing/choose',
  get: 'GET', post: 'POST',
  ok: 200, bad: 400, unavailable: 503,
  invalid: Object.freeze({ ok: false, code: 'invalid-arguments' }),
  noService: Object.freeze({ ok: false, code: 'pairing-unavailable' }),
  service: 'fishballInstance',
  apiVersion: 1,
  sse: 'text/event-stream',
  connection: 'connection',
})

/** The browser card's hooks (the requirement). */
export const HOOK = Object.freeze({
  root: 'data-fishball-pairing',
  state: 'data-fishball-pairing-state',
  line: 'data-fishball-pairing-line',
  confirm: 'data-fishball-pairing-confirm',
  choice: 'data-fishball-pairing-choice',
  failed: 'data-fishball-pairing-failed',
  alertRole: 'alert',
  slot: 'conversation.input.dock',
})

/** Test data only. */
export const FIXTURE = Object.freeze({
  boundId: 'fbtest-bound-id',
  name: 'Fbtest Navigator',
  pairedAt: 1_790_000_000_000,
  /** A last-seen time whose calendar date differs between the two zones below. */
  lastSeenAt: 1_800_000_000_000,
  zones: Object.freeze(['Pacific/Auckland', 'America/Los_Angeles']),
  /** Not IANA zones: each falls back to the process default (never throws). */
  badZones: Object.freeze(['Mars/Olympus', '', 'not a zone']),
  otherLangs: Object.freeze(['fr', 'zh-CN', 'EN', '']),
  base: 'http://fishball.test/',
  managerSession: 'fbtest-fishball',
  mountKey: 'fbtest-dock-',
})

/** Harness waits only. */
export const WAIT = Object.freeze({ frameMs: 2000, quietMs: 150, pollMs: 10 })

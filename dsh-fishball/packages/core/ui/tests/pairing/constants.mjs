/**
 * Vocabulary for the R-FIX-FUI F1 rows (the pairing view model; R-ID-07, R-ID-10, R-NAME-03,
 * R-NAME-08). Every value is the requirement's (relayed by the lead, 2026-11-18) or the seam's
 * `ui.pairing` words (../support/pairing.mjs); the copy is fishball-ui's `src/pairing/text.js`
 * `PAIRING_TEXT`, which the requirement names as the specified copy, so the oracle formats with it.
 */
import { UI } from '../support/ui-page.mjs'

export const SUBJECT = Object.freeze({
  view: UI.file('src', 'pairing', 'index.js'),
  viewExport: 'pairingView',
  text: UI.file('src', 'pairing', 'text.js'),
  textExport: 'PAIRING_TEXT',
  row: UI.file('index.js'),
})

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
  separator: ' ',
  keys: Object.freeze(['state', 'title', 'lines', 'confirm', 'choices', 'failed']),
})

/** The two routes MULTI-3 removed from fishball-ui's row (PAIR-INT-00); DSH's Fetch registry service. */
export const ROUTE = Object.freeze({
  stream: '/api/fishball/pairing',
  choose: '/api/fishball/pairing/choose',
  connection: 'connection',
})

/** Test data only. */
export const FIXTURE = Object.freeze({
  zones: Object.freeze(['Pacific/Auckland', 'America/Los_Angeles']),
  /** Not IANA zones: each falls back to the process default (never throws). */
  badZones: Object.freeze(['Mars/Olympus', '', 'not a zone']),
  otherLangs: Object.freeze(['fr', 'zh-CN', 'EN', '']),
})

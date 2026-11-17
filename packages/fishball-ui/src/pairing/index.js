/**
 * The pairing card's view model (R-FIX-FUI; F-PAIR; R-ID-07, R-ID-10, R-NAME-03, R-NAME-08; AUTH-ST-03,
 * NAME-DT-03). Pure: it turns core's pairing view (`fishballInstance.ui.pairing.state()`, K3a
 * `UiPairingView`) into the lines, the confirmation and the choices fishball-ui's pairing card
 * draws (client.pairing.js). It reads core's words from `fishball-shared/ui-seam`, never from core.
 *
 * - warn-match: the warning naming the bound pair and when it was last seen, the box "No other
 *   Fishball or agent uses this id with this token", and Continue / Use a new token and a new id;
 * - warn-mismatch: the warning, and Use a new token;
 * - need-token, need-id, id-mismatch: one line saying what core needs; the user acts in core's
 *   settings (a new token or id), so there is no choice;
 * - a name refusal (`nameIssue`, any state): one more line, with the name in use.
 * unpaired and paired without a name refusal, or no core: nothing to draw (no lines).
 * A nameless principal reads `ID: <id>` (R-NAME-08); the card's lines are plain text, so its bold
 * prefix is not drawn there.
 */
import { SEAM_PAIRING } from 'fishball-shared/ui-seam'
import { PAIRING_DEFAULT_LANG, PAIRING_TEXT } from './text.js'

export { PAIRING_DEFAULT_LANG, PAIRING_TEXT } from './text.js'

const { state: STATE, choice: CHOICE, nameRefusal: NAME_REFUSAL } = SEAM_PAIRING

/**
 * How a time is written in a warning: the date in DSH's medium style and the time in its short style,
 * in the copy's locale and the reader's time zone.
 */
const TIME_STYLE = Object.freeze({ dateStyle: 'medium', timeStyle: 'short' })
/** Between a name refusal and the name in use. */
const SENTENCE_GAP = ' '
/** Each warning's line text key and the box it asks for (`confirm` key or null); keys of `PAIRING_TEXT`. */
const WARNING = Object.freeze({
  [STATE.warnMatch]: Object.freeze({ text: 'warnMatch', confirm: 'confirm' }),
  [STATE.warnMismatch]: Object.freeze({ text: 'warnMismatch', confirm: null }),
})
/** The one line of a held state without a warning. */
const NEED = Object.freeze({ [STATE.needToken]: 'needToken', [STATE.needId]: 'needId', [STATE.idMismatch]: 'idMismatch' })
/** Each choice's label key, in the copy. */
const CHOICE_LABEL = Object.freeze({ [CHOICE.continue]: 'continue', [CHOICE.newTokenAndId]: 'newTokenAndId', [CHOICE.newToken]: 'newToken' })
const NAME_TEXT = Object.freeze({ [NAME_REFUSAL.nameTaken]: 'nameTaken', [NAME_REFUSAL.nameInvalid]: 'nameInvalid' })
/** R-NAME-08: a principal with no name is shown by its id after this prefix (core's `MCP.name.namelessPrefix`). */
const NAMELESS_PREFIX = 'ID: '

const entry = (kind, text) => Object.freeze({ kind, text })
const isName = (label) => typeof label?.name === 'string'

/** `epochMs` in `locale` and `timeZone`; an unknown zone reads as the process's own. */
function formatTime(epochMs, locale, timeZone) {
  try {
    return new Intl.DateTimeFormat(locale, { ...TIME_STYLE, timeZone }).format(epochMs)
  } catch {
    return new Intl.DateTimeFormat(locale, TIME_STYLE).format(epochMs)
  }
}

function warningLine(view, text, timeZone) {
  const warning = view.warning ?? {}
  const name = isName(warning.inUse) ? warning.inUse.name : NAMELESS_PREFIX + (warning.inUse?.id ?? warning.boundId)
  const lastSeen = Number.isFinite(warning.lastSeenAt) ? formatTime(warning.lastSeenAt, text.locale, timeZone) : text.neverSeen
  return entry(view.state, text[WARNING[view.state].text](name, lastSeen))
}

function nameLine(issue, text) {
  const key = NAME_TEXT[issue?.code]
  if (key === undefined) return null
  const inUse = isName(issue.inUse) ? text.nameInUse(issue.inUse.name) : text.nameless(issue.inUse?.id)
  return entry(issue.code, text[key] + SENTENCE_GAP + inUse)
}

/**
 * @param {object | undefined} view core's `pairing.state()`, or undefined without core
 * @param {string} [lang] `en` or `zh`; any other value draws `en`
 * @param {string} [timeZone] the reader's IANA time zone for the last-seen time
 * @returns {{state: string | null, title: string, lines: ReadonlyArray<{kind: string, text: string}>, confirm: string | null,
 *   choices: ReadonlyArray<{choice: string, label: string}>, failed: string}}
 */
export function pairingView(view, lang = PAIRING_DEFAULT_LANG, timeZone = undefined) {
  const text = PAIRING_TEXT[lang] ?? PAIRING_TEXT[PAIRING_DEFAULT_LANG]
  const state = typeof view?.state === 'string' ? view.state : null
  const warning = Object.hasOwn(WARNING, state) ? WARNING[state] : undefined
  const lines = []
  if (warning !== undefined) lines.push(warningLine(view, text, timeZone))
  else if (Object.hasOwn(NEED, state)) lines.push(entry(state, text[NEED[state]]))
  const name = nameLine(view?.nameIssue, text)
  if (name !== null) lines.push(name)
  // Only the choices core offers now, and only those this card can name.
  const choices = warning === undefined ? [] : (view.choices ?? []).filter((choice) => Object.hasOwn(CHOICE_LABEL, choice))
    .map((choice) => Object.freeze({ choice, label: text[CHOICE_LABEL[choice]] }))
  return Object.freeze({
    state,
    title: text.title,
    lines: Object.freeze(lines),
    confirm: typeof warning?.confirm === 'string' ? text[warning.confirm] : null,
    choices: Object.freeze(choices),
    failed: text.chooseFailed,
  })
}

/**
 * The sidebar targets' view model (MULTI-3; PLAN-MULTI §6.1, D03, Q01, Q08, Q09, Q12; first F-STATUS's
 * strip view). Pure: it turns core's status snapshot (`UI_STATUS.service` `snapshot()`, carrying the
 * MULTI-0 `targets` beside the global `fishball`, `guards`, `set`) into what fishball-ui's sidebar
 * draws. It draws nothing and mounts nothing; it reads core's words from `fishball-shared/ui-seam`,
 * never from core.
 *
 * - `notices`: the once-per-process lines, not about one target: `guards-overridden` (R-FB-09) and
 *   `plugin-set-incomplete` (R-BND-05); with Fishball off (R-FB-10) the one `fishball-off` line;
 * - `targets`: one row per target, in core's order (Q12: no cap). A row's `name` is the server's
 *   resolved name as plain text (D06), or `null` with `placeholder` (Q01: "Not set" / "Name
 *   unavailable", never a URL-derived name); its `state` is one of the four public states
 *   (`SEAM_TARGETS.state`; an unknown word reads `failed`, never success), with its badge, `url`
 *   (details only, Q01) and the details' lines (why, the contributed-tool count with zero shown,
 *   R-EXT-14, the identity capability), the one control and the pairing view (`pairingView`).
 * There is no chat-top card any more (D03): the old `card` and the scalar `line`/`control` are gone.
 */
import { SEAM_STATUS, SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { pairingView } from '../pairing/index.js'
import { STATUS_DEFAULT_LANG, STATUS_TEXT } from './text.js'

export { STATUS_TEXT } from './text.js'

/** The notice kinds (`SEAM_STATUS` words) and the details' line kinds of one target. */
export const TARGET_LINE = Object.freeze({
  guards: SEAM_STATUS.guards.overridden,
  set: SEAM_STATUS.set.incomplete,
  off: SEAM_STATUS.fishball.off,
  why: 'why',
  tools: 'contributed-tools',
  identity: 'identity',
})

const entry = (kind, text) => Object.freeze({ kind, text })
const STATES = Object.freeze(Object.values(SEAM_TARGETS.state))
const stateOf = (word) => (STATES.includes(word) ? word : SEAM_TARGETS.state.failed)

/**
 * Why a target is in its state: core's `TargetView.line` `{kind, code}` (the old strip's rule, core's
 * own; MULTI-0 `a946e5a4`). A word the copy does not know is shown verbatim: it is one of the
 * documented codes a user can look up. A view without a line draws none.
 */
function whyLine(target, text) {
  const line = target.line
  if (typeof line?.kind !== 'string') return null
  const word = text.line[line.kind] ?? line.kind
  return entry(TARGET_LINE.why, line.code == null ? word : text.code(word, line.code))
}

function targetView(target, text, lang, timeZone) {
  const state = stateOf(target.state)
  const named = typeof target.name === 'string' && target.name !== ''
  const hasUrl = typeof target.url === 'string' && target.url !== ''
  const lines = [whyLine(target, text)]
  if (Number.isInteger(target.contributedTools)) lines.push(entry(TARGET_LINE.tools, text.tools(target.contributedTools)))
  const identity = text.identity[target.identity]
  if (identity !== undefined) lines.push(entry(TARGET_LINE.identity, identity))
  const control = Object.hasOwn(text.control, target.control) ? Object.freeze({ action: target.control, label: text.control[target.control] }) : null
  return Object.freeze({
    targetId: target.targetId,
    kind: target.kind,
    name: named ? target.name : null,
    // Q01 by the seam's rule: no address yet reads "Not set"; an address no discovery has named yet
    // reads "Name unavailable". The state does not choose it (a target needing authorization is
    // `not-set` but has an address).
    placeholder: named ? null : text.placeholder[hasUrl ? SEAM_TARGETS.placeholder.unnamed : SEAM_TARGETS.placeholder.unset],
    state,
    badge: text.state[state],
    url: target.url ?? '',
    lines: Object.freeze(lines.filter((line) => line !== null)),
    control,
    retry: state === SEAM_TARGETS.state.failed ? text.retry : null,
    pairing: pairingView(target.pairing, lang, timeZone),
  })
}

/**
 * @param {object | undefined} snapshot core's status snapshot, or undefined / `{fishball: 'fishball-off'}`
 * @param {string} [lang] `en` or `zh`; any other value draws `en`
 * @param {string} [timeZone] the reader's IANA time zone (pairing last-seen times)
 * @returns {{on: boolean, title: string, empty: string | null, notices: ReadonlyArray<{kind: string, text: string}>,
 *   targets: ReadonlyArray<object>, words: object}} `words` holds the sidebar's own labels in `lang`
 */
export function targetsView(snapshot, lang = STATUS_DEFAULT_LANG, timeZone = undefined) {
  const text = STATUS_TEXT[lang] ?? STATUS_TEXT[STATUS_DEFAULT_LANG]
  const on = snapshot?.fishball === SEAM_STATUS.fishball.on
  const notices = []
  if (!on) notices.push(entry(TARGET_LINE.off, text.line[TARGET_LINE.off]))
  if (on && snapshot.guards?.status === SEAM_STATUS.guards.overridden) notices.push(entry(TARGET_LINE.guards, text.guards(snapshot.guards.overridden.join(text.separator))))
  if (on && snapshot.set?.status === SEAM_STATUS.set.incomplete) {
    notices.push(entry(TARGET_LINE.set, text.set(snapshot.set.missing.map((m) => text.member(m.name, text.reason[m.reason] ?? m.reason)).join(text.separator))))
  }
  const list = on && snapshot[SEAM_TARGETS.member]?.version === SEAM_TARGETS.snapshotVersion && Array.isArray(snapshot[SEAM_TARGETS.member].targets)
    ? snapshot[SEAM_TARGETS.member].targets : []
  const targets = list.map((target) => targetView(target, text, lang, timeZone))
  return Object.freeze({
    on,
    title: text.title,
    empty: on && targets.length === 0 ? text.empty : null,
    notices: Object.freeze(notices),
    targets: Object.freeze(targets),
    words: text.words,
  })
}

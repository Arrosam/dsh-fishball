/**
 * The status strip's view model (task F-STATUS; design §5a.2, §6.3a step 1). Pure: it turns core's
 * status snapshot (`src/status` `createStatus().snapshot()` or `statusOf`) into the lines and the
 * one control fishball-ui draws. It draws nothing itself and mounts nothing (F-WIRE). Moved from
 * core's `ui/status` by F-UI; it reads core's words from `fishball-shared/ui-seam`, never from core.
 *
 * Lines, in order: the link line, then `guards-overridden` (R-FB-09), `plugin-set-incomplete`
 * (R-BND-05) and `contributed-tools` (R-EXT-14: "core's status shows how many contributed tools
 * are offered", so 0 is shown too; absent only without the bridge, when the count is unknown). No line is ever about fishball-ui (Q-G1), Watchdog (1.37) or fishball-hosted-settings
 * (removed, 1.34). The control is `connect` or `cancel` with its label, or null; there is no token
 * field (R-FB-03).
 */
import { SEAM_STATUS } from 'fishball-shared/ui-seam'
import { CARD, STATUS_DEFAULT_LANG, STATUS_TEXT } from './text.js'

export { CARD, STATUS_TEXT } from './text.js'

/** The extra line kinds of the strip (the link line's kind is the snapshot's `line.kind`). */
export const STRIP_KIND = Object.freeze({
  guards: SEAM_STATUS.guards.overridden,
  set: SEAM_STATUS.set.incomplete,
  tools: 'contributed-tools',
  off: SEAM_STATUS.fishball.off,
})

const entry = (kind, text) => Object.freeze({ kind, text })

/**
 * The card's state for the link line's kind (UI-POLISH-F). A kind not listed (a word core adds
 * later) reads as `failed`: the card never claims a connection it cannot name.
 */
const CARD_OF = Object.freeze({
  [SEAM_STATUS.link.connected]: CARD.connected,
  [SEAM_STATUS.link.unset]: CARD.unset,
  [SEAM_STATUS.connect.needsAuthorization]: CARD.disconnected,
  [SEAM_STATUS.connect.authorizing]: CARD.connecting,
  [SEAM_STATUS.connect.needsConfiguration]: CARD.attention,
  [SEAM_STATUS.link.unreachable]: CARD.failed,
  [SEAM_STATUS.link.refused]: CARD.failed,
  [SEAM_STATUS.connect.failed]: CARD.failed,
  [STRIP_KIND.off]: CARD.off,
})

/** The card's heading, state badge and the words the browser half draws around the lines. */
function cardOf(kind, text) {
  const state = Object.hasOwn(CARD_OF, kind) ? CARD_OF[kind] : CARD.failed
  return Object.freeze({
    state,
    title: state === CARD.off ? text.card.offTitle : text.card.title,
    badge: text.card.badge[state],
    toolsHint: text.card.toolsHint,
    openApproval: text.card.openApproval,
  })
}

function linkLine({ kind, code }, text) {
  const word = text.line[kind] ?? kind
  return entry(kind, code === null ? word : text.code(word, code))
}

/**
 * @param {object} snapshot core's status snapshot, or `{fishball: 'fishball-off'}`
 * @param {string} [lang] `en` or `zh`; any other value draws `en`
 * @returns {{lines: ReadonlyArray<{kind: string, text: string}>, control: {action: string, label: string} | null,
 *   card: {state: string, title: string, badge: string, toolsHint: string, openApproval: string}}}
 *   `card.state` is one of `CARD`, from the first line's kind (`CARD_OF`).
 */
export function stripView(snapshot, lang = STATUS_DEFAULT_LANG) {
  const text = STATUS_TEXT[lang] ?? STATUS_TEXT[STATUS_DEFAULT_LANG]
  if (snapshot?.fishball !== SEAM_STATUS.fishball.on) {
    return Object.freeze({ lines: Object.freeze([entry(STRIP_KIND.off, text.line[STRIP_KIND.off])]), control: null, card: cardOf(STRIP_KIND.off, text) })
  }
  const lines = [linkLine(snapshot.line, text)]
  if (snapshot.guards?.status === SEAM_STATUS.guards.overridden) lines.push(entry(STRIP_KIND.guards, text.guards(snapshot.guards.overridden.join(text.separator))))
  if (snapshot.set?.status === SEAM_STATUS.set.incomplete) {
    lines.push(entry(STRIP_KIND.set, text.set(snapshot.set.missing.map((m) => text.member(m.name, text.reason[m.reason] ?? m.reason)).join(text.separator))))
  }
  if (Number.isInteger(snapshot.contributedTools)) lines.push(entry(STRIP_KIND.tools, text.tools(snapshot.contributedTools)))
  const control = snapshot.control === null ? null : Object.freeze({ action: snapshot.control, label: text.control[snapshot.control] })
  return Object.freeze({ lines: Object.freeze(lines), control, card: cardOf(snapshot.line.kind, text) })
}

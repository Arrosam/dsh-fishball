/**
 * The status strip's view model (task F-STATUS; design §5a.2, §6.3a step 1). Pure: it turns core's
 * status snapshot (`src/status` `createStatus().snapshot()` or `statusOf`) into the lines and the
 * one control fishball-ui draws. It draws nothing itself and mounts nothing (F-WIRE, F-UI).
 *
 * Lines, in order: the link line, then `guards-overridden` (R-FB-09), `plugin-set-incomplete`
 * (R-BND-05) and `contributed-tools` (R-EXT-14: "core's status shows how many contributed tools
 * are offered", so 0 is shown too; absent only without the bridge, when the count is unknown). No line is ever about fishball-ui (Q-G1), Watchdog (1.37) or fishball-hosted-settings
 * (removed, 1.34). The control is `connect` or `cancel` with its label, or null; there is no token
 * field (R-FB-03).
 */
import { GUARDS } from '../../contracts/constants.js'
import { STATUS_MODEL } from '../../src/status/constants.js'
import { STATUS_DEFAULT_LANG, STATUS_TEXT } from './text.js'

export { STATUS_TEXT } from './text.js'

/** The extra line kinds of the strip (the link line's kind is the snapshot's `line.kind`). */
export const STRIP_KIND = Object.freeze({
  guards: GUARDS.status.overridden,
  set: STATUS_MODEL.set.incomplete,
  tools: 'contributed-tools',
  off: STATUS_MODEL.fishball.off,
})

const entry = (kind, text) => Object.freeze({ kind, text })

function linkLine({ kind, code }, text) {
  const word = text.line[kind] ?? kind
  return entry(kind, code === null ? word : text.code(word, code))
}

/**
 * @param {object} snapshot core's status snapshot, or `{fishball: 'fishball-off'}`
 * @param {string} [lang] `en` or `zh`; any other value draws `en`
 * @returns {{lines: ReadonlyArray<{kind: string, text: string}>, control: {action: string, label: string} | null}}
 */
export function stripView(snapshot, lang = STATUS_DEFAULT_LANG) {
  const text = STATUS_TEXT[lang] ?? STATUS_TEXT[STATUS_DEFAULT_LANG]
  if (snapshot?.fishball !== STATUS_MODEL.fishball.on) {
    return Object.freeze({ lines: Object.freeze([entry(STRIP_KIND.off, text.line[STRIP_KIND.off])]), control: null })
  }
  const lines = [linkLine(snapshot.line, text)]
  if (snapshot.guards?.status === GUARDS.status.overridden) lines.push(entry(STRIP_KIND.guards, text.guards(snapshot.guards.overridden.join(text.separator))))
  if (snapshot.set?.status === STATUS_MODEL.set.incomplete) {
    lines.push(entry(STRIP_KIND.set, text.set(snapshot.set.missing.map((m) => text.member(m.name, text.reason[m.reason] ?? m.reason)).join(text.separator))))
  }
  if (Number.isInteger(snapshot.contributedTools)) lines.push(entry(STRIP_KIND.tools, text.tools(snapshot.contributedTools)))
  const control = snapshot.control === null ? null : Object.freeze({ action: snapshot.control, label: text.control[snapshot.control] })
  return Object.freeze({ lines: Object.freeze(lines), control })
}

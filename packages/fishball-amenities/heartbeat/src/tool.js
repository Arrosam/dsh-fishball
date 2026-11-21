import { defineTool } from '@deepseek-ai/dsh-tools'
import { FOCUS, REFUSAL, TEXT, TOOL } from './constants.js'

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const refused = code => ({ ok: false, code })
// Code points, as the board counts its bounds, so a surrogate pair is one character.
const length = text => [...text].length

/** `{focus}` normalized, or undefined when the call is not exactly that shape within bounds. */
function parse(args) {
  if (!isRecord(args) || !Object.keys(args).every(key => TOOL.argKeys.includes(key)) || typeof args.focus !== 'string') return undefined
  const focus = args.focus.trim()
  return length(focus) <= FOCUS.maxChars ? focus : undefined
}

/**
 * `heartbeat_focus`: the manager's only control over heartbeats. It edits the focus content and
 * nothing else; interval and limit stay the user's (no parameter reaches them).
 *
 * Contract: success `{ok: true, focus}` (trimmed; empty means cleared); refusals
 * `{ok: false, code}` with `not-manager` (the caller is not the session this scope belongs to),
 * `invalid-input` or `focus-unavailable` (the store failed; nothing is reported as saved). It
 * never throws.
 *
 * The field is declared `json` and not required, as the board's are: dsh-tools' defineTool
 * validates arguments against the schema before execute and throws its own ToolArgsError, so a
 * typed or required field would answer a malformed call with DSH's error instead of this tool's
 * one refusal. The description says it is a string. Arguments that are not an object at all are
 * still refused by defineTool itself, before this tool runs.
 *
 * @param {{store: {write(focus: string): Promise<void>}, sessionId: string}} options - the row's
 *   focus store and the manager session id of the scope this tool is registered into.
 */
export function createFocusTool({ store, sessionId }) {
  return defineTool({
    name: TOOL.name,
    description: TEXT.toolDescription,
    parameters: { focus: { type: TOOL.jsonType, description: TEXT.focusField } },
    output: {
      schema: { type: TOOL.jsonType },
      render: (_args, value) => [{ type: TOOL.textBlock, text: value.ok ? TEXT.saved(value.focus) : JSON.stringify(value) }],
    },
    async execute(args, exec) {
      // The tool is registered only in the manager's scope (X2); this is the second check.
      if (String(exec?.agent?.session?.id) !== sessionId) return refused(REFUSAL.notManager)
      const focus = parse(args)
      if (focus === undefined) return refused(REFUSAL.invalidInput)
      try { await store.write(focus) } catch { return refused(REFUSAL.focusUnavailable) }
      return { ok: true, focus }
    },
  })
}

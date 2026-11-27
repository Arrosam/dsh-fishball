/**
 * The ContributedTool definitions of Fishball's Watchdog tools (dsh-agent-connector ./tools contract,
 * K2). They are registered through `dshConnectorTools.register` from this row's context, so their
 * public names carry this package's namespace: `dsh-connector-watchdog.watchdog_brief` etc.
 *
 * `watchdog_session_start` takes session_start's own arguments (its K1 input schema, read from
 * `dshConnectorSessions.startInput`, so the two never drift) plus the brief's `purpose` and
 * `scope`. It is listed only when the connector offers `start`.
 */
import { CODE, START_CODE, TEXT, TOOL } from './constants.js'

const string = (description) => ({ type: 'string', description })
const closed = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false })
const session = { sessionId: string(TEXT.sessionId) }
const brief = { purpose: string(TEXT.purpose), scope: string(TEXT.scope) }
const CODES = Object.freeze(Object.values(CODE))
const START_CODES = Object.freeze([...CODES, ...Object.values(START_CODE)])

const ROWS = Object.freeze([
  [TOOL.brief, TEXT.brief, closed({ ...session, ...brief }, ['sessionId', 'purpose']), false, CODES],
  [TOOL.refine, TEXT.refine, closed({ ...session, ...brief }, ['sessionId']), true, CODES],
  [TOOL.pause, TEXT.pause, closed(session, ['sessionId']), true, CODES],
  [TOOL.resume, TEXT.resume, closed(session, ['sessionId']), true, CODES],
])

/** session_start's input schema with the brief's fields added (purpose required, as for watchdog_brief). */
const startRow = (startInput) => [
  TOOL.sessionStart, TEXT.sessionStart,
  closed({ ...startInput.properties, ...brief }, [...(startInput.required ?? []), 'purpose']), false, START_CODES,
]

/**
 * @param call - core.js `call(toolName, args, principalKey)`
 * @param startInput - `dshConnectorSessions.startInput`, or undefined when the connector offers no `start`
 */
export function watchdogTools(call, startInput) {
  const rows = startInput === undefined ? ROWS : [...ROWS, startRow(startInput)]
  return rows.map(([name, description, inputSchema, idempotentHint, codes]) => ({
    name, description, inputSchema, codes,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint, openWorldHint: false },
    execute: (args, { principal }) => call(name, args, principal.key),
  }))
}

/**
 * The ContributedTool definitions of Fishball's four tools (dsh-agent-connector ./tools contract,
 * K2). They are registered through `dshConnectorTools.register` from this row's context, so their
 * public names carry this package's namespace: `dsh-connector-watchdog.watchdog_brief` etc.
 */
import { CODE, TEXT, TOOL } from './constants.js'

const string = (description) => ({ type: 'string', description })
const closed = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false })
const session = { sessionId: string(TEXT.sessionId) }
const CODES = Object.freeze(Object.values(CODE))

const ROWS = Object.freeze([
  [TOOL.brief, TEXT.brief, closed({ ...session, purpose: string(TEXT.purpose), scope: string(TEXT.scope) }, ['sessionId', 'purpose']), false],
  [TOOL.refine, TEXT.refine, closed({ ...session, purpose: string(TEXT.purpose), scope: string(TEXT.scope) }, ['sessionId']), true],
  [TOOL.pause, TEXT.pause, closed(session, ['sessionId']), true],
  [TOOL.resume, TEXT.resume, closed(session, ['sessionId']), true],
])

/** @param call - core.js `call(toolName, args, principalKey)` */
export function watchdogTools(call) {
  return ROWS.map(([name, description, inputSchema, idempotentHint]) => ({
    name, description, inputSchema, codes: CODES,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint, openWorldHint: false },
    execute: (args, { principal }) => call(name, args, principal.key),
  }))
}

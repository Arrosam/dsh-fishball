/**
 * One managed start, shared by the core `session_start` tool (handlers.js) and the plugin-facing
 * `dshConnectorSessions.start` (wire/domain.js), so both start and manage a session by one rule.
 * The order is the port's (domain/session-port.js `start`): create → title → model → `onCreated`
 * → first message. `onCreated` makes the caller the session's manager (R-ROUTE-01) and then runs
 * the plugin's own `afterManaged(sessionId, managed)`, both before the first message is sent. So a
 * plugin that claims the session there (Watchdog's brief) holds it before the session's first turn
 * can ask for anything (the user, 2026-11-21: close the gap when the session is created).
 */
import { REFUSAL } from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { hasVisibleCharacter } from '../../text.js'
import { LOG } from './constants.js'

/**
 * @param deps.sessions - the domain's `sessions` port (`start`)
 * @param deps.managed - K1c `ManagedState` (`manage`)
 * @param deps.manage - optional internal assignment path for the native MCP start
 * @param deps.logger - `{warn}`
 * @param args - session_start's arguments, already checked against its schema and payload rules
 * @param principalKey - the principal that will manage the session
 * @param afterManaged - optional `(sessionId, managed) => Promise<void>`, awaited before the first message
 * @returns `{ok: true, sessionId, managed, running, titleError?, workspaceError?}` or `{ok: false, code}`
 * @throws a domain RefusalError (the port's refusals) or any other failure, as the port throws them
 */
export async function startManaged({ sessions, managed, logger, manage = managed.manage }, args, principalKey, afterManaged) {
  // V2's rule (bridge.js): a title with no visible character is refused before anything is created.
  if (!hasVisibleCharacter(args.title)) return { ok: false, code: REFUSAL.limitExceeded }
  let managedNow = false
  const onCreated = async (sessionId) => {
    try {
      managedNow = (await manage(sessionId, principalKey)).ok === true
    } catch (error) {
      // As V2's start: a session whose management could not be stored still starts, unmanaged.
      logger.warn(LOG.format, LOG.manageFailed, diagnosticOf(error))
    }
    // A plugin's step never stops the start: the session exists, and the plugin reports its own failure.
    try { await afterManaged?.(sessionId, managedNow) } catch (error) { logger.warn(LOG.format, LOG.afterManagedFailed, diagnosticOf(error)) }
  }
  const started = await sessions.start(args, { onCreated })
  return {
    ok: true, sessionId: started.sessionId, managed: managedNow, running: started.running === true,
    ...(started.titleError === undefined ? {} : { titleError: started.titleError }),
    ...(started.workspaceError === undefined ? {} : { workspaceError: started.workspaceError }),
  }
}

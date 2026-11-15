/**
 * Who may name a session in a core tool (task C-TOOLS; R-ROUTE-01/02, requirements 1.23 item 4;
 * K1c ManagedState). ManagedState keys are root session ids and the caller resolves the root
 * (K1c-1), so a subagent's session counts as its root's.
 *
 * **The refusal table (Fishball's decision, 2026-11-14).** For a tool that names session S with
 * root R, the first matching row answers:
 * 1. another principal manages R → `forbidden`, for every session tool. This is checked before
 *    any DSH lookup when S is itself managed, so it says nothing about whether S exists;
 * 2. S is not a known DSH session → `unknown-session`;
 * 3. R is unmanaged → `forbidden` for reading (session_read, attachment_read: only managed
 *    sessions are related in V3, which has no watches) and `not-managed` for acting
 *    (SESSION_ACCESS);
 * 4. otherwise the caller manages R and the tool runs.
 * The answer tools (`approval_answer`, `question_answer`) apply row 1 only, then authorise by the
 * offer's holder (offers.js), because an `ask` from an unmanaged session is held by the
 * designated agent.
 */
import { REFUSAL } from '../../../mcp-schema/index.js'
import { AUTHORITY } from './constants.js'

/**
 * @param {object} ports
 * @param {Pick<import('../../../mcp-schema/index.js').ManagedState, 'managerOf'>} ports.managed
 * @param {{rootOf(sessionId: string): string, describe(sessionId: string): Promise<object | undefined>}} ports.sessions
 */
export function createSessionAccess({ managed, sessions }) {
  /**
   * The caller's relation to the session's root (AUTHORITY). A managed id is already a root
   * (K1c keys), so the root is resolved only for an id nobody manages.
   */
  function relationOf(sessionId, principalKey) {
    const direct = managed.managerOf(sessionId)
    const root = direct === undefined ? sessions.rootOf(sessionId) : sessionId
    const manager = direct ?? (root === sessionId ? undefined : managed.managerOf(root))
    if (manager === undefined) return { relation: AUTHORITY.none, root }
    return { relation: manager === principalKey ? AUTHORITY.mine : AUTHORITY.other, root }
  }

  /**
   * The table above for one call.
   * @param {{unmanaged: string}} access a SESSION_ACCESS row
   * @returns {Promise<{root: string} | {code: string}>}
   */
  async function check(sessionId, principalKey, access) {
    const { relation, root } = relationOf(sessionId, principalKey)
    if (relation === AUTHORITY.other) return { code: REFUSAL.forbidden }
    if ((await sessions.describe(sessionId)) === undefined) return { code: REFUSAL.unknownSession }
    if (relation === AUTHORITY.none) return { code: access.unmanaged }
    return { root }
  }

  /** Whether the caller manages the session's root (the list tools' filter); no DSH existence read. */
  const isMine = (sessionId, principalKey) => relationOf(sessionId, principalKey).relation === AUTHORITY.mine

  return Object.freeze({ relationOf, check, isMine })
}

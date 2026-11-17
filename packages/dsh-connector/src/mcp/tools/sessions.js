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
 * offer's holder (offers.js): the holder is the session's manager when the offer was made, and a
 * succession moves it (R-HOST-09).
 *
 * **Current, not admitted (review F02; the user: "Agent不能回答不归自己管的会话，只能操作自己管的会话").**
 * Management can change while a tool awaits DSH (Take back, Hand over, a succession), and no
 * exception lets an admitted call finish under a former manager (R-TOK-05's admitted-request rule
 * is about token revocation only). So the table is applied again after every awaited lookup and
 * immediately before each side effect and before read data is returned (`recheck`), from the same
 * synchronous managed state the change itself writes: an awaited step that started before the
 * change may still run, but its result never reaches a former manager and no later step runs.
 */
import { REFUSAL } from '../../../mcp-schema/index.js'
import { AUTHORITY } from './constants.js'

/**
 * @param {object} ports
 * @param {Pick<import('../../../mcp-schema/index.js').ManagedState, 'managerOf'>} ports.managed
 * @param {{rootOf(sessionId: string): string, storedRootOf?(sessionId: string): Promise<string | undefined>, describe(sessionId: string): Promise<object | undefined>}} ports.sessions
 *   `rootOf` follows attached sessions only (synchronous, for the list filters and the rechecks);
 *   `storedRootOf` follows stored headers too, so a stopped subagent's session is its root's
 *   (R-FIX-CUI: after a Hand over from a child's header the root's manager must reach that child).
 *   A port without `storedRootOf` knows attached sessions only.
 */
export function createSessionAccess({ managed, sessions }) {
  /**
   * The caller's relation to the session's root (AUTHORITY). A managed id is already a root
   * (K1c keys), so the root is resolved only for an id nobody manages: `knownRoot` when the call
   * resolved it already (`check`), else from the attached sessions.
   */
  function relationOf(sessionId, principalKey, knownRoot) {
    const direct = managed.managerOf(sessionId)
    const root = direct === undefined ? knownRoot ?? sessions.rootOf(sessionId) : sessionId
    const manager = direct ?? (root === sessionId ? undefined : managed.managerOf(root))
    if (manager === undefined) return { relation: AUTHORITY.none, root }
    return { relation: manager === principalKey ? AUTHORITY.mine : AUTHORITY.other, root }
  }

  /**
   * Rows 1, 3 and 4 against the managed state as it is now (no DSH read): the code, or undefined
   * when the caller still manages `root`. A call that started with the caller managing the session
   * is refused once it does not: by another principal → `forbidden`, by nobody → the row's code.
   * @param {{unmanaged: string}} access a SESSION_ACCESS row
   */
  function recheck(sessionId, principalKey, access, root) {
    const current = relationOf(sessionId, principalKey, root)
    if (current.relation === AUTHORITY.other) return REFUSAL.forbidden
    if (current.relation === AUTHORITY.none) return access.unmanaged
    return current.root === root ? undefined : REFUSAL.forbidden
  }

  /**
   * The table above for one call, rechecked after the DSH existence read (see `recheck`). Row 1 is
   * first judged on the attached root, before any DSH read; once the session is known to exist its
   * stored root is read (a stopped subagent's session, `storedRootOf`) and rows 1, 3 and 4 are
   * judged on it.
   * @param {{unmanaged: string}} access a SESSION_ACCESS row
   * @returns {Promise<{root: string} | {code: string}>}
   * @throws (rejects) when the stored root cannot be read (not a not-found): the call fails rather
   *   than taking the session for a root of its own
   */
  async function check(sessionId, principalKey, access) {
    if (relationOf(sessionId, principalKey).relation === AUTHORITY.other) return { code: REFUSAL.forbidden }
    if ((await sessions.describe(sessionId)) === undefined) return { code: REFUSAL.unknownSession }
    const stored = sessions.storedRootOf === undefined ? undefined : await sessions.storedRootOf(sessionId)
    const { relation, root } = relationOf(sessionId, principalKey, stored)
    if (relation === AUTHORITY.other) return { code: REFUSAL.forbidden }
    if (relation === AUTHORITY.none) return { code: access.unmanaged }
    const code = recheck(sessionId, principalKey, access, root)
    return code === undefined ? { root } : { code }
  }

  /** Whether the caller manages the session's root (the list tools' filter); no DSH existence read. */
  const isMine = (sessionId, principalKey) => relationOf(sessionId, principalKey).relation === AUTHORITY.mine

  return Object.freeze({ relationOf, check, recheck, isMine })
}

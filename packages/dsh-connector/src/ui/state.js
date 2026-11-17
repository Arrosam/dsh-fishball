/**
 * What embed-UI draws, owned here (requirements 1.34: "connector当后端，embed UI当前端"): the
 * attention latch, the notify prompt, and the snapshot that joins them with the hand-over
 * service's marks and Hand over targets. Embed-UI keeps none of it.
 *
 * - **Latch** (design §13.6, D3 behaviour, owner moved to the connector by R-EXT-13 amended 1.34):
 *   0/1 with importance; a signal sets it, the window's opening clears it once, and it resets when
 *   embed-UI's contribution ends. No timer. C-WIRE-2 withdrew design §13.6's reset "on loss of the
 *   designated Fishball principal's connection" with the designated agent (the user's answer q5,
 *   2026-11-17: "Remove agentToken entirely").
 * - **Notice** (R-FN-01): the newest notify message, its importance and how many arrived since the
 *   user last clicked the prompt or opened the window. A newer notice replaces the text.
 * - **Snapshot**: `marks` is `managed()` as it is, so names always match it; `targets` is what the
 *   Hand over control lists (R-UI-10: enabled and paired, online or not, in `principals()` order);
 *   `light` is the fish's light, on for a set latch or a pending notice.
 * Nothing here is stored: the latch and the notice are in memory, as V2's latch was (D3).
 */
import { LATCH } from './constants.js'

const freezeAll = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)))
/** The clear latch: count 0, not important. Frozen, so every clear shares it. */
const CLEARED = Object.freeze({ count: LATCH.clear, important: false })

/**
 * @param {object} deps
 * @param deps.handover - K3 `DshConnectorHandover` (`managed`, `principals`)
 * @param deps.changed - called after every change of the latch or the notice
 */
export function createUiState({ handover, changed }) {
  let latch = CLEARED
  let notice = null
  /** Applies a change. It publishes only if something changed, so a no-op sends no frame. */
  function update(nextLatch, nextNotice) {
    const same = nextLatch.count === latch.count && nextLatch.important === latch.important && nextNotice === notice
    latch = nextLatch
    notice = nextNotice
    if (!same) changed()
  }
  /** Clears the latch and the prompt. */
  const clearAll = () => update(CLEARED, null)
  const attention = () => Object.freeze({ ...latch })

  return Object.freeze({
    /** `attention.signal` (§13.6): count = 1, important ||= important. Stateless: nothing is replayed. */
    signal(important) {
      update(Object.freeze({ count: LATCH.set, important: latch.important || important }), notice)
    },
    /** `attention.state` (§13.6): read-only. */
    attention,
    /** `notify` (R-FN-01): the new text replaces the old; the count goes on until a dismiss or an open. */
    notify(message, important) {
      update(latch, Object.freeze({ message, important, count: (notice?.count ?? 0) + 1 }))
    },
    /** The user clicked the prompt: it goes; the latch is the window's to clear. */
    dismiss() { update(latch, null) },
    /** The window opened: the latch is cleared once (§13.6) and the prompt goes (R-FN-01). */
    opened: clearAll,
    /** Embed-UI's contribution ended (its unload): nothing it showed survives it (§13.6). */
    reset: clearAll,
    snapshot() {
      const marks = freezeAll(handover.managed().map(({ sessionId, principal }) => ({ sessionId, principal: Object.freeze({ key: principal.key, name: principal.name, id: principal.id }) })))
      const targets = freezeAll(handover.principals().filter((row) => row.enabled && row.paired).map(({ key, name, id, online }) => ({ key, name, id, online })))
      const light = Object.freeze({ on: latch.count === LATCH.set || notice !== null, important: latch.important || notice?.important === true })
      return Object.freeze({ marks, targets, attention: attention(), notice, light })
    },
  })
}

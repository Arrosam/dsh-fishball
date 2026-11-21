import { NAMESPACE, SESSION } from './constants.js'

/**
 * Pure fold of the manager session's events into the heartbeat's turn state. The same fold reads
 * the snapshot at setup (restart, resume, a row reload) and every live event after it, so the
 * consecutive count survives a restart without a file of its own: the session log already records
 * which turns were heartbeats.
 *
 * A turn that entered a step is a heartbeat turn when it admitted this amenity's notice and no
 * message the user typed. Anything else is a real turn, including a turn with neither (a
 * connector event, a reminder): that is work Fishball was woken for, which is what the limit waits
 * for. Ambient context messages (runtime/time context) carry other source kinds and decide nothing.
 *
 * A turn that entered no step (DSH's loop opens and closes one when its inbox turned out empty)
 * sent no model request, so it neither warmed the cache nor did work: it keeps the count and the
 * anchor of the last turn that did. Anchoring the timer on it would push the next heartbeat past
 * the cache lifetime the user's interval is set against.
 *
 * State: { open, stepped, heartbeat, user, consecutive, lastEnd: {seq, time} | undefined }.
 */
export const initialTurns = () => ({ open: false, stepped: false, heartbeat: false, user: false, consecutive: 0, lastEnd: undefined })

const isHeartbeatNotice = source => source?.kind === SESSION.noticeSource && source.pluginId === NAMESPACE
const opened = state => ({ ...state, open: true, stepped: false, heartbeat: false, user: false })

/** @returns the next state; `state` is not mutated. */
export function foldTurn(state, event) {
  switch (event.type) {
    case SESSION.turnStart:
      return opened(state)
    case SESSION.stepStart:
      return state.open ? { ...state, stepped: true } : state
    case SESSION.userMessage: {
      if (!state.open) return state
      const source = event.data?.source
      if (isHeartbeatNotice(source)) return { ...state, heartbeat: true }
      if (source?.kind === SESSION.userSource) return { ...state, user: true }
      return state
    }
    case SESSION.turnEnd: {
      const closed = { ...opened(state), open: false }
      if (!state.stepped) return closed
      // The count rises when a heartbeat turn ENDS, not when one is sent: only the log's record
      // is rebuilt at restart, and a send that never became a turn warmed nothing.
      const heartbeat = state.heartbeat && !state.user
      return { ...closed, consecutive: heartbeat ? state.consecutive + 1 : 0, lastEnd: { seq: event.seq, time: event.time } }
    }
    default:
      return state
  }
}

import { NAMESPACE, SESSION } from './constants.js'

/**
 * Pure fold of the manager session's events into the heartbeat's turn state. The same fold reads
 * the snapshot at setup (restart, resume, a row reload) and every live event after it, so the
 * consecutive count survives a restart without a file of its own: the session log already records
 * which turns were heartbeats.
 *
 * A turn that entered a step is a heartbeat turn when it admitted this amenity's notice and no
 * work message (SESSION.workSources, or another plugin's notice). Anything else is a real turn:
 * the user's words, a batch of connector events, a reminder, or a turn with none of these. DSH's
 * inbox claims every waiting message at once, so a heartbeat queued while core handed over an
 * event batch can land in the same turn; that turn did the batch's work, so it is real. Ambient
 * context messages (runtime/time context) carry other source kinds and decide nothing.
 *
 * A turn that entered no step (DSH's loop opens and closes one when its inbox turned out empty)
 * sent no model request, so it neither warmed the cache nor did work: it keeps the count and the
 * anchor of the last turn that did. Anchoring the timer on it would push the next heartbeat past
 * the cache lifetime the user's interval is set against.
 *
 * `compacted`: an idle compaction was attempted since the last real turn ended: a compaction/start
 * outside any turn (the heartbeat's own compactNow, or the user's /compact), or the heartbeat's
 * own attempt that wrote none (heartbeat.js sets it then). It makes a cooling's compaction happen
 * once, a restart included, since the log records the attempt. Only a real turn clears it. A
 * compaction inside a turn is that turn's business (DSH's pressure trigger) and decides nothing.
 *
 * State: { open, stepped, heartbeat, work, consecutive, compacted, lastEnd: {seq, time} | undefined }.
 */
export const initialTurns = () => ({ open: false, stepped: false, heartbeat: false, work: false, consecutive: 0, compacted: false, lastEnd: undefined })

const isHeartbeatNotice = source => source?.kind === SESSION.noticeSource && source.pluginId === NAMESPACE
const isWork = source => SESSION.workSources.includes(source?.kind) || source?.kind === SESSION.noticeSource
const opened = state => ({ ...state, open: true, stepped: false, heartbeat: false, work: false })

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
      if (isWork(source)) return { ...state, work: true }
      return state
    }
    case SESSION.turnEnd: {
      const closed = { ...opened(state), open: false }
      if (!state.stepped) return closed
      // The count rises when a heartbeat turn ENDS, not when one is sent: only the log's record
      // is rebuilt at restart, and a send that never became a turn warmed nothing.
      const heartbeat = state.heartbeat && !state.work
      return {
        ...closed, consecutive: heartbeat ? state.consecutive + 1 : 0, compacted: heartbeat && state.compacted,
        lastEnd: { seq: event.seq, time: event.time },
      }
    }
    case SESSION.compactionStart:
      return state.open || state.compacted ? state : { ...state, compacted: true }
    default:
      return state
  }
}

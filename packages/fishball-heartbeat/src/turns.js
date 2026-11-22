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
 * `caused`: ids of the messages that the heartbeat's own compaction made other plugins queue, so
 * that admitting one later decides nothing (the user's requirement, 2026-11-22: a compaction the
 * heartbeat starts is no activity; fishball-taskboard's compaction reminder had made the next
 * turn real and the heartbeats started over). The heartbeat's compaction is told apart in the log
 * as an idle compaction/start with no `sourceCommandId` (DSH's /compact records its command; DSH's
 * own automatic compactions run inside a turn). A message counts as caused when it is in the first
 * `agent/inbox/spliced` into `next-step` (`agent.inject`, which never wakes) and that splice directly
 * follows the `compaction/end` with the same compactionId: a plugin reacting to the end lands there
 * (dsh-session refuses a reentrant append, so it waits a microtask). The window holds no further
 * event: input arriving hours later in a silent cooled session is judged as usual. A user-sourced
 * message is never caused. An id is dropped once admitted, and all are forgotten at the next turn
 * that entered a step, since its claim took every waiting next-step message (or it was removed).
 * Read from the log, so a restart before that turn still knows them.
 *
 * State: { open, stepped, heartbeat, work, consecutive, compacted, caused, idleCompaction,
 *   lastEnd: {seq, time} | undefined }. `idleCompaction`: { id, ended } of the heartbeat's
 *   compaction between its start and the event right after its end, else undefined.
 */
export const initialTurns = () => ({ open: false, stepped: false, heartbeat: false, work: false, consecutive: 0, compacted: false, caused: [], idleCompaction: undefined, lastEnd: undefined })

const isHeartbeatNotice = source => source?.kind === SESSION.noticeSource && source.pluginId === NAMESPACE
const isWork = source => SESSION.workSources.includes(source?.kind) || source?.kind === SESSION.noticeSource
const opened = state => ({ ...state, open: true, stepped: false, heartbeat: false, work: false })
const injectedIds = data => data?.target !== SESSION.inboxNextStep ? []
  : (data.inserted ?? []).filter(message => message.source?.kind !== SESSION.userSource).map(message => message.id)

/** @returns the next state; `state` is not mutated. */
export function foldTurn(state, event) {
  const next = foldEvent(state, event)
  // The event right after the heartbeat compaction's end closes its window, whatever it is.
  return state.idleCompaction?.ended && next.idleCompaction === state.idleCompaction ? { ...next, idleCompaction: undefined } : next
}

function foldEvent(state, event) {
  switch (event.type) {
    case SESSION.turnStart:
      return opened(state)
    case SESSION.stepStart:
      return state.open ? { ...state, stepped: true } : state
    case SESSION.userMessage: {
      if (!state.open) return state
      const id = event.data?.id
      if (state.caused.includes(id)) return { ...state, caused: state.caused.filter(caused => caused !== id) }
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
        ...closed, consecutive: heartbeat ? state.consecutive + 1 : 0, compacted: heartbeat && state.compacted, caused: [],
        lastEnd: { seq: event.seq, time: event.time },
      }
    }
    case SESSION.compactionStart: {
      if (state.open) return state
      const idleCompaction = event.data?.sourceCommandId === undefined ? { id: event.data?.compactionId, ended: false } : undefined
      return { ...state, compacted: true, idleCompaction }
    }
    case SESSION.compactionEnd: {
      const running = state.idleCompaction
      return running && !running.ended && running.id === event.data?.compactionId ? { ...state, idleCompaction: { ...running, ended: true } } : state
    }
    case SESSION.inboxSpliced: {
      if (!state.idleCompaction?.ended) return state
      return { ...state, caused: [...state.caused, ...injectedIds(event.data)], idleCompaction: undefined }
    }
    default:
      return state
  }
}

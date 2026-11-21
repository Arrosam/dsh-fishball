import { LOG, NAMESPACE, SESSION, TEXT, TIME, dedupeKey } from './constants.js'
import { foldTurn, initialTurns } from './turns.js'

/** The heartbeat message: heading, focus (or its absence), and the closing focus instruction. */
export function heartbeatText({ position, limit, idleSeconds, focus }) {
  return [TEXT.heading(position, limit, idleSeconds), focus === '' ? TEXT.noFocus : TEXT.focus(focus), TEXT.closing].join(TEXT.separator)
}

/**
 * One manager agent's heartbeat timer, for the life of one X2 setup fiber.
 *
 * Rules (the user's requirements):
 * - every turn resets the timer: it is cleared at turn/start and armed at turn/end for
 *   `intervalSeconds` after that turn ended, so a heartbeat never lands inside an open turn;
 * - heartbeat turns in a row are counted (turns.js); at `maxConsecutive` no timer is armed and the
 *   cache cools until a real turn ends, which resets the count;
 * - a setup (restart, resume, row reload) rebuilds the state from the session log. A gap whose
 *   heartbeat is already overdue is not caught up: the provider cache measured from that turn has
 *   presumably expired, so a late heartbeat would pay a cold write for nothing. The next real turn
 *   re-arms it;
 * - a failed send is logged and not retried: the next turn re-arms it. Retrying on a timer would be
 *   a second schedule the user did not set;
 * - a timer that fires more than TIME.lateToleranceMs late (the machine slept) is dropped, the same
 *   rule as an overdue gap at restart.
 *
 * Wake batching (core, DESIGN §29): connector events reach Fishball as one turn per batch, after a
 * quiet window, or inside the step of the user's own message. Each such turn is still a turn here
 * (turn/start clears, turn/end re-arms), so batching only means fewer resets. Events still waiting
 * in core's quiet window are not a turn: the heartbeat may fire meanwhile, and the batch then
 * follows as its own real turn, or shares the heartbeat's turn and makes it real (turns.js).
 *
 * Known race: core's notify cannot be withdrawn. A turn the user starts between this timer firing
 * and core's followup leaves the heartbeat queued behind it, so it runs right after that turn.
 *
 * The timer is the platform's setTimeout, as core's reminders use: `ctx.timeout` needs the timer
 * service injected, which this row cannot require of every DSH it loads in.
 *
 * @param {object} options
 * @param {object} options.agentCtx - the X2 scope (`on`, `effect`); its disposal stops everything.
 * @param {object} options.session - the manager's Session (`id`, `snapshotEvents()`).
 * @param {{intervalSeconds: number, maxConsecutive: number}} options.config - the user's settings.
 * @param {(input: object) => Promise<unknown>} options.notify - X10 `manager.notify`.
 * @param {() => Promise<string>} options.readFocus - the saved focus ('' for none).
 * @param {{warn: Function}} options.logger
 * @param {() => number} options.now - epoch milliseconds; the session stamps events with Date.now.
 */
export function startHeartbeat({ agentCtx, session, config, notify, readFocus, logger, now }) {
  const intervalMs = config.intervalSeconds * TIME.millisecondsPerSecond
  let state = session.snapshotEvents().reduce(foldTurn, initialTurns())
  let timer
  let disposed = false
  // Bumped whenever the timer is cleared, so a send whose focus read outlived its gap is dropped.
  let generation = 0

  const clear = () => {
    generation += 1
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  async function fire(gap, end) {
    const late = now() - (end.time + intervalMs)
    if (late > TIME.lateToleranceMs) {
      logger.warn(LOG.lateDropped, late)
      return
    }
    let focus = ''
    try { focus = await readFocus() } catch (error) { logger.warn(LOG.focusUnreadable, error?.code ?? error?.name) }
    if (disposed || gap !== generation) return
    const idleSeconds = Math.round((now() - end.time) / TIME.millisecondsPerSecond)
    const text = heartbeatText({ position: state.consecutive + 1, limit: config.maxConsecutive, idleSeconds, focus })
    try {
      await notify({ pluginId: NAMESPACE, dedupeKey: dedupeKey(session.id, end.seq), text, wake: true })
    } catch (error) {
      logger.warn(LOG.notifyFailed, error?.code ?? error?.name)
    }
  }

  function arm() {
    clear()
    const end = state.lastEnd
    // No ended turn yet: nothing is cached to keep warm.
    if (disposed || state.open || end === undefined || state.consecutive >= config.maxConsecutive) return
    // Capped at the interval: a wall clock set back would otherwise ask for more than setTimeout's
    // limit, which Node replaces with 1 ms.
    const delay = Math.min(end.time + intervalMs - now(), intervalMs)
    if (delay <= 0) return
    const gap = generation
    timer = setTimeout(() => {
      timer = undefined
      void fire(gap, end)
    }, delay)
    // As core's reminder timer: a pending heartbeat never keeps a stopping process alive.
    timer.unref?.()
  }

  agentCtx.on(SESSION.event, (subject, event) => {
    if (subject !== session) return
    state = foldTurn(state, event)
    if (event.type === SESSION.turnStart) clear()
    else if (event.type === SESSION.turnEnd) arm()
  })
  agentCtx.effect(() => () => { disposed = true; clear() })
  arm()
}

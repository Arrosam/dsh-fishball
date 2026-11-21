/**
 * The UI's routes (docs/plugins/fishball-taskboard.md §4) on DSH's owner-only `connection.fetch`:
 * read the board, follow it (SSE), and save the user's edit. A save that changes the board wakes
 * Fishball once with a message saying what changed (§5): through core's `manager.notify` (X10),
 * which queues a `wake: true` notice as its own turn at once. It is not one of the link events
 * core's delivery list batches (DESIGN §29), so a user's edit is never held for the quiet window,
 * and its source is a plugin notice, so it pulls no waiting event batch into itself either.
 */
import { randomUUID } from 'node:crypto'
import { CODE, HOST, LOG, NAMESPACE, ROUTE } from './constants.js'
import { refusalValue, saveBoard, viewOf } from './board.js'
import { describeUserEdit } from './message.js'

const STATUS_OF = Object.freeze({
  [CODE.invalidInput]: ROUTE.status.badRequest,
  [CODE.limitReached]: ROUTE.status.badRequest,
  [CODE.stale]: ROUTE.status.conflict,
})

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: ROUTE.json })
/** A refusal's answer; a read that throws (a quarantined or closed domain) is `board-unavailable`, 503. */
const refused = (error, extra) => {
  const value = { ...refusalValue(error), ...extra }
  return json(STATUS_OF[value.code] ?? ROUTE.status.unavailable, value)
}

/** Core's manager, read per call: core may arrive, be replaced or leave while this row runs. */
function managerOf(ctx) {
  const instance = ctx.get(HOST.service)
  return instance?.apiVersion === HOST.apiVersion && typeof instance.manager?.notify === 'function' ? instance.manager : undefined
}

/**
 * Tell Fishball what the user changed. Never fails the save: the board is already committed, so a
 * missing or refusing core reads `notified: false` for the UI to show.
 */
async function wakeFishball(ctx, before, after) {
  const manager = managerOf(ctx)
  if (manager === undefined) return false
  try {
    await manager.notify({ pluginId: NAMESPACE, dedupeKey: HOST.userEditKey + randomUUID(), text: describeUserEdit(before, after), wake: true })
    return true
  } catch (error) {
    ctx.logger(NAMESPACE).warn(LOG.notifyFailed, error?.code ?? error?.name)
    return false
  }
}

/**
 * @param ctx - the row's context (`get`, `logger`, `connection`).
 * @param store - the row's store (store.js).
 * @param now - epoch milliseconds.
 * @returns {() => void} withdraws the routes and closes every open stream.
 */
export function registerRoutes(ctx, store, now = Date.now) {
  const streams = new Set()

  async function board(request) {
    if (request.method === ROUTE.get) {
      try { return json(ROUTE.status.ok, viewOf(store.read())) } catch (error) { return refused(error) }
    }
    let body
    try { body = await request.json() } catch { return json(ROUTE.status.badRequest, { ok: false, code: CODE.invalidInput }) }
    try {
      const { before, after } = await store.change((current) => ({ board: saveBoard(current, body, now()) }))
      const changed = after !== before
      return json(ROUTE.status.ok, { ok: true, revision: after.revision, changed, notified: changed && await wakeFishball(ctx, before, after) })
    } catch (error) {
      // `stale` names the current revision, so the UI knows the draft's base is behind.
      return refused(error, error?.code === CODE.stale ? { revision: store.read().revision } : {})
    }
  }

  function events(request) {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        // A stream the browser already closed throws on enqueue; close it so it never breaks a commit.
        const push = (current) => { try { controller.enqueue(encoder.encode(ROUTE.frame(JSON.stringify(viewOf(current))))) } catch { close() } }
        // The first frame reads the store, which throws once the domain is quarantined or closed.
        const first = () => { try { return store.read() } catch { return undefined } }
        const off = store.onChange(push)
        close = () => {
          if (!streams.delete(close)) return
          off()
          request.signal?.removeEventListener(ROUTE.abort, close)
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        streams.add(close)
        request.signal?.addEventListener(ROUTE.abort, close)
        const current = first()
        if (current === undefined) close()
        else push(current)
      },
      cancel: () => close(),
    })
    return new Response(body, { status: ROUTE.status.ok, headers: ROUTE.eventStream })
  }

  const disposers = []
  const dispose = async () => {
    for (const close of [...streams]) close()
    await Promise.all(disposers.splice(0).map((withdraw) => withdraw?.()))
  }
  try {
    for (const route of [
      { path: ROUTE.board, methods: [ROUTE.get, ROUTE.post], fetch: board },
      { path: ROUTE.events, methods: [ROUTE.get], fetch: events },
    ]) disposers.push(ctx.connection.fetch.register({ ...route, requestBody: ROUTE.requestBody }))
  } catch (error) {
    // A path another row claimed: withdraw what was registered, so no half-registered pair remains
    // (core asks/routes.js does the same).
    void dispose().catch(() => {})
    throw error
  }
  return dispose
}

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
import { saveBoard, unfinishedCount } from './board.js'
import { describeUserEdit } from './message.js'

const STATUS_OF = Object.freeze({
  [CODE.invalidInput]: ROUTE.status.badRequest,
  [CODE.limitReached]: ROUTE.status.badRequest,
  [CODE.stale]: ROUTE.status.conflict,
})

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: ROUTE.json })
/** What the UI reads: the document plus its unfinished count. */
export const viewOf = (board) => ({ revision: board.revision, unfinished: unfinishedCount(board), tasks: board.tasks, memos: board.memos })

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
    if (request.method === ROUTE.get) return json(ROUTE.status.ok, viewOf(store.read()))
    let body
    try { body = await request.json() } catch { return json(ROUTE.status.badRequest, { ok: false, code: CODE.invalidInput }) }
    try {
      const { before, after } = await store.change((current) => ({ board: saveBoard(current, body, now()) }))
      const changed = after !== before
      return json(ROUTE.status.ok, { ok: true, revision: after.revision, changed, notified: changed && await wakeFishball(ctx, before, after) })
    } catch (error) {
      const code = Object.values(CODE).includes(error?.code) ? error.code : CODE.unavailable
      const value = { ok: false, code, ...(error?.field === undefined ? {} : { field: error.field }), ...(code === CODE.stale ? { revision: store.read().revision } : {}) }
      return json(STATUS_OF[code] ?? ROUTE.status.unavailable, value)
    }
  }

  function events(request) {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        // A stream the browser already closed throws on enqueue; close it so it never breaks a commit.
        const push = (current) => { try { controller.enqueue(encoder.encode(ROUTE.frame(JSON.stringify(viewOf(current))))) } catch { close() } }
        const off = store.onChange(push)
        close = () => {
          if (!streams.delete(close)) return
          off()
          request.signal?.removeEventListener(ROUTE.abort, close)
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        streams.add(close)
        request.signal?.addEventListener(ROUTE.abort, close)
        push(store.read())
      },
      cancel: () => close(),
    })
    return new Response(body, { status: ROUTE.status.ok, headers: ROUTE.eventStream })
  }

  const withdraw = [
    ctx.connection.fetch.register({ path: ROUTE.board, methods: [ROUTE.get, ROUTE.post], requestBody: ROUTE.requestBody, fetch: board }),
    ctx.connection.fetch.register({ path: ROUTE.events, methods: [ROUTE.get], requestBody: ROUTE.requestBody, fetch: events }),
  ]
  return () => {
    for (const close of [...streams]) close()
    return Promise.all(withdraw.map((dispose) => dispose?.()))
  }
}

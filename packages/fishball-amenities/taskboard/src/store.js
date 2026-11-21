/**
 * The board's storage (docs/plugins/fishball-taskboard.md §2): the global value of DSH's storage
 * domain `fishball_taskboard`, so it survives restarts and each change is one durable write. One store per
 * row: Fishball's tools and the user's saves share its queue, so a change always starts from the
 * board the previous one committed. The domain validates the stored record when it opens
 * (assertDocument), so a damaged board fails loudly instead of reading as empty.
 */
import { CODE, STORE } from './constants.js'
import { assertDocument, emptyBoard, refusal } from './board.js'

/** zod's `safeParse` shape over a throwing parser: defineDomain probes a global schema with it. */
const safeParseOf = (parse) => (value) => {
  try { return { success: true, data: parse(value) } } catch (error) { return { success: false, error } }
}

/**
 * @param ctx - the row's context with `ctx.storage.domain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain}` of `@deepseek-ai/dsh-storage-domain`.
 * @returns {Promise<{read(): object, change(fn): Promise<{before, after, result}>, onChange(fn): () => void, close(): Promise<void>}>}
 *   `read` is synchronous; `change(fn)` runs `fn(board)` → `{board, ...result}` in the queue and
 *   commits `board` unless it is the same object (a no-op); `onChange(fn)` is called with the
 *   committed board after each commit.
 */
export async function openStore(ctx, { defineDomain }) {
  // No table: the whole board is the domain's one global value. `assertDocument` refuses `null`, as
  // defineDomain requires of a global schema (null is the medium's "never written" sentinel).
  const domain = await ctx.storage.domain.open(defineDomain({
    name: STORE.domain,
    version: STORE.version,
    global: { schema: { parse: assertDocument, safeParse: safeParseOf(assertDocument) }, initial: emptyBoard() },
    tables: {},
  }))
  const listeners = new Set()
  let tail = Promise.resolve()
  const read = () => domain.global.get()

  function change(fn) {
    const result = tail.then(async () => {
      const before = read()
      const { board: after, ...rest } = fn(before)
      if (after === before) return { before, after, result: rest }
      try { await domain.global.set(after) } catch (error) { throw refusal(CODE.unavailable, undefined, error) }
      for (const listener of listeners) {
        try { listener(after) } catch { /* a listener (an SSE stream) never fails a commit */ }
      }
      return { before, after, result: rest }
    })
    tail = result.catch(() => {})
    return result
  }

  return Object.freeze({
    read,
    change,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    close: () => domain.close(),
  })
}

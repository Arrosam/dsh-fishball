/**
 * The board's storage (docs/plugins/fishball-taskboard.md §2): the global value of DSH's storage
 * domain `fishball_taskboard`, so it survives restarts and each change is one durable write. One store per
 * row: Fishball's tools and the user's saves share its queue, so a change always starts from the
 * board the previous one committed. The domain validates the stored record when it opens
 * (assertDocument), so a damaged board fails loudly instead of reading as empty.
 */
import { CODE, STORE } from './constants.js'
import { assertDocument, emptyBoard, refusal } from './board.js'
import { assertStored, compactUndoNotes, snapshotOf } from './auto-state.js'

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
  const legacy = { name: STORE.domain, version: STORE.version, tables: {},
    global: { schema: { parse: assertDocument, safeParse: safeParseOf(assertDocument) }, initial: emptyBoard() } }
  const envelope = defineDomain({ ...legacy, version: STORE.envelopeVersion, compatibleVersions: [STORE.version],
    global: { schema: { parse: assertStored, safeParse: safeParseOf(assertStored) }, initial: emptyBoard() } })
  let automation = envelope.compatibleVersions?.includes(STORE.version) === true
  const open = (spec) => ctx.storage.domain.open(spec)
  let domain
  if (automation) {
    try { domain = await open(envelope) }
    catch (error) {
      // Old backends may reject the declared compatibility. Opening as v1 still validates the
      // version stamp and full board; corruption and unknown versions are never replaced.
      if (error?.code !== 'version-mismatch') throw error
      automation = false
    }
  }
  if (!automation) domain = await open(defineDomain(legacy))
  const listeners = new Set()
  const autoListeners = new Set()
  let tail = Promise.resolve()
  let writesUncertain = false
  let auditVersion = 0
  const auditFrame = () => ({ revision: read().revision, auditVersion })
  const readAuto = () => snapshotOf(domain.global.get())
  const read = () => readAuto().board
  const emit = (subscribers, value) => {
    for (const listener of subscribers) {
      try { listener(value) } catch { /* a page listener never fails a commit */ }
    }
  }
  const subscribe = (subscribers, fn) => { subscribers.add(fn); return () => subscribers.delete(fn) }

  function change(fn) {
    const result = tail.then(async () => {
      if (writesUncertain) throw refusal(CODE.unavailable)
      const { board: before, auto } = readAuto()
      const { board: after, auto: proposed = auto, ...rest } = await fn(before, auto)
      const next = after === before ? proposed : compactUndoNotes(proposed, after.revision)
      if (after === before && next === auto) return { before, after, result: rest }
      if (!automation && next !== auto) throw refusal(CODE.unavailable)
      try { await domain.global.set(automation ? { board: after, auto: next } : after) }
      catch (error) {
        // A JSON backend may publish a rename and then fail fsync. Reload rather than
        // writing another snapshot from an old in-memory receipt or board revision.
        writesUncertain = true
        auditVersion += 1
        emit(autoListeners, { revision: before.revision, auditVersion })
        throw refusal(CODE.unavailable, undefined, error)
      }
      if (after !== before) emit(listeners, after)
      if (next !== auto) {
        auditVersion += 1
        emit(autoListeners, { revision: after.revision, auditVersion })
      }
      return { before, after, result: rest }
    })
    tail = result.catch(() => {})
    return result
  }

  return Object.freeze({
    read, readAuto, auditFrame, automation,
    canWrite: () => !writesUncertain,
    change,
    onChange: (fn) => subscribe(listeners, fn),
    onAutoChange: (fn) => subscribe(autoListeners, fn),
    close: () => domain.close(),
  })
}

/**
 * B4: the manager-only `board_write` and `board_read` tools (board design §3.2, §4; U19 §12.6).
 *
 * Contract:
 * - Both tools answer `{ok: true, ...}` or a typed `{ok: false, code}`; they never throw.
 *   `board-unavailable` also carries the store's `outcome`: `interrupted-write` means the
 *   archive may hold a snapshot that the board does not, so it must NOT be reported as "nothing
 *   changed" (B3 cannot make archive+board crash-atomic).
 * - The caller is checked against X1 `manager.sessionId()` at execution time, before any
 *   store access. Registration in the manager scope (X2) is the first check; this is the second.
 * - `board_write` validates the WHOLE call inside ONE `store.transact` callback and returns the
 *   complete candidate array, or throws before any disk mutation. Clears are omissions from that
 *   array: never `store.clear` followed by `transact`, which would commit a partial call.
 * - Omitted Done/Dropped cards are kept; an omitted open card is refused by the store
 *   (`card-missing`). The store also enforces the card cap (`board-full`) before writing.
 *
 * B2 owns transitions and link rules, B3 owns persistence, projection and archive lookup.
 * Pending user decisions are marked PENDING; their provisional behaviour fails closed.
 */
import { randomBytes } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { BOARD_LIMITS, REFUSAL, STATUS } from './constants.js'
import { newId, parseRef } from './ids.js'
import { isOpen, transitionCard, validateLinks } from './transitions.js'
import { isClosed, unavailable } from './archive.js'

const BOARD_TOOL = Object.freeze({
  write: 'board_write',
  read: 'board_read',
  writeKeys: Object.freeze(['id', 'title', 'status', 'note', 'waitingOn', 'links']),
  clearKeys: Object.freeze(['id', 'clear']),
  readKeys: Object.freeze(['includeClosed']),
  linkKeys: Object.freeze(['to', 'relation']),
  writeArgs: Object.freeze(['cards']),
  boardKind: 'board',
  titleMinChars: 1,
  idSuffixBytes: 3,
  idSuffixEncoding: 'hex',
  // Storage requires a string note and a links array; a new card without them starts empty.
  createDefaults: () => ({ note: '', links: [] }),
})

const TEXT = Object.freeze({
  write: 'Write the persistent work board: the COMPLETE list of open cards (todo, in_progress, waiting, paused); leaving an open card out refuses the call. Done and dropped cards may be left out and keep their state. Without id: a new card (an open status). With id: that card (reopening works for a card off the board). {id, clear: true} takes a done or dropped card off the board now; it stays archived. One invalid item refuses the whole call and changes nothing. Use todo_write for the steps of one turn.',
  cards: 'Every open card, plus any closed card to change or clear.',
  id: 'The card id (bd_…); omit for a new card.',
  title: 'Short title, unique among open cards.',
  status: 'todo | in_progress | waiting | paused | done | dropped.',
  note: 'The latest note only (no history).',
  waitingOn: 'Required exactly when status is waiting: user, or ses:<sessionId>.',
  links: 'At most 8: {to: ses:<id>, relation: about}, {to: ev:<seq>, relation: source}, {to: bd_<id>, relation: blocks}.',
  clear: 'true: take this done or dropped card off the board now; it stays archived.',
  read: 'Read the work board in full. Open cards only unless includeClosed is true (then also done and dropped cards still on the board).',
  includeClosed: 'Also return done and dropped cards still on the board.',
  written: counts => `Updated board: ${counts.todo} to do, ${counts.inProgress} in progress, ${counts.waiting} waiting, ${counts.paused} paused, ${counts.done} done, ${counts.dropped} dropped.`,
})

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasOnly = (record, keys) => Object.keys(record).every(key => keys.includes(key))
const refuse = code => { throw Object.assign(new Error(code), { code }) }
const refused = code => ({ ok: false, code })
const optional = (value, type) => value === undefined || typeof value === type

/**
 * PENDING user decision (title/note Unicode): "chars" is unspecified (UTF-16 units, code points
 * or graphemes). UTF-16 length is the LARGEST of the three counts, so using it never stores a
 * text over the bound under any reading; it may refuse some astral/combining text a looser
 * reading would accept. Replace only this function when the unit is decided.
 */
const textLength = text => text.length

// Trimming and exact equality follow todo_write's `content` rule, which the design names for
// titles (§3). No case folding or Unicode normalization is applied (PENDING confirmation).
const canonicalTitle = title => title.trim()

/** Pure shape and field-bound check of one item; state-dependent checks happen in the transact. */
function parseItem(raw) {
  if (!isRecord(raw)) refuse(REFUSAL.invalidInput)
  if (Object.hasOwn(raw, 'clear')) {
    // Only the U19 form {id, clear: true} is defined; anything else is not a clear request.
    if (!hasOnly(raw, BOARD_TOOL.clearKeys) || raw.clear !== true || typeof raw.id !== 'string') refuse(REFUSAL.invalidInput)
    return { id: raw.id, clear: true }
  }
  const { id, title, status, note, waitingOn, links } = raw
  if (!hasOnly(raw, BOARD_TOOL.writeKeys) || !optional(id, 'string') || typeof title !== 'string' ||
      !Object.values(STATUS).includes(status) || !optional(note, 'string') || !optional(waitingOn, 'string')) {
    refuse(REFUSAL.invalidInput)
  }
  const trimmed = canonicalTitle(title)
  if (textLength(trimmed) < BOARD_TOOL.titleMinChars || textLength(trimmed) > BOARD_LIMITS.titleChars ||
      (note !== undefined && textLength(note) > BOARD_LIMITS.noteChars)) refuse(REFUSAL.invalidInput)
  // §3: waitingOn is required exactly when status is waiting, so a supplied target with another
  // status is refused instead of silently dropped. B2 checks the target's value and presence.
  if (waitingOn !== undefined && status !== STATUS.waiting) refuse(REFUSAL.waitingTarget)
  // §3.1 links are exactly {to, relation}; B2 checks their values, count and graph.
  if (links !== undefined && (!Array.isArray(links) ||
      links.some(link => !isRecord(link) || !hasOnly(link, BOARD_TOOL.linkKeys)))) refuse(REFUSAL.linkInvalid)
  const changes = { title: trimmed, status }
  if (note !== undefined) changes.note = note
  if (waitingOn !== undefined) changes.waitingOn = waitingOn
  if (links !== undefined) changes.links = links
  return { id, changes }
}

function parseWrite(args) {
  if (!isRecord(args) || !hasOnly(args, BOARD_TOOL.writeArgs) || !Array.isArray(args.cards)) refuse(REFUSAL.invalidInput)
  const items = args.cards.map(parseItem)
  // PENDING confirmation: one card named by two items is ambiguous, so the call is refused.
  const ids = items.filter(item => item.id !== undefined).map(item => item.id)
  if (new Set(ids).size !== ids.length) refuse(REFUSAL.invalidInput)
  return items
}

// Key order differs between a stored card and a fresh transition, so compare sorted keys.
const sortedKeys = value => Array.isArray(value) ? value.map(sortedKeys)
  : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedKeys(value[key])])) : value
const withoutTime = card => JSON.stringify(sortedKeys({ ...card, updatedAt: undefined }))

/** §12.6 writes a snapshot "at each change": an item that changes nothing keeps its card as is. */
const unchangedOr = (previous, next) => withoutTime(previous) === withoutTime(next) ? previous : next

/**
 * Mint one id. PENDING user decision (clock/collision): no retry, monotonic-clock or collision
 * code is specified. A collision with any known id (board, this call or archive) fails the whole
 * call with an uncoded error, which the store reports as `board-unavailable` with nothing written.
 */
async function mintId(at, taken) {
  const id = newId(at, randomBytes(BOARD_TOOL.idSuffixBytes).toString(BOARD_TOOL.idSuffixEncoding))
  if (await taken(id)) throw new Error('board id collision')
  return id
}

/** Every changed card's board-link targets that are not in the candidate (archived cards). */
async function linkGraph(next, changed, getCard) {
  const graph = [...next]
  for (const card of changed) {
    for (const link of card.links ?? []) {
      const ref = parseRef(link?.to)
      if (ref?.kind !== BOARD_TOOL.boardKind || graph.some(candidate => candidate.id === ref.id)) continue
      const target = await getCard(ref.id)
      if (target) graph.push(target)
    }
  }
  return graph
}

/**
 * The transact callback: resolves every item against the board (then the archive), applies B2,
 * and validates titles and links over the resolved candidate before returning it.
 */
function planWrite(items, now) {
  return async ({ cards, getCard }) => {
    const at = now()
    const board = new Map(cards.map(card => [card.id, card]))
    const resolved = new Map()
    const changed = []
    const find = async id => board.get(id) ?? await getCard(id)
    for (const item of items) {
      if (item.id === undefined) {
        const id = await mintId(at, async candidate => board.has(candidate) || resolved.has(candidate) || Boolean(await getCard(candidate)))
        const card = transitionCard(undefined, { id, ...BOARD_TOOL.createDefaults(), ...item.changes }, at)
        resolved.set(id, card)
        changed.push(card)
        continue
      }
      const previous = await find(item.id)
      if (!previous) refuse(REFUSAL.unknownCard)
      if (item.clear) {
        if (!isClosed(previous)) refuse(REFUSAL.notClosed)
        resolved.set(item.id, null)
        continue
      }
      const card = unchangedOr(previous, transitionCard(previous, item.changes, at))
      resolved.set(item.id, card)
      if (card !== previous) changed.push(card)
    }
    // Keep the board's order, then new cards and changed archive cards in item order. An unchanged
    // off-board card is not put back, so restating an early-cleared card cannot undo its clear;
    // only a change (reopen) brings it back (§12.6). PENDING: a changed but still closed off-board
    // card returns while its 30-day window lasts, because B3 archives only candidate cards and
    // leaving it out would silently lose the edit.
    const next = cards.map(card => resolved.has(card.id) ? resolved.get(card.id) : card)
    for (const card of changed) if (!board.has(card.id)) next.push(card)
    // §3.2: B3 would keep an omitted open card in our candidate, so omission is checked here,
    // after the items (PENDING: the precedence between item codes and card-missing).
    if (cards.some(card => isOpen(card.status) && !resolved.has(card.id))) refuse(REFUSAL.cardMissing)
    const candidate = next.filter(Boolean)
    const openTitles = candidate.filter(card => isOpen(card.status)).map(card => card.title)
    if (new Set(openTitles).size !== openTitles.length) refuse(REFUSAL.duplicateTitle)
    const graph = await linkGraph(candidate, changed, getCard)
    for (const card of changed) {
      const code = validateLinks(card, graph)
      if (code) refuse(code)
    }
    return candidate
  }
}

const counts = cards => Object.fromEntries(Object.entries(STATUS)
  .map(([key, status]) => [key, cards.filter(card => card.status === status).length]))

function failure(error) {
  const code = error?.code
  if (code === REFUSAL.boardUnavailable) return { ok: false, code, outcome: error.outcome }
  if (Object.values(REFUSAL).includes(code)) return refused(code)
  // Only work before the store call can throw uncoded here; the store codes all of its own.
  const wrapped = unavailable(error)
  return { ok: false, code: wrapped.code, outcome: wrapped.outcome }
}

// The registry rejects schema violations before execute, with its own error rather than this
// tool's typed refusals. The schema therefore only documents the fields (type `json`), and
// parseWrite/parseItem enforce them, so every malformed item is refused `invalid-input` (or its
// specific code) through the same whole-call path.
const FIELD = description => ({ type: 'json', description })
const JSON_OUTPUT = Object.freeze({ type: 'json' })
const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]

const ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: true,
  properties: {
    id: FIELD(TEXT.id), title: FIELD(TEXT.title), status: FIELD(TEXT.status), note: FIELD(TEXT.note),
    waitingOn: FIELD(TEXT.waitingOn), links: FIELD(TEXT.links), clear: FIELD(TEXT.clear),
  },
})

/**
 * Build the two tool definitions.
 * @param {{openStore: () => object, sessionId: () => string | undefined, now?: () => number}} options
 *   `openStore` returns the row's single B3 store (the caller memoizes it, so all manager setups
 *   share one write queue); `sessionId` is X1; `now` gives epoch milliseconds and must be the
 *   store's clock too.
 * @returns {object[]} registry-ready definitions for `agentCtx.tools.register`.
 */
export function createBoardTools({ openStore, sessionId, now = Date.now }) {
  const isManager = exec => {
    const manager = sessionId()
    return typeof manager === 'string' && manager !== '' && String(exec?.agent?.session?.id) === manager
  }
  const guarded = work => async (args, exec) => {
    if (!isManager(exec)) return refused(REFUSAL.notManager)
    try { return await work(args) } catch (error) { return failure(error) }
  }
  return [
    defineTool({
      name: BOARD_TOOL.write,
      description: TEXT.write,
      parameters: { cards: { type: 'array', required: true, items: ITEM_SCHEMA, description: TEXT.cards } },
      output: {
        schema: JSON_OUTPUT,
        render: (args, value) => value.ok ? [{ type: 'text', text: TEXT.written(value.counts) }] : renderJson(args, value),
      },
      execute: guarded(async args => {
        const items = parseWrite(args)
        // B3 projects with its own clock read; index.js injects the same `now` into both.
        const result = await openStore().transact(planWrite(items, now))
        return {
          ok: true,
          cards: result.cards.map(({ id, title, status }) => ({ id, title, status })),
          counts: counts(result.cards),
        }
      }),
    }),
    defineTool({
      name: BOARD_TOOL.read,
      description: TEXT.read,
      parameters: { includeClosed: FIELD(TEXT.includeClosed) },
      output: { schema: JSON_OUTPUT, render: renderJson },
      execute: guarded(async args => {
        if (!isRecord(args) || !hasOnly(args, BOARD_TOOL.readKeys) || !optional(args.includeClosed, 'boolean')) {
          refuse(REFUSAL.invalidInput)
        }
        const { cards } = await openStore().read()
        return { ok: true, cards: args.includeClosed ? cards : cards.filter(card => isOpen(card.status)) }
      }),
    }),
  ]
}

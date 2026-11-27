import { defineTool } from '@deepseek-ai/dsh-tools'
import { BOARD_LIMITS, CONTEXT_ORDER, REFUSAL, STATUS } from './constants.js'
import { createBoardGuard } from './board.js'

const SEARCH = Object.freeze({
  name: 'board_search',
  sectionName: 'fishball-board-search',
  keys: Object.freeze(['query', 'status', 'limit']),
  fields: Object.freeze(['title', 'note']),
  first: 0,
  absent: -1,
})
const TEXT = Object.freeze({
  guide: 'Use board_search to find past work by a literal title/note keyword, including old or cleared cards. Optional status filters the historical snapshot; limit bounds the results. Each hit is the newest matching snapshot, not necessarily the current card. onBoard indicates current visibility. Search does not put cards back on the board. A truncated result omits further matching cards.',
  description: 'Search permanent board history, including cleared and old off-board cards. Literal case-insensitive title/note matching; one newest matching snapshot per card, ordered by updatedAt then archive line descending. Results are historical, not necessarily current. Does not change board visibility.',
  query: 'Required string, trimmed, 1–200 Unicode code points. Literal substring, not a regex.',
  status: 'Optional single status: todo, in_progress, waiting, paused, done, dropped. Filters the historical matching snapshot.',
  limit: 'Optional integer 1–50; default 20. More distinct matching cards sets truncated.',
})
const FIELD = description => ({ type: 'json', description })
const invalid = () => { throw Object.assign(new Error(REFUSAL.invalidInput), { code: REFUSAL.invalidInput }) }

function parseSearch(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some(key => !SEARCH.keys.includes(key)) || typeof args.query !== 'string') invalid()
  const query = args.query.trim()
  const length = [...query].length
  const limit = args.limit === undefined ? BOARD_LIMITS.search.limitDefault : args.limit
  if (length < BOARD_LIMITS.search.queryMinChars || length > BOARD_LIMITS.search.queryMaxChars ||
      (args.status !== undefined && !Object.values(STATUS).includes(args.status)) ||
      !Number.isInteger(limit) || limit < BOARD_LIMITS.search.limitMin || limit > BOARD_LIMITS.search.limitMax) invalid()
  return { query, status: args.status, limit }
}

const newestFirst = (left, right) => right.card.updatedAt - left.card.updatedAt || right.archiveLine - left.archiveLine

/**
 * §12.7: only top `limit` snapshots are retained; there is no all-id set or archive buffer.
 * R3: select each id's hit by the same updatedAt/line ordering as results, even after
 * clock rollback. The cutoff can therefore only improve during the scan.
 * B3 still materialises a giant individual line and rejects interrupted-write mismatches;
 * this tool does not repair those limits or turn a failed scan into partial success.
 */
async function search(store, { query, status, limit }, signal) {
  const needle = query.toLowerCase()
  const results = []
  let truncated = false
  signal?.throwIfAborted()
  await store.scanArchive(({ card, archiveLine, onBoard }) => {
    signal?.throwIfAborted()
    if (status !== undefined && card.status !== status) return
    const matchedFields = SEARCH.fields.filter(field => card[field].toLowerCase().includes(needle))
    if (!matchedFields.length) return
    const hit = { card, archiveLine, matchedFields, onBoard }
    const existing = results.findIndex(result => result.card.id === card.id)
    if (existing !== SEARCH.absent) {
      if (newestFirst(hit, results[existing]) >= SEARCH.first) return
      results[existing] = hit
    } else {
      if (results.length === limit) {
        // A matching id outside a full top set proves more than limit distinct ids exist.
        truncated = true
        if (newestFirst(hit, results.at(SEARCH.absent)) >= SEARCH.first) return
        results.pop()
      }
      results.push(hit)
    }
    results.sort(newestFirst)
  })
  // B3 has no abortable byte reader; cancellation is cooperative at snapshot boundaries.
  signal?.throwIfAborted()
  // Completion, not the last callback, certifies B3's stable committed boundary.
  return { ok: true, query, results, truncated }
}

/**
 * X2 owns disposal; search guidance stays available even when board context injection is off.
 * A search-owned section leaves B5's full board guide independently registerable.
 */
export function registerBoardSearch(agentCtx, options) {
  agentCtx.systemPrompt.section({ name: SEARCH.sectionName, order: CONTEXT_ORDER.guide, text: TEXT.guide })
  agentCtx.tools.register(createBoardSearch(options))
}

/** Manager-scoped definition; the shared guard runs before validation or store access. */
export function createBoardSearch({ openStore, sessionId }) {
  return defineTool({
    name: SEARCH.name,
    description: TEXT.description,
    parameters: { query: FIELD(TEXT.query), status: FIELD(TEXT.status), limit: FIELD(TEXT.limit) },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args, exec) => createBoardGuard(sessionId)(async input => {
      const parsed = parseSearch(input)
      exec?.signal?.throwIfAborted()
      return search(openStore(), parsed, exec?.signal)
    })(args, exec),
  })
}

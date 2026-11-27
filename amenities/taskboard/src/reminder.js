import { HOST, LOG, MEMO_CONTEXT, NAMESPACE } from './constants.js'
import { codePoints, unfinishedCount } from './board.js'

function renderMemos(board, compactionSeq) {
  if (board.memos.length === 0) return MEMO_CONTEXT.absent
  const memos = board.memos.toReversed().sort((a, b) => b.createdAt - a.createdAt)
  // DSH deduplicates identical snapshots. Include the compaction marker so a retained
  // snapshot from an earlier compaction cannot suppress the current one.
  let text = MEMO_CONTEXT.header(unfinishedCount(board), compactionSeq)
  let size = codePoints(text)
  let bounded = text + MEMO_CONTEXT.omitted(memos.length)
  for (const [index, memo] of memos.entries()) {
    const entry = MEMO_CONTEXT.entry(memo.text, codePoints(memo.text))
    size += codePoints(entry)
    if (size > MEMO_CONTEXT.maxChars) break
    text += entry
    const suffix = MEMO_CONTEXT.omitted(memos.length - index - 1)
    if (size + codePoints(suffix) <= MEMO_CONTEXT.maxChars) bounded = text + suffix
  }
  return bounded
}

const completed = (event) => event.type === HOST.compactionEnd && event.data?.error === undefined

function pendingCompaction(session) {
  // If setup is recreated between compaction and the next request, recover the trigger
  // from the journal. A settled model attempt is the durable evidence of a dispatch.
  const boundary = session.snapshotEvents().findLast(event => completed(event) || HOST.settledAttempt.includes(event.type))
  return boundary && completed(boundary) ? boundary.seq : undefined
}

/** Restore the board once, on the manager's first model request after a successful compaction. */
export function registerReminder(agentCtx, live, store) {
  let pending = pendingCompaction(live.session)
  let warned
  agentCtx.on(HOST.sessionEvent, (session, event) => {
    if (session === live.session && completed(event)) pending = event.seq
  })
  // Required context survives Fishball's optional-context suppression and is refreshed after
  // automatic compaction. Only dispatch consumes it, not diagnostic or speculative assembly.
  agentCtx.systemPrompt.context({
    name: MEMO_CONTEXT.name,
    order: MEMO_CONTEXT.order,
    required: true,
    interpolate: false,
    text: ({ signal }) => {
      if (pending === undefined || !signal || signal.aborted) return MEMO_CONTEXT.absent
      let board
      try { board = store.read() }
      catch {
        // Quarantined board storage must not prevent the manager's model request.
        if (warned !== pending) {
          warned = pending
          agentCtx.logger(NAMESPACE).warn(LOG.reminderUnavailable)
        }
        return MEMO_CONTEXT.absent
      }
      return renderMemos(board, pending)
    },
  })
  agentCtx.on(HOST.assistantStream, ({ agent, frame }) => {
    if (agent === live && frame.type === HOST.streamStart) pending = undefined
  })
}

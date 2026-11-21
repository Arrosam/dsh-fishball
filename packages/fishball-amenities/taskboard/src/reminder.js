/**
 * The compaction reminder (docs/plugins/fishball-taskboard.md §6): after each successful compaction
 * of Fishball's context, if the board has unfinished tasks, one short line is queued into Fishball's
 * context with `agent.inject`, which never wakes Fishball by itself: the line reaches the next model
 * step, so a compaction in the middle of a turn reminds that same turn, and an idle compaction (the
 * `/compact` command) reminds the next one. A compaction drops the earlier turns that held the board,
 * which is why the reminder comes after it and not on a timer.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { HOST } from './constants.js'
import { unfinishedCount } from './board.js'

const TEXT = Object.freeze({
  reminder: (count) => `Reminder: your task board still has ${count} unfinished task${count === 1 ? '' : 's'}; call taskboard_read to see them.`,
})

/**
 * @param ctx - the row's context; session events are emitted on it.
 * @param store - the row's store (store.js).
 * @returns {{watch(live): () => void}} `watch` follows one live manager agent (`{session, inject}`,
 *   X2's second argument) until its disposer runs.
 */
export function createReminder(ctx, store) {
  const agents = new Set()
  ctx.effect(() => ctx.on(HOST.sessionEvent, (session, event) => {
    // A failed compaction keeps the old context, so nothing was forgotten (`error`, dsh-compaction).
    if (event?.type !== HOST.compactionEnd || event.data?.error !== undefined) return
    const count = unfinishedCount(store.read())
    if (count === 0) return
    for (const live of agents) {
      if (live.session !== session) continue
      live.inject(createUserMessage({ content: [{ type: HOST.textBlock, text: TEXT.reminder(count) }], source: HOST.noticeSource }))
    }
  }))
  return Object.freeze({
    watch(live) {
      agents.add(live)
      return () => agents.delete(live)
    },
  })
}

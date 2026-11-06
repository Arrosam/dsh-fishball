/**
 * The child's durable decision record (T08, §8.1): Fishball's settled decision labels and the
 * "card closed" rows its chat shows.
 *
 * The labels live in Fishball's own timeline (src/slim/child/approvals.js builds them; the page
 * renders them inline), and the child stops with the main DSH (Q12), so a restart must not empty
 * that history: the user asked for cards and their decisions never to expire. This module owns
 * the one file that keeps them, beside the child's chat record and image index under its own home:
 * - <child home>/fishball/decisions.json, mode 0600, written with a temporary file and a rename
 *   (the same atomic pattern src/slim/child/chat.js and images.js use), so a crash leaves either
 *   the previous or the next record and never half of one;
 * - writes are queued and never awaited by a decision (a label must not wait on a disk write),
 *   and a failed write is diagnostic only: the labels stay right for this run;
 * - the read refuses a file over its byte cap and ignores entries this code cannot read, so a
 *   corrupt record can only lose the history, never the running chat.
 *
 * The caps stay the caller's (APPROVALS.limits): a loaded record is truncated to them, so the
 * page cannot be handed more rows than a fresh process would keep.
 */
import path from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

/** Where and how the record is kept; the numbers are storage, not behaviour (chat.js's record). */
export const DECISIONS_FILE = Object.freeze({
  directory: 'fishball',
  file: 'decisions.json',
  directoryMode: 0o700,
  fileMode: 0o600,
  maxBytes: 4 * 1024 * 1024,
})

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** One label this code can render: its id and kind are the only fields the page depends on. */
const isLabel = (value) => isRecord(value) && typeof value.decisionId === 'string' && value.decisionId !== '' && typeof value.kind === 'string'

/** One closure row; the page shows its reason and time. */
const isClosed = (value) => isRecord(value) && typeof value.approvalId === 'string' && value.approvalId !== ''

/**
 * The child's one decision store.
 *
 * @param options.home - the child's own DSH home (absolute; src/slim/child/chat.js uses the same).
 * @param options.limits - the caller's caps { labels, closed }.
 * @param options.logger - optional; a failed read or write is reported, never thrown at a decision.
 */
export function createDecisionStore({ home, limits, logger } = {}) {
  if (typeof home !== 'string' || !path.isAbsolute(home)) throw new TypeError('fishball decisions: the child profile home is required')
  const caps = { labels: Number.isSafeInteger(limits?.labels) ? limits.labels : 0, closed: Number.isSafeInteger(limits?.closed) ? limits.closed : 0 }
  const filePath = path.join(home, DECISIONS_FILE.directory, DECISIONS_FILE.file)
  /** The queued write; a new save replaces the pending one (the newest state is the one to keep). */
  let saving = Promise.resolve()

  /** Read the last record; an absent, oversized or malformed file is an empty history. */
  async function load() {
    let raw
    try {
      raw = await readFile(filePath, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') logger?.warn('the decision record could not be read (%s)', String(error?.code ?? error))
      return { labels: [], closed: [] }
    }
    if (raw.length > DECISIONS_FILE.maxBytes) {
      logger?.warn('the decision record is too large; it is ignored')
      return { labels: [], closed: [] }
    }
    let parsed
    try { parsed = JSON.parse(raw) } catch {
      logger?.warn('the decision record is not JSON; it is ignored')
      return { labels: [], closed: [] }
    }
    if (!isRecord(parsed)) return { labels: [], closed: [] }
    const labels = (Array.isArray(parsed.labels) ? parsed.labels : []).filter(isLabel).slice(0, caps.labels)
    const closed = (Array.isArray(parsed.closed) ? parsed.closed : []).filter(isClosed).slice(0, caps.closed)
    return { labels, closed }
  }

  /**
   * Queue one atomic rewrite of the whole record. Never awaited by a caller: the returned promise
   * is the queue's tail, and its failure is logged here.
   * @param document - { labels: [], closed: [] }, already in display order and within the caps.
   */
  function save(document) {
    // Keep the record inside the cap load() accepts, newest first: a record that grew past it would
    // be ignored whole, so the oldest labels leave instead. Labels arrive oldest first.
    let labels = [...document.labels]
    const closed = [...document.closed]
    let body = JSON.stringify({ labels, closed }) + '\n'
    while (body.length > DECISIONS_FILE.maxBytes && labels.length > 0) {
      labels = labels.slice(Math.ceil(labels.length / 4))
      body = JSON.stringify({ labels, closed }) + '\n'
    }
    saving = saving.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true, mode: DECISIONS_FILE.directoryMode })
      const temp = filePath + '.tmp'
      await writeFile(temp, body, { mode: DECISIONS_FILE.fileMode })
      await rename(temp, filePath)
    }).catch((error) => {
      logger?.warn('the decision record could not be written (%s)', String(error?.code ?? error))
    })
    return saving
  }

  return Object.freeze({ load, save })
}

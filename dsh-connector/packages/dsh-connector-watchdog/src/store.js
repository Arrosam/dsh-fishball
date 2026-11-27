/**
 * The briefs, persisted (the user, 2026-11-20: "Yes, persist them per session"). One JSON file
 * `<home>/dsh-connector-watchdog/briefs.json`, rewritten atomically after each change, on one serial
 * chain so two changes never interleave. A file that cannot be read or parsed is logged and treated
 * as empty: Watchdog is an ordinary plugin with no failure design (notes §2.6).
 *
 * A brief: `{sessionId, principalKey, purpose, scope, paused, watermark, sideSessionId, briefedAt}`.
 * - `principalKey`: the manager that briefed it; a brief is Watchdog's only while that principal
 *   still manages the session (core.js `claims`).
 * - `watermark`: the `seq` of the newest supervised message already judged (notes §3 "Patrol: reads
 *   the session's messages since its last watermark").
 */
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { LOG, STORE, WATCHDOG } from './constants.js'

const FIELDS = Object.freeze(['sessionId', 'principalKey', 'purpose', 'scope', 'paused', 'watermark', 'sideSessionId', 'briefedAt'])
const isBrief = (b) => b !== null && typeof b === 'object' && typeof b.sessionId === 'string' && b.sessionId !== ''
  && typeof b.principalKey === 'string' && typeof b.purpose === 'string' && typeof b.scope === 'string'
  && typeof b.paused === 'boolean' && Number.isInteger(b.watermark) && (b.sideSessionId === null || typeof b.sideSessionId === 'string')
async function atomicWrite(file, text) {
  const { writeFileAtomic } = await import('@deepseek-ai/dsh-atomic-write')
  await writeFileAtomic(file, text, { mode: STORE.fileMode, dirMode: STORE.directoryMode })
}
const pick = (brief) => Object.freeze(Object.fromEntries(FIELDS.map((field) => [field, brief[field] ?? null])))

/**
 * @param deps.dir - the directory holding the file (`<home>/dsh-connector-watchdog`)
 * @param deps.logger - `{warn}`
 * @param deps.write - `(file, text) => Promise<void>`; DSH's atomic write by default (imported on
 *   first use, so the module loads outside a DSH host too)
 */
export async function openBriefStore({ dir, logger, write = atomicWrite }) {
  const file = path.join(dir, STORE.file)
  const briefs = new Map()
  try {
    const parsed = JSON.parse(await readFile(file, STORE.encoding))
    for (const brief of Array.isArray(parsed?.briefs) ? parsed.briefs : []) if (isBrief(brief)) briefs.set(brief.sessionId, pick(brief))
  } catch (error) {
    if (error?.code !== 'ENOENT') logger.warn(LOG.format, WATCHDOG.name, LOG.storeUnreadable, error?.code ?? error?.name)
  }

  let chain = Promise.resolve()
  /** Writes the whole map once the change is in memory; a failed write is logged, memory stands. */
  function persist() {
    const text = JSON.stringify({ version: STORE.version, briefs: [...briefs.values()] })
    const run = chain.then(async () => {
      await mkdir(dir, { recursive: true, mode: STORE.directoryMode })
      await write(file, text)
    }).catch((error) => logger.warn(LOG.format, WATCHDOG.name, LOG.storeWriteFailed, error?.code ?? error?.name))
    chain = run
    return run
  }

  return Object.freeze({
    get: (sessionId) => briefs.get(sessionId),
    list: () => [...briefs.values()],
    /** Sets a brief (a whole record) and persists. */
    put(brief) {
      briefs.set(brief.sessionId, pick(brief))
      return persist()
    },
    /** Changes some fields of an existing brief; undefined when there is none. */
    update(sessionId, change) {
      const brief = briefs.get(sessionId)
      if (brief === undefined) return undefined
      briefs.set(sessionId, pick({ ...brief, ...change }))
      return persist().then(() => briefs.get(sessionId))
    },
    remove(sessionId) {
      if (!briefs.delete(sessionId)) return Promise.resolve()
      return persist()
    },
    drain: () => chain,
  })
}

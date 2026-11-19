/**
 * The host's record of the hosted token entries the instance created (design §5.4: "The instance
 * keeps the entry key of the hosted entry it created (non-secret, in its lifecycle state)"; R1: no
 * value), and the instance's own stable id that `createHosted(instanceId)` names them by.
 * `<mainHome>/fishball/hosted.json`, private, `{format, instanceId, entries, runtime?, succession?}`,
 * entries newest last. `runtime` is the child runtime id (the runtime owner marker's `hostId`) the
 * newest entry was created under: a new one means a reinstall (the user's Q3 = A, 2026-11-17). `succession` is the entry key of the old hosted entry whose reinstall succession
 * (R-HOST-09) has not finished yet; it is kept on disk because R-HOST-09 says "the instance retries
 * at its next start", which may be a later host start. Its successor is not stored: it is always the
 * newest entry (the one the child holds; the user's Q2, 2026-11-17: "Retarget to the newest").
 *
 * It lives beside the runtime tree, not in it: uninstall and a runtime reset remove
 * `<mainHome>/fishball/runtime` whole (files.js removeRuntime, which also mints a new host id), and a
 * reinstalled child must still find the earlier keys and the same instance id, or reinstall
 * succession (R-HOST-09, I-SUCCEED) has nothing to retire and `retire` refuses `not-hosted`. A key
 * is added only after the child stored the value.
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { exists, jsonPrivate, privateDirectory, validId, writePrivate } from '../native-runtime/files.js'
import { HOSTED, fail } from '../native-runtime/constants.js'

const validKey = (key) => typeof key === 'string' && key !== ''
const valid = (record) => record?.format === HOSTED.record.format && validId(record.instanceId) && Array.isArray(record.entries) &&
  record.entries.every(validKey) && [record.runtime, record.succession].every((value) => value === undefined || validKey(value))

/**
 * @param {string} file - the record's path (its folder is created private when missing)
 * @returns {Promise<{instanceId: string, entries(): readonly string[], runtime(): string | undefined,
 *   pending(): string | undefined, add(entryKey: string, options?: {runtime?: string, succession?: boolean}): Promise<void>,
 *   settle(oldEntryKey: string): Promise<void>}>}
 *   A missing file starts with a new id and no entries, written at once so the id is stable; a
 *   damaged one rejects `INVALID_HOSTED_RECORD` (deleting it is a safe repair: it only loses the
 *   succession candidates). Writes run one after another; the memory copy changes only after its
 *   write succeeded, so a failed write leaves both as they were.
 */
export async function openHostedRecord(file) {
  let record
  if (await exists(file)) {
    try { record = await jsonPrivate(file) } catch (error) { if (error instanceof SyntaxError) fail(HOSTED.code.record); throw error }
    if (!valid(record)) fail(HOSTED.code.record)
  } else {
    await privateDirectory(path.dirname(file))
    record = { format: HOSTED.record.format, instanceId: randomUUID(), entries: [] }
    await writePrivate(file, record)
  }
  const { instanceId } = record
  let state = { entries: [...record.entries], runtime: record.runtime, succession: record.succession }
  let writing = Promise.resolve()
  /** Writes the next state, then adopts it; `next(state)` reads the state at its write slot. */
  function write(next) {
    const run = writing.then(async () => {
      const after = { ...state, ...next(state) }
      // JSON.stringify leaves out the undefined optional fields.
      await writePrivate(file, { format: HOSTED.record.format, instanceId, ...after })
      state = after
    })
    writing = run.catch(() => {})
    return run
  }
  return Object.freeze({
    instanceId,
    entries: () => Object.freeze([...state.entries]),
    /** The runtime id the newest entry was created under, or undefined (none, or a record from before I-SUCCEED). */
    runtime: () => state.runtime,
    /** The old entry key of the unfinished succession, or undefined. */
    pending: () => state.succession,
    /**
     * Appends `entryKey` as the newest entry, created under `runtime`. A pending succession stays and now names this entry as
     * its successor (Q2: retarget to the newest). With `{succession: true}` (a reinstall's new
     * entry), and none pending, the newest entry before this one becomes the pending old entry.
     * Chosen at the write slot, so a pending one is never replaced: a second reinstall keeps the
     * original old entry, and the intermediate entry is left alone.
     */
    // An unknown runtime keeps the recorded one: erasing it would make the next start a reinstall.
    add: (key, { runtime, succession: start = false } = {}) => write((state) => {
      const earlier = state.entries.filter((k) => k !== key)
      return { entries: [...earlier, key], runtime: runtime ?? state.runtime, succession: state.succession ?? (start ? earlier.at(-1) : undefined) }
    }),
    /** Ends the succession of `oldEntryKey`; one that replaced it meanwhile stays. */
    settle: (oldEntryKey) => write(({ succession }) => ({ succession: succession === oldEntryKey ? undefined : succession })),
  })
}

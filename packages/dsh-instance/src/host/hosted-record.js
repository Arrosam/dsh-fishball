/**
 * The host's record of the hosted token entries the instance created (design §5.4: "The instance
 * keeps the entry key of the hosted entry it created (non-secret, in its lifecycle state)"; R1: no
 * value), and the instance's own stable id that `createHosted(instanceId)` names them by.
 * `<mainHome>/fishball/hosted.json`, private, `{format, instanceId, entries}`, entries newest last.
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

const valid = (record) => record?.format === HOSTED.record.format && validId(record.instanceId) && Array.isArray(record.entries) &&
  record.entries.every((key) => typeof key === 'string' && key !== '')

/**
 * @param {string} file - the record's path (its folder is created private when missing)
 * @returns {Promise<{instanceId: string, entries(): readonly string[], add(entryKey: string): Promise<void>}>}
 *   A missing file starts with a new id and no entries, written at once so the id is stable; a
 *   damaged one rejects `INVALID_HOSTED_RECORD` (deleting it is a safe repair: it only loses the
 *   succession candidates).
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
  let entries = [...record.entries]
  let writing = Promise.resolve()
  return Object.freeze({
    instanceId,
    entries: () => Object.freeze([...entries]),
    add(entryKey) {
      const run = writing.then(async () => {
        const next = [...entries.filter((key) => key !== entryKey), entryKey]
        await writePrivate(file, { format: HOSTED.record.format, instanceId, entries: next })
        entries = next
      })
      writing = run.catch(() => {})
      return run
    },
  })
}

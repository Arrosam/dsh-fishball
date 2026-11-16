/**
 * The host's record of the hosted token entries the instance created (design §5.4: "The instance
 * keeps the entry key of the hosted entry it created (non-secret, in its lifecycle state)"; R1: no
 * value). `<mainHome>/fishball/runtime/hosted.json`, private, `{format, entries}`, newest last. A key
 * is added only after the child stored the value. I-SUCCEED (W5) reads the older keys for `retire`.
 */
import { exists, jsonPrivate, writePrivate } from '../native-runtime/files.js'
import { HOSTED, fail } from '../native-runtime/constants.js'

const valid = (record) => record?.format === HOSTED.record.format && Array.isArray(record.entries) &&
  record.entries.every((key) => typeof key === 'string' && key !== '')

/**
 * @param {string} file - the record's path
 * @returns {Promise<{entries(): readonly string[], add(entryKey: string): Promise<void>}>}
 *   A missing file is no entries; a damaged one rejects `INVALID_HOSTED_RECORD` (deleting it is a
 *   safe repair: it only loses the succession candidates).
 */
export async function openHostedRecord(file) {
  let entries = []
  if (await exists(file)) {
    let record
    try { record = await jsonPrivate(file) } catch (error) { if (error instanceof SyntaxError) fail(HOSTED.code.record); throw error }
    if (!valid(record)) fail(HOSTED.code.record)
    entries = [...record.entries]
  }
  let writing = Promise.resolve()
  return Object.freeze({
    entries: () => Object.freeze([...entries]),
    add(entryKey) {
      const run = writing.then(async () => {
        entries = [...entries.filter((key) => key !== entryKey), entryKey]
        await writePrivate(file, { format: HOSTED.record.format, entries })
      })
      writing = run.catch(() => {})
      return run
    },
  })
}

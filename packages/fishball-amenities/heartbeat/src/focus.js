import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { FOCUS } from './constants.js'

/**
 * The one durable value Fishball may change: the next heartbeat's focus, in
 * `<profile home>/fishball-heartbeat/focus.json`. A file of its own (not a session record) so it
 * outlives a new manager session and is read whole at each heartbeat.
 *
 * Writes go through dsh-atomic-write (core's guards use it too): a private temp sibling renamed
 * over the file, removed on failure, so a reader never sees half a file. It does not fsync; a
 * power loss can at worst lose the latest focus or leave the file unreadable, which the heartbeat
 * survives (it sends without a focus) and the next save replaces. Writes are serialized in-process.
 * A missing file is no focus. A file that cannot be read or parsed rejects: the caller decides
 * (the heartbeat sends without a focus; the tool reports only its own write), so a broken file is
 * never silently read as empty.
 *
 * @param {{home: string}} options - the profile home.
 * @returns {{read(): Promise<string>, write(focus: string): Promise<void>}}
 */
export function createFocusStore({ home }) {
  const file = join(home, FOCUS.directory, FOCUS.file)
  let queue = Promise.resolve()

  async function read() {
    let text
    try { text = await readFile(file, FOCUS.encoding) } catch (error) {
      if (error?.code === FOCUS.missing) return ''
      throw error
    }
    const document = JSON.parse(text)
    if (document?.v !== FOCUS.version || typeof document.focus !== 'string') throw new TypeError(FOCUS.file)
    return document.focus
  }

  function write(focus) {
    const run = queue.then(() => writeFileAtomic(file, JSON.stringify({ v: FOCUS.version, focus }), { mode: FOCUS.fileMode, dirMode: FOCUS.directoryMode }))
    queue = run.catch(() => {})
    return run
  }

  return Object.freeze({ read, write })
}

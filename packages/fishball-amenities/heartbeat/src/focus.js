import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FOCUS } from './constants.js'

/**
 * The one durable value Fishball may change: the next heartbeat's focus, in
 * `<profile home>/fishball-heartbeat/focus.json`. A file of its own (not a session record) so it
 * outlives a new manager session and is read whole at each heartbeat.
 *
 * Writes are serialized in-process and published by rename, so a reader never sees half a file.
 * A missing file is no focus. A file that cannot be read or parsed rejects: the caller decides
 * (the heartbeat sends without a focus; the tool refuses), so a broken file is never silently
 * read as empty and then overwritten by surprise.
 *
 * @param {{home: string}} options - the profile home.
 * @returns {{read(): Promise<string>, write(focus: string): Promise<void>}}
 */
export function createFocusStore({ home }) {
  const directory = join(home, FOCUS.directory)
  const file = join(directory, FOCUS.file)
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
    const run = queue.then(async () => {
      await mkdir(directory, { recursive: true, mode: FOCUS.directoryMode })
      const temporary = file + FOCUS.temporarySuffix + randomUUID()
      await writeFile(temporary, JSON.stringify({ v: FOCUS.version, focus }), { encoding: FOCUS.encoding, mode: FOCUS.fileMode })
      await rename(temporary, file)
    })
    queue = run.catch(() => {})
    return run
  }

  return Object.freeze({ read, write })
}

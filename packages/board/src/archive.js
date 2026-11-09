import { constants as FS } from 'node:fs'
import { open } from 'node:fs/promises'
import { TextDecoder } from 'node:util'
import { REFUSAL, STATUS } from './constants.js'

export const STORAGE = Object.freeze({
  directory: 'fishball-board', board: 'board.json', archive: 'archive.jsonl',
  version: 1, directoryMode: 0o700, fileMode: 0o600, newline: '\n',
  encoding: 'utf8', missing: 'ENOENT', reset: 'board-reset',
  corruptSuffix: '.corrupt-', temporarySuffix: '.tmp-',
  millisecondsPerDay: 86_400_000, emptyBytes: 0, firstLine: 1,
  newlineByte: 10, lastByteOffset: 1,
  outcome: Object.freeze({ unchanged: 'unchanged', uncertain: 'interrupted-write', corrupt: 'archive-corrupt' }),
})

export function unavailable(cause, outcome = STORAGE.outcome.unchanged) {
  return Object.assign(new Error(REFUSAL.boardUnavailable, { cause }), {
    code: REFUSAL.boardUnavailable, outcome,
  })
}

export const isClosed = card => card.status === STATUS.done || card.status === STATUS.dropped

// Storage shape checks are not B2's transition, ID/ref grammar or B4's input validation.
// In particular, never turn an invalid archive line into a skipped/empty search result.
export function assertSnapshot(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)
    || typeof card.id !== 'string' || !card.id
    || typeof card.title !== 'string' || typeof card.note !== 'string'
    || !Object.values(STATUS).includes(card.status) || !Array.isArray(card.links)
    || !Number.isSafeInteger(card.createdAt) || !Number.isSafeInteger(card.updatedAt)
    || (isClosed(card) && !Number.isSafeInteger(card.closedAt))) {
    throw unavailable(undefined, STORAGE.outcome.corrupt)
  }
  return card
}

/** Open a private regular file without following a final-component symlink. */
export async function openPrivate(file, flags) {
  const handle = await open(file, flags | FS.O_NOFOLLOW, STORAGE.fileMode)
  try {
    if (!(await handle.stat()).isFile()) throw unavailable()
    await handle.chmod(STORAGE.fileMode)
    return handle
  } catch (error) {
    await handle.close()
    throw error
  }
}

/** Internal single-writer archive port. The store owns serialization and the byte checkpoint. */
export function createArchive(file) {
  async function reader(expectedBytes) {
    let handle
    try {
      handle = await openPrivate(file, FS.O_RDONLY)
    } catch (error) {
      if (error.code === STORAGE.missing && (expectedBytes === undefined || expectedBytes === STORAGE.emptyBytes)) return null
      throw unavailable(error)
    }
    try {
      const { size } = await handle.stat()
      if (expectedBytes !== undefined && size !== expectedBytes) throw unavailable(undefined, STORAGE.outcome.uncertain)
      return { handle, size }
    } catch (error) {
      await handle.close()
      throw error
    }
  }

  async function withReader(expectedBytes, visit) {
    const source = await reader(expectedBytes)
    if (!source) return STORAGE.emptyBytes
    try {
      await visit(source)
      return source.size
    } catch (error) {
      throw error.code === REFUSAL.boardUnavailable ? error : unavailable(error)
    } finally {
      await source.handle.close()
    }
  }

  async function scan(visit, expectedBytes) {
    return withReader(expectedBytes, async ({ handle, size }) => {
      if (size === STORAGE.emptyBytes) return
      let fragments = []
      let archiveLine = STORAGE.firstLine
      const decoder = new TextDecoder(STORAGE.encoding, { fatal: true })
      // The captured end and the store queue exclude an in-flight append and half-line reads.
      const stream = handle.createReadStream({ start: STORAGE.emptyBytes, end: size - STORAGE.lastByteOffset, autoClose: false })
      for await (const chunk of stream) {
        let start = STORAGE.emptyBytes
        let end
        while ((end = chunk.indexOf(STORAGE.newlineByte, start)) !== -1) {
          fragments.push(chunk.subarray(start, end))
          let card
          try { card = assertSnapshot(JSON.parse(decoder.decode(Buffer.concat(fragments)))) }
          catch (error) { throw unavailable(error, STORAGE.outcome.corrupt) }
          await visit({ card, archiveLine })
          archiveLine++
          fragments = []
          start = end + STORAGE.lastByteOffset
        }
        if (start < chunk.length) fragments.push(chunk.subarray(start))
      }
      if (fragments.length) throw unavailable(undefined, STORAGE.outcome.corrupt)
    })
  }

  return {
    scan,
    async append(text, expectedBytes) {
      const handle = await openPrivate(file, FS.O_WRONLY | FS.O_CREAT | FS.O_APPEND)
      try {
        if ((await handle.stat()).size !== expectedBytes) throw unavailable(undefined, STORAGE.outcome.uncertain)
        await handle.writeFile(text, STORAGE.encoding)
        await handle.sync()
        return expectedBytes + Buffer.byteLength(text, STORAGE.encoding)
      } finally { await handle.close() }
    },
    async exportTo(writeChunk, expectedBytes) {
      // Validate the entire boundary before giving B10 any bytes. Sink failure still rejects;
      // B10 must publish its destination only after this promise successfully completes.
      await scan(() => {}, expectedBytes)
      return withReader(expectedBytes, async ({ handle, size }) => {
        if (size === STORAGE.emptyBytes) return
        for await (const chunk of handle.createReadStream({ start: STORAGE.emptyBytes, end: size - STORAGE.lastByteOffset, autoClose: false })) {
          await writeChunk(chunk)
        }
      })
    },
  }
}

import { constants as FS } from 'node:fs'
import { mkdir, lstat, chmod, rename, open } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BOARD_LIMITS, REFUSAL } from './constants.js'
import { STORAGE, assertSnapshot, createArchive, isClosed, openPrivate, unavailable } from './archive.js'

const copy = value => structuredClone(value)
const refusal = code => Object.assign(new Error(code), { code })
const visible = (card, at) => !isClosed(card)
  || at - card.closedAt <= BOARD_LIMITS.visibilityDays * STORAGE.millisecondsPerDay
const project = (cards, at) => cards.filter(card => visible(card, at))

function assertCards(cards) {
  if (!Array.isArray(cards)) throw unavailable()
  const ids = new Set()
  for (const card of cards) {
    assertSnapshot(card)
    if (ids.has(card.id)) throw unavailable()
    ids.add(card.id)
  }
}

/**
 * One instance per child home, composed by the plugin row (never the main profile).
 * All methods return promises and share one queue; callbacks must not reenter the store.
 * transact receives {cards, getCard(id)} and returns the complete candidate card array.
 * B4 validates the whole call using B2 before returning; storage never invents transitions.
 * scanArchive(visitor) streams {card, archiveLine, onBoard}; completion, not the last
 * callback, certifies a complete scan. exportArchive(writeChunk) streams raw JSONL bytes.
 * Neither API owns search ranking, destination publication or uninstall integration.
 */
export function createBoardStore({ home, now = Date.now }) {
  if (typeof home !== 'string' || !isAbsolute(home)) throw refusal(REFUSAL.invalidInput)
  const directory = join(home, STORAGE.directory)
  const boardPath = join(directory, STORAGE.board)
  const archive = createArchive(join(directory, STORAGE.archive))
  let cards = []
  let archiveBytes = STORAGE.emptyBytes
  let notice = null
  let initialized = false
  let uncertain = false
  let tail = Promise.resolve()

  async function atomicBoard(next, bytes) {
    const temporary = boardPath + STORAGE.temporarySuffix + randomUUID()
    let published = false
    try {
      const handle = await openPrivate(temporary, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL)
      try {
        await handle.writeFile(JSON.stringify({ v: STORAGE.version, cards: next, archiveBytes: bytes }) + STORAGE.newline, STORAGE.encoding)
        await handle.sync()
      } finally { await handle.close() }
      await rename(temporary, boardPath)
      published = true
      const parent = await open(directory, FS.O_RDONLY)
      try { await parent.sync() } finally { await parent.close() }
    } catch (error) {
      throw unavailable(error, published ? STORAGE.outcome.uncertain : STORAGE.outcome.unchanged)
    }
  }

  async function persist(next, snapshots) {
    // Serialize everything before any disk mutation. No archive rollback is ever permitted.
    const text = snapshots.map(card => JSON.stringify(card) + STORAGE.newline).join('')
    JSON.stringify(next)
    let nextBytes = archiveBytes
    let appendStarted = false
    try {
      if (text) {
        appendStarted = true
        nextBytes = await archive.append(text, archiveBytes)
      }
      await atomicBoard(next, nextBytes)
      cards = copy(next)
      archiveBytes = nextBytes
    } catch (error) {
      // A successful append followed by failed rename cannot honestly be called atomic.
      // Retain the last committed memory and refuse further work until reconciliation.
      uncertain = appendStarted || error.outcome === STORAGE.outcome.uncertain
      throw unavailable(error, uncertain ? STORAGE.outcome.uncertain : STORAGE.outcome.unchanged)
    }
  }

  async function initialize() {
    if (initialized) return
    await mkdir(directory, { recursive: true, mode: STORAGE.directoryMode })
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw unavailable()
    await chmod(directory, STORAGE.directoryMode)
    // Inspect permanent history first: corruption is NEVER a board reset or empty success.
    archiveBytes = await archive.scan(() => {})
    let document
    let missing = false
    let invalid = false
    try {
      const handle = await openPrivate(boardPath, FS.O_RDONLY)
      let text
      try { text = await handle.readFile(STORAGE.encoding) } finally { await handle.close() }
      try {
        document = JSON.parse(text)
        if (document?.v !== STORAGE.version) throw unavailable()
        assertCards(document.cards)
        if (document.cards.length > BOARD_LIMITS.cards) throw unavailable()
        if (document.archiveBytes !== undefined && (!Number.isSafeInteger(document.archiveBytes) || document.archiveBytes < STORAGE.emptyBytes)) throw unavailable()
      } catch { invalid = true }
    } catch (error) {
      if (error.code === STORAGE.missing) missing = true
      else throw error
    }
    if (invalid) {
      const quarantine = boardPath + STORAGE.corruptSuffix + new Date(now()).toISOString() + '-' + randomUUID()
      await rename(boardPath, quarantine)
      notice = STORAGE.reset
      try { await atomicBoard([], archiveBytes) }
      catch (error) {
        uncertain = true
        throw unavailable(error, STORAGE.outcome.uncertain)
      }
      cards = []
    } else if (missing) {
      // An archive with no projection may be an interrupted first publication; do not
      // guess that it is empty, or reconstruct early-cleared cards as visible.
      if (archiveBytes !== STORAGE.emptyBytes) throw unavailable(undefined, STORAGE.outcome.uncertain)
    } else {
      if (document.archiveBytes !== undefined && document.archiveBytes !== archiveBytes) throw unavailable(undefined, STORAGE.outcome.uncertain)
      cards = document.cards
      if (document.archiveBytes === undefined) {
        if (archiveBytes !== STORAGE.emptyBytes) throw unavailable(undefined, STORAGE.outcome.uncertain)
        // Adopt the original v1 board format without losing its existing card snapshots.
        await persist(cards, cards)
      }
    }
    initialized = true
  }

  function queued(action) {
    const result = tail.then(async () => {
      if (uncertain) throw unavailable(undefined, STORAGE.outcome.uncertain)
      try { await initialize(); return await action() }
      catch (error) {
        if (error.code) throw error.code === REFUSAL.boardUnavailable || Object.values(REFUSAL).includes(error.code) ? error : unavailable(error)
        throw unavailable(error)
      }
    })
    tail = result.catch(() => {})
    return result
  }

  async function current(at) {
    const next = project(cards, at)
    if (next.length !== cards.length) await persist(next, [])
    return next
  }

  async function getCard(id) {
    const onBoard = cards.find(card => card.id === id)
    if (onBoard) return copy(onBoard)
    let found = null
    await archive.scan(({ card }) => { if (card.id === id) found = card }, archiveBytes)
    return copy(found)
  }

  return {
    read: () => queued(async () => ({ cards: copy(await current(now())), notice })),
    transact: change => queued(async () => {
      const at = now()
      const before = project(cards, at)
      const proposed = await change({ cards: copy(before), getCard })
      // Plain JSON snapshots are the persistence boundary, not live objects/accessors.
      const next = JSON.parse(JSON.stringify(proposed))
      assertCards(next)
      for (const card of before) {
        if (!isClosed(card) && !next.some(candidate => candidate.id === card.id)) throw refusal(REFUSAL.cardMissing)
      }
      const projection = project(next, at)
      if (projection.length > BOARD_LIMITS.cards) throw refusal(REFUSAL.boardFull)
      const snapshots = []
      for (const card of next) {
        const previous = await getCard(card.id)
        if (JSON.stringify(previous) !== JSON.stringify(card)) snapshots.push(card)
      }
      await persist(projection, snapshots)
      return { cards: copy(cards), notice }
    }),
    clear: ids => queued(async () => {
      const at = now()
      const removing = new Set(ids)
      for (const id of removing) {
        const card = await getCard(id)
        if (!card) throw refusal(REFUSAL.unknownCard)
        if (!isClosed(card)) throw refusal(REFUSAL.notClosed)
      }
      await persist(project(cards, at).filter(card => !removing.has(card.id)), [])
      return { cards: copy(cards), notice }
    }),
    scanArchive: visit => queued(async () => {
      const onBoard = new Set(project(cards, now()).map(card => card.id))
      return archive.scan(entry => visit({ ...entry, onBoard: onBoard.has(entry.card.id) }), archiveBytes)
    }),
    exportArchive: writeChunk => queued(() => archive.exportTo(writeChunk, archiveBytes)),
  }
}

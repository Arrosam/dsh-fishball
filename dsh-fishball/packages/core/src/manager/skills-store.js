/**
 * Fishball's private Skills: the trusted storage service and the confined reader (SK, final scope
 * §4; SK-SEAM decisions 1 and 4; docs/planning/v2-sk-seam.md §5.2). Lives in core's manager
 * folder since V3 F-WIRE (the user's decision 2026-11-16), unchanged.
 *
 * The library is `<DSH home>/skills/<name>/SKILL.md`. Every operation takes a skill NAME,
 * never a path: the name passes DSH's own grammar before any path is built, so absolute paths,
 * traversal, separators and sibling prefixes never reach the filesystem.
 *
 * Two halves share one anchored root:
 * - `fileSystem` is the restricted reader handed to the public native FileSystemSkillProvider. It
 *   walks every path component below the root with lstat and refuses (reports as absent or as a
 *   non-file) any symbolic link and any multiply linked file BEFORE a byte is read, so a link
 *   escaping the root is never followed. It implements only the FileSystem members the native
 *   provider calls (resolve, listDir, stat, readText, processPath).
 * - `create` / `update` / `remove` are the dedicated write path. They run in this trusted host
 *   process, outside the agent's sandboxed `ctx.fs`, so ordinary write/edit/shell tools stay
 *   read-only. Writes are serialized, publish a complete document by same-directory rename, and
 *   never write through or delete through a link.
 *
 * Residual limits (SK-SEAM §5.2): lstat walks plus a no-follow final open narrow, but do not remove,
 * an ancestor-swap race by another same-user process; that is a bypass of this service and outside
 * its guarantee. Power-loss durability is not promised (the file is synced, the directory is not).
 */
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { isModelInvocable, isSkillName } from '@deepseek-ai/dsh-skill'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'

/**
 * Whether `file` is `root` or below it, by path only (no link is resolved). It was fishball-shared's
 * `./files` until REMOVE-V2b; this store is its one Fishball-side user, so R-ARCH-08 strict (a
 * library module needs two importers on its side; Fishball, 2026-11-16) puts it here.
 */
const inside = (root, file) => {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}

export const SKILL_STORE = Object.freeze({
  rootDirectory: 'skills',
  file: 'SKILL.md',
  directoryMode: 0o700,
  fileMode: 0o600,
  /** The temporary sibling lives inside the skill directory, where native discovery never looks. */
  tempPrefix: '.SKILL.md.',
  tempSuffix: '.tmp',
  encoding: 'utf-8',
  singleLink: 1,
})

/** Refusal and failure codes; each means nothing was committed. */
export const SKILL_ERROR = Object.freeze({
  invalidName: 'invalid-name',
  invalidDocument: 'invalid-document',
  conflict: 'conflict',
  notFound: 'not-found',
  unsafeEntry: 'unsafe-entry',
  writeFailed: 'write-failed',
  cancelled: 'cancelled',
})

/** Which part of the document a validation error is about. */
export const SKILL_FIELD = Object.freeze({
  name: 'name', document: 'document', frontmatter: 'frontmatter', description: 'description', body: 'body',
  disableModel: 'disable-model-invocation',
})

/** Error codes the native provider reads as "absent" or "not text"; anything else is a failure. */
const NATIVE_FS_CODE = Object.freeze({ notFound: 'FS_NOT_FOUND', notText: 'FS_NOT_TEXT' })
/** The store's own failure for a library root that is not a real directory (mapped to unsafe-entry). */
const UNSAFE_ROOT_CODE = 'SKILLS_ROOT_UNSAFE'
/** Node errno codes the store branches on. */
const ERRNO = Object.freeze({ absent: 'ENOENT', notDirectory: 'ENOTDIR', exists: 'EEXIST' })
/** The service name the native provider reads its filesystem from. */
export const FS_SERVICE = 'fs'
const FS_TYPE = Object.freeze({ file: 'file', directory: 'directory', other: 'other' })
/** The stat `version` of an entry with no inode of its own to describe (the virtual draft, the root). */
const UNVERSIONED = ''
const ENTRY = Object.freeze({ absent: 'absent', link: 'link', directory: 'directory', file: 'file', other: 'other' })

export class SkillError extends Error {
  /**
   * Every SkillError is a before-commit outcome: nothing was written. Post-commit outcomes are
   * results, never errors (skills.js confirm).
   * @param {string} code - a SKILL_ERROR value.
   * @param {{field?: string, cause?: unknown}} [details]
   */
  constructor(code, { field, cause } = {}) {
    super(field === undefined ? code : `${code}: ${field}`, { cause })
    this.name = 'SkillError'
    this.code = code
    this.field = field
  }
}

function fsError(code, message) {
  return Object.assign(new Error(message), { code })
}

const refuse = (code, field) => { throw new SkillError(code, { field }) }

/** The name gate: runs before any path is built from the name. */
export function assertSkillName(name) {
  if (typeof name !== 'string' || !isSkillName(name)) refuse(SKILL_ERROR.invalidName, SKILL_FIELD.name)
  return name
}

const DRAFT_DIRECTORY = path.join(path.sep, 'draft')
const DRAFT_FILE = path.join(DRAFT_DIRECTORY, SKILL_STORE.file)

/** The one-file world a draft is parsed in: the native provider reads it through `fs`. */
const DRAFT = Object.freeze({
  file: DRAFT_FILE,
  target: Object.freeze({ targetKey: DRAFT_FILE, displayPath: DRAFT_FILE }),
  /**
   * The candidate handed to native `get`. Native get reads only `locator` and `source` (a
   * non-bundled source keeps it on the supplied `fs`); the summary fields are placeholders it
   * replaces with what it parses.
   */
  candidate: Object.freeze({
    name: '', description: '', invocation: Object.freeze({}), source: 'custom', rank: 0,
    locator: Object.freeze({ path: DRAFT_FILE, directory: DRAFT_DIRECTORY }),
  }),
  lookup: Object.freeze({}),
  provider: Object.freeze({ includeDefaultRoots: false, customSkillDirs: Object.freeze([]), watch: false }),
  /**
   * A top-level `description:` key whose value is an empty scalar (bare, "" or ''). JS `$` in
   * multiline mode also stops before `\r`, so a CRLF document keeps its line ends.
   */
  emptyDescription: /^(description:[ \t]*)(?:""|'')?[ \t]*$/m,
  placeholder: 'x',
})

/**
 * Parse a draft with the installed SDK's own public FileSystemSkillProvider over a one-file virtual
 * filesystem, so "native-loadable" is decided by the native parser itself rather than a restated
 * copy of it (its standalone parser is not exported, SK-SEAM E9). Returns the native definition,
 * or undefined when native discovery would ignore the document.
 */
async function parseNatively(document) {
  const fs = Object.freeze({
    resolve: async () => DRAFT.target,
    processPath: () => DRAFT.file,
    stat: async () => ({ type: FS_TYPE.file, version: UNVERSIONED, size: Buffer.byteLength(document, SKILL_STORE.encoding) }),
    readText: async () => document,
  })
  // Native logs why it ignores a document; validateDocument turns that outcome into a typed
  // field refusal instead, so the draft's warnings would only duplicate it in the child log.
  const ignore = () => {}
  const ctx = { get: (service) => (service === FS_SERVICE ? fs : undefined), logger: { warn: ignore, info: ignore, debug: ignore } }
  const lifetime = new AbortController()
  const provider = new FileSystemSkillProvider(ctx, { signal: lifetime.signal, invalidate: ignore }, DRAFT.provider)
  try {
    return await provider.get({ ...DRAFT.candidate, provider: provider.name }, DRAFT.lookup)
  } finally {
    lifetime.abort()
    await provider.dispose()
  }
}

/**
 * Whether native refused `document` only because its description is empty: the same document with
 * a top-level empty `description:` value (bare, "" or '') given a placeholder loads natively.
 */
async function emptyDescription(document) {
  const probe = document.replace(DRAFT.emptyDescription, `$1${DRAFT.placeholder}`)
  return probe !== document && await parseNatively(probe) !== undefined
}

/**
 * Validate a complete SKILL.md for `name` before anything is written (S6; Fishball Q3/Q4). Stricter
 * than native discovery on purpose: native accepts a blank description, an empty body and a
 * directory/name mismatch, and hides `disable-model-invocation: true` from the model.
 * @returns {Promise<{description: string, body: string}>} what native load will return.
 */
export async function validateDocument(name, document) {
  if (typeof document !== 'string' || !document.isWellFormed()) refuse(SKILL_ERROR.invalidDocument, SKILL_FIELD.document)
  // Native ignores legacy camelCase keys, missing/unclosed front matter, bad YAML and a missing
  // name or description; all of them are "frontmatter" refusals here, never translated.
  const parsed = await parseNatively(document)
  // Native drops an empty description as if it were missing; a probe with a placeholder
  // description tells that case apart so the error can name the field (Q4).
  if (parsed === undefined) refuse(SKILL_ERROR.invalidDocument, await emptyDescription(document) ? SKILL_FIELD.description : SKILL_FIELD.frontmatter)
  if (parsed.name !== name) refuse(SKILL_ERROR.invalidDocument, SKILL_FIELD.name)
  if (parsed.description.trim() === '') refuse(SKILL_ERROR.invalidDocument, SKILL_FIELD.description)
  // S6 keeps every private skill model-loadable.
  if (!isModelInvocable(parsed)) refuse(SKILL_ERROR.invalidDocument, SKILL_FIELD.disableModel)
  if (parsed.content === '') refuse(SKILL_ERROR.invalidDocument, SKILL_FIELD.body)
  return { description: parsed.description, body: parsed.content }
}

const absentCode = (error) => error?.code === ERRNO.absent || error?.code === ERRNO.notDirectory
/** A regular file with exactly one name: a hardlink could alias a file outside the root. */
const isSingleLinkFile = (info) => info.isFile() && info.nlink === SKILL_STORE.singleLink

async function lstatOrAbsent(file) {
  try { return await lstat(file) } catch (error) { if (absentCode(error)) return undefined; throw error }
}

function kindOf(info) {
  if (info === undefined) return ENTRY.absent
  if (info.isSymbolicLink()) return ENTRY.link
  if (info.isDirectory()) return ENTRY.directory
  if (info.isFile()) return ENTRY.file
  return ENTRY.other
}

/**
 * The trusted store for one child home.
 * @param {{home: string}} options - the child's own DSH home (profileContext.home).
 */
export function createSkillStore({ home }) {
  if (typeof home !== 'string' || !path.isAbsolute(home)) throw new TypeError('private skills: an absolute child home is required')
  let anchored
  let serial = Promise.resolve()

  /** The canonical root, anchored once: links above the home are resolved, never below it. */
  function root() {
    // A failed canonicalization is not remembered, so a later call can still succeed.
    anchored ??= realpath(home).then((real) => path.join(real, SKILL_STORE.rootDirectory), (error) => { anchored = undefined; throw error })
    return anchored
  }

  /**
   * One cooperating writer at a time, so validate-then-publish never interleaves (Q5). The chain
   * swallows each outcome so one failed write never rejects the writes queued behind it; the
   * caller still receives its own `result`.
   */
  function exclusive(work) {
    const result = serial.then(work)
    serial = result.catch(() => {})
    return result
  }

  /**
   * Walk `file` from the root with lstat. The root must be a real directory; any component that
   * is a link stops the walk as ENTRY.link, so nothing behind it is touched.
   * @returns {Promise<{kind: string, info?: import('node:fs').Stats}>}
   */
  async function walk(file) {
    const base = await root()
    if (!inside(base, file)) return { kind: ENTRY.absent }
    const rootKind = kindOf(await lstatOrAbsent(base))
    if (rootKind === ENTRY.absent) return { kind: ENTRY.absent }
    if (rootKind !== ENTRY.directory) throw fsError(UNSAFE_ROOT_CODE, 'the private skills root is not a real directory')
    let current = base
    let info
    for (const segment of path.relative(base, file).split(path.sep).filter(Boolean)) {
      if (info !== undefined && !info.isDirectory()) return { kind: ENTRY.absent }
      current = path.join(current, segment)
      info = await lstatOrAbsent(current)
      const kind = kindOf(info)
      if (kind === ENTRY.absent || kind === ENTRY.link) return { kind }
    }
    return { kind: info === undefined ? ENTRY.directory : kindOf(info), info }
  }

  const target = (file) => Object.freeze({ targetKey: file, displayPath: file })
  const safeFile = (walked) => walked.kind === ENTRY.file && isSingleLinkFile(walked.info)

  /** Read one confined regular file without following a final link; the open must be the walked inode. */
  async function readConfined(file, signal) {
    signal?.throwIfAborted()
    const walked = await walk(file)
    if (!safeFile(walked)) throw fsError(NATIVE_FS_CODE.notFound, 'not a confined skill file')
    // O_NONBLOCK: a FIFO swapped in after the walk must not block the open; the inode check refuses it.
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const info = await handle.stat()
      if (!isSingleLinkFile(info) || info.ino !== walked.info.ino) throw fsError(NATIVE_FS_CODE.notFound, 'the skill file changed while it was opened')
      const bytes = await handle.readFile({ signal })
      try { return new TextDecoder(SKILL_STORE.encoding, { fatal: true }).decode(bytes) }
      catch { throw fsError(NATIVE_FS_CODE.notText, 'the skill file is not UTF-8 text') }
    } finally { await handle.close() }
  }

  /** The restricted reader the native provider uses instead of the stock Node reader. */
  const fileSystem = Object.freeze({
    async resolve(file) {
      const resolved = path.resolve(file)
      if (!inside(await root(), resolved)) throw fsError(NATIVE_FS_CODE.notFound, 'outside the private skills root')
      return target(resolved)
    },
    processPath: (resolved) => resolved.displayPath,
    async stat(resolved, signal) {
      signal?.throwIfAborted()
      const walked = await walk(resolved.displayPath)
      if (walked.kind === ENTRY.absent) return undefined
      const type = walked.kind === ENTRY.directory ? FS_TYPE.directory : safeFile(walked) ? FS_TYPE.file : FS_TYPE.other
      return { type, version: walked.info ? `${walked.info.ino}:${walked.info.mtimeMs}:${walked.info.size}` : UNVERSIONED, size: walked.info?.size }
    },
    readText: (resolved, signal) => readConfined(resolved.displayPath, signal),
    async listDir(resolved, signal) {
      signal?.throwIfAborted()
      const walked = await walk(resolved.displayPath)
      if (walked.kind !== ENTRY.directory) throw fsError(NATIVE_FS_CODE.notFound, 'not a confined directory')
      // Dirents describe the entry itself, never a link target: a link lists as "other" and
      // native discovery skips it without opening it. At the root only directories count: the
      // library is `<name>/SKILL.md` (S5), so a stray flat `*.md` there is never a skill that
      // update and remove could not address. Order is left to native discovery, which sorts.
      const atRoot = resolved.displayPath === await root()
      const entries = await readdir(resolved.displayPath, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? FS_TYPE.directory : entry.isFile() && !atRoot ? FS_TYPE.file : FS_TYPE.other,
        target: target(path.join(resolved.displayPath, entry.name)),
      }))
    },
  })

  async function locate(name) {
    const base = await root()
    const directory = path.join(base, assertSkillName(name))
    return { base, directory, file: path.join(directory, SKILL_STORE.file) }
  }

  /**
   * The walked kind of `entry`, which must be absent or `expected`: the skill directory a real
   * directory, SKILL.md a plain file. A link or any other kind there is unsafe and never touched.
   */
  async function stateOf(entry, expected) {
    const { kind } = await walk(entry)
    if (kind !== ENTRY.absent && kind !== expected) refuse(SKILL_ERROR.unsafeEntry)
    return kind
  }

  /** The located skill must exist as a real directory holding a plain SKILL.md (Q5 not-found). */
  async function requirePresent(located) {
    if (await stateOf(located.directory, ENTRY.directory) === ENTRY.absent || await stateOf(located.file, ENTRY.file) === ENTRY.absent) refuse(SKILL_ERROR.notFound)
  }

  /**
   * Publish `document` at `file` as one complete replacement: exclusive no-follow temp file in the
   * same directory, synced, then renamed over the entry. Rename replaces the directory entry and
   * never writes through it. Cancellation is honoured up to the rename; after it the write is
   * committed whatever the caller's signal says.
   */
  async function publish(file, document, signal) {
    const temp = path.join(path.dirname(file), SKILL_STORE.tempPrefix + randomUUID() + SKILL_STORE.tempSuffix)
    try {
      const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, SKILL_STORE.fileMode)
      try { await handle.writeFile(document); await handle.sync() } finally { await handle.close() }
      signal?.throwIfAborted()
      await rename(temp, file)
    } catch (error) {
      await unlink(temp).catch(() => {})
      throw error
    }
  }

  /** Map a pre-commit failure to a typed, not-committed outcome. */
  function notCommitted(error, signal) {
    if (error instanceof SkillError) return error
    if (error?.code === UNSAFE_ROOT_CODE) return new SkillError(SKILL_ERROR.unsafeEntry, { cause: error })
    return new SkillError(signal?.aborted ? SKILL_ERROR.cancelled : SKILL_ERROR.writeFailed, { cause: error })
  }

  /**
   * The one write boundary of create, update and remove: name gate first, then one queued attempt
   * whose every failure becomes a typed not-committed SkillError. `work(located)` must throw only
   * before its commit point; whatever it does after committing must not throw.
   */
  async function mutate(name, signal, work) {
    assertSkillName(name)
    return exclusive(async () => {
      try {
        signal?.throwIfAborted()
        return await work(await locate(name))
      } catch (error) { throw notCommitted(error, signal) }
    })
  }

  // create and update validate before queueing: validation reads nothing on disk, so a refused
  // document never waits behind, or holds up, another write.

  /** Create a new skill; an existing SKILL.md is a conflict and is left byte-identical. */
  async function create(name, document, signal) {
    assertSkillName(name)
    await validateDocument(name, document)
    return mutate(name, signal, async (located) => {
      // The first create makes the root; the home itself must already exist.
      try { await mkdir(located.base, { mode: SKILL_STORE.directoryMode }) } catch (error) { if (error?.code !== ERRNO.exists) throw error }
      const made = await stateOf(located.directory, ENTRY.directory) === ENTRY.absent
      if (made) await mkdir(located.directory, { mode: SKILL_STORE.directoryMode })
      try {
        if (await stateOf(located.file, ENTRY.file) === ENTRY.file) refuse(SKILL_ERROR.conflict)
        await publish(located.file, document, signal)
      } catch (error) {
        // A directory this call made and could not fill is removed, so no leftover blocks a retry.
        if (made) await rmdir(located.directory).catch(() => {})
        throw error
      }
    })
  }

  /** Replace an existing skill completely; an absent one is not-found and nothing is created. */
  async function update(name, document, signal) {
    assertSkillName(name)
    await validateDocument(name, document)
    return mutate(name, signal, async (located) => {
      await requirePresent(located)
      await publish(located.file, document, signal)
    })
  }

  /**
   * Make a skill unavailable: unlinking SKILL.md is the atomic commit. Its directory is removed
   * only if that leaves it empty; extra files stay (Q2). Nothing outside `<root>/<name>/` is touched.
   */
  function remove(name, signal) {
    return mutate(name, signal, async (located) => {
      await requirePresent(located)
      await unlink(located.file)
      // After the commit: a failure here (extra files, Q2) leaves the removal committed.
      await rmdir(located.directory).catch(() => {})
    })
  }

  return Object.freeze({ root, fileSystem, create, update, remove })
}

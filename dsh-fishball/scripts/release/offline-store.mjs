#!/usr/bin/env node
/**
 * The pnpm store an offline install from a release folder must use (INSTALL.md), printed on stdout.
 *
 *   node offline-store.mjs <release store> <profile node_modules> <pnpm's store for the profile>
 *
 * Shipped in the release folder and run from there, so it imports nothing (not even the pack's
 * constants): it is not in any tarball and runs where no checkout exists.
 *
 * Why it exists (e2e B2): pnpm links a profile's node_modules to one store and refuses any other
 * (ERR_PNPM_UNEXPECTED_STORE) while node_modules exists. Pointing `--store-dir` at the release's own
 * store therefore fails on every profile that already holds a plugin, and on a fresh profile it binds
 * the profile to the release folder, so a later add without that folder fails the same way. The
 * fix keeps the profile on its own store: the one its node_modules is linked to, else pnpm's store
 * for that profile (`dsh plugin store path`). This copies the release store's packages into it and
 * prints its path for `--store-dir`.
 *
 * Nothing is deleted or replaced: a file the store already has is kept. A pnpm store is content
 * addressed (`files/` by content hash, `index/` by integrity and package id), so an existing file
 * with the same name already holds what the copy would write. `projects/` is not copied: it holds
 * the pack's own scratch links, which mean nothing in another store.
 * Exit 0 with the path; exit 1 with a message on stderr, and nothing printed on stdout.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = Object.freeze({
  // pnpm's record of how node_modules was installed, `storeDir` among it. pnpm 10 writes it as
  // JSON; earlier majors wrote YAML, so the reader takes both spellings of the one line, a JSON
  // string, a YAML single-quoted one or a plain value.
  modulesFile: '.modules.yaml',
  storeDirLine: /^\s*"?storeDir"?\s*:\s*(.+?)\s*,?\s*$/m,
  quoted: '"',
  singleQuoted: /^'(.*)'$/,
  // The two content folders of a store; see above for why `projects/` is left out.
  contents: Object.freeze(['files', 'index']),
})

const USAGE = 'usage: node offline-store.mjs <release store> <profile node_modules> <pnpm store path>\n'

/** The store `modules` is linked to, or undefined when it holds no install record yet. */
function linkedStore(modules) {
  let text
  try {
    text = fs.readFileSync(path.join(modules, STORE.modulesFile), 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
  const value = STORE.storeDirLine.exec(text)?.[1]
  if (!value) return undefined
  if (value.startsWith(STORE.quoted)) return JSON.parse(value)
  return STORE.singleQuoted.exec(value)?.[1].replaceAll("''", "'") ?? value
}

/**
 * A path a `dsh plugin` query printed: its last non-empty line, which must be absolute. A notice
 * pnpm printed before the path would otherwise resolve into a folder under the release.
 */
function printedPath(text, what) {
  const line = text.split('\n').map((row) => row.trim()).filter(Boolean).at(-1)
  if (!line || !path.isAbsolute(line)) throw new Error(what + ' is not an absolute path: ' + JSON.stringify(text))
  return line
}

/**
 * The store to install with, after copying the release's packages into it. A store path ends in
 * pnpm's store-layout folder (`v10` for pnpm 10); the release store has the same folder, and a
 * release made by another pnpm major is refused rather than mixed in.
 */
function prepare(releaseRoot, modules, fallback) {
  const store = path.resolve(linkedStore(printedPath(modules, 'the profile\'s node_modules')) ?? printedPath(fallback, 'the pnpm store path'))
  const layout = path.basename(store)
  const release = path.resolve(releaseRoot, layout)
  if (!fs.existsSync(release)) throw new Error('your profile\'s pnpm uses store layout ' + layout + ' (' + store + '); this release has only ' + fs.readdirSync(releaseRoot).join(', '))
  if (release !== store) for (const name of STORE.contents) {
    fs.cpSync(path.join(release, name), path.join(store, name), { recursive: true, force: false, errorOnExist: false })
  }
  return store
}

const [releaseRoot, modules, fallback] = process.argv.slice(2)
if (!releaseRoot || !modules || !fallback) {
  process.stderr.write(USAGE)
  process.exitCode = 1
} else {
  try {
    process.stdout.write(prepare(releaseRoot, modules, fallback) + '\n')
  } catch (error) {
    process.stderr.write('offline-store: ' + error.message + '\n')
    process.exitCode = 1
  }
}

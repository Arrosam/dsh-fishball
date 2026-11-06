/**
 * Revision 11 rev11-limits: the two checks DESIGN §14 states on files rather than behaviour.
 * - "no limit named in the table is still read from a constant (a test greps for each old name)":
 *   written from the names in §16 "Today in code" alone. The source files are read as text only to
 *   look for those names; nothing else in them is inspected.
 * - "docs/plugin-author-guide.md lists the three ctx.fishball contract sizes" (§16 constants table:
 *   dedupe key 256, description 1,024, source title 200 bytes).
 * No DSH boot.
 *
 * | id     | technique          | expected |
 * |--------|--------------------|----------|
 * | L40 ×20 | EP (one per old name) | no `NAME.field` / `NAME?.field` / `NAME['field']` (or the bare `OUTBOX_SHOWN`) in each package's index.js, client.js and src tree (M1: packages/connector, packages/instance) |
 * | L41 ×19 | EP (one per staying name) | each constant §16 keeps is still named somewhere in the source |
 * | L42 ×3 | EP (one per size) | the author guide names the dedupe key with 256 bytes, the description with 1,024 bytes and the source title with 200 bytes |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { LIMITS_R11, REMOVED_PACKAGE_CONSTANTS, REPO, STAYING_CONSTANTS } from './support/constants.mjs'

/** Every implementation source file of the two M1 packages, as text, keyed by its path relative to the repo. */
function sources() {
  const files = []
  for (const d of ['connector', 'instance']) {
    const root = path.join(REPO, 'packages', d)
    for (const f of ['index.js', 'client.js', 'host.js', 'native-child.js']) if (fs.existsSync(path.join(root, f))) files.push(path.join('packages', d, f))
    const src = path.join(root, 'src')
    if (fs.existsSync(src)) for (const f of fs.readdirSync(src, { recursive: true })) if (String(f).endsWith('.js')) files.push(path.join('packages', d, 'src', String(f)))
    // The connector's contract is implementation too (src/connector became contract/ in M1).
    const contract = path.join(root, 'contract')
    if (fs.existsSync(contract)) for (const f of fs.readdirSync(contract, { recursive: true })) if (String(f).endsWith('.js')) files.push(path.join('packages', d, 'contract', String(f)))
  }
  return files.map((f) => ({ file: f, text: fs.readFileSync(path.join(REPO, f), 'utf8') }))
}
const FILES = sources()
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A pattern for one old name: `OBJ.field` in its plain, optional-chaining and bracket forms, or a bare identifier. */
function patternFor(name) {
  const [obj, field] = name.split('.')
  if (!field) return new RegExp('\\b' + escape(obj) + '\\b')
  return new RegExp('\\b' + escape(obj) + '\\s*(?:\\?\\.|\\.)\\s*' + escape(field) + '\\b|\\b' + escape(obj) + '\\s*(?:\\?\\.)?\\[\\s*[\'"`]' + escape(field) + '[\'"`]\\s*\\]')
}

describe('rev11-limits: source and documentation checks', () => {
  it('L40 precondition: the source tree is there', () => {
    assert.ok(FILES.some((f) => f.file === path.join('packages', 'connector', 'index.js')), 'connector index.js found')
    assert.ok(FILES.some((f) => f.file.startsWith(path.join('packages', 'connector', 'src'))), 'connector src/*.js found')
  })

  const OLD = [...Object.values(LIMITS_R11).map((l) => l.old), ...REMOVED_PACKAGE_CONSTANTS]
  for (const name of OLD) {
    it('L40 the old constant ' + name + ' is no longer read anywhere in the source', () => {
      const re = patternFor(name)
      const hits = FILES.flatMap(({ file, text }) => text.split('\n').flatMap((line, i) => (re.test(line) ? [file + ':' + (i + 1)] : [])))
      assert.deepEqual(hits, [], name + ' still appears at ' + hits.join(', '))
    })
  }

  for (const name of STAYING_CONSTANTS) {
    it('L41 the constant ' + name + ' stays (still named in the source)', () => {
      const re = new RegExp('\\b' + escape(name) + '\\b')
      assert.ok(FILES.some(({ text }) => re.test(text)), name + ' is not named anywhere in the source')
    })
  }

  const guide = fs.readFileSync(path.join(REPO, 'docs', 'plugin-author-guide.md'), 'utf8')
  const lines = guide.split('\n')
  for (const [label, word, size] of [
    ['the dedupe key, 256 bytes', /dedupe/i, /\b256\b/],
    ['the description, 1,024 bytes', /description/i, /\b1,?024\b/],
    ['the source title, 200 bytes', /title/i, /\b200\b/],
  ]) {
    it('L42 docs/plugin-author-guide.md lists ' + label, () => {
      const hit = lines.find((l) => word.test(l) && size.test(l) && /bytes?/i.test(l))
      assert.ok(hit, 'no line of the guide names ' + label)
    })
  }
})

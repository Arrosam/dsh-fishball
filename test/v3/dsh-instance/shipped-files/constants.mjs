/**
 * Vocabulary for the shippedFiles cases (the "files" exclusion fix). Every value comes from the
 * requirement relayed by the lead (2026-11-21), never from the implementation:
 * - shippedFiles(root, manifest) resolves to the files a package ships, relative to root with the
 *   platform separator: always 'package.json', plus exactly the manifest "files" entries;
 * - a directory entry ships every regular file beneath it; '*' only in the last segment, within it;
 * - a missing positive entry rejects PLACEMENT_SOURCE_UNAVAILABLE; a symlink in a shipped tree
 *   rejects UNSAFE_PLACEMENT_SOURCE;
 * - NEW: an entry starting with '!' is an exclusion as npm pack reads it: the path (file or folder,
 *   with or without a trailing '/') and everything under it are left out, whatever the order of the
 *   positive entries; a nonexistent exclusion is not refused; a name-prefix sibling is kept.
 * Fixture paths are POSIX here and converted to the platform separator by the cases.
 */
import path from 'node:path'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

/** The public export under test. */
export const SUBJECT = Object.freeze({ file: path.join(V3.instance.dir, 'src', 'native-runtime', 'placement.js'), name: 'shippedFiles' })

export const CODE = Object.freeze({ unavailable: 'PLACEMENT_SOURCE_UNAVAILABLE', unsafe: 'UNSAFE_PLACEMENT_SOURCE' })

export const MANIFEST = 'package.json'
export const TEMP_PREFIX = 'fbtest-shipped-files-'

/**
 * The fixture package every case starts from. ui/tests-helper.js and ui/testsuite/x.js share the
 * name prefix "tests" with the excluded folder ui/tests/ (they must survive "!ui/tests").
 */
export const TREE = Object.freeze([
  'ui/a.js', 'ui/b.css', 'ui/tests/a.test.js', 'ui/tests/deep/b.test.js', 'ui/tests-helper.js', 'ui/testsuite/x.js', 'ui/sub/c.js',
  'src/index.js', 'README.md',
])
const UI_ALL = Object.freeze(TREE.filter((f) => f.startsWith('ui/')))
const without = (list, ...gone) => Object.freeze(list.filter((f) => !gone.includes(f)))
const UI_NO_TESTS = without(UI_ALL, 'ui/tests/a.test.js', 'ui/tests/deep/b.test.js')
const FILES = Object.freeze(['ui/tests/a.test.js', 'ui/tests-helper.js'])
const WILD = Object.freeze(['ui/a.js', 'ui/tests-helper.js', 'ui/tests/a.test.js'])

/**
 * Decision-table column 1: the positive entry kind, its entries, and what each exclusion (column 2
 * key) leaves of the fixture. The order (column 3) never changes the expectation.
 */
export const KINDS = Object.freeze([
  Object.freeze({
    kind: 'folder', positive: Object.freeze(['ui/']),
    expect: Object.freeze({
      none: UI_ALL, folderSlash: UI_NO_TESTS, folderNoSlash: UI_NO_TESTS, file: without(UI_ALL, 'ui/tests/a.test.js'), missing: UI_ALL, prefix: UI_ALL,
    }),
  }),
  Object.freeze({
    kind: 'file', positive: FILES,
    expect: Object.freeze({
      none: FILES, folderSlash: without(FILES, 'ui/tests/a.test.js'), folderNoSlash: without(FILES, 'ui/tests/a.test.js'),
      file: without(FILES, 'ui/tests/a.test.js'), missing: FILES, prefix: FILES,
    }),
  }),
  Object.freeze({
    // '*' within the last segment only: ui/*.js takes neither ui/b.css nor ui/sub/c.js; ui/tests/*.js not deep/.
    kind: 'wildcard', positive: Object.freeze(['ui/*.js', 'ui/tests/*.js']),
    expect: Object.freeze({
      none: WILD, folderSlash: without(WILD, 'ui/tests/a.test.js'), folderNoSlash: without(WILD, 'ui/tests/a.test.js'),
      file: without(WILD, 'ui/tests/a.test.js'), missing: WILD, prefix: WILD,
    }),
  }),
])

/** Decision-table column 2: the exclusion (none = no '!' entry). */
export const EXCLUSIONS = Object.freeze([
  Object.freeze({ key: 'none', entry: null, label: 'no exclusion' }),
  Object.freeze({ key: 'folderSlash', entry: '!ui/tests/', label: 'folder with slash' }),
  Object.freeze({ key: 'folderNoSlash', entry: '!ui/tests', label: 'folder without slash' }),
  Object.freeze({ key: 'file', entry: '!ui/tests/a.test.js', label: 'single file' }),
  Object.freeze({ key: 'missing', entry: '!ui/ghost/', label: 'nonexistent path, not refused' }),
  // One character short of the folder name "tests": it names no path, so it drops nothing
  // (ui/tests/, ui/tests-helper.js and ui/testsuite/ all stay).
  Object.freeze({ key: 'prefix', entry: '!ui/test', label: 'prefix of sibling names' }),
])

/** Decision-table column 3: where the exclusion stands relative to the positive entries. */
export const ORDERS = Object.freeze(['before', 'after'])

/** Boundary and equivalence rows outside the table: [row, title, files, expected shipped files beside package.json]. */
export const EXTRA = Object.freeze([
  ['nested', 'a deeper exclusion "!ui/tests/deep/" keeps ui/tests/a.test.js', ['ui/', '!ui/tests/deep/'], without(UI_ALL, 'ui/tests/deep/b.test.js')],
  ['nested', 'a deeper exclusion without slash "!ui/tests/deep" keeps ui/tests/a.test.js', ['ui/', '!ui/tests/deep'], without(UI_ALL, 'ui/tests/deep/b.test.js')],
  ['equal', 'the exclusion equals the positive folder "!ui/": nothing of it ships', ['ui/', '!ui/'], []],
  ['equal', 'the exclusion names the positive folder without slash "!ui": nothing of it ships', ['ui/', '!ui'], []],
  ['parent', 'a parent-folder exclusion drops the whole ui tree, another entry (src/) still ships', ['ui/', 'src/', '!ui'], ['src/index.js']],
  ['later positive', 'a positive file entry AFTER the exclusion, inside the excluded folder, stays out', ['ui/', '!ui/tests/', 'ui/tests/a.test.js'], UI_NO_TESTS],
  ['later positive', 'a positive folder entry AFTER the exclusion, inside the excluded folder, stays out', ['ui/', '!ui/tests', 'ui/tests/'], UI_NO_TESTS],
  ['only exclusion', 'a list of only an existing exclusion ships package.json alone', ['!ui/tests/'], []],
  ['only exclusion', 'a list of only a nonexistent exclusion ships package.json alone and is not refused', ['!ghost.js'], []],
  ['several', 'two exclusions in one list both apply', ['ui/', '!ui/tests/', '!ui/sub'], without(UI_NO_TESTS, 'ui/sub/c.js')],
  ['top-level file', 'a top-level file exclusion "!README.md" drops that file only', ['README.md', 'src/', '!README.md'], ['src/index.js']],
  ['file prefix', 'an exclusion one character short of a file name ("!ui/a.j") keeps ui/a.js', ['ui/a.js', '!ui/a.j'], ['ui/a.js']],
  ['file prefix', 'an exclusion one character longer than a file name ("!ui/a.jsx", nonexistent) keeps ui/a.js', ['ui/a.js', '!ui/a.jsx'], ['ui/a.js']],
])

/** The refusals the fix must keep: [row, title, files, how the fixture is altered, expected code]. */
export const REFUSALS = Object.freeze([
  ['missing positive', 'a missing positive entry is still refused beside an exclusion', ['ui/', 'ghost/', '!ui/tests/'], null, CODE.unavailable],
  ['symlink', 'a symlink in a shipped part of the tree is refused beside an exclusion', ['ui/', '!ui/tests/'], 'ui/sub/link.js', CODE.unsafe],
])

/** The real case: fishball-core in the sibling checkout lists "ui/" and "!ui/tests/". */
export const REAL_CORE = Object.freeze({
  dir: '/Volumes/SSD1/GitHub/dsh-fishball/packages/core',
  excluded: 'ui/tests/',
  mustShip: 'ui/client.js',
  skip: 'the real fishball-core checkout /Volumes/SSD1/GitHub/dsh-fishball/packages/core is absent',
})

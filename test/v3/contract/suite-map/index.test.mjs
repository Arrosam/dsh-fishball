/**
 * SHELVE-BOARD black-box rows for the test runners (requirement 4). The user, 2026-11-18:
 * "fishball-board先从这次release中移除，我要改的地方太多了。先封存，留到下一批再说。所以不要预留在子实例的Fishball内。"
 * packages/board and its suite stay in the repo; the suite `fishball-board.peers` is listed in
 * test/suites.mjs's export SHELVED_SUITES, and:
 * - `node test/run-affected.mjs <base>` (default selection) and `--all` never select a shelved suite;
 * - `node test/run-v3.mjs` never runs a shelved suite's files;
 * - `--suite=<id>` (exact id or prefix) still runs it;
 * - `node test/run-affected.mjs --check` stays clean.
 *
 * Techniques: Decision Table (selection mode × what changed: a path only the shelved package's triggers
 * claim, the shelved suite's own files, a FULL path, an unmapped path; `--all`; `--suite` naming it by
 * id, by prefix, beside another suite) and EP (shelved vs not shelved files in run-v3's run).
 *
 * Level: system, through the runners' command lines only (`--list` prints the selection and runs
 * nothing). The base-ref and run-v3 rows run on a scratch copy of the runners (test/run-affected.mjs,
 * test/run-v3.mjs, test/suites.mjs and the three support modules they import) in a fresh git repo, so
 * the changed paths and the test files present are this file's choice; run-v3 there runs stand-in test
 * files that only report their own path. `--check` runs on the real checkout.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { NODE, REPO } from '../../../support/constants.mjs'
import { SHELVED_SUITES, SUITES } from '../../../suites.mjs'

const MAP = Object.freeze({
  shelvedId: 'fishball-board.peers',
  shelvedPrefix: 'fishball-board',
  shelvedDir: 'test/v3/fishball-board/peers/',
  /** A suite the board's package triggers too (it boots core, fishball-ui and the board), never shelved. */
  neighbourId: 'fishball-core.wire',
  boardPath: 'packages/board/fbtest-shelve-change.js',
  fullPath: 'test/support/fbtest-shelve-change.mjs',
  unmappedPath: 'fbtest-shelve-unmapped.bin',
  shelvedOwnPath: 'test/v3/fishball-board/peers/fbtest-shelve-change.mjs',
  /** What the scratch copy holds: the runners, the map and the support modules they import. */
  copied: Object.freeze(['test/run-affected.mjs', 'test/run-v3.mjs', 'test/suites.mjs',
    'test/support/constants.mjs', 'test/support/suite-runner.mjs', 'test/support/contract-link.mjs']),
  runAffected: 'test/run-affected.mjs',
  runV3: 'test/run-v3.mjs',
  list: '--list', all: '--all', check: '--check', suite: (ids) => '--suite=' + ids.join(','),
  /** `--list` prints each file indented by two spaces. */
  listed: /^ {2}(\S+\.test\.mjs)$/,
  /** The stand-in test files report their path in their test name, which the spec reporter prints. */
  ran: /FBTEST-RAN (\S+)/g,
  checkLine: /^(\w+): (\d+)$/,
  okExit: 0,
  tempPrefix: 'fbtest-suite-map-',
  git: Object.freeze(['-c', 'user.email=fbtest@example.invalid', '-c', 'user.name=fbtest', '-c', 'commit.gpgsign=false']),
  timeoutMs: 120000,
})

const isShelvedFile = (f) => f.startsWith(MAP.shelvedDir)
const filesOf = (ids) => [...new Set(ids.flatMap((id) => SUITES[id].files))].sort()
const unshelvedIds = () => Object.keys(SUITES).filter((id) => !SHELVED_SUITES.includes(id))

function run(cwd, file, args, env = {}) {
  // Without the outer node:test's context variable: a runner started inside a test would otherwise
  // be told it is a nested test file and skip running its files.
  const { NODE_TEST_CONTEXT: _outer, ...inherited } = process.env
  const r = spawnSync(NODE, [file, ...args], { cwd, encoding: 'utf8', timeout: MAP.timeoutMs, env: { ...inherited, ...env } })
  return { code: r.status, output: `${r.stdout}\n${r.stderr}` }
}
/** The files a `--list` run printed, sorted. */
const listedFiles = (output) => output.split('\n').map((l) => MAP.listed.exec(l)?.[1]).filter(Boolean).sort()

/**
 * A scratch git repo holding the runners, committed once; `change(rel)` adds an untracked file (the
 * runners count untracked files as changed); `standIns(files)` writes a stand-in test file at each path.
 * Removed after the test (guarded: only a folder this file created under the OS temp dir).
 */
function scratchRepo(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), MAP.tempPrefix)))
  t.after(() => {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith(MAP.tempPrefix)) throw new Error('unexpected temp dir ' + root)
    fs.rmSync(root, { recursive: true, force: true })
  })
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text) }
  for (const rel of MAP.copied) write(rel, fs.readFileSync(path.join(REPO, rel), 'utf8'))
  const git = (...args) => {
    const r = spawnSync('git', [...MAP.git, ...args], { cwd: root, encoding: 'utf8' })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'fbtest base')
  return {
    root,
    change: (rel) => write(rel, '// fbtest change\n'),
    standIns: (files) => { for (const f of files) write(f, `import test from 'node:test'\ntest('FBTEST-RAN ${f}', () => {})\n`) },
    affected: (args) => run(root, MAP.runAffected, args),
    // Its own test-homes root: the runner empties that folder first, so it must never be the outer run's.
    v3: () => run(root, MAP.runV3, [], { FBTEST_TEST_HOMES: path.join(root, '.runtime', 'test-homes') }),
  }
}

test('SHELVE-SUITES-00 SHELVED_SUITES is exactly [fishball-board.peers], a suite of the map whose files exist', () => {
  assert.deepEqual([...SHELVED_SUITES], [MAP.shelvedId])
  assert.ok(SUITES[MAP.shelvedId], MAP.shelvedId + ' is not in the map')
  assert.deepEqual(SUITES[MAP.shelvedId].files.filter((f) => !fs.existsSync(path.join(REPO, f))), [])
})

test('SHELVE-SUITES-DT-01 rule 1 --all --list: every suite\'s files but the shelved suite\'s', () => {
  const r = run(REPO, MAP.runAffected, [MAP.all, MAP.list])
  assert.equal(r.code, MAP.okExit, r.output)
  const listed = listedFiles(r.output)
  assert.deepEqual(listed.filter(isShelvedFile), [], 'a shelved file is listed')
  assert.deepEqual(listed, filesOf(unshelvedIds()))
})

for (const [rule, title, changed, expectNeighbour] of [
  ['2', 'a change only the board package\'s triggers claim', MAP.boardPath, true],
  ['3', 'a change to the shelved suite\'s own files only', MAP.shelvedOwnPath, false],
  ['4', 'a FULL path (every suite)', MAP.fullPath, true],
  ['5', 'an unmapped path (every suite, the safe default)', MAP.unmappedPath, true],
]) {
  test(`SHELVE-SUITES-DT-01 rule ${rule} <base> --list after ${title}: the shelved suite is never selected`, (t) => {
    const repo = scratchRepo(t)
    repo.change(changed)
    const r = repo.affected(['HEAD', MAP.list])
    assert.equal(r.code, MAP.okExit, r.output)
    const listed = listedFiles(r.output)
    assert.deepEqual(listed.filter(isShelvedFile), [], 'a shelved file is listed')
    const neighbour = SUITES[MAP.neighbourId].files
    if (expectNeighbour) assert.deepEqual(neighbour.filter((f) => !listed.includes(f)), [], `${MAP.neighbourId} is not selected`)
    else assert.deepEqual(listed, [], 'the shelved suite\'s own change selected other files')
  })
}

for (const [rule, title, ids, expected] of [
  ['6', 'by its exact id', [MAP.shelvedId], [MAP.shelvedId]],
  ['7', 'by its package prefix', [MAP.shelvedPrefix], [MAP.shelvedId]],
  ['8', 'beside another suite', [MAP.shelvedId, MAP.neighbourId], [MAP.shelvedId, MAP.neighbourId]],
]) {
  test(`SHELVE-SUITES-DT-01 rule ${rule} --suite naming the shelved suite ${title} still selects it`, () => {
    const r = run(REPO, MAP.runAffected, [MAP.suite(ids), MAP.list])
    assert.equal(r.code, MAP.okExit, r.output)
    assert.deepEqual(listedFiles(r.output), filesOf(expected))
  })
}

test('SHELVE-SUITES-EP-01 run-v3 runs every V3 test file present except the shelved suite\'s', (t) => {
  const repo = scratchRepo(t)
  const shelved = SUITES[MAP.shelvedId].files
  const other = SUITES[MAP.neighbourId].files
  repo.standIns([...shelved, ...other])
  const r = repo.v3()
  assert.equal(r.code, MAP.okExit, r.output)
  const ran = [...new Set([...r.output.matchAll(MAP.ran)].map((m) => m[1]))].sort()
  assert.deepEqual(ran, [...other].sort(), r.output)
})

test('SHELVE-SUITES-EP-02 run-affected --check (test:map) is clean: every count 0, exit 0', () => {
  const r = run(REPO, MAP.runAffected, [MAP.check])
  assert.equal(r.code, MAP.okExit, r.output)
  const counts = r.output.split('\n').map((l) => MAP.checkLine.exec(l)).filter(Boolean)
  assert.ok(counts.length > 0, 'no count lines: ' + r.output)
  assert.deepEqual(counts.filter((m) => m[2] !== '0').map((m) => m[0]), [])
})

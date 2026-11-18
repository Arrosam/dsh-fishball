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
 * nothing). The base-ref and run-v3 rows run on a scratch copy of the runners, the map and their
 * local dependencies in a fresh git repo, so the changed paths and test files are controlled.
 * run-v3 there runs only stand-in test files. `--check` runs on the real checkout.
 * TEST-SPEED step 2 adds a lane × change classification decision table and a release artifact
 * prerequisite check (absent, present-but-invalid, and complete enough for the targeted assertion).
 * TEST-SPEED step 4 observes SDK order, overlap and environment through scratch-only test files.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { NODE, REPO } from '../../../support/constants.mjs'
import { SHELVED_SUITES, SUITES, V2_GROUPS } from '../../../suites.mjs'
import { PACKAGES, RELEASE } from '../../release/pack/constants.mjs'

const MAP = Object.freeze({
  shelvedId: 'fishball-board.peers',
  shelvedPrefix: 'fishball-board',
  shelvedDir: 'test/v3/fishball-board/peers/',
  /** A never-shelved suite (rules 4, 5, 8, EP-01); it boots core and fishball-ui, no longer the board. */
  neighbourId: 'fishball-core.wire',
  /**
   * Rule 2's neighbour: a never-shelved suite that still triggers on packages/board. fishball-core.wire
   * no longer does: the user shelved the board on 2026-11-18 and 9f5a4228 removed wire's packages/board
   * trigger. package-boundaries reads every package (test/suites.mjs), the board included, since its
   * SHELVE-EP-01 and feature-edge rows bound the board itself, so a board change must still rerun it.
   */
  boardNeighbourId: 'contract.package-boundaries',
  boardPath: 'packages/board/fbtest-shelve-change.js',
  fullPath: 'test/support/fbtest-shelve-change.mjs',
  unmappedPath: 'fbtest-shelve-unmapped.bin',
  shelvedOwnPath: 'test/v3/fishball-board/peers/fbtest-shelve-change.mjs',
  /** What the scratch copy holds: the runners, the map and the local modules they import. */
  copied: Object.freeze(['test/run-affected.mjs', 'test/run-v3.mjs', 'test/suites.mjs',
    'test/support/constants.mjs', 'test/support/suite-runner.mjs', 'test/support/contract-link.mjs',
    'test/v3/contract/suite-map/affected-cases.mjs']),
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

const LANE = Object.freeze({
  legacy: '--lane=legacy',
  base: 'HEAD',
  sharedPath: 'packages/dsh-connector/src/mcp/tools/handlers.js',
  v3OwnPath: 'test/v3/dsh-connector/schema-value/index.test.mjs',
  v3OwnId: 'dsh-connector.schema-value',
  v3Id: 'dsh-connector.mcp-tools',
  legacyId: 'v2.connector-host',
  legacyOwnPath: 'test/v2-pg-origin-frame-policy.test.mjs',
  legacyOwnId: 'v2.connector-ui',
})

const RELEASE_GATE = Object.freeze({
  suiteId: 'release.pack',
  sdk: '--sdk=0.2.1-rc.5',
  entry: 'test/v3/release/pack/sdk-0.2.1-rc.5.test.mjs',
  strict: '--release-check',
  env: 'FBTEST_RELEASE_REQUIRED',
  on: '1',
  off: '',
  directory: 'release-fixture',
  contents: 'not a tarball',
  reason: /^﹣ REL-EP-01 .* # release folder missing$/m,
  testArgs: Object.freeze(['--test', '--test-reporter=spec']),
  smokePatterns: Object.freeze(['^REL-EP-01 ', '^REL-ORACLE junk ']),
  parserPattern: '^REL-ORACLE tar dsh-agent-connector ',
  negativePattern: '^REL-ST-01 absent ',
  passes: /✔ REL-ORACLE junk /,
  negativePasses: /✔ REL-ST-01 absent /,
  layoutFails: /✖ REL-EP-01 /,
  parserFails: /✖ REL-ORACLE tar dsh-agent-connector /,
})

const SCHEDULER = Object.freeze({
  serial: '--serial',
  parallel: '--parallel',
  both: '--sdk=both',
  sdks: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  suites: Object.freeze(['dsh-connector.mcp-tools', 'dsh-connector.schema-value']),
  versionedEntry: (sdk) => `test/v3/dsh-connector/mcp-tools/sdk-${sdk}.test.mjs`,
  unversionedEntry: 'test/v3/dsh-connector/schema-value/index.test.mjs',
  runtimesDir: 'sdk-roots',
  runtimeLeaf: 'node_modules',
  anchor: '.runtime/test-homes',
  sentinel: 'anchor-owner.txt',
  sentinelText: 'caller-owned; keep',
  observationsDir: (run) => `scheduler-observations-${run}`,
  observationsEnv: 'FBTEST_SCHEDULER_OBSERVATIONS',
  observer: 'test/scheduler-probe.mjs',
  env: Object.freeze({ versions: 'FBTEST_DSH_VERSIONS', runtime: 'FBTEST_DSH_RUNTIME', homes: 'FBTEST_TEST_HOMES', home: 'HOME', tmp: 'TMPDIR' }),
  serialFiles: 1,
  maxParallelFiles: 3,
  pollMs: 20,
  rendezvousMs: 10000,
  concurrencyArg: '--test-concurrency=',
  marker: (entry, phase) => `${path.basename(entry)}.${phase}`,
  start: 'started',
  exit: 'exited',
})

const isShelvedFile = (f) => f.startsWith(MAP.shelvedDir)
const filesOf = (ids) => [...new Set(ids.flatMap((id) => SUITES[id].files))].sort()
const laneIds = (legacy = false) => Object.keys(SUITES).filter((id) => !SHELVED_SUITES.includes(id) && Object.hasOwn(V2_GROUPS, id) === legacy)

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
  // Each scratch runner empties the test-homes root it owns, never the outer run's.
  const homes = { FBTEST_TEST_HOMES: path.join(root, '.runtime', 'test-homes') }
  return {
    root,
    write,
    change: (rel) => write(rel, '// fbtest change\n'),
    standIns: (files) => { for (const f of files) write(f, `import test from 'node:test'\ntest('FBTEST-RAN ${f}', () => {})\n`) },
    affected: (args, env) => run(root, MAP.runAffected, args, { ...homes, ...env }),
    v3: () => run(root, MAP.runV3, [], homes),
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
  assert.deepEqual(listed, filesOf(laneIds()))
})

// The last column is the suite that must be selected too, or null when nothing else may be.
for (const [rule, title, changed, neighbourId] of [
  // Repointed from MAP.neighbourId (fishball-core.wire), whose packages/board trigger 9f5a4228 removed
  // when the user shelved the board (2026-11-18); see MAP.boardNeighbourId.
  ['2', 'a change only the board package\'s triggers claim', MAP.boardPath, MAP.boardNeighbourId],
  ['3', 'a change to the shelved suite\'s own files only', MAP.shelvedOwnPath, null],
  ['4', 'a FULL path (every suite)', MAP.fullPath, MAP.neighbourId],
  ['5', 'an unmapped path (every suite, the safe default)', MAP.unmappedPath, MAP.neighbourId],
]) {
  test(`SHELVE-SUITES-DT-01 rule ${rule} <base> --list after ${title}: the shelved suite is never selected`, (t) => {
    const repo = scratchRepo(t)
    repo.change(changed)
    const r = repo.affected(['HEAD', MAP.list])
    assert.equal(r.code, MAP.okExit, r.output)
    const listed = listedFiles(r.output)
    assert.deepEqual(listed.filter(isShelvedFile), [], 'a shelved file is listed')
    if (neighbourId) assert.deepEqual(SUITES[neighbourId].files.filter((f) => !listed.includes(f)), [], `${neighbourId} is not selected`)
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

test('TEST-SPEED-LANE --all --lane=legacy lists exactly the legacy groups', () => {
  const r = run(REPO, MAP.runAffected, [MAP.all, LANE.legacy, MAP.list])
  assert.equal(r.code, MAP.okExit, r.output)
  assert.deepEqual(listedFiles(r.output), filesOf(laneIds(true)))
})

for (const [title, changed, v3, legacy] of [
  ['shared source', LANE.sharedPath, [LANE.v3Id], [LANE.legacyId]],
  ['V3-owned path', LANE.v3OwnPath, [LANE.v3OwnId], []],
  ['legacy-owned path', LANE.legacyOwnPath, [], [LANE.legacyOwnId]],
  ['full trigger', MAP.fullPath, laneIds(), laneIds(true)],
  ['unmapped fallback', MAP.unmappedPath, laneIds(), laneIds(true)],
]) {
  test(`TEST-SPEED-LANE affected ${title} cannot cross lanes`, (t) => {
    const repo = scratchRepo(t)
    repo.change(changed)
    for (const [lane, expected, other] of [[[], v3, true], [[LANE.legacy], legacy, false]]) {
      const r = repo.affected([LANE.base, ...lane, MAP.list])
      assert.equal(r.code, MAP.okExit, r.output)
      const listed = listedFiles(r.output)
      const required = filesOf(expected)
      const forbidden = filesOf([...laneIds(other), MAP.shelvedId])
      assert.deepEqual(forbidden.filter((f) => listed.includes(f)), [], r.output)
      assert.deepEqual(required.filter((f) => !listed.includes(f)), [], r.output)
      if (required.length === 0) assert.deepEqual(listed, [], r.output)
    }
  })
}

test('TEST-SPEED-LANE explicit --suite bypasses either lane, including for shelved files', () => {
  const expected = [LANE.v3Id, LANE.legacyId, MAP.shelvedId]
  for (const lane of [[], [LANE.legacy]]) {
    const r = run(REPO, MAP.runAffected, [MAP.suite(expected), ...lane, MAP.list])
    assert.equal(r.code, MAP.okExit, r.output)
    assert.deepEqual(listedFiles(r.output), filesOf(expected))
  }
})

test('TEST-SPEED-RELEASE --release-check enables strict prerequisites in the child', (t) => {
  const repo = scratchRepo(t)
  repo.write(RELEASE_GATE.entry, `import assert from 'node:assert/strict'
import test from 'node:test'
test('strict release prerequisite', () => assert.equal(process.env.${RELEASE_GATE.env}, ${JSON.stringify(RELEASE_GATE.on)}))
`)
  const r = repo.affected([MAP.suite([RELEASE_GATE.suiteId]), RELEASE_GATE.sdk, RELEASE_GATE.strict], { [RELEASE_GATE.env]: RELEASE_GATE.off })
  assert.equal(r.code, MAP.okExit, r.output)
})

function releaseCaseRun(repo, pattern, strict = false) {
  // These name filters allow only filesystem/pack-format rows; no host, install, or listener rows run.
  return run(REPO, RELEASE_GATE.testArgs[0], [...RELEASE_GATE.testArgs.slice(1), `--test-name-pattern=${pattern}`, RELEASE_GATE.entry], {
    [RELEASE.env]: path.join(repo.root, RELEASE_GATE.directory),
    [RELEASE_GATE.env]: strict ? RELEASE_GATE.on : RELEASE_GATE.off,
  })
}

for (const [title, strict, setup, pattern, fails, skips] of [
  ['absent artifact directory skips but the independent oracle runs', false, () => {}, RELEASE_GATE.smokePatterns.join('|'), null, true],
  ['absent artifact directory fails in strict mode', true, () => {}, RELEASE_GATE.smokePatterns.join('|'), RELEASE_GATE.layoutFails, false],
  ['existing empty directory fails', false, (r) => fs.mkdirSync(path.join(r.root, RELEASE_GATE.directory)), RELEASE_GATE.smokePatterns.join('|'), RELEASE_GATE.layoutFails, false],
  ['a regular file at the release path fails', false, (r) => r.write(RELEASE_GATE.directory, RELEASE_GATE.contents), RELEASE_GATE.smokePatterns.join('|'), RELEASE_GATE.layoutFails, false],
  ['partial directory with a corrupt tarball fails', false, (r) => r.write(path.join(RELEASE_GATE.directory, PACKAGES.connector.tarball), RELEASE_GATE.contents),
    [...RELEASE_GATE.smokePatterns, RELEASE_GATE.parserPattern].join('|'), RELEASE_GATE.parserFails, false],
]) {
  test(`TEST-SPEED-RELEASE ${title}`, (t) => {
    const repo = scratchRepo(t)
    setup(repo)
    const r = releaseCaseRun(repo, pattern, strict)
    assert.match(r.output, RELEASE_GATE.passes, r.output)
    if (fails) {
      assert.notEqual(r.code, MAP.okExit, r.output)
      assert.match(r.output, fails, r.output)
    } else assert.equal(r.code, MAP.okExit, r.output)
    assert.equal(RELEASE_GATE.reason.test(r.output), skips, r.output)
  })
}

test('TEST-SPEED-RELEASE pack --check missing-directory negative control still runs', (t) => {
  const r = releaseCaseRun(scratchRepo(t), RELEASE_GATE.negativePattern)
  assert.equal(r.code, MAP.okExit, r.output)
  assert.match(r.output, RELEASE_GATE.negativePasses, r.output)
  assert.doesNotMatch(r.output, RELEASE_GATE.reason, r.output)
})

function schedulerFixture(t) {
  const s = SCHEDULER
  const repo = scratchRepo(t)
  const versioned = s.sdks.map(s.versionedEntry)
  const entries = [...versioned, s.unversionedEntry]
  const anchor = path.join(repo.root, s.anchor)
  const runtimes = path.join(repo.root, s.runtimesDir)
  const sentinel = path.join(s.anchor, s.sentinel)
  repo.write(sentinel, s.sentinelText)
  for (const sdk of s.sdks) fs.mkdirSync(path.join(runtimes, sdk, s.runtimeLeaf), { recursive: true })

  // A versioned test waits for its peer's start marker in parallel mode. This proves overlap
  // without a timing benchmark. Exit markers are written on process exit, not at test-body completion.
  repo.write(s.observer, `import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'
const names = ${JSON.stringify(s.env)}
export function observe(entry, started, exited, peers, waitForPeers) {
  const dir = process.env.${s.observationsEnv}
  const file = (name) => path.join(dir, name)
  const env = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, process.env[name]]))
  test(entry, async () => {
    const prefix = ${JSON.stringify(s.concurrencyArg)}
    const concurrency = Number(process.execArgv.findLast((arg) => arg.startsWith(prefix))?.slice(prefix.length))
    const before = fs.readdirSync(dir)
    const directories = [env.home, env.tmp, env.homes].map((dir) => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory())
    // Exclusive creation catches a second execution of an unsuffixed test in the other SDK job.
    fs.writeFileSync(file(started), JSON.stringify({ env, concurrency, before, directories }), { flag: 'wx' })
    process.on('exit', () => fs.writeFileSync(file(exited), ''))
    if (!waitForPeers) return
    const limit = Date.now() + ${s.rendezvousMs}
    while (!peers.every((name) => fs.existsSync(file(name)))) {
      assert.ok(Date.now() < limit, 'the other SDK did not start while this process was running')
      await setTimeout(${s.pollMs})
    }
  })
}
`)

  const priorHomes = new Set()
  let runNumber = 0
  return {
    run(mode) {
      const parallel = mode === s.parallel
      const observed = path.join(repo.root, s.observationsDir(++runNumber))
      fs.mkdirSync(observed)
      for (const entry of entries) {
        const peers = versioned.filter((f) => f !== entry).map((f) => s.marker(f, s.start))
        const args = [entry, s.marker(entry, s.start), s.marker(entry, s.exit), peers, parallel && versioned.includes(entry)]
        const observer = path.posix.relative(path.posix.dirname(entry), s.observer)
        repo.write(entry, `import { observe } from ${JSON.stringify(observer)}\nobserve(...${JSON.stringify(args)})\n`)
      }
      const r = repo.affected([MAP.suite(s.suites), s.both, ...(mode ? [mode] : [])], {
        [s.env.homes]: anchor,
        [s.env.versions]: runtimes,
        [s.observationsEnv]: observed,
      })
      assert.equal(r.code, MAP.okExit, r.output)
      assert.equal(fs.readFileSync(path.join(repo.root, sentinel), 'utf8'), s.sentinelText, 'the shared anchor was modified')
      assert.deepEqual(fs.readdirSync(observed).sort(), entries.flatMap((entry) => [s.marker(entry, s.start), s.marker(entry, s.exit)]).sort())
      const seen = (entry) => JSON.parse(fs.readFileSync(path.join(observed, s.marker(entry, s.start)), 'utf8'))
      const [first, second] = versioned.map(seen)
      const unversioned = seen(s.unversionedEntry)
      assert.deepEqual(unversioned.env, first.env, 'the unversioned entry must run in the first SDK job')
      for (const [index, job] of [first, second].entries()) {
        const { runtime, homes, home, tmp } = job.env
        assert.equal(runtime, path.join(runtimes, s.sdks[index], s.runtimeLeaf))
        const rel = path.relative(anchor, homes)
        assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), `not a private test-homes descendant of ${anchor}: ${homes}`)
        assert.ok(path.isAbsolute(home) && path.isAbsolute(tmp), `the SDK must receive absolute HOME/TMPDIR: ${JSON.stringify(job.env)}`)
        assert.ok(job.directories.every(Boolean), `the SDK directories did not exist at execution: ${JSON.stringify(job.env)}`)
      }
      for (const key of ['homes', 'home', 'tmp']) assert.notEqual(first.env[key], second.env[key], `SDK jobs share ${s.env[key]}`)
      for (const job of [first, second, unversioned]) {
        if (parallel) assert.ok(Number.isInteger(job.concurrency) && job.concurrency > s.serialFiles && job.concurrency <= s.maxParallelFiles)
        else assert.equal(job.concurrency, s.serialFiles)
      }
      if (!parallel) {
        const secondStart = s.marker(versioned[1], s.start)
        assert.ok(!first.before.includes(secondStart), 'second SDK ran before first SDK')
        for (const entry of [versioned[0], s.unversionedEntry]) {
          assert.ok(second.before.includes(s.marker(entry, s.exit)), `second SDK started before ${entry} exited`)
        }
      }
      for (const { env } of [first, second]) {
        assert.ok(!priorHomes.has(env.homes), `successive runs reused ${env.homes}`)
        priorHomes.add(env.homes)
      }
    },
  }
}

test('TEST-SPEED-SCHEDULER default and --serial serialize SDK jobs and files, using fresh homes on each run', (t) => {
  const fixture = schedulerFixture(t)
  fixture.run()
  fixture.run(SCHEDULER.serial)
})

test('TEST-SPEED-SCHEDULER --parallel overlaps SDK jobs with bounded files and isolated environments', (t) => {
  schedulerFixture(t).run(SCHEDULER.parallel)
})

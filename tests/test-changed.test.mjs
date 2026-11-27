import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_CLI = fileURLToPath(new URL('../scripts/test.mjs', import.meta.url));
const FIXTURE = Object.freeze({
  baseline: 'staging',
  branch: 'feature',
  invalidRef: 'missing-base-ref',
  changedContent: 'new contents\n',
  timeoutMs: 15_000,
  sharedPath: 'package-lock.json',
  unmappedPath: 'packages/alpha-other/source.txt',
  ignoredFile: 'ignored.txt',
  manifest: 'package.json',
  alpha: { name: '@fixture/alpha', dir: 'packages/alpha', file: 'src/alpha.txt' },
  eta: { name: '@fixture/eta', dir: 'packages/eta', file: 'src/eta.txt' },
  nested: { name: '@fixture/nested', dir: 'packages/alpha/nested', file: 'src/nested.txt' },
  // Path ordering must not accidentally stand in for sorting by npm name.
  zeta: { name: '@fixture/zeta', dir: 'packages/aaa', file: 'src/zeta.txt' },
  matrix: { name: '@fixture/matrix', dir: 'integration/matrix', file: 'src/matrix.txt' },
  suite: { name: '@fixture/integration-suite', dir: 'packages/integration-suite', file: 'src/suite.txt' },
});
const LISTED = [FIXTURE.alpha, FIXTURE.eta, FIXTURE.nested, FIXTURE.zeta];
const RELEASE_ONLY = [FIXTURE.matrix, FIXTURE.suite];
const DISPATCH = Object.freeze({
  tempPrefix: 'fishball-dispatch-',
  callerHomeDir: 'caller-home',
  workerTempDir: 'worker-temp',
  logFile: 'runs.jsonl',
  suite: 'tests/dispatch.test.mjs',
  failure: 'intentional fixture failure',
});

function pkgPath(pkg, file = pkg.file) {
  return join(pkg.dir, file);
}

function fixture(t, { cliEnv = {}, setup } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'fishball-changed-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  // A caller's Git worktree variables, config, and hooks must never affect this repo.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  // Let the CLI start its own Node test runner rather than inherit this worker's context.
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull });
  function run(command, args, overrides = {}) {
    const result = spawnSync(command, args, {
      cwd, env: { ...env, ...overrides }, encoding: 'utf8', timeout: FIXTURE.timeoutMs,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return result;
  }

  function git(...args) {
    const result = run('git', args);
    assert.equal(result.status, 0, result.stderr);
  }

  function write(path, content = FIXTURE.changedContent) {
    const target = join(cwd, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  function json(path, value) {
    write(path, JSON.stringify(value) + '\n');
  }

  function commit(message) {
    git('add', '--all');
    git('commit', '-m', message);
  }

  git('init', '--initial-branch', FIXTURE.baseline, '--template=');
  git('config', 'user.name', 'Fishball Test Fixture');
  git('config', 'user.email', 'fishball-test@example.invalid');
  json(FIXTURE.manifest, {
    name: '@fixture/root',
    private: true,
    workspaces: ['packages/*', FIXTURE.nested.dir, 'integration/*'],
  });
  json(FIXTURE.sharedPath, { lockfileVersion: 3 });
  write('.gitignore', FIXTURE.ignoredFile + '\n');
  for (const pkg of [...LISTED, ...RELEASE_ONLY]) {
    json(pkgPath(pkg, FIXTURE.manifest), {
      name: pkg.name,
      version: '1.0.0',
      // --list must never execute the workspace command.
      scripts: { test: 'node --eval "process.exit(97)"' },
    });
    write(pkgPath(pkg), `${pkg.name} baseline contents\n`);
  }
  setup?.(write);
  commit('Create fixture workspaces');
  git('switch', '-c', FIXTURE.branch);

  const runCli = (...args) => run(process.execPath, [TEST_CLI, ...args], cliEnv);
  return {
    git,
    write,
    commit,
    list: (...args) => runCli('--changed', ...args, '--list'),
    runCli,
  };
}

function assertSelection(result, ...packages) {
  const { status, stdout, stderr } = result;
  assert.equal(status, 0, stderr);
  const selected = stdout ? stdout.replace(/\r?\n$/, '').split(/\r?\n/) : [];
  assert.deepEqual(selected, packages.map(({ name }) => name), stderr);
  return stderr;
}

function assertUsageError(result) {
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.trim(), 'expected a CLI diagnostic');
  return result.stderr;
}

test('default base uses the merge base of local staging; --base compares directly to the ref', (t) => {
  const repo = fixture(t);
  repo.write(pkgPath(FIXTURE.zeta));
  repo.commit('Change feature workspace');
  repo.git('switch', FIXTURE.baseline);
  repo.write(pkgPath(FIXTURE.alpha));
  repo.commit('Advance staging independently');
  repo.git('switch', FIXTURE.branch);

  assertSelection(repo.list(), FIXTURE.zeta);
  assertSelection(repo.list('--base', FIXTURE.baseline), FIXTURE.alpha, FIXTURE.zeta);
  assertSelection(repo.list('--base', 'HEAD'));
});

test('includes staged, unstaged, and nonignored untracked files without duplicates', (t) => {
  const repo = fixture(t);
  assertSelection(repo.list());

  const staged = pkgPath(FIXTURE.zeta);
  repo.write(staged);
  repo.git('add', '--', staged);
  assertSelection(repo.list(), FIXTURE.zeta);

  repo.write(staged, 'different contents after staging\n');
  repo.write(pkgPath(FIXTURE.alpha));
  repo.write(pkgPath(FIXTURE.nested, 'src/untracked file.txt'));
  repo.write(pkgPath(FIXTURE.eta, FIXTURE.ignoredFile));
  for (const args of [[], ['--base', FIXTURE.baseline]]) {
    const stderr = assertSelection(repo.list(...args), FIXTURE.alpha, FIXTURE.nested, FIXTURE.zeta);
    assert.ok(!stderr.includes(FIXTURE.ignoredFile), stderr);
  }
});

test('assigns nested files to the deepest workspace and does not match sibling prefixes', (t) => {
  const repo = fixture(t);
  repo.write(pkgPath(FIXTURE.nested));
  repo.write(FIXTURE.unmappedPath);

  const stderr = assertSelection(repo.list(), FIXTURE.nested);
  assert.ok(stderr.includes(FIXTURE.unmappedPath), stderr);
  assert.match(stderr, /no mapping|unmapped|unknown|unowned|not mapped/i);
  assert.ok(LISTED.every(({ name }) => !stderr.includes(name)), stderr);
});

test('selects owners of staged file additions and deletions and both sides of a rename', (t) => {
  const repo = fixture(t);
  const added = pkgPath(FIXTURE.alpha, 'src/new.txt');
  repo.write(added);
  repo.git('add', '--', added);
  assertSelection(repo.list(), FIXTURE.alpha);

  repo.git('rm', '--', pkgPath(FIXTURE.eta));
  assertSelection(repo.list(), FIXTURE.alpha, FIXTURE.eta);

  const renamed = pkgPath(FIXTURE.zeta, 'src/moved from nested.txt');
  repo.git('mv', '--', pkgPath(FIXTURE.nested), renamed);
  assertSelection(repo.list(), FIXTURE.alpha, FIXTURE.eta, FIXTURE.nested, FIXTURE.zeta);
});

test('release-only workspaces are omitted even when they are changed', (t) => {
  const repo = fixture(t);
  for (const pkg of RELEASE_ONLY) repo.write(pkgPath(pkg));
  assertSelection(repo.list());

  repo.write(pkgPath(FIXTURE.alpha));
  assertSelection(repo.list(), FIXTURE.alpha);
});

test('shared changes report affected packages but do not select them', (t) => {
  const repo = fixture(t);
  repo.write(FIXTURE.sharedPath, '{"lockfileVersion":3,"packages":{}}\n');

  const stderr = assertSelection(repo.list());
  for (const token of [FIXTURE.sharedPath, ...LISTED.map(({ name }) => name)]) {
    assert.ok(stderr.includes(token), stderr);
  }

  repo.write(pkgPath(FIXTURE.alpha));
  assertSelection(repo.list(), FIXTURE.alpha);
});

test('a clean repo and a repo changed only in ignored files select nothing', (t) => {
  const repo = fixture(t);
  assertSelection(repo.list('--base', FIXTURE.baseline));
  repo.write(pkgPath(FIXTURE.eta, FIXTURE.ignoredFile));
  const stderr = assertSelection(repo.list());
  assert.ok(!stderr.includes(FIXTURE.ignoredFile), stderr);
});

test('rejects invalid refs and malformed CLI arguments instead of treating them as no changes', (t) => {
  const repo = fixture(t);
  const stderr = assertUsageError(repo.list('--base', FIXTURE.invalidRef));
  assert.ok(stderr.includes(FIXTURE.invalidRef), stderr);
  assertUsageError(repo.runCli('--changed', '--list', '--base'));
  assertUsageError(repo.list('--unsupported-option'));
});

test('--changed runs only the changed regular workspace in an isolated HOME and propagates failure', (t) => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), DISPATCH.tempPrefix)));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const callerHome = join(scratch, DISPATCH.callerHomeDir);
  const workerTemp = join(scratch, DISPATCH.workerTempDir);
  const log = join(scratch, DISPATCH.logFile);
  mkdirSync(callerHome);
  mkdirSync(workerTemp);
  const target = FIXTURE.alpha;

  function probeSource(pkg, failure = null) {
    return [
      "import { appendFileSync, realpathSync } from 'node:fs';",
      "import test from 'node:test';",
      `test(${JSON.stringify(pkg.name)}, () => {`,
      `  const event = { pkg: ${JSON.stringify(pkg.name)}, home: realpathSync(process.env.HOME) };`,
      `  appendFileSync(${JSON.stringify(log)}, JSON.stringify(event) + '\\n');`,
      failure ? `  throw new Error(${JSON.stringify(failure)});` : '',
      '});',
    ].join('\n');
  }

  const repo = fixture(t, {
    cliEnv: { HOME: callerHome, TMPDIR: workerTemp },
    setup(write) {
      // The probes must be part of staging so only actual workspace edits are selected.
      for (const pkg of [...LISTED, ...RELEASE_ONLY]) {
        write(pkgPath(pkg, DISPATCH.suite), probeSource(pkg));
      }
    },
  });
  for (const pkg of [target, ...RELEASE_ONLY]) repo.write(pkgPath(pkg));

  function runChanged(expectSuccess) {
    writeFileSync(log, '');
    const { status, stdout, stderr } = repo.runCli('--changed');
    const output = stdout + stderr;
    assert.ok(Number.isInteger(status), output);
    assert.equal(status === 0, expectSuccess, output);
    const events = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(events.map(({ pkg }) => pkg), [target.name], output);
    const [{ home }] = events;
    assert.ok(isAbsolute(home), output);
    assert.notEqual(home, callerHome, output);
  }

  runChanged(true);
  repo.write(pkgPath(target, DISPATCH.suite), probeSource(target, DISPATCH.failure));
  runChanged(false);
});

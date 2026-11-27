import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_CLI = fileURLToPath(new URL('../scripts/test.mjs', import.meta.url));
const FIXTURE = Object.freeze({
  app: { name: '@fixture/app', dir: 'packages/app' },
  sibling: { name: '@fixture/app-tools', dir: 'packages/app-tools' },
  nested: { name: '@fixture/nested', dir: 'packages/app/nested' },
  manifest: 'package.json',
  entry: 'tests/entry.test.mjs',
  commonJsHelper: 'tests/check.cjs',
  nestedEntry: 'tests/nested.test.mjs',
  devEntry: 'tests/dev.test.mjs',
  localHelper: 'tests/local.mjs',
  version: '1.0.0',
  timeoutMs: 15_000,
  runtime: '@fixture/runtime',
  peer: 'fixture-peer',
  dev: 'fixture-dev',
  rootDependency: 'fixture-root-dependency',
  undeclared: 'fixture-not-declared',
});

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'fishball-independence-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  function write(path, content) {
    const target = join(cwd, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  function manifest(path, fields) {
    write(path, JSON.stringify(fields) + '\n');
  }

  function source(pkg, lines, file = FIXTURE.entry) {
    const path = posix.join(pkg.dir, file);
    write(path, lines.join('\n') + '\n');
    return path;
  }

  manifest(FIXTURE.manifest, {
    name: '@fixture/root',
    private: true,
    workspaces: ['packages/*', FIXTURE.nested.dir],
    dependencies: { [FIXTURE.rootDependency]: FIXTURE.version },
  });
  for (const pkg of [FIXTURE.app, FIXTURE.sibling, FIXTURE.nested]) {
    manifest(posix.join(pkg.dir, FIXTURE.manifest), {
      name: pkg.name,
      version: FIXTURE.version,
      scripts: { test: 'node --eval "process.exit(97)"' },
      ...(pkg === FIXTURE.app && {
        dependencies: {
          [FIXTURE.runtime]: FIXTURE.version,
          [FIXTURE.sibling.name]: FIXTURE.version,
        },
        peerDependencies: { [FIXTURE.peer]: FIXTURE.version },
        devDependencies: { [FIXTURE.dev]: FIXTURE.version },
      }),
    });
    source(pkg, ['export default true;'], pkg === FIXTURE.nested ? FIXTURE.nestedEntry : FIXTURE.entry);
  }

  function list(pkg) {
    const result = spawnSync(process.execPath, [TEST_CLI, pkg.name, '--list'], {
      cwd,
      encoding: 'utf8',
      timeout: FIXTURE.timeoutMs,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return { status: result.status, stdout: result.stdout, output: result.stderr + result.stdout };
  }

  return { list, source };
}

function assertListed({ status, stdout, output }, pkg, ...files) {
  assert.equal(status, 0, output);
  const listed = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.endsWith('.test.mjs'));
  assert.deepEqual(listed.sort(), files.map((file) => posix.join(pkg.dir, file)).sort(), output);
}

function assertRejected({ status, output }, path, lineNumber, specifier) {
  const location = `${path}:${lineNumber}`;
  assert.notEqual(status, 0, output);
  assert.ok(output.split(/\r?\n/).some((line) => {
    const offset = line.indexOf(location);
    const following = line[offset + location.length] ?? '';
    return offset >= 0 && line[offset - 1] !== '/' && !/\d/.test(following) && line.includes(specifier);
  }), `expected ${location} with ${specifier}; got:\n${output}`);
}

test('accepts declared dependencies, peers, dev dependencies, builtins, and local files', (t) => {
  const repo = fixture(t);
  repo.source(FIXTURE.app, ['export default true;'], FIXTURE.localHelper);
  repo.source(FIXTURE.app, [
    `import '${FIXTURE.runtime}/public';`,
    `import '${FIXTURE.sibling.name}';`,
    `void import('${FIXTURE.peer}');`,
    "import 'node:fs/promises';",
    `import './${posix.basename(FIXTURE.localHelper)}';`,
    `import './${posix.basename(FIXTURE.commonJsHelper)}';`,
  ]);
  repo.source(FIXTURE.app, ["require('path');"], FIXTURE.commonJsHelper);
  repo.source(FIXTURE.app, [`import '${FIXTURE.dev}';`], FIXTURE.devEntry);

  assertListed(repo.list(FIXTURE.app), FIXTURE.app, FIXTURE.entry, FIXTURE.devEntry);
});

const UNDECLARED_REFERENCES = [
  { name: 'static import of an undeclared workspace', specifier: FIXTURE.nested.name,
    declaration: (specifier) => `import '${specifier}';` },
  { name: 'require of a root-only dependency', specifier: FIXTURE.rootDependency,
    declaration: (specifier) => `require('${specifier}');`, file: FIXTURE.commonJsHelper },
  { name: 'dynamic import of an undeclared external', specifier: `${FIXTURE.undeclared}/public`,
    declaration: (specifier) => `void import('${specifier}');` },
];

const CROSS_WORKSPACE_REFERENCES = [
  { name: 'relative import of a declared sibling',
    specifier: posix.relative(
      posix.dirname(posix.join(FIXTURE.app.dir, FIXTURE.entry)),
      posix.join(FIXTURE.sibling.dir, FIXTURE.entry),
    ),
    declaration: (specifier) => `import '${specifier}';` },
  { name: 'relative URL into a nested workspace',
    specifier: `../nested/${FIXTURE.nestedEntry}`,
    declaration: (specifier) => `new URL('${specifier}', import.meta.url);` },
  { name: 'repo-relative path literal into a sibling',
    specifier: posix.join(FIXTURE.sibling.dir, FIXTURE.entry),
    declaration: (specifier) => `export const filename = '${specifier}';` },
];

for (const { name, specifier, declaration, file } of [...UNDECLARED_REFERENCES, ...CROSS_WORKSPACE_REFERENCES]) {
  test(`rejects ${name} with the reference location`, (t) => {
    const repo = fixture(t);
    const preamble = '// The reference is not on the first line.';
    const path = repo.source(FIXTURE.app, [preamble, declaration(specifier)], file);
    if (file === FIXTURE.commonJsHelper) {
      repo.source(FIXTURE.app, [`import './${posix.basename(file)}';`]);
    }

    assertRejected(repo.list(FIXTURE.app), path, 2, specifier);
  });
}

test('scans a nested workspace only for its own package selection', (t) => {
  const repo = fixture(t);
  assertListed(repo.list(FIXTURE.nested), FIXTURE.nested, FIXTURE.nestedEntry);

  const specifier = FIXTURE.runtime;
  const path = repo.source(FIXTURE.nested, [`import '${specifier}';`], FIXTURE.nestedEntry);

  assertListed(repo.list(FIXTURE.app), FIXTURE.app, FIXTURE.entry);
  assertRejected(repo.list(FIXTURE.nested), path, 1, specifier);
});

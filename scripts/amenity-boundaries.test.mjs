import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkAmenity } from './amenity-boundaries.mjs';

const LAYOUT = {
  board: ['amenities/board', 'fishball-board'],
  consultant: ['amenities/consultant', 'fishball-consultant'],
  heartbeat: ['amenities/heartbeat', 'fishball-heartbeat'],
  taskboard: ['amenities/taskboard', 'fishball-taskboard'],
  watchdog: ['amenities/watchdog', 'dsh-connector-watchdog'],
  adapter: ['dsh-connector/packages/dsh-connector-adapter', 'dsh-connector-adapter'],
  fishballUmbrella: ['amenities/fishball-amenities', 'fishball-amenities'],
  connectorUmbrella: ['amenities/connector-amenities', 'dsh-connector-amenities'],
  core: ['dsh-fishball/packages/core', 'fishball-core'],
  fishballShared: ['dsh-fishball/packages/shared', 'fishball-shared'],
  connector: ['dsh-connector/packages/dsh-connector', 'dsh-agent-connector'],
  connectorShared: ['dsh-connector/packages/dsh-connector-shared', 'dsh-connector-shared'],
};
const FIXTURE = {
  version: '1.0.0',
  // Keep the approved amenity directory but vary its manifest name to exercise scoped parsing.
  scopedConsultant: '@fixture/fishball-consultant',
  scopedAlias: '@fixture/aliased-amenity',
  entry: 'src/index.js',
  feature: 'src/feature.js',
  privateHelper: 'src/private/shared.js',
  emptyModule: 'export {};\n',
};

function writeFixtureFile(directory, file, content) {
  const output = join(directory, file);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, content);
}

function fixture(t, { scoped = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'amenity-boundaries-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packages = Object.fromEntries(Object.entries(LAYOUT).map(([key, [path, defaultName]]) => {
    const directory = join(root, path);
    const name = scoped && key === 'consultant' ? FIXTURE.scopedConsultant : defaultName;
    const writeSource = (file, content) => writeFixtureFile(directory, file, content);
    const writeManifest = (fields = {}) => writeSource('package.json', JSON.stringify({
      name,
      version: FIXTURE.version,
      type: 'module',
      exports: { '.': `./${FIXTURE.entry}`, './feature': `./${FIXTURE.feature}` },
      ...fields,
    }));
    writeManifest();
    for (const file of [FIXTURE.entry, FIXTURE.feature, FIXTURE.privateHelper]) {
      writeSource(file, FIXTURE.emptyModule);
    }
    return [key, { name, directory, writeManifest, writeSource }];
  }));
  return { root, packages };
}

const staticImport = (specifier) => `import ${JSON.stringify(specifier)};\n`;

// Establish that only the injected edge makes the fixture fail, and that removal restores it.
async function assertForbiddenEdge(root, directory, addEdge, removeEdge) {
  assert.equal((await checkAmenity(root, directory)).length, 0, 'clean fixture');
  addEdge();
  assert.ok((await checkAmenity(root, directory)).length > 0, 'forbidden edge present');
  removeEdge();
  assert.equal((await checkAmenity(root, directory)).length, 0, 'forbidden edge removed');
}

for (const [owners, environment, shared] of [
  [['board', 'consultant', 'heartbeat', 'taskboard'], 'core', 'fishballShared'],
  [['watchdog', 'adapter'], 'connector', 'connectorShared'],
]) {
  for (const owner of owners) {
    test(`${owner} may use its environment, env-shared, and its own private helper`, async (t) => {
      const { root, packages } = fixture(t);
      const envName = packages[environment].name;
      const sharedName = packages[shared].name;
      const { directory, writeManifest, writeSource } = packages[owner];
      writeManifest({ dependencies: { [envName]: FIXTURE.version, [sharedName]: FIXTURE.version } });
      writeSource(FIXTURE.entry, [envName, `${sharedName}/feature`, './private/../private/shared.js'].map(staticImport).join(''));
      assert.equal((await checkAmenity(root, directory)).length, 0);
    });
  }
}

const MANIFEST_CASES = [
  ['board', 'dependencies', 'heartbeat'],
  ['board', 'dependencies', 'fishballUmbrella'],
  ['board', 'dependencies', 'connectorUmbrella'],
  ['heartbeat', 'dependencies', 'board'],
  ['board', 'devDependencies', 'heartbeat'],
  ['watchdog', 'peerDependencies', 'adapter'],
  ['adapter', 'optionalDependencies', 'watchdog'],
  ['board', 'bundledDependencies', 'heartbeat'],
  ['board', 'bundleDependencies', 'heartbeat'],
  ['board', 'dependencies', 'consultant', 'scoped'],
  ['board', 'dependencies', 'heartbeat', 'npm alias'],
];

// Only the tested field changes; duplicating the bundle entry in dependencies could mask a miss.
for (const [owner, field, target, form = 'direct'] of MANIFEST_CASES) {
  test(`${owner} cannot declare ${target} in ${field} (${form})`, async (t) => {
    const { root, packages } = fixture(t, { scoped: form === 'scoped' });
    const { directory, writeManifest } = packages[owner];
    const { name } = packages[target];
    const entry = form === 'npm alias'
      ? { [FIXTURE.scopedAlias]: `npm:${name}@${FIXTURE.version}` }
      : { [name]: FIXTURE.version };
    const bundled = field === 'bundledDependencies' || field === 'bundleDependencies';
    await assertForbiddenEdge(root, directory,
      () => writeManifest({ [field]: bundled ? [name] : entry }),
      () => writeManifest());
  });
}

test('board can import its own code but not heartbeat through a package import alias', async (t) => {
  const { root, packages } = fixture(t);
  const { directory, writeManifest, writeSource } = packages.board;
  const alias = '#feature';
  const setAlias = (target) => writeManifest({ imports: { [alias]: target } });
  const restoreLocalAlias = () => setAlias(`./${FIXTURE.feature}`);

  // Keep the source fixed so the manifest target alone changes the boundary result.
  writeSource(FIXTURE.entry, staticImport(alias));
  restoreLocalAlias();
  await assertForbiddenEdge(root, directory,
    () => setAlias(`${packages.heartbeat.name}/feature`),
    restoreLocalAlias);
});

const SOURCE_CASES = [
  ['board', 'bare side-effect sibling import', (p) => staticImport(p.heartbeat.name)],
  ['consultant', 'namespace import of taskboard', (p) => `import * as taskboard from '${p.taskboard.name}';\n`],
  ['taskboard', 'bare sibling import', (p) => staticImport(p.board.name)],
  ['taskboard', 'multiline static import of board',
    (p) => `  import
      * as board
    from
        '${p.board.name}';
`],
  ['board', 'Fishball umbrella import', (p) => staticImport(p.fishballUmbrella.name)],
  ['board', 'Connector umbrella subpath import', (p) => staticImport(`${p.connectorUmbrella.name}/feature`)],
  ['board', 'sibling subpath re-export', (p) => `export * from '${p.heartbeat.name}/feature';\n`],
  ['board', 'scoped sibling import', (p) => staticImport(p.consultant.name), { scoped: true }],
  ['board', 'scoped sibling subpath import', (p) => staticImport(`${p.consultant.name}/feature`), { scoped: true }],
  ['watchdog', 'dynamic import of adapter', (p) => `void import('${p.adapter.name}');\n`, { file: 'src/lazy.mjs' }],
  ['adapter', 'require of watchdog', (p) => `require('${p.watchdog.name}');\n`, { file: 'src/load.cjs' }],
  ['board', 'relative sibling entry import', () => staticImport('../../heartbeat/src/index.js')],
  ['board', 'normalized relative import of a sibling’s private shared code',
    () => staticImport('./private/../../../heartbeat/src/private/shared.js')],
  ['board', 'relative Fishball umbrella import', () => staticImport('../../fishball-amenities/src/index.js')],
  ['board', 'relative Connector umbrella import', () => staticImport('../../connector-amenities/src/index.js')],
  ['board', 'relative source import of its environment',
    () => staticImport('../../../dsh-fishball/packages/core/src/index.js')],
  ['watchdog', 'relative adapter import across layout roots',
    () => staticImport('../../../dsh-connector/packages/dsh-connector-adapter/src/index.js')],
  ['adapter', 'relative watchdog import across layout roots',
    () => staticImport('../../../../amenities/watchdog/src/index.js')],
];

for (const [owner, scenario, source, { file = FIXTURE.entry, scoped = false } = {}] of SOURCE_CASES) {
  test(`${owner} rejects ${scenario}`, async (t) => {
    const { root, packages } = fixture(t, { scoped });
    const { directory, writeSource } = packages[owner];
    await assertForbiddenEdge(root, directory,
      () => writeSource(file, source(packages)),
      () => writeSource(file, ''));
  });
}

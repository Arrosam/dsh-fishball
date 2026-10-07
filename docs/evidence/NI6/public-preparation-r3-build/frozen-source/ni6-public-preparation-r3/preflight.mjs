// Built-in byte/read-only gate. No original host or product import before success.
import { readFileSync, realpathSync, lstatSync, readlinkSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { check, same, sha } from './public-oracles.mjs';

const ROOT = '/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball';
const CAPSULE = resolve(ROOT, '.runtime/ni6-public-preparation-r3');
const HOST = resolve(ROOT, '.runtime/dsh-web');
const NODE = '/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node';
const NODE_SHA = '463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de';
const PLAN = resolve(ROOT, '.runtime/root-ni6-public-preparation-r3-execution-plan.json');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
function pathInRoot(name) {
  check(typeof name === 'string' && !name.startsWith('/') && !name.split('/').some(part => !part || part === '.' || part === '..'), 'PREP01_PIN_PATH');
  const path = resolve(ROOT, name);
  check(path.startsWith(ROOT + sep) && realpathSync(path) === path, 'PREP01_PIN_CONTAINMENT');
  return path;
}
function verifyRecord(row) {
  const path = row.path.startsWith('/') ? row.path : pathInRoot(row.path);
  check(!row.path.startsWith('/') || path === NODE || path === '/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14', 'PREP01_EXTERNAL_PIN');
  check(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'PREP01_PIN_REGULAR_FILE');
  const bytes = readFileSync(path);
  check(bytes.length === row.bytes && sha(bytes) === row.sha256, 'PREP01_SOURCE_PIN_DRIFT');
}
export function preflight() {
  const started = performance.now();
  try {
    check(realpathSync(fileURLToPath(new URL('.', import.meta.url))).replace(/\/$/, '') === CAPSULE && realpathSync(ROOT) === ROOT, 'PREP01_CAPSULE_PATH');
    check(process.version === 'v22.22.2' && realpathSync(process.execPath) === NODE && sha(readFileSync(NODE)) === NODE_SHA, 'PREP01_CANONICAL_NODE');
    for (const key of ['NODE_OPTIONS','NODE_PATH']) check(!Object.hasOwn(process.env, key), 'PREP01_NODE_ENVIRONMENT');
    // Root verifies NODE_TEST_CONTEXT absent before launch. Node's ordinary test
    // worker sets its own internal context; it supplies no native authority.
    check(existsSync(PLAN), 'PREP01_REVIEWED_PLAN_REQUIRED');
    const plan = readJson(PLAN), manifestPath = resolve(CAPSULE, 'source-manifest.json');
    check(plan.rootReviewedExecutionGO === true && plan.runCountAuthorized === 1 && plan.all87 === 'HOLD' && plan.CODE === 'BLOCKED_UNCHANGED', 'PREP01_REVIEWED_GO_REQUIRED');
    check(plan.pins?.['.runtime/ni6-public-preparation-r3/source-manifest.json'] === sha(readFileSync(manifestPath)), 'PREP01_REVIEWED_SEAL');
    check(plan.publicGraphManifest === '.runtime/ni3-native-runtime/public-graph-pins.json', 'PREP01_ORIGINAL_GRAPH_SELECTION');
    const manifest = readJson(manifestPath);
    check(manifest.status === 'SOURCE_ONLY_NOT_RUN' && manifest.standaloneFunctionalHostRunnableCells === 0 && manifest.proposedPublicIntegrationCells === 1, 'PREP01_SOURCE_DISPOSITION');
    check(plan.runner === '.runtime/ni6-prep01-executor-r3/runner.py', 'PREP01_REVIEWED_EXECUTOR_SELECTION');
    for (const row of [...manifest.ownedFiles,...manifest.inputFiles]) verifyRecord(row);
    // Include the actual root-pinned generated files and fresh independent reports.
    for (const [name, digest] of Object.entries(plan.pins)) {
      const path = name.startsWith('/') ? name : pathInRoot(name);
      check(!name.startsWith('/') || path === NODE || path === manifest.python.resolvedBinary, 'PREP01_EXECUTION_PIN_PATH');
      check(sha(readFileSync(path)) === digest, 'PREP01_EXECUTION_PIN_DRIFT');
    }
    for (const name of manifest.requiredAffectedReviews) check(typeof plan.pins[name] === 'string', 'PREP01_AFFECTED_REVIEW_PIN_REQUIRED');
    for (const name of manifest.requiredRootGoPins) check(typeof plan.pins[name] === 'string', 'PREP01_ROOT_GO_PIN_REQUIRED');
    check(plan.buildCommandResults === 'docs/evidence/NI6/public-preparation-r3-build/command-results.json'
      && typeof plan.pins[plan.buildCommandResults] === 'string', 'PREP01_ORIGINAL_BUILD_RESULTS_PIN');
    const buildCommands = readJson(resolve(CAPSULE,'build-plan.proposed.json')).commands;
    const buildResults = readJson(pathInRoot(plan.buildCommandResults)).commands;
    check(Array.isArray(buildResults) && buildResults.length === 4, 'PREP01_ORIGINAL_BUILD_COMMAND_COUNT');
    for (let index = 0; index < 4; index++) {
      check(buildResults[index].index === index + 1 && buildResults[index].exitCode === 0 && buildResults[index].timedOut === false,
        'PREP01_ORIGINAL_BUILD_DID_NOT_PASS');
      same(buildResults[index].argv, buildCommands[index], 'PREP01_ORIGINAL_BUILD_COMMAND_SELECTION');
    }
    const graph = readJson(pathInRoot(plan.publicGraphManifest));
    check(graph.root === HOST && Object.keys(graph.files).length === 27577 && Object.keys(graph.links).length === 12, 'PREP01_HOST_GRAPH_SHAPE');
    for (const [name,digest] of Object.entries(graph.files)) {
      const path = resolve(HOST,name);
      check(path.startsWith(HOST + sep) && realpathSync(path) === path && sha(readFileSync(path)) === digest, 'PREP01_HOST_GRAPH_DRIFT');
    }
    for (const [name,value] of Object.entries(graph.links)) {
      const path = resolve(HOST,name);
      check(lstatSync(path).isSymbolicLink() && readlinkSync(path) === value.target && realpathSync(path) === value.resolved, 'PREP01_HOST_LINK_DRIFT');
    }
    const product = resolve(CAPSULE,'package'), descriptorPath = resolve(product,'native-source-manifest.json');
    const built = readJson(resolve(CAPSULE,'build-readback.json'));
    check(built.contractVersion === 'df.ni6-prep01-build-readback/v1' && built.sourceManifestSha256 === sha(readFileSync(manifestPath)), 'PREP01_BUILD_READBACK_SEAL');
    check(plan.pins['.runtime/ni6-public-preparation-r3/build-readback.json'] === sha(readFileSync(resolve(CAPSULE,'build-readback.json'))), 'PREP01_BUILD_READBACK_PIN');
    const descriptor = readJson(descriptorPath);
    check(sha(readFileSync(descriptorPath)) === built.generated.descriptorSha256 && sha(readFileSync(resolve(product,'lib/client.js'))) === built.generated.clientSha256, 'PREP01_BUILT_OUTPUT_DRIFT');
    check(descriptor.contractVersion === 'df.native-source/v1' && descriptor.product.name === 'dsh-fishball' && descriptor.product.version === '0.1.0-preview.1', 'PREP01_NATIVE_DESCRIPTOR');
    const productNames = [...manifest.productBuildInputs.map(row => row.path),'lib/client.js'].sort();
    same(descriptor.product.files.map(row => row.path), productNames, 'PREP01_DESCRIPTOR_64_PATHS');
    check(productNames.length === 64, 'PREP01_DESCRIPTOR_64_COUNT');
    for (const row of descriptor.product.files) {
      const path = resolve(product,row.path);
      check(path.startsWith(product + sep) && realpathSync(path) === path && sha(readFileSync(path)) === row.digest, 'PREP01_DESCRIPTOR_PRODUCT_DRIFT');
    }
    check(descriptor.host.version === '0.2.1-alpha.1' && descriptor.host.lockDigest === graph.lockSha256, 'PREP01_DESCRIPTOR_HOST_LOCK');
    same(descriptor.host.modules.map(row => row.name), Object.keys(manifest.expectedNativeDescriptorModules).sort(), 'PREP01_DESCRIPTOR_MODULES');
    for (const module of descriptor.host.modules) {
      same(module.files.map(row => row.path), manifest.expectedNativeDescriptorModules[module.name], 'PREP01_DESCRIPTOR_HOST_PATHS');
      const base = resolve(HOST,'node_modules',module.name);
      check(readJson(resolve(base,'package.json')).version === module.version, 'PREP01_DESCRIPTOR_HOST_VERSION');
      for (const row of module.files) check(sha(readFileSync(resolve(base,row.path))) === row.digest, 'PREP01_DESCRIPTOR_HOST_BYTES');
    }
    const link = resolve(product,'node_modules');
    check(lstatSync(link).isSymbolicLink() && readlinkSync(link) === resolve(HOST,'node_modules') && realpathSync(link) === resolve(HOST,'node_modules'), 'PREP01_PEER_BINDING');
    check(!existsSync(resolve(CAPSULE,'private-runtime')), 'PREP01_NAMESPACE_ALREADY_USED');
    const allowed = new Set(manifest.ownedFiles.filter(row => row.path.startsWith('.runtime/ni6-public-preparation-r3/')).map(row => row.path.slice('.runtime/ni6-public-preparation-r3/'.length)));
    for (const path of ['source-manifest.json','build-attempt.json','build-readback.json','package/lib/client.js','package/native-source-manifest.json','package/node_modules']) allowed.add(path);
    function inventory(directory) {
      for (const name of readdirSync(directory)) {
        const path = resolve(directory,name), entry = lstatSync(path), rel = relative(CAPSULE,path);
        if (entry.isDirectory()) inventory(path);
        else check(allowed.has(rel), 'PREP01_UNREVIEWED_CAPSULE_FILE');
      }
    }
    inventory(CAPSULE);
    check(performance.now() - started <= 10000, 'PREP01_PREFLIGHT_DEADLINE');
    return Object.freeze({capsule:CAPSULE,product});
  } catch (error) {
    const message = error?.message;
    throw new Error(typeof message === 'string' && /^PREP01_[A-Z0-9_]+$/.test(message) ? message : 'PREP01_PREFLIGHT_FAILED');
  }
}

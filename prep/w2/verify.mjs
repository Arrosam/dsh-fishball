import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const prepRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(prepRoot, '../..');
const schemaNames = ['common', 'coordinator-context', 'worker-lifecycle', 'scoped-messages', 'resources', 'result-control'];
const commonId = 'urn:bubbles:w2-prep:common:v1';
const draft = 'https://json-schema.org/draft/2020-12/schema';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const keyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,95}$/;

class PrepError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const requireThat = (condition, code) => { if (!condition) throw new PrepError(code); };

function readBounded(path, max = 524288) {
  const info = lstatSync(path);
  requireThat(info.isFile() && !info.isSymbolicLink() && info.size <= max, 'ARTIFACT_FILE_INVALID');
  return readFileSync(path);
}
function readJson(path, max) {
  try { return JSON.parse(readBounded(path, max).toString('utf8')); }
  catch (error) { if (error instanceof PrepError) throw error; throw new PrepError('ARTIFACT_JSON_INVALID'); }
}
function walk(value, visit, depth = 0) {
  requireThat(depth <= 32, 'ARTIFACT_DEPTH_EXCEEDED');
  if (value === null || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit, depth + 1);
}

export async function loadPinnedAjv() {
  const p = readJson(join(prepRoot, 'verifier-provenance.json'));
  const runtime = join(repoRoot, '.runtime/dsh-web');
  const trackedLock = readBounded(join(repoRoot, 'scripts/dsh-web-runtime-lock.json'), 1048576);
  const installedLock = readBounded(join(runtime, 'package-lock.json'), 1048576);
  const manifest = readBounded(join(runtime, 'node_modules/ajv/package.json'));
  const entry = readBounded(join(runtime, 'node_modules/ajv/dist/2020.js'));
  const lock = JSON.parse(trackedLock);
  requireThat(p.dependency === 'ajv' && p.version === '8.20.0' && p.entry === 'ajv/dist/2020.js', 'VALIDATOR_PIN_INVALID');
  requireThat(digest(trackedLock) === p.trackedLockSha256 && digest(installedLock) === p.trackedLockSha256, 'VALIDATOR_LOCK_MISMATCH');
  requireThat(digest(manifest) === p.packageSha256 && digest(entry) === p.entrySha256, 'VALIDATOR_SOURCE_MISMATCH');
  requireThat(JSON.parse(manifest).version === p.version, 'VALIDATOR_VERSION_MISMATCH');
  const locked = lock.packages['node_modules/ajv'];
  requireThat(locked.version === p.version && locked.integrity === p.lockRecord.integrity && locked.resolved === p.lockRecord.resolved, 'VALIDATOR_PROVENANCE_MISMATCH');
  requireThat(lock.packages['node_modules/@deepseek-ai/dsh'].version === '0.2.1-alpha.1', 'HOST_LOCK_PIN_MISMATCH');
  const imported = await import(pathToFileURL(join(runtime, 'node_modules/ajv/dist/2020.js')).href);
  requireThat(typeof imported.default === 'function', 'VALIDATOR_EXPORT_INVALID');
  return imported.default;
}

function sourceACs() {
  const cards = join(repoRoot, 'docs/tickets');
  const known = new Set();
  for (const name of readdirSync(cards).filter(name => /^BUB\d{3}[AB]?\.md$/.test(name))) {
    const content = readBounded(join(cards, name)).toString('utf8');
    for (const ac of content.matchAll(/BUB\d{3}[AB]?-\d{2}/g)) known.add(ac[0]);
  }
  return known;
}

export function evaluateVectors(Ajv2020, schemas, fixtureDocuments, knownAC = sourceACs()) {
  requireThat(Array.isArray(schemas) && schemas.length === schemaNames.length, 'SCHEMA_SET_INCOMPLETE');
  requireThat(Array.isArray(fixtureDocuments) && fixtureDocuments.length >= 5 && fixtureDocuments.length <= 64, 'FIXTURE_SET_INVALID');
  const ids = new Set();
  for (const schema of schemas) {
    requireThat(schema.$schema === draft && /^urn:bubbles:w2-prep:[a-z-]+:v1$/.test(schema.$id) && !ids.has(schema.$id), 'SCHEMA_ID_INVALID');
    ids.add(schema.$id);
  }
  requireThat(schemaNames.every(name => ids.has(`urn:bubbles:w2-prep:${name}:v1`)), 'SCHEMA_SET_INCOMPLETE');
  for (const schema of schemas) walk(schema, node => {
    requireThat(!Object.hasOwn(node, '$async') && !Object.hasOwn(node, '$data') && !Object.hasOwn(node, 'format'), 'SCHEMA_UNSUPPORTED_EXTENSION');
    for (const key of ['$ref', '$dynamicRef']) if (Object.hasOwn(node, key)) {
      const ref = node[key];
      requireThat(typeof ref === 'string' && (ref.startsWith('#') || ids.has(ref.split('#')[0])), 'SCHEMA_EXTERNAL_REFERENCE');
    }
  });
  // strictRequired:false permits legal conditional required fields declared on
  // an enclosing object. It does not disable the required validation keyword.
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true,
    validateFormats: false, coerceTypes: false, useDefaults: false,
    removeAdditional: false, ownProperties: true, logger: false });
  for (const schema of schemas) {
    requireThat(ajv.validateSchema(schema), 'SCHEMA_META_INVALID');
    ajv.addSchema(schema);
  }
  for (const id of ids) requireThat(typeof ajv.getSchema(id) === 'function', 'SCHEMA_COMPILE_FAILED');
  const stats = { schemasCompiled: ids.size, fixtureFiles: fixtureDocuments.length,
    vectors: 0, validVectors: 0, invalidVectors: 0, positiveUnknownFieldChecks: 0,
    mockEvidenceObjects: 0, sourceACRefs: [] };
  const covered = new Set();
  const laneRoots = new Set();
  const failures = [];
  for (const fixture of fixtureDocuments) {
    requireThat(fixture && fixture.fixtureKind === 'mock' && Array.isArray(fixture.vectors) && fixture.vectors.length >= 2 && fixture.vectors.length <= 100, 'FIXTURE_HEADER_INVALID');
    requireThat(Object.keys(fixture).every(key => ['fixtureKind', 'schemaId', 'vectors'].includes(key)), 'FIXTURE_HEADER_FIELDS_INVALID');
    const rootId = typeof fixture.schemaId === 'string' ? fixture.schemaId.split('#')[0] : '';
    const commonFragment = fixture.schemaId?.startsWith(`${commonId}#/$defs/`);
    requireThat(ids.has(rootId) && (rootId !== commonId || commonFragment), 'FIXTURE_SCHEMA_INVALID');
    const validate = ajv.getSchema(fixture.schemaId);
    requireThat(typeof validate === 'function', 'FIXTURE_SCHEMA_INVALID');
    if (ids.has(fixture.schemaId) && rootId !== commonId) laneRoots.add(rootId);
    const seen = new Set();
    let positives = 0;
    let negatives = 0;
    for (const vector of fixture.vectors) {
      requireThat(vector && typeof vector.id === 'string' && keyPattern.test(vector.id) && !seen.has(vector.id), 'VECTOR_ID_INVALID');
      seen.add(vector.id);
      requireThat(typeof vector.expectedValid === 'boolean' && Object.hasOwn(vector, 'instance'), 'VECTOR_EXPECTATION_INVALID');
      requireThat(typeof vector.technique === 'string' && vector.technique.length > 0 && vector.technique.length <= 160 && typeof vector.reason === 'string' && vector.reason.length > 0 && vector.reason.length <= 1024, 'VECTOR_DESCRIPTION_INVALID');
      requireThat(Array.isArray(vector.sourceAC) && vector.sourceAC.length > 0 && vector.sourceAC.length <= 10 && vector.sourceAC.every(ac => knownAC.has(ac)), 'VECTOR_SOURCE_AC_INVALID');
      requireThat(Object.keys(vector).every(key => ['id', 'sourceAC', 'technique', 'expectedValid', 'reason', 'instance'].includes(key)), 'VECTOR_FIELDS_INVALID');
      vector.sourceAC.forEach(ac => covered.add(ac));
      walk(vector.instance, node => {
        if (Object.hasOwn(node, 'sourceKind')) {
          requireThat(node.sourceKind === 'mock', 'FIXTURE_NONMOCK_PROVENANCE');
          stats.mockEvidenceObjects++;
        }
      });
      const before = JSON.stringify(vector.instance);
      const actual = validate(vector.instance) === true;
      requireThat(before === JSON.stringify(vector.instance), 'VALIDATOR_MUTATED_FIXTURE');
      stats.vectors++;
      if (vector.expectedValid) { positives++; stats.validVectors++; } else { negatives++; stats.invalidVectors++; }
      if (actual !== vector.expectedValid) failures.push({ schemaId: fixture.schemaId, vectorId: vector.id, code: 'VECTOR_EXPECTATION_MISMATCH' });
      if (actual && vector.expectedValid && vector.instance && typeof vector.instance === 'object' && !Array.isArray(vector.instance)) {
        const unknown = { ...structuredClone(vector.instance), __prep_unknown_field: true };
        stats.positiveUnknownFieldChecks++;
        if (validate(unknown)) failures.push({ schemaId: fixture.schemaId, vectorId: vector.id, code: 'OPEN_TOP_LEVEL_ENVELOPE' });
      }
    }
    requireThat(positives > 0 && negatives > 0, 'FIXTURE_POLARITY_MISSING');
  }
  requireThat(schemaNames.filter(name => name !== 'common').every(name => laneRoots.has(`urn:bubbles:w2-prep:${name}:v1`)), 'LANE_FIXTURES_INCOMPLETE');
  requireThat(stats.vectors <= 512, 'VECTOR_COUNT_EXCEEDED');
  stats.sourceACRefs = [...covered].sort();
  return { result: failures.length ? 'FAIL' : 'PASS', verificationScope: 'schema_and_fixture_structure_only',
    w1Acceptance: 'HOLD', w2TicketAcceptance: 'NOT_ASSESSED', nativeCalls: 0,
    inferenceCalls: 0, ...stats, failures };
}

function fixturePaths(directory, depth = 0) {
  requireThat(depth <= 1, 'FIXTURE_DIRECTORY_INVALID');
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    requireThat(!entry.isSymbolicLink(), 'FIXTURE_SYMLINK_REJECTED');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      requireThat(depth === 0 && entry.name === 'independent', 'FIXTURE_DIRECTORY_INVALID');
      out.push(...fixturePaths(path, depth + 1));
    } else {
      requireThat(entry.isFile() && /^[a-z][a-z0-9-]*\.json$/.test(entry.name), 'FIXTURE_FILENAME_INVALID');
      out.push(path);
    }
  }
  return out;
}

export async function verifyArtifacts() {
  const Ajv2020 = await loadPinnedAjv();
  const schemas = schemaNames.map(name => readJson(join(prepRoot, 'schemas', `${name}.schema.json`)));
  const paths = fixturePaths(join(prepRoot, 'fixtures'));
  const report = evaluateVectors(Ajv2020, schemas, paths.map(path => readJson(path)));
  return { ...report, fixturePaths: paths.map(path => relative(repoRoot, path)),
    validator: 'existing pinned-runtime Ajv8.20.0; no installation/network loader' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireThat(process.argv.length === 2, 'ARGUMENTS_UNSUPPORTED');
    const report = await verifyArtifacts();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.result !== 'PASS') process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ result: 'FAIL', verificationScope: 'schema_and_fixture_structure_only',
      code: error instanceof PrepError ? error.code : 'PREP_VALIDATION_ERROR', w1Acceptance: 'HOLD', w2TicketAcceptance: 'NOT_ASSESSED' })}\n`);
    process.exitCode = 1;
  }
}

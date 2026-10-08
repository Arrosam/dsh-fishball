// Owner-only controls over the original encrypted store and fixed NI1 namespace.
// Preview consent is volatile; successful receipts only invalidate preparations.
import { createHash, randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { MemoryAdapter, MemoryAdapterError, MEMORY_PROJECTION_VERSION } from './memory.mjs';
import { migratePinnedFishball, MemoryError } from './fishball-memory-core.mjs';
import { ContextAssembler } from './context.mjs';
import { RuntimeError } from './runtime-store.mjs';
import { assertInstalledWorkerInvocation } from './installed-invocation.mjs';

export class MemoryContinuityError extends Error {
  constructor(code) {
    const safe = publicCodes.has(code) ? code : 'MEMORY_UNAVAILABLE';
    super(safe); this.name = 'MemoryContinuityError'; this.code = safe;
  }
}
const fail = code => { throw new MemoryContinuityError(code); };
const sourceCodes = new Set(['MEMORY_INVALID', 'MEMORY_LIMIT', 'STALE_MEMORY', 'MEMORY_CONFLICT', 'MEMORY_DELETED', 'IDEMPOTENCY_CONFLICT', 'MEMORY_BUSY', 'MEMORY_SCOPE', 'MEMORY_CORRUPT', 'SECRET_REJECTED', 'MEMORY_UNAVAILABLE', 'MEMORY_UNCERTAIN', 'KEY_MISMATCH', 'STORAGE_INVALID', 'STORAGE_UNSUPPORTED', 'SCHEMA_FUTURE', 'CAPACITY', 'INPUT_TOO_LARGE']);
const publicCodes = new Set([...sourceCodes, 'MEMORY_DISABLED', 'MEMORY_IMPORT_EMPTY', 'MEMORY_IMPORT_FORMAT', 'MEMORY_PREVIEW_STALE', 'MEMORY_PREVIEW_BUSY', 'MEMORY_PREVIEW_CAPACITY', 'SERVICE_DISPOSED', 'OPERATOR_REQUIRED', 'REQUEST_ABORTED']);
const metaKeys = ['ownerRef', 'workspaceRef', 'namespaceRef', 'revision', 'digest', 'recordRef', 'deleted', 'createdAt', 'updatedAt', 'sourceRefs', 'byteLength', 'cryptoVersion'];
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => { if (!Number.isSafeInteger(value) || value < min || value > max) fail('MEMORY_INVALID'); return value; };
const ref = value => { if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) fail('MEMORY_INVALID'); return value; };
const confidence = value => { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail('MEMORY_INVALID'); return value; };
function fields(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('MEMORY_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !allowed.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) || required.some(key => !Object.hasOwn(descriptors, key))) fail('MEMORY_INVALID');
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}
function capture(value, depth = 0) {
  if (depth > 12) fail('MEMORY_LIMIT');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) fail('MEMORY_INVALID'); return value; }
  if (typeof value === 'string') { if (Buffer.byteLength(value) > 65536 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) fail('MEMORY_LIMIT'); return value; }
  if (!value || typeof value !== 'object' || types.isProxy(value)) fail('MEMORY_INVALID');
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 128) fail('MEMORY_LIMIT');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')))) fail('MEMORY_INVALID');
    return Array.from({ length: value.length }, (_, index) => { if (!Object.hasOwn(descriptors, index)) fail('MEMORY_INVALID'); return capture(descriptors[index].value, depth + 1); });
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('MEMORY_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > 64) fail('MEMORY_LIMIT');
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) fail('MEMORY_INVALID');
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, capture(descriptor.value, depth + 1)]));
}
function request(value, allowed, required = allowed) {
  const result = capture(value); fields(result, allowed, required);
  if (Buffer.byteLength(JSON.stringify(result)) > 65536) fail('MEMORY_LIMIT');
  return frozen(result);
}
function sources(value, allowEmpty = false) {
  if (!Array.isArray(value) || value.length > 16 || !allowEmpty && value.length === 0) fail('MEMORY_INVALID');
  value.forEach(ref); if (new Set(value).size !== value.length) fail('MEMORY_INVALID');
}
function code(error) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
function callable(object, name) {
  let current = object;
  for (let depth = 0; current !== null && depth < 8; depth++) {
    if (types.isProxy(current)) fail('MEMORY_INVALID');
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) { if (!Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') fail('MEMORY_INVALID'); return; }
    current = Object.getPrototypeOf(current);
  }
  fail('MEMORY_INVALID');
}

export function createInstalledMemoryContinuity(options) {
  const input = fields(options, ['ctx', 'store', 'ownerHandle', 'coordinatorProjection', 'memory', 'contextAssembler', 'knownSecrets', 'onMutation', 'clock']);
  const { ctx, store, ownerHandle, coordinatorProjection, contextAssembler, onMutation, clock } = input;
  if (!ctx || typeof ctx !== 'object' || types.isProxy(ctx) || !ownerHandle || typeof ownerHandle !== 'object' || types.isProxy(ownerHandle) || !store || types.isProxy(store) || types.isProxy(coordinatorProjection) || !(coordinatorProjection instanceof MemoryAdapter) || types.isProxy(contextAssembler) || !(contextAssembler instanceof ContextAssembler) || typeof onMutation !== 'function' || typeof clock !== 'function') fail('MEMORY_INVALID');
  for (const method of ['memoryBinding', 'getMemory', 'putMemory', 'deleteMemory', 'listMemory', 'memoryCommandReceipt']) callable(store, method);
  const memory = fields(input.memory, ['namespaceRef', 'tokenize', 'byteLimit', 'tokenLimit']);
  ref(memory.namespaceRef); integer(memory.byteLimit, 1, 65536); integer(memory.tokenLimit, 1, 131072);
  if (typeof memory.tokenize !== 'function') fail('MEMORY_INVALID');
  const knownSecrets = capture(input.knownSecrets);
  if (!Array.isArray(knownSecrets) || knownSecrets.length > 64 || knownSecrets.some(value => typeof value !== 'string' || value.length < 4 || value.length > 256)) fail('MEMORY_INVALID');
  let binding;
  try { binding = fields(store.memoryBinding(ownerHandle), ['ownerRef', 'workspaceRef', 'role']); ref(binding.ownerRef); ref(binding.workspaceRef); if (binding.role !== 'owner') fail('MEMORY_SCOPE'); }
  catch (error) { if (!types.isProxy(error) && error instanceof MemoryContinuityError) throw error; fail('MEMORY_UNAVAILABLE'); }
  frozen(binding); frozen(memory); frozen(knownSecrets);
  let ownerProjection;
  try { ownerProjection = new MemoryAdapter({ store, handle: ownerHandle, ...memory, contextAssembler, knownSecrets }); }
  catch { fail('MEMORY_UNAVAILABLE'); }
  let active = true, lastTime = null;
  const previews = new Map();
  function guard() { if (!active) fail('SERVICE_DISPOSED'); assertInstalledWorkerInvocation(ctx); return true; }
  function now() {
    guard(); let value;
    try { value = clock(); } catch { guard(); fail('MEMORY_UNAVAILABLE'); }
    guard(); if (!Number.isSafeInteger(value) || value < 0) fail('MEMORY_UNAVAILABLE');
    if (lastTime !== null && value < lastTime) { previews.clear(); fail('MEMORY_PREVIEW_STALE'); }
    lastTime = value; return value;
  }
  function currentBinding() {
    guard(); const current = fields(store.memoryBinding(ownerHandle), ['ownerRef', 'workspaceRef', 'role']);
    guard(); if (current.ownerRef !== binding.ownerRef || current.workspaceRef !== binding.workspaceRef || current.role !== 'owner') fail('MEMORY_SCOPE');
  }
  function validateMetadata(value, { content = false, operation = null } = {}) {
    const raw = fields(value, [...metaKeys, 'requestDigest', 'deduplicated', 'result', ...(content ? ['content'] : [])], metaKeys);
    // Existing encrypted namespace bodies have their own larger storage bounds;
    // readonly status/deletion must not apply the RPC body cap to that body.
    const { content: body, ...wire } = raw;
    const detached = capture(wire);
    if (detached.ownerRef !== binding.ownerRef || detached.workspaceRef !== binding.workspaceRef || detached.namespaceRef !== memory.namespaceRef) fail('MEMORY_SCOPE');
    integer(detached.revision, 1); integer(detached.createdAt); integer(detached.updatedAt); integer(detached.byteLength, 0, 4194304);
    ref(detached.digest); ref(detached.recordRef); sources(detached.sourceRefs, true);
    if (typeof detached.deleted !== 'boolean' || detached.cryptoVersion !== 2 || detached.updatedAt < detached.createdAt || detached.requestDigest !== undefined && !ref(detached.requestDigest) || detached.deduplicated !== undefined && detached.deduplicated !== true) fail('STORAGE_INVALID');
    if (content && !detached.deleted) { if (typeof body !== 'string' || Buffer.byteLength(body) !== detached.byteLength || digest(body) !== detached.digest) fail('STORAGE_INVALID'); }
    if (detached.deleted && (detached.byteLength !== 0 || Object.hasOwn(raw, 'content'))) fail('STORAGE_INVALID');
    if (detached.result !== undefined) {
      const result = detached.result;
      if (operation === 'memoryCorrect') { fields(result, ['id', 'factRevision', 'authority']); integer(result.id, 1); integer(result.factRevision, 1); if (result.authority !== 'memory_only') fail('STORAGE_INVALID'); }
      else if (operation === 'memoryForget') { fields(result, ['id', 'factRevision', 'deleted']); integer(result.id, 1); integer(result.factRevision, 1); if (result.deleted !== true) fail('STORAGE_INVALID'); }
      else if (operation === 'memoryImportConfirm') { fields(result, ['imported', 'authority']); integer(result.imported, 1, 1536); if (result.authority !== 'memory_only') fail('STORAGE_INVALID'); }
      else fail('STORAGE_INVALID');
    }
    if (operation && !Object.hasOwn(detached, 'requestDigest')) fail('STORAGE_INVALID');
    return frozen(detached);
  }
  function metadata(...args) {
    try { return validateMetadata(...args); }
    catch (error) {
      if (!types.isProxy(error) && error instanceof MemoryContinuityError && error.code === 'MEMORY_SCOPE') throw error;
      fail('STORAGE_INVALID');
    }
  }
  function read() {
    currentBinding(); guard(); const value = store.getMemory(ownerHandle, { namespaceRef: memory.namespaceRef }); guard();
    return value === null ? null : metadata(value, { content: true });
  }
  function publish(value) { guard(); if (Buffer.byteLength(JSON.stringify({ ok: true, value })) > 65536) fail('MEMORY_LIMIT'); return frozen(value); }
  async function boundary(call) {
    try { guard(); const value = await call(); guard(); return value; }
    catch (error) {
      guard();
      if (!types.isProxy(error) && error instanceof MemoryContinuityError) fail(code(error));
      if (!types.isProxy(error) && (error instanceof MemoryAdapterError || error instanceof MemoryError || error instanceof RuntimeError) && sourceCodes.has(code(error))) fail(code(error));
      fail('MEMORY_UNAVAILABLE');
    }
  }
  async function mutate(operation, original, call, beforeWrite = () => undefined) {
    guard(); beforeWrite(); let receipt;
    try { receipt = metadata(call(), { operation }); }
    catch (error) {
      guard();
      if (!types.isProxy(error) && (error instanceof MemoryAdapterError || error instanceof MemoryError || error instanceof RuntimeError) && sourceCodes.has(code(error))) fail(code(error));
      if (!types.isProxy(error) && error instanceof MemoryContinuityError && error.code === 'MEMORY_SCOPE') throw error;
      fail('MEMORY_UNCERTAIN');
    }
    guard();
    try { await onMutation(frozen({ operation, input: original, receipt })); }
    catch { guard(); fail('MEMORY_UNCERTAIN'); }
    guard(); return publish(receipt);
  }
  function reserve(operation, original) {
    const time = now();
    for (const [id, preview] of previews) if (time >= preview.expiresAt && preview.state !== 'confirming') previews.delete(id);
    if (previews.size >= 16) fail('MEMORY_PREVIEW_CAPACITY');
    if (!Number.isSafeInteger(time + 60000)) fail('MEMORY_UNAVAILABLE');
    const previewRef = randomBytes(32).toString('hex');
    const preview = { state: 'pending', operation, original, previewRef, expiresAt: time + 60000 };
    previews.set(previewRef, preview); return preview;
  }
  function describe(preview, description) {
    const planDigest = digest(JSON.stringify(canonical({ operation: preview.operation, scope: binding, namespaceRef: memory.namespaceRef, limits: { byteLimit: memory.byteLimit, tokenLimit: memory.tokenLimit }, original: preview.original, description })));
    preview.planDigest = planDigest;
    return { previewRef: preview.previewRef, planDigest, expiresAt: preview.expiresAt, expectedRevision: preview.original.expectedRevision, description };
  }
  function checkFacts(preview) {
    const current = read();
    if (preview.operation === 'memoryImportConfirm' ? current !== null : !current || current.deleted || current.revision !== preview.original.expectedRevision || current.digest !== preview.digest) fail('MEMORY_PREVIEW_STALE');
  }
  function fresh(preview) { guard(); if (!previews.has(preview.previewRef) || now() >= preview.expiresAt) fail('MEMORY_PREVIEW_STALE'); guard(); }
  async function confirm(operation, raw) {
    const original = request(raw, ['previewRef', 'planDigest', 'commandRef', 'expectedRevision', 'accept']);
    ref(original.previewRef); ref(original.planDigest); ref(original.commandRef); integer(original.expectedRevision);
    if (original.accept !== true) fail('MEMORY_INVALID');
    const preview = previews.get(original.previewRef);
    if (!preview || preview.operation !== operation || preview.planDigest !== original.planDigest || preview.original.expectedRevision !== original.expectedRevision) fail('MEMORY_PREVIEW_STALE');
    if (preview.state === 'confirming') fail('MEMORY_PREVIEW_BUSY');
    if (preview.state !== 'ready') fail('MEMORY_PREVIEW_STALE');
    preview.state = 'confirming';
    try {
      await Promise.resolve(); guard(); fresh(preview); checkFacts(preview); fresh(preview);
      return await mutate(operation, original, () => operation === 'memoryImportConfirm'
        ? coordinatorProjection.importPinned({ ...preview.original, commandRef: original.commandRef })
        : ownerProjection.deleteNamespace({ commandRef: original.commandRef, expectedRevision: original.expectedRevision }), () => {
          // Final currentness/time check is at the original synchronous call,
          // not the earlier await or preview-fact read. No await follows it.
          fresh(preview); preview.state = 'consumed'; previews.delete(preview.previewRef);
        });
    } finally { preview.state = 'closed'; previews.delete(preview.previewRef); }
  }
  const operations = frozen({
    memoryStatus: raw => boundary(() => {
      request(raw, []); const value = read();
      return publish(value === null ? { state: 'absent', revision: 0, digest: null, updatedAt: null, reasonCode: null } : { state: value.deleted ? 'deleted' : 'live', revision: value.revision, digest: value.digest, updatedAt: value.updatedAt, reasonCode: value.deleted ? 'MEMORY_DELETED' : null });
    }),
    memoryCorrect: raw => boundary(async () => {
      const input = request(raw, ['commandRef', 'expectedRevision', 'id', 'expectedFactRevision', 'candidate', 'accept']);
      ref(input.commandRef); integer(input.expectedRevision); integer(input.id, 1); integer(input.expectedFactRevision, 1); if (input.accept !== true) fail('MEMORY_INVALID');
      const { accept, ...original } = input; currentBinding(); guard();
      return mutate('memoryCorrect', input, () => coordinatorProjection.correct(original));
    }),
    memoryForget: raw => boundary(async () => {
      const input = request(raw, ['commandRef', 'expectedRevision', 'id', 'expectedFactRevision', 'accept']);
      ref(input.commandRef); integer(input.expectedRevision); integer(input.id, 1); integer(input.expectedFactRevision, 1); if (input.accept !== true) fail('MEMORY_INVALID');
      const { accept, ...original } = input; currentBinding(); guard();
      return mutate('memoryForget', input, () => coordinatorProjection.forget(original));
    }),
    memoryImportPreview: raw => boundary(async () => {
      const input = request(raw, ['expectedRevision', 'snapshotText', 'turnLogText', 'sourceRefs', 'observedAt', 'confidence'], ['expectedRevision', 'sourceRefs', 'observedAt', 'confidence']);
      integer(input.expectedRevision); sources(input.sourceRefs); integer(input.observedAt); confidence(input.confidence);
      if (input.expectedRevision !== 0) fail('STALE_MEMORY');
      const documents = ['snapshotText', 'turnLogText'].filter(key => Object.hasOwn(input, key));
      if (documents.some(key => typeof input[key] !== 'string')) fail('MEMORY_INVALID');
      if (!documents.length || documents.some(key => input[key].length === 0)) fail('MEMORY_IMPORT_EMPTY');
      if (Buffer.byteLength(input.snapshotText ?? '') + Buffer.byteLength(input.turnLogText ?? '') > 49152) fail('MEMORY_LIMIT');
      const preview = reserve('memoryImportConfirm', input);
      try {
        await Promise.resolve(); guard(); if (read() !== null) fail('MEMORY_CONFLICT');
        let core;
        try { core = migratePinnedFishball({ ...Object.fromEntries(['snapshotText', 'turnLogText'].filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]])), scope: { ownerRef: binding.ownerRef, workspaceRef: binding.workspaceRef }, forbiddenSecrets: knownSecrets }); }
        catch (error) { guard(); const actual = error instanceof MemoryError ? code(error) : null; fail(actual === 'SECRET_REJECTED' || actual === 'MEMORY_LIMIT' ? actual : 'MEMORY_IMPORT_FORMAT'); }
        const facts = ['world', 'preferences', 'turns'].flatMap((key, index) => core[key].map(value => ({ id: value.id, kind: ['world', 'preference', 'turn'][index], revision: 1, sourceRefs: [...input.sourceRefs], observedAt: value.recordedAt ?? value.at, confidence: input.confidence, deleted: false, conflictRefs: [] })));
        if (!facts.length) fail('MEMORY_IMPORT_EMPTY');
        const description = { operation: 'memory_import', format: 'pinned-main-release/v1', destination: 'current private memory', sourceRefs: [...input.sourceRefs], observedAt: input.observedAt, confidence: input.confidence, documentDigests: { snapshotDigest: Object.hasOwn(input, 'snapshotText') ? digest(input.snapshotText) : null, turnLogDigest: Object.hasOwn(input, 'turnLogText') ? digest(input.turnLogText) : null }, recordCount: facts.length, normalizedProjection: { contractVersion: MEMORY_PROJECTION_VERSION, scope: { ownerRef: binding.ownerRef, workspaceRef: binding.workspaceRef }, core, facts } };
        fresh(preview); checkFacts(preview); const output = publish(describe(preview, description)); fresh(preview); preview.state = 'ready'; return output;
      } catch (error) { previews.delete(preview.previewRef); throw error; }
    }),
    memoryImportConfirm: raw => boundary(() => confirm('memoryImportConfirm', raw)),
    memoryDeletePreview: raw => boundary(async () => {
      const input = request(raw, ['expectedRevision']); integer(input.expectedRevision, 1);
      const preview = reserve('memoryDeleteConfirm', input);
      try {
        await Promise.resolve(); guard(); const value = read();
        if (!value || value.revision !== input.expectedRevision) fail('STALE_MEMORY'); if (value.deleted) fail('MEMORY_DELETED'); preview.digest = value.digest;
        const description = { operation: 'memory_delete', destination: 'current private memory', revision: value.revision, digest: value.digest, consequence: 'permanent_namespace_tombstone', scope: 'local_live_memory_only', exclusions: ['task_contexts', 'native_logs', 'exports', 'backups', 'third_party_copies'] };
        fresh(preview); checkFacts(preview); const output = publish(describe(preview, description)); fresh(preview); preview.state = 'ready'; return output;
      } catch (error) { previews.delete(preview.previewRef); throw error; }
    }),
    memoryDeleteConfirm: raw => boundary(() => confirm('memoryDeleteConfirm', raw)),
    memoryCommandStatus: raw => boundary(() => {
      const input = request(raw, ['commandRef']); ref(input.commandRef); currentBinding(); guard();
      if (typeof store.readMemoryCommand !== 'function') fail('MEMORY_UNAVAILABLE');
      const receipt = store.readMemoryCommand(ownerHandle, { namespaceRef: memory.namespaceRef, commandRef: input.commandRef }); guard();
      return publish(receipt === null ? { state: 'not_observed', receipt: null } : { state: 'observed', receipt: metadata(receipt) });
    }),
  });
  return Object.freeze({ operations, dispose: () => { active = false; previews.clear(); } });
}

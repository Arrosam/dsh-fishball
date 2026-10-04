// Workspace memory projection over the sole authoritative encrypted RuntimeStore.
// Pure pinned algorithms carry no task/approval authority (see provenance).
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { FishballMemoryCore, MemoryError, migratePinnedFishball, preferenceFresh } from './fishball-memory-core.mjs';
import { contextText, compactContext } from './context.mjs';

export const MEMORY_PROJECTION_VERSION = 'df.memory-projection/v1';
export const LEGACY_MEMORY_PROJECTION_VERSION = 'bubbles.memory-projection/v1';
export class MemoryAdapterError extends Error { constructor(code) { super(code); this.name = 'MemoryAdapterError'; this.code = code; } }
const fail = code => { throw new MemoryAdapterError(code); };
const MAX_BYTES = 4194304;
const clone = value => structuredClone(value);
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function exact(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('MEMORY_INVALID');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !allowed.includes(key) || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')) || required.some(key => !Object.hasOwn(fields, key))) fail('MEMORY_INVALID');
}
function array(value, max = 16) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) fail('MEMORY_LIMIT');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || !Number.isSafeInteger(Number(key)) || Number(key) >= value.length || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')))) fail('MEMORY_INVALID');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(fields, String(i))) fail('MEMORY_INVALID');
  return value;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < min || value > max) fail('MEMORY_INVALID'); return value; }
function ref(value) { if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) fail('MEMORY_INVALID'); return value; }
function sources(value) { array(value); if (!value.length || new Set(value.map(ref)).size !== value.length) fail('MEMORY_INVALID'); return [...value]; }
function confidence(value) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail('MEMORY_INVALID'); return value; }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const SAFE_CODES = new Set(['MEMORY_INVALID', 'MEMORY_LIMIT', 'MEMORY_CONFLICT', 'MEMORY_SCOPE', 'MEMORY_CORRUPT', 'MEMORY_DELETED', 'STALE_MEMORY', 'IDEMPOTENCY_CONFLICT', 'SECRET_REJECTED', 'KEY_MISMATCH', 'UNAUTHORIZED', 'STORAGE_INVALID', 'STORAGE_UNSUPPORTED', 'CAPACITY', 'COMMAND_CAPACITY', 'STALE_VERSION', 'STALE_AUTHORITY', 'STALE_GENERATION', 'TASK_NOT_FOUND', 'CONTEXT_LIMIT', 'CONTEXT_INVALID', 'TOKENIZER_UNAVAILABLE']);
function guarded(call) { try { return call(); } catch (error) { fail(SAFE_CODES.has(error?.code) ? error.code : error instanceof MemoryError ? error.code : 'MEMORY_UNAVAILABLE'); } }

export class MemoryAdapter {
  #store; #handle; #namespace; #binding; #secrets; #extractor; #assembler; #tokenize; #limits; #busy = false;
  constructor(options) {
    exact(options, ['store', 'handle', 'namespaceRef', 'knownSecrets', 'extractFacts', 'contextAssembler', 'tokenize', 'byteLimit', 'tokenLimit'], ['store', 'handle', 'namespaceRef']);
    const { store, handle, namespaceRef, knownSecrets = [], extractFacts, contextAssembler, tokenize, byteLimit = 65536, tokenLimit = 8192 } = options;
    if (!store || !['memoryBinding', 'getMemory', 'putMemory', 'listMemory', 'deleteMemory', 'memoryCommandReceipt'].every(method => typeof store[method] === 'function') || extractFacts !== undefined && typeof extractFacts !== 'function') fail('MEMORY_CONFIG');
    guarded(() => contextText('', knownSecrets));
    this.#binding = guarded(() => store.memoryBinding(handle));
    exact(this.#binding, ['ownerRef', 'workspaceRef', 'role']); ref(this.#binding.ownerRef); ref(this.#binding.workspaceRef);
    if (!['owner', 'coordinator', 'host'].includes(this.#binding.role)) fail('UNAUTHORIZED');
    this.#store = store; this.#handle = handle; this.#namespace = ref(namespaceRef); this.#secrets = [...knownSecrets]; this.#extractor = extractFacts;
    if (contextAssembler !== undefined && typeof contextAssembler?.assemble !== 'function' || tokenize !== undefined && typeof tokenize !== 'function') fail('MEMORY_CONFIG');
    this.#assembler = contextAssembler; this.#tokenize = tokenize;
    this.#limits = { byteLimit: integer(byteLimit, 1, 262144), tokenLimit: integer(tokenLimit, 1, 131072) };
    this.#binding = freeze(clone(this.#binding));
  }
  #text(value, max = 65536) { return guarded(() => contextText(value, this.#secrets, max)); }
  #scope() { return { ownerRef: this.#binding.ownerRef, workspaceRef: this.#binding.workspaceRef }; }
  #core(snapshot) { return guarded(() => new FishballMemoryCore({ scope: this.#scope(), ...(snapshot === undefined ? {} : { snapshotText: JSON.stringify(snapshot) }), forbiddenSecrets: this.#secrets })); }
  #bindingCurrent() {
    const binding = guarded(() => this.#store.memoryBinding(this.#handle));
    if (binding.ownerRef !== this.#binding.ownerRef || binding.workspaceRef !== this.#binding.workspaceRef || binding.role !== this.#binding.role) fail('MEMORY_SCOPE');
  }
  #validate(projection) {
    exact(projection, ['contractVersion', 'scope', 'core', 'facts']);
    if (![MEMORY_PROJECTION_VERSION, LEGACY_MEMORY_PROJECTION_VERSION].includes(projection.contractVersion)) fail('MEMORY_CORRUPT');
    exact(projection.scope, ['ownerRef', 'workspaceRef']);
    if (projection.scope.ownerRef !== this.#binding.ownerRef || projection.scope.workspaceRef !== this.#binding.workspaceRef) fail('MEMORY_SCOPE');
    exact(projection.core, ['contractVersion', 'scope', 'world', 'preferences', 'turns', 'idSeq', 'session']);
    const core = this.#core(projection.core).snapshot();
    array(projection.facts, 1536); const seen = new Set();
    const live = new Map([...core.world.map(value => [value.id, { kind: 'world', value }]), ...core.preferences.map(value => [value.id, { kind: 'preference', value }]), ...core.turns.map(value => [value.id, { kind: 'turn', value }])]);
    const facts = projection.facts.map(value => {
      exact(value, ['id', 'kind', 'revision', 'previousRevision', 'sourceRefs', 'observedAt', 'confidence', 'deleted', 'conflictRefs'], ['id', 'kind', 'revision', 'sourceRefs', 'observedAt', 'confidence', 'deleted', 'conflictRefs']);
      integer(value.id, 1); integer(value.revision, 1); integer(value.observedAt); confidence(value.confidence); sources(value.sourceRefs); array(value.conflictRefs); value.conflictRefs.forEach(ref);
      if (!['world', 'preference', 'turn'].includes(value.kind) || typeof value.deleted !== 'boolean' || seen.has(value.id) || value.id > core.idSeq) fail('MEMORY_CORRUPT');
      if (value.revision === 1 && value.previousRevision !== undefined || value.revision > 1 && value.previousRevision !== value.revision - 1) fail('MEMORY_CORRUPT');
      const record = live.get(value.id);
      if (value.deleted ? !!record : !record || record.kind !== value.kind) fail('MEMORY_CORRUPT');
      if (record && record.value.recordedAt !== undefined && record.value.recordedAt !== value.observedAt || record?.kind === 'turn' && record.value.at !== value.observedAt) fail('MEMORY_CORRUPT');
      seen.add(value.id); live.delete(value.id); return clone(value);
    });
    if (live.size) fail('MEMORY_CORRUPT');
    const result = { contractVersion: MEMORY_PROJECTION_VERSION, scope: this.#scope(), core, facts };
    this.#text(JSON.stringify(result), MAX_BYTES); return result;
  }
  #read() {
    this.#bindingCurrent();
    const receipt = guarded(() => this.#store.getMemory(this.#handle, { namespaceRef: this.#namespace }));
    if (!receipt) return { receipt: null, revision: 0, projection: { contractVersion: MEMORY_PROJECTION_VERSION, scope: this.#scope(), core: this.#core().snapshot(), facts: [] } };
    if (receipt.ownerRef !== this.#binding.ownerRef || receipt.workspaceRef !== this.#binding.workspaceRef || receipt.namespaceRef !== this.#namespace) fail('MEMORY_SCOPE');
    integer(receipt.revision, 1);
    if (receipt.deleted) fail('MEMORY_DELETED');
    this.#text(receipt.content, MAX_BYTES);
    if (receipt.digest !== digest(receipt.content)) fail('MEMORY_CORRUPT');
    let parsed; try { parsed = JSON.parse(receipt.content); } catch { fail('MEMORY_CORRUPT'); }
    return { receipt, revision: receipt.revision, projection: this.#validate(parsed) };
  }
  #request(input, allowed, required = allowed) { exact(input, allowed, required); ref(input.commandRef); integer(input.expectedRevision); }
  #requestDigest(operation, input) { return digest(JSON.stringify(canonical({ operation, namespaceRef: this.#namespace, input }))); }
  #replay(input, requestDigest) {
    this.#bindingCurrent();
    const receipt = guarded(() => this.#store.memoryCommandReceipt(this.#handle, { namespaceRef: this.#namespace, commandRef: input.commandRef, requestDigest }));
    return receipt === null ? null : freeze({ ...clone(receipt), deduplicated: true });
  }
  #mutate(input, edit, operation, request = input) {
    if (!['owner', 'coordinator'].includes(this.#binding.role)) fail('UNAUTHORIZED');
    if (this.#busy) fail('MEMORY_BUSY');
    this.#busy = true;
    try {
      const requestDigest = this.#requestDigest(operation, request), replay = this.#replay(input, requestDigest);
      if (replay) return replay;
      const current = this.#read();
      if (current.revision !== input.expectedRevision) fail('STALE_MEMORY');
      const next = clone(current.projection), result = edit(next);
      const projection = this.#validate(next), content = JSON.stringify(projection);
      const sourceRefs = [...new Set(projection.facts.flatMap(fact => fact.sourceRefs))];
      // Receipt source list is the mutation's bounded provenance, not every
      // historical fact source. Per-fact sources remain encrypted in projection.
      const mutationSources = input.sourceRefs ?? sourceRefs.slice(0, 16);
      const receipt = guarded(() => this.#store.putMemory(this.#handle, { namespaceRef: this.#namespace, commandRef: input.commandRef, expectedRevision: current.revision, content, sourceRefs: mutationSources, requestDigest }));
      if (receipt?.deleted !== false || receipt?.namespaceRef !== this.#namespace || receipt?.revision !== current.revision + 1 || receipt?.digest !== digest(content) || receipt?.ownerRef !== this.#binding.ownerRef || receipt?.workspaceRef !== this.#binding.workspaceRef) fail('MEMORY_UNCERTAIN');
      return freeze({ ...receipt, result });
    } finally { this.#busy = false; }
  }
  state() { const current = this.#read(); return freeze({ namespaceRef: this.#namespace, revision: current.revision, projection: current.projection }); }
  listNamespaces() { this.#bindingCurrent(); return freeze(clone(guarded(() => this.#store.listMemory(this.#handle)))); }
  #candidate(input) {
    exact(input, ['kind', 'content', 'ttl', 'tier', 'embedding', 'confidence', 'sourceRefs', 'observedAt', 'conflictRefs'], ['kind', 'content', 'confidence', 'sourceRefs', 'observedAt']);
    if (!['world', 'preference'].includes(input.kind)) fail('MEMORY_INVALID');
    if (input.ttl !== undefined) this.#text(input.ttl, 128);
    if (input.tier !== undefined) { if (input.kind !== 'world') fail('MEMORY_INVALID'); this.#text(input.tier, 128); }
    confidence(input.confidence); sources(input.sourceRefs); integer(input.observedAt);
    if (input.conflictRefs !== undefined) { array(input.conflictRefs); input.conflictRefs.forEach(ref); }
    exact(input.content, input.kind === 'world' ? ['question', 'answer'] : ['text']);
    Object.values(input.content).forEach(value => this.#text(value));
    const normalized = this.#core();
    guarded(() => input.kind === 'world' ? normalized.recordWorldFact({ id: 1, ...input.content, ttl: input.ttl ?? 'ALWAYS_RESEARCH', tier: input.tier ?? 'LOW', embedding: input.embedding ?? [], recordedAt: input.observedAt }) : normalized.recordPreference({ id: 1, ...input.content, kind: 'TRANSIENT', ttl: input.ttl ?? 'ONE_MONTH', embedding: input.embedding ?? [], recordedAt: input.observedAt }));
    const checked = normalized.snapshot()[input.kind === 'world' ? 'world' : 'preferences'][0];
    return freeze({ kind: input.kind, content: clone(input.content), confidence: input.confidence, sourceRefs: [...input.sourceRefs], observedAt: input.observedAt, conflictRefs: [...(input.conflictRefs ?? [])], ttl: checked.ttl, embedding: [...checked.embedding], ...(input.kind === 'world' ? { tier: checked.tier } : {}) });
  }
  #append(projection, candidate) {
    const core = this.#core(projection.core), id = guarded(() => core.nextId());
    guarded(() => candidate.kind === 'world' ? core.recordWorldFact({ id, ...candidate.content, ttl: candidate.ttl ?? 'ALWAYS_RESEARCH', tier: candidate.tier ?? 'LOW', embedding: candidate.embedding ?? [], recordedAt: candidate.observedAt }) : core.recordPreference({ id, ...candidate.content, kind: 'TRANSIENT', ttl: candidate.ttl ?? 'ONE_MONTH', embedding: candidate.embedding ?? [], recordedAt: candidate.observedAt }));
    projection.core = core.snapshot();
    projection.facts.push({ id, kind: candidate.kind, revision: 1, sourceRefs: [...candidate.sourceRefs], observedAt: candidate.observedAt, confidence: candidate.confidence, deleted: false, conflictRefs: [...(candidate.conflictRefs ?? [])] });
    return id;
  }
  remember(input) {
    this.#request(input, ['commandRef', 'expectedRevision', 'candidate']);
    const candidate = this.#candidate(input.candidate);
    return this.#mutate({ ...input, sourceRefs: candidate.sourceRefs }, projection => ({ id: this.#append(projection, candidate), authority: 'memory_only' }), 'remember', { ...input, candidate });
  }
  correct(input) {
    this.#request(input, ['commandRef', 'expectedRevision', 'id', 'expectedFactRevision', 'candidate']); integer(input.id, 1); integer(input.expectedFactRevision, 1);
    const candidate = this.#candidate(input.candidate);
    return this.#mutate({ ...input, sourceRefs: candidate.sourceRefs }, projection => {
      const fact = projection.facts.find(value => value.id === input.id);
      if (!fact || fact.deleted || fact.revision !== input.expectedFactRevision || fact.kind !== candidate.kind) fail('MEMORY_CONFLICT');
      const core = this.#core(), record = candidate.kind === 'world' ? { id: input.id, ...candidate.content, ttl: candidate.ttl ?? 'ALWAYS_RESEARCH', tier: candidate.tier ?? 'LOW', embedding: candidate.embedding ?? [], recordedAt: candidate.observedAt } : { id: input.id, ...candidate.content, kind: 'TRANSIENT', ttl: candidate.ttl ?? 'ONE_MONTH', embedding: candidate.embedding ?? [], recordedAt: candidate.observedAt };
      guarded(() => candidate.kind === 'world' ? core.recordWorldFact(record) : core.recordPreference(record));
      const key = candidate.kind === 'world' ? 'world' : 'preferences';
      projection.core[key] = projection.core[key].map(value => value.id === input.id ? core.snapshot()[key][0] : value);
      Object.assign(fact, { previousRevision: fact.revision, revision: fact.revision + 1, sourceRefs: [...candidate.sourceRefs], observedAt: candidate.observedAt, confidence: candidate.confidence, conflictRefs: [...(candidate.conflictRefs ?? [])] });
      return { id: fact.id, factRevision: fact.revision, authority: 'memory_only' };
    }, 'correct', { ...input, candidate });
  }
  forget(input) {
    this.#request(input, ['commandRef', 'expectedRevision', 'id', 'expectedFactRevision']); integer(input.id, 1); integer(input.expectedFactRevision, 1);
    return this.#mutate(input, projection => {
      const fact = projection.facts.find(value => value.id === input.id);
      if (!fact || fact.deleted || fact.revision !== input.expectedFactRevision) fail('MEMORY_CONFLICT');
      const key = { world: 'world', preference: 'preferences', turn: 'turns' }[fact.kind];
      projection.core[key] = projection.core[key].filter(value => value.id !== fact.id);
      Object.assign(fact, { deleted: true, previousRevision: fact.revision, revision: fact.revision + 1 });
      return { id: fact.id, factRevision: fact.revision, deleted: true };
    }, 'forget');
  }
  deleteNamespace(input) {
    if (this.#binding.role !== 'owner') fail('UNAUTHORIZED');
    this.#request(input, ['commandRef', 'expectedRevision']); this.#bindingCurrent();
    const requestDigest = this.#requestDigest('delete_namespace', input), replay = this.#replay(input, requestDigest);
    if (replay) return replay;
    const receipt = guarded(() => this.#store.deleteMemory(this.#handle, { namespaceRef: this.#namespace, ...input, requestDigest }));
    if (receipt?.deleted !== true || receipt?.namespaceRef !== this.#namespace || receipt?.revision !== input.expectedRevision + 1) fail('MEMORY_UNCERTAIN');
    return freeze(clone(receipt));
  }
  retrieve(input) {
    exact(input, ['terms', 'vectors', 'now', 'limit'], ['terms', 'now']); array(input.terms, 32); input.terms.forEach(value => this.#text(value, 8192)); integer(input.now); integer(input.limit ?? 10, 0, 256);
    const current = this.#read(), core = this.#core(current.projection.core), vectors = input.vectors ?? [], limit = input.limit ?? 10;
    const found = guarded(() => [...core.recallWorldCandidates(input.terms, vectors, input.now, limit), ...core.recallPreferenceCandidates(input.terms, vectors, limit)].sort((a, b) => b.similarity - a.similarity).slice(0, limit));
    return freeze({ namespaceRef: this.#namespace, revision: current.revision, candidates: found.map(value => {
      const fact = current.projection.facts.find(item => item.id === value.fact.id);
      return { ...value, ...(fact.kind === 'preference' ? { fresh: guarded(() => preferenceFresh(value.fact, input.now)) } : {}), provenance: clone(fact), authority: 'memory_only', requiresVerification: true };
    }) });
  }
  async extract(input) {
    if (!['owner', 'coordinator'].includes(this.#binding.role)) fail('UNAUTHORIZED');
    this.#request(input, ['commandRef', 'expectedRevision', 'content', 'sourceRefs', 'observedAt']);
    const content = this.#text(input.content), sourceRefs = sources(input.sourceRefs), observedAt = integer(input.observedAt), commandRef = input.commandRef, expectedRevision = input.expectedRevision;
    const request = freeze({ content, sourceRefs, observedAt, commandRef, expectedRevision });
    const replay = this.#replay(request, this.#requestDigest('extract', request)); if (replay) return replay;
    if (!this.#extractor) fail('EXTRACTION_UNAVAILABLE');
    const before = this.#read(); if (before.revision !== expectedRevision) fail('STALE_MEMORY');
    let proposed;
    try { proposed = await this.#extractor(freeze({ content, sourceRefs, observedAt })); } catch { fail('EXTRACTION_UNAVAILABLE'); }
    array(proposed, 16);
    const candidates = proposed.map(value => {
      exact(value, ['kind', 'content', 'ttl', 'tier', 'embedding', 'confidence'], ['kind', 'content', 'confidence']);
      return this.#candidate({ ...value, sourceRefs, observedAt });
    });
    if (!candidates.length) return freeze({ state: 'no_facts', saved: false, revision: this.#read().revision });
    return this.#mutate({ commandRef, expectedRevision, sourceRefs }, projection => ({ ids: candidates.map(candidate => this.#append(projection, candidate)), authority: 'memory_only' }), 'extract', request);
  }
  importPinned(input) {
    this.#request(input, ['commandRef', 'expectedRevision', 'snapshotText', 'turnLogText', 'sourceRefs', 'observedAt', 'confidence'], ['commandRef', 'expectedRevision', 'sourceRefs', 'observedAt', 'confidence']);
    sources(input.sourceRefs); integer(input.observedAt); confidence(input.confidence);
    if (input.snapshotText !== undefined) this.#text(input.snapshotText, MAX_BYTES); if (input.turnLogText !== undefined) this.#text(input.turnLogText, MAX_BYTES);
    const imported = guarded(() => migratePinnedFishball({ scope: this.#scope(), snapshotText: input.snapshotText, turnLogText: input.turnLogText, forbiddenSecrets: this.#secrets }));
    return this.#mutate(input, projection => {
      if (projection.facts.length || projection.core.idSeq || input.expectedRevision !== 0) fail('MEMORY_CONFLICT');
      projection.core = imported;
      projection.facts = [...imported.world.map(value => ({ kind: 'world', value })), ...imported.preferences.map(value => ({ kind: 'preference', value })), ...imported.turns.map(value => ({ kind: 'turn', value }))].map(({ kind, value }) => ({ id: value.id, kind, revision: 1, sourceRefs: [...input.sourceRefs], observedAt: value.recordedAt ?? value.at, confidence: input.confidence, deleted: false, conflictRefs: [] }));
      return { imported: projection.facts.length, authority: 'memory_only' };
    }, 'import_pinned');
  }
  projectContext(input) {
    exact(input, ['taskRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'terms', 'vectors', 'now', 'limit'], ['taskRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'terms', 'now']);
    ref(input.taskRef); integer(input.expectedTaskVersion, 1); integer(input.expectedAuthEpoch);
    if (!['snapshot', 'task', 'readData'].every(key => typeof this.#store[key] === 'function')) fail('MEMORY_CONFIG');
    const snapshot = guarded(() => this.#store.snapshot(this.#handle, { taskRef: input.taskRef }));
    const check = task => {
      if (task.ownerRef !== this.#binding.ownerRef || task.workspaceRef !== this.#binding.workspaceRef) fail('MEMORY_SCOPE');
      if (task.version !== input.expectedTaskVersion) fail('STALE_VERSION'); if (task.authEpoch !== input.expectedAuthEpoch) fail('STALE_AUTHORITY');
    };
    check(snapshot.task);
    const latest = kind => snapshot.data.filter(value => value.kind === kind).sort((a, b) => b.taskVersion - a.taskVersion)[0];
    const instructions = ['goal', 'constraints'].map(kind => {
      const meta = latest(kind); if (!meta) return { kind, content: '' };
      const data = guarded(() => this.#store.readData(this.#handle, { taskRef: input.taskRef, recordRef: meta.recordRef })); this.#text(data.content);
      if (data.digest !== digest(data.content)) fail('MEMORY_CORRUPT'); return { kind, recordRef: data.recordRef, content: data.content };
    });
    const memory = this.retrieve({ terms: input.terms, ...(input.vectors === undefined ? {} : { vectors: input.vectors }), now: input.now, limit: input.limit ?? 10 });
    check(guarded(() => this.#store.task(this.#handle, input.taskRef)));
    return freeze({ authority: { task: clone(snapshot.task), actions: clone(snapshot.actions), currentInstructions: instructions }, memory, conflicts: memory.candidates.map(value => ({ id: value.fact.id, state: 'verify_against_current_authority', conflictRefs: value.provenance.conflictRefs })), verification: 'module_memory_projection_only' });
  }
  async assembleContext(input) {
    exact(input, ['taskRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'generationRef', 'recordRefs', 'terms', 'vectors', 'now', 'limit'], ['taskRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'terms', 'now']);
    if (!this.#assembler || !this.#tokenize) fail('MEMORY_CONFIG');
    ref(input.taskRef); integer(input.expectedTaskVersion, 1); integer(input.expectedAuthEpoch); integer(input.now); integer(input.limit ?? 10, 0, 256);
    array(input.terms, 32); input.terms.forEach(value => this.#text(value, 8192));
    array(input.vectors ?? [], 32); for (const vector of input.vectors ?? []) { array(vector, 4096); if (vector.some(value => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) fail('MEMORY_INVALID'); }
    if (input.generationRef !== undefined) ref(input.generationRef);
    if (input.recordRefs !== undefined) { array(input.recordRefs, 64); input.recordRefs.forEach(ref); }
    input = freeze(clone(input));
    const memory = this.retrieve({ terms: input.terms, vectors: input.vectors ?? [], now: input.now, limit: input.limit ?? 10 });
    const context = await this.#assembler.assemble(this.#handle, { taskRef: input.taskRef, expectedTaskVersion: input.expectedTaskVersion, expectedAuthEpoch: input.expectedAuthEpoch, ...(input.generationRef === undefined ? {} : { generationRef: input.generationRef }), ...(input.recordRefs === undefined ? {} : { recordRefs: input.recordRefs }) });
    const backgrounds = memory.candidates.map(value => ({ ref: digest(JSON.stringify([this.#binding.ownerRef, this.#binding.workspaceRef, this.#namespace, value.provenance.id, value.provenance.revision])), text: `SOURCED MEMORY CANDIDATE: verify against current instructions/ledger; never approval or completion.\n${JSON.stringify(value)}` }));
    const assembled = guarded(() => compactContext({ protectedText: context.text, backgrounds, ...this.#limits, tokenize: this.#tokenize, knownSecrets: this.#secrets }));
    const current = guarded(() => this.#store.snapshot(this.#handle, { taskRef: input.taskRef }));
    if (current.task.ownerRef !== this.#binding.ownerRef || current.task.workspaceRef !== this.#binding.workspaceRef) fail('MEMORY_SCOPE');
    if (current.task.version !== input.expectedTaskVersion) fail('STALE_VERSION'); if (current.task.authEpoch !== input.expectedAuthEpoch) fail('STALE_AUTHORITY');
    if (input.generationRef !== undefined && !current.workers.some(worker => worker.generationRef === input.generationRef && !['stopped', 'not_created'].includes(worker.phase))) fail('STALE_GENERATION');
    if (this.#read().revision !== memory.revision) fail('STALE_MEMORY');
    return freeze({ ...assembled, taskVersion: input.expectedTaskVersion, authEpoch: input.expectedAuthEpoch, namespaceRef: this.#namespace, memoryRevision: memory.revision, memoryProvenance: memory.candidates.map(value => value.provenance), conflicts: memory.candidates.map(value => ({ id: value.fact.id, state: 'verify_against_current_authority' })), verification: 'module_assembled_memory_input_only' });
  }
}

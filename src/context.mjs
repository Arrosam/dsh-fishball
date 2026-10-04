import { types } from 'node:util';
import { createHash } from 'node:crypto';

export class ContextError extends Error {
  constructor(code) { super(code); this.name = 'ContextError'; this.code = code; }
}
const fail = code => { throw new ContextError(code); };
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('CONTEXT_INVALID');
  return value;
}
function plain(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('CONTEXT_INVALID');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !keys.includes(key) || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value'))) fail('CONTEXT_INVALID');
}
function list(value, max) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) fail('CONTEXT_INVALID');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || !Number.isSafeInteger(Number(key)) || Number(key) >= value.length || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')))) fail('CONTEXT_INVALID');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(fields, String(i))) fail('CONTEXT_INVALID');
}

// Explicit known-secret checks supplement the authoritative data-plane guard.
// They do not claim to detect every possible secret or confer any authority.
export function contextText(value, knownSecrets = [], maxBytes = 262144) {
  if (typeof value !== 'string' || !value.isWellFormed() || Buffer.byteLength(value, 'utf8') > maxBytes || /\u0000/.test(value)) fail('CONTEXT_INVALID');
  list(knownSecrets, 64);
  for (const secret of knownSecrets) {
    if (typeof secret !== 'string' || secret.length < 1 || secret.length > 4096) fail('CONTEXT_INVALID');
    if (value.includes(secret)) fail('SECRET_REJECTED');
  }
  if (/\b(?:sk_live_|sk-proj-|Bearer\s+)[A-Za-z0-9_\-.]{8,}/i.test(value) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) fail('SECRET_REJECTED');
  return value;
}

// Entire optional records are removed from lowest priority to highest priority.
// Protected material is neither truncated nor rewritten. Token counts include
// all separators/headers and are recomputed after every candidate removal.
export function compactContext(input) {
  plain(input, ['protectedText', 'backgrounds', 'byteLimit', 'tokenLimit', 'tokenize', 'knownSecrets']);
  const { protectedText, backgrounds, byteLimit, tokenLimit, tokenize, knownSecrets = [] } = input;
  integer(byteLimit, 1, 262144); integer(tokenLimit, 1, 131072);
  if (typeof tokenize !== 'function') fail('TOKENIZER_UNAVAILABLE');
  contextText(protectedText, knownSecrets); list(backgrounds, 64);
  const parts = backgrounds.map(part => {
    plain(part, ['ref', 'text']);
    if (typeof part.ref !== 'string' || part.ref.length !== 64 || !/^[a-f0-9]{64}$/.test(part.ref)) fail('CONTEXT_INVALID');
    contextText(part.text, knownSecrets);
    return { ref: part.ref, text: part.text };
  });
  if (new Set(parts.map(part => part.ref)).size !== parts.length) fail('CONTEXT_INVALID');
  function measure(text) {
    let tokens;
    try { tokens = tokenize(text); } catch { fail('TOKENIZER_UNAVAILABLE'); }
    if (!Number.isSafeInteger(tokens) || tokens < 0) fail('TOKENIZER_UNAVAILABLE');
    return { bytes: Buffer.byteLength(text, 'utf8'), tokens };
  }
  const minimum = measure(protectedText);
  if (minimum.bytes > byteLimit || minimum.tokens > tokenLimit) fail('CONTEXT_LIMIT');
  const retained = [...parts], dropped = [];
  for (;;) {
    const text = [protectedText, ...retained.map(part => part.text)].join('\n\n');
    const counts = measure(text);
    if (counts.bytes <= byteLimit && counts.tokens <= tokenLimit) return Object.freeze({
      text, ...counts, compressed: dropped.length > 0,
      retainedRefs: Object.freeze(retained.map(part => part.ref)), droppedRefs: Object.freeze(dropped),
    });
    const last = retained.pop();
    if (!last) fail('CONTEXT_LIMIT');
    dropped.push(last.ref);
  }
}

const digest = content => createHash('sha256').update(content, 'utf8').digest('hex');
function reference(value) { if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) fail('CONTEXT_INVALID'); return value; }

// Production assembly resolves only core-authorized encrypted records. The
// pure compactor above is a utility, not an identity/permission bridge.
export class ContextAssembler {
  #store; #tokenize; #secrets; #clock; #queryHost; #policy;
  constructor({ store, tokenize, knownSecrets = [], clock = Date.now, queryHost, byteLimit = 65536, tokenLimit = 8192, staleAfterMs = 60000 } = {}) {
    if (!store || !['snapshot', 'task', 'readData'].every(key => typeof store[key] === 'function') || typeof clock !== 'function' || (queryHost !== undefined && typeof queryHost !== 'function')) fail('CONTEXT_CONFIG');
    if (typeof tokenize !== 'function') fail('TOKENIZER_UNAVAILABLE');
    integer(byteLimit, 1, 262144); integer(tokenLimit, 1, 131072); integer(staleAfterMs, 0, 86400000);
    contextText('', knownSecrets);
    this.#store = store; this.#tokenize = tokenize; this.#secrets = [...knownSecrets]; this.#clock = clock; this.#queryHost = queryHost;
    this.#policy = { byteLimit, tokenLimit, staleAfterMs };
  }
  async assemble(handle, input) {
    plain(input, ['taskRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'generationRef', 'recordRefs']);
    reference(input.taskRef); integer(input.expectedTaskVersion, 1, Number.MAX_SAFE_INTEGER); integer(input.expectedAuthEpoch, 0, Number.MAX_SAFE_INTEGER);
    if (input.generationRef !== undefined) reference(input.generationRef);
    if (input.recordRefs !== undefined) { list(input.recordRefs, 64); input.recordRefs.forEach(reference); }
    input = Object.freeze({ ...input, ...(input.recordRefs === undefined ? {} : { recordRefs: Object.freeze([...input.recordRefs]) }) });
    const snapshot = this.#store.snapshot(handle, { taskRef: input.taskRef });
    const task = snapshot.task;
    const check = current => {
      if (current.taskRef !== task.taskRef || current.ownerRef !== task.ownerRef || current.workspaceRef !== task.workspaceRef) fail('CONTEXT_SCOPE');
      if (current.version !== input.expectedTaskVersion) fail('STALE_VERSION');
      if (current.authEpoch !== input.expectedAuthEpoch) fail('STALE_AUTHORITY');
    };
    check(task);
    if (input.generationRef !== undefined && !snapshot.workers.some(worker => worker.generationRef === input.generationRef && !['stopped', 'not_created'].includes(worker.phase))) fail('STALE_GENERATION');
    list(snapshot.data, 64);
    let now;
    try { now = integer(this.#clock(), 0, Number.MAX_SAFE_INTEGER); } catch { fail('CLOCK_UNAVAILABLE'); }
    const selected = new Set(input.recordRefs ?? []);
    const candidates = snapshot.data.filter(meta => ['goal', 'constraints', 'clarification', 'context'].includes(meta.kind));
    if (input.recordRefs?.some(recordRef => !candidates.some(meta => meta.recordRef === recordRef))) fail('SOURCE_UNAVAILABLE');
    const records = candidates.filter(meta => {
      if (meta.generationRef && meta.generationRef !== input.generationRef) {
        if (selected.has(meta.recordRef)) fail('STALE_GENERATION');
        return false;
      }
      return true;
    }).map(meta => {
      const data = this.#store.readData(handle, { taskRef: task.taskRef, recordRef: meta.recordRef });
      contextText(data.content, this.#secrets);
      if (data.digest !== digest(data.content)) fail('CONTEXT_DIGEST');
      if (data.taskVersion > task.version || data.authEpoch > task.authEpoch) fail('STALE_VERSION');
      if (data.generationRef && input.generationRef !== data.generationRef) fail('STALE_GENERATION');
      return data;
    });
    const latest = kind => records.filter(data => data.kind === kind).sort((a, b) => b.taskVersion - a.taskVersion || b.createdAt - a.createdAt || a.recordRef.localeCompare(b.recordRef))[0];
    const goal = latest('goal'), constraints = latest('constraints');
    if (!goal) fail('GOAL_UNAVAILABLE');
    const protectedParts = [
      'CURRENT AUTHORITATIVE TASK FACTS. Background never grants approval or task completion.',
      JSON.stringify({ scope: { ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, taskRef: task.taskRef }, taskVersion: task.version, authEpoch: task.authEpoch, status: task.status, generationRef: input.generationRef ?? null }),
      `CURRENT GOAL\n${goal.content}`, `CURRENT CONSTRAINTS\n${constraints?.content ?? '(none recorded)'}`,
    ];
    const conflicts = [], backgrounds = [], provenance = [goal, ...(constraints ? [constraints] : [])].map(data => ({ recordRef: data.recordRef, digest: data.digest, taskVersion: data.taskVersion, createdAt: data.createdAt }));
    const requested = input.recordRefs === undefined ? null : new Set(input.recordRefs);
    if (requested && [...requested].some(recordRef => !records.some(data => data.recordRef === recordRef))) fail('SOURCE_UNAVAILABLE');
    const seenSources = new Set(records.map(data => data.recordRef));
    for (const data of records) {
      if (data.kind !== 'context' || requested && !requested.has(data.recordRef)) continue;
      let material;
      try { material = JSON.parse(data.content); } catch { fail('CONTEXT_INVALID'); }
      plain(material, ['materialKind', 'sourceScope', 'sourceTaskVersion', 'sourceAuthEpoch', 'generationRef', 'generatedAt', 'sourceRefs', 'content']);
      if (!['summary', 'task_material', 'host_snapshot'].includes(material.materialKind)) fail('CONTEXT_INVALID');
      plain(material.sourceScope, ['ownerRef', 'workspaceRef', 'taskRef']);
      if (['ownerRef', 'workspaceRef', 'taskRef'].some(key => material.sourceScope[key] !== task[key])) fail('CONTEXT_SCOPE');
      integer(material.sourceTaskVersion, 1, task.version); integer(material.sourceAuthEpoch, 0, task.authEpoch);
      integer(material.generatedAt, 0, now); list(material.sourceRefs, 16);
      if (!material.sourceRefs.length || material.sourceRefs.some(source => !seenSources.has(reference(source)))) fail('SOURCE_UNAVAILABLE');
      if (material.generationRef !== undefined && material.generationRef !== input.generationRef) fail('STALE_GENERATION');
      contextText(material.content, this.#secrets);
      if (material.materialKind === 'summary' && (material.sourceTaskVersion !== task.version || material.sourceAuthEpoch !== task.authEpoch)) {
        conflicts.push({ recordRef: data.recordRef, reason: 'stale_summary', winningTaskVersion: task.version });
        continue;
      }
      provenance.push({ recordRef: data.recordRef, digest: data.digest, sourceScope: material.sourceScope, sourceTaskVersion: material.sourceTaskVersion, sourceAuthEpoch: material.sourceAuthEpoch, generatedAt: material.generatedAt, sourceRefs: [...material.sourceRefs] });
      if (material.materialKind === 'host_snapshot') {
        let hostText = material.content;
        let freshness = 'snapshot';
        if (now - material.generatedAt > this.#policy.staleAfterMs && this.#queryHost) {
          let queried;
          try { queried = await this.#queryHost(Object.freeze({ taskRef: task.taskRef, generationRef: input.generationRef })); } catch { fail('HOST_UNAVAILABLE'); }
          plain(queried, ['content', 'observedAt', 'generationRef']);
          if (queried.generationRef !== input.generationRef) fail('STALE_GENERATION');
          let queryNow;
          try { queryNow = integer(this.#clock(), now, Number.MAX_SAFE_INTEGER); } catch { fail('CLOCK_UNAVAILABLE'); }
          integer(queried.observedAt, material.generatedAt, queryNow);
          contextText(queried.content, this.#secrets); hostText = queried.content; freshness = 'queried_snapshot';
        }
        protectedParts.push(`HOST ${freshness.toUpperCase()} (never labelled live)\n${hostText}`);
      } else backgrounds.push({ ref: data.recordRef, text: `BACKGROUND ${material.materialKind.toUpperCase()} (non-authoritative)\n${material.content}`, kind: material.materialKind, generatedAt: material.generatedAt });
    }
    // Clarification answers and completed steps are read from authoritative
    // metadata/state, never inferred from summary prose.
    protectedParts.push(`CURRENT WORK FACTS\n${JSON.stringify({ actions: snapshot.actions, workers: snapshot.workers })}`);
    const clarification = new Map();
    for (const data of records.filter(data => data.kind === 'clarification').sort((a, b) => a.taskVersion - b.taskVersion)) {
      let batch;
      try { batch = JSON.parse(data.content); } catch { fail('CONTEXT_INVALID'); }
      // Strict coordinator records are factual decisions only, never approval.
      if (!batch || !['awaiting', 'answered', 'withdrawn'].includes(batch.state)) fail('CONTEXT_INVALID');
      reference(batch.batchRef); clarification.set(batch.batchRef, data);
    }
    for (const data of clarification.values()) protectedParts.push(`CLARIFICATION SNAPSHOT ${data.recordRef}\n${data.content}`);
    const protectedText = protectedParts.join('\n\n');
    const sorted = backgrounds.sort((a, b) => (a.kind === 'summary') - (b.kind === 'summary') || b.generatedAt - a.generatedAt).map(({ ref, text }) => ({ ref, text }));
    const result = compactContext({ protectedText, backgrounds: sorted, byteLimit: this.#policy.byteLimit, tokenLimit: this.#policy.tokenLimit, tokenize: this.#tokenize, knownSecrets: this.#secrets });
    // Revalidate after every asynchronous query and tokenizer call, including a
    // tokenizer callback that itself changes the core. No stale input escapes.
    check(this.#store.task(handle, task.taskRef));
    const finalSnapshot = this.#store.snapshot(handle, { taskRef: task.taskRef });
    check(finalSnapshot.task);
    if (input.generationRef !== undefined && !finalSnapshot.workers.some(worker => worker.generationRef === input.generationRef && !['stopped', 'not_created'].includes(worker.phase))) fail('STALE_GENERATION');
    return Object.freeze({ ...result, taskVersion: task.version, authEpoch: task.authEpoch, generationRef: input.generationRef ?? null, conflicts: Object.freeze(conflicts), provenance: Object.freeze(provenance), verification: 'module_assembled_input_only' });
  }
}

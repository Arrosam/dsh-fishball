import { assertPreparationSourceBinding, preparationSourceMethods } from './runtime-store.mjs';
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
export const EXECUTION_CONTEXT_VERSION = 'df.execution-context/v1';
export function validateExecutionContext(value, options = {}) {
  plain(options, ['scope', 'maxTaskVersion', 'maxAuthEpoch', 'maxGeneratedAt', 'availableRecordRefs', 'knownSecrets']);
  plain(value, ['contractVersion', 'materialKind', 'sourceScope', 'sourceTaskVersion', 'sourceAuthEpoch', 'generatedAt', 'sourceRefs', 'sourceProvenance', 'memory', 'ledgerSnapshotDigest', 'content', 'inputCounts', 'retainedRefs', 'droppedRefs', 'verification']);
  if (value.contractVersion !== EXECUTION_CONTEXT_VERSION || value.materialKind !== 'execution_context' || value.verification !== 'module_prepared_execution_context_only') fail('CONTEXT_INVALID');
  plain(value.sourceScope, ['ownerRef', 'workspaceRef', 'taskRef']);
  for (const field of ['ownerRef', 'workspaceRef', 'taskRef']) { reference(value.sourceScope[field]); if (options.scope && value.sourceScope[field] !== options.scope[field]) fail('CONTEXT_SCOPE'); }
  integer(value.sourceTaskVersion, 1, options.maxTaskVersion ?? Number.MAX_SAFE_INTEGER); integer(value.sourceAuthEpoch, 0, options.maxAuthEpoch ?? Number.MAX_SAFE_INTEGER); integer(value.generatedAt, 0, options.maxGeneratedAt ?? Number.MAX_SAFE_INTEGER);
  list(value.sourceRefs, 64); if (!value.sourceRefs.length || new Set(value.sourceRefs.map(reference)).size !== value.sourceRefs.length) fail('CONTEXT_INVALID');
  if (options.availableRecordRefs && value.sourceRefs.some(source => !options.availableRecordRefs.has(source))) fail('SOURCE_UNAVAILABLE');
  list(value.sourceProvenance, 64);
  const refs = new Set();
  for (const source of value.sourceProvenance) {
    plain(source, ['recordRef', 'digest', 'taskVersion', 'authEpoch', 'createdAt', 'sourceScope', 'sourceTaskVersion', 'sourceAuthEpoch', 'generatedAt', 'sourceRefs', 'observation', 'observedAt', 'observationDigest', 'supplement']);
    reference(source.recordRef); reference(source.digest); integer(source.taskVersion, 1, value.sourceTaskVersion); integer(source.authEpoch, 0, value.sourceAuthEpoch); integer(source.createdAt, 0, value.generatedAt);
    if (!value.sourceRefs.includes(source.recordRef) || refs.has(source.recordRef)) fail('CONTEXT_INVALID'); refs.add(source.recordRef);
    if (source.sourceScope !== undefined) { plain(source.sourceScope, ['ownerRef', 'workspaceRef', 'taskRef']); if (['ownerRef', 'workspaceRef', 'taskRef'].some(field => source.sourceScope[field] !== value.sourceScope[field])) fail('CONTEXT_SCOPE'); }
    if (source.sourceTaskVersion !== undefined) integer(source.sourceTaskVersion, 1, value.sourceTaskVersion);
    if (source.sourceAuthEpoch !== undefined) integer(source.sourceAuthEpoch, 0, value.sourceAuthEpoch);
    if (source.generatedAt !== undefined) integer(source.generatedAt, 0, value.generatedAt);
    if (source.sourceRefs !== undefined) { list(source.sourceRefs, 16); source.sourceRefs.forEach(reference); if (options.availableRecordRefs && source.sourceRefs.some(ref => !options.availableRecordRefs.has(ref))) fail('SOURCE_UNAVAILABLE'); }
    if (source.supplement !== undefined) {
      plain(source.supplement, ['contractVersion', 'sourceRef', 'subscriptionRef', 'eventRef', 'eventDigest', 'observedAt', 'taskRef']);
      if (source.supplement.contractVersion !== 'df.supplement/v1' || source.supplement.taskRef !== value.sourceScope.taskRef || source.sourceTaskVersion !== source.taskVersion - 1 || source.sourceAuthEpoch !== source.authEpoch) fail('CONTEXT_INVALID');
      for (const field of ['sourceRef', 'subscriptionRef', 'eventRef', 'eventDigest', 'taskRef']) reference(source.supplement[field]);
      integer(source.supplement.observedAt, 0, source.createdAt);
    }
    if (source.observation !== undefined) { if (source.observation !== 'queried_snapshot') fail('CONTEXT_INVALID'); integer(source.observedAt, 0, value.generatedAt); reference(source.observationDigest); }
    else if (source.observedAt !== undefined || source.observationDigest !== undefined) fail('CONTEXT_INVALID');
  }
  if (refs.size !== value.sourceRefs.length) fail('CONTEXT_INVALID');
  if (value.memory !== undefined) {
    plain(value.memory, ['namespaceRef', 'revision', 'provenance']); reference(value.memory.namespaceRef); integer(value.memory.revision, 0, Number.MAX_SAFE_INTEGER); list(value.memory.provenance, 32);
    const ids = new Set();
    for (const fact of value.memory.provenance) {
      plain(fact, ['id', 'kind', 'revision', 'previousRevision', 'sourceRefs', 'observedAt', 'confidence', 'deleted', 'conflictRefs']);
      integer(fact.id, 1, Number.MAX_SAFE_INTEGER); integer(fact.revision, 1, Number.MAX_SAFE_INTEGER); integer(fact.observedAt, 0, Number.MAX_SAFE_INTEGER);
      if (!['world', 'preference', 'turn'].includes(fact.kind) || fact.deleted !== false || ids.has(fact.id) || typeof fact.confidence !== 'number' || !Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1) fail('CONTEXT_INVALID'); ids.add(fact.id);
      if (fact.revision === 1 ? fact.previousRevision !== undefined : fact.previousRevision !== fact.revision - 1) fail('CONTEXT_INVALID');
      list(fact.sourceRefs, 16); if (!fact.sourceRefs.length || new Set(fact.sourceRefs.map(reference)).size !== fact.sourceRefs.length) fail('CONTEXT_INVALID');
      list(fact.conflictRefs, 16); fact.conflictRefs.forEach(reference);
    }
    if (value.memory.revision === 0 && value.memory.provenance.length) fail('CONTEXT_INVALID');
  }
  reference(value.ledgerSnapshotDigest); contextText(value.content, options.knownSecrets ?? [], 65536);
  plain(value.inputCounts, ['bytes', 'tokens']); integer(value.inputCounts.bytes, 0, 262144); integer(value.inputCounts.tokens, 0, 131072);
  if (value.inputCounts.bytes !== Buffer.byteLength(value.content, 'utf8')) fail('CONTEXT_INVALID');
  list(value.retainedRefs, 64); list(value.droppedRefs, 64); const retained = new Set(value.retainedRefs.map(reference));
  if (retained.size !== value.retainedRefs.length || new Set(value.droppedRefs.map(reference)).size !== value.droppedRefs.length || value.droppedRefs.some(ref => retained.has(ref))) fail('CONTEXT_INVALID');
  return value;
}

// Production assembly resolves only core-authorized encrypted records. The
// pure compactor above is a utility, not an identity/permission bridge.
const PREPARATION_ASSEMBLER=Symbol('df.assembler-preparation-source/v1');
export class ContextAssembler {
  #preparationBinding=null; #store; #tokenize; #secrets; #clock; #queryHost; #policy;
  constructor({ store, tokenize, knownSecrets = [], clock = Date.now, queryHost, byteLimit = 65536, tokenLimit = 8192, staleAfterMs = 60000, preparationBinding } = {}) {
    if(preparationBinding!==undefined){plain(preparationBinding,['capability','handle']);if(!Object.hasOwn(preparationBinding,'capability')||!Object.hasOwn(preparationBinding,'handle'))fail('CONTEXT_CONFIG');assertPreparationSourceBinding(store,preparationBinding.capability,preparationBinding.handle);}
    if (!store || preparationBinding===undefined&&!['snapshot', 'task', 'readData'].every(key => typeof store[key] === 'function') || typeof clock !== 'function' || (queryHost !== undefined && typeof queryHost !== 'function')) fail('CONTEXT_CONFIG');
    if (typeof tokenize !== 'function') fail('TOKENIZER_UNAVAILABLE');
    integer(byteLimit, 1, 262144); integer(tokenLimit, 1, 131072); integer(staleAfterMs, 0, 86400000);
    contextText('', knownSecrets);
    this.#store = store; this.#tokenize = tokenize; this.#secrets = [...knownSecrets]; this.#clock = clock; this.#queryHost = queryHost;
    this.#policy = { byteLimit, tokenLimit, staleAfterMs };
    if(preparationBinding!==undefined){plain(preparationBinding,['capability','handle']);if(!Object.hasOwn(preparationBinding,'capability')||!Object.hasOwn(preparationBinding,'handle'))fail('CONTEXT_CONFIG');assertPreparationSourceBinding(store,preparationBinding.capability,preparationBinding.handle);this.#preparationBinding=Object.freeze({...preparationBinding});}
  }
  [PREPARATION_ASSEMBLER](store,capability,handle){const binding=this.#preparationBinding;if(this.#store!==store||!binding||binding.capability!==capability)fail('CONTEXT_SCOPE');const issued=assertPreparationSourceBinding(store,capability,binding.handle),caller=assertPreparationSourceBinding(store,capability,handle);if(issued.ownerRef!==caller.ownerRef||issued.workspaceRef!==caller.workspaceRef||issued.namespaceRef!==caller.namespaceRef)fail('CONTEXT_SCOPE');}
  async assemble(handle,input){return this.#assemble(handle,input,false);}
  async assembleForPreparation(capability,input){const binding=this.#preparationBinding;if(!binding||binding.capability!==capability)fail('CONTEXT_SCOPE');plain(input,['taskRef','expectedTaskVersion','expectedAuthEpoch','recordRefs']);assertPreparationSourceBinding(this.#store,capability,binding.handle,undefined,input.taskRef);const result=await this.#assemble(binding.handle,input,true);assertPreparationSourceBinding(this.#store,capability,binding.handle,undefined,input.taskRef);return result;}
  #sourceCall(preparation,handle,name,...args){if(!preparation)return this.#store[name](handle,...args);const taskRef=name==='task'?args[0]:args[0].taskRef;assertPreparationSourceBinding(this.#store,this.#preparationBinding.capability,handle,undefined,taskRef);return preparationSourceMethods[name].call(this.#store,handle,...args);}
  async #assemble(handle, input, preparation) {
    plain(input, ['taskRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'generationRef', 'recordRefs']);
    reference(input.taskRef); integer(input.expectedTaskVersion, 1, Number.MAX_SAFE_INTEGER); integer(input.expectedAuthEpoch, 0, Number.MAX_SAFE_INTEGER);
    if (input.generationRef !== undefined) reference(input.generationRef);
    if (input.recordRefs !== undefined) { list(input.recordRefs, 64); input.recordRefs.forEach(reference); }
    input = Object.freeze({ ...input, ...(input.recordRefs === undefined ? {} : { recordRefs: Object.freeze([...input.recordRefs]) }) });
    const snapshot = this.#sourceCall(preparation,handle,'snapshot', { taskRef: input.taskRef });
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
    // Derived audit inputs are authenticated core associations, never ordinary
    // background or task instructions. Keep their actual context kind visible
    // in the ledger; exclude them here before any plaintext read or assembly.
    const candidates = snapshot.data.filter(meta => meta.auditInputRef === undefined && ['goal', 'constraints', 'clarification', 'context'].includes(meta.kind));
    if (input.recordRefs?.some(recordRef => !candidates.some(meta => meta.recordRef === recordRef))) fail('SOURCE_UNAVAILABLE');
    const records = candidates.filter(meta => {
      if (meta.generationRef && meta.generationRef !== input.generationRef) {
        if (selected.has(meta.recordRef)) fail('STALE_GENERATION');
        // An admitted instruction is never optional generation background.
        // Reject an inconsistent binding rather than silently dropping it.
        if (meta.kind === 'context') {
          const data = this.#sourceCall(preparation,handle,'readData', { taskRef: task.taskRef, recordRef: meta.recordRef });
          contextText(data.content, this.#secrets);
          if (data.digest !== digest(data.content)) fail('CONTEXT_DIGEST');
          let material; try { material = JSON.parse(data.content); } catch { return false; }
          if (material?.materialKind === 'current_instruction' || material?.contractVersion === 'df.supplement/v1') fail('STALE_GENERATION');
        }
        return false;
      }
      return true;
    }).map(meta => {
      const data = this.#sourceCall(preparation,handle,'readData', { taskRef: task.taskRef, recordRef: meta.recordRef });
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
    const recordProvenance = data => ({ recordRef: data.recordRef, digest: data.digest, taskVersion: data.taskVersion, authEpoch: data.authEpoch, createdAt: data.createdAt });
    const examinedSummaryRefs=[],winningSourceRefs=[goal.recordRef,...(constraints?[constraints.recordRef]:[])];
    const conflicts = [], backgrounds = [], provenance = [goal, ...(constraints ? [constraints] : [])].map(recordProvenance);
    const requested = input.recordRefs === undefined ? null : new Set(input.recordRefs);
    if (requested && [...requested].some(recordRef => !records.some(data => data.recordRef === recordRef))) fail('SOURCE_UNAVAILABLE');
    const seenSources = new Set(records.map(data => data.recordRef));
    for (const data of [...records].sort((a, b) => a.taskVersion - b.taskVersion || a.createdAt - b.createdAt || a.recordRef.localeCompare(b.recordRef))) {
      if (data.kind !== 'context') continue;
      let material;
      try { material = JSON.parse(data.content); } catch { fail('CONTEXT_INVALID'); }
      if (material?.materialKind === 'current_instruction' || material?.contractVersion === 'df.supplement/v1') {
        plain(material, ['contractVersion', 'materialKind', 'content', 'sourceRef', 'subscriptionRef', 'eventRef', 'eventDigest', 'observedAt', 'taskRef']);
        if (material.contractVersion !== 'df.supplement/v1' || material.materialKind !== 'current_instruction') fail('CONTEXT_INVALID');
        for (const field of ['sourceRef', 'subscriptionRef', 'eventRef', 'eventDigest', 'taskRef']) reference(material[field]);
        if (material.taskRef !== task.taskRef) fail('CONTEXT_SCOPE');
        if (material.sourceRef !== data.sourceRef || data.generationRef !== null || data.sourceTaskVersion !== data.taskVersion - 1 || data.sourceAuthEpoch !== data.authEpoch) fail('CONTEXT_INVALID');
        integer(data.sourceTaskVersion, 1, task.version); integer(data.sourceAuthEpoch, 0, task.authEpoch); integer(material.observedAt, 0, Math.min(data.createdAt, now));
        contextText(material.content, this.#secrets, 65536);
        const { content: _content, materialKind: _kind, ...supplement } = material;
        winningSourceRefs.push(data.recordRef);
        provenance.push({ ...recordProvenance(data), sourceTaskVersion: data.sourceTaskVersion, sourceAuthEpoch: data.sourceAuthEpoch, supplement });
        protectedParts.push(`CURRENT SUPPLEMENTAL INSTRUCTION ${data.recordRef} (admitted content; grants no approval or completion)\n${material.content}`);
        continue;
      }
      if (requested && !requested.has(data.recordRef)) continue;
      if (material?.materialKind === 'execution_context') {
        validateExecutionContext(material, { scope: task, maxTaskVersion: task.version, maxAuthEpoch: task.authEpoch, maxGeneratedAt: now, availableRecordRefs: seenSources, knownSecrets: this.#secrets });
        if (requested?.has(data.recordRef)) fail('CONTEXT_RECURSION');
        continue;
      }
      plain(material, ['materialKind', 'sourceScope', 'sourceTaskVersion', 'sourceAuthEpoch', 'generationRef', 'generatedAt', 'sourceRefs', 'content']);
      if (!['summary', 'task_material', 'host_snapshot'].includes(material.materialKind)) fail('CONTEXT_INVALID');
      plain(material.sourceScope, ['ownerRef', 'workspaceRef', 'taskRef']);
      if (['ownerRef', 'workspaceRef', 'taskRef'].some(key => material.sourceScope[key] !== task[key])) fail('CONTEXT_SCOPE');
      integer(material.sourceTaskVersion, 1, task.version); integer(material.sourceAuthEpoch, 0, task.authEpoch);
      integer(material.generatedAt, 0, now); list(material.sourceRefs, 16);
      if (!material.sourceRefs.length || material.sourceRefs.some(source => !seenSources.has(reference(source)))) fail('SOURCE_UNAVAILABLE');
      if (material.generationRef !== undefined && material.generationRef !== input.generationRef) fail('STALE_GENERATION');
      contextText(material.content, this.#secrets);
      if(material.materialKind==='summary')examinedSummaryRefs.push(data.recordRef);
      if (material.materialKind === 'summary' && (material.sourceTaskVersion !== task.version || material.sourceAuthEpoch !== task.authEpoch)) {
        conflicts.push({ recordRef: data.recordRef, reason: 'stale_summary', winningTaskVersion: task.version });
        continue;
      }
      const source = { ...recordProvenance(data), sourceScope: material.sourceScope, sourceTaskVersion: material.sourceTaskVersion, sourceAuthEpoch: material.sourceAuthEpoch, generatedAt: material.generatedAt, sourceRefs: [...material.sourceRefs] };
      provenance.push(source);
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
          Object.assign(source, { observation: 'queried_snapshot', observedAt: queried.observedAt, observationDigest: digest(queried.content) });
        }
        protectedParts.push(`HOST ${freshness.toUpperCase()} (never labelled live)\n${hostText}`);
      } else backgrounds.push({ ref: data.recordRef, text: `BACKGROUND ${material.materialKind.toUpperCase()} (non-authoritative)\n${material.content}`, kind: material.materialKind, generatedAt: material.generatedAt });
    }
    // Clarification answers and completed steps are read from authoritative
    // metadata/state, never inferred from summary prose.
    const workFacts = { actions: snapshot.actions, workers: snapshot.workers, control: snapshot.control, artifacts: snapshot.artifacts, progress: snapshot.progress, deliveries: snapshot.deliveries, reviews: snapshot.reviews, audits: snapshot.audits, policy: snapshot.policy };
    protectedParts.push(`CURRENT WORK FACTS\n${JSON.stringify(workFacts)}`);
    const clarification = new Map();
    for (const data of records.filter(data => data.kind === 'clarification').sort((a, b) => a.taskVersion - b.taskVersion)) {
      let batch;
      try { batch = JSON.parse(data.content); } catch { fail('CONTEXT_INVALID'); }
      // Strict coordinator records are factual decisions only, never approval.
      if (!batch || !['awaiting', 'answered', 'withdrawn'].includes(batch.state)) fail('CONTEXT_INVALID');
      reference(batch.batchRef); clarification.set(batch.batchRef, data);
    }
    for (const data of clarification.values()) { protectedParts.push(`CLARIFICATION SNAPSHOT ${data.recordRef}\n${data.content}`); provenance.push(recordProvenance(data)); }
    const protectedText = protectedParts.join('\n\n');
    const sorted = backgrounds.sort((a, b) => (a.kind === 'summary') - (b.kind === 'summary') || b.generatedAt - a.generatedAt).map(({ ref, text }) => ({ ref, text }));
    const result = compactContext({ protectedText, backgrounds: sorted, byteLimit: this.#policy.byteLimit, tokenLimit: this.#policy.tokenLimit, tokenize: this.#tokenize, knownSecrets: this.#secrets });
    // Revalidate after every asynchronous query and tokenizer call, including a
    // tokenizer callback that itself changes the core. No stale input escapes.
    check(this.#sourceCall(preparation,handle,'task', task.taskRef));
    const finalSnapshot = this.#sourceCall(preparation,handle,'snapshot', { taskRef: task.taskRef });
    check(finalSnapshot.task);
    if (input.generationRef !== undefined && !finalSnapshot.workers.some(worker => worker.generationRef === input.generationRef && !['stopped', 'not_created'].includes(worker.phase))) fail('STALE_GENERATION');
    const retainedSources = provenance.filter(source => !result.droppedRefs.includes(source.recordRef));
    const context=Object.freeze({ ...result, taskVersion: task.version, authEpoch: task.authEpoch, generationRef: input.generationRef ?? null, conflicts: Object.freeze(conflicts), provenance: Object.freeze(retainedSources), ledgerSnapshotDigest: digest(JSON.stringify({ task, workFacts })), verification: 'module_assembled_input_only' });
    if(!preparation)return context;
    const examined=[...new Set(examinedSummaryRefs)].sort(),winners=[...new Set(winningSourceRefs)].sort(),stale=new Set(conflicts.map(row=>row.recordRef));
    const summaryChecks=examined.map(recordRef=>Object.freeze({recordRef,disposition:stale.has(recordRef)?'excluded_stale_summary':result.droppedRefs.includes(recordRef)?'dropped_for_budget':'retained_background'}));
    return Object.freeze({context,sourceObservation:Object.freeze({selectionMode:input.recordRefs===undefined?'all_eligible':'explicit_records',examinedSummaryRefs:Object.freeze(examined),winningSourceRefs:Object.freeze(winners),summaryChecks:Object.freeze(summaryChecks)})});
  }
}

const assemblerBindingMethod=Object.getOwnPropertyDescriptor(ContextAssembler.prototype,PREPARATION_ASSEMBLER).value;
const assemblerPreparationMethod=Object.getOwnPropertyDescriptor(ContextAssembler.prototype,'assembleForPreparation').value;
export function assertAssemblerPreparationBinding(assembler,store,capability,handle){try{assemblerBindingMethod.call(assembler,store,capability,handle);}catch{fail('CONTEXT_SCOPE');}}
export async function assemblePreparedContextFromSource(assembler,store,capability,handle,input){assertAssemblerPreparationBinding(assembler,store,capability,handle);const result=await assemblerPreparationMethod.call(assembler,capability,input);assertAssemblerPreparationBinding(assembler,store,capability,handle);return result;}

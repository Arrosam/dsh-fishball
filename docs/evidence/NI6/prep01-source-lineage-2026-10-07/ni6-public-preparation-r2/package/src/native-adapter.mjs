import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT, requireHost, resolveHostSource } from './host-probe.mjs';
import { WorkerError, workerFail, workerDigest, workerRef, workerInteger, workerRecord } from './environment.mjs';
import { normalizedSpec, canonical } from './runtime-security.mjs';
import { types } from 'node:util';
import { historyObservation } from './normal-contracts.mjs';
import { AUDIT_EXECUTION_FIELDS, approvedInputSource } from './audit-input-pair.mjs';

const freezeJson = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freezeJson); Object.freeze(value); } return value; };
const scopedService = (ctx, name) => ctx.reflect.get(name);
const root = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const agentModule = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-agent')).href);
const llmModule = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-llm')).href);
const scopeModule = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-scope')).href);
const toolsModule = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-tools')).href);
const persistenceModule = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-session-persistence-jsonl')).href);
const persistencePins = Object.freeze({
  'dsh-session-persistence-jsonl/lib/index.js': '0845707017acc2b4a8a75eab2244fa3fd88587b8094ab32014321dce7ca1e31b',
  'node-addon-system/lib/flock.js': 'e42af00c298d56322c073bf7cc66485096028318ab645a2e69dc2aa7481ba646',
  'node-addon-system-darwin-arm64/bin/system.node': '9534cde445a865250eb7bc8cfe5e231f3f91d0fda3f4aaa694e81f3531ad1130',
});
export function probePersistenceHost(ctx) {
  try {
    if (process.platform !== 'darwin' || process.arch !== 'arm64' || Number(process.versions.napi) < 8 || !(scopedService(ctx, 'sessionPersistence') instanceof persistenceModule.default)) workerFail('WORKER_PERSISTENCE_UNSUPPORTED');
    for (const [path, hash] of Object.entries(persistencePins)) if (createHash('sha256').update(readFileSync(resolveHostSource(`@deepseek-ai/${path.split('/')[0]}`, path.split('/').slice(1).join('/')))).digest('hex') !== hash) workerFail('WORKER_PERSISTENCE_UNSUPPORTED');
    for (const pkg of ['dsh-session-persistence', 'dsh-session-persistence-jsonl']) if (JSON.parse(readFileSync(`${root}/${pkg}/package.json`)).version !== '0.2.1-alpha.1') workerFail('WORKER_PERSISTENCE_UNSUPPORTED');
    for (const pkg of ['node-addon-system', 'node-addon-system-darwin-arm64']) if (JSON.parse(readFileSync(`${root}/${pkg}/package.json`)).version !== '0.1.2') workerFail('WORKER_PERSISTENCE_UNSUPPORTED');
    for (const method of ['create', 'open', 'flush', 'stat', 'list']) if (typeof scopedService(ctx, 'sessionPersistence')[method] !== 'function') workerFail('WORKER_PERSISTENCE_UNSUPPORTED');
  } catch { workerFail('WORKER_PERSISTENCE_UNSUPPORTED'); }
  return Object.freeze({ target: 'public-jsonl-darwin-arm64', version: '0.2.1-alpha.1', hashes: persistencePins, durability: 'explicit-flush-required' });
}
const pins = Object.freeze({
  'dsh-scope/lib/index.js': '2829df71d76e08941457d4dd173eac60783e55354921137c8b75e8b5c0d2ecca',
  'dsh-agent/lib/index.js': '7b9aa39474de83115cf890dd7f8904cf0d59df0811cb335ab85565a04f1aac93',
  'dsh-agent/lib/types/index.js': '7e7c47fc0b82f0718b73e1705c07ad9496cfdbc21598db94de858f718cd23490',
  'dsh-llm/lib/index.js': 'a8a8288910c8862342cda571d096e1ea4489b01dd0f70b5db28bc86525ee283e',
  'dsh-llm/lib/types/index.js': '825553a8446c9721ba5189f5aa2506c8dd8e0c9d04a1a28fb03751dfec59c411',
  'dsh-agent-loop/lib/index.js': '00c4814d63f3d1e2754eb09144832d19b30499d6ea444730473f740b587948c2',
});
export function probeWorkerHost(ctx) {
  const report = requireHost(ctx);
  try {
    if (createHash('sha256').update(readFileSync(resolveHostSource('@deepseek-ai/cordis', 'lib/types/reflect.d.ts'))).digest('hex') !== '84a46d00b1a6528add43e0f27c1f27bab158f1454d8d05c7ea120a0907a6dc7b') workerFail('WORKER_HOST_UNSUPPORTED');
    for (const [path, hash] of Object.entries(pins)) if (createHash('sha256').update(readFileSync(resolveHostSource(`@deepseek-ai/${path.split('/')[0]}`, path.split('/').slice(1).join('/')))).digest('hex') !== hash) workerFail('WORKER_HOST_UNSUPPORTED');
    for (const pkg of ['dsh-agent', 'dsh-agent-loop', 'dsh-llm']) if (JSON.parse(readFileSync(`${root}/${pkg}/package.json`)).version !== '0.2.1-alpha.1') workerFail('WORKER_HOST_UNSUPPORTED');
    if (!(scopedService(ctx, 'agents') instanceof agentModule.AgentRegistry) || !(scopedService(ctx, 'llm') instanceof llmModule.LlmRuntime)) workerFail('WORKER_HOST_UNSUPPORTED');
    for (const method of ['create', 'resume', 'get']) if (typeof scopedService(ctx, 'agents')[method] !== 'function') workerFail('WORKER_HOST_UNSUPPORTED');
    for (const method of ['resolveCallConfig', 'listProviders']) if (typeof scopedService(ctx, 'llm')[method] !== 'function') workerFail('WORKER_HOST_UNSUPPORTED');
  } catch { workerFail('WORKER_HOST_UNSUPPORTED'); }
  return Object.freeze({ target: report.target, versions: report.versions, hashes: pins, nativeWorker: 'public-interfaces', modelExecution: 'unverified' });
}

// Tickets and owned AgentHandles never cross the model-facing facade. Public
// registry lookup supplies factual visibility, never a new disposal capability.
export class NativeAdapter {
  #ctx; #hooks; #claimBinding; #claimBindingRunning = false; #claimBindingReentered = false; #env; #permission; #messageAdmission; #toolGuard; #resolve; #tickets = new WeakMap(); #entries = new Set(); #active = true;
  constructor(ctx, { environments, permission = () => false, messageAdmission = () => false, toolGuard, resolveSession, nativeHooks, claimBinding } = {}) {
    probeWorkerHost(ctx);
    if (!environments || !['bind', 'inspect', 'assertCurrent'].every(key => typeof environments[key] === 'function') || typeof permission !== 'function' || typeof messageAdmission !== 'function' || typeof toolGuard !== 'function' || resolveSession !== undefined && typeof resolveSession !== 'function') workerFail('WORKER_CONFIG');
    if (claimBinding !== undefined && (typeof claimBinding !== 'function' || types.isProxy(claimBinding) || types.isAsyncFunction(claimBinding) || types.isGeneratorFunction(claimBinding))) workerFail('WORKER_CONFIG');
    this.#claimBinding = claimBinding;
    if (nativeHooks !== undefined) {
      workerRecord(nativeHooks, ['setupAgent', 'commitAgent', 'bindExecution', 'validateResult']);
      if (Object.values(nativeHooks).some(value => typeof value !== 'function')) workerFail('WORKER_CONFIG');
      this.#hooks = Object.freeze({ ...nativeHooks });
    }
    this.#ctx = ctx; this.#env = environments; this.#permission = permission; this.#messageAdmission = messageAdmission; this.#toolGuard = toolGuard; this.#resolve = resolveSession;
    // Observe actual original publication edges through disposal/reobservation.
    // A same-ID replacement is held even if it disappears before the next read.
    ctx.on('agent/created',({agent})=>{for(const entry of this.#entries)if(entry.finishing&&agent.id===entry.id)entry.finishIdentityDrift=true;});
    ctx.on('session/created',session=>{for(const entry of this.#entries)if(entry.finishing&&session.id===entry.id)entry.finishIdentityDrift=true;});
    ctx.on('agent/status', ({ agent }) => this.#event(agent));
    ctx.on('agent/disposed', ({ agent }) => {
      for (const entry of this.#entries) if (entry.handle?.agent === agent) { entry.state = 'stopped'; this.#notify(entry, 'stopped'); }
    });
    ctx.on('agent/assistant-stream', ({ agent, frame }) => this.#stream(agent, frame));
    ctx.on('session/event', (session, event) => {
      for (const entry of this.#entries) if (entry.handle?.agent.session === session && Number.isSafeInteger(event.seq)) {
        if (entry.execution && event.type === 'user/message' && event.data.id === entry.execution.executionRef && event.data.source?.kind === approvedInputSource(entry.execution).kind && event.data.source?.form === 'local' && event.data.content?.length === 1 && event.data.content[0].type === 'text' && typeof event.data.content[0].text === 'string' && createHash('sha256').update(event.data.content[0].text).digest('hex') === (entry.execution.inputDigest ?? entry.execution.dataDigest)) entry.executionInputSeq = event.seq;
        if (entry.execution && Number.isSafeInteger(entry.executionInputSeq) && event.seq > entry.executionInputSeq && event.type === 'assistant/message') {
          const blocks = event.data?.message?.content;
          if (Array.isArray(blocks) && blocks.length > 0 && blocks.length <= 128 && blocks.every(block => block.type === 'text' && typeof block.text === 'string' && block.text.isWellFormed())) {
            const content = blocks.map(block => block.text).join('');
            if (Buffer.byteLength(content) <= 65536) entry.resultCandidate = Object.freeze({ cursor: event.seq, content, digest: createHash('sha256').update(content).digest('hex') });
          }
        }
        this.#event(entry.handle.agent, event.seq, event.type);
      }
    });
    ctx.effect(() => () => { this.#active = false; }, 'df.native-adapter');
  }
  #alive() { if (!this.#active || this.#ctx.fiber.state !== 2 || this.#ctx.fiber.uid === null) workerFail('WORKER_DISPOSED'); }
  #get(ticket) { this.#alive(); const entry = this.#tickets.get(ticket); if (!entry) workerFail('WORKER_INVALID'); return entry; }
  #permit(entry, originalClaim = true) {
    this.#alive(); if (entry.finishing) workerFail('WORKER_FINISH_UNAVAILABLE'); this.#env.assertCurrent(entry.environment);
    let allowed;
    try { allowed = this.#permission(Object.freeze({ taskRef: entry.taskRef, generationRef: entry.generationRef, environmentRef: entry.spec.executor.environmentRef, bindingDigest: entry.spec.executor.bindingDigest, toolsDigest: entry.spec.executor.toolsDigest, permissionPolicyDigest: entry.spec.executor.permissionPolicyDigest, ...(entry.claim ? { claimRef: entry.claim.claimRef, actionDigest: entry.claim.actionDigest } : {}) })); } catch { workerFail('HOST_PERMISSION_DENIED'); }
    if (allowed !== true) workerFail('HOST_PERMISSION_DENIED');
    if (entry.claim && originalClaim) { try { if (entry.assertClaim() !== true) workerFail('WORKER_CLAIM_STALE'); } catch { workerFail('WORKER_CLAIM_STALE'); } }
  }
  bindClaim(ticket, claim, assertCurrent) {
    if (this.#claimBindingRunning) { this.#claimBindingReentered = true; workerFail('WORKER_MAPPING_MISMATCH'); }
    const entry = this.#get(ticket);
    workerRecord(claim, ['claimRef', 'reservationRef', 'actionRef', 'actionDigest', 'generationRef', 'sessionRef', 'task'], ['claimRef', 'reservationRef', 'actionDigest', 'generationRef']);
    if (entry.claim || entry.state !== 'prepared' || typeof assertCurrent !== 'function' || claim.generationRef !== entry.generationRef || claim.actionRef !== entry.spec.actionRef || claim.actionDigest !== entry.actionDigest || claim.task && (claim.task.taskRef !== entry.taskRef || claim.task.workspaceRef !== entry.workspaceRef || claim.task.ownerRef !== entry.ownerRef)) workerFail('WORKER_MAPPING_MISMATCH');
    entry.claim = Object.freeze({ claimRef: workerRef(claim.claimRef), reservationRef: workerRef(claim.reservationRef), actionDigest: workerRef(claim.actionDigest), generationRef: entry.generationRef });
    entry.assertClaim = assertCurrent;
    if (this.#claimBinding) {
      this.#claimBindingRunning = true; this.#claimBindingReentered = false;
      try {
        // Original core currentness precedes the source transition. A committed
        // refused claim stays held; there is no native creation or release.
        if (assertCurrent() !== true) workerFail('WORKER_CLAIM_STALE');
        const out = this.#claimBinding(Object.freeze({ taskRef: entry.taskRef, actionRef: entry.spec.actionRef, actionDigest: entry.actionDigest, claimRef: entry.claim.claimRef, reservationRef: entry.claim.reservationRef, generationRef: entry.generationRef, sessionRef: entry.sessionRef, spec: entry.spec }));
        if (types.isPromise(out)) out.catch(() => {});
        if (out !== true || this.#claimBindingReentered) workerFail('WORKER_MAPPING_MISMATCH');
      } catch { workerFail('WORKER_MAPPING_MISMATCH'); }
      finally { this.#claimBindingRunning = false; }
    }
  }
  #tools(entry, agent) {
    try {
      if (!(scopedService(this.#ctx, 'tools') instanceof toolsModule.default) || typeof scopedService(this.#ctx, 'tools').schemas !== 'function' || typeof scopedService(this.#ctx, 'tools').guard !== 'function') workerFail('WORKER_TOOLS_UNAVAILABLE');
      if (createHash('sha256').update(readFileSync(resolveHostSource('@deepseek-ai/dsh-tools'))).digest('hex') !== '2e9b6a72ba6b917197965c08eb894d4e8d01dc6f81e0e1c9870a5ae8514687a7') workerFail('WORKER_TOOLS_UNAVAILABLE');
      const schemas = scopedService(this.#ctx, 'tools').schemas(agent);
      // Actual nonempty tool dispatch remains unaccepted in this phase. The
      // private installation guard must attest the empty scoped surface too.
      if (schemas.length !== 0 || this.#toolGuard(Object.freeze({ agent, taskRef: entry.taskRef, generationRef: entry.generationRef, claimRef: entry.claim?.claimRef, toolsDigest: entry.spec.executor.toolsDigest, permissionPolicyDigest: entry.spec.executor.permissionPolicyDigest, schemas: Object.freeze([...schemas]) })) !== true) workerFail('WORKER_TOOLS_UNAVAILABLE');
    } catch { workerFail('WORKER_TOOLS_UNAVAILABLE'); }
  }
  async prepare(spec, task, actionDigest) {
    this.#alive();
    workerRef(actionDigest);
    try { spec = normalizedSpec(spec); } catch { workerFail('WORKER_INVALID'); }
    const environment = this.#env.bind(spec, task, actionDigest);
    if (this.#entries.size >= 1000) workerFail('WORKER_CAPACITY');
    const entry = { environment, spec: freezeJson(structuredClone(spec)), actionDigest, taskRef: workerRef(task.taskRef), workspaceRef: task.workspaceRef, ownerRef: task.ownerRef, generationRef: workerRef(spec.executor.generationRef), state: 'prepared', handle: undefined, cursor: 0, events: new Map(), listeners: new Set(), stream: { revision: 0, count: 0, state: 'unobserved' } };
    this.#permit(entry);
    this.#env.inspect(environment, config => {
      entry.options = Object.freeze({ provider: config.provider, model: config.model, ...(config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort }) });
      entry.cwd = config.cwd;
      if (this.#hooks) {
        workerInteger(config.maxOutputTokens, 128, 4096);
        entry.options = Object.freeze({ ...entry.options, maxTokens: config.maxOutputTokens });
      }
    });
    try {
      const resolved = await scopedService(this.#ctx, 'llm').resolveCallConfig(entry.options);
      if (resolved.provider !== entry.options.provider || resolved.model !== entry.options.model || resolved.reasoningEffort !== entry.options.reasoningEffort) workerFail('MODEL_CONFIGURATION_MISMATCH');
    } catch (error) { if (error instanceof WorkerError) throw error; workerFail('MODEL_UNAVAILABLE'); }
    this.#permit(entry);
    try {
      // Preserve an exact previously approved preallocated native identity.
      // Unbound new creates use df; existing action/session hashes are never
      // rewritten for branding. Resume still requires the trusted resolver.
      const legacyId = `bubbles-${entry.generationRef}`;
      const defaultId = spec.executor.sessionRef === createHash('sha256').update(legacyId).digest('hex') ? legacyId : `df-${entry.generationRef}`;
      entry.id = this.#resolve ? this.#resolve(Object.freeze({ mode: spec.executor.mode, generationRef: entry.generationRef, sessionRef: spec.executor.sessionRef })) : spec.executor.mode === 'create' ? defaultId : undefined;
      if (typeof entry.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(entry.id)) workerFail('SESSION_UNAVAILABLE');
      entry.sessionRef = createHash('sha256').update(entry.id).digest('hex');
      if (spec.executor.sessionRef !== undefined && spec.executor.sessionRef !== entry.sessionRef || spec.executor.mode === 'resume' && !spec.executor.sessionRef) workerFail('SESSION_MISMATCH');
      if (!['create', 'resume'].includes(spec.executor.mode)) workerFail('WORKER_INVALID');
    } catch (error) { if (error instanceof WorkerError) throw error; workerFail('SESSION_UNAVAILABLE'); }
    const ticket = Object.freeze({}); this.#tickets.set(ticket, entry); this.#entries.add(entry);
    return ticket;
  }
  observe(ticket, callback) {
    const entry = this.#get(ticket); if (typeof callback !== 'function') workerFail('WORKER_INVALID');
    entry.listeners.add(callback); return () => entry.listeners.delete(callback);
  }
  #receipt(entry, phase) { return Object.freeze({ phase, taskRef: entry.taskRef, actionRef: entry.spec.actionRef, actionDigest: entry.actionDigest, ...(entry.claim ? { claimRef: entry.claim.claimRef, reservationRef: entry.claim.reservationRef } : {}), generationRef: entry.generationRef, sessionRef: entry.sessionRef, cursor: entry.cursor, evidenceRef: workerDigest('native', entry.taskRef, entry.generationRef, entry.sessionRef, phase, entry.cursor) }); }
  #event(agent, cursor, eventType) {
    for (const entry of this.#entries) if (entry.handle?.agent === agent) {
      if (cursor !== undefined) {
        entry.cursor = Math.max(entry.cursor, cursor); entry.events.set(cursor, eventType);
        if (entry.events.size > 128) entry.events.delete(entry.events.keys().next().value);
        if (entry.stream.state === 'awaiting_commit' && entry.stream.cursor === cursor) {
          if (entry.stream.eventType === eventType) entry.stream = { ...entry.stream, state: 'committed' };
          else { entry.stream.state = 'unknown'; this.#notify(entry, 'unknown'); }
        }
      }
      this.#notify(entry, entry.stream.state === 'unknown' ? 'unknown' : agent.status === 'running' ? 'running' : 'ready');
    }
  }
  #notify(entry, phase) { for (const listener of entry.listeners) { try { listener(this.#receipt(entry, phase)); } catch { /* no raw listener error */ } } }
  #stream(agent, frame) {
    for (const entry of this.#entries) if (entry.handle?.agent === agent) {
      try {
        if (typeof frame.attemptId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(frame.attemptId)) workerFail('STREAM_GAP');
        workerInteger(frame.revision, 1); const attemptRef = workerDigest('native-attempt', frame.attemptId);
        if (frame.revision <= entry.stream.revision) return;
        if (frame.revision !== entry.stream.revision + 1) workerFail('STREAM_GAP');
        if (frame.type === 'start') {
          if (!['unobserved', 'committed'].includes(entry.stream.state)) workerFail('STREAM_GAP');
          entry.stream = { revision: frame.revision, attemptRef, count: 0, state: 'streaming' }; return;
        }
        if (attemptRef !== entry.stream.attemptRef || entry.stream.state !== 'streaming') workerFail('STREAM_GAP');
        workerInteger(frame.index, 0, 100000);
        if (frame.type === 'chunk') {
          if (frame.index !== entry.stream.count) workerFail('STREAM_GAP');
          entry.stream.revision = frame.revision; entry.stream.count++; return; // no chunk text/arguments/errors retained
        }
        if (frame.type !== 'end' || frame.index !== entry.stream.count || frame.outcome?.kind !== 'committed') workerFail('STREAM_GAP');
        workerInteger(frame.outcome.seq);
        if (!['assistant/message', 'assistant/attempt'].includes(frame.outcome.eventType)) workerFail('STREAM_GAP');
        const observed = entry.events.get(frame.outcome.seq);
        if (observed !== undefined && observed !== frame.outcome.eventType) workerFail('STREAM_GAP');
        entry.stream = { ...entry.stream, revision: frame.revision, state: observed === frame.outcome.eventType ? 'committed' : 'awaiting_commit', cursor: frame.outcome.seq, eventType: frame.outcome.eventType };
      } catch { entry.stream.state = 'unknown'; this.#notify(entry, 'unknown'); }
    }
  }
  streamState(ticket) { return Object.freeze({ ...this.#get(ticket).stream }); }
  handoff(ticket, input, task) {
    const entry = this.#get(ticket);
    if (!entry.claim || input.claimRef !== entry.claim.claimRef || input.actionDigest !== entry.claim.actionDigest || input.generationRef !== entry.generationRef || task.taskRef !== entry.taskRef) workerFail('WORKER_MAPPING_MISMATCH');
    this.#env.bindCurrentTask(entry.environment, task);
    return this.#env.handoff(entry.environment, input);
  }
  transport() {
    const locate = record => {
      this.#alive();
      const metadata = record?.immutableMetadata;
      if (!metadata || record.state !== 'outbox_committed' && !['sent', 'unknown'].includes(record.state)) workerFail('MESSAGE_MAPPING_INVALID');
      for (const key of ['taskRef', 'messageRef', 'bodyDigest', 'claimRef', 'reservationRef']) workerRef(record[key]);
      workerRef(metadata.recipientSessionRef); workerRef(metadata.recipientGenerationRef);
      const entry = [...this.#entries].find(value => value.taskRef === record.taskRef && value.sessionRef === metadata.recipientSessionRef && value.generationRef === metadata.recipientGenerationRef && value.handle && scopedService(this.#ctx, 'agents').get(value.id) === value.handle.agent && value.state !== 'stopped');
      if (!entry) workerFail('MESSAGE_RECIPIENT_UNAVAILABLE');
      return entry;
    };
    const receipt = (record, state) => Object.freeze({ messageRef: record.messageRef, bodyDigest: record.bodyDigest, recipientSessionRef: record.immutableMetadata.recipientSessionRef, recipientGenerationRef: record.immutableMetadata.recipientGenerationRef, state, evidenceRef: workerDigest('native-message', record.messageRef, record.bodyDigest, record.immutableMetadata.recipientGenerationRef, state) });
    const delivered = new Map();
    return Object.freeze({
      send: async (record, body) => {
        const entry = locate(record); this.#permit(entry, false);
        // A separately approved message has its own current authorization
        // epoch. Recipient ownership remains exact and revocable, but a fresh
        // unrelated grant does not recreate/re-authorize its existing worker.
        try {
          const message = Object.freeze({ taskRef: workerRef(record.taskRef), messageRef: workerRef(record.messageRef), claimRef: workerRef(record.claimRef), reservationRef: workerRef(record.reservationRef), generationRef: workerRef(record.generationRef) });
          const recipient = Object.freeze({ taskRef: entry.taskRef, workerClaimRef: entry.claim.claimRef, generationRef: entry.generationRef, sessionRef: entry.sessionRef });
          if (this.#messageAdmission(message, recipient) !== true) workerFail('MESSAGE_ADMISSION_DENIED');
        } catch { workerFail('MESSAGE_ADMISSION_DENIED'); }
        if (delivered.has(record.messageRef)) workerFail('MESSAGE_ALREADY_SUBMITTED');
        if (record.state !== 'outbox_committed' || !(body?.kind === 'message' || body?.kind === 'verification' && record.immutableMetadata.category === 'review_result') || typeof body.content !== 'string' || body.digest !== record.bodyDigest || createHash('sha256').update(body.content).digest('hex') !== record.bodyDigest || Buffer.byteLength(body.content) !== record.byteLength || record.byteLength > 65536 || typeof entry.handle.agent.inject !== 'function') workerFail('MESSAGE_BODY_INVALID');
        if (delivered.size >= 1000) workerFail('WORKER_CAPACITY');
        delivered.set(record.messageRef, record.bodyDigest); // before arbitrary native effect
        try { entry.handle.agent.inject({ id: record.messageRef, role: 'user', content: [{ type: 'text', text: body.content }], source: { kind: 'df-relay', form: 'relay' } }); }
        catch { return receipt(record, 'unknown'); }
        return receipt(record, 'sent'); // queue acceptance is not consumption
      },
      query: async record => { locate(record); return receipt(record, 'unknown'); },
    });
  }
  async #start(ticket, mode) {
    const entry = this.#get(ticket); this.#permit(entry);
    if (!entry.claim) workerFail('WORKER_CLAIM_REQUIRED');
    if (entry.spec.executor.mode !== mode || entry.state !== 'prepared') workerFail('WORKER_ALREADY_SUBMITTED');
    if (scopedService(this.#ctx, 'agents').get(entry.id)) workerFail('SESSION_ALREADY_LIVE');
    entry.state = 'submitted';
    const binding = () => Object.freeze({ taskRef: entry.taskRef, actionRef: entry.spec.actionRef, actionDigest: entry.actionDigest, claimRef: entry.claim.claimRef, generationRef: entry.generationRef, sessionRef: entry.sessionRef, options: entry.options, spec: entry.spec });
    const finishSetup = (agentCtx, agent) => {
      if (scopeModule.scopeOf(agentCtx) !== agent || agent.ctx !== agentCtx) workerFail('WORKER_TOOLS_UNAVAILABLE');
      this.#tools(entry, agent);
      // The monotonic guard is scoped to this unpublished owned agent.
      const remove = agentCtx.tools.guard(() => 'DF_TOOL_DISPATCH_UNAVAILABLE');
      if (typeof remove !== 'function') workerFail('WORKER_TOOLS_UNAVAILABLE');
      return { commit: () => {
        this.#permit(entry); this.#tools(entry, agent);
        if (this.#hooks && this.#hooks.commitAgent(agentCtx, agent, binding()) !== true) workerFail('WORKER_REQUEST_DENIED');
      } };
    };
    const setup = this.#hooks ? async (agentCtx, agent) => {
      await this.#hooks.setupAgent(agentCtx, agent, binding());
      this.#permit(entry); return finishSetup(agentCtx, agent);
    } : finishSetup;
    try {
      const options = { agentOptions: entry.options, setup };
      const handle = await (mode === 'create' ? scopedService(this.#ctx, 'agents').create({ ...options, sessionId: entry.id, meta: { cwd: entry.cwd } }) : scopedService(this.#ctx, 'agents').resume({ ...options, resumeSessionId: entry.id }));
      if (!handle || handle.agent?.id !== entry.id || typeof handle.dispose !== 'function' || typeof handle.agent.cancel !== 'function' || typeof handle.agent.whenIdle !== 'function' || scopedService(this.#ctx, 'agents').get(entry.id) !== handle.agent) workerFail('WORKER_RECEIPT_INVALID');
      entry.handle = handle; entry.state = 'created';
      // Creation alone supplies no evidence of executing work. No message is
      // sent here. Ready means owned, published, idle with validated setup.
      return this.#receipt(entry, 'created');
    } catch { entry.state = 'unknown'; workerFail('WORKER_CREATE_UNKNOWN'); }
  }
  create(ticket) { return this.#start(ticket, 'create'); }
  resume(ticket) { return this.#start(ticket, 'resume'); }
  executeContext(ticket, execution, context, authorizeDispatch) { return this.#executeApprovedInput(ticket, execution, context, authorizeDispatch, false); }
  executeAuditInput(ticket, execution, body, authorizeDispatch) { return this.#executeApprovedInput(ticket, execution, body, authorizeDispatch, true); }
  async #executeApprovedInput(ticket, execution, context, authorizeDispatch, audit) {
    const entry = this.#get(ticket);
    workerRecord(execution, audit ? AUDIT_EXECUTION_FIELDS : ['executionRef', 'taskRef', 'claimRef', 'generationRef', 'contextRecordRef', 'actionDigest', 'dataDigest']);
    for (const [key, value] of Object.entries(execution)) {
      if (key === 'semanticRevision') workerInteger(value, 1);
      else if (key !== 'purpose') workerRef(value);
    }
    workerRecord(context, ['recordRef', 'kind', 'content', 'digest', 'byteLength']);
    const inputDigest = audit ? execution.inputDigest : execution.dataDigest;
    const recordRef = audit ? execution.inputRecordRef : execution.contextRecordRef;
    if (!entry.claim || execution.taskRef !== entry.taskRef || execution.claimRef !== entry.claim.claimRef || execution.generationRef !== entry.generationRef || execution.actionDigest !== entry.actionDigest || recordRef !== context.recordRef || execution.dataDigest !== entry.spec.dataDigest || context.digest !== inputDigest || context.kind !== 'context' || typeof context.content !== 'string' || !context.content.isWellFormed() || Buffer.byteLength(context.content) !== context.byteLength || context.byteLength > 65536 || createHash('sha256').update(context.content).digest('hex') !== inputDigest || typeof authorizeDispatch !== 'function') workerFail('WORKER_CONTEXT_INVALID');
    if (audit) {
      const e = entry.spec.executionInput;
      if (!e || execution.actionRef !== entry.spec.actionRef || execution.sessionRef !== entry.sessionRef || execution.inputRecordRef !== e.recordRef || execution.inputDigest !== e.digest || execution.auditRef !== e.auditRef || execution.bindingDigest !== e.bindingDigest || execution.materialDigest !== e.materialDigest || execution.purpose !== e.purpose || !['audit_review', 'audit_repair'].includes(execution.purpose)) workerFail('WORKER_CONTEXT_INVALID');
    } else if (entry.spec.executionInput) workerFail('WORKER_CONTEXT_INVALID');
    const binding = Object.freeze({ ...execution }), body = Object.freeze({ ...context });
    if (entry.execution) workerFail('WORKER_EXECUTION_ALREADY_SUBMITTED');
    const idle = () => {
      this.#permit(entry);
      const agent = scopedService(this.#ctx, 'agents').get(entry.id);
      if (!entry.handle || agent !== entry.handle.agent || entry.state === 'stopped' || agent.status !== 'idle' || typeof agent.send !== 'function' || typeof agent.whenIdle !== 'function') workerFail('WORKER_EXECUTION_UNAVAILABLE');
      if (agent.options?.provider !== entry.options.provider || agent.options?.model !== entry.options.model || agent.options?.reasoningEffort !== entry.options.reasoningEffort || this.#hooks && agent.options?.maxTokens !== entry.options.maxTokens) workerFail('MODEL_CONFIGURATION_MISMATCH');
      this.#tools(entry, agent);
      return agent;
    };
    idle(); const previousRevision = entry.stream.revision; entry.execution = binding;
    try {
      const resolved = await scopedService(this.#ctx, 'llm').resolveCallConfig(entry.options);
      if (resolved.provider !== entry.options.provider || resolved.model !== entry.options.model || resolved.reasoningEffort !== entry.options.reasoningEffort) workerFail('MODEL_CONFIGURATION_MISMATCH');
      const agent = idle();
      const admission = authorizeDispatch();
      if (admission?.admitted !== true || admission.state !== 'dispatch_intent' || Object.keys(binding).some(key => admission[key] !== binding[key])) workerFail('WORKER_EXECUTION_DENIED');
      if (this.#hooks && this.#hooks.bindExecution(agent, binding, body) !== true) workerFail('WORKER_REQUEST_DENIED');
      // The durable consume is the linearization point. No await, fallback or
      // second send separates it from this exact owned public native wakeup.
      agent.send({ id: binding.executionRef, role: 'user', content: [{ type: 'text', text: body.content }], source: approvedInputSource(binding) }, 'next-turn', true);
      await agent.whenIdle();
      this.#alive();
      const committed = entry.stream.state === 'committed' && entry.stream.revision > previousRevision && Number.isSafeInteger(entry.executionInputSeq) && entry.stream.cursor > entry.executionInputSeq;
      if (committed && entry.stream.eventType === 'assistant/message' && entry.resultCandidate?.cursor === entry.stream.cursor) entry.committedResult = Object.freeze({ ...entry.resultCandidate, ...binding, sessionRef: entry.sessionRef, ...(audit ? { inputCursor: entry.executionInputSeq } : {}) });
      return Object.freeze({ executionRef: binding.executionRef, state: committed ? 'committed' : 'unknown', worker: this.query(ticket), ...(committed ? { result: Object.freeze({ cursor: entry.stream.cursor, eventType: entry.stream.eventType, evidenceRef: workerDigest('context-result', binding.executionRef, entry.stream.cursor, entry.stream.eventType) }) } : {}) });
    } catch (error) { if (error instanceof WorkerError) throw error; workerFail('WORKER_EXECUTION_UNKNOWN'); }
  }
  readResult(ticket, executionRef) {
    const entry = this.#get(ticket), result = entry.committedResult;
    workerRef(executionRef);
    if (!result || result.executionRef !== executionRef || result.claimRef !== entry.claim?.claimRef || result.generationRef !== entry.generationRef || result.actionDigest !== entry.actionDigest || result.sessionRef !== entry.sessionRef) workerFail('WORKER_RESULT_UNAVAILABLE');
    return result;
  }
  async observeBaselineHistory(ticket) {
    const entry = this.#get(ticket); this.#permit(entry);
    if (!entry.spec.nativeOriginBinding || !this.#hooks || entry.spec.executor.mode !== 'create' || !entry.handle || entry.execution || entry.handle.agent.status !== 'idle' || scopedService(this.#ctx,'agents').get(entry.id) !== entry.handle.agent) workerFail('WORKER_RESULT_UNAVAILABLE');
    const input = Object.freeze({phase:'baseline',taskRef:entry.taskRef,claimRef:entry.claim.claimRef,generationRef:entry.generationRef,sessionRef:entry.sessionRef});
    const actual = await this.#hooks.validateResult(entry.handle.agent,input);
    this.#get(ticket); this.#permit(entry);
    if (scopedService(this.#ctx,'agents').get(entry.id) !== entry.handle.agent || scopedService(this.#ctx,'sessions').get(entry.id) !== entry.handle.agent.session) workerFail('WORKER_RESULT_UNAVAILABLE');
    workerRecord(actual,['historyObservation']); historyObservation(actual.historyObservation);
    if (actual.historyObservation.messages.length || actual.historyObservation.claimRef!==entry.claim.claimRef || actual.historyObservation.generationRef!==entry.generationRef || actual.historyObservation.sessionRef!==entry.sessionRef) workerFail('WORKER_RESULT_UNAVAILABLE');
    return freezeJson(structuredClone(actual.historyObservation));
  }
  async validateResult(ticket, executionRef) {
    const entry = this.#get(ticket), result = this.readResult(ticket, executionRef);
    if (!this.#hooks || !entry.handle || entry.state === 'stopped') workerFail('WORKER_RESULT_UNAVAILABLE');
    let facts;
    try { facts = await this.#hooks.validateResult(entry.handle.agent, result); }
    catch { workerFail('WORKER_RESULT_UNAVAILABLE'); }
    this.#get(ticket);
    if (entry.committedResult !== result || scopedService(this.#ctx, 'agents').get(entry.id) !== entry.handle.agent || scopedService(this.#ctx, 'sessions').get(entry.id) !== entry.handle.agent.session) workerFail('WORKER_RESULT_UNAVAILABLE');
    const audit = Boolean(entry.spec.executionInput);
    const normal=Boolean(entry.spec.nativeOriginBinding||entry.spec.resumeBinding);
    workerRecord(facts,[...['usageUnits','evidenceRef','resultDigest'],...(audit?['inputCursor']:[]),...(normal?['historyObservation']:[])]);
    if(normal)historyObservation(facts.historyObservation);
    if (audit && (workerInteger(facts.inputCursor) !== result.inputCursor || facts.inputCursor >= result.cursor)) workerFail('WORKER_RESULT_UNAVAILABLE');
    workerInteger(facts.usageUnits, 0, 100000000); workerRef(facts.evidenceRef); workerRef(facts.resultDigest);
    if (facts.resultDigest !== result.digest || facts.usageUnits > entry.spec.charges.usageUnits) workerFail('WORKER_RESULT_UNAVAILABLE');
    entry.validatedResult = Object.freeze({ ...facts, executionRef });
    return entry.validatedResult;
  }
  async finishExecution(ticket, executionRef) {
    const entry = this.#get(ticket), result = this.readResult(ticket, executionRef);
    const facts = entry.validatedResult;
    if (!this.#hooks || !facts || facts.executionRef !== executionRef || facts.resultDigest !== result.digest || !entry.handle) workerFail('WORKER_FINISH_UNAVAILABLE');
    const normal=Boolean(entry.spec.nativeOriginBinding||entry.spec.resumeBinding),agent=entry.handle.agent,session=agent.session;
    let beforeStop;
    if(normal){
      // Revalidate actual original source/class/preset/tools and whole persisted
      // result under current owner invocation BEFORE disposing its child scope.
      beforeStop=await this.#hooks.validateResult(agent,result,Object.freeze({phase:'before_stop'}));this.#get(ticket);
      const{executionRef:ignored,...captured}=facts;if(canonical(beforeStop)!==canonical(captured)||entry.handle.agent!==agent||agent.session!==session||scopedService(this.#ctx,'agents').get(entry.id)!==agent||scopedService(this.#ctx,'sessions').get(entry.id)!==session)workerFail('WORKER_FINISH_UNAVAILABLE');
    }
    // Seal this exact owned worker before awaiting its factual stop. Cleanup
    // does not borrow or revalidate a revoked dispatch grant.
    entry.finishing = true;
    const receipt = await this.dispose(ticket);
    if (receipt.phase !== 'stopped' || scopedService(this.#ctx, 'agents').get(entry.id) === entry.handle.agent || scopedService(this.#ctx, 'sessions').get(entry.id) === entry.handle.agent.session) workerFail('WORKER_FINISH_UNAVAILABLE');
    let finalFacts=facts;
    if(normal){
      // Existing trusted fourth hook only. This checkpoint is process-private,
      // never a wire assertion. It cannot wake/flush a detached original session.
      finalFacts=await this.#hooks.validateResult(agent,result,Object.freeze({phase:'stopped',terminalEvidenceRef:receipt.evidenceRef}));this.#get(ticket);
      if(entry.handle.agent!==agent||agent.session!==session||entry.state!=='stopped'||entry.finishIdentityDrift||scopedService(this.#ctx,'agents').get(entry.id)||scopedService(this.#ctx,'sessions').get(entry.id)||canonical(finalFacts)!==canonical(beforeStop))workerFail('WORKER_FINISH_UNAVAILABLE');
    }
    return Object.freeze({ worker: receipt, usageUnits: finalFacts.usageUnits, evidenceRef: workerDigest('native-finish', finalFacts.evidenceRef, result.digest, receipt.evidenceRef) });
  }
  sessionLink(ticket) {
    const entry = this.#get(ticket), agent = scopedService(this.#ctx, 'agents').get(entry.id);
    // Authorized owner navigation reads an already owned live mapping. It is
    // independent of dispatch grant/current-control admission and wakes nothing.
    if (!entry.claim || !entry.handle || entry.state === 'stopped' || agent !== entry.handle.agent || scopedService(this.#ctx, 'sessions').get(entry.id) !== agent.session || agent.session.id !== entry.id || createHash('sha256').update(entry.id).digest('hex') !== entry.sessionRef) workerFail('WORKER_SESSION_UNAVAILABLE');
    return Object.freeze({ taskRef: entry.taskRef, actionDigest: entry.actionDigest, claimRef: entry.claim.claimRef, generationRef: entry.generationRef, sessionRef: entry.sessionRef, sessionId: entry.id });
  }
  async shutdown(ticket) {
    // Trusted teardown can close an already-owned handle after the plugin
    // fiber becomes inactive. It admits no create, input, provider or retry.
    const entry = this.#tickets.get(ticket); if (!entry) workerFail('WORKER_INVALID');
    if (!entry.handle) return this.#receipt(entry, 'unknown');
    try { await entry.handle.dispose(); if (scopedService(this.#ctx, 'agents').get(entry.id) === entry.handle.agent) return this.#receipt(entry, 'unknown'); entry.state = 'stopped'; return this.#receipt(entry, 'stopped'); }
    catch { entry.state = 'unknown'; return this.#receipt(entry, 'unknown'); }
  }
  query(ticket) {
    const entry = this.#get(ticket);
    if (entry.state === 'stopped') {if(entry.finishing&&(entry.spec.nativeOriginBinding||entry.spec.resumeBinding)&&(entry.finishIdentityDrift||scopedService(this.#ctx,'agents').get(entry.id)||scopedService(this.#ctx,'sessions').get(entry.id)))workerFail('WORKER_FINISH_UNAVAILABLE');return this.#receipt(entry, 'stopped');}
    const agent = scopedService(this.#ctx, 'agents').get(entry.id);
    if (!entry.handle || agent !== entry.handle.agent || ['unknown', 'awaiting_commit'].includes(entry.stream.state)) return this.#receipt(entry, 'unknown');
    return this.#receipt(entry, agent.status === 'running' ? 'running' : 'ready');
  }
  async cancel(ticket) {
    const entry = this.#get(ticket);
    if (!entry.handle) return this.#receipt(entry, 'unknown');
    entry.state = 'cancel_requested';
    try { entry.handle.agent.cancel({ kind: 'user' }, { keepInbox: false }); await entry.handle.agent.whenIdle(); }
    catch { entry.state = 'unknown'; return this.#receipt(entry, 'unknown'); }
    // Idle is quiescence, not executor closure or rollback of earlier effects.
    return this.#receipt(entry, 'cancel_requested');
  }
  async dispose(ticket) {
    const entry = this.#get(ticket);
    if (!entry.handle) return this.#receipt(entry, 'unknown');
    try { await entry.handle.dispose(); if (scopedService(this.#ctx, 'agents').get(entry.id) === entry.handle.agent) return this.#receipt(entry, 'unknown'); entry.state = 'stopped'; return this.#receipt(entry, 'stopped'); }
    catch { entry.state = 'unknown'; return this.#receipt(entry, 'unknown'); }
  }
}

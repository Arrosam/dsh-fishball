import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT, requireHost } from './host-probe.mjs';
import { WorkerError, workerFail, workerDigest, workerRef, workerInteger, workerRecord } from './environment.mjs';
import { normalizedSpec } from './runtime-security.mjs';

const root = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const agentModule = await import(pathToFileURL(`${root}/dsh-agent/lib/index.js`).href);
const llmModule = await import(pathToFileURL(`${root}/dsh-llm/lib/index.js`).href);
const pins = Object.freeze({
  'dsh-agent/lib/index.js': '7b9aa39474de83115cf890dd7f8904cf0d59df0811cb335ab85565a04f1aac93',
  'dsh-agent/lib/types/index.js': '7e7c47fc0b82f0718b73e1705c07ad9496cfdbc21598db94de858f718cd23490',
  'dsh-llm/lib/index.js': 'a8a8288910c8862342cda571d096e1ea4489b01dd0f70b5db28bc86525ee283e',
  'dsh-llm/lib/types/index.js': '825553a8446c9721ba5189f5aa2506c8dd8e0c9d04a1a28fb03751dfec59c411',
  'dsh-agent-loop/lib/index.js': '00c4814d63f3d1e2754eb09144832d19b30499d6ea444730473f740b587948c2',
});
export function probeWorkerHost(ctx) {
  const report = requireHost(ctx);
  try {
    for (const [path, hash] of Object.entries(pins)) if (createHash('sha256').update(readFileSync(`${root}/${path}`)).digest('hex') !== hash) workerFail('WORKER_HOST_UNSUPPORTED');
    for (const pkg of ['dsh-agent', 'dsh-agent-loop', 'dsh-llm']) if (JSON.parse(readFileSync(`${root}/${pkg}/package.json`)).version !== '0.2.1-alpha.1') workerFail('WORKER_HOST_UNSUPPORTED');
    if (!(ctx.agents instanceof agentModule.AgentRegistry) || !(ctx.llm instanceof llmModule.LlmRuntime)) workerFail('WORKER_HOST_UNSUPPORTED');
    for (const method of ['create', 'resume', 'get']) if (typeof ctx.agents[method] !== 'function') workerFail('WORKER_HOST_UNSUPPORTED');
    for (const method of ['resolveCallConfig', 'listProviders']) if (typeof ctx.llm[method] !== 'function') workerFail('WORKER_HOST_UNSUPPORTED');
  } catch { workerFail('WORKER_HOST_UNSUPPORTED'); }
  return Object.freeze({ target: report.target, versions: report.versions, hashes: pins, nativeWorker: 'public-interfaces', modelExecution: 'unverified' });
}

// Tickets and owned AgentHandles never cross the model-facing facade. Public
// registry lookup supplies factual visibility, never a new disposal capability.
export class NativeAdapter {
  #ctx; #env; #permission; #messageAdmission; #resolve; #tickets = new WeakMap(); #entries = new Set(); #active = true;
  constructor(ctx, { environments, permission = () => false, messageAdmission = () => false, resolveSession } = {}) {
    probeWorkerHost(ctx);
    if (!environments || !['bind', 'inspect', 'assertCurrent'].every(key => typeof environments[key] === 'function') || typeof permission !== 'function' || typeof messageAdmission !== 'function' || resolveSession !== undefined && typeof resolveSession !== 'function') workerFail('WORKER_CONFIG');
    this.#ctx = ctx; this.#env = environments; this.#permission = permission; this.#messageAdmission = messageAdmission; this.#resolve = resolveSession;
    ctx.on('agent/status', ({ agent }) => this.#event(agent));
    ctx.on('agent/disposed', ({ agent }) => {
      for (const entry of this.#entries) if (entry.handle?.agent === agent) { entry.state = 'stopped'; this.#notify(entry, 'stopped'); }
    });
    ctx.on('agent/assistant-stream', ({ agent, frame }) => this.#stream(agent, frame));
    ctx.on('session/event', (session, event) => {
      for (const entry of this.#entries) if (entry.handle?.agent.session === session && Number.isSafeInteger(event.seq)) this.#event(entry.handle.agent, event.seq, event.type);
    });
    ctx.effect(() => () => { this.#active = false; }, 'bubbles.native-adapter');
  }
  #alive() { if (!this.#active || this.#ctx.fiber.state !== 2 || this.#ctx.fiber.uid === null) workerFail('WORKER_DISPOSED'); }
  #get(ticket) { this.#alive(); const entry = this.#tickets.get(ticket); if (!entry) workerFail('WORKER_INVALID'); return entry; }
  #permit(entry, originalClaim = true) {
    this.#alive(); this.#env.assertCurrent(entry.environment);
    let allowed;
    try { allowed = this.#permission(Object.freeze({ taskRef: entry.taskRef, generationRef: entry.generationRef, environmentRef: entry.spec.executor.environmentRef, bindingDigest: entry.spec.executor.bindingDigest, toolsDigest: entry.spec.executor.toolsDigest, permissionPolicyDigest: entry.spec.executor.permissionPolicyDigest, ...(entry.claim ? { claimRef: entry.claim.claimRef, actionDigest: entry.claim.actionDigest } : {}) })); } catch { workerFail('HOST_PERMISSION_DENIED'); }
    if (allowed !== true) workerFail('HOST_PERMISSION_DENIED');
    if (entry.claim && originalClaim) { try { if (entry.assertClaim() !== true) workerFail('WORKER_CLAIM_STALE'); } catch { workerFail('WORKER_CLAIM_STALE'); } }
  }
  bindClaim(ticket, claim, assertCurrent) {
    const entry = this.#get(ticket);
    workerRecord(claim, ['claimRef', 'reservationRef', 'actionRef', 'actionDigest', 'generationRef', 'sessionRef', 'task'], ['claimRef', 'reservationRef', 'actionDigest', 'generationRef']);
    if (entry.claim || entry.state !== 'prepared' || typeof assertCurrent !== 'function' || claim.generationRef !== entry.generationRef || claim.actionRef !== entry.spec.actionRef || claim.actionDigest !== entry.actionDigest || claim.task && (claim.task.taskRef !== entry.taskRef || claim.task.workspaceRef !== entry.workspaceRef || claim.task.ownerRef !== entry.ownerRef)) workerFail('WORKER_MAPPING_MISMATCH');
    entry.claim = Object.freeze({ claimRef: workerRef(claim.claimRef), reservationRef: workerRef(claim.reservationRef), actionDigest: workerRef(claim.actionDigest), generationRef: entry.generationRef });
    entry.assertClaim = assertCurrent;
  }
  async prepare(spec, task, actionDigest) {
    this.#alive();
    workerRef(actionDigest);
    try { spec = normalizedSpec(spec); } catch { workerFail('WORKER_INVALID'); }
    const environment = this.#env.bind(spec, task);
    if (this.#entries.size >= 1000) workerFail('WORKER_CAPACITY');
    const entry = { environment, spec: structuredClone(spec), actionDigest, taskRef: workerRef(task.taskRef), workspaceRef: task.workspaceRef, ownerRef: task.ownerRef, generationRef: workerRef(spec.executor.generationRef), state: 'prepared', handle: undefined, cursor: 0, events: new Map(), listeners: new Set(), stream: { revision: 0, count: 0, state: 'unobserved' } };
    this.#permit(entry);
    this.#env.inspect(environment, config => {
      entry.options = Object.freeze({ provider: config.provider, model: config.model, ...(config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort }) });
      entry.cwd = config.cwd;
    });
    try {
      const resolved = await this.#ctx.llm.resolveCallConfig(entry.options);
      if (resolved.provider !== entry.options.provider || resolved.model !== entry.options.model || resolved.reasoningEffort !== entry.options.reasoningEffort) workerFail('MODEL_CONFIGURATION_MISMATCH');
    } catch (error) { if (error instanceof WorkerError) throw error; workerFail('MODEL_UNAVAILABLE'); }
    this.#permit(entry);
    try {
      entry.id = this.#resolve ? this.#resolve(Object.freeze({ mode: spec.executor.mode, generationRef: entry.generationRef, sessionRef: spec.executor.sessionRef })) : spec.executor.mode === 'create' ? `bubbles-${entry.generationRef}` : undefined;
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
      const entry = [...this.#entries].find(value => value.taskRef === record.taskRef && value.sessionRef === metadata.recipientSessionRef && value.generationRef === metadata.recipientGenerationRef && value.handle && this.#ctx.agents.get(value.id) === value.handle.agent && value.state !== 'stopped');
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
        try { entry.handle.agent.inject({ id: record.messageRef, role: 'user', content: [{ type: 'text', text: body.content }], source: { kind: 'bubbles-relay', form: 'relay' } }); }
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
    if (this.#ctx.agents.get(entry.id)) workerFail('SESSION_ALREADY_LIVE');
    entry.state = 'submitted';
    const setup = () => ({ commit: () => this.#permit(entry) });
    try {
      const options = { agentOptions: entry.options, setup };
      const handle = await (mode === 'create' ? this.#ctx.agents.create({ ...options, sessionId: entry.id, meta: { cwd: entry.cwd } }) : this.#ctx.agents.resume({ ...options, resumeSessionId: entry.id }));
      if (!handle || handle.agent?.id !== entry.id || typeof handle.dispose !== 'function' || typeof handle.agent.cancel !== 'function' || typeof handle.agent.whenIdle !== 'function' || this.#ctx.agents.get(entry.id) !== handle.agent) workerFail('WORKER_RECEIPT_INVALID');
      entry.handle = handle; entry.state = 'created';
      // Creation alone supplies no evidence of executing work. No message is
      // sent here. Ready means owned, published, idle with validated setup.
      return this.#receipt(entry, 'created');
    } catch { entry.state = 'unknown'; workerFail('WORKER_CREATE_UNKNOWN'); }
  }
  create(ticket) { return this.#start(ticket, 'create'); }
  resume(ticket) { return this.#start(ticket, 'resume'); }
  query(ticket) {
    const entry = this.#get(ticket);
    if (entry.state === 'stopped') return this.#receipt(entry, 'stopped');
    const agent = this.#ctx.agents.get(entry.id);
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
    try { await entry.handle.dispose(); if (this.#ctx.agents.get(entry.id) === entry.handle.agent) return this.#receipt(entry, 'unknown'); entry.state = 'stopped'; return this.#receipt(entry, 'stopped'); }
    catch { entry.state = 'unknown'; return this.#receipt(entry, 'unknown'); }
  }
}

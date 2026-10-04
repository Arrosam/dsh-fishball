import { createHash } from 'node:crypto';
import { WorkerError, workerFail, workerDigest, workerRecord, workerRef, workerInteger } from './environment.mjs';

// Process-private orchestration. The store supplies identity, approval and
// transaction authority; no payload role/scope/verified field is accepted.
export class WorkerManager {
  #store; #host; #adapter; #entries = new Map(); #active = true;
  constructor({ store, hostHandle, adapter } = {}) {
    if (!store || !['snapshot', 'claimAction', 'workerObservation', 'control', 'assertClaimCurrent'].every(key => typeof store[key] === 'function') || !hostHandle || !adapter || !['prepare', 'bindClaim', 'create', 'resume', 'query', 'cancel', 'dispose', 'observe'].every(key => typeof adapter[key] === 'function')) workerFail('WORKER_CONFIG');
    this.#store = store; this.#host = hostHandle; this.#adapter = adapter;
  }
  #alive() { if (!this.#active) workerFail('WORKER_DISPOSED'); }
  #key(taskRef, actionRef) { return `${taskRef}:${actionRef}`; }
  #snapshot(caller, taskRef) {
    const callerSnapshot = this.#store.snapshot(caller, { taskRef });
    const hostSnapshot = this.#store.snapshot(this.#host, { taskRef });
    if (callerSnapshot.task.ownerRef !== hostSnapshot.task.ownerRef || callerSnapshot.task.workspaceRef !== hostSnapshot.task.workspaceRef || callerSnapshot.task.taskRef !== hostSnapshot.task.taskRef) workerFail('WORKER_SCOPE_DENIED');
    return callerSnapshot;
  }
  #observation(entry, receipt) {
    workerRecord(receipt, ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'phase', 'cursor', 'evidenceRef', 'sessionRef'], ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'phase', 'cursor', 'evidenceRef']);
    if (receipt.taskRef !== entry.taskRef || receipt.generationRef !== entry.generationRef) workerFail('WORKER_RECEIPT_INVALID');
    for (const key of ['actionRef', 'actionDigest', 'claimRef', 'reservationRef']) if (receipt[key] !== entry[key]) workerFail('WORKER_RECEIPT_INVALID');
    const phase = receipt.phase;
    if (!['created', 'ready', 'running', 'unknown', 'cancel_requested', 'stopped', 'not_created'].includes(phase)) workerFail('WORKER_RECEIPT_INVALID');
    if (['stopped', 'not_created'].includes(entry.phase) && phase !== entry.phase) return;
    workerRef(receipt.evidenceRef); workerInteger(receipt.cursor);
    if (receipt.sessionRef !== undefined) workerRef(receipt.sessionRef);
    if (entry.sessionRef && receipt.sessionRef !== entry.sessionRef) workerFail('WORKER_RECEIPT_INVALID');
    const result = this.#store.workerObservation(this.#host, { taskRef: entry.taskRef, claimRef: entry.claimRef, generationRef: entry.generationRef, commandRef: workerDigest('worker-observation', entry.claimRef, phase, receipt.cursor, receipt.evidenceRef), phase, cursor: receipt.cursor, evidenceRef: receipt.evidenceRef, ...(receipt.sessionRef === undefined ? {} : { sessionRef: receipt.sessionRef }) });
    entry.sessionRef ??= receipt.sessionRef; entry.phase = phase; entry.cursor = receipt.cursor;
    return result;
  }
  #unknown(entry) {
    return this.#observation(entry, { ...this.#view(entry), phase: 'unknown', cursor: entry.cursor ?? 0, evidenceRef: workerDigest('worker-unknown', entry.claimRef, entry.cursor ?? 0) });
  }
  #view(entry) { return Object.freeze({ taskRef: entry.taskRef, actionRef: entry.actionRef, actionDigest: entry.actionDigest, claimRef: entry.claimRef, reservationRef: entry.reservationRef, generationRef: entry.generationRef, ...(entry.sessionRef ? { sessionRef: entry.sessionRef } : {}), phase: entry.phase }); }
  async dispatch(caller, input) {
    this.#alive();
    workerRecord(input, ['taskRef', 'actionRef', 'actionDigest', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'timeoutMs'], ['taskRef', 'actionRef', 'actionDigest', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch']);
    for (const key of ['taskRef', 'actionRef', 'actionDigest', 'commandRef']) workerRef(input[key]);
    workerInteger(input.expectedTaskVersion, 1); workerInteger(input.expectedAuthEpoch);
    const timeoutMs = input.timeoutMs ?? 10000; workerInteger(timeoutMs, 1, 60000);
    input = Object.freeze({ ...input });
    const snapshot = this.#snapshot(caller, input.taskRef);
    const action = structuredClone(snapshot.actions.find(value => value.actionRef === input.actionRef));
    if (!action || action.actionDigest !== input.actionDigest) workerFail('WORKER_INTENT_MISMATCH');
    if (action.claimRef || this.#entries.has(this.#key(input.taskRef, input.actionRef))) workerFail('WORKER_ALREADY_SUBMITTED');
    // Model/environment readiness is asynchronous. Claim rechecks immutable
    // consent, CAS, permission and current policy atomically afterward.
    let ticket;
    const mode = action.spec.executor.mode;
    try { ticket = await this.#adapter.prepare(structuredClone(action.spec), Object.freeze({ ...snapshot.task }), input.actionDigest); }
    catch (error) { if (error instanceof WorkerError) throw error; workerFail('WORKER_PREPARATION_UNAVAILABLE'); }
    this.#alive();
    const { timeoutMs: ignored, ...claimInput } = input;
    const claim = this.#store.claimAction(caller, claimInput);
    const entry = { ...claim, taskRef: input.taskRef, actionRef: input.actionRef, actionDigest: input.actionDigest, ticket, sessionRef: action.spec.executor.sessionRef, phase: 'submitted' };
    this.#entries.set(this.#key(input.taskRef, input.actionRef), entry);
    // This durable boundary precedes every native create/resume call.
    this.#store.workerObservation(this.#host, { taskRef: entry.taskRef, claimRef: entry.claimRef, generationRef: entry.generationRef, commandRef: workerDigest('submitted', entry.claimRef), phase: 'submitted', evidenceRef: workerDigest('submitted-evidence', entry.claimRef), ...(entry.sessionRef ? { sessionRef: entry.sessionRef } : {}) });
    this.#adapter.bindClaim(ticket, claim, () => {
      this.#store.assertClaimCurrent(this.#host, { taskRef: entry.taskRef, claimRef: entry.claimRef, generationRef: entry.generationRef, actionDigest: entry.actionDigest });
      return true;
    });
    entry.detach = this.#adapter.observe(ticket, receipt => {
      try { this.#observation(entry, receipt); } catch { entry.phase = 'unknown'; /* next query must reconcile durably */ }
    });
    const completion = Promise.resolve().then(() => mode === 'resume' ? this.#adapter.resume(ticket) : this.#adapter.create(ticket)).then(async receipt => {
      this.#observation(entry, receipt);
      if (entry.stopRequested || !this.#active) {
        this.#observation(entry, await this.#adapter.cancel(ticket));
        this.#observation(entry, await this.#adapter.dispose(ticket));
        return this.#view(entry);
      }
      // A published idle agent is a separate factual ready observation.
      const current = this.#adapter.query(ticket); if (current.phase !== 'unknown') this.#observation(entry, current);
      return this.#view(entry);
    }).catch(() => { try { this.#unknown(entry); } catch { entry.phase = 'unknown'; } return this.#view(entry); });
    entry.completion = completion;
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => { try { this.#unknown(entry); } catch { entry.phase = 'unknown'; } resolve(this.#view(entry)); }, timeoutMs); });
    try { return await Promise.race([completion, deadline]); } finally { clearTimeout(timer); }
    // No abort/retry/recreate occurs on timeout. Late completion maps to this
    // exact original claim/generation and original approved action digest.
  }
  query(caller, input) {
    this.#alive(); workerRecord(input, ['taskRef', 'actionRef', 'claimRef', 'generationRef']);
    for (const value of Object.values(input)) workerRef(value);
    const snapshot = this.#snapshot(caller, input.taskRef);
    const action = snapshot.actions.find(value => value.actionRef === input.actionRef);
    if (!action || action.claimRef !== input.claimRef || action.spec.executor.generationRef !== input.generationRef) workerFail('WORKER_MAPPING_MISMATCH');
    let entry = this.#entries.get(this.#key(input.taskRef, input.actionRef));
    if (entry && (entry.taskRef !== input.taskRef || entry.claimRef !== input.claimRef || entry.generationRef !== input.generationRef)) workerFail('WORKER_MAPPING_MISMATCH');
    if (!entry) {
      // Restart has no ownership handle. Registry absence cannot establish
      // executor absence; reconcile a trusted native mapping before release.
      const mapping = snapshot.workers?.find(value => value.claimRef === input.claimRef && value.generationRef === input.generationRef);
      entry = { ...input, actionDigest: action.actionDigest, reservationRef: action.reservationRef, sessionRef: mapping?.sessionRef ?? action.spec.executor.sessionRef, cursor: mapping?.cursor ?? 0, phase: ['stopped', 'not_created'].includes(mapping?.phase) ? mapping.phase : 'unknown' };
      if (entry.phase !== 'unknown') return this.#view(entry);
      this.#unknown(entry); return this.#view(entry);
    }
    try { this.#observation(entry, this.#adapter.query(entry.ticket)); }
    catch { this.#unknown(entry); }
    return this.#view(entry);
  }
  sessionLink(caller, input) {
    this.#alive();
    workerRecord(input, ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'sessionRef', 'expectedTaskVersion', 'expectedAuthEpoch']);
    for (const key of ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'sessionRef']) workerRef(input[key]);
    workerInteger(input.expectedTaskVersion, 1); workerInteger(input.expectedAuthEpoch);
    const snapshot = this.#snapshot(caller, input.taskRef), task = snapshot.task;
    if (task.version !== input.expectedTaskVersion || task.authEpoch !== input.expectedAuthEpoch) workerFail('STALE_VERSION');
    const action = snapshot.actions.find(value => value.actionRef === input.actionRef), mapping = snapshot.workers.find(value => value.claimRef === input.claimRef);
    const entry = this.#entries.get(this.#key(input.taskRef, input.actionRef));
    if (!action || action.actionDigest !== input.actionDigest || action.claimRef !== input.claimRef || action.spec.executor.generationRef !== input.generationRef || !mapping || mapping.actionRef !== input.actionRef || mapping.generationRef !== input.generationRef || mapping.sessionRef !== input.sessionRef || !entry || entry.claimRef !== input.claimRef || entry.generationRef !== input.generationRef || entry.sessionRef !== input.sessionRef || typeof this.#adapter.sessionLink !== 'function') workerFail('WORKER_SESSION_UNAVAILABLE');
    const link = this.#adapter.sessionLink(entry.ticket);
    for (const key of ['taskRef', 'actionDigest', 'claimRef', 'generationRef', 'sessionRef']) if (link[key] !== input[key]) workerFail('WORKER_RECEIPT_INVALID');
    if (typeof link.sessionId !== 'string' || link.sessionId.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(link.sessionId) || createHash('sha256').update(link.sessionId).digest('hex') !== input.sessionRef) workerFail('WORKER_RECEIPT_INVALID');
    const current = this.#snapshot(caller, input.taskRef).task;
    if (current.version !== task.version || current.authEpoch !== task.authEpoch) workerFail('STALE_VERSION');
    return Object.freeze({ taskRef: input.taskRef, actionRef: input.actionRef, actionDigest: input.actionDigest, claimRef: input.claimRef, generationRef: input.generationRef, sessionRef: input.sessionRef, sessionId: link.sessionId, taskVersion: task.version, authEpoch: task.authEpoch });
  }
  async executeContext(caller, input) {
    this.#alive();
    workerRecord(input, ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'contextRecordRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'timeoutMs'], ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'contextRecordRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch']);
    for (const key of ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'contextRecordRef', 'commandRef']) workerRef(input[key]);
    workerInteger(input.expectedTaskVersion, 1); workerInteger(input.expectedAuthEpoch);
    const timeoutMs = input.timeoutMs ?? 10000; workerInteger(timeoutMs, 1, 60000); input = Object.freeze({ ...input });
    if (!['readData', 'beginContextExecution', 'assertExecutionCurrent'].every(key => typeof this.#store[key] === 'function') || typeof this.#adapter.executeContext !== 'function') workerFail('WORKER_EXECUTION_UNAVAILABLE');
    const snapshot = this.#snapshot(caller, input.taskRef), action = snapshot.actions.find(value => value.actionRef === input.actionRef);
    const entry = this.#entries.get(this.#key(input.taskRef, input.actionRef));
    if (!entry || entry.claimRef !== input.claimRef || entry.generationRef !== input.generationRef || entry.actionDigest !== input.actionDigest || !action || action.claimRef !== input.claimRef || action.actionDigest !== input.actionDigest || action.spec.executor.generationRef !== input.generationRef) workerFail('WORKER_MAPPING_MISMATCH');
    const data = this.#store.readData(caller, { taskRef: input.taskRef, recordRef: input.contextRecordRef });
    const body = Object.freeze({ recordRef: data.recordRef, kind: data.kind, content: data.content, digest: data.digest, byteLength: data.byteLength });
    if (body.kind !== 'context' || body.digest !== action.spec.dataDigest) workerFail('WORKER_CONTEXT_INVALID');
    const { timeoutMs: ignored, ...intentInput } = input;
    const intent = this.#store.beginContextExecution(this.#host, intentInput);
    const binding = Object.freeze({ executionRef: workerRef(intent.executionRef), taskRef: input.taskRef, claimRef: input.claimRef, generationRef: input.generationRef, contextRecordRef: input.contextRecordRef, actionDigest: input.actionDigest, dataDigest: body.digest });
    if (Object.keys(binding).some(key => intent[key] !== binding[key])) workerFail('WORKER_EXECUTION_INVALID');
    if (intent.deduplicated === true || intent.state !== 'intent_committed') return Object.freeze({ executionRef: binding.executionRef, state: intent.state, admitted: false, worker: this.#view(entry) });
    const completion = this.#adapter.executeContext(entry.ticket, binding, body, () => {
      this.#alive();
      return this.#store.assertExecutionCurrent(this.#host, { taskRef: input.taskRef, claimRef: input.claimRef, generationRef: input.generationRef, actionDigest: input.actionDigest, executionRef: binding.executionRef });
    }).then(result => {
      if (result.executionRef !== binding.executionRef || !['committed', 'unknown'].includes(result.state)) workerFail('WORKER_EXECUTION_INVALID');
      this.#observation(entry, result.worker);
      return Object.freeze({ ...result, worker: this.#view(entry) });
    }).catch(() => { try { this.#unknown(entry); } catch { entry.phase = 'unknown'; } return Object.freeze({ executionRef: binding.executionRef, state: 'unknown', worker: this.#view(entry) }); });
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => { try { this.#unknown(entry); } catch { entry.phase = 'unknown'; } resolve(Object.freeze({ executionRef: binding.executionRef, state: 'unknown', worker: this.#view(entry) })); }, timeoutMs); });
    try { return await Promise.race([completion, deadline]); } finally { clearTimeout(timer); }
  }
  async cancel(caller, input) {
    this.#alive(); workerRecord(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch']);
    this.#snapshot(caller, workerRef(input.taskRef));
    const receipt = this.#store.control(caller, { ...input, kind: 'cancel' });
    return Object.freeze({ receipt, workers: await this.cancelAfterControl(input.taskRef) });
  }
  captureResult(caller, input) {
    this.#alive();
    workerRecord(input, ['taskRef', 'actionRef', 'claimRef', 'generationRef', 'executionRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'artifactRef', 'version']);
    for (const key of ['taskRef', 'actionRef', 'claimRef', 'generationRef', 'executionRef', 'commandRef', 'artifactRef']) workerRef(input[key]);
    workerInteger(input.expectedTaskVersion, 1); workerInteger(input.expectedAuthEpoch); workerInteger(input.version, 1);
    this.#snapshot(caller, input.taskRef);
    const entry = this.#entries.get(this.#key(input.taskRef, input.actionRef));
    if (!entry || entry.claimRef !== input.claimRef || entry.generationRef !== input.generationRef || typeof this.#adapter.readResult !== 'function') workerFail('WORKER_RESULT_UNAVAILABLE');
    const result = this.#adapter.readResult(entry.ticket, input.executionRef);
    if (result.taskRef !== entry.taskRef || result.claimRef !== entry.claimRef || result.generationRef !== entry.generationRef || result.actionDigest !== entry.actionDigest || result.sessionRef !== entry.sessionRef || result.executionRef !== input.executionRef) workerFail('WORKER_RECEIPT_INVALID');
    const { actionRef, claimRef, executionRef, ...artifact } = input;
    const content = JSON.stringify({ contractVersion: 'df.native-result/v1', source: {
      taskRef: entry.taskRef, actionRef: entry.actionRef, actionDigest: entry.actionDigest,
      claimRef: entry.claimRef, generationRef: entry.generationRef, sessionRef: entry.sessionRef,
      executionRef, inputDigest: result.dataDigest, cursor: result.cursor, resultDigest: result.digest,
    }, content: result.content });
    return this.#store.writeArtifact(caller, { ...artifact, producerClaimRef: claimRef, content });
  }
  handoff(caller, input) {
    this.#alive();
    workerRecord(input, ['taskRef', 'actionRef', 'claimRef', 'generationRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'targetEnvironmentRef', 'reason', 'steps', 'resumeCondition', 'expiresAt']);
    for (const key of ['taskRef', 'actionRef', 'claimRef', 'generationRef', 'commandRef', 'targetEnvironmentRef']) workerRef(input[key]);
    const snapshot = this.#snapshot(caller, input.taskRef);
    const entry = this.#entries.get(this.#key(input.taskRef, input.actionRef)), action = snapshot.actions.find(value => value.actionRef === input.actionRef);
    if (!entry || !action || action.claimRef !== input.claimRef || action.spec.executor.generationRef !== input.generationRef || entry.claimRef !== input.claimRef || snapshot.task.version !== input.expectedTaskVersion || snapshot.task.authEpoch !== input.expectedAuthEpoch || typeof this.#adapter.handoff !== 'function') workerFail('HANDOFF_UNVERIFIED');
    const handoff = this.#adapter.handoff(entry.ticket, { targetEnvironmentRef: input.targetEnvironmentRef, reason: input.reason, steps: input.steps, resumeCondition: input.resumeCondition, expiresAt: input.expiresAt, taskVersion: snapshot.task.version, authEpoch: snapshot.task.authEpoch, actionDigest: action.actionDigest, claimRef: input.claimRef, generationRef: input.generationRef }, snapshot.task);
    if (typeof this.#store.putHandoff !== 'function') workerFail('HANDOFF_UNAVAILABLE');
    const record = this.#store.putHandoff(caller, { taskRef: input.taskRef, commandRef: input.commandRef, expectedTaskVersion: input.expectedTaskVersion, expectedAuthEpoch: input.expectedAuthEpoch, claimRef: input.claimRef, generationRef: input.generationRef, actionDigest: action.actionDigest, content: JSON.stringify(handoff), sourceRef: input.actionRef });
    return Object.freeze({ state: 'pending', taskRef: input.taskRef, claimRef: input.claimRef, generationRef: input.generationRef, recordRef: record.recordRef, digest: record.digest });
  }
  async cancelAfterControl(taskRef) {
    this.#alive(); workerRef(taskRef);
    const snapshot = this.#store.snapshot(this.#host, { taskRef });
    if (!['cancel_requested', 'cancelled'].includes(snapshot.task.status) && snapshot.control !== 'paused') workerFail('WORKER_CONTROL_REQUIRED');
    const results = [];
    for (const entry of this.#entries.values()) if (entry.taskRef === taskRef) {
      if (['stopped', 'not_created'].includes(entry.phase)) { results.push(this.#view(entry)); continue; }
      entry.stopRequested = true;
      const requested = { ...this.#view(entry), phase: 'cancel_requested', cursor: entry.cursor ?? 0, evidenceRef: workerDigest('cancel-requested', entry.claimRef, entry.cursor ?? 0) };
      this.#observation(entry, requested);
      try {
        this.#observation(entry, await this.#adapter.cancel(entry.ticket));
        this.#observation(entry, await this.#adapter.dispose(entry.ticket));
      } catch { this.#unknown(entry); }
      results.push(this.#view(entry));
    }
    // Even confirmed native stop retains reservations until outstanding
    // effects/messages and action outcomes have separate trusted settlement.
    return Object.freeze(results);
  }
  async close() {
    if (!this.#active) return; this.#active = false;
    for (const entry of this.#entries.values()) {
      entry.detach?.();
      try { this.#observation(entry, await (this.#adapter.shutdown ? this.#adapter.shutdown(entry.ticket) : this.#adapter.dispose(entry.ticket))); }
      catch { try { this.#unknown(entry); } catch { /* storage failure stays held */ } }
    }
  }
}

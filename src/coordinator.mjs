import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { contextText } from './context.mjs';

export class CoordinatorError extends Error {
  constructor(code) { super(code); this.name = 'CoordinatorError'; this.code = code; }
}
const fail = code => { throw new CoordinatorError(code); };
const command = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
function record(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('COORDINATOR_INVALID');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !keys.includes(key) || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')) || required.some(key => !Object.hasOwn(fields, key))) fail('COORDINATOR_INVALID');
}
function ref(value) { if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) fail('COORDINATOR_INVALID'); return value; }
function sequence(value, max) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) fail('COORDINATOR_INVALID');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')))) fail('COORDINATOR_INVALID');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(fields, String(i))) fail('COORDINATOR_INVALID');
  return value;
}

export function bundleDecisions(questions, resolvedRefs = [], knownSecrets = []) {
  sequence(questions, 16); sequence(resolvedRefs, 16);
  const resolved = new Set(resolvedRefs.map(ref)), merged = new Map();
  for (const item of questions) {
    record(item, ['decisionRef', 'question', 'branchRefs']); ref(item.decisionRef);
    contextText(item.question, knownSecrets, 8192);
    sequence(item.branchRefs, 16);
    if (!item.question.trim() || !item.branchRefs.length) fail('COORDINATOR_INVALID');
    const branches = item.branchRefs.map(ref);
    if (resolved.has(item.decisionRef)) continue;
    const prior = merged.get(item.decisionRef);
    if (prior && prior.question !== item.question) fail('DECISION_CONFLICT');
    const branchRefs = [...new Set([...(prior?.branchRefs ?? []), ...branches])];
    if (branchRefs.length > 16) fail('COORDINATOR_INVALID');
    merged.set(item.decisionRef, { decisionRef: item.decisionRef, question: item.question, branchRefs });
  }
  return [...merged.values()];
}

// Caller handles are opaque core capabilities. This wrapper never converts
// serialized scope or claims into a handle and never passes refs to W1 raw IDs.
export class Coordinator {
  #store; #secrets; #classifier; #cancel;
  constructor({ store, knownSecrets = [], classify, cancelWorkers } = {}) {
    if (!store || !['intake', 'task', 'snapshot', 'revise', 'control', 'putData', 'readData', 'listData'].every(method => typeof store[method] === 'function')) fail('COORDINATOR_CONFIG');
    if (classify !== undefined && typeof classify !== 'function' || cancelWorkers !== undefined && typeof cancelWorkers !== 'function') fail('COORDINATOR_CONFIG');
    contextText('', knownSecrets);
    this.#store = store; this.#secrets = [...knownSecrets]; this.#classifier = classify; this.#cancel = cancelWorkers;
  }
  register(handle, input) {
    record(input, ['taskId', 'provider', 'source', 'eventId', 'commandRef', 'goal'], ['taskId', 'provider', 'source', 'eventId', 'commandRef']);
    if (input.goal !== undefined) contextText(input.goal, this.#secrets);
    return this.#store.intake(handle, input);
  }
  // Registration is returned immediately. An async classifier/session cannot
  // hold the inbox or status path; classified metadata uses the receipt CAS.
  receive(handle, input) {
    const receipt = this.register(handle, input);
    const classification = !this.#classifier || receipt.deduplicated ? Promise.resolve({ state: 'registered' }) : Promise.resolve().then(async () => {
      let disposition;
      try { disposition = await this.#classifier(Object.freeze({ task: receipt.task })); }
      catch { return { state: 'unknown', code: 'CLASSIFICATION_UNAVAILABLE' }; }
      if (!['new_task', 'supplement', 'control', 'clarification'].includes(disposition)) return { state: 'unknown', code: 'CLASSIFICATION_INVALID' };
      try {
        const saved = this.#store.putData(handle, { taskRef: receipt.task.taskRef, commandRef: command('classify', input.commandRef), kind: 'branch', content: JSON.stringify({ classification: disposition }), sourceRef: input.commandRef, expectedTaskVersion: receipt.task.version, expectedAuthEpoch: receipt.task.authEpoch });
        return { state: 'classified', classification: disposition, record: saved };
      } catch { return { state: 'unknown', code: 'CLASSIFICATION_STALE' }; }
    });
    return Object.freeze({ receipt, classification });
  }
  status(handle, taskRef) { return this.#store.snapshot(handle, { taskRef: ref(taskRef) }); }
  revise(handle, input) {
    record(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'goal', 'constraints', 'reason'], ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'reason']);
    if (input.goal !== undefined) contextText(input.goal, this.#secrets);
    if (input.constraints !== undefined) contextText(input.constraints, this.#secrets);
    return this.#store.revise(handle, input);
  }
  #batches(handle, taskRef) {
    const latest = new Map();
    const metadata = this.#store.listData(handle, { taskRef, kind: 'clarification' });
    sequence(metadata, 64);
    for (const meta of [...metadata].sort((a, b) => a.taskVersion - b.taskVersion)) {
      const data = this.#store.readData(handle, { taskRef, recordRef: meta.recordRef });
      let batch;
      try { batch = JSON.parse(contextText(data.content, this.#secrets)); } catch { fail('CLARIFICATION_INVALID'); }
      record(batch, ['batchRef', 'state', 'questions', 'answers', 'sourceAuthEpoch'], ['batchRef', 'state', 'questions', 'sourceAuthEpoch']);
      ref(batch.batchRef);
      if (!['awaiting', 'answered', 'withdrawn'].includes(batch.state)) fail('CLARIFICATION_INVALID');
      bundleDecisions(batch.questions, [], this.#secrets);
      if (batch.state === 'answered') {
        sequence(batch.answers, 16);
        const wanted = new Set(batch.questions.map(question => question.decisionRef));
        if (batch.answers.length !== wanted.size) fail('CLARIFICATION_INVALID');
        for (const answer of batch.answers) {
          record(answer, ['decisionRef', 'answer']); ref(answer.decisionRef); contextText(answer.answer, this.#secrets, 8192);
          if (!wanted.delete(answer.decisionRef) || !answer.answer.trim()) fail('CLARIFICATION_INVALID');
        }
      } else if (batch.answers !== undefined) fail('CLARIFICATION_INVALID');
      latest.set(batch.batchRef, { batch, data });
    }
    return latest;
  }
  #current(handle, input) {
    const task = this.#store.task(handle, ref(input.taskRef));
    if (task.version !== input.expectedTaskVersion) fail('STALE_VERSION');
    if (task.authEpoch !== input.expectedAuthEpoch) fail('STALE_AUTHORITY');
    return task;
  }
  clarify(handle, input) {
    record(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'questions']);
    const task = this.#current(handle, input);
    const batches = this.#batches(handle, task.taskRef), resolved = [], outstanding = [];
    const proposed = bundleDecisions(input.questions, [], this.#secrets);
    for (const { batch } of batches.values()) {
      if (batch.sourceAuthEpoch !== task.authEpoch) continue;
      if (batch.state === 'answered') resolved.push(...batch.answers.map(answer => answer.decisionRef));
      if (batch.state === 'awaiting') {
        for (const prior of batch.questions) {
          const next = proposed.find(question => question.decisionRef === prior.decisionRef);
          if (next && (next.question !== prior.question || next.branchRefs.some(branchRef => !prior.branchRefs.includes(branchRef)))) fail('DECISION_CONFLICT');
        }
        outstanding.push(...batch.questions.map(question => question.decisionRef));
      }
    }
    const relevant = new Set(proposed.map(question => question.decisionRef));
    const questions = bundleDecisions(proposed, [...new Set([...resolved, ...outstanding])].filter(decisionRef => relevant.has(decisionRef)), this.#secrets);
    if (!questions.length) return Object.freeze({ state: 'resolved_or_pending', approval: 'not_granted' });
    const batchRef = command('clarification', input.commandRef), content = JSON.stringify({ batchRef, state: 'awaiting', questions, sourceAuthEpoch: task.authEpoch });
    const saved = this.#store.putData(handle, { taskRef: task.taskRef, commandRef: input.commandRef, kind: 'clarification', content, sourceRef: input.commandRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
    return Object.freeze({ state: 'awaiting', batchRef, record: saved, approval: 'not_granted' });
  }
  answer(handle, input) {
    record(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'batchRef', 'answers']);
    const task = this.#current(handle, input), found = this.#batches(handle, task.taskRef).get(ref(input.batchRef));
    if (!found || found.batch.state !== 'awaiting' || found.batch.sourceAuthEpoch !== task.authEpoch) fail('CLARIFICATION_STALE');
    sequence(input.answers, 16);
    const wanted = new Set(found.batch.questions.map(question => question.decisionRef));
    if (input.answers.length !== wanted.size) fail('CLARIFICATION_INCOMPLETE');
    for (const answer of input.answers) {
      record(answer, ['decisionRef', 'answer']); ref(answer.decisionRef); contextText(answer.answer, this.#secrets, 8192);
      if (!wanted.delete(answer.decisionRef) || !answer.answer.trim()) fail('CLARIFICATION_INCOMPLETE');
    }
    const content = JSON.stringify({ ...found.batch, state: 'answered', answers: input.answers });
    const saved = this.#store.putData(handle, { taskRef: task.taskRef, commandRef: input.commandRef, kind: 'clarification', content, sourceRef: input.commandRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
    return Object.freeze({ state: 'answered', batchRef: input.batchRef, record: saved, approval: 'not_granted' });
  }
  withdraw(handle, input) {
    record(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'batchRef']);
    const task = this.#current(handle, input), found = this.#batches(handle, task.taskRef).get(ref(input.batchRef));
    if (!found || found.batch.state !== 'awaiting') fail('CLARIFICATION_STALE');
    const content = JSON.stringify({ ...found.batch, sourceAuthEpoch: task.authEpoch, state: 'withdrawn' });
    const saved = this.#store.putData(handle, { taskRef: task.taskRef, commandRef: input.commandRef, kind: 'clarification', content, sourceRef: input.commandRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
    return Object.freeze({ state: 'withdrawn', batchRef: input.batchRef, record: saved, approval: 'not_granted' });
  }
  branchReady(handle, { taskRef, branchRef }) {
    ref(branchRef); const snapshot = this.#store.snapshot(handle, { taskRef: ref(taskRef) }), task = snapshot.task;
    for (const { batch } of this.#batches(handle, taskRef).values()) if (batch.state === 'awaiting' && batch.questions.some(question => question.branchRefs.includes(branchRef))) return false;
    return snapshot.control === 'active' && !['cancel_requested', 'cancelled', 'recovery_required', 'completed', 'failed', 'deleted'].includes(task.status);
  }
  stop(handle, input) {
    record(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch']);
    // Core control commits before the deferred native cancellation callback.
    const receipt = this.#store.control(handle, { ...input, kind: 'cancel' });
    const settled = Promise.resolve().then(async () => {
      if (!this.#cancel) return { cancellation: 'unknown', code: 'CANCELLATION_UNAVAILABLE' };
      try { await this.#cancel(Object.freeze({ taskRef: input.taskRef, receipt })); }
      catch { return { cancellation: 'unknown', code: 'CANCELLATION_UNCERTAIN' }; }
      // A callback return value is not authoritative stopping evidence. The
      // trusted adapter must commit observations/settlement to the core.
      try {
        const snapshot = this.status(handle, input.taskRef);
        return { cancellation: snapshot.task.status === 'cancelled' ? 'observed_stopped' : 'requested', snapshot };
      } catch { return { cancellation: 'unknown', code: 'CANCELLATION_UNCERTAIN' }; }
    });
    return Object.freeze({ receipt, cancellation: 'requested', settled });
  }
}

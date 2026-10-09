// The native client bundle emitter serializes this self-contained factory.
// All UI dependencies come from DSH's public lazy module table.
module.exports = function clientFactory(require) {
  const React = require('react');
  const h = React.createElement;
  const terminal = new Set(['completed', 'failed', 'cancelled', 'deleted']);
  const ref = value => typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const errorLabels = {
    STALE_VERSION: 'This task changed. Refresh before trying again.',
    STALE_AUTHORITY: 'Approval changed. Refresh the current task.',
    STALE_AUTH: 'Approval changed. Refresh the current task.',
    OPERATOR_REQUIRED: 'This view needs the host owner connection.',
    SERVICE_DISPOSED: 'dsh-fishball was unloaded. Wait for the host to reconnect, then refresh.',
    SECRET_REJECTED: 'The host rejected sensitive content. Remove it before submitting.',
    TASK_BLOCKED: 'This task needs reconciliation before more work can be admitted.',
    WORKER_SESSION_UNAVAILABLE: 'This owned session is stopped or unavailable in the current host. Refresh its mapping.',
    CLIENT_NAVIGATION_UNAVAILABLE: 'The host session navigation service is unavailable.',
    CLARIFICATION_STALE: 'This question batch changed. Load the current task before answering.',
    RESERVATION_HELD: 'Work or effects remain unconfirmed. Cancellation is still pending.',
  };
  const errorCodes = new Set([...Object.keys(errorLabels), 'RESULT_UNCONFIRMED', 'INVALID_RESPONSE', 'INVALID_COMMAND', 'CONNECTION_CHANGED', 'PREVIEW_STALE', 'CAPABILITY_UNAVAILABLE', 'STALE_SOURCE', 'STALE_SUBSCRIPTION', 'STALE_EVENT_CLOCK', 'VERIFICATION_REQUIRED']);
  const publicError = code => errorCodes.has(code) ? code : 'RESULT_UNCONFIRMED';
  const safeTask = task => {
    if (!task || !ref(task.taskRef) || !integer(task.version) || task.version < 1 || !integer(task.authEpoch) || !integer(task.updatedAt) || !['queued', 'running', 'waiting', 'blocked', 'completed', 'failed', 'cancel_requested', 'cancelled', 'recovery_required', 'deleted'].includes(task.status)) throw new Error('INVALID_RESPONSE');
    return Object.freeze({ taskRef: task.taskRef, status: task.status, version: task.version, authEpoch: task.authEpoch, updatedAt: task.updatedAt });
  };
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const copy = value => freeze(structuredClone(value));
  const boundedText = (value, max = 65536) => typeof value === 'string' && value.trim() && new TextEncoder().encode(value).length <= max;
  const label = status => ({ queued: 'Queued', running: 'Active', waiting: 'Waiting', blocked: 'Blocked', completed: 'Completed', failed: 'Failed', cancel_requested: 'Cancellation requested', cancelled: 'Cancelled', recovery_required: 'Needs reconciliation', deleted: 'Deleted' }[status] || 'Unknown');
  function createModel(rpc, { navigateSession, clock = Date.now, uuid = () => crypto.randomUUID(), digest = async text => {
    const bytes = new TextEncoder().encode(text), hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  } } = {}) {
    let active = true, revision = 0, detailRevision = 0, mutation = false, connectionEpoch = 0;
    let state = Object.freeze({ tasks: [], selected: null, detail: null, records: [], previews: Object.freeze({}), previewBusy: null, automation: null, automationStale: true, automationBusy: false, automationError: null, receipts: [], phase: 'loading', error: null, busy: false, updatedAt: null, stale: true });
    const listeners = new Set(), controllers = new Set();
    function publish(update) { if (!active) return; state = Object.freeze({ ...state, ...update }); for (const listener of [...listeners]) listener(); }
    async function call(endpoint, payload) {
      if (!active) throw new Error('SERVICE_DISPOSED');
      const epoch = connectionEpoch;
      const controller = new AbortController(); controllers.add(controller);
      try {
        const response = await rpc.call('/df-rpc', `v1/${endpoint}`, payload, controller.signal);
        if (!active) throw new Error('SERVICE_DISPOSED');
        if (epoch !== connectionEpoch || controller.signal.aborted) throw new Error('CONNECTION_CHANGED');
        const result = setupObject(plainRpcReply(response), ['ok', 'value', 'error'], ['ok']);
        if (result.ok === false && !Object.hasOwn(result, 'value')) {
          const error = setupObject(result.error, ['code', 'message', 'details'], ['code']);
          if (typeof error.code !== 'string' || (Object.hasOwn(error, 'message') && typeof error.message !== 'string') || (Object.hasOwn(error, 'details') && (!error.details || typeof error.details !== 'object' || Array.isArray(error.details)))) throw new Error('INVALID_RESPONSE');
          throw new Error(publicError(error.code));
        }
        if (result.ok !== true || !Object.hasOwn(result, 'value') || Object.hasOwn(result, 'error')) throw new Error('INVALID_RESPONSE');
        return result.value;
      } catch (error) { throw new Error(publicError(setupFailure(error))); }
      finally { controllers.delete(controller); }
    }
    async function refresh() {
      const read = ++revision;
      publish({ phase: 'loading', error: null, stale: true, previews: Object.freeze({}) });
      try {
        const values = await call('list', {});
        if (!Array.isArray(values) || values.length > 1000) throw new Error('INVALID_RESPONSE');
        const tasks = Object.freeze(values.map(safeTask));
        if (!active || read !== revision) return;
        const selected = tasks.some(task => task.taskRef === state.selected) ? state.selected : tasks[0]?.taskRef ?? null;
        publish({ tasks, selected, phase: 'ready', stale: false, updatedAt: clock() });
        if (selected) await select(selected); else publish({ detail: null, records: [] });
      } catch (error) { if (active && read === revision) publish({ phase: 'error', stale: true, error: publicError(error?.message) }); }
    }
    async function select(taskRef) {
      if (!ref(taskRef) || !state.tasks.some(task => task.taskRef === taskRef)) return;
      const read = ++detailRevision;
      publish({ selected: taskRef, detail: null, records: [], stale: true, previews: Object.freeze({}), previewBusy: null });
      try {
        const snapshot = await call('status', { taskRef });
        const task = safeTask(snapshot?.task);
        if (task.taskRef !== taskRef || !Array.isArray(snapshot.data) || snapshot.data.length > 128 || !Array.isArray(snapshot.actions) || snapshot.actions.length > 128 || !Array.isArray(snapshot.workers) || snapshot.workers.length > 128) throw new Error('INVALID_RESPONSE');
        for (const key of ['artifacts', 'deliveries', 'audits', 'reviews', 'progress']) if (snapshot[key] !== undefined && (!Array.isArray(snapshot[key]) || snapshot[key].length > 128)) throw new Error('INVALID_RESPONSE');
        const records = [];
        const kinds = new Set(['goal', 'constraints', 'clarification', 'branch', 'context', 'artifact', 'verification', 'progress']);
        for (const metadata of snapshot.data.filter(record => kinds.has(record.kind)).slice(-32)) {
          if (!ref(metadata.recordRef)) throw new Error('INVALID_RESPONSE');
          const detail = await call('detail', { taskRef, recordRef: metadata.recordRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
          if (!detail?.task || detail.task.taskRef !== taskRef || detail.task.version !== task.version || detail.task.authEpoch !== task.authEpoch || detail.data?.recordRef !== metadata.recordRef || typeof detail.data.content !== 'string' || detail.data.content.length > 65536) throw new Error('INVALID_RESPONSE');
          records.push(Object.freeze({ recordRef: metadata.recordRef, kind: metadata.kind, content: detail.data.content, digest: detail.data.digest }));
        }
        if (!active || read !== detailRevision || state.selected !== taskRef) return;
        const tasks = state.tasks.map(value => value.taskRef === taskRef ? task : value);
        publish({ tasks: Object.freeze(tasks), detail: copy({ ...snapshot, task }), records: Object.freeze(records), stale: false, phase: 'ready', error: null, updatedAt: clock() });
      } catch (error) { if (active && read === detailRevision) publish({ phase: 'error', stale: true, error: publicError(error?.message) }); }
    }
    async function control(kind) {
      if (mutation || !active || state.stale || !state.detail || terminal.has(state.detail.task.status)) return false;
      const snapshot = state.detail, task = snapshot.task, epoch = connectionEpoch;
      if (!['pause', 'resume', 'cancel'].includes(kind) || kind === 'resume' && (snapshot.control !== 'paused' || ['cancel_requested', 'recovery_required'].includes(task.status)) || kind === 'cancel' && task.status === 'cancel_requested') return false;
      mutation = true; publish({ busy: true, error: null });
      try {
        const commandRef = await digest(uuid());
        if (!ref(commandRef) || !active) throw new Error('INVALID_COMMAND');
        if (epoch !== connectionEpoch || state.stale || state.detail !== snapshot) throw new Error('CONNECTION_CHANGED');
        await call('control', { taskRef: task.taskRef, commandRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, kind });
        // A successful click is followed by a current authoritative read. The
        // request result alone never paints cancelled/stopped/completed.
        await refresh(); return true;
      } catch (error) { publish({ error: publicError(error?.message), stale: true }); return false; }
      finally { mutation = false; publish({ busy: false }); }
    }
    async function intake(goal) {
      if (mutation || !active || typeof goal !== 'string' || !goal.trim() || new TextEncoder().encode(goal).length > 65536) return false;
      mutation = true; publish({ busy: true, error: null });
      const epoch = connectionEpoch;
      try {
        const event = uuid(), taskId = `task-${event}`;
        const commandRef = await digest(`intake:${event}`);
        if (!ref(commandRef) || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(taskId)) throw new Error('INVALID_COMMAND');
        if (!active || epoch !== connectionEpoch || state.phase === 'offline') throw new Error('CONNECTION_CHANGED');
        const accepted = await call('intake', { taskId, provider: 'native-panel', source: 'owner-input', eventId: event, commandRef, goal });
        const task = safeTask(accepted?.task);
        publish({ selected: task.taskRef }); await refresh(); return true;
      } catch (error) { publish({ error: publicError(error?.message), stale: true }); return false; }
      finally { mutation = false; publish({ busy: false }); }
    }
    function previewBinding(actionRef) {
      if (!active || state.stale || !state.detail || terminal.has(state.detail.task.status) || ['cancel_requested', 'recovery_required'].includes(state.detail.task.status) || state.detail.control !== 'active') return null;
      const action = state.detail.actions.find(value => value.actionRef === actionRef);
      const data = action && state.records.find(value => value.digest === action.spec?.dataDigest);
      return action && data && ref(action.actionDigest) && ref(actionRef) && !action.claimRef && action.state === 'requested' ? { snapshot: state.detail, action, data } : null;
    }
    async function previewAction(actionRef) {
      const captured = previewBinding(actionRef); if (!captured || state.previewBusy || mutation) return false;
      const epoch = connectionEpoch, task = captured.snapshot.task;
      publish({ previewBusy: actionRef, error: null });
      try {
        const preview = await call('preview', { taskRef: task.taskRef, actionRef, actionDigest: captured.action.actionDigest, recordRef: captured.data.recordRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
        if (!active || epoch !== connectionEpoch || state.stale || state.detail !== captured.snapshot) return false;
        const description = preview?.description, spec = captured.action.spec;
        const labelText = text => typeof text === 'string' && text.trim() && text.length <= 4096;
        if (!ref(preview.previewRef) || preview.taskRef !== task.taskRef || preview.actionRef !== actionRef || preview.actionDigest !== captured.action.actionDigest || preview.taskVersion !== task.version || preview.authEpoch !== task.authEpoch || !integer(preview.expiresAt) || preview.expiresAt <= clock() || preview.expiresAt > clock() + 60000 || description?.kind !== spec.kind || description.role !== spec.role || !labelText(description.targetLabel) || description.data?.recordRef !== captured.data.recordRef || description.data.digest !== spec.dataDigest || description.data.kind !== captured.data.kind || description.data.content !== captured.data.content || !['provider', 'model', 'reasoning', 'preset'].every(key => labelText(description.model?.[key])) || !Array.isArray(description.toolNames) || description.toolNames.length > 64 || !description.toolNames.every(labelText) || !labelText(description.environment?.label) || !labelText(description.environment.cwd) || description.environment.environmentRef !== spec.executor.environmentRef || description.limits?.units !== spec.units || description.limits.attemptIndex !== spec.attemptIndex || !description.limits.charges || Object.keys(spec.charges).some(key => description.limits.charges[key] !== spec.charges[key]) || Object.keys(description.limits.charges).some(key => !Object.hasOwn(spec.charges, key)) || !ref(description.evidenceRef)) throw new Error('INVALID_RESPONSE');
        const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
        publish({ previews: Object.freeze({ ...state.previews, [actionRef]: frozen(structuredClone(preview)) }) }); return true;
      } catch (error) { if (active && epoch === connectionEpoch && state.detail === captured.snapshot) publish({ error: publicError(error?.message), previews: Object.freeze({}) }); return false; }
      finally { if (active && epoch === connectionEpoch && state.detail === captured.snapshot) publish({ previewBusy: null }); }
    }
    async function grantAction(actionRef, expiresAt) {
      const captured = previewBinding(actionRef), preview = state.previews[actionRef];
      if (mutation || !captured || !preview || preview.expiresAt <= clock() || !integer(expiresAt) || expiresAt <= clock()) return false;
      const epoch = connectionEpoch, task = captured.snapshot.task; mutation = true; publish({ busy: true, error: null });
      try {
        const commandRef = await digest(uuid());
        if (!ref(commandRef) || !active || epoch !== connectionEpoch || state.stale || state.detail !== captured.snapshot || state.previews[actionRef] !== preview || preview.expiresAt <= clock()) throw new Error('PREVIEW_STALE');
        await call('grant', { taskRef: task.taskRef, actionRef, actionDigest: captured.action.actionDigest, previewRef: preview.previewRef, commandRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, expiresAt });
        await refresh(); return true;
      } catch (error) { publish({ error: publicError(error?.message), stale: true, previews: Object.freeze({}) }); return false; }
      finally { mutation = false; publish({ busy: false }); }
    }
    function questions() {
      const batches = new Map();
      for (const record of state.records.filter(value => value.kind === 'clarification')) {
        try {
          const batch = JSON.parse(record.content);
          if (!ref(batch.batchRef) || !['awaiting', 'answered', 'withdrawn'].includes(batch.state) || !integer(batch.sourceAuthEpoch) || !Array.isArray(batch.questions) || !batch.questions.length || batch.questions.length > 16 || !batch.questions.every(q => ref(q.decisionRef) && boundedText(q.question, 8192) && Array.isArray(q.branchRefs) && q.branchRefs.length <= 16 && q.branchRefs.every(ref)) || new Set(batch.questions.map(q => q.decisionRef)).size !== batch.questions.length) continue;
          batches.set(batch.batchRef, copy(batch));
        } catch {}
      }
      return [...batches.values()];
    }
    async function taskMutation(endpoint, value) {
      if (mutation || !active || state.stale || !state.detail || terminal.has(state.detail.task.status)) return false;
      const snapshot = state.detail, task = snapshot.task, epoch = connectionEpoch;
      mutation = true; publish({ busy: true, error: null });
      try {
        const input = copy(value), commandRef = await digest(uuid());
        if (!ref(commandRef) || !active || epoch !== connectionEpoch || state.stale || state.detail !== snapshot) throw new Error('CONNECTION_CHANGED');
        await call(endpoint, { ...input, taskRef: task.taskRef, commandRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
        await refresh(); return true;
      } catch (error) { publish({ error: publicError(error?.message), stale: true }); return false; }
      finally { mutation = false; publish({ busy: false }); }
    }
    function reviseTask(value) {
      if (!value || typeof value !== 'object' || Object.keys(value).some(key => !['goal', 'constraints'].includes(key)) || !Object.keys(value).length || Object.values(value).some(text => !boundedText(text))) return Promise.resolve(false);
      return taskMutation('revise', { ...value, reason: 'operator' });
    }
    function answerBatch(batchRef, answers) {
      const batch = questions().find(value => value.batchRef === batchRef);
      if (!batch || batch.state !== 'awaiting' || batch.sourceAuthEpoch !== state.detail?.task.authEpoch || !Array.isArray(answers) || answers.length !== batch.questions.length || new Set(answers.map(value => value?.decisionRef)).size !== answers.length || !answers.every(value => value && Object.keys(value).length === 2 && ref(value.decisionRef) && batch.questions.some(question => question.decisionRef === value.decisionRef) && boundedText(value.answer, 8192))) return Promise.resolve(false);
      return taskMutation('answer', { batchRef, answers });
    }
    async function openWorker(claimRef) {
      if (mutation || !active || state.stale || !state.detail || typeof navigateSession !== 'function') return false;
      const snapshot = state.detail, task = snapshot.task, epoch = connectionEpoch;
      const worker = snapshot.workers.find(value => value.claimRef === claimRef), action = worker && snapshot.actions.find(value => value.actionRef === worker.actionRef && value.claimRef === claimRef && value.spec?.executor?.generationRef === worker.generationRef);
      if (!worker || !action || ![claimRef, worker.generationRef, worker.sessionRef, action.actionDigest].every(ref) || ['stopped', 'not_created'].includes(worker.phase)) return false;
      const input = { taskRef: task.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, claimRef, generationRef: worker.generationRef, sessionRef: worker.sessionRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch };
      mutation = true; publish({ busy: true, error: null });
      const current = () => active && epoch === connectionEpoch && !state.stale && state.detail === snapshot;
      const checked = link => {
        if (!link || ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'sessionRef'].some(key => link[key] !== input[key]) || link.taskVersion !== task.version || link.authEpoch !== task.authEpoch || typeof link.sessionId !== 'string' || link.sessionId.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(link.sessionId)) throw new Error('WORKER_SESSION_UNAVAILABLE');
        return link;
      };
      try {
        const link = checked(await call('sessionLink', input));
        if (await digest(link.sessionId) !== input.sessionRef || !current()) throw new Error('WORKER_SESSION_UNAVAILABLE');
        // Recheck host liveness after the asynchronous hash, then navigate
        // synchronously through the public existing-session UI service.
        const latest = checked(await call('sessionLink', input));
        if (!current() || latest.sessionId !== link.sessionId) throw new Error('WORKER_SESSION_UNAVAILABLE');
        navigateSession(latest.sessionId); return true;
      } catch (error) { publish({ error: publicError(error?.message) }); return false; }
      finally { mutation = false; publish({ busy: false }); }
    }
    async function inspectAudit(auditRef) {
      if (!active || state.stale || !state.detail?.audits?.some(value => value.auditRef === auditRef)) return false;
      const snapshot = state.detail, task = snapshot.task, epoch = connectionEpoch;
      try {
        const audit = await call('audit', { taskRef: task.taskRef, auditRef });
        const original = snapshot.audits.find(value => value.auditRef === auditRef);
        if (audit?.auditRef !== auditRef || audit.taskRef !== task.taskRef || ['bindingDigest', 'artifactRef', 'artifactVersion', 'digest', 'materialDigest'].some(key => audit[key] !== original[key]) || !Array.isArray(audit.reports) || audit.reports.length > 9 || !audit.reports.every(report => report.taskRef === task.taskRef && report.auditRef === auditRef && ['bindingDigest', 'artifactVersion', 'digest', 'materialDigest'].every(key => report[key] === audit[key]) && ref(report.reportRef) && ref(report.generationRef) && ['passed', 'failed', 'unknown', 'budget_exhausted'].includes(report.verdict) && ['coverageRefs', 'unexaminedRefs'].every(key => Array.isArray(report[key]) && report[key].length <= 16 && report[key].every(ref)) && Array.isArray(report.findings) && report.findings.length <= 16)) throw new Error('INVALID_RESPONSE');
        const latest = await call('status', { taskRef: task.taskRef });
        if (latest?.task?.taskRef !== task.taskRef || latest.task.version !== task.version || latest.task.authEpoch !== task.authEpoch) throw new Error('STALE_VERSION');
        if (!active || epoch !== connectionEpoch || state.stale || state.detail !== snapshot) return false;
        publish({ detail: copy({ ...snapshot, audits: snapshot.audits.map(value => value.auditRef === auditRef ? audit : value) }), previews: Object.freeze({}) }); return true;
      } catch (error) { publish({ error: publicError(error?.message) }); return false; }
    }
    async function loadAutomation() {
      if (!active || state.phase === 'offline' || state.automationBusy) return false;
      const epoch = connectionEpoch; publish({ automationBusy: true, automationStale: true, automationError: null, receipts: [] });
      try {
        const sources = await call('listSources', {}), subscriptions = await call('listSubscriptions', {}), clocks = await call('listSchedulePlans', {});
        if (!Array.isArray(sources) || sources.length > 32 || !sources.every(value => ref(value.sourceRef) && integer(value.revision) && value.revision > 0 && typeof value.spec?.enabled === 'boolean') || !Array.isArray(subscriptions) || subscriptions.length > 128 || !subscriptions.every(value => ref(value.subscriptionRef) && ref(value.sourceRef) && integer(value.revision) && value.revision > 0 && typeof value.spec?.enabled === 'boolean') || !Array.isArray(clocks) || clocks.length > 32 || !clocks.every(value => ref(value.sourceRef) && ref(value.subscriptionRef) && (value.state === 'unavailable' || ref(value.clockRef) && integer(value.sourceRevision) && integer(value.subscriptionRevision) && (value.cursor === null || integer(value.cursor)) && boundedText(value.timezone, 256) && value.registration?.sourceRef === value.sourceRef && value.registration?.subscriptionRef === value.subscriptionRef && boundedText(value.registration.goal) && typeof value.registration.externalEffect === 'boolean' && (value.pendingVerification === null || ref(value.pendingVerification?.planDigest) && integer(value.pendingVerification.through) && typeof value.pendingVerification.approved === 'boolean')))) throw new Error('INVALID_RESPONSE');
        if (!active || epoch !== connectionEpoch) return false;
        publish({ automation: copy({ sources, subscriptions, clocks }), automationStale: false }); return true;
      } catch (error) { if (active && epoch === connectionEpoch) publish({ automationError: publicError(error?.message) }); return false; }
      finally { if (active && epoch === connectionEpoch) publish({ automationBusy: false }); }
    }
    async function automationMutation(endpoint, input) {
      if (mutation || !active || state.phase === 'offline' || state.automationStale || !state.automation) return false;
      const captured = state.automation, epoch = connectionEpoch; mutation = true; publish({ busy: true, automationError: null });
      try {
        const value = copy(input), commandRef = await digest(uuid());
        if (!ref(commandRef) || !active || epoch !== connectionEpoch || state.automationStale || state.automation !== captured) throw new Error('CONNECTION_CHANGED');
        await call(endpoint, { ...value, commandRef }); await loadAutomation(); return true;
      } catch (error) { publish({ automationError: publicError(error?.message), automationStale: true }); return false; }
      finally { mutation = false; publish({ busy: false }); }
    }
    function enableSource(sourceRef, enabled) {
      const source = state.automation?.sources.find(value => value.sourceRef === sourceRef);
      if (!source || typeof enabled !== 'boolean' || source.spec.enabled === enabled) return Promise.resolve(false);
      return automationMutation('configureSource', { sourceRef, expectedRevision: source.revision, spec: { ...source.spec, enabled } });
    }
    function enableSubscription(subscriptionRef, enabled) {
      const subscription = state.automation?.subscriptions.find(value => value.subscriptionRef === subscriptionRef), source = subscription && state.automation.sources.find(value => value.sourceRef === subscription.sourceRef);
      if (!source || typeof enabled !== 'boolean' || subscription.spec.enabled === enabled) return Promise.resolve(false);
      return automationMutation('configureSubscription', { subscriptionRef, sourceRef: source.sourceRef, expectedRevision: subscription.revision, expectedSourceRevision: source.revision, spec: { ...subscription.spec, enabled } });
    }
    function approveSchedule(clockRef) {
      const plan = state.automation?.clocks.find(value => value.clockRef === clockRef), source = plan && state.automation.sources.find(value => value.sourceRef === plan.sourceRef), subscription = plan && state.automation.subscriptions.find(value => value.subscriptionRef === plan.subscriptionRef);
      if (!plan || !source?.spec.enabled || !subscription?.spec.enabled || subscription.sourceRef !== plan.sourceRef || source.revision !== plan.sourceRevision || subscription.revision !== plan.subscriptionRevision || !plan.pendingVerification || plan.pendingVerification.approved) return Promise.resolve(false);
      return automationMutation('approveSchedule', { sourceRef: plan.sourceRef, subscriptionRef: plan.subscriptionRef, expectedSourceRevision: plan.sourceRevision, expectedSubscriptionRevision: plan.subscriptionRevision, clockRef, expectedCursor: plan.cursor, planDigest: plan.pendingVerification.planDigest });
    }
    async function loadReceipts(subscriptionRef) {
      const captured = state.automation, subscription = captured?.subscriptions.find(value => value.subscriptionRef === subscriptionRef), epoch = connectionEpoch;
      if (!active || state.automationStale || !subscription) return false;
      try {
        const receipts = await call('listEventReceipts', { sourceRef: subscription.sourceRef, subscriptionRef });
        if (!Array.isArray(receipts) || receipts.length > 4096 || !receipts.every(value => value.sourceRef === subscription.sourceRef && value.subscriptionRef === subscriptionRef && ref(value.eventRef) && ref(value.taskRef))) throw new Error('INVALID_RESPONSE');
        if (!active || epoch !== connectionEpoch || state.automationStale || state.automation !== captured) return false;
        publish({ receipts: copy(receipts) }); return true;
      } catch (error) { publish({ automationError: publicError(error?.message) }); return false; }
    }
    return Object.freeze({
      getSnapshot: () => state,
      subscribe(listener) { if (!active || typeof listener !== 'function' || listeners.size >= 256) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
      refresh, select, control, intake, previewAction, grantAction, reviseTask, answerBatch, questions, openWorker, inspectAudit, loadAutomation, enableSource, enableSubscription, approveSchedule, loadReceipts, canNavigate: typeof navigateSession === 'function', now: clock,
      disconnected() { connectionEpoch++; revision++; detailRevision++; for (const controller of controllers) controller.abort(); publish({ phase: 'offline', stale: true, automationStale: true, automationBusy: false, error: null, previews: Object.freeze({}), previewBusy: null }); },
      dispose() { active = false; revision++; detailRevision++; for (const controller of controllers) controller.abort(); controllers.clear(); listeners.clear(); },
    });
  }

  function plainRpcReply(value) {
    const ancestors = new Set();
    // Endpoint validators retain their existing size and semantic limits.
    function inspect(current) {
      if (current === null || typeof current === 'string' || typeof current === 'boolean' || (typeof current === 'number' && Number.isFinite(current))) return;
      if (!current || typeof current !== 'object' || ancestors.has(current)) throw new Error('INVALID_RESPONSE');
      const array = Array.isArray(current), prototype = Object.getPrototypeOf(current);
      if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) throw new Error('INVALID_RESPONSE');
      const fields = Object.getOwnPropertyDescriptors(current), keys = Reflect.ownKeys(fields);
      if (keys.some(key => typeof key !== 'string' || !Object.hasOwn(fields[key], 'value') || (array && key === 'length' ? fields[key].enumerable : !fields[key].enumerable))) throw new Error('INVALID_RESPONSE');
      if (array && (!integer(fields.length?.value) || keys.length !== fields.length.value + 1 || keys.some(key => key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= fields.length.value)))) throw new Error('INVALID_RESPONSE');
      ancestors.add(current);
      for (const key of keys) if (!array || key !== 'length') inspect(fields[key].value);
      ancestors.delete(current);
    }
    try { inspect(value); return structuredClone(value); }
    catch { throw new Error('INVALID_RESPONSE'); }
  }

  const setupCodes = new Set(['SETUP_REQUIRED', 'SETUP_RECOVERY_REQUIRED', 'SETUP_UNAVAILABLE', 'SETUP_PREVIEW_STALE', 'SETUP_CONFIRMATION_REQUIRED', 'SETUP_INVALID_INPUT', 'REQUEST_ABORTED', 'OPERATOR_REQUIRED', 'SERVICE_DISPOSED', 'INVALID_RESPONSE', 'RESULT_UNCONFIRMED', 'CONNECTION_CHANGED']);
  const setupError = code => setupCodes.has(code) ? code : 'RESULT_UNCONFIRMED';
  function setupFailure(failure) { try { const field = Object.getOwnPropertyDescriptor(failure, 'message'); return field && Object.hasOwn(field, 'value') && typeof field.value === 'string' ? field.value : 'RESULT_UNCONFIRMED'; } catch { return 'RESULT_UNCONFIRMED'; } }
  const setupMissingRoutes = new Set(['transport failure for /df-setup/v1/status: HTTP 404', 'transport failure for /df-setup/v1/status: HTTP 405']);
  const emptySetupSnapshot = () => null;
  const emptySetupSubscribe = () => () => {};
  function setupObject(value, keys, required = keys) {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('INVALID_RESPONSE');
    const fields = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(fields);
    if (names.some(key => typeof key !== 'string' || !keys.includes(key) || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')) || required.some(key => !Object.hasOwn(fields, key))) throw new Error('INVALID_RESPONSE');
    return Object.fromEntries(names.map(key => [key, fields[key].value]));
  }
  function setupLocation(value) {
    return typeof value === 'string' && value.startsWith('/') && new TextEncoder().encode(value).length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value) && !Array.from(value).some(character => character.length === 1 && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff);
  }
  function setupStatus(value) {
    const status = setupObject(value, ['phase', 'executionEnabled', 'storage', 'reasonCode'], ['phase', 'executionEnabled', 'storage']);
    const storage = setupObject(status.storage, ['location']);
    if (!['setup_required', 'ready', 'recovery_required', 'unavailable'].includes(status.phase) || status.executionEnabled !== false || !setupLocation(storage.location) || (status.reasonCode !== undefined && !setupCodes.has(status.reasonCode))) throw new Error('INVALID_RESPONSE');
    return freeze({ phase: status.phase, executionEnabled: false, storage: { location: storage.location }, ...(status.reasonCode === undefined ? {} : { reasonCode: status.reasonCode }) });
  }
  const workerCodes = new Set(['WORKER_DISABLED','WORKER_NOT_CONFIGURED','WORKER_POLICY_REQUIRED','WORKER_POLICY_STALE','WORKER_PREVIEW_STALE','WORKER_CONFIRMATION_REQUIRED','WORKER_CATALOG_UNAVAILABLE','WORKER_PRESET_UNAVAILABLE','WORKER_PERSISTENCE_UNSUPPORTED','WORKER_SOURCE_UNAVAILABLE','WORKER_REQUEST_DENIED','WORKER_FINISH_UNAVAILABLE','WORKER_RESULT_UNAVAILABLE','WORKER_SESSION_UNAVAILABLE','COST_UNKNOWN','PREVIEW_CAPACITY','REQUEST_ABORTED',...setupCodes,...errorCodes]);
  const workerError = value => workerCodes.has(value) ? value : 'RESULT_UNCONFIRMED';
  const workerRecord = (value, keys) => setupObject(value, keys);
  function workerTask(value) {
    const row=workerRecord(value,['ownerRef','workspaceRef','taskRef','status','version','taskVersion','authEpoch','createdAt','updatedAt']);
    const task=safeTask(row);if(!ref(row.ownerRef)||!ref(row.workspaceRef)||row.taskVersion!==task.version||!integer(row.createdAt))throw new Error('INVALID_RESPONSE');return task;
  }
  function workerSelection(value) {
    const row = workerRecord(value,['provider','model','agentPreset','reasoningEffort','maxOutputTokens']);
    if (!boundedText(row.provider,128)||!boundedText(row.model,256)||!boundedText(row.agentPreset,128)||row.reasoningEffort!==null&&!boundedText(row.reasoningEffort,128)||!integer(row.maxOutputTokens)||row.maxOutputTokens<128||row.maxOutputTokens>4096) throw new Error('INVALID_RESPONSE');return row;
  }
  function workerStatus(value) {
    const row = workerRecord(value,['enabled','phase','reasonCode','configurationRef','policyVersion','selection','environment','persistence','bounds','accounting','pricing','actionsEnabled']);
    if (typeof row.enabled!=='boolean'||typeof row.actionsEnabled!=='boolean'||!['disabled','setup_required','needs_refresh','needs_policy','ready','unavailable'].includes(row.phase)||row.reasonCode!==null&&!workerCodes.has(row.reasonCode)||row.configurationRef!==null&&!ref(row.configurationRef)||row.policyVersion!==null&&(!integer(row.policyVersion)||row.policyVersion<1)||!['source_zero','unknown'].includes(row.pricing)||row.accounting!==null&&row.accounting!=='df-testing-utf8-byte-units/v1') throw new Error('INVALID_RESPONSE');
    if (!row.enabled) {if(row.phase!=='disabled'||row.actionsEnabled||['reasonCode','configurationRef','policyVersion','selection','environment','persistence','bounds','accounting'].some(key=>row[key]!==null)||row.pricing!=='unknown')throw new Error('INVALID_RESPONSE');return freeze(row);}
    row.selection=workerSelection(row.selection);row.environment=workerRecord(row.environment,['root','cwd']);row.persistence=workerRecord(row.persistence,['directory','compression','retention','encrypted']);row.bounds=workerRecord(row.bounds,['requestBytes','resultBytes']);
    if(!setupLocation(row.environment.root)||!setupLocation(row.environment.cwd)||!setupLocation(row.persistence.directory)||!['none','zstd'].includes(row.persistence.compression)||row.persistence.retention!=='owner-managed'||row.persistence.encrypted!==false||!integer(row.bounds.requestBytes)||row.bounds.requestBytes<512||row.bounds.requestBytes>131072||!integer(row.bounds.resultBytes)||row.bounds.resultBytes<128||row.bounds.resultBytes>16384||row.actionsEnabled&&(row.phase!=='ready'||row.pricing!=='source_zero'||row.accounting===null||row.policyVersion===null))throw new Error('INVALID_RESPONSE');return freeze(row);
  }
  function normalWorker(value) {
    const row=workerRecord(value,['taskRef','actionRef','actionDigest','claimRef','reservationRef','generationRef','sessionRef','phase']);
    if(!['taskRef','actionRef','actionDigest','claimRef','reservationRef','generationRef'].every(key=>ref(row[key]))||row.sessionRef!==null&&!ref(row.sessionRef)||!['created','ready','running','unknown','cancel_requested','stopped','not_created'].includes(row.phase))throw new Error('INVALID_RESPONSE');return freeze(row);
  }
  function createWorkerModel(rpc, taskModel, {clock=Date.now,uuid=()=>crypto.randomUUID(),digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('')}={}) {
    let active=true,epoch=0,revision=0,lastNow=null,ownRefresh=false;
    let state=freeze({phase:'needs_refresh',status:null,catalog:null,policyPreview:null,policyAccepted:false,actionPreview:null,actionAccepted:false,grant:null,confirmedPolicy:null,uncertain:null,action:null,worker:null,execution:null,capture:null,result:null,contextRecordRef:null,taskRef:null,busy:null,stale:true,error:null});
    const listeners=new Set(),controllers=new Set();
    function publish(update){if(!active)return;state=freeze({...state,...update});for(const listener of [...listeners])listener();}
    const now=()=>{let at;try{at=clock();}catch{return NaN;}if(!integer(at)||lastNow!==null&&at<lastNow)return NaN;lastNow=at;return at;};
    function invalidate(){revision++;for(const controller of controllers)controller.abort();publish({policyPreview:null,policyAccepted:false,actionPreview:null,actionAccepted:false,grant:null});}
    function task(allowBlocked=false){const snapshot=taskModel.getSnapshot();if(snapshot.stale||!snapshot.detail?.task||!allowBlocked&&(terminal.has(snapshot.detail.task.status)||['cancel_requested','recovery_required'].includes(snapshot.detail.task.status)))throw new Error('STALE_VERSION');return safeTask(snapshot.detail.task);}
    let selectedKey=null;
    const unsubscribe=taskModel.subscribe(()=>{const s=taskModel.getSnapshot(),t=s.detail?.task,key=t?`${t.taskRef}:${t.version}:${t.authEpoch}`:null;if(key!==selectedKey){const prior=selectedKey;selectedKey=key;if(!ownRefresh){invalidate();publish({busy:null,stale:true});}if(t&&state.taskRef&&t.taskRef!==state.taskRef)publish({taskRef:t?.taskRef??null,contextRecordRef:null,action:null,worker:null,execution:null,capture:null,result:null});}});
    async function call(channel,name,payload){const currentEpoch=epoch,controller=new AbortController();controllers.add(controller);try{const response=await rpc.call(channel,`v1/${name}`,payload,controller.signal);if(!active||epoch!==currentEpoch||controller.signal.aborted)throw new Error('CONNECTION_CHANGED');const envelope=setupObject(plainRpcReply(response),['ok','value','error'],['ok']);if(envelope.ok===false&&!Object.hasOwn(envelope,'value')){const error=setupObject(envelope.error,['code','message','details'],['code']);throw new Error(workerError(error.code));}if(envelope.ok!==true||!Object.hasOwn(envelope,'value')||Object.hasOwn(envelope,'error'))throw new Error('INVALID_RESPONSE');return envelope.value;}catch(error){throw new Error(workerError(setupFailure(error)));}finally{controllers.delete(controller);}}
    async function cached(){const value=workerStatus(await call('/df-setup','workerStatus',{}));publish({status:value,phase:value.phase,stale:false});return value;}
    async function refresh(){if(!active||state.busy)return false;invalidate();const read=revision;publish({busy:'status',stale:true,error:null});try{const value=workerStatus(await call('/df-setup','workerStatus',{}));if(read!==revision)return false;publish({status:value,phase:value.phase,stale:false});return true;}catch(error){if(read===revision)publish({phase:'unavailable',error:workerError(setupFailure(error)),stale:true});return false;}finally{if(read===revision)publish({busy:null});}}
    async function run(name,build,project,{mutation=false,requiresTask=false,allowBlocked=false}={}){
      if(!active||state.busy||state.phase==='offline')return false;let bound=null;try{bound=requiresTask?task(allowBlocked):null;}catch(error){publish({error:workerError(setupFailure(error))});return false;}const read=++revision,currentEpoch=epoch;publish({busy:name,error:null,policyAccepted:false,actionAccepted:false});
      try{let commandRef;if(mutation){commandRef=await digest(uuid());if(!ref(commandRef))throw new Error('INVALID_COMMAND');}if(!active||read!==revision||currentEpoch!==epoch)throw new Error('CONNECTION_CHANGED');const payload=build(bound,commandRef);const value=await call('/df-rpc',name,payload);if(read!==revision||currentEpoch!==epoch)return false;const update=project(value,bound);publish({...update,stale:false});if(mutation&&requiresTask){ownRefresh=true;try{await taskModel.refresh();}finally{ownRefresh=false;}}return true;
      }catch(error){if(active&&read===revision){publish({error:workerError(setupFailure(error)),stale:true,policyPreview:null,policyAccepted:false,actionPreview:null,actionAccepted:false,grant:null,uncertain:mutation?name:state.uncertain});if(mutation){ownRefresh=true;try{await taskModel.refresh();}finally{ownRefresh=false;}try{await cached();}catch{publish({phase:'unavailable',stale:true});}}}return false;}finally{if(active&&read===revision)publish({busy:null});}
    }
    const cas=(t,commandRef)=>({taskRef:t.taskRef,commandRef,expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch});
    const expiry=preview=>preview&&integer(now())&&now()>=preview.preparedAt&&now()<preview.expiresAt;
    function policyDescription(value){const row=setupObject(value,['selection','effectiveReasoningEffort','environment','persistence','bounds','limits','charges','accounting','pricing','grantTtlMs','systemPrompt','auditRoles','continuation','aggregateTotal'],['selection','effectiveReasoningEffort','environment','persistence','bounds','limits','charges','accounting','pricing','grantTtlMs','systemPrompt']);workerSelection(row.selection);if(row.effectiveReasoningEffort!==null&&!boundedText(row.effectiveReasoningEffort,128))throw new Error('INVALID_RESPONSE');workerStatus({enabled:true,phase:'needs_policy',reasonCode:null,configurationRef:null,policyVersion:null,selection:row.selection,environment:row.environment,persistence:row.persistence,bounds:row.bounds,accounting:row.accounting,pricing:row.pricing,actionsEnabled:false});const normalPolicy=Object.hasOwn(row,'continuation')||Object.hasOwn(row,'aggregateTotal');if(normalPolicy&&(!Object.hasOwn(row,'continuation')||!Object.hasOwn(row,'aggregateTotal')||!integer(row.aggregateTotal)||row.aggregateTotal<1||row.aggregateTotal>32||row.aggregateTotal!==row.limits?.maxTotalAttempts))throw new Error('INVALID_RESPONSE');
      workerRecord(row.limits,normalPolicy?['queueCapacity','maxActive','maxAttempts','maxTotalAttempts','maxTasks','maxActionsPerTask','maxEventsPerTask','maxMetadataBytes','maxDataBytes','maxRecordsPerTask','maxCommands','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros','maxControlCommands']:['queueCapacity','maxActive','maxAttempts','maxTotalAttempts','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros']);
      if(normalPolicy&&Object.entries(row.limits).some(([k,v])=>!integer(v)||v>(k==='maxRuntimeMs'?Number.MAX_SAFE_INTEGER:100000000)||!['queueCapacity','maxActive','maxAttempts','maxTotalAttempts','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros'].includes(k)&&v<(k==='maxMetadataBytes'?256:1)))throw new Error('INVALID_RESPONSE');
      if(normalPolicy&&row.continuation!==null){const c=setupObject(row.continuation,['enabled','maxContinuations','maxTotalAttempts','history']),h=setupObject(c.history,['maxEvents','maxMessages','maxBytes']);if(c.enabled!==true||!integer(c.maxContinuations)||c.maxContinuations<1||c.maxContinuations>8||c.maxTotalAttempts!==row.aggregateTotal||!integer(h.maxEvents)||h.maxEvents<1||h.maxEvents>96||!integer(h.maxMessages)||h.maxMessages<3||h.maxMessages>17||!integer(h.maxBytes)||h.maxBytes<256||h.maxBytes>49152||row.aggregateTotal<1+c.maxContinuations+(row.auditRoles===undefined?0:1))throw new Error('INVALID_RESPONSE');} workerRecord(row.charges,['runtimeMs','usageUnits','costState','costEstimateMicros','costProvenanceRef']);if(!Object.values(row.limits).every(integer)||row.limits.maxActive!==1||row.limits.maxAttempts!==1||(!normalPolicy&&(row.auditRoles===undefined?row.limits.maxTotalAttempts!==1:row.limits.maxTotalAttempts<2||row.limits.maxTotalAttempts>32))||!integer(row.charges.runtimeMs)||!integer(row.charges.usageUnits)||!['estimated','unknown'].includes(row.charges.costState)||row.charges.costState==='estimated'&&(!integer(row.charges.costEstimateMicros)||!ref(row.charges.costProvenanceRef))||row.charges.costState==='unknown'&&(row.charges.costEstimateMicros!==null||row.charges.costProvenanceRef!==null)||!integer(row.grantTtlMs)||row.grantTtlMs<1||row.grantTtlMs>60000||row.systemPrompt!=='You are a dsh-fishball worker. Use only the approved task context supplied in this turn. Tools and external actions are unavailable.')throw new Error('INVALID_RESPONSE');if(row.auditRoles!==undefined){setupObject(row.auditRoles,['review','repair'],['review']);for(const[role,value]of Object.entries(row.auditRoles)){workerRecord(value,['selection','charges','systemPrompt','accounting','pricing','nativeSourceRef','catalogEvidenceRef','recipe','maxOutputTokens']);workerSelection(value.selection);if(value.selection.provider!=='df-testing-local'||value.selection.model!==`df-testing-${role}-v1`||!ref(value.nativeSourceRef)||!ref(value.catalogEvidenceRef)||value.pricing!=='source_zero'||!boundedText(value.systemPrompt,512)||!boundedText(value.recipe,512)||value.maxOutputTokens!==value.selection.maxOutputTokens)throw new Error('INVALID_RESPONSE');}}return freeze(row);}
    const policyFresh=()=>!state.busy&&!state.stale&&expiry(state.policyPreview);
    const actionFresh=()=>!state.busy&&!state.stale&&expiry(state.actionPreview)&&state.actionPreview?.taskVersion===taskModel.getSnapshot().detail?.task.version&&state.actionPreview?.authEpoch===taskModel.getSnapshot().detail?.task.authEpoch;
    function mappedWorker(t){if(state.worker?.taskRef===t.taskRef)return state.worker;const rows=taskModel.getSnapshot().detail?.workers;if(!state.action||!Array.isArray(rows))throw new Error('WORKER_SESSION_UNAVAILABLE');const matching=rows.filter(row=>row.actionRef===state.action.actionRef&&row.actionDigest===state.action.actionDigest);if(matching.length!==1)throw new Error('WORKER_SESSION_UNAVAILABLE');const row=matching[0];return normalWorker({taskRef:t.taskRef,...Object.fromEntries(['actionRef','actionDigest','claimRef','reservationRef','generationRef'].map(key=>[key,row[key]])),sessionRef:row.sessionRef??null,phase:['intent','submitted'].includes(row.phase)?'unknown':row.phase});}
    function mapping(t){const w=mappedWorker(t);return{taskRef:t.taskRef,actionRef:w.actionRef,claimRef:w.claimRef,generationRef:w.generationRef};}
    return Object.freeze({getSnapshot:()=>state,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},now,refresh,
      adoptResumedMapping(value){
        if(!active||state.busy||state.phase==='offline'||state.uncertain)return false;
        try{setupObject(value,['worker','contextRecordRef']);const t=task(),detail=taskModel.getSnapshot().detail,w=normalWorker(value.worker);
          if(!ref(value.contextRecordRef)||w.taskRef!==t.taskRef||!['created','ready'].includes(w.phase))return false;
          const actions=detail.actions.filter(a=>a.actionRef===w.actionRef&&a.actionDigest===w.actionDigest&&a.claimRef===w.claimRef&&a.spec.executor.mode==='resume'&&a.spec.resumeBinding&&a.spec.role==='worker'&&a.spec.executor.generationRef===w.generationRef&&a.spec.executor.sessionRef===w.sessionRef);
          const workers=detail.workers.filter(r=>['actionRef','actionDigest','claimRef','generationRef','sessionRef','reservationRef'].every(k=>r[k]===w[k]));
          const data=detail.data.filter(r=>r.recordRef===value.contextRecordRef&&r.kind==='context'&&r.digest===actions[0]?.spec.dataDigest);
          if(actions.length!==1||workers.length!==1||data.length!==1)return false;
          invalidate();publish({taskRef:t.taskRef,contextRecordRef:value.contextRecordRef,action:{actionRef:w.actionRef,actionDigest:w.actionDigest,taskVersion:t.version,authEpoch:t.authEpoch},worker:w,execution:null,capture:null,result:null,grant:null,actionPreview:null,actionAccepted:false,stale:false,error:null});return true;
        }catch{return false;}
      },
      catalog:()=>run('workerCatalog',()=>({}),value=>{const row=workerRecord(value,['status','providers','models','presets']);const status=workerStatus(row.status);if(!Array.isArray(row.providers)||row.providers.length>32||!Array.isArray(row.models)||row.models.length>64||!Array.isArray(row.presets)||row.presets.length>128)throw new Error('INVALID_RESPONSE');for(const p of row.providers){workerRecord(p,['id','name']);if(!boundedText(p.id,128)||!boundedText(p.name,512))throw new Error('INVALID_RESPONSE');}for(const m of row.models){workerRecord(m,['provider','id','name','reasoningEfforts','defaultEffort','maxOutputTokens','contextUnits']);if(!boundedText(m.provider,128)||!boundedText(m.id,256)||!boundedText(m.name,512)||!Array.isArray(m.reasoningEfforts)||m.reasoningEfforts.length>16||m.defaultEffort!==null&&!boundedText(m.defaultEffort,128)||[m.maxOutputTokens,m.contextUnits].some(n=>n!==null&&(!integer(n)||n<1)))throw new Error('INVALID_RESPONSE');for(const e of m.reasoningEfforts){workerRecord(e,['id','name']);if(!boundedText(e.id,128)||!boundedText(e.name,512))throw new Error('INVALID_RESPONSE');}}for(const p of row.presets){workerRecord(p,['id','name','available']);if(!boundedText(p.id,128)||!boundedText(p.name,512)||typeof p.available!=='boolean')throw new Error('INVALID_RESPONSE');}return{catalog:row,status,phase:status.phase,policyPreview:null,actionPreview:null};}),
      previewPolicy(expectedPolicyVersion){if(!integer(expectedPolicyVersion)||expectedPolicyVersion<1)return Promise.resolve(false);const preparedAt=now();return run('workerPolicyPreview',()=>({expectedPolicyVersion}),value=>{const row=workerRecord(value,['previewRef','planDigest','expiresAt','expectedPolicyVersion','description']);if(!ref(row.previewRef)||!ref(row.planDigest)||row.expectedPolicyVersion!==expectedPolicyVersion||!integer(preparedAt)||!integer(row.expiresAt)||row.expiresAt<=now()||row.expiresAt>now()+60000)throw new Error('INVALID_RESPONSE');return{policyPreview:{...row,description:policyDescription(row.description),preparedAt},policyAccepted:false};});},
      setPolicyAccepted(value,previewRef=state.policyPreview?.previewRef,planDigest=state.policyPreview?.planDigest){const accepted=value===true&&policyFresh()&&previewRef===state.policyPreview.previewRef&&planDigest===state.policyPreview.planDigest;publish({policyAccepted:accepted});return accepted;},
      canConfirmPolicy:()=>Boolean(policyFresh()&&state.policyAccepted),
      confirmPolicy(previewRef=state.policyPreview?.previewRef,planDigest=state.policyPreview?.planDigest){if(!policyFresh()||!state.policyAccepted||previewRef!==state.policyPreview.previewRef||planDigest!==state.policyPreview.planDigest)return Promise.resolve(false);const prior=state.policyPreview;publish({policyPreview:null,policyAccepted:false});return run('workerPolicyConfirm',(t,commandRef)=>({previewRef:prior.previewRef,planDigest:prior.planDigest,commandRef,expectedPolicyVersion:prior.expectedPolicyVersion,accept:true}),value=>{const row=workerRecord(value,['policyVersion','configurationRef','status']),status=workerStatus(row.status);if(!integer(row.policyVersion)||row.policyVersion<1||!ref(row.configurationRef)||row.policyVersion!==status.policyVersion||row.configurationRef!==status.configurationRef)throw new Error('INVALID_RESPONSE');return{status,phase:status.phase,confirmedPolicy:prior.description,uncertain:null};},{mutation:true});},
      prepareContext:()=>run('prepareContext',(t,commandRef)=>({...cas(t,commandRef),terms:[],now:now()}),(value,t)=>{const row=workerRecord(value,['recordRef','digest','kind','byteLength','cryptoVersion','sourceRef','task','sourceTaskVersion','sourceAuthEpoch','memory','inputCounts','retainedRefs','droppedRefs','verification']),memory=workerRecord(row.memory,['namespaceRef','revision']),counts=workerRecord(row.inputCounts,['bytes','tokens']),received=workerTask(row.task);if(!ref(row.recordRef)||!ref(row.digest)||!ref(row.sourceRef)||row.kind!=='context'||!integer(row.byteLength)||row.byteLength>65536||row.cryptoVersion!==2||received.taskRef!==t.taskRef||received.version!==t.version+1||received.authEpoch!==t.authEpoch||row.sourceTaskVersion!==t.version||row.sourceAuthEpoch!==t.authEpoch||!ref(memory.namespaceRef)||!integer(memory.revision)||!integer(counts.bytes)||!integer(counts.tokens)||![row.retainedRefs,row.droppedRefs].every(list=>Array.isArray(list)&&list.length<=128&&list.every(ref))||row.verification!=='module_prepared_execution_context_only')throw new Error('INVALID_RESPONSE');return{taskRef:t.taskRef,contextRecordRef:row.recordRef,grant:null,uncertain:null,action:null,worker:null,execution:null,capture:null,result:null};},{mutation:true,requiresTask:true}),
      plan:()=>run('workerPlan',(t,commandRef)=>{if(!ref(state.contextRecordRef))throw new Error('WORKER_CONTEXT_INVALID');return{...cas(t,commandRef),contextRecordRef:state.contextRecordRef};},(value,t)=>{workerRecord(value,['actionRef','actionDigest','taskVersion','authEpoch']);if(!ref(value.actionRef)||!ref(value.actionDigest)||value.taskVersion!==t.version||value.authEpoch!==t.authEpoch)throw new Error('INVALID_RESPONSE');return{taskRef:t.taskRef,action:value,actionPreview:null,grant:null,uncertain:null,worker:null,execution:null,capture:null,result:null};},{mutation:true,requiresTask:true}),
      previewAction(){const preparedAt=now();return run('workerPreview',t=>{if(!state.action)throw new Error('WORKER_MAPPING_MISMATCH');return{taskRef:t.taskRef,actionRef:state.action.actionRef,actionDigest:state.action.actionDigest,recordRef:state.contextRecordRef,expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch};},(value,t)=>{const row=workerRecord(value,['previewRef','taskRef','actionRef','actionDigest','taskVersion','authEpoch','expiresAt','description']),d=workerRecord(row.description,['kind','role','targetLabel','data','model','toolNames','environment','limits','evidenceRef']);workerRecord(d.data,['recordRef','digest','kind','content']);workerRecord(d.model,['provider','model','reasoning','preset']);workerRecord(d.environment,['label','cwd','environmentRef']);workerRecord(d.limits,['units','attemptIndex','charges']);setupObject(d.limits.charges,['runtimeMs','usageUnits','costEstimateMicros','costState','costProvenanceRef'],['runtimeMs','usageUnits']);if(!ref(row.previewRef)||row.taskRef!==t.taskRef||row.actionRef!==state.action.actionRef||row.actionDigest!==state.action.actionDigest||row.taskVersion!==t.version||row.authEpoch!==t.authEpoch||!integer(row.expiresAt)||row.expiresAt<=now()||row.expiresAt>now()+60000||d.kind!=='write'||d.role!=='worker'||!boundedText(d.targetLabel,4096)||!ref(d.data.recordRef)||d.data.recordRef!==state.contextRecordRef||!ref(d.data.digest)||d.data.kind!=='context'||!boundedText(d.data.content)||!Object.values(d.model).every(v=>boundedText(v,4096))||!Array.isArray(d.toolNames)||d.toolNames.length!==0||!boundedText(d.environment.label,4096)||!setupLocation(d.environment.cwd)||!ref(d.environment.environmentRef)||d.limits.units!==1||d.limits.attemptIndex!==1||!ref(d.evidenceRef))throw new Error('INVALID_RESPONSE');return{actionPreview:{...row,preparedAt},actionAccepted:false};},{requiresTask:true});},
      setActionAccepted(value,previewRef=state.actionPreview?.previewRef){const accepted=value===true&&actionFresh()&&previewRef===state.actionPreview.previewRef;publish({actionAccepted:accepted});return accepted;},
      canGrant:()=>Boolean(actionFresh()&&state.actionAccepted),
      canCreate:()=>Boolean(!state.busy&&!state.stale&&state.status?.actionsEnabled&&state.action&&state.grant&&state.grant.actionRef===state.action.actionRef&&state.grant.actionDigest===state.action.actionDigest&&state.grant.authEpoch===taskModel.getSnapshot().detail?.task.authEpoch&&integer(now())&&now()<state.grant.expiresAt&&!state.worker&&state.uncertain!=='workerCreate'),
      grant(expiresAt,previewRef=state.actionPreview?.previewRef){if(!actionFresh()||!state.actionAccepted||previewRef!==state.actionPreview.previewRef||!integer(expiresAt)||expiresAt<=now()||!state.status||expiresAt>now()+(state.confirmedPolicy?.grantTtlMs??60000))return Promise.resolve(false);const prior=state.actionPreview;publish({actionPreview:null,actionAccepted:false});return run('workerGrant',(t,commandRef)=>({...cas(t,commandRef),actionRef:prior.actionRef,actionDigest:prior.actionDigest,expiresAt,previewRef:prior.previewRef,accept:true}),(value,t)=>{workerRecord(value,['task','taskVersion','authEpoch','actionRef','actionDigest','expiresAt']);const received=workerTask(value.task);if(value.actionDigest!==prior.actionDigest||value.actionRef!==prior.actionRef||value.taskVersion!==t.version||value.authEpoch!==t.authEpoch+1||value.expiresAt!==expiresAt||received.taskRef!==t.taskRef||received.version!==t.version||received.authEpoch!==value.authEpoch)throw new Error('INVALID_RESPONSE');return{grant:value,uncertain:null};},{mutation:true,requiresTask:true});},
      create(){if(!this.canCreate())return Promise.resolve(false);return run('workerCreate',(t,commandRef)=>{if(!state.action)throw new Error('WORKER_MAPPING_MISMATCH');return{...cas(t,commandRef),actionRef:state.action.actionRef,actionDigest:state.action.actionDigest};},(value,t)=>{const row=workerRecord(value,['task','worker']),worker=normalWorker(row.worker);if(workerTask(row.task).taskRef!==t.taskRef||worker.taskRef!==t.taskRef||worker.actionRef!==state.action.actionRef||worker.actionDigest!==state.action.actionDigest)throw new Error('INVALID_RESPONSE');return{worker,uncertain:null};},{mutation:true,requiresTask:true});},
      execute(){if(state.worker?.phase!=='ready'||state.execution||state.uncertain==='workerExecute')return Promise.resolve(false);return run('workerExecute',(t,commandRef)=>({...cas(t,commandRef),...mapping(t),actionDigest:state.worker.actionDigest,contextRecordRef:state.contextRecordRef}),(value,t)=>{const row=workerRecord(value,['task','execution','worker']),execution=workerRecord(row.execution,['executionRef','state','cursor','resultDigest','usage']),usage=workerRecord(execution.usage,['state','units','accounting']);const worker=normalWorker(row.worker);if(workerTask(row.task).taskRef!==t.taskRef||worker.taskRef!==t.taskRef||['actionRef','actionDigest','claimRef','generationRef','reservationRef','sessionRef'].some(key=>worker[key]!==state.worker[key]))throw new Error('INVALID_RESPONSE');if(!ref(execution.executionRef)||!['committed','unknown'].includes(execution.state)||!['actual','unknown'].includes(usage.state)||execution.state==='committed'&&(!integer(execution.cursor)||!ref(execution.resultDigest)||usage.state!=='actual'||!integer(usage.units)||usage.accounting!=='df-testing-utf8-byte-units/v1')||execution.state==='unknown'&&(execution.cursor!==null||execution.resultDigest!==null||usage.state!=='unknown'||usage.units!==null||usage.accounting!==null))throw new Error('INVALID_RESPONSE');return{worker,execution,uncertain:null};},{mutation:true,requiresTask:true});},
      query:()=>run('workerQuery',t=>mapping(t),(value,t)=>{const row=workerRecord(value,['task','worker']),worker=normalWorker(row.worker),expected=mappedWorker(t);if(workerTask(row.task).taskRef!==t.taskRef||worker.taskRef!==t.taskRef||['actionRef','actionDigest','claimRef','generationRef','reservationRef','sessionRef'].some(key=>worker[key]!==expected[key]))throw new Error('INVALID_RESPONSE');return{worker,uncertain:state.uncertain==='workerCreate'?null:state.uncertain};},{requiresTask:true,allowBlocked:true}),
      capture(){if(state.uncertain==='workerCapture')return Promise.resolve(false);return run('workerCapture',(t,commandRef)=>{if(state.execution?.state!=='committed')throw new Error('WORKER_RESULT_UNAVAILABLE');return{...cas(t,commandRef),...mapping(t),executionRef:state.execution.executionRef};},value=>{workerRecord(value,['artifactRef','version','recordRef','digest','producerClaimRef','generationRef','producerRef','verification','task']);workerTask(value.task);if(workerTask(value.task).taskRef!==state.worker.taskRef||value.generationRef!==state.worker.generationRef||!ref(value.producerRef)||!ref(value.artifactRef)||value.version!==1||!ref(value.recordRef)||!ref(value.digest)||value.verification!==null||value.producerClaimRef!==state.worker.claimRef)throw new Error('INVALID_RESPONSE');return{capture:value,result:null,uncertain:null};},{mutation:true,requiresTask:true,allowBlocked:true});},
      loadResult:()=>run('workerResult',t=>{if(!state.capture)throw new Error('WORKER_RESULT_UNAVAILABLE');return{taskRef:t.taskRef,artifactRef:state.capture.artifactRef,version:state.capture.version,expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch};},value=>{const row=workerRecord(value,['artifactRef','version','recordRef','digest','source','content','verification','delivery']);workerRecord(row.source,['taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','executionRef','inputDigest','cursor','resultDigest']);if(row.artifactRef!==state.capture.artifactRef||row.version!==1||row.recordRef!==state.capture.recordRef||row.digest!==state.capture.digest||!Object.entries(row.source).every(([key,item])=>key==='cursor'?integer(item):ref(item))||!boundedText(row.content,state.status?.bounds.resultBytes??16384)||row.source.taskRef!==state.worker.taskRef||['actionRef','actionDigest','claimRef','generationRef','sessionRef'].some(key=>row.source[key]!==state.worker[key])||row.source.executionRef!==state.execution.executionRef||row.source.cursor!==state.execution.cursor||row.source.resultDigest!==state.execution.resultDigest||row.verification!=='not-reviewed'||row.delivery!=='not-requested')throw new Error('INVALID_RESPONSE');return{result:row};},{requiresTask:true,allowBlocked:true}),
      finish(){if(state.uncertain==='workerFinish')return Promise.resolve(false);return run('workerFinish',(t,commandRef)=>{if(!state.capture||!state.execution)throw new Error('WORKER_FINISH_UNAVAILABLE');return{...cas(t,commandRef),...mapping(t),executionRef:state.execution.executionRef};},value=>{workerRecord(value,['task','claimRef','reservationRef','reservationHeld','outcome','terminalEvidenceRef','releaseEvidenceRef']);workerTask(value.task);if(workerTask(value.task).taskRef!==state.worker.taskRef||!ref(value.claimRef)||value.claimRef!==state.worker.claimRef||value.reservationRef!==state.worker.reservationRef||value.terminalEvidenceRef!==null&&!ref(value.terminalEvidenceRef)||value.releaseEvidenceRef!==null&&!ref(value.releaseEvidenceRef)||value.outcome!=='completed'||typeof value.reservationHeld!=='boolean')throw new Error('INVALID_RESPONSE');return{worker:{...state.worker,phase:value.reservationHeld?'unknown':'stopped'},uncertain:null};},{mutation:true,requiresTask:true,allowBlocked:true});},
      disconnected(){if(!active)return;if(['workerCreate','workerExecute','workerFinish','workerCapture'].includes(state.busy))publish({uncertain:state.busy});epoch++;invalidate();publish({phase:'offline',busy:null,stale:true,error:null});},dispose(){active=false;epoch++;invalidate();unsubscribe();listeners.clear();controllers.clear();}
    });
  }

  function createSetupModel(rpc, { clock = Date.now } = {}) {
    let lastTime = null;
    const now = () => { try { const value = clock(); if (!integer(value) || (lastTime !== null && value < lastTime)) return NaN; lastTime = value; return value; } catch { return NaN; } };
    let active = true, revision = 0, connectionEpoch = 0;
    let state = freeze({ phase: 'loading', executionEnabled: false, storage: null, reasonCode: null, preview: null, accepted: false, busy: null, stale: true, error: null, routeMissing: false });
    const listeners = new Set(), controllers = new Set();
    function publish(update) { if (!active) return; state = freeze({ ...state, ...update }); for (const listener of [...listeners]) listener(); }
    function invalidate() { revision++; for (const controller of controllers) controller.abort(); }
    async function call(endpoint, payload) {
      if (!active) throw new Error('SERVICE_DISPOSED');
      const epoch = connectionEpoch, controller = new AbortController(); controllers.add(controller);
      try {
        const response = await rpc.call('/df-setup', `v1/${endpoint}`, payload, controller.signal);
        if (!active) throw new Error('SERVICE_DISPOSED');
        if (epoch !== connectionEpoch || controller.signal.aborted) throw new Error('CONNECTION_CHANGED');
        const result = setupObject(response, ['ok', 'value', 'error'], ['ok']);
        if (result.ok === false && !Object.hasOwn(result, 'value')) {
          const error = setupObject(result.error, ['code', 'message', 'details'], ['code']);
          throw new Error(setupError(error.code));
        }
        if (result.ok !== true || !Object.hasOwn(result, 'value') || Object.hasOwn(result, 'error')) throw new Error('INVALID_RESPONSE');
        return result.value;
      } finally { controllers.delete(controller); }
    }
    async function readStatus(read, { error = null, missingAllowed = false } = {}) {
      if (!active || read !== revision) return false;
      try {
        const status = setupStatus(await call('status', {}));
        if (!active || read !== revision) return false;
        publish({ ...status, reasonCode: status.reasonCode ?? null, preview: null, accepted: false, busy: null, stale: false, error, routeMissing: false }); return true;
      } catch (failure) {
        if (!active || read !== revision) return false;
        const routeMissing = missingAllowed && setupMissingRoutes.has(setupFailure(failure));
        publish({ phase: 'unavailable', preview: null, accepted: false, busy: null, stale: true, error: routeMissing ? null : setupError(setupFailure(failure)), routeMissing }); return false;
      }
    }
    async function refresh() {
      if (!active) return false;
      invalidate(); const read = revision;
      publish({ phase: 'loading', preview: null, accepted: false, busy: 'status', stale: true, error: null, routeMissing: false });
      return readStatus(read, { missingAllowed: true });
    }
    function fresh() {
      const currentTime = now();
      return active && state.phase === 'setup_required' && !state.stale && !state.busy && state.preview && integer(currentTime) && currentTime >= state.preview.preparedAt && currentTime < state.preview.expiresAt;
    }
    async function prepare() {
      if (!active || state.phase !== 'setup_required' || state.stale || state.busy) return false;
      invalidate(); const read = revision, location = state.storage.location, preparedAt = now();
      publish({ preview: null, accepted: false, busy: 'prepare', error: null });
      if (!active || read !== revision) return false;
      try {
        const value = setupObject(await call('prepare', {}), ['previewRef', 'planDigest', 'expiresAt', 'description']);
        const description = setupObject(value.description, ['operation', 'databaseLocation', 'identityMode', 'encrypted', 'permissions', 'externalExecution']);
        const currentTime = now();
        if (!ref(value.previewRef) || !ref(value.planDigest) || !integer(preparedAt) || !integer(currentTime) || currentTime < preparedAt || !integer(value.expiresAt) || value.expiresAt <= currentTime || value.expiresAt > currentTime + 60000 || description.operation !== 'create-local-storage' || description.databaseLocation !== location || !setupLocation(description.databaseLocation) || description.identityMode !== 'native-dsh-owner' || description.encrypted !== true || description.permissions !== 'owner-only' || description.externalExecution !== false) throw new Error('INVALID_RESPONSE');
        if (!active || read !== revision) return false;
        publish({ preview: { ...value, description, preparedAt }, accepted: false, busy: null }); return true;
      } catch (failure) {
        if (active && read === revision) publish({ preview: null, accepted: false, busy: null, stale: true, error: setupError(setupFailure(failure)) });
        return false;
      }
    }
    function setAccepted(accepted, previewRef = state.preview?.previewRef, planDigest = state.preview?.planDigest) {
      if (typeof accepted !== 'boolean' || !fresh() || previewRef !== state.preview.previewRef || planDigest !== state.preview.planDigest) { publish({ accepted: false }); return false; }
      publish({ accepted }); return true;
    }
    async function confirm(previewRef = state.preview?.previewRef, planDigest = state.preview?.planDigest) {
      if (!fresh() || state.accepted !== true || previewRef !== state.preview.previewRef || planDigest !== state.preview.planDigest) { if (active && state.preview && !fresh()) publish({ preview: null, accepted: false, error: 'SETUP_PREVIEW_STALE' }); return false; }
      const preview = state.preview, read = revision;
      publish({ preview: null, accepted: false, busy: 'confirm', stale: true, error: null });
      if (!active || read !== revision) return false;
      try {
        const status = setupStatus(await call('confirm', { previewRef: preview.previewRef, planDigest: preview.planDigest, accept: true }));
        if (status.storage.location !== preview.description.databaseLocation) throw new Error('INVALID_RESPONSE');
        if (!active || read !== revision) return false;
        publish({ ...status, reasonCode: status.reasonCode ?? null, preview: null, accepted: false, busy: null, stale: false, error: null, routeMissing: false }); return status.phase === 'ready';
      } catch (failure) {
        if (!active || read !== revision) return false;
        const error = setupError(setupFailure(failure));
        publish({ phase: 'unavailable', preview: null, accepted: false, busy: 'status', stale: true, error });
        await readStatus(read, { error }); return false;
      }
    }
    return Object.freeze({ getSnapshot: () => state, subscribe(listener) { if (!active || typeof listener !== 'function' || listeners.size >= 256) return () => {}; listeners.add(listener); return () => listeners.delete(listener); }, refresh, prepare, setAccepted, confirm, canConfirm: () => !!fresh() && state.accepted === true, now,
      disconnected() { if (!active) return; connectionEpoch++; invalidate(); publish({ phase: 'offline', preview: null, accepted: false, busy: null, stale: true, error: null, routeMissing: false }); },
      dispose() { active = false; connectionEpoch++; invalidate(); controllers.clear(); listeners.clear(); },
    });
  }

  function setupCard(model, state) {
    const preview = state.preview, fresh = preview && !state.stale && !state.busy && model.now() >= preview.preparedAt && model.now() < preview.expiresAt;
    const descriptions = { loading: 'Reading local setup status…', setup_required: 'Local storage needs your explicit setup decision.', ready: 'Encrypted local storage is ready.', recovery_required: 'Retained local state needs recovery. Setup cannot replace it.', unavailable: 'Local setup is unavailable. Refresh status before continuing.', offline: 'Host disconnected. Reconnect and refresh status before continuing.' };
    const errors = { SETUP_PREVIEW_STALE: 'The setup preview expired or changed. Refresh status and request a new preview.', OPERATOR_REQUIRED: 'Setup requires the authenticated native DSH owner connection.', SERVICE_DISPOSED: 'The plugin was unloaded. Reconnect and refresh status.', SETUP_RECOVERY_REQUIRED: 'Retained local state needs recovery and cannot be replaced by setup.', SETUP_INVALID_INPUT: 'The host rejected the setup request. Refresh status before continuing.', SETUP_CONFIRMATION_REQUIRED: 'The host requires an explicit current setup decision.' };
    return h('div', { style: styles.card, 'aria-label': 'Local storage setup' }, h('h2', null, 'Local storage setup'),
      h('p', { role: 'status', 'aria-live': 'polite' }, descriptions[state.phase] || 'Local setup status is unconfirmed.'),
      state.storage && h('p', null, `Database location: ${state.storage.location}`),
      state.error && h('p', { role: 'alert' }, errors[state.error] || 'The setup result is unconfirmed. Refresh current status before another decision.'),
      h('p', null, 'Setup creates an encrypted local database and private local owner/workspace namespace under the native DSH owner. Files are owner-only. It grants no model, tool, action, recipient or event authority.'),
      h('p', null, 'Model and action execution are unavailable until separately configured. Host permissions remain deny by default.'),
      h('div', { style: styles.row }, h('button', { type: 'button', style: styles.button, disabled: !!state.busy || state.phase === 'offline', onClick: () => model.refresh() }, 'Refresh setup status'), h('button', { type: 'button', style: styles.button, disabled: state.phase !== 'setup_required' || state.stale || !!state.busy, onClick: () => model.prepare() }, 'Preview local setup')),
      preview && h('div', null, h('h3', null, 'Exact setup plan'), h('p', null, `Create encrypted local storage at ${preview.description.databaseLocation}. Identity mode: native DSH owner. Permissions: owner-only. External execution: disabled.`),
        h('p', { role: 'status' }, fresh ? `Preview valid until ${new Date(preview.expiresAt).toLocaleString()}` : 'Preview expired or changed. Request a current preview.'),
        h('label', { htmlFor: 'df-setup-accept' }, h('input', { id: 'df-setup-accept', type: 'checkbox', checked: !!fresh && state.accepted === true, disabled: !fresh, onChange: event => model.setAccepted(event.target.checked, preview.previewRef, preview.planDigest) }), ' I accept this exact local storage plan.'),
        h('button', { type: 'button', style: styles.button, disabled: !model.canConfirm(), onClick: () => model.confirm(preview.previewRef, preview.planDigest) }, 'Confirm local setup')),
      state.busy && h('p', { role: 'status' }, state.busy === 'confirm' ? 'Confirmation pending. A lost response will be reconciled through status.' : state.busy === 'prepare' ? 'Preparing a current setup preview…' : 'Reading current setup status…'));
  }

  const styles = {
    panel: { padding: '24px', maxWidth: '1100px', margin: '0 auto', color: 'var(--dsw-alias-label-primary)', overflowWrap: 'anywhere', height: '100%', overflow: 'auto', boxSizing: 'border-box' },
    button: { padding: '8px 12px', border: '1px solid var(--dsw-alias-border-primary, #aaa)', borderRadius: '8px', background: 'var(--dsw-alias-surface-primary, transparent)', color: 'inherit', cursor: 'pointer', minHeight: '36px' },
    card: { border: '1px solid var(--dsw-alias-border-primary, #aaa)', borderRadius: '12px', padding: '16px', marginBottom: '12px', minWidth: 0 },
    row: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
  };
  function Icon({ size = 20 }) { return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true }, h('circle', { cx: 8, cy: 8, r: 5, stroke: 'currentColor', strokeWidth: 1.6 }), h('circle', { cx: 17, cy: 16, r: 4, stroke: 'currentColor', strokeWidth: 1.6 }), h('circle', { cx: 6, cy: 19, r: 2, fill: 'currentColor' })); }
  function workerCard(model, state, taskState, expires, setExpires) {
    const status=state.status,policy=state.policyPreview,action=state.actionPreview,task=taskState.detail?.task;
    const available=!!status?.enabled&&state.phase!=='offline'&&!state.busy;
    const taskCurrent=available&&!taskState.stale&&!!task&&!terminal.has(task.status)&&!['cancel_requested','recovery_required'].includes(task.status);
    const cleanupCurrent=available&&!taskState.stale&&!!task;
    const ready=taskCurrent&&status.actionsEnabled&&!state.stale;
    const button=(text,callback,disabled=false)=>h('button',{type:'button',style:styles.button,disabled:disabled||!!state.busy,onClick:callback},text);
    return h('div',{style:styles.card,'aria-label':'Normal native worker'},h('h2',null,'Native worker'),
      h('p',{role:'status','aria-live':'polite'},state.phase==='offline'?'Host disconnected. Worker decisions are cleared.':status?`${status.phase.replaceAll('_',' ')}${status.reasonCode?' · '+status.reasonCode:''}`:'Load the cached worker status before a new decision.'),
      state.error&&h('p',{role:'alert'},errorLabels[state.error]||'This worker result is unconfirmed. Read current host state before another decision.'),
      h('div',{style:styles.row},button('Refresh worker status',()=>model.refresh(),state.phase==='offline'),button('Load current worker catalogue',()=>model.catalog(),!available)),
      status?.enabled&&h(React.Fragment,null,h('p',null,`Selected: ${status.selection.provider} / ${status.selection.model}. Preset: ${status.selection.agentPreset}. Requested reasoning: ${status.selection.reasoningEffort??'native default'}.`),
        h('p',null,`Native transcript directory: ${status.persistence.directory}. Unencrypted; ${status.persistence.compression} compression; retention managed by the owner.`),
        h('p',null,`Request limit: ${status.bounds.requestBytes} bytes. Captured result limit: ${status.bounds.resultBytes} bytes. Output cap: ${status.selection.maxOutputTokens}. These are separate from native storage retention.`),
        h('p',null,`Pricing: ${status.pricing==='source_zero'?'source-owned synthetic zero external cost':'unknown; execution unavailable'}. Accounting: ${status.accounting??'unavailable'}. Synthetic output provides no model-quality evidence.`),
        state.catalog&&h('p',null,`Effective reasoning: ${state.confirmedPolicy?.effectiveReasoningEffort??status.selection.reasoningEffort??state.catalog.models.find(row=>row.provider===status.selection.provider&&row.id===status.selection.model)?.defaultEffort??'unavailable'}. Available selected-provider models: ${state.catalog.models.map(row=>row.name).join(', ')}.`),
        button('Preview worker policy',()=>model.previewPolicy(status.policyVersion),!available||!integer(status.policyVersion)||status.policyVersion<1)),
      policy&&h('div',null,h('h3',null,'Exact worker policy plan'),h('pre',{style:{whiteSpace:'pre-wrap',font:'inherit'}},JSON.stringify(policy.description,null,2)),h('p',null,`Preview expires ${new Date(policy.expiresAt).toLocaleString()}. This does not grant or create a worker.`),
        h('label',{htmlFor:'df-worker-policy-accept'},h('input',{id:'df-worker-policy-accept',type:'checkbox',checked:state.policyAccepted&&model.now()<policy.expiresAt,disabled:!!state.busy||model.now()>=policy.expiresAt,onChange:event=>model.setPolicyAccepted(event.target.checked,policy.previewRef,policy.planDigest)}),' I accept this exact worker policy and unencrypted native transcript storage.'),
        button('Confirm worker policy',()=>model.confirmPolicy(policy.previewRef,policy.planDigest),!model.canConfirmPolicy())),
      h('div',{style:styles.row},button('Prepare approved context',()=>model.prepareContext(),!ready),button('Plan worker action',()=>model.plan(),!ready||!state.contextRecordRef),button('Preview worker action',()=>model.previewAction(),!ready||!state.action||!!state.worker)),
      action&&h('div',null,h('h3',null,'Exact worker action'),h('p',null,action.description.targetLabel),h('p',null,`Model: ${action.description.model.provider} / ${action.description.model.model}; reasoning: ${action.description.model.reasoning}; preset: ${action.description.model.preset}. Tools: none.`),h('pre',{style:{whiteSpace:'pre-wrap',font:'inherit'}},action.description.data.content),h('p',null,`Preview expires ${new Date(action.expiresAt).toLocaleString()}.`),
        h('label',{htmlFor:'df-worker-action-accept'},h('input',{id:'df-worker-action-accept',type:'checkbox',checked:state.actionAccepted&&model.now()<action.expiresAt,disabled:!!state.busy||model.now()>=action.expiresAt,onChange:event=>model.setActionAccepted(event.target.checked,action.previewRef)}),' I accept this exact action and complete approved context.'),
        h('label',{htmlFor:'df-worker-grant-expiry'},'Grant expires at (your local time)'),h('input',{id:'df-worker-grant-expiry',type:'datetime-local',value:expires,onChange:event=>setExpires(event.target.value),disabled:!!state.busy}),
        button('Grant this action',()=>model.grant(Date.parse(expires),action.previewRef),!model.canGrant()||!integer(Date.parse(expires))||Date.parse(expires)<=model.now()),h('p',null,'Granting is a separate decision. Create and execute remain explicit.')),
      h('div',{style:styles.row},button('Create idle worker',()=>model.create(),!ready||!model.canCreate()),button('Execute approved context',()=>model.execute(),!ready||!state.worker||state.worker.phase!=='ready'||!!state.execution||state.uncertain==='workerExecute'),button('Query worker',()=>model.query(),!cleanupCurrent||!state.worker&&!state.action),button('Capture local result',()=>model.capture(),!cleanupCurrent||state.execution?.state!=='committed'||!!state.capture||state.uncertain==='workerCapture'),button('Load captured result',()=>model.loadResult(),!cleanupCurrent||!state.capture),button('Finish owned worker',()=>model.finish(),!cleanupCurrent||!state.capture||!state.execution||state.worker?.phase==='stopped'||state.uncertain==='workerFinish')),
      state.worker&&h('p',null,`Owned worker: ${state.worker.phase}. Generation ${state.worker.generationRef}.`),
      state.execution&&h('p',null,state.execution.state==='committed'?`Native output committed. Actual synthetic usage: ${state.execution.usage.units} ${state.execution.usage.accounting}. Capture and review remain separate.`:'Execution outcome is unknown. Query current host facts; do not repeat execution.'),
      state.result&&h('div',null,h('h3',null,'Captured local result — not reviewed'),h('pre',{style:{whiteSpace:'pre-wrap',font:'inherit'}},state.result.content),h('p',null,`Artifact ${state.result.artifactRef}; digest ${state.result.digest}. Delivery not requested.`)),
      state.uncertain&&h('p',{role:'status'},`Unconfirmed ${state.uncertain}. Read current host facts; repeating a mutation is unavailable until its outcome is established.`),
      state.busy&&h('p',{role:'status'},`Worker operation pending: ${state.busy}. Lost responses require read-only reconciliation.`));
  }

  function createAuditModel(rpc, taskModel, workerModel, {clock=Date.now,uuid=()=>crypto.randomUUID(),digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('')}={}) {
    let active=true,epoch=0,revision=0,ownRefresh=false,selected=null;
    let state=freeze({status:null,busy:null,error:null,requirement:null,input:null,action:null,preview:null,accepted:false,worker:null,execution:null,collection:null,uncertain:null,stale:true});
    const listeners=new Set(),controllers=new Set();
    const publish=update=>{if(active){state=freeze({...state,...update});for(const f of [...listeners])f();}};
    const clear=()=>{revision++;publish({preview:null,accepted:false,stale:true});};
    const unsubscribe=taskModel.subscribe(()=>{const s=taskModel.getSnapshot(),t=s.detail?.task,key=t?`${t.taskRef}:${t.version}:${t.authEpoch}`:null;if(ownRefresh&&selected&&s.detail===null&&s.stale===true&&s.phase==='ready'&&s.selected===selected.split(':')[0])return;if(key!==selected){const before=selected;selected=key;if(!ownRefresh)clear();if(before&&before.split(':')[0]!==t?.taskRef)publish({requirement:null,input:null,action:null,worker:null,execution:null,collection:null,uncertain:null});}});
    const task=()=>{const s=taskModel.getSnapshot();if(s.stale||!s.detail?.task)throw Error('STALE_VERSION');return safeTask(s.detail.task);};
    const cas=(t,c)=>({taskRef:t.taskRef,commandRef:c,expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch});
    function requirement(){const r=taskModel.getSnapshot().detail?.audits?.find(r=>r.auditRef===state.requirement?.auditRef);if(!r||!ref(r.auditRef)||!integer(r.auditRevision)||!integer(r.round))throw Error('AUDIT_STALE');return r;}
    async function call(channel,name,payload){const e=epoch,c=new AbortController();controllers.add(c);try{const raw=await rpc.call(channel,`v1/${name}`,payload,c.signal);if(!active||epoch!==e||c.signal.aborted)throw Error('CONNECTION_CHANGED');const out=setupObject(plainRpcReply(raw),['ok','value','error'],['ok']);if(out.ok!==true||!Object.hasOwn(out,'value')||Object.hasOwn(out,'error')){const error=setupObject(out.error,['code','message','details'],['code']);throw Error(error.code);}return copy(out.value);}finally{controllers.delete(c);}}
    async function run(name,build,project,mutation=true){if(!active||state.busy||state.stale&&name!=='auditQuery')return false;const r=++revision,e=epoch;publish({busy:name,error:null,accepted:false});try{const t=task(),c=mutation?await digest(uuid()):undefined;if(mutation&&!ref(c))throw Error('INVALID_COMMAND');if(r!==revision||e!==epoch)throw Error('CONNECTION_CHANGED');const payload=build(t,c),value=await call('/df-rpc',name,payload);if(r!==revision||e!==epoch)return false;const update=project(value,t);publish({...update,...(name==='auditQuery'?{}:{stale:false})});if(mutation){ownRefresh=true;try{await taskModel.refresh();}finally{ownRefresh=false;}}return true;}catch(error){if(r===revision){publish({error:typeof error?.message==='string'?error.message:'RESULT_UNCONFIRMED',preview:null,accepted:false,stale:true,uncertain:mutation?name:state.uncertain});if(mutation){ownRefresh=true;try{await taskModel.refresh();}finally{ownRefresh=false;}}}return false;}finally{if(active&&e===epoch)publish({busy:null});}}
    const mapping=()=>{if(!state.worker)throw Error('AUDIT_COLLECTION_UNAVAILABLE');return Object.fromEntries(['actionRef','actionDigest','claimRef','generationRef'].map(k=>[k,state.worker[k]]));};
    const execution=t=>{const m=mapping();if(!state.execution||!ref(state.execution.executionRef))throw Error('AUDIT_COLLECTION_UNAVAILABLE');return{...m,taskRef:t.taskRef,executionRef:state.execution.executionRef};};
    function checkedWorker(value,t){const w=value.worker??value;if(w.taskRef!==t.taskRef||!['actionRef','actionDigest','claimRef','reservationRef','generationRef','sessionRef'].every(k=>ref(w[k]))||!['created','ready','running','unknown','stopped','cancel_requested','not_created'].includes(w.phase))throw Error('INVALID_RESPONSE');return w;}
    function queryWorker(t){
      if(state.worker){const worker=checkedWorker(state.worker,t);if(worker.taskRef!==t.taskRef)throw Error('AUDIT_COLLECTION_UNAVAILABLE');return worker;}
      if(state.uncertain!=='dispatchAudit'||!state.action)throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      const snapshot=taskModel.getSnapshot(),detail=snapshot.detail,rows=detail?.workers;
      if(snapshot.stale||detail?.task?.taskRef!==t.taskRef||detail.task.version!==t.version||detail.task.authEpoch!==t.authEpoch||!Array.isArray(rows)||rows.length>128)throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      const matching=rows.filter(row=>row?.actionRef===state.action.actionRef&&row?.actionDigest===state.action.actionDigest);
      if(matching.length!==1)throw Error('AUDIT_COLLECTION_UNAVAILABLE');const row=matching[0];
      if(row.taskRef!==undefined&&row.taskRef!==t.taskRef)throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      return freeze(checkedWorker({taskRef:t.taskRef,...Object.fromEntries(['actionRef','actionDigest','claimRef','reservationRef','generationRef','sessionRef'].map(k=>[k,row[k]])),phase:['intent','submitted'].includes(row.phase)?'unknown':row.phase},t));
    }
    function recoveredExecution(t){
      if(state.uncertain!=='executeAudit'||state.execution||!state.action||!state.input||!state.worker)throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      const worker=checkedWorker(state.worker,t),input=state.input,snapshot=taskModel.getSnapshot(),detail=snapshot.detail;
      if(snapshot.stale||detail?.task?.taskRef!==t.taskRef||detail.task.version!==t.version||detail.task.authEpoch!==t.authEpoch||!Array.isArray(detail.actions)||detail.actions.length>128||!Array.isArray(detail.workers)||detail.workers.length>128||!Array.isArray(detail.executions)||detail.executions.length>128)throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      if(worker.actionRef!==state.action.actionRef||worker.actionDigest!==state.action.actionDigest||!['recordRef','digest','auditRef','bindingDigest','materialDigest'].every(k=>ref(input[k]))||!['audit_review','audit_repair'].includes(input.purpose))throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      const workers=detail.workers.filter(row=>row?.claimRef===worker.claimRef);
      if(workers.length!==1||workers[0].taskRef!==undefined&&workers[0].taskRef!==t.taskRef||['actionRef','actionDigest','claimRef','reservationRef','generationRef','sessionRef'].some(k=>workers[0][k]!==worker[k]))throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      const actions=detail.actions.filter(row=>row?.actionRef===worker.actionRef&&row?.actionDigest===worker.actionDigest);
      if(actions.length!==1||actions[0].claimRef!==worker.claimRef||actions[0].generationRef!==worker.generationRef||!ref(actions[0].executionRef))throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      const matching=detail.executions.filter(row=>row?.kind==='audit_input'&&row?.claimRef===worker.claimRef);
      if(matching.length!==1)throw Error('AUDIT_COLLECTION_UNAVAILABLE');
      const required=['kind','executionRef','taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','inputRecordRef','inputDigest','dataDigest','auditRef','bindingDigest','materialDigest','purpose','semanticRevision','commandRef','state','createdAt'];
      const value=setupObject(matching[0],[...required,'admittedAt','resultRef','reportRef','outcomeEvidenceRef','terminalEvidenceRef'],required);
      if(!['executionRef','taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','inputRecordRef','inputDigest','dataDigest','auditRef','bindingDigest','materialDigest','commandRef'].every(k=>ref(value[k]))||!integer(value.semanticRevision)||!integer(value.createdAt)||!['intent_committed','dispatch_intent','unknown','completed','failed','terminated'].includes(value.state))throw Error('INVALID_RESPONSE');
      const expected={taskRef:t.taskRef,actionRef:worker.actionRef,actionDigest:worker.actionDigest,claimRef:worker.claimRef,generationRef:worker.generationRef,sessionRef:worker.sessionRef,inputRecordRef:input.recordRef,inputDigest:input.digest,auditRef:input.auditRef,bindingDigest:input.bindingDigest,materialDigest:input.materialDigest,purpose:input.purpose,executionRef:actions[0].executionRef};
      if(Object.keys(expected).some(k=>value[k]!==expected[k]))throw Error('INVALID_RESPONSE');
      if(Object.hasOwn(value,'admittedAt')&&(!integer(value.admittedAt)||value.admittedAt<value.createdAt)||value.state==='dispatch_intent'&&!Object.hasOwn(value,'admittedAt'))throw Error('INVALID_RESPONSE');
      if(['resultRef','reportRef','outcomeEvidenceRef'].some(k=>Object.hasOwn(value,k)&&!ref(value[k]))||Object.hasOwn(value,'terminalEvidenceRef')&&value.terminalEvidenceRef!==null&&!ref(value.terminalEvidenceRef)||Object.hasOwn(value,'resultRef')&&value.resultRef!==value.executionRef||Object.hasOwn(value,'reportRef')&&!Object.hasOwn(value,'resultRef'))throw Error('INVALID_RESPONSE');
      if(['completed','failed','terminated'].includes(value.state)&&(!ref(value.terminalEvidenceRef)||!ref(value.outcomeEvidenceRef)))throw Error('INVALID_RESPONSE');
      return copy(value);
    }
    return Object.freeze({getSnapshot:()=>state,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);},now:clock,
      async refresh(){if(!active||state.busy)return false;clear();const r=revision,e=epoch;publish({busy:'auditStatus'});try{const value=await call('/df-setup','auditStatus',{});setupObject(value,['enabled','ready','reason','bounds']);if(typeof value.enabled!=='boolean'||typeof value.ready!=='boolean')throw Error('INVALID_RESPONSE');if(r===revision)publish({status:value,stale:false,error:null});return true;}catch(error){if(r===revision)publish({error:'Audit status is unavailable.',stale:true});return false;}finally{if(active&&e===epoch)publish({busy:null});}},
      configure(){return run('configureAudit',(t,c)=>{const w=workerModel.getSnapshot(),req=state.requirement?requirement():null,a=state.collection?.artifact??w.capture;if(!a||!ref(w.contextRecordRef))throw Error('AUDIT_PRODUCER_REQUIRED');const d=taskModel.getSnapshot().detail?.data?.find(d=>d.recordRef===w.contextRecordRef);if(!d||!ref(d.digest))throw Error('AUDIT_CONTEXT_REQUIRED');return{...cas(t,c),auditRef:req?.auditRef??c,expectedAuditRevision:req?.auditRevision??0,artifactRef:a.artifactRef,artifactVersion:a.version,digest:a.digest,contextRecordRef:w.contextRecordRef,material:[{recordRef:a.recordRef,digest:a.digest},{recordRef:w.contextRecordRef,digest:d.digest}].sort((a,b)=>a.recordRef.localeCompare(b.recordRef))};},value=>{if(!ref(value.auditRef)||!integer(value.auditRevision))throw Error('INVALID_RESPONSE');return{requirement:value,input:null,action:null,worker:null,execution:null,collection:null,uncertain:null};});},
      prepare(purpose){return run('prepareAuditInput',(t,c)=>{const r=requirement();return{...cas(t,c),auditRef:r.auditRef,expectedAuditRevision:r.auditRevision,purpose,round:purpose==='audit_review'?r.round:r.round+1,...(purpose==='audit_repair'?{previousReportRef:r.reportRef}:{})};},value=>{if(!ref(value.recordRef)||!ref(value.digest)||value.purpose!==purpose)throw Error('INVALID_RESPONSE');return{input:value,action:null,worker:null,execution:null,collection:null,uncertain:null};});},
      plan(){return run('planAuditAction',(t,c)=>{if(!state.input)throw Error('AUDIT_INPUT_REQUIRED');return{...cas(t,c),auditRef:state.input.auditRef,inputRecordRef:state.input.recordRef,purpose:state.input.purpose};},value=>{if(!ref(value.actionRef)||!ref(value.actionDigest))throw Error('INVALID_RESPONSE');return{action:value,preview:null,worker:null,execution:null,collection:null,uncertain:null};});},
      preview(){return run('auditPreview',t=>{if(!state.action||!state.input)throw Error('AUDIT_INPUT_REQUIRED');return{taskRef:t.taskRef,actionRef:state.action.actionRef,actionDigest:state.action.actionDigest,recordRef:state.input.recordRef,expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch};},(value,t)=>{if(!ref(value.previewRef)||value.taskVersion!==t.version||value.authEpoch!==t.authEpoch||!integer(value.expiresAt)||value.expiresAt<=clock()||value.actionDigest!==state.action.actionDigest||value.description?.data?.digest!==state.input.digest||typeof value.description.data.content!=='string')throw Error('INVALID_RESPONSE');return{preview:value,accepted:false};},false);},
      setAccepted(value){publish({accepted:value===true&&!state.stale&&state.preview?.expiresAt>clock()});},
      grant(expiresAt){if(!state.accepted||state.stale||state.preview?.expiresAt<=clock()||!integer(expiresAt)||expiresAt<=clock())return Promise.resolve(false);const preview=state.preview;publish({preview:null});return run('auditGrant',(t,c)=>({...cas(t,c),actionRef:state.action.actionRef,actionDigest:state.action.actionDigest,previewRef:preview.previewRef,expiresAt,accept:true}),()=>({uncertain:null}));},
      create(){if(state.uncertain==='dispatchAudit'||state.worker)return Promise.resolve(false);return run('dispatchAudit',(t,c)=>({...cas(t,c),actionRef:state.action.actionRef,actionDigest:state.action.actionDigest}),(value,t)=>({worker:checkedWorker(value,t),uncertain:null}));},
      execute(){if(['dispatchAudit','executeAudit'].includes(state.uncertain)||state.execution)return Promise.resolve(false);return run('executeAudit',(t,c)=>({...cas(t,c),...mapping(),inputRecordRef:state.input.recordRef}),value=>{if(!ref(value.executionRef))throw Error('INVALID_RESPONSE');return{execution:value,uncertain:null};});},
      canRecoverExecution(){try{return Boolean(active&&!state.busy&&recoveredExecution(task()));}catch{return false;}},
      recoverExecution(){if(!active||state.busy)return false;const r=revision,e=epoch,snapshot=taskModel.getSnapshot();try{const value=recoveredExecution(task());if(!active||state.busy||r!==revision||e!==epoch||taskModel.getSnapshot()!==snapshot)return false;publish({execution:value,preview:null,accepted:false,error:null});return true;}catch{return false;}},
      canQuery(){try{return Boolean(active&&!state.busy&&queryWorker(task()));}catch{return false;}},
      query(){let requested;return run('auditQuery',t=>{requested=queryWorker(t);return{taskRef:t.taskRef,...Object.fromEntries(['actionRef','claimRef','generationRef'].map(k=>[k,requested[k]]))};},(value,t)=>{const worker=checkedWorker(value,t);if(['taskRef','actionRef','actionDigest','claimRef','reservationRef','generationRef','sessionRef'].some(k=>worker[k]!==requested[k]))throw Error('INVALID_RESPONSE');return{worker};},false);},
      collect(){return run('collectAuditResult',(t,c)=>{const{actionDigest,...m}=execution(t);return{...cas(t,c),...m};},value=>({collection:value,uncertain:value.state==='unknown'?'collectAuditResult':null}));},
      finish(){if(!state.execution||!state.collection)return Promise.resolve(false);return run('auditFinish',(t,c)=>{const{actionDigest,...m}=execution(t);return{...cas(t,c),...m};},value=>{if(value.claimRef!==state.worker.claimRef||typeof value.reservationHeld!=='boolean'||value.outcome!=='completed')throw Error('INVALID_RESPONSE');return{worker:{...state.worker,phase:value.reservationHeld?'unknown':'stopped'},uncertain:null};});},
      disconnected(){const uncertain=['dispatchAudit','executeAudit'].includes(state.busy)?state.busy:state.uncertain;epoch++;clear();for(const c of controllers)c.abort();publish({busy:null,status:null,uncertain});},dispose(){active=false;unsubscribe();for(const c of controllers)c.abort();listeners.clear();},
    });
  }
  function auditCard(model,state,taskState,worker,expires,setExpires){
    const enabled=state.status?.enabled,current=enabled&&!taskState.stale&&!state.stale&&!state.busy;
    const button=(text,action,disabled)=>h('button',{type:'button',style:styles.button,onClick:action,disabled:!!state.busy||disabled},text);
    return h('div',{style:styles.card,'aria-label':'Native independent audit'},h('h2',null,'Native independent audit'),h('p',null,'Synthetic review reports unknown with all material unexamined. Repair creates factual synthetic text. Each fresh role uses a separate charged claim; collection and finish remain explicit.'),
      button('Refresh audit status',()=>model.refresh(),false),state.status&&h('p',null,enabled?`Audit ${state.status.reason??'configured'}. Select and confirm the shared worker and role policy above before admission.`:'Native audit is disabled.'),state.error&&h('p',{role:'alert'},'The audit operation is unavailable or unconfirmed. Refresh current facts before another decision.'),
      enabled&&h(React.Fragment,null,h('div',{style:styles.row},button('Configure captured artifact audit',()=>model.configure(),!current||!(state.collection?.artifact||worker.capture)||!worker.contextRecordRef),button('Prepare review input',()=>model.prepare('audit_review'),!current||!state.requirement),button('Prepare repair input',()=>model.prepare('audit_repair'),!current||!state.requirement),button('Plan fresh role action',()=>model.plan(),!current||!state.input),button('Preview full audit input',()=>model.preview(),!current||!state.action||!!state.worker)),
        state.preview&&h('div',null,h('h3',null,'Exact approved audit input'),h('p',null,state.preview.description.targetLabel),h('pre',{style:{whiteSpace:'pre-wrap',font:'inherit'}},state.preview.description.data.content),h('label',{htmlFor:'df-audit-accept'},h('input',{id:'df-audit-accept',type:'checkbox',checked:state.accepted,disabled:state.stale||state.preview.expiresAt<=model.now(),onChange:e=>model.setAccepted(e.target.checked)}),' I accept this exact complete audit input and role action.'),h('label',{htmlFor:'df-audit-expiry'},'Grant expires at (your local time)'),h('input',{id:'df-audit-expiry',type:'datetime-local',value:expires,onChange:e=>setExpires(e.target.value)}),button('Grant audit action',()=>model.grant(Date.parse(expires)),!state.accepted)),
        h('div',{style:styles.row},button('Create idle role session',()=>model.create(),!current||!state.action||!!state.worker),button('Execute approved audit input',()=>model.execute(),!current||!state.worker||!!state.execution),button('Query role facts',()=>model.query(),!enabled||!model.canQuery()),button('Recover execution reference',()=>model.recoverExecution(),!enabled||!model.canRecoverExecution()),button('Collect original result',()=>model.collect(),!current||!state.execution),button('Finish owned role session',()=>model.finish(),!current||!state.collection||state.worker?.phase==='stopped')),
        state.execution&&h('p',null,`Execution: ${state.execution.state}.`),state.collection&&h('pre',{style:{whiteSpace:'pre-wrap',font:'inherit'}},JSON.stringify(state.collection,null,2)),state.uncertain&&h('p',{role:'status'},'An outcome is unconfirmed. Query and execution reference recovery read facts only. Refresh audit status before explicit collection. Explicit collection reconciles the retained original child receipt; execution is never automatically retried.')));
  }

  function Panel({ model, setupModel, workerModel, auditModel, continuationModel, recoveryModel }) {
    const state = React.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
    const worker = React.useSyncExternalStore(workerModel?.subscribe || emptySetupSubscribe, workerModel?.getSnapshot || emptySetupSnapshot, workerModel?.getSnapshot || emptySetupSnapshot);
    const auditState = React.useSyncExternalStore(auditModel?.subscribe || emptySetupSubscribe,auditModel?.getSnapshot || emptySetupSnapshot,auditModel?.getSnapshot || emptySetupSnapshot);
    const [auditExpiry,setAuditExpiry]=React.useState('');
    const setup = React.useSyncExternalStore(setupModel?.subscribe || emptySetupSubscribe, setupModel?.getSnapshot || emptySetupSnapshot, setupModel?.getSnapshot || emptySetupSnapshot);
    const [draft, setDraft] = React.useState('');
    const [approvalExpiry, setApprovalExpiry] = React.useState('');
    const [workerExpiry, setWorkerExpiry] = React.useState('');
    const [goalEdit, setGoalEdit] = React.useState(''), [constraintsEdit, setConstraintsEdit] = React.useState('');
    const [answers, setAnswers] = React.useState({});
    const [, setClockTick] = React.useState(0);
    React.useEffect(() => { const timer = setInterval(() => setClockTick(value => value + 1), 1000); return () => clearInterval(timer); }, [model]);
    if (setup && setup.phase !== 'ready' && !(setup.routeMissing && state.phase === 'ready' && !state.stale)) return h('section', { style: styles.panel, 'aria-label': 'dsh-fishball task panel' }, h('h1', null, 'dsh-fishball Preview'), setupCard(setupModel, setup));
    const task = state.detail?.task, current = task && !state.stale && !state.busy;
    const button = (text, action, disabled, extra = {}) => h('button', { type: 'button', onClick: action, disabled, style: styles.button, ...extra }, text);
    const goal = state.records.filter(record => record.kind === 'goal').at(-1)?.content;
    const recordText = record => h('pre', { style: { whiteSpace: 'pre-wrap', font: 'inherit', overflowWrap: 'anywhere' } }, record);
    const batches = model.questions?.() ?? [];
    const automation = state.automation;
    const automationCurrent = !!automation && !state.automationStale && !state.busy && !state.automationBusy && state.phase !== 'offline';
    const revisionEditor = h('div', { style: styles.card }, h('h3', null, 'Goal and constraints'),
      h('p', null, 'Explicit revisions invalidate earlier context and approval. They do not approve or start an action.'),
      h('form', { onSubmit: async event => { event.preventDefault(); if (await model.reviseTask({ goal: goalEdit })) setGoalEdit(''); } }, h('label', { htmlFor: 'df-revise-goal' }, 'New goal revision'), h('textarea', { id: 'df-revise-goal', value: goalEdit, onChange: event => setGoalEdit(event.target.value), rows: 2, disabled: !current, style: { display: 'block', width: '100%' } }), h('button', { type: 'submit', disabled: !current || !goalEdit.trim(), style: styles.button }, 'Save goal revision')),
      h('form', { onSubmit: async event => { event.preventDefault(); if (await model.reviseTask({ constraints: constraintsEdit })) setConstraintsEdit(''); } }, h('label', { htmlFor: 'df-revise-constraints' }, 'New constraints revision'), h('textarea', { id: 'df-revise-constraints', value: constraintsEdit, onChange: event => setConstraintsEdit(event.target.value), rows: 2, disabled: !current, style: { display: 'block', width: '100%' } }), h('button', { type: 'submit', disabled: !current || !constraintsEdit.trim(), style: styles.button }, 'Save constraints revision')));
    const clarificationView = h('div', { style: styles.card }, h('h3', null, 'Questions requiring your decision'), !batches.length ? h('p', null, 'No loaded question batch. Older records remain available below.') : batches.map(batch => {
      const answerable = current && batch.state === 'awaiting' && batch.sourceAuthEpoch === task.authEpoch && !terminal.has(task.status);
      return h('form', { key: batch.batchRef, onSubmit: event => { event.preventDefault(); void model.answerBatch(batch.batchRef, batch.questions.map(q => ({ decisionRef: q.decisionRef, answer: answers[q.decisionRef] || '' }))); } }, h('p', null, `${batch.state} · approval epoch ${batch.sourceAuthEpoch}${answerable ? '' : ' · answers unavailable for this snapshot'}`), batch.questions.map(q => h('div', { key: q.decisionRef }, h('label', { htmlFor: `df-answer-${q.decisionRef}` }, q.question), h('textarea', { id: `df-answer-${q.decisionRef}`, value: answers[q.decisionRef] || '', onChange: event => setAnswers(value => ({ ...value, [q.decisionRef]: event.target.value })), disabled: !answerable, rows: 2, style: { display: 'block', width: '100%' } }), h('p', null, `Related branches: ${q.branchRefs.join(', ')}`))), h('button', { type: 'submit', disabled: !answerable || !batch.questions.every(q => boundedText(answers[q.decisionRef], 8192)), style: styles.button }, 'Submit complete answers'), h('p', null, 'Answers resolve questions; they grant no action authority.'));
    }));
    const artifactView = h('div', { style: styles.card }, h('h3', null, 'Artifacts, verification and delivery'),
      (state.detail?.artifacts ?? []).map(artifact => h('div', { key: `${artifact.artifactRef}:${artifact.version}` }, h('p', null, `Artifact ${artifact.artifactRef} · version ${artifact.version} · digest ${artifact.digest}`), h('p', null, `Verification: ${artifact.verification?.verdict || 'not recorded'}${artifact.verification?.evidenceRef ? ' · evidence ' + artifact.verification.evidenceRef : ''}`), h('p', null, `Immutable record: ${artifact.recordRef}`))),
      !(state.detail?.artifacts?.length) && h('p', null, 'No artifact recorded.'),
      (state.detail?.deliveries ?? []).map(delivery => h('div', { key: delivery.deliveryRef }, h('p', null, `Delivery ${delivery.deliveryRef} · ${delivery.state} · artifact version ${delivery.artifactVersion} · digest ${delivery.digest}`), h('p', null, `Current access: permission ${delivery.currentAccess?.permissionState || 'unobserved'}; openability ${delivery.currentAccess?.openability || 'unobserved'}; observed ${delivery.currentAccess?.observedAt === undefined ? 'unknown' : new Date(delivery.currentAccess.observedAt).toLocaleString()}`))),
      h('p', null, 'Artifact verification, transmission, recipient consumption and current access are separate facts. No recorded delivery is fabricated from completion.'));
    const auditView = h('div', { style: styles.card }, h('h3', null, 'Independent audit coverage and blockers'), !(state.detail?.audits?.length) && h('p', null, 'No audit requirement recorded.'), (state.detail?.audits ?? []).map(audit => h('div', { key: audit.auditRef }, h('p', null, `Audit ${audit.auditRef} · ${audit.state} · artifact version ${audit.artifactVersion} · digest ${audit.digest}`), h('p', null, `Blocking severities: ${(audit.blockingSeverities ?? []).join(', ')} · repair round ${audit.round} of ${audit.maxRepairRounds}`), h('p', null, `Required material: ${(audit.material ?? []).map(item => item.recordRef).join(', ')} · material digest ${audit.materialDigest}`), button('Load current audit reports', () => model.inspectAudit(audit.auditRef), !current), !(audit.reports?.length) && h('p', null, 'Reports not loaded or not recorded; no audit pass is inferred.'), (audit.reports ?? []).map(report => h('div', { key: report.reportRef }, h('p', null, `${report.verdict} · reviewer generation ${report.generationRef}`), h('p', null, `Covered: ${(report.coverageRefs ?? []).join(', ') || 'none'}; unexamined: ${(report.unexaminedRefs ?? []).join(', ') || 'none reported'}`), recordText(JSON.stringify(report.findings ?? [], null, 2)))))));
    const automationView = h('div', { style: styles.card }, h('h2', null, 'Event sources and schedules'), button('Load current sources and clock plans', () => model.loadAutomation(), state.automationBusy || state.busy || state.phase === 'offline'), state.automationError && h('p', { role: 'alert' }, 'Source or clock state is unavailable or changed. Load it again before making a decision.'), state.automationStale && h('p', null, 'Source and clock controls require a current separate owner snapshot.'),
      (automation?.sources ?? []).map(source => h('div', { key: source.sourceRef }, h('p', null, `${source.spec.kind} source ${source.sourceRef} · revision ${source.revision} · ${source.spec.enabled ? 'enabled' : 'disabled'} · identity ${source.spec.identityMode}`), recordText(JSON.stringify(source.spec, null, 2)), button(source.spec.enabled ? 'Disable source' : 'Enable source', () => model.enableSource(source.sourceRef, !source.spec.enabled), !automationCurrent))),
      (automation?.subscriptions ?? []).map(subscription => h('div', { key: subscription.subscriptionRef }, h('p', null, `Subscription ${subscription.subscriptionRef} · source ${subscription.sourceRef} · revision ${subscription.revision} · ${subscription.spec.enabled ? 'enabled' : 'disabled'} · route ${subscription.spec.route}`), recordText(JSON.stringify(subscription.spec, null, 2)), button(subscription.spec.enabled ? 'Disable subscription' : 'Enable subscription', () => model.enableSubscription(subscription.subscriptionRef, !subscription.spec.enabled), !automationCurrent), button('Load event receipts', () => model.loadReceipts(subscription.subscriptionRef), !automationCurrent))),
      (automation?.clocks ?? []).map(plan => h('div', { key: plan.clockRef || plan.subscriptionRef }, h('h3', null, plan.state === 'unavailable' ? 'Registered schedule unavailable' : `Schedule · ${plan.timezone}`), plan.registration && h(React.Fragment, null, h('p', null, plan.registration.goal), recordText(JSON.stringify(plan.registration.spec, null, 2)), h('p', null, `External effect intent: ${plan.registration.externalEffect ? 'yes; requires separate action approval' : 'no'} · start after ${new Date(plan.registration.startAfter).toLocaleString()}`)), plan.state !== 'unavailable' && h(React.Fragment, null, h('p', null, `Clock ${plan.clockRef} · source revision ${plan.sourceRevision} · subscription revision ${plan.subscriptionRevision} · cursor ${plan.cursor === null ? 'not advanced' : new Date(plan.cursor).toLocaleString()} · polling ${plan.polling ? 'active' : 'inactive'}`), plan.pendingVerification ? h(React.Fragment, null, h('p', null, `Missed plan ${plan.pendingVerification.planDigest} · through ${new Date(plan.pendingVerification.through).toLocaleString()} · ${plan.pendingVerification.approved ? 'owner approved' : 'awaiting explicit owner decision'}`), button('Approve this exact missed plan', () => model.approveSchedule(plan.clockRef), !automationCurrent || plan.pendingVerification.approved), h('p', null, 'This approves the recorded occurrence plan only. It neither grants effects nor starts a worker. Refresh if source, subscription or clock changed.')) : h('p', null, 'No pending missed-plan decision.')))),
      (state.receipts ?? []).map(receipt => h('p', { key: receipt.eventRef }, `Event ${receipt.eventRef} · ${receipt.state} · task ${receipt.taskRef} · reservations ${receipt.reservationsHeld ? 'held' : 'not held'}`)), h('p', null, 'Registered adapter metadata does not prove live provider connectivity. No source, frequency, timezone or approval default is selected here.'));
    const approval = action => {
      const preview = state.previews?.[action.actionRef], description = preview?.description;
      const now = model.now?.() ?? Date.now(), expiry = Date.parse(approvalExpiry);
      const fresh = current && preview && preview.expiresAt > now && preview.taskVersion === task.version && preview.authEpoch === task.authEpoch;
      const dataKnown = state.records.some(record => record.digest === action.spec?.dataDigest);
      return h('div', { key: action.actionRef, style: { marginBottom: '16px' } },
        h('p', null, `${action.spec?.role || 'Unknown role'} · ${action.state || 'Unknown'} · ${action.spec?.units ?? 'Unknown'} resource units`),
        h('details', null, h('summary', null, 'Immutable action binding'), h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '12px' } }, JSON.stringify({ actionDigest: action.actionDigest, targetDigest: action.spec?.targetDigest, dataDigest: action.spec?.dataDigest, executor: action.spec?.executor, model: action.spec?.model, charges: action.spec?.charges }, null, 2))),
        button('Load approval preview', () => model.previewAction(action.actionRef), !current || !dataKnown || !!state.previewBusy || !!action.claimRef || action.state !== 'requested'),
        !description ? h('p', null, 'Approval is unavailable until the host supplies a concrete target and data preview.') : h('div', { style: { marginTop: '12px' } },
          h('h4', null, 'Exact scope for approval'),
          h('p', null, `${description.kind} · ${description.role} · ${description.targetLabel}`),
          h('p', null, `Model: ${description.model.provider} / ${description.model.model}; reasoning: ${description.model.reasoning}; preset: ${description.model.preset}`),
          h('p', null, `Tools: ${description.toolNames.length ? description.toolNames.join(', ') : 'None'}`),
          h('p', null, `Environment: ${description.environment.label} · ${description.environment.cwd}`),
          h('p', null, `Limits: ${description.limits.units} resource units; attempt ${description.limits.attemptIndex}; runtime ${description.limits.charges.runtimeMs} ms; usage ${description.limits.charges.usageUnits}; cost ${description.limits.charges.costState === 'unknown' ? 'unknown' : description.limits.charges.costEstimateMicros + ' micro units (estimate)'}`),
          h('p', null, `Data: ${description.data.kind} · record ${description.data.recordRef}; digest ${description.data.digest}`),
          h('pre', { style: { whiteSpace: 'pre-wrap', font: 'inherit', overflowWrap: 'anywhere' } }, description.data.content),
          h('p', { role: 'status' }, fresh ? `Preview valid until ${new Date(preview.expiresAt).toLocaleString()}` : 'Preview expired or changed. Load current scope again.'),
          h('label', { htmlFor: `df-expiry-${action.actionRef}` }, 'Approval expires at (your local time)'),
          h('input', { id: `df-expiry-${action.actionRef}`, type: 'datetime-local', value: approvalExpiry, onChange: event => setApprovalExpiry(event.target.value), disabled: !fresh, style: { margin: '8px' } }),
          button('Approve exact scope', () => model.grantAction(action.actionRef, expiry), !fresh || !integer(expiry) || expiry <= now),
          h('p', null, 'Choose an explicit approval expiry. Preview validity is separate. Approval does not start work automatically.'),
        ));
    };
    return h('section', { style: styles.panel, 'aria-label': 'dsh-fishball task panel' },
      setup && !setup.routeMissing && setupCard(setupModel, setup),
      worker && workerCard(workerModel, worker, state, workerExpiry, setWorkerExpiry),
      h('div', { style: { ...styles.row, justifyContent: 'space-between' } }, h('h1', null, 'dsh-fishball ', h('small', { style: { fontSize: '12px', fontWeight: 400 } }, 'Preview')), button('Refresh', () => model.refresh(), state.busy, { 'aria-label': 'Refresh tasks from the host' })),
      h('p', { role: 'status', 'aria-live': 'polite' }, state.phase === 'loading' ? 'Loading current tasks…' : state.phase === 'offline' ? 'Host disconnected. Controls are unavailable until a current snapshot is loaded.' : state.updatedAt === null ? 'No current snapshot' : `Snapshot refreshed ${new Date(state.updatedAt).toLocaleString()}${state.stale ? ' · stale' : ''}`),
      state.error && h('div', { role: 'alert', style: styles.card }, errorLabels[state.error] || 'The result is not confirmed. Refresh the host state before trying another action.'),
      h('form', { onSubmit: async event => { event.preventDefault(); if (await model.intake(draft)) setDraft(''); }, style: styles.card }, h('label', { htmlFor: 'df-goal' }, 'New task'), h('textarea', { id: 'df-goal', value: draft, onChange: event => setDraft(event.target.value), rows: 3, maxLength: 16000, disabled: state.busy || state.phase === 'offline', style: { display: 'block', width: '100%', boxSizing: 'border-box', margin: '8px 0', font: 'inherit', resize: 'vertical' } }), h('button', { type: 'submit', disabled: !draft.trim() || state.busy || state.phase === 'offline', style: styles.button }, state.busy ? 'Submitting…' : 'Create task')),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' } },
        h('nav', { 'aria-label': 'Tasks', style: { flex: '1 1 230px', minWidth: 0 } }, state.tasks.length === 0 && state.phase === 'ready' ? h('p', null, 'No tasks yet.') : state.tasks.map(value => h('button', { key: value.taskRef, type: 'button', onClick: () => model.select(value.taskRef), 'aria-current': value.taskRef === state.selected ? 'page' : undefined, style: { ...styles.button, display: 'block', width: '100%', textAlign: 'left', marginBottom: '8px' } }, `Task ${value.taskRef.slice(0, 8)}`, h('span', { style: { display: 'block', fontSize: '12px', marginTop: '4px' } }, `${label(value.status)} · version ${value.version}`)))),
        h('main', { 'aria-label': 'Task details', style: { flex: '3 1 420px', minWidth: 0 } }, !task ? h('p', null, state.phase === 'loading' ? 'Loading task details…' : 'Select a task to inspect its current state.') : h(React.Fragment, null,
          h('div', { style: styles.card }, h('h2', null, goal || `Task ${task.taskRef.slice(0, 8)}`), h('p', null, `${label(task.status)} · version ${task.version} · approval epoch ${task.authEpoch}`), h('p', null, `Host update ${new Date(task.updatedAt).toLocaleString()}`), h('div', { style: styles.row }, button('Pause new work', () => model.control('pause'), !current || terminal.has(task.status) || state.detail.control === 'paused'), button('Continue', () => model.control('resume'), !current || terminal.has(task.status) || state.detail.control !== 'paused' || ['cancel_requested', 'recovery_required'].includes(task.status)), button('Request cancellation', () => model.control('cancel'), !current || terminal.has(task.status) || task.status === 'cancel_requested')), h('p', { style: { fontSize: '13px' } }, 'Pause stops new admission. Cancellation remains requested until the host confirms work and effects.')),
          continuationModel&&h('div',null,state.detail.data.filter(d=>d.kind==='context').map(d=>button(`Select candidate context ${d.recordRef.slice(0,8)}`,()=>continuationModel.chooseContext(d.recordRef),!current)),state.detail.workers.filter(w=>w.phase==='stopped').map(w=>button(`Select stopped worker ${w.claimRef.slice(0,8)}`,()=>continuationModel.choosePredecessor(w.claimRef),!current))),recoveryModel&&h('div',null,state.detail.executions.map(e=>button(`Select execution ${e.executionRef.slice(0,8)}`,()=>recoveryModel.chooseExecution(e.executionRef),!current))),h('div', { style: styles.card }, h('h3', null, 'Workers'), state.detail.workers.length ? state.detail.workers.map(worker => h('div', { key: worker.claimRef }, h('p', null, `${worker.phase || 'Unknown'} · generation ${worker.generationRef}${worker.handoff?.state === 'pending' ? ' · waiting for owner handoff' : ''}`), button('Open owned session', () => model.openWorker(worker.claimRef), !current || !model.canNavigate || !ref(worker.sessionRef) || ['stopped', 'not_created'].includes(worker.phase)), h('p', null, !model.canNavigate ? 'Host session navigation is unavailable.' : ['stopped', 'not_created'].includes(worker.phase) ? 'This incarnation is stopped; navigation does not recreate or resume it.' : 'The host must confirm the exact current owned mapping before navigation.'))) : h('p', null, 'No worker execution admitted.')),
          revisionEditor, clarificationView, artifactView, auditView, continuationModel&&h(ContinuationCard,{continuationModel,contextRecordRef:worker?.contextRecordRef}),recoveryModel&&h(OwnerFinishRecoveryCard,{recoveryModel}),auditModel&&auditCard(auditModel,auditState,state,worker,auditExpiry,setAuditExpiry),
          h('div', { style: styles.card }, h('h3', null, 'Action scope and approval'), state.detail.actions.length ? state.detail.actions.map(approval) : h('p', null, 'No proposed actions.')),
          h('div', { style: styles.card }, h('h3', null, 'Task records and results'), state.records.filter(record => record.kind !== 'goal').map(record => h('details', { key: record.recordRef }, h('summary', null, record.kind), h('pre', { style: { whiteSpace: 'pre-wrap', font: 'inherit', overflowWrap: 'anywhere' } }, record.content))), state.detail.artifacts?.length ? h('p', null, `${state.detail.artifacts.length} artifact record(s). Verification and delivery are separate facts.`) : h('p', null, 'No verified artifact recorded.')),
        )),
      ),
      automationView,
    );
  }
  // NI6 proposed continuation controls. Actual root endpoint/source adoption
  // remains a listed integration cut; no automatic restart call.
  function continuationMessage(value) {
    const m=setupObject(value,['id','role','content','source']);if(!boundedText(m.id,128)||!Array.isArray(m.content)||m.content.length!==1)throw new Error('INVALID_RESPONSE');const part=setupObject(m.content[0],['type','text']);if(part.type!=='text'||!boundedText(part.text))throw new Error('INVALID_RESPONSE');
    if(m.role==='system'){setupObject(m.source,['kind']);if(m.source.kind!=='system-prompt')throw new Error('INVALID_RESPONSE');}
    else if(m.role==='user'){setupObject(m.source,['kind','form']);if(!ref(m.id)||!['df-context','df-audit-input'].includes(m.source.kind)||m.source.form!=='local')throw new Error('INVALID_RESPONSE');}
    else if(m.role==='assistant'){setupObject(m.source,['kind','provider','model']);if(m.source.kind!=='model'||!boundedText(m.source.provider,128)||!boundedText(m.source.model,256))throw new Error('INVALID_RESPONSE');}
    else throw new Error('INVALID_RESPONSE');return m;
  }
  function continuationBudget(value,nullable=false){setupObject(value,['attempts','runtimeMs','usageUnits','costEstimateMicros']);if(!Object.values(value).every(v=>integer(v)||nullable&&v===null))throw new Error('INVALID_RESPONSE');return value;}
  function continuationDescription(value){
    const d=setupObject(value,['taskRef','originRef','predecessor','ordinal','sessionRef','history','context','selection','effectiveReasoningEffort','environment','persistence','bounds','limits','charges','spent','remaining','systemPrompt']);
    if(![d.taskRef,d.originRef,d.sessionRef].every(ref)||!integer(d.ordinal)||d.ordinal<1||d.ordinal>8||d.effectiveReasoningEffort!=='deterministic')throw new Error('INVALID_RESPONSE');
    const p=setupObject(d.predecessor,['predecessorActionRef','predecessorClaimRef','predecessorGenerationRef','predecessorExecutionRef','artifactRef','artifactVersion','artifactDigest','releaseEvidenceRef']);if(p.artifactVersion!==1||!Object.entries(p).filter(([k])=>k!=='artifactVersion').every(([,v])=>ref(v)))throw new Error('INVALID_RESPONSE');
    const hist=setupObject(d.history,['header','eventsDigest','eventCount','surfaceDigest','messages','messagesDigest','historyBytes']),header=setupObject(hist.header,['version','id','createdAt','cwd','isSeeded','agentPreset'],['version','id','createdAt','cwd','isSeeded']);
    if(header.version!==4||header.isSeeded!==false||!boundedText(header.id,128)||!integer(header.createdAt)||!setupLocation(header.cwd)||header.agentPreset!==undefined&&!boundedText(header.agentPreset,128)||![hist.eventsDigest,hist.surfaceDigest,hist.messagesDigest].every(ref)||!integer(hist.eventCount)||hist.eventCount<1||hist.eventCount>96||!integer(hist.historyBytes)||hist.historyBytes>49152||!Array.isArray(hist.messages)||hist.messages.length<3||hist.messages.length>17)throw new Error('INVALID_RESPONSE');hist.messages.forEach(continuationMessage);
    const c=setupObject(d.context,['recordRef','digest','content']);if(!ref(c.recordRef)||!ref(c.digest)||!boundedText(c.content))throw new Error('INVALID_RESPONSE');workerSelection(d.selection);
    setupObject(d.environment,['root','cwd']);if(!setupLocation(d.environment.root)||!setupLocation(d.environment.cwd))throw new Error('INVALID_RESPONSE');
    const b=setupObject(d.persistence,['contractVersion','sourceRef','directory','compression','retention','encrypted']);if(b.contractVersion!=='df.native-backend/v1'||!ref(b.sourceRef)||!setupLocation(b.directory)||!['none','zstd'].includes(b.compression)||b.retention!=='owner-managed'||b.encrypted!==false)throw new Error('INVALID_RESPONSE');
    setupObject(d.bounds,['requestBytes','resultBytes']);if(!integer(d.bounds.requestBytes)||d.bounds.requestBytes<512||d.bounds.requestBytes>131072||!integer(d.bounds.resultBytes)||d.bounds.resultBytes<128||d.bounds.resultBytes>16384)throw new Error('INVALID_RESPONSE');
    const mutable=['queueCapacity','maxActive','maxAttempts','maxTotalAttempts','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros'],limits=['queueCapacity','maxActive','maxAttempts','maxTotalAttempts','maxTasks','maxActionsPerTask','maxEventsPerTask','maxMetadataBytes','maxDataBytes','maxRecordsPerTask','maxCommands','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros','maxControlCommands'];setupObject(d.limits,limits);for(const k of limits){const v=d.limits[k];if(!integer(v)||v<(mutable.includes(k)?0:k==='maxMetadataBytes'?256:1)||k!=='maxRuntimeMs'&&v>100000000)throw new Error('INVALID_RESPONSE');}
    setupObject(d.charges,['runtimeMs','usageUnits','costState','costEstimateMicros','costProvenanceRef']);if(!integer(d.charges.runtimeMs)||!integer(d.charges.usageUnits)||d.charges.costState!=='estimated'||d.charges.costEstimateMicros!==0||!ref(d.charges.costProvenanceRef))throw new Error('INVALID_RESPONSE');continuationBudget(d.spent);continuationBudget(d.remaining,true);
    if(d.systemPrompt!=='You are a dsh-fishball worker. Use only the approved task context supplied in this turn. Tools and external actions are unavailable.')throw new Error('INVALID_RESPONSE');return d;
  }
  function createContinuationModel(rpc, taskModel, {workerModel,clock=Date.now,uuid=()=>crypto.randomUUID(),digest=async text=>{
    const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
  }}={}) {
    let active=true,epoch=0,revision=0,ownRefresh=false;
    let state=freeze({contextRecordRef:null,predecessor:null,status:null,history:null,plan:null,approval:null,grant:null,worker:null,acceptedHistory:false,acceptedApproval:false,uncertain:null,busy:null,stale:true,error:null});
    const listeners=new Set(),controllers=new Set();
    const publish=update=>{if(active){state=freeze({...state,...update});for(const f of [...listeners])f();}};
    const task=()=>{const s=taskModel.getSnapshot();if(s.stale||s.phase!=='ready'||!s.detail?.task)throw new Error('STALE_VERSION');return s.detail.task;};
    const cas=t=>({taskRef:t.taskRef,expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch});
    const command=async()=>{const r=await digest(uuid());if(!ref(r))throw new Error('INVALID_COMMAND');return r;};
    const call=async(name,input)=>{const readEpoch=epoch,c=new AbortController();controllers.add(c);try{const out=setupObject(plainRpcReply(await rpc.call('/df-rpc',`v1/${name}`,input,c.signal)),['ok','value','error'],['ok']);if(readEpoch!==epoch||c.signal.aborted||!active)throw new Error('CONNECTION_CHANGED');if(out.ok!==true||!Object.hasOwn(out,'value')||Object.hasOwn(out,'error'))throw new Error('RESULT_UNCONFIRMED');return out.value;}finally{controllers.delete(c);}};
    let selected=null;
    const unsubscribe=taskModel.subscribe(()=>{const s=taskModel.getSnapshot(),t=s.detail?.task,key=t?`${t.taskRef}:${t.version}:${t.authEpoch}`:null;
      if(ownRefresh&&selected&&s.detail===null&&s.stale===true&&s.phase==='ready'&&s.selected===selected.split(':')[0])return;
      if(key!==selected){const old=selected;selected=key;revision++;if(ownRefresh&&t&&old&&old.split(':')[0]===t.taskRef)publish({stale:false,acceptedHistory:false,acceptedApproval:false});else publish({stale:true,history:null,approval:null,grant:null,acceptedHistory:false,acceptedApproval:false});if(old&&old.split(':')[0]!==s.selected)publish({contextRecordRef:null,predecessor:null,status:null,plan:null,worker:null});}
    });
    async function run(name,build,parse,mutation=false){if(!active||state.busy||mutation&&(state.stale||state.uncertain))return false;const r=revision,e=epoch;publish({busy:name,error:null});try{const t=task(),input=await build(t);if(r!==revision||e!==epoch)return false;const value=await call(name,input);if(r!==revision||e!==epoch)return false;const update=parse(value,t);publish(update);if(mutation){ownRefresh=true;try{await taskModel.refresh();}finally{ownRefresh=false;}if(name==='workerResume'&&(!workerModel||!workerModel.adoptResumedMapping({worker:state.worker,contextRecordRef:state.history?.description.context.recordRef})))throw new Error('WORKER_MAPPING_MISMATCH');}return true;}catch(error){if(e===epoch){publish({stale:true,error:'RESULT_UNCONFIRMED',history:null,approval:null,acceptedHistory:false,acceptedApproval:false,...(mutation?{uncertain:{operation:name,taskRef:taskModel.getSnapshot().selected}}:{})});}return false;}finally{if(active&&e===epoch)publish({busy:null});}}
    return Object.freeze({getSnapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
      chooseContext(recordRef){if(state.busy||state.plan||state.uncertain||!ref(recordRef))return false;const s=taskModel.getSnapshot();if(s.stale||s.phase!=='ready'||!s.detail?.task||s.detail.data.filter(d=>d.recordRef===recordRef&&d.kind==='context').length!==1)return false;revision++;publish({contextRecordRef:recordRef,history:null,approval:null,acceptedHistory:false,acceptedApproval:false});return true;},
      choosePredecessor(claimRef){if(state.busy)return false;const s=taskModel.getSnapshot();if(s.stale||!s.detail?.task)return false;const workers=s.detail.workers.filter(w=>w.claimRef===claimRef&&w.phase==='stopped');if(workers.length!==1)return false;const w=workers[0],actions=s.detail.actions.filter(a=>a.actionRef===w.actionRef&&a.claimRef===w.claimRef&&a.spec.role==='worker'),executions=s.detail.executions.filter(e=>e.claimRef===w.claimRef&&e.generationRef===w.generationRef&&e.actionRef===w.actionRef);if(actions.length!==1||executions.length!==1||!ref(executions[0].executionRef))return false;revision++;publish({predecessor:{predecessorActionRef:w.actionRef,predecessorClaimRef:w.claimRef,predecessorGenerationRef:w.generationRef,predecessorExecutionRef:executions[0].executionRef},status:null,history:null,plan:null,approval:null,worker:null,acceptedHistory:false,acceptedApproval:false,stale:false});return true;},
      status(){if(!state.predecessor)return Promise.resolve(false);return run('workerResumeStatus',t=>({...cas(t),...state.predecessor}),(v,t)=>{setupObject(v,['taskRef','sessionRef','originRef','ordinal','eligible','reasonCode','policyVersion','spent','remaining']);if(v.taskRef!==t.taskRef||typeof v.eligible!=='boolean'||!integer(v.policyVersion)||v.sessionRef!==null&&!ref(v.sessionRef)||v.originRef!==null&&!ref(v.originRef))throw new Error('INVALID_RESPONSE');if(v.ordinal!==null&&(!integer(v.ordinal)||v.ordinal<1||v.ordinal>8)||v.reasonCode!==null&&!['WORKER_RESUME_DISABLED','WORKER_RESUME_ORIGIN_UNAVAILABLE','WORKER_RESUME_LINEAGE_CONFLICT','WORKER_RESUME_HISTORY_LIMIT'].includes(v.reasonCode)||v.spent!==null&&!(continuationBudget(v.spent))||v.remaining!==null&&!(continuationBudget(v.remaining,true))||v.eligible&&[v.sessionRef,v.originRef,v.ordinal,v.spent,v.remaining].some(x=>x===null))throw new Error('INVALID_RESPONSE');return{status:copy(v)};});},
      prepare(contextRecordRef){if(!state.predecessor||!ref(contextRecordRef))return Promise.resolve(false);return run('workerResumePrepare',t=>({...cas(t),...state.predecessor,contextRecordRef}),(v,t)=>{setupObject(v,['previewRef','planDigest','expiresAt','taskVersion','authEpoch','description']);const d=continuationDescription(v.description);if(!ref(v.previewRef)||!ref(v.planDigest)||!integer(v.expiresAt)||v.expiresAt<=clock()||v.taskVersion!==t.version||v.authEpoch!==t.authEpoch||d.taskRef!==t.taskRef||d.context.recordRef!==contextRecordRef||d.effectiveReasoningEffort!=='deterministic'||!Array.isArray(d.history.messages)||d.history.messages.length<3||d.history.messages.length>17||JSON.stringify(state.predecessor)!==JSON.stringify(Object.fromEntries(Object.keys(state.predecessor).map(k=>[k,d.predecessor[k]]))))throw new Error('INVALID_RESPONSE');return{history:copy(v),stale:false,acceptedHistory:false};});},
      acceptHistory(value){if(typeof value!=='boolean'||state.stale||!state.history||state.history.expiresAt<=clock()){publish({acceptedHistory:false});return false;}publish({acceptedHistory:value});return true;},
      plan(){if(!state.acceptedHistory||!state.history||state.history.expiresAt<=clock())return Promise.resolve(false);return run('workerResumePlan',async t=>({...cas(t),commandRef:await command(),previewRef:state.history.previewRef,planDigest:state.history.planDigest,contextRecordRef:state.history.description.context.recordRef,accept:true}),v=>{setupObject(v,['action','historyRecordRef','historyDigest','resumeRef']);setupObject(v.action,['actionRef','actionDigest','taskVersion','authEpoch']);if(!integer(v.action.taskVersion)||v.action.taskVersion<1||!integer(v.action.authEpoch)||!ref(v.resumeRef)||!ref(v.historyRecordRef)||!ref(v.historyDigest)||!ref(v.action.actionRef)||!ref(v.action.actionDigest))throw new Error('INVALID_RESPONSE');return{plan:copy(v),grant:null,acceptedHistory:false};},true);},
      preview(){if(!state.plan||!state.history)return Promise.resolve(false);return run('workerResumePreview',t=>({...cas(t),actionRef:state.plan.action.actionRef,actionDigest:state.plan.action.actionDigest,recordRef:state.history.description.context.recordRef}),v=>{setupObject(v,['previewRef','taskRef','actionRef','actionDigest','taskVersion','authEpoch','expiresAt','description']);if(!ref(v.previewRef)||v.actionRef!==state.plan.action.actionRef||v.actionDigest!==state.plan.action.actionDigest||!integer(v.expiresAt)||v.expiresAt<=clock()||!v.description.resume)throw new Error('INVALID_RESPONSE');const d=setupObject(v.description,['kind','role','targetLabel','data','model','toolNames','environment','limits','evidenceRef','resume']);continuationDescription(d.resume);setupObject(d.data,['recordRef','digest','kind','content']);setupObject(d.model,['provider','model','reasoning','preset']);setupObject(d.environment,['label','cwd','environmentRef']);setupObject(d.limits,['units','attemptIndex','charges']);setupObject(d.limits.charges,['runtimeMs','usageUnits','costState','costEstimateMicros','costProvenanceRef']);if(d.kind!=='write'||d.role!=='worker'||!boundedText(d.targetLabel,4096)||!ref(d.evidenceRef)||!ref(d.data.recordRef)||!ref(d.data.digest)||d.data.kind!=='context'||!boundedText(d.data.content)||!Object.values(d.model).every(x=>boundedText(x,4096))||!Array.isArray(d.toolNames)||d.toolNames.length||!boundedText(d.environment.label,4096)||!setupLocation(d.environment.cwd)||!ref(d.environment.environmentRef)||d.limits.units!==1||d.limits.attemptIndex!==1||v.taskRef!==task().taskRef||v.taskVersion!==task().version||v.authEpoch!==task().authEpoch)throw new Error('INVALID_RESPONSE');return{approval:copy(v),acceptedApproval:false};});},
      acceptApproval(value){if(typeof value!=='boolean'||state.stale||!state.approval||state.approval.expiresAt<=clock())return false;publish({acceptedApproval:value});return true;},
      grant(expiresAt){if(!state.acceptedApproval||!state.approval||!integer(expiresAt)||expiresAt<=clock())return Promise.resolve(false);return run('workerResumeGrant',async t=>({...cas(t),commandRef:await command(),actionRef:state.plan.action.actionRef,actionDigest:state.plan.action.actionDigest,previewRef:state.approval.previewRef,expiresAt,accept:true}),v=>{setupObject(v,['task','taskVersion','authEpoch','actionRef','actionDigest','expiresAt']);workerTask(v.task);if(v.actionRef!==state.plan.action.actionRef||v.actionDigest!==state.plan.action.actionDigest||v.expiresAt!==expiresAt||v.taskVersion!==v.task.version||v.authEpoch!==v.task.authEpoch)throw new Error('INVALID_RESPONSE');return{approval:null,grant:copy({...v,expiresAt}),acceptedApproval:false};},true);},
      resume(){if(!state.plan||!state.grant||state.grant.expiresAt<=clock()||state.worker||state.approval||state.acceptedApproval)return Promise.resolve(false);return run('workerResume',async t=>({...cas(t),commandRef:await command(),actionRef:state.plan.action.actionRef,actionDigest:state.plan.action.actionDigest}),v=>{setupObject(v,['task','worker']);workerTask(v.task);setupObject(v.worker,['taskRef','actionRef','actionDigest','claimRef','reservationRef','generationRef','sessionRef','phase']);if(!['created','ready'].includes(v.worker.phase)||!Object.entries(v.worker).filter(([k])=>k!=='phase').every(([,x])=>ref(x))||v.worker.taskRef!==v.task.taskRef||v.worker.actionRef!==state.plan.action.actionRef||!ref(v.worker.claimRef)||!ref(v.worker.generationRef)||v.worker.sessionRef!==state.history.description.sessionRef)throw new Error('INVALID_RESPONSE');return{worker:copy(v.worker)};},true);},
      disconnected(){if(state.busy&&['workerResumePlan','workerResumeGrant','workerResume'].includes(state.busy))publish({uncertain:{operation:state.busy,taskRef:taskModel.getSnapshot().selected}});epoch++;revision++;for(const c of controllers)c.abort();publish({busy:null,stale:true,history:null,approval:null,acceptedHistory:false,acceptedApproval:false});},
      dispose(){active=false;epoch++;revision++;unsubscribe();for(const c of controllers)c.abort();listeners.clear();},
    });
  }
  function ContinuationCard({continuationModel,contextRecordRef}) {
    const state=React.useSyncExternalStore(continuationModel.subscribe,continuationModel.getSnapshot,continuationModel.getSnapshot);
    const [expiry,setExpiry]=React.useState('');
    const button=(text,callback,disabled=false)=>h('button',{type:'button',style:styles.button,disabled:disabled||Boolean(state.busy),onClick:callback},text);
    return h('section',{'aria-label':'Continue an owned worker'},h('h3',null,'Continue an owned worker'),h('p',null,'Load its complete stored conversation, review the new context and budget, then approve a separate continuation. Resuming leaves the worker idle until you explicitly run the new turn.'),
      button('Check saved outcome',()=>continuationModel.status(),Boolean(state.busy)||!state.predecessor),
      button('Load continuation history',()=>continuationModel.prepare(state.contextRecordRef??contextRecordRef),Boolean(state.busy)||state.stale||!state.status?.eligible||!ref(state.contextRecordRef??contextRecordRef)),
      state.history&&h('div',null,h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(state.history.description,null,2)),h('label',null,h('input',{type:'checkbox',checked:state.acceptedHistory,disabled:state.stale||Boolean(state.busy),onChange:e=>continuationModel.acceptHistory(e.target.checked)}),'I accept this complete history, new context and shared budget'),button('Plan this continuation',()=>continuationModel.plan(),!state.acceptedHistory||Boolean(state.busy)||Boolean(state.uncertain))),
      state.plan&&button('Load exact approval',()=>continuationModel.preview(),Boolean(state.busy)||state.stale||Boolean(state.uncertain)),
      state.approval&&h('div',null,h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(state.approval.description,null,2)),h('label',null,h('input',{type:'checkbox',checked:state.acceptedApproval,onChange:e=>continuationModel.acceptApproval(e.target.checked),disabled:state.stale||Boolean(state.busy)}),'I approve this exact continuation scope'),h('label',null,'Approval expiry',h('input',{type:'datetime-local',value:expiry,onChange:e=>setExpiry(e.target.value)})),button('Grant exact continuation',()=>continuationModel.grant(Date.parse(expiry)),!state.acceptedApproval||!integer(Date.parse(expiry))||Boolean(state.busy)||Boolean(state.uncertain))),
      button('Resume this worker idle',()=>continuationModel.resume(),!state.plan||!state.grant||Boolean(state.worker)||Boolean(state.approval)||state.stale||Boolean(state.busy)||Boolean(state.uncertain)),
      state.worker&&h('p',{role:'status'},`Owned continuation: ${state.worker.phase}. Run its approved new context explicitly from worker controls.`),state.uncertain&&h('p',{role:'status'},'The last outcome is unconfirmed. No retry is available until the host reconciles the saved command.'),
    );
  }
  function createOwnerFinishRecoveryModel(rpc,taskModel){
    let active=true,epoch=0,revision=0,state=freeze({execution:null,commands:[],command:null,busy:null,error:null,stale:true});const listeners=new Set(),controllers=new Set();
    const publish=v=>{if(active){state=freeze({...state,...v});for(const f of [...listeners])f();}};
    const selected=()=>{const s=taskModel.getSnapshot();if(s.phase!=='ready'||!s.detail?.task||s.selected!==s.detail.task.taskRef)throw new Error('TASK_UNAVAILABLE');return s.detail.task.taskRef;};
    const unsubscribe=taskModel.subscribe(()=>{revision++;publish({stale:true});if(state.execution&&taskModel.getSnapshot().selected!==state.execution.taskRef)publish({execution:null,commands:[],command:null});});
    async function read(name,value,parse){if(!active||state.busy)return false;const e=epoch,r=revision,c=new AbortController();controllers.add(c);publish({busy:name,error:null});try{if(selected()!==value.taskRef)return false;const out=setupObject(plainRpcReply(await rpc.call('/df-rpc',`v1/${name}`,value,c.signal)),['ok','value','error'],['ok']);if(e!==epoch||r!==revision||!active||c.signal.aborted)return false;if(out.ok!==true||!Object.hasOwn(out,'value')||Object.hasOwn(out,'error'))throw new Error('RESULT_UNCONFIRMED');publish(parse(out.value));return true;}catch{if(e===epoch&&r===revision)publish({error:'RESULT_UNCONFIRMED',stale:true});return false;}finally{controllers.delete(c);if(active&&e===epoch)publish({busy:null});}}
    return Object.freeze({getSnapshot:()=>state,subscribe(f){listeners.add(f);return()=>listeners.delete(f);},
      chooseExecution(executionRef){if(state.busy||!ref(executionRef))return false;const s=taskModel.getSnapshot();if(s.phase!=='ready'||!s.detail?.task||s.selected!==s.detail.task.taskRef||!Array.isArray(s.detail.executions))return false;const taskRef=selected(),rows=s.detail.executions.filter(x=>x.executionRef===executionRef);if(rows.length!==1)return false;const row=rows[0],keys=['actionRef','claimRef','generationRef'];if(!keys.every(k=>ref(row[k]))||s.detail.actions.filter(x=>x.actionRef===row.actionRef&&x.claimRef===row.claimRef).length!==1)return false;revision++;publish({execution:{taskRef,executionRef,...Object.fromEntries(keys.map(k=>[k,row[k]]))},commands:[],command:null,stale:true});return true;},
      list(){if(!state.execution)return Promise.resolve(false);return read('ownerNativeFinishCommands',state.execution,value=>{setupObject(value,['commands']);if(!Array.isArray(value.commands)||value.commands.length>16)throw new Error('INVALID_RESPONSE');for(const row of value.commands){setupObject(row,['commandRef','state']);if(!ref(row.commandRef)||!['intent_committed','finish_committed','legacy_unrestorable'].includes(row.state))throw new Error('INVALID_RESPONSE');}return{commands:copy(value.commands)};});},
      restore(commandRef){if(!state.execution||!ref(commandRef)||state.commands.filter(x=>x.commandRef===commandRef).length!==1)return Promise.resolve(false);return read('ownerNativeFinishCommand',{taskRef:state.execution.taskRef,commandRef},value=>{setupObject(value,['state','request','ownerRequestDigest','settlement']);if(['unreceived','legacy_unrestorable'].includes(value.state)){if(value.request!==null||value.ownerRequestDigest!==null||value.settlement!==null)throw new Error('INVALID_RESPONSE');return{command:copy(value)};}if(!['intent_committed','finish_committed'].includes(value.state)||!ref(value.ownerRequestDigest))throw new Error('INVALID_RESPONSE');const q=setupObject(value.request,['taskRef','actionRef','claimRef','generationRef','executionRef','commandRef','expectedTaskVersion','expectedAuthEpoch']);if(!['taskRef','actionRef','claimRef','generationRef','executionRef','commandRef'].every(k=>ref(q[k]))||q.commandRef!==commandRef||Object.entries(state.execution).some(([k,v])=>q[k]!==v)||!integer(q.expectedTaskVersion)||q.expectedTaskVersion<1||!integer(q.expectedAuthEpoch))throw new Error('INVALID_RESPONSE');if(value.state==='intent_committed'&&value.settlement!==null)throw new Error('INVALID_RESPONSE');if(value.state==='finish_committed'){const out=setupObject(value.settlement,['task','claimRef','reservationRef','reservationHeld','outcome','terminalEvidenceRef','releaseEvidenceRef'],['task','claimRef','reservationRef','reservationHeld','outcome']);workerTask(out.task);if(out.task.taskRef!==q.taskRef||out.claimRef!==q.claimRef||!ref(out.reservationRef)||typeof out.reservationHeld!=='boolean'||!['completed','failed','unknown','terminated'].includes(out.outcome)||out.terminalEvidenceRef!==undefined&&!ref(out.terminalEvidenceRef)||out.releaseEvidenceRef!==undefined&&!ref(out.releaseEvidenceRef))throw new Error('INVALID_RESPONSE');}return{command:copy(value)};});},
      disconnected(){epoch++;revision++;for(const c of controllers)c.abort();publish({busy:null,stale:true});},dispose(){active=false;epoch++;revision++;unsubscribe();for(const c of controllers)c.abort();listeners.clear();},
    });
  }
  function OwnerFinishRecoveryCard({recoveryModel}){const s=React.useSyncExternalStore(recoveryModel.subscribe,recoveryModel.getSnapshot,recoveryModel.getSnapshot);const button=(text,callback,disabled=false)=>h('button',{type:'button',style:styles.button,disabled:disabled||Boolean(s.busy),onClick:callback},text);return h('section',{'aria-label':'Saved owner finish commands'},h('h3',null,'Saved owner finish commands'),h('p',null,'Read the original request and recorded outcome. An unconfirmed command stays held; reading it does not repeat stop, collect or finish.'),button('Read saved commands',()=>recoveryModel.list(),Boolean(s.busy)||!s.execution),s.commands.map(c=>button(`Read ${c.state}`,()=>recoveryModel.restore(c.commandRef),Boolean(s.busy))),s.command&&h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(s.command,null,2)),s.error&&h('p',{role:'status'},s.error));}
  function apply(ctx) {
    if (!ctx.connection?.rpc || !ctx.slots || !ctx.layout) throw new Error('CLIENT_CAPABILITY_UNAVAILABLE');
    const model = createModel(ctx.connection.rpc, { navigateSession: typeof ctx.uiWorkspace?.openSession === 'function' ? id => ctx.uiWorkspace.openSession(id) : undefined });
    const setupModel = createSetupModel(ctx.connection.rpc);
    const workerModel = createWorkerModel(ctx.connection.rpc, model);
    const auditModel=createAuditModel(ctx.connection.rpc,model,workerModel);
    const continuationModel=createContinuationModel(ctx.connection.rpc,model,{workerModel}),recoveryModel=createOwnerFinishRecoveryModel(ctx.connection.rpc,model);
    const generation = ctx.connection.generation;
    let active = true, ready = false, recoveryRevision = 0;
    const currentGeneration = () => generation?.getSnapshot();
    const connectionReady = () => !generation || Boolean(currentGeneration());
    function invalidateModels() {
      recoveryRevision++;
      continuationModel.disconnected(); recoveryModel.disconnected(); auditModel.disconnected(); workerModel.disconnected(); model.disconnected();
    }
    async function refreshReadyModels() {
      const read = recoveryRevision, observedGeneration = currentGeneration();
      await model.refresh();
      // Task selection refresh invalidates worker reads. Refresh cached worker
      // status only after those task reads settle, within the same generation.
      if (active && read === recoveryRevision && connectionReady() && currentGeneration() === observedGeneration && setupModel.getSnapshot().phase === 'ready') await workerModel.refresh();
    }
    const unsubscribe = setupModel.subscribe(() => {
      const phase = setupModel.getSnapshot().phase, current = phase === 'ready';
      const wasReady = ready; ready = current;
      if (phase === 'loading' || phase === 'offline' || (!current && wasReady)) invalidateModels();
      if (current && !wasReady && connectionReady()) void refreshReadyModels();
    });
    async function refreshSetup() {
      if (!active || !connectionReady()) return;
      const observedGeneration = currentGeneration();
      const pending = setupModel.refresh(), read = recoveryRevision;
      await pending;
      if (active && read === recoveryRevision && connectionReady() && currentGeneration() === observedGeneration && setupModel.getSnapshot().routeMissing) await model.refresh();
    }
    ctx.effect(() => () => { active = false; recoveryRevision++; unsubscribe(); continuationModel.dispose(); recoveryModel.dispose(); auditModel.dispose(); workerModel.dispose(); setupModel.dispose(); model.dispose(); }, 'df.client-model');
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'df', inject: () => ({ model, setupModel, workerModel, auditModel, continuationModel, recoveryModel }) }, Panel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'df', order: 70, label: 'dsh-fishball' }, Icon));
    ctx.on('connection/reset', () => { setupModel.disconnected(); void refreshSetup(); });
    const state = ctx.connection.state;
    if (state?.subscribe) ctx.effect(() => state.subscribe(() => { if (!connectionReady()) setupModel.disconnected(); }), 'df.connection-state');
    // The public host emits connected state before publishing its generation.
    // Observe generation establishment as well as loss to recover from that gap.
    if (generation?.subscribe) ctx.effect(() => generation.subscribe(() => { setupModel.disconnected(); if (connectionReady()) void refreshSetup(); }), 'df.connection-generation');
    if (connectionReady()) void refreshSetup(); else setupModel.disconnected();
  }
  return { inject: ['connection', 'slots', 'layout', 'uiWorkspace'], apply, createModel, createSetupModel, createWorkerModel, createAuditModel, createContinuationModel, ContinuationCard, createOwnerFinishRecoveryModel, OwnerFinishRecoveryCard, Panel, Icon };
};

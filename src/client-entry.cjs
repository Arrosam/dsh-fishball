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
        const result = await rpc.call('/df-rpc', `v1/${endpoint}`, payload, controller.signal);
        if (!active) throw new Error('SERVICE_DISPOSED');
        if (epoch !== connectionEpoch) throw new Error('CONNECTION_CHANGED');
        if (!result?.ok) throw new Error(publicError(result?.error?.code));
        return result.value;
      } finally { controllers.delete(controller); }
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

  const styles = {
    panel: { padding: '24px', maxWidth: '1100px', margin: '0 auto', color: 'var(--dsw-alias-label-primary)', overflowWrap: 'anywhere', height: '100%', overflow: 'auto', boxSizing: 'border-box' },
    button: { padding: '8px 12px', border: '1px solid var(--dsw-alias-border-primary, #aaa)', borderRadius: '8px', background: 'var(--dsw-alias-surface-primary, transparent)', color: 'inherit', cursor: 'pointer', minHeight: '36px' },
    card: { border: '1px solid var(--dsw-alias-border-primary, #aaa)', borderRadius: '12px', padding: '16px', marginBottom: '12px', minWidth: 0 },
    row: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
  };
  function Icon({ size = 20 }) { return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true }, h('circle', { cx: 8, cy: 8, r: 5, stroke: 'currentColor', strokeWidth: 1.6 }), h('circle', { cx: 17, cy: 16, r: 4, stroke: 'currentColor', strokeWidth: 1.6 }), h('circle', { cx: 6, cy: 19, r: 2, fill: 'currentColor' })); }
  function Panel({ model }) {
    const state = React.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
    const [draft, setDraft] = React.useState('');
    const [approvalExpiry, setApprovalExpiry] = React.useState('');
    const [goalEdit, setGoalEdit] = React.useState(''), [constraintsEdit, setConstraintsEdit] = React.useState('');
    const [answers, setAnswers] = React.useState({});
    const [, setClockTick] = React.useState(0);
    React.useEffect(() => { const timer = setInterval(() => setClockTick(value => value + 1), 1000); return () => clearInterval(timer); }, [model]);
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
      h('div', { style: { ...styles.row, justifyContent: 'space-between' } }, h('h1', null, 'dsh-fishball ', h('small', { style: { fontSize: '12px', fontWeight: 400 } }, 'Preview')), button('Refresh', () => model.refresh(), state.busy, { 'aria-label': 'Refresh tasks from the host' })),
      h('p', { role: 'status', 'aria-live': 'polite' }, state.phase === 'loading' ? 'Loading current tasks…' : state.phase === 'offline' ? 'Host disconnected. Controls are unavailable until a current snapshot is loaded.' : state.updatedAt === null ? 'No current snapshot' : `Snapshot refreshed ${new Date(state.updatedAt).toLocaleString()}${state.stale ? ' · stale' : ''}`),
      state.error && h('div', { role: 'alert', style: styles.card }, errorLabels[state.error] || 'The result is not confirmed. Refresh the host state before trying another action.'),
      h('form', { onSubmit: async event => { event.preventDefault(); if (await model.intake(draft)) setDraft(''); }, style: styles.card }, h('label', { htmlFor: 'df-goal' }, 'New task'), h('textarea', { id: 'df-goal', value: draft, onChange: event => setDraft(event.target.value), rows: 3, maxLength: 16000, disabled: state.busy || state.phase === 'offline', style: { display: 'block', width: '100%', boxSizing: 'border-box', margin: '8px 0', font: 'inherit', resize: 'vertical' } }), h('button', { type: 'submit', disabled: !draft.trim() || state.busy || state.phase === 'offline', style: styles.button }, state.busy ? 'Submitting…' : 'Create task')),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' } },
        h('nav', { 'aria-label': 'Tasks', style: { flex: '1 1 230px', minWidth: 0 } }, state.tasks.length === 0 && state.phase === 'ready' ? h('p', null, 'No tasks yet.') : state.tasks.map(value => h('button', { key: value.taskRef, type: 'button', onClick: () => model.select(value.taskRef), 'aria-current': value.taskRef === state.selected ? 'page' : undefined, style: { ...styles.button, display: 'block', width: '100%', textAlign: 'left', marginBottom: '8px' } }, `Task ${value.taskRef.slice(0, 8)}`, h('span', { style: { display: 'block', fontSize: '12px', marginTop: '4px' } }, `${label(value.status)} · version ${value.version}`)))),
        h('main', { 'aria-label': 'Task details', style: { flex: '3 1 420px', minWidth: 0 } }, !task ? h('p', null, state.phase === 'loading' ? 'Loading task details…' : 'Select a task to inspect its current state.') : h(React.Fragment, null,
          h('div', { style: styles.card }, h('h2', null, goal || `Task ${task.taskRef.slice(0, 8)}`), h('p', null, `${label(task.status)} · version ${task.version} · approval epoch ${task.authEpoch}`), h('p', null, `Host update ${new Date(task.updatedAt).toLocaleString()}`), h('div', { style: styles.row }, button('Pause new work', () => model.control('pause'), !current || terminal.has(task.status) || state.detail.control === 'paused'), button('Continue', () => model.control('resume'), !current || terminal.has(task.status) || state.detail.control !== 'paused' || ['cancel_requested', 'recovery_required'].includes(task.status)), button('Request cancellation', () => model.control('cancel'), !current || terminal.has(task.status) || task.status === 'cancel_requested')), h('p', { style: { fontSize: '13px' } }, 'Pause stops new admission. Cancellation remains requested until the host confirms work and effects.')),
          h('div', { style: styles.card }, h('h3', null, 'Workers'), state.detail.workers.length ? state.detail.workers.map(worker => h('div', { key: worker.claimRef }, h('p', null, `${worker.phase || 'Unknown'} · generation ${worker.generationRef}${worker.handoff?.state === 'pending' ? ' · waiting for owner handoff' : ''}`), button('Open owned session', () => model.openWorker(worker.claimRef), !current || !model.canNavigate || !ref(worker.sessionRef) || ['stopped', 'not_created'].includes(worker.phase)), h('p', null, !model.canNavigate ? 'Host session navigation is unavailable.' : ['stopped', 'not_created'].includes(worker.phase) ? 'This incarnation is stopped; navigation does not recreate or resume it.' : 'The host must confirm the exact current owned mapping before navigation.'))) : h('p', null, 'No worker execution admitted.')),
          revisionEditor, clarificationView, artifactView, auditView,
          h('div', { style: styles.card }, h('h3', null, 'Action scope and approval'), state.detail.actions.length ? state.detail.actions.map(approval) : h('p', null, 'No proposed actions.')),
          h('div', { style: styles.card }, h('h3', null, 'Task records and results'), state.records.filter(record => record.kind !== 'goal').map(record => h('details', { key: record.recordRef }, h('summary', null, record.kind), h('pre', { style: { whiteSpace: 'pre-wrap', font: 'inherit', overflowWrap: 'anywhere' } }, record.content))), state.detail.artifacts?.length ? h('p', null, `${state.detail.artifacts.length} artifact record(s). Verification and delivery are separate facts.`) : h('p', null, 'No verified artifact recorded.')),
        )),
      ),
      automationView,
    );
  }
  function apply(ctx) {
    if (!ctx.connection?.rpc || !ctx.slots || !ctx.layout) throw new Error('CLIENT_CAPABILITY_UNAVAILABLE');
    const model = createModel(ctx.connection.rpc, { navigateSession: typeof ctx.uiWorkspace?.openSession === 'function' ? id => ctx.uiWorkspace.openSession(id) : undefined });
    ctx.effect(() => () => model.dispose(), 'df.client-model');
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'df', inject: () => ({ model }) }, Panel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'df', order: 70, label: 'dsh-fishball' }, Icon));
    ctx.on('connection/reset', () => { model.disconnected(); void model.refresh(); });
    const state = ctx.connection.state;
    if (state?.subscribe) ctx.effect(() => state.subscribe(() => { if (!ctx.connection.generation?.getSnapshot()) model.disconnected(); }), 'df.connection-state');
    void model.refresh();
  }
  return { inject: ['connection', 'slots', 'layout', 'uiWorkspace'], apply, createModel, Panel, Icon };
};

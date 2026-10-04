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
    RESERVATION_HELD: 'Work or effects remain unconfirmed. Cancellation is still pending.',
  };
  const publicError = code => typeof code === 'string' && /^[A-Z][A-Z_]{0,63}$/.test(code) ? code : 'RESULT_UNCONFIRMED';
  const safeTask = task => {
    if (!task || !ref(task.taskRef) || !integer(task.version) || task.version < 1 || !integer(task.authEpoch) || !integer(task.updatedAt) || !['queued', 'running', 'waiting', 'blocked', 'completed', 'failed', 'cancel_requested', 'cancelled', 'recovery_required', 'deleted'].includes(task.status)) throw new Error('INVALID_RESPONSE');
    return Object.freeze({ taskRef: task.taskRef, status: task.status, version: task.version, authEpoch: task.authEpoch, updatedAt: task.updatedAt });
  };
  const label = status => ({ queued: 'Queued', running: 'Active', waiting: 'Waiting', blocked: 'Blocked', completed: 'Completed', failed: 'Failed', cancel_requested: 'Cancellation requested', cancelled: 'Cancelled', recovery_required: 'Needs reconciliation', deleted: 'Deleted' }[status] || 'Unknown');
  function createModel(rpc, { clock = Date.now, uuid = () => crypto.randomUUID(), digest = async text => {
    const bytes = new TextEncoder().encode(text), hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  } } = {}) {
    let active = true, revision = 0, detailRevision = 0, mutation = false, connectionEpoch = 0;
    let state = Object.freeze({ tasks: [], selected: null, detail: null, records: [], previews: Object.freeze({}), previewBusy: null, phase: 'loading', error: null, busy: false, updatedAt: null, stale: true });
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
        publish({ tasks: Object.freeze(tasks), detail: Object.freeze({ ...snapshot, task }), records: Object.freeze(records), stale: false, phase: 'ready', error: null, updatedAt: clock() });
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
    return Object.freeze({
      getSnapshot: () => state,
      subscribe(listener) { if (!active || typeof listener !== 'function' || listeners.size >= 256) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
      refresh, select, control, intake, previewAction, grantAction, now: clock,
      disconnected() { connectionEpoch++; revision++; detailRevision++; for (const controller of controllers) controller.abort(); publish({ phase: 'offline', stale: true, error: null, previews: Object.freeze({}), previewBusy: null }); },
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
    const [, setClockTick] = React.useState(0);
    React.useEffect(() => { const timer = setInterval(() => setClockTick(value => value + 1), 1000); return () => clearInterval(timer); }, [model]);
    const task = state.detail?.task, current = task && !state.stale && !state.busy;
    const button = (text, action, disabled, extra = {}) => h('button', { type: 'button', onClick: action, disabled, style: styles.button, ...extra }, text);
    const goal = state.records.filter(record => record.kind === 'goal').at(-1)?.content;
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
          h('div', { style: styles.card }, h('h3', null, 'Workers'), state.detail.workers.length ? state.detail.workers.map(worker => h('p', { key: worker.claimRef }, `${worker.phase || 'Unknown'} · generation ${String(worker.generationRef).slice(0, 8)}${worker.handoff?.state === 'pending' ? ' · waiting for owner handoff' : ''}`)) : h('p', null, 'No worker execution admitted.')),
          h('div', { style: styles.card }, h('h3', null, 'Action scope and approval'), state.detail.actions.length ? state.detail.actions.map(approval) : h('p', null, 'No proposed actions.')),
          h('div', { style: styles.card }, h('h3', null, 'Task records and results'), state.records.filter(record => record.kind !== 'goal').map(record => h('details', { key: record.recordRef }, h('summary', null, record.kind), h('pre', { style: { whiteSpace: 'pre-wrap', font: 'inherit', overflowWrap: 'anywhere' } }, record.content))), state.detail.artifacts?.length ? h('p', null, `${state.detail.artifacts.length} artifact record(s). Verification and delivery are separate facts.`) : h('p', null, 'No verified artifact recorded.')),
        )),
      ),
    );
  }
  function apply(ctx) {
    if (!ctx.connection?.rpc || !ctx.slots || !ctx.layout) throw new Error('CLIENT_CAPABILITY_UNAVAILABLE');
    const model = createModel(ctx.connection.rpc);
    ctx.effect(() => () => model.dispose(), 'df.client-model');
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'df', inject: () => ({ model }) }, Panel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'df', order: 70, label: 'dsh-fishball' }, Icon));
    ctx.on('connection/reset', () => { model.disconnected(); void model.refresh(); });
    const state = ctx.connection.state;
    if (state?.subscribe) ctx.effect(() => state.subscribe(() => { if (!ctx.connection.generation?.getSnapshot()) model.disconnected(); }), 'df.connection-state');
    void model.refresh();
  }
  return { inject: ['connection', 'slots', 'layout'], apply, createModel, Panel, Icon };
};

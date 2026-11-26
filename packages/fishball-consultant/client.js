/** Browser settings for the consultant row. The member's own DSH client is loaded in both install modes. */
window.__ModuleLoader__.load({
  id: 'fishball-consultant',
  factory(require) {
    const React = require('react')
    const { Button, Input, Modal, SettingsForm, SettingsFormModel, SettingsValueField, settingsNumberField } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    // Browser copy of the small public settings/HTTP contract; this factory cannot import Node modules.
    const ROW = 'fishball-consultant'
    const SLOT = 'plugins.row.config'
    const ROW_KEYS = Object.freeze(['fishball-consultant#fishball-consultant', 'fishball-amenities#fishball-consultant'])
    const API_PREFIX = '/api/' + ROW + '/'
    const URLS = Object.freeze({ discovery: 'discovery', list: 'list', detail: 'detail', create: 'create-topic', discard: 'discard', reconcile: 'reconcile', decision: 'decision' })
    const FIELD = Object.freeze({ target: 'targetId', epoch: 'endpointEpoch', workspace: 'workspaceId', model: 'model', effort: 'reasoningEffort', subject: 'asksPerSubject', day: 'asksPerDay', paused: 'paused' })
    const S = Object.freeze({ open: 'open', archived: 'archived', cleanup: 'cleanup-pending', awaiting: 'awaiting-consent', closeRequested: 'awaiting-user-close', unconfirmed: 'unconfirmed', accepted: 'accepted', sending: 'sending', advice: 'advice', empty: 'empty', stopped: 'stopped', failed: 'failed' })
    const TARGET_CONNECTED = 'connected'
    const TAB = Object.freeze({ config: 'configuration', threads: 'threads' })
    const DECISION = Object.freeze({ allow: 'allow', decline: 'decline' })
    const VIEW_READY = 'ready'
    const SUMMARY = 'summary'
    const EMPTY = ''
    const MIN_POSITIVE = 1
    const TITLE_BYTES = 256
    const BUDGET_FIELDS = Object.freeze([FIELD.subject, FIELD.day])
    const DESTINATION_FIELDS = Object.freeze([FIELD.target, FIELD.epoch, FIELD.workspace, FIELD.model, FIELD.effort])
    const FORM_LABELS = Object.freeze(['unavailable', 'readOnly', 'saveFailed', 'save', 'saving'])
    const ACTION = Object.freeze({ small: 'sm', outlined: 'outline', primary: 'primary' })
    const POST = Object.freeze({ method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: Object.freeze({ 'content-type': 'application/json' }) })
    const STYLE = Object.freeze({
      page: { display: 'grid', gap: '16px', minWidth: 0 },
      group: { display: 'grid', gap: '8px', minWidth: 0 },
      actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' },
      card: { display: 'grid', gap: '8px', minWidth: 0, border: '1px solid var(--dsw-alias-border-weak)', borderRadius: '8px', padding: '12px' },
      select: { width: '100%', minWidth: 0, padding: '6px', border: '1px solid var(--dsw-alias-border-weak)', borderRadius: '6px', background: 'var(--dsw-alias-surface-primary)', color: 'var(--dsw-alias-label-primary)', font: 'inherit' },
      title: { margin: 0, overflowWrap: 'anywhere' },
      text: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
      caption: { margin: 0, color: 'var(--dsw-alias-label-secondary)', overflowWrap: 'anywhere' },
      ledger: { margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 12px' },
      value: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
    })

    const en = Object.freeze({
      summary: 'Configure an advisory-only model and review consultation threads. Fishball decides what to do.',
      [TAB.config]: 'Configuration', [TAB.threads]: 'Consultation threads', navigation: 'Consultant settings',
      destination: 'Consultation destination', [FIELD.target]: 'Paired DSH target', [FIELD.epoch]: 'Endpoint epoch', [FIELD.workspace]: 'Neutral workspace',
      [FIELD.model]: 'Consultant model (provider/model)', [FIELD.effort]: 'Reasoning effort',
      chooseTarget: 'Choose a target', chooseWorkspace: 'Choose a workspace', chooseModel: 'Choose a model', noEffort: 'Do not specify an effort',
      targetOption: '{name} ({id}, epoch {epoch})', stored: '{value} — saved, unavailable', unavailableOption: '{value} — unavailable',
      modelOption: '{label} ({route})', refreshCatalog: 'Refresh catalog', catalogLoading: 'Reading the catalog…',
      catalogFailed: 'The consultant catalog could not be read. Saved selections have not changed.', catalogIncomplete: 'The selected endpoint did not provide a complete catalog. No replacement will be selected.',
      noTargets: 'No paired targets are listed.', noWorkspaces: 'No eligible workspace is listed for this endpoint.', noModels: 'No available model is listed for this endpoint.',
      workspaceNote: 'A workspace is a place to put the session, not permission to read files.', noDefault: 'Nothing is selected by default. The consultant never uses Fishball’s model as a fallback.',
      configureModel: 'Explicitly choose a destination and an available consultant model. No default is used.',
      missingGuarantee: 'Consultation is blocked: this connector cannot guarantee an advisory-only session, exact authorized inputs, or receipts tied to each request. No brief will be sent, no session created, and no model called.',
      missingCore: 'Consultation is unavailable without a compatible Fishball core. Local records are separate.',
      targetUnavailable: 'The selected target, workspace or model catalog is unavailable. Restore the connection or review the saved choices.',
      ready: 'Destination verified. A one-time disclosure approval is still required for each question.',
      unavailableState: 'Consultation availability could not be verified.', budgetExceeded: 'A consultation limit has been reached. Use existing advice rather than resending.',
      paused: 'Pause new consultations', pausedState: 'New consultations are paused.', pauseNote: 'Pausing does not cancel an in-flight request. History and cleanup remain available.',
      disclosure: 'Disclosure and execution', disclosurePolicy: 'Every question needs one-time owner approval of the exact brief, destination and any replayed history. Model selection and ordinary chat question cards do not authorize disclosure. The consultant only returns advice and cannot execute. No automatic resend or fallback.',
      budgets: 'Consultation limits', [FIELD.subject]: 'Maximum asks per subject', [FIELD.day]: 'Maximum asks per profile per day (UTC)',
      budgetNote: 'Limits count requests, not money. Changing a limit applies to future dispatches; it does not recall sent requests. The daily limit resets at midnight UTC.',
      budgetDay: 'UTC budget day: {day}', counts: '{used} used · {reserved} reserved · limit {limit}',
      countOnly: '{used} used · {reserved} reserved', unknown: 'Unknown', none: 'None',
      unavailable: 'The consultant row is not available.', readOnly: 'Settings here are read-only.', saveFailed: 'The settings change was not confirmed.',
      save: 'Save limits', saving: 'Saving…', overridden: 'Set', reset: 'Reset', invalid: 'Enter a positive whole number.',
      loading: 'Loading consultation records…', readFailed: 'Consultation records could not be loaded.', refresh: 'Refresh records',
      activeThreads: 'Open and pending', archivedThreads: 'Archived', emptyThreads: 'No open or pending threads.', emptyArchived: 'No archived threads.',
      createTitle: 'Topic title', create: 'Create topic', createFresh: 'Start a fresh topic', newTopicNote: 'Creates a local topic with its own ID, no history or approval, and no remote session. It does not send a question or reset the daily budget.',
      invalidTitle: 'Enter a non-empty title of at most {limit} UTF-8 bytes.', topic: 'Topic', task: 'Task',
      viewThread: 'View thread: {title}', back: 'Back to threads', thread: 'Thread', status: 'Status', session: 'Consultant session',
      requests: 'Requests and receipts', noRequests: 'No requests. Opening or creating a topic does not send anything.',
      discard: 'Discard thread', discardTitle: 'Discard “{title}”?', discardConfirm: 'Confirm discard', cancel: 'Cancel', close: 'Close',
      discardNote: 'This closes the thread to new questions and asks the original target to stop and archive any consultant session. Until verified, cleanup stays pending. Records are kept; this does not erase history, the task, or the Fishball conversation.',
      outstanding: 'Outstanding requests: {count}', reconcile: 'Check original status', reconcileNote: 'Check the original request or cleanup without resending a question or spending another ask.',
      archiveNote: 'This is a read-only archive. It keeps the records but cannot restore the old session or approvals.', cleanupNotice: 'Sending is closed. Stop and archive are not yet verified at the original target.',
      actionFailed: 'The action was not confirmed. Refresh records to check the saved state before proceeding.',
      receipt: 'Request {id}', question: 'Question', evidence: 'Evidence', history: 'Prior content replayed in this request', noHistory: 'No prior content is replayed.', instruction: 'Fixed consultant instruction',
      advice: 'Consultant advice (not a Fishball decision)', result: 'Result', truncated: 'Displayed advice is truncated.', inputTokens: 'Input tokens', outputTokens: 'Output tokens', cost: 'Consultant cost',
      approval: 'Review before sending', approvalNote: 'Allow only this exact request, including the recipient and the full brief and history shown here. If accepted, it may count against the budget and incur provider charges. This does not authorize execution.',
      approvalUnavailable: 'A complete, verifiable disclosure is not available. This request cannot be authorized from here.', allow: 'Allow this brief once', decline: 'Do not send',
      'state.open': 'Open', 'state.archived': 'Archived', 'state.cleanup-pending': 'Cleanup pending', 'state.awaiting-consent': 'Awaiting disclosure approval',
      'state.awaiting-user-close': 'Awaiting owner confirmation to close', 'state.unconfirmed': 'Delivery unconfirmed', 'state.accepted': 'Accepted; awaiting receipt',
      'state.declined': 'Declined', 'state.refused': 'Refused', 'state.closed': 'Closed', 'state.sending': 'Sending', 'state.not-delivered': 'Not delivered',
      'state.advice': 'Advice received', 'state.empty': 'No advice returned', 'state.stopped': 'Stopped', 'state.failed': 'Failed',
      'state.connected': 'Connected', 'state.connecting': 'Connecting', 'state.not-set': 'Not connected',
    })
    const zh = Object.freeze({
      summary: '配置只提供建议的模型、查看顾问线程。由 Fishball 决定怎么做。',
      [TAB.config]: '配置', [TAB.threads]: '顾问线程', navigation: '顾问设置',
      destination: '咨询目标', [FIELD.target]: '已配对的 DSH 目标', [FIELD.epoch]: '端点代次', [FIELD.workspace]: '中性工作区',
      [FIELD.model]: '顾问模型（供应商/模型）', [FIELD.effort]: '推理强度',
      chooseTarget: '请选择目标', chooseWorkspace: '请选择工作区', chooseModel: '请选择模型', noEffort: '不指定推理强度',
      targetOption: '{name}（{id}，代次 {epoch}）', stored: '{value}（已保存，当前不可用）', unavailableOption: '{value}（不可用）',
      modelOption: '{label}（{route}）', refreshCatalog: '刷新目录', catalogLoading: '正在读取目录…',
      catalogFailed: '无法读取顾问目录，保留已保存的选择。', catalogIncomplete: '所选端点没有返回完整目录，不会自动替换。',
      noTargets: '没有可列出的已配对目标。', noWorkspaces: '该端点没有列出合规的工作区。', noModels: '该端点没有列出可用模型。',
      workspaceNote: '工作区仅用于放置会话，不授予读取文件的权限。', noDefault: '初始没有任何选择，顾问不会沿用 Fishball 的模型。',
      configureModel: '请明确选择目的地和可用的顾问模型，不使用默认模型。',
      missingGuarantee: '咨询已阻止：连接器不能保证会话只提供建议、只接收获准内容，并按本次请求返回回执。不会发送简报、创建会话或调用模型。',
      missingCore: '没有兼容的 Fishball core，不能咨询。本地记录独立保留。',
      targetUnavailable: '已选目标、工作区或模型目录不可用。请恢复连接或核对已保存的选择。',
      ready: '已核实目的地。每次提问仍需单独确认披露。',
      unavailableState: '无法核实是否可以咨询。', budgetExceeded: '已达到咨询次数上限。请使用现有建议，不要重新发送。',
      paused: '暂停新咨询', pausedState: '新咨询已暂停。', pauseNote: '暂停不取消在途请求；仍可查看记录及清理。',
      disclosure: '披露与执行', disclosurePolicy: '每次提问均须所有者一次性确认确切的简报、接收方及将重放的历史。选择模型或回答普通提问卡不算授权。顾问只返回建议，不能执行；不会自动重发或降级。',
      budgets: '咨询次数上限', [FIELD.subject]: '每个任务或话题的提问上限', [FIELD.day]: '本档案每日提问上限（UTC）',
      budgetNote: '按次计数，不是金额上限。更改上限只影响以后发送，不能撤回已发送的请求；每日上限于 UTC 零点重置。',
      budgetDay: 'UTC 计费日：{day}', counts: '已用 {used} 次 · 预留 {reserved} 次 · 上限 {limit} 次',
      countOnly: '已用 {used} 次 · 预留 {reserved} 次', unknown: '未知', none: '无',
      unavailable: '顾问配置行不可用。', readOnly: '此处的设置为只读。', saveFailed: '未能确认设置已保存。',
      save: '保存上限', saving: '正在保存…', overridden: '已设置', reset: '重置', invalid: '请填写大于零的整数。',
      loading: '正在读取咨询记录…', readFailed: '无法读取咨询记录。', refresh: '刷新记录',
      activeThreads: '开放及待处理', archivedThreads: '已归档', emptyThreads: '没有开放或待处理的线程。', emptyArchived: '没有已归档的线程。',
      createTitle: '话题标题', create: '新建话题', createFresh: '以全新话题重新开始', newTopicNote: '只在本地创建独立标识；不带入历史及许可，不创建远端会话、发送问题或重置每日次数。',
      invalidTitle: '请输入不超过 {limit} 个 UTF-8 字节的非空标题。', topic: '话题', task: '任务',
      viewThread: '查看线程：{title}', back: '返回线程列表', thread: '线程', status: '状态', session: '顾问会话',
      requests: '请求与回执', noRequests: '暂无请求。打开或新建话题不会发送任何内容。',
      discard: '弃用线程', discardTitle: '弃用「{title}」？', discardConfirm: '确认弃用', cancel: '取消', close: '关闭',
      discardNote: '关闭后续发问，并请原目标停止及归档顾问会话。未核实前仍为待清理。保留记录；不擦除历史、任务或 Fishball 的对话。',
      outstanding: '待处理请求：{count}', reconcile: '核对原状态', reconcileNote: '只核对原请求或清理状态，不重发问题，不占用新次数。',
      archiveNote: '这是只读归档。记录仍在，但不能恢复旧会话或许可。', cleanupNotice: '发送已封锁，原目标尚未确认停止并归档。',
      actionFailed: '未确认操作结果，请先刷新记录并核对保存的状态。',
      receipt: '请求 {id}', question: '问题', evidence: '依据', history: '本次重放的历史内容', noHistory: '不重放历史。', instruction: '固定顾问说明',
      advice: '顾问建议（不是 Fishball 的决定）', result: '结果', truncated: '显示的建议已截断。', inputTokens: '输入 token', outputTokens: '输出 token', cost: '顾问费用',
      approval: '发送前核对', approvalNote: '仅允许发送此处显示的本次确切请求、完整简报及重放历史，且只发送到所示接收方。受理后可能占用次数并产生供应商费用。此许可不授权执行。',
      approvalUnavailable: '没有完整且可核实的披露内容，不能从此处授权。', allow: '仅本次允许发送这份简报', decline: '不发送',
      'state.open': '开放', 'state.archived': '已归档', 'state.cleanup-pending': '待清理', 'state.awaiting-consent': '待确认披露',
      'state.awaiting-user-close': '等待所有者确认关闭', 'state.unconfirmed': '投递待核对', 'state.accepted': '已受理，等待回执',
      'state.declined': '已拒绝', 'state.refused': '已阻止', 'state.closed': '已关闭', 'state.sending': '发送中', 'state.not-delivered': '未送达',
      'state.advice': '已收到建议', 'state.empty': '无建议', 'state.stopped': '已停止', 'state.failed': '失败',
      'state.connected': '已连接', 'state.connecting': '连接中', 'state.not-set': '未连接',
    })

    const array = (value) => Array.isArray(value) ? value : []
    const hasText = (value) => typeof value === 'string' && value.trim() !== EMPTY
    const positive = (value) => Number.isSafeInteger(value) && value >= MIN_POSITIVE
    const isRoute = (value) => hasText(value) && /^[^/\s]+\/[^\s]+$/u.test(value)
    const sameTarget = (a, b) => hasText(a?.targetId) && hasText(a?.endpointEpoch) && a.targetId === b?.targetId && a.endpointEpoch === b?.endpointEpoch
    const targetKey = (value) => JSON.stringify([value.targetId, value.endpointEpoch])
    const isSubject = (value) => (value?.kind === 'topic' || value?.kind === 'task') && hasText(value.id)
    const sameSubject = (a, b) => isSubject(a) && a.kind === b?.kind && a.id === b.id
    const subjectKey = (value) => JSON.stringify([value.kind, value.id])
    const subjectRef = (value) => ({ kind: value.kind, id: value.id })
    const titleOf = (thread) => hasText(thread.title) ? thread.title : thread.subject.id
    const showValue = (t, value) => value ?? t('unknown')
    const stateLabel = (t, state) => Object.hasOwn(en, 'state.' + state) ? t('state.' + state) : t('unknown')
    const validTitle = (title) => hasText(title) && title.isWellFormed() && new TextEncoder().encode(title).length <= TITLE_BYTES
    const increment = (value) => value + 1
    const emptyBody = Object.freeze({})
    const targetInput = (value) => hasText(value.targetId) && hasText(value.endpointEpoch) ? { targetId: value.targetId, endpointEpoch: value.endpointEpoch } : emptyBody

    async function post(operation, body = emptyBody, signal) {
      try {
        const url = new URL(API_PREFIX + operation, document.baseURI)
        // These are owner-side routes on the current DSH, never a browser request to a target DSH.
        if (url.origin !== window.location.origin) return undefined
        const response = await fetch(url, { ...POST, body: JSON.stringify(body), signal })
        const result = await response.json()
        if (response.ok || result?.ok === false) return result
      } catch { /* An unanswered write must never be repeated automatically. */ }
    }

    /** Ignore a response as soon as the relevant endpoint, subject, or refresh generation changes. */
    function useRead(operation, body, generation, enabled = true) {
      const input = JSON.stringify(body)
      const key = JSON.stringify([operation, input, generation])
      // A repeated key (for example, leave and reopen a thread) still starts a fresh read.
      const ticket = React.useMemo(() => ({}), [enabled, key])
      const [read, setRead] = React.useState(null)
      React.useEffect(() => {
        if (!enabled) return undefined
        const controller = new AbortController()
        void post(operation, JSON.parse(input), controller.signal).then((value) => {
          if (!controller.signal.aborted) setRead({ ticket, value })
        })
        return () => controller.abort()
      }, [enabled, ticket, operation, input])
      const current = enabled && read?.ticket === ticket
      return { value: current ? read.value : undefined, pending: enabled && !current }
    }

    function useSnapshot(store) {
      return React.useSyncExternalStore((listener) => store.subscribe(listener), () => store.getSnapshot())
    }

    function action(label, onClick, options = {}) {
      return h(Button, { type: 'button', size: ACTION.small, variant: ACTION.outlined, onClick, ...options }, label)
    }

    function note(text, alert = false) {
      return h('p', { role: alert ? 'alert' : 'status', style: STYLE.caption }, text)
    }

    function card(title, ...children) {
      return h('section', { style: STYLE.card }, h('h3', { style: STYLE.title }, title), ...children)
    }

    function facts(entries) {
      return h('dl', { style: STYLE.ledger }, entries.map(([label, value]) => h(React.Fragment, { key: label },
        h('dt', { style: STYLE.caption }, label), h('dd', { style: STYLE.value }, value))))
    }

    function statusText(t, status, ready = false) {
      if (ready && status === undefined) return t('ready')
      switch (status?.reason) {
        case 'missing-guarantee': return t('missingGuarantee')
        case 'missing-core': return t('missingCore')
        case 'target-unavailable': return t('targetUnavailable')
        default:
          switch (status?.code) {
            case 'CONFIGURE_MODEL': return t('configureModel')
            case 'DISABLED': return t('pausedState')
            case 'BUDGET_EXCEEDED': return t('budgetExceeded')
            case 'UNAVAILABLE': return t('targetUnavailable')
            default: return hasText(status?.message) ? status.message : t('unavailableState')
          }
      }
    }

    function Choice({ label, value, choices, placeholder, fallback, disabled, onChoose }) {
      const id = React.useId()
      return h('div', { style: STYLE.group }, h('label', { htmlFor: id }, label),
        h('select', { id, style: STYLE.select, value, disabled, onChange: (event) => onChoose(event.target.value) },
          h('option', { value: EMPTY }, placeholder),
          value !== EMPTY && !choices.some((choice) => choice.value === value) ? h('option', { value, disabled: true }, fallback) : null,
          choices.map((choice) => h('option', { key: choice.value, value: choice.value, disabled: choice.disabled }, choice.label))))
    }

    function DestinationSettings({ t, form, snapshot, readiness, onRefresh }) {
      const cfg = snapshot.value ?? emptyBody
      const [refresh, setRefresh] = React.useState(0)
      const [saving, setSaving] = React.useState(false)
      const [failure, setFailure] = React.useState(false)
      const inFlight = React.useRef(false)
      const read = useRead(URLS.discovery, targetInput(cfg), [refresh, snapshot.revision], snapshot.status === VIEW_READY)
      const catalog = read.value
      const targets = array(catalog?.targets).filter((entry) => hasText(entry?.targetId) && hasText(entry?.endpointEpoch))
      const selectedTarget = targets.find((entry) => sameTarget(entry, cfg))
      const matched = sameTarget(catalog, cfg) && selectedTarget !== undefined
      const complete = matched && selectedTarget.state === TARGET_CONNECTED && catalog.complete === true
      const workspaces = matched ? array(catalog.workspaces).filter((entry) => hasText(entry?.id)) : []
      const models = matched ? array(catalog.models).filter((entry) => isRoute(entry?.id)) : []
      const excluded = new Set(array(catalog?.unavailableProviders).map((provider) => provider?.id))
      const modelAvailable = (entry) => !!entry && entry.available !== false && !excluded.has(entry.id.split('/')[0])
      const model = models.find((entry) => entry.id === cfg.model)
      const efforts = array(model?.reasoningEfforts).filter(hasText)
      const selectedWorkspace = workspaces.some((entry) => entry.id === cfg.workspaceId && entry.available !== false)
      const off = snapshot.status !== VIEW_READY || !snapshot.writable || saving

      const write = async (next) => {
        if (off || inFlight.current) return
        inFlight.current = true
        setSaving(true)
        setFailure(false)
        try {
          const ops = Object.entries(next).map(([field, value]) => ({ op: 'set', path: [field], value }))
          setFailure(await form.mutate(ops, snapshot.revision) !== true)
        } catch { setFailure(true) }
        finally { inFlight.current = false; setSaving(false) }
      }
      const pickTarget = (key) => {
        const target = targets.find((entry) => targetKey(entry) === key)
        if (key !== EMPTY && !target) return
        // Clearing descendants atomically prevents a route from surviving a change of endpoint.
        void write({ [FIELD.target]: target?.targetId ?? EMPTY, [FIELD.epoch]: target?.endpointEpoch ?? EMPTY,
          [FIELD.workspace]: EMPTY, [FIELD.model]: EMPTY, [FIELD.effort]: EMPTY })
      }
      const pickWorkspace = (id) => {
        if (!complete || (id !== EMPTY && !workspaces.some((item) => item.id === id && item.available !== false))) return
        void write({ [FIELD.workspace]: id, [FIELD.model]: EMPTY, [FIELD.effort]: EMPTY })
      }
      const pickModel = (id) => {
        if (!complete || !selectedWorkspace || (id !== EMPTY && !models.some((item) => item.id === id && modelAvailable(item)))) return
        void write({ [FIELD.model]: id, [FIELD.effort]: EMPTY })
      }
      const pickEffort = (id) => {
        if (!complete || !selectedWorkspace || !modelAvailable(model) || (id !== EMPTY && !efforts.includes(id))) return
        void write({ [FIELD.effort]: id })
      }
      const targetValue = hasText(cfg.targetId) ? targetKey(cfg) : EMPTY
      const modelLabel = (entry) => !hasText(entry.label) || entry.label === entry.id ? entry.id : t('modelOption', { label: entry.label, route: entry.id })
      const saved = (value) => t('stored', { value })
      const unavailable = (value, disabled) => disabled ? t('unavailableOption', { value }) : value
      const describeTarget = ({ name, targetId, endpointEpoch }) => t('targetOption', { name: name || targetId, id: targetId, epoch: showValue(t, endpointEpoch) })
      return h(React.Fragment, null,
        card(t('destination'),
          h(Choice, { label: t(FIELD.target), value: targetValue, placeholder: t('chooseTarget'), fallback: saved(describeTarget(cfg)), disabled: off || read.pending || !Array.isArray(catalog?.targets), onChoose: pickTarget,
            choices: targets.map((entry) => ({ value: targetKey(entry), label: describeTarget(entry) })) }),
          selectedTarget ? facts([[t('status'), stateLabel(t, selectedTarget.state)]]) : null,
          h(Choice, { label: t(FIELD.workspace), value: cfg.workspaceId ?? EMPTY, placeholder: t('chooseWorkspace'), fallback: saved(cfg.workspaceId), disabled: off || !complete, onChoose: pickWorkspace,
            choices: workspaces.map((entry) => ({ value: entry.id, label: unavailable(entry.name || entry.id, entry.available === false), disabled: entry.available === false })) }),
          h('p', { style: STYLE.caption }, t('workspaceNote')),
          h(Choice, { label: t(FIELD.model), value: cfg.model ?? EMPTY, placeholder: t('chooseModel'), fallback: saved(cfg.model), disabled: off || !complete || !selectedWorkspace, onChoose: pickModel,
            choices: models.map((entry) => ({ value: entry.id, label: unavailable(modelLabel(entry), !modelAvailable(entry)), disabled: !modelAvailable(entry) })) }),
          efforts.length ? h(Choice, { label: t(FIELD.effort), value: cfg.reasoningEffort ?? EMPTY, placeholder: t('noEffort'), fallback: saved(cfg.reasoningEffort), disabled: off || !complete || !selectedWorkspace || !modelAvailable(model), onChoose: pickEffort,
            choices: efforts.map((entry) => ({ value: entry, label: entry })) }) : hasText(cfg.reasoningEffort) ? facts([[t(FIELD.effort), saved(cfg.reasoningEffort)]]) : null,
          h('p', { style: STYLE.caption }, t('noDefault')),
          h('div', { style: STYLE.actions }, action(t('refreshCatalog'), () => { setRefresh(increment); onRefresh() }, { disabled: read.pending || snapshot.status !== VIEW_READY })),
          read.pending ? note(t('catalogLoading')) : !Array.isArray(catalog?.targets) ? note(t('catalogFailed')) : null,
          Array.isArray(catalog?.targets) && !targets.length ? note(t('noTargets')) : null,
          hasText(cfg.targetId) && catalog && !complete ? note(t('catalogIncomplete')) : null,
          complete && !workspaces.some((entry) => entry.available !== false) ? note(t('noWorkspaces')) : null,
          complete && !models.some(modelAvailable) ? note(t('noModels')) : null,
          note(statusText(t, catalog?.status ?? readiness?.status, complete && Array.isArray(readiness?.threads)))),
        card(t('disclosure'),
          h('label', null, h('input', { type: 'checkbox', checked: cfg.paused === true, disabled: off, onChange: (event) => void write({ [FIELD.paused]: event.target.checked }) }), ' ', t('paused')),
          h('p', { style: STYLE.caption }, t('pauseNote')),
          h('p', { style: STYLE.text }, t('disclosurePolicy'))),
        failure ? note(t('saveFailed'), true) : null)
    }

    function budgetForm(scope) {
      const numberField = (field) => {
        const spec = settingsNumberField(field)
        return { ...spec, parse(value) {
          // The generic settings primitive permits empty/default and general numbers; these two limits do not.
          return /^\d+$/u.test(value) && positive(Number(value)) ? spec.parse(value) : undefined
        } }
      }
      const model = new SettingsFormModel(scope, BUDGET_FIELDS.map(numberField))
      return { model, actions: model.actions(), store: model.bind(() => ({ ...model.shell(), fields: Object.fromEntries(BUDGET_FIELDS.map((field) => [field, model.field(field)])) })) }
    }

    function budgetCount(t, value, limit) {
      const used = showValue(t, value?.used)
      const reserved = showValue(t, value?.reserved)
      return limit === undefined ? t('countOnly', { used, reserved }) : t('counts', { used, reserved, limit })
    }

    function BudgetUsage({ t, budgets }) {
      return h('div', { style: STYLE.group },
        h('p', { style: STYLE.caption }, t('budgetDay', { day: showValue(t, budgets?.utcDay) })),
        h('p', { style: STYLE.caption }, budgetCount(t, budgets, showValue(t, budgets?.asksPerDay))))
    }

    function BudgetSettings({ t, form, budgets }) {
      const state = useSnapshot(form.store)
      const base = React.useId()
      const labels = Object.fromEntries(FORM_LABELS.map((key) => [key, t(key)]))
      return card(t('budgets'),
        h(BudgetUsage, { t, budgets }),
        h('p', { style: STYLE.caption }, t('budgetNote')),
        h(SettingsForm, { labels, state, onSave: form.actions.save, onDiscard: form.actions.discard },
          BUDGET_FIELDS.map((field) => h(SettingsValueField, { key: field, id: base + field, label: t(field), numeric: true, ...state.fields[field],
            disabled: !state.writable || state.saving, overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalid'),
            onEdit: (text) => form.actions.edit(field, text), onReset: () => form.actions.resetField(field) }))))
    }

    function destinationFacts(t, value) {
      if (!value) return null
      return facts(DESTINATION_FIELDS.filter((key) => key !== FIELD.effort || value[key] !== undefined)
        .map((key) => [t(key), showValue(t, value[key])]))
    }

    function briefFacts(t, value) {
      return facts([[t('question'), showValue(t, value?.question)], [t('evidence'), value?.evidence ?? t('none')]])
    }

    function usageFacts(t, usage) {
      const cost = typeof usage?.cost === 'number' && hasText(usage?.currency) ? [usage.cost, usage.currency].join(' ') : undefined
      return facts([[t('inputTokens'), showValue(t, usage?.inputTokens)], [t('outputTokens'), showValue(t, usage?.outputTokens)], [t('cost'), showValue(t, cost)]])
    }

    const isOptionalText = (value) => value === undefined || hasText(value)
    const hasBriefText = (value) => hasText(value?.question) && isOptionalText(value?.evidence)
    const REPLAY_RESULTS = Object.freeze([S.advice, S.empty, S.stopped, S.failed])
    function replayResult(result) {
      return REPLAY_RESULTS.includes(result?.status) && result.truncated !== true && (result.status === S.advice ? hasText(result.text) : result.text === undefined)
    }

    function reviewable(request) {
      const { brief, destination, digest, instruction } = request
      return hasText(digest) && hasBriefText(brief) && hasText(instruction)
        && Array.isArray(brief.history) && brief.history.every((entry) => hasBriefText(entry) && replayResult(entry.result))
        && hasText(destination?.ownerId) && hasText(destination.targetId) && hasText(destination.endpointEpoch)
        && hasText(destination.workspaceId) && isRoute(destination.model) && isOptionalText(destination.reasoningEffort)
    }

    function RequestRecord({ t, request, canDecide, attempted, busy, onDecide }) {
      const { requestId, status, brief, destination, result, instruction, sessionId } = request
      const pendingConsent = status === S.awaiting
      const canApprove = pendingConsent && canDecide && hasText(request.cardId) && reviewable(request)
      const history = array(brief?.history)
      return card(t('receipt', { id: requestId }),
        h('p', { style: STYLE.caption }, stateLabel(t, status)),
        pendingConsent ? h('h4', { style: STYLE.title }, t('approval')) : null,
        destinationFacts(t, destination),
        hasText(sessionId) ? facts([[t('session'), sessionId]]) : null,
        brief ? briefFacts(t, brief) : null,
        hasText(instruction) ? facts([[t('instruction'), instruction]]) : null,
        !Array.isArray(brief?.history) ? null : h('div', { style: STYLE.group },
          h('h4', { style: STYLE.title }, t('history')),
          history.length === 0 ? h('p', { style: STYLE.caption }, t('noHistory')) : h('ol', null,
            history.map((entry, index) => h('li', { key: index }, briefFacts(t, entry),
              facts([[t('result'), stateLabel(t, entry?.result?.status)], ...(hasText(entry?.result?.text) ? [[t('advice'), entry.result.text]] : [])]))))),
        result ? facts([[t('result'), stateLabel(t, result.status)], ...(hasText(result.text) ? [[t('advice'), result.text]] : [])]) : null,
        result?.truncated === true ? note(t('truncated')) : null,
        usageFacts(t, result?.usage),
        pendingConsent && !canApprove ? note(t('approvalUnavailable')) : null,
        canApprove ? h('p', { style: STYLE.caption }, t('approvalNote')) : null,
        pendingConsent && canDecide && hasText(request.cardId) ? h('div', { style: STYLE.actions },
          action(t('decline'), () => onDecide(request.cardId, DECISION.decline), { disabled: busy || attempted }),
          canApprove ? action(t('allow'), () => onDecide(request.cardId, DECISION.allow), { disabled: busy || attempted, variant: ACTION.primary }) : null) : null)
    }

    function TopicForm({ t, fresh, busy, onCreate }) {
      const [title, setTitle] = React.useState(EMPTY)
      const id = React.useId()
      const valid = validTitle(title)
      return h('form', { style: STYLE.group, onSubmit: (event) => { event.preventDefault(); if (valid && !busy) onCreate(title) } },
        h('label', { htmlFor: id }, t('createTitle')),
        h(Input, { id, value: title, disabled: busy, onChange: (event) => setTitle(event.target.value), 'aria-invalid': title !== EMPTY && !valid }),
        h('p', { style: STYLE.caption }, t('newTopicNote')),
        title !== EMPTY && !valid ? note(t('invalidTitle', { limit: TITLE_BYTES })) : null,
        h('div', { style: STYLE.actions }, h(Button, { type: 'submit', size: ACTION.small, variant: ACTION.primary, disabled: !valid || busy }, t(fresh ? 'createFresh' : 'create'))))
    }

    function ThreadGroup({ t, threads, archived, budgets, onSelect }) {
      return card(t(archived ? 'archivedThreads' : 'activeThreads'),
        threads.length === 0 ? note(t(archived ? 'emptyArchived' : 'emptyThreads')) : threads.map((thread) => h('div', { style: STYLE.group, key: subjectKey(thread.subject) },
          h('div', { style: STYLE.actions }, action(titleOf(thread), () => onSelect(thread.subject), { 'aria-label': t('viewThread', { title: titleOf(thread) }) }),
            h('span', { style: STYLE.caption }, stateLabel(t, thread.status))),
          h('p', { style: STYLE.caption }, subjectLabel(t, thread.subject)),
          h('p', { style: STYLE.caption }, budgetCount(t, thread, showValue(t, budgets?.asksPerSubject))))))
    }

    const subjectLabel = (t, subject) => [t(subject.kind), subject.id].join(' · ')
    const canClose = (thread) => thread.status === S.open || thread.status === S.closeRequested
    const RECONCILABLE = Object.freeze([S.accepted, S.unconfirmed])
    const SETTLING = Object.freeze([S.awaiting, S.sending, ...RECONCILABLE])

    function ThreadDetail({ t, thread, requests, budgets, busy, attempted, writable, allowDisclosure, onAct, onCreate, onDecide }) {
      const [confirm, setConfirm] = React.useState(false)
      const archived = thread.status === S.archived
      const cleanup = thread.status === S.cleanup
      const open = canClose(thread)
      const reconcile = cleanup || (open && requests.some((request) => RECONCILABLE.includes(request.status)))
      const outstanding = requests.filter((request) => SETTLING.includes(request.status)).length
      const closeConfirm = () => setConfirm(false)
      const subject = subjectRef(thread.subject)
      return h(React.Fragment, null,
        card(titleOf(thread), facts([[t('thread'), subjectLabel(t, thread.subject)], [t('status'), stateLabel(t, thread.status)],
          [t(FIELD.subject), budgetCount(t, thread, showValue(t, budgets?.asksPerSubject))]]),
          destinationFacts(t, thread.destination),
          hasText(thread.sessionId) ? facts([[t('session'), thread.sessionId]]) : null,
          archived ? note(t('archiveNote')) : cleanup ? note(t('cleanupNotice')) : null,
          h('div', { style: STYLE.actions },
            open && writable ? action(t('discard'), () => setConfirm(true), { disabled: busy }) : null,
            reconcile && writable ? action(t('reconcile'), () => onAct(URLS.reconcile, { subject }), { disabled: busy }) : null),
          reconcile ? h('p', { style: STYLE.caption }, t('reconcileNote')) : null),
        card(t('requests'), requests.length === 0 ? note(t('noRequests')) : requests.map((request) => h(RequestRecord, { key: request.requestId, t, request, busy,
          canDecide: allowDisclosure && thread.status === S.open, attempted: attempted.has(request.cardId), onDecide }))),
        archived && writable ? card(t('createFresh'), h(TopicForm, { t, fresh: true, busy, onCreate })) : null,
        confirm && open && writable ? h(Modal, {
          open: true, onClose: closeConfirm, closeLabel: t('close'), title: t('discardTitle', { title: titleOf(thread) }), description: t('discardNote'),
          footer: h(React.Fragment, null, action(t('cancel'), closeConfirm), action(t('discardConfirm'), () => {
            closeConfirm()
            onAct(URLS.discard, { subject })
          }, { disabled: busy, variant: ACTION.primary })),
        }, destinationFacts(t, thread.destination), note(t('outstanding', { count: outstanding }))) : null)
    }

    function ThreadSettings({ t, list, writable, paused, generation, refresh, attempted }) {
      const [subject, setSubject] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [feedback, setFeedback] = React.useState(null)
      const inFlight = React.useRef(false)
      const loaded = Array.isArray(list.value?.threads)
      const budgets = list.value?.budgets
      const detail = useRead(URLS.detail, subject ? { subject } : emptyBody, generation, subject !== null)
      const detailValid = subject !== null && sameSubject(subject, detail.value?.thread?.subject) && Array.isArray(detail.value?.requests)
      const records = array(list.value?.threads).filter((thread) => isSubject(thread?.subject))
      const select = (next) => { setFeedback(null); setSubject(next && subjectRef(next)) }
      const act = async (operation, body) => {
        if (inFlight.current || !writable || !loaded) return
        inFlight.current = true
        if (operation === URLS.decision) attempted.current.add(body.cardId)
        setBusy(true)
        setFeedback(null)
        try {
          const answer = await post(operation, body)
          if (operation === URLS.create && answer?.ok === true && isSubject(answer.subject) && answer.subject.kind === 'topic') setSubject(subjectRef(answer.subject))
          else if (answer?.ok !== true || operation === URLS.create) {
            setFeedback(answer?.status === S.cleanup ? t('cleanupNotice') : hasText(answer?.message) ? answer.message : t('actionFailed'))
          }
          // Always re-read the authoritative status. Never infer that a successful click archived anything.
          refresh()
        } finally { inFlight.current = false; setBusy(false) }
      }
      const create = (title) => void act(URLS.create, { title })
      const decide = (cardId, decision) => {
        if (!attempted.current.has(cardId)) void act(URLS.decision, { cardId, decision })
      }
      const requestValid = (request) => hasText(request?.requestId)
      return h('div', { style: STYLE.page },
        h('div', { style: STYLE.actions },
          subject ? action(t('back'), () => select(null), { disabled: busy }) : null,
          action(t('refresh'), refresh, { disabled: busy || list.pending || detail.pending })),
        list.pending || detail.pending ? note(t('loading')) : null,
        (!loaded && !list.pending) || (subject && !detail.pending && !detailValid) ? note(t('readFailed'), true) : null,
        loaded ? note(statusText(t, list.value.status, true)) : null,
        loaded ? h(BudgetUsage, { t, budgets }) : null,
        feedback ? note(feedback, true) : null,
        detailValid ? h(ThreadDetail, { key: subjectKey(subject), t, thread: detail.value.thread, requests: detail.value.requests.filter(requestValid), budgets, busy,
          attempted: attempted.current, writable: writable && loaded, allowDisclosure: writable && loaded && paused === false && list.value.status === undefined,
          onAct: (operation, body) => void act(operation, body), onCreate: create, onDecide: decide }) : null,
        subject === null && loaded ? h(React.Fragment, null,
          writable ? card(t('create'), h(TopicForm, { t, busy, onCreate: create })) : null,
          ...[false, true].map((archived) => h(ThreadGroup, { key: String(archived), t, budgets, archived, threads: records.filter((entry) => (entry.status === S.archived) === archived), onSelect: select }))) : null)
    }

    function ConsultantPage({ t, scope }) {
      const snapshot = useSnapshot(scope)
      const [tab, setTab] = React.useState(TAB.config)
      const [refresh, setRefresh] = React.useState(0)
      const attempted = React.useRef(new Set())
      const [budget] = React.useState(() => budgetForm(scope))
      React.useEffect(() => () => budget.model.dispose(), [budget])
      const generation = [refresh, snapshot.revision, tab]
      const list = useRead(URLS.list, emptyBody, generation, snapshot.status === VIEW_READY)
      const refreshPage = () => setRefresh(increment)
      return h('div', { style: STYLE.page, 'data-fishball-consultant': true },
        h('nav', { style: STYLE.actions, 'aria-label': t('navigation') }, Object.values(TAB).map((entry) => action(t(entry), () => setTab(entry), {
          key: entry, variant: tab === entry ? ACTION.primary : ACTION.outlined, 'aria-pressed': tab === entry,
        }))),
        tab === TAB.config ? h(React.Fragment, null,
          h(DestinationSettings, { t, form: scope, snapshot, readiness: list.value, onRefresh: refreshPage }), h(BudgetSettings, { t, form: budget, budgets: list.value?.budgets }))
          : h(ThreadSettings, { t, list, writable: snapshot.status === VIEW_READY && snapshot.writable === true, paused: snapshot.value?.paused,
            generation, refresh: refreshPage, attempted }))
    }

    /** ModuleLoader named export, usable by either row registration. */
    function ConsultantConfig({ ctx, view }) {
      React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
      const t = ctx.locale.bind(ROW)
      if (view === SUMMARY) return t('summary')
      return h(ConsultantPage, { t, scope: ctx.configForms.get(ROW) })
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(ROW, { en, zh }), ROW + ': locale')
      ctx.effect(() => ctx.configForms.whileServed([ROW], () => ctx.slots.inject(SLOT, () => {
        const disposers = ROW_KEYS.map((key) => ctx.slots.register({ name: SLOT, key, locale: ROW }, (props) => h(ConsultantConfig, { ...props, ctx })))
        return () => { for (const dispose of disposers) dispose() }
      })), ROW + ': settings pages')
    }

    return { ConsultantConfig, default: { name: ROW, inject: ['slots', 'locale', 'configForms'], apply } }
  },
})

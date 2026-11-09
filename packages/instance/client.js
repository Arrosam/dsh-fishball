/**
 * The `fishball-instance` card in DSH's Plugins page (design §0.7, D23, D26; task I1).
 *
 * The main DSH holds only what the instance needs before its child exists: `enabled`, edited in
 * DSH's own form for the instance's row. There is no launch field: the child starts as the main
 * DSH does (D28).
 * Every other instance setting lives in the instance's private profile and its own settings page,
 * so this card has no other field. Model sync is the "Model for Fishball" block on this same card
 * (D26, §10): one Check for new models button, a list of the providers the instance lacks, and Add
 * selected for the ticked ones. It is an action rather than a field, and there is no
 * `providerSync` switch.
 *
 * The field is the row's volatile config: DSH's settings form can write volatile fields only,
 * and writes it into the profile's patch for the `fishball-instance` row (§0.7).
 *
 * Above them the card shows the instance's own status and its reason (§18.2 I1, inst-OQ-01):
 * the state, the safe code, its reason, and Retry while the instance is `failed`
 * (§0.7 "Instance: status, Retry"; inst-OQ-03, inst-OQ-09: failed until Retry).
 */
window.__ModuleLoader__.load({
  id: 'fishball-instance',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { Button, SettingsForm, SettingsFormModel, Switch, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement

    /**
     * The row's identity. The row id is the settings namespace DSH serves and also the package
     * name, so the slot key the Plugins page dispatches is `<package>#<row id>` (§0.2, D22).
     */
    const PLUGIN = Object.freeze({
      id: 'fishball-instance',
      slot: 'plugins.row.config',
      locale: 'fishball-instance',
    })
    /** The form's two views; `summary` is the row's one-liner, `page` the form and its Save. */
    const VIEW = Object.freeze({ summary: 'summary', page: 'page' })
    /** The whole main-DSH surface of the instance settings (§0.7, inst-OQ-04). */
    const FIELD = Object.freeze({
      enabled: 'enabled',
    })
    const LAUNCH_FIELDS = Object.freeze([FIELD.enabled])
    /**
     * The staged spelling of the boolean field. `SettingsFormModel` stages every field as text and
     * parses it on save; DSH ships field factories for text and numbers only, so `enabled` names
     * its own two spellings and nothing else parses.
     */
    const FLAG = Object.freeze({ on: 'true', off: 'false' })
    /**
     * The instance's status on this card (host.js status(), served by src/native-web.js). The
     * routes are relative to DSH's page, as the connector's are. Status has no event, so the open
     * card re-reads it at the cadence the connector's frame reads `status()` (conn-OQ-25: once a
     * second), only while it is mounted and the tab is visible, one read at a time.
     * `unavailable` is the route's own answer for a state it cannot read. `stateTone` maps a state
     * to the DSH Tag tones the connector's frame uses.
     */
    const STATUS_UI = Object.freeze({
      statusPath: 'api/fishball-instance/status',
      retryPath: 'api/fishball-instance/retry',
      read: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      post: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }), body: '{}' }),
      pollMs: 1000,
      loading: 'loading',
      failed: 'failed',
      stateTone: Object.freeze({ ready: 'info', failed: 'danger' }),
      neutralTone: 'neutral',
    })
    /**
     * The "Model for Fishball" block (§10, D26; src/slim/host/provider-sync-routes.js). Check posts
     * no body and answers `{checkId, missing, notOffered, present}`; Add posts `{checkId, ids}` and
     * answers `{items: [{id, outcome, reason?}]}`. Every answer is `{ok, result|error}`; the browser
     * never gets a key, a mask, an endpoint or a variable name.
     * - `restarted`: the codes that mean the check no longer matches the running child (a restart,
     *   a stop, an expired or changed check); the list is cleared and the user checks again.
     * - `reasons` / `errors`: the codes with their own words; any other shows its code.
     */
    const MODEL_SYNC_UI = Object.freeze({
      checkPath: 'api/fishball-instance/models/check',
      addPath: 'api/fishball-instance/models/add',
      request: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }) }),
      ready: 'ready',
      phase: Object.freeze({ idle: 'idle', checking: 'checking', listed: 'listed', adding: 'adding', result: 'result' }),
      outcome: Object.freeze({ added: 'added', skipped: 'skipped', failed: 'failed' }),
      outcomeTone: Object.freeze({ added: 'info', skipped: 'neutral', failed: 'danger' }),
      busy: 'sync-busy',
      unknownReason: 'result-unknown',
      restarted: Object.freeze(['repreview-required', 'preview-expired', 'sync-closed', 'peer-mismatch', 'child-sync-disconnected', 'child-sync-unavailable', 'target-unavailable']),
      reasons: Object.freeze(['oauth-login', 'unsupported-provider', 'non-https-endpoint', 'provider-conflict', 'incompatible-owner-or-schema', 'no-api-key',
        'api-key-env-unset', 'version-mismatch', 'credential-not-writable', 'missing-revision', 'repreview-required', 'result-unknown',
        'key-not-saved', 'unsupported-record', 'provider-exists']),
      unreadable: 'provider-sync-refused',
      separator: ' · ',
    })
    const CLS = Object.freeze({ feature: 'fb-instance-feature', toggleRow: 'fb-instance-toggle-row', hint: 'fb-instance-hint', status: 'fb-instance-status', statusRow: 'fb-instance-status-row', sync: 'fb-instance-sync', syncTitle: 'fb-instance-sync-title', syncList: 'fb-instance-sync-list', syncRow: 'fb-instance-sync-row', syncModels: 'fb-instance-sync-models', error: 'fb-instance-error' })
    const STYLE = Object.freeze({
      id: 'fishball-instance-style',
      gap: '16px',
      stackGap: '6px',
      hintSize: '12px',
      lineHeight: '1.5',
    })
    const css = [
      `.${CLS.feature}{display:grid;gap:${STYLE.stackGap}}`,
      `.${CLS.toggleRow}{display:flex;align-items:flex-start;justify-content:space-between;gap:${STYLE.gap};color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${CLS.hint}{margin:0;color:var(--dsw-alias-label-tertiary);font-size:${STYLE.hintSize};line-height:${STYLE.lineHeight}}`,
      `.${CLS.status}{display:grid;gap:${STYLE.stackGap};margin-bottom:${STYLE.gap}}`,
      `.${CLS.statusRow}{display:flex;align-items:center;flex-wrap:wrap;gap:${STYLE.stackGap};color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${CLS.sync}{display:grid;gap:${STYLE.stackGap};margin-bottom:${STYLE.gap};color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${CLS.syncTitle}{margin:0;font:var(--dsw-font-s-strong-14)}`,
      `.${CLS.syncList}{list-style:none;margin:0;padding:0;display:grid;gap:${STYLE.stackGap}}`,
      `.${CLS.syncRow}{display:flex;align-items:flex-start;flex-wrap:wrap;gap:${STYLE.stackGap}}`,
      `.${CLS.syncModels}{flex-basis:100%;margin:0;color:var(--dsw-alias-label-tertiary);font-size:${STYLE.hintSize};overflow-wrap:anywhere}`,
      `.${CLS.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')

    // Locale dictionaries are flat key→text maps (the service looks a key up verbatim), so the
    // per-field labels are spelled `field.<name>`.
    const en = {
      summary: 'Fishball\'s private instance: how DSH starts it.',
      'field.enabled': 'Enabled',
      enabledHint: 'Start Fishball\'s private instance after DSH is ready. Saving it off stops the instance at once and saving it on starts it; its private data is kept.',
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      readOnly: 'This deployment stores settings read-only.',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      status: 'Status',
      'state.loading': 'checking',
      'state.disabled': 'disabled',
      'state.waiting': 'waiting',
      'state.starting': 'starting',
      'state.ready': 'running',
      'state.stopping': 'stopping',
      'state.stopped': 'stopped',
      'state.failed': 'failed',
      'state.connector-missing': 'connector missing',
      'state.unavailable': 'unavailable',
      'reason.connector-missing': 'The Fishball connector (fishball-connector) is not installed or not enabled, so the instance does not start. Enable the connector; the instance then starts without a restart of DSH.',
      'reason.NATIVE_INSTANCE_BUSY': 'Another Fishball instance is already attached to the connector, so this one was stopped.',
      'reason.NATIVE_CONTRACT_VERSION': 'The installed connector speaks a different contract version, so this instance was stopped.',
      'reason.INVALID_MAIN_HOME': 'The DSH home is not a canonical real path. Start DSH with a home that is its own real path, not one through a symlink such as /tmp (on macOS, /private/tmp rather than /tmp).',
      retry: 'Retry',
      retrying: 'Retrying…',
      'sync.title': 'Model for Fishball',
      'sync.check': 'Check for new models',
      'sync.checking': 'Checking…',
      'sync.notRunning': 'Fishball is not running.',
      'sync.nothing': 'Nothing new to add.',
      'sync.present': '{count} already in Fishball',
      'sync.notOffered': 'Not offered ({count})',
      'sync.models': 'Models: {models}',
      'sync.noModels': 'No model list; Fishball uses the provider\'s own.',
      'sync.add': 'Add selected',
      'sync.adding': 'Adding…',
      'sync.cancel': 'Cancel',
      'sync.checkAgain': 'Check again',
      'sync.restarted': 'Fishball restarted. Check again.',
      'sync.busy': 'Another Add is still running. Wait for it, then try again.',
      'sync.unknown': 'The connection was lost during Add; some entries may already be in. Check again.',
      'sync.summary.added': 'Added {count}',
      'sync.summary.skipped': '{count} skipped',
      'sync.summary.failed': '{count} failed',
      'sync.outcome.added': 'added',
      'sync.outcome.skipped': 'skipped',
      'sync.outcome.failed': 'failed',
      'sync.refused': 'Refused: {code}',
      'sync.help': 'Copies API-key providers (including keys from environment variables) from DSH into Fishball; logins are not copied and nothing Fishball has is changed. Fishball\'s model catalog then checks what was added, which may read keys set for its other providers.',
      'syncReason.oauth-login': 'Uses a login, not an API key: log in inside Fishball.',
      'syncReason.unsupported-provider': 'Not a plain API-key provider (for example custom headers). Set it up inside Fishball.',
      'syncReason.non-https-endpoint': 'Its endpoint must use https; only https endpoints can be synced.',
      'syncReason.provider-conflict': 'Fishball has a different provider with this name; it is kept.',
      'syncReason.incompatible-owner-or-schema': 'Fishball\'s model plugin for this provider is different.',
      'syncReason.no-api-key': 'Has no API key in DSH.',
      'syncReason.api-key-env-unset': 'Its key comes from an environment variable that is not set for DSH.',
      'syncReason.version-mismatch': 'Fishball runs a different DSH version. Restart Fishball, then check again.',
      'syncReason.credential-not-writable': 'Fishball cannot store a key for this provider.',
      'syncReason.missing-revision': 'Fishball\'s model settings could not be read.',
      'syncReason.repreview-required': 'Changed during Add; check again.',
      'syncReason.result-unknown': 'The result is unknown. Check again to see it.',
      'syncReason.key-not-saved': 'The provider was added but its key was not saved. Check again.',
      'syncReason.unsupported-record': 'Its key in DSH is not a plain API key.',
      'syncReason.provider-exists': 'Fishball got this provider meanwhile; it is kept.',
    }
    const zh = {
      summary: 'Fishball 的私有实例：DSH 如何启动它。',
      'field.enabled': '启用',
      enabledHint: 'DSH 就绪后启动 Fishball 的私有实例。保存为关闭会立即停止它，保存为开启会启动它；私有数据保留。',
      unavailable: '该插件当前未加载，暂时无法配置。',
      readOnly: '本部署的设置为只读。',
      save: '保存',
      saving: '保存中…',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
      status: '状态',
      'state.loading': '检查中',
      'state.disabled': '已禁用',
      'state.waiting': '等待中',
      'state.starting': '启动中',
      'state.ready': '运行中',
      'state.stopping': '停止中',
      'state.stopped': '已停止',
      'state.failed': '失败',
      'state.connector-missing': '缺少连接器',
      'state.unavailable': '无法读取',
      'reason.connector-missing': 'Fishball 连接器（fishball-connector）未安装或未启用，所以实例不会启动。启用连接器后，实例会自动启动，无需重启 DSH。',
      'reason.NATIVE_INSTANCE_BUSY': '已有另一个 Fishball 实例连接到连接器，所以本实例已停止。',
      'reason.NATIVE_CONTRACT_VERSION': '已安装的连接器使用不同的契约版本，所以本实例已停止。',
      'reason.INVALID_MAIN_HOME': 'DSH home 不是规范的真实路径。请让 DSH 使用它自身的真实路径，而不是经过 /tmp 之类符号链接的路径（macOS 上应使用 /private/tmp，而不是 /tmp）。',
      retry: '重试',
      retrying: '正在重试…',
      'sync.title': 'Fishball 的模型',
      'sync.check': '检查新模型',
      'sync.checking': '正在检查…',
      'sync.notRunning': 'Fishball 未在运行。',
      'sync.nothing': '没有可添加的新内容。',
      'sync.present': 'Fishball 中已有 {count} 个',
      'sync.notOffered': '不提供（{count}）',
      'sync.models': '模型：{models}',
      'sync.noModels': '没有模型列表；Fishball 使用该提供商自己的列表。',
      'sync.add': '添加所选',
      'sync.adding': '正在添加…',
      'sync.cancel': '取消',
      'sync.checkAgain': '重新检查',
      'sync.restarted': 'Fishball 已重启。请重新检查。',
      'sync.busy': '另一次添加仍在进行。请等它结束后再试。',
      'sync.unknown': '添加期间连接中断；部分条目可能已经加入。请重新检查。',
      'sync.summary.added': '已添加 {count} 个',
      'sync.summary.skipped': '跳过 {count} 个',
      'sync.summary.failed': '失败 {count} 个',
      'sync.outcome.added': '已添加',
      'sync.outcome.skipped': '已跳过',
      'sync.outcome.failed': '失败',
      'sync.refused': '已拒绝：{code}',
      'sync.help': '把 DSH 中的 API key 提供商（包括来自环境变量的 key）复制到 Fishball；登录不会复制，Fishball 已有的内容不会改变。之后 Fishball 的模型目录会检查新增的内容，这可能会读取它其他提供商的 key。',
      'syncReason.oauth-login': '使用登录而不是 API key：请在 Fishball 内登录。',
      'syncReason.unsupported-provider': '不是普通的 API key 提供商（例如自定义 header）。请在 Fishball 内设置。',
      'syncReason.non-https-endpoint': '它的 endpoint 必须使用 https；只有 https endpoint 可以同步。',
      'syncReason.provider-conflict': 'Fishball 中有同名但不同的提供商，保留原样。',
      'syncReason.incompatible-owner-or-schema': 'Fishball 中这个提供商的模型插件不同。',
      'syncReason.no-api-key': '它在 DSH 中没有 API key。',
      'syncReason.api-key-env-unset': '它的 key 来自环境变量，但 DSH 中未设置该变量。',
      'syncReason.version-mismatch': 'Fishball 运行的 DSH 版本不同。请重启 Fishball 后重新检查。',
      'syncReason.credential-not-writable': 'Fishball 无法为这个提供商保存 key。',
      'syncReason.missing-revision': '无法读取 Fishball 的模型设置。',
      'syncReason.repreview-required': '添加期间发生了变化，请重新检查。',
      'syncReason.result-unknown': '结果未知。请重新检查以确认。',
      'syncReason.key-not-saved': '提供商已新增，但它的 key 没有保存。请重新检查。',
      'syncReason.unsupported-record': '它在 DSH 中的 key 不是普通的 API key。',
      'syncReason.provider-exists': 'Fishball 在此期间已有这个提供商，保留原样。',
    }

    /**
     * `enabled` as a staged text field. The effective value of an unset field is the schema
     * default, true, so an unset field formats as "true" rather than as an empty switch.
     */
    const enabledField = Object.freeze({
      field: FIELD.enabled,
      format: (value) => String(value !== false),
      parse: (text) => {
        const spelled = text.trim()
        if (spelled === FLAG.on) return { kind: 'set', value: true }
        if (spelled === FLAG.off) return { kind: 'set', value: false }
        return undefined
      },
    })

    /** The form frame's copy, read from this card's dictionary. */
    function formLabels(t) {
      return {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
      }
    }

    /**
     * The staged form over the row's live config: one Save writes `enabled`.
     * @param scope - the row's configuration form (`configForms.get`).
     * @returns the page's snapshot, its form actions and its disposer.
     */
    function launchSection(scope) {
      const form = new SettingsFormModel(scope, [
        enabledField,
      ])
      const store = form.bind(() => ({
        ...form.shell(),
        fields: Object.fromEntries(LAUNCH_FIELDS.map((field) => [field, form.field(field)])),
      }))
      return { store, actions: form.actions(), dispose: () => form.dispose() }
    }

    /**
     * One read or Retry of this row's status route. @returns `{state, code, detail}`, or
     * undefined when the answer could not be read (the card then keeps what it showed).
     */
    async function statusRequest(path, init, signal) {
      try {
        const response = await fetch(new URL(path, document.baseURI).toString(), { ...init, signal })
        if (!response.ok) return undefined
        const value = await response.json()
        return value !== null && typeof value === 'object' && typeof value.state === 'string' ? value : undefined
      } catch { return undefined }
    }

    /** The instance's status while the card is open: read at once, then every STATUS_UI.pollMs. */
    function useInstanceStatus() {
      const [status, setStatus] = React.useState(undefined)
      React.useEffect(() => {
        const abort = new AbortController()
        let reading = false
        const poll = () => {
          if (reading || document.hidden) return
          reading = true
          void statusRequest(STATUS_UI.statusPath, STATUS_UI.read, abort.signal).then((next) => {
            if (next !== undefined && !abort.signal.aborted) setStatus(next)
          }).finally(() => { reading = false })
        }
        poll()
        const timer = setInterval(poll, STATUS_UI.pollMs)
        return () => { clearInterval(timer); abort.abort() }
      }, [])
      return [status, setStatus]
    }

    /**
     * The status line: DSH's Tag with the state, the safe code beside it, the reason (the
     * state's or the code's own text), and Retry for `failed`.
     * @param t - this card's locale reader.
     * @param status - the polled status ({@link useInstanceStatus}), shared with the model block.
     */
    function InstanceStatus({ t, status, setStatus }) {
      const [retrying, setRetrying] = React.useState(false)
      const state = status?.state ?? STATUS_UI.loading
      const code = status?.code ?? null
      const reasonKey = ['reason.' + state, code === null ? null : 'reason.' + code].find((key) => key !== null && Object.hasOwn(en, key))
      const reason = reasonKey !== undefined ? t(reasonKey) : null
      const retry = async () => {
        setRetrying(true)
        const next = await statusRequest(STATUS_UI.retryPath, STATUS_UI.post)
        setRetrying(false)
        if (next !== undefined) setStatus(next)
      }
      return h('div', { className: CLS.status, 'data-fishball-instance-state': state, ...(code ? { 'data-fishball-instance-code': code } : {}) },
        h('div', { className: CLS.statusRow, role: 'status' },
          h('span', null, t('status')),
          h(Tag, { tone: STATUS_UI.stateTone[state] ?? STATUS_UI.neutralTone }, t('state.' + state)),
          code ? h('code', null, code) : null,
          state === STATUS_UI.failed
            ? h(Button, { type: 'button', size: 'sm', variant: 'secondary', disabled: retrying, 'data-fishball-instance-retry': true, onClick: () => void retry() }, retrying ? t('retrying') : t('retry'))
            : null),
        reason ? h('p', { className: CLS.hint }, reason) : null,
        typeof status?.detail === 'string' && status.detail ? h('p', { className: CLS.hint }, status.detail) : null)
    }

    /** One model-sync call. @returns `{ok, result|error}`; an unreadable answer is a typed refusal. */
    async function syncRequest(path, payload) {
      try {
        const response = await fetch(new URL(path, document.baseURI).toString(), { ...MODEL_SYNC_UI.request, body: JSON.stringify(payload ?? {}) })
        const answer = await response.json()
        if (answer?.ok === true && answer.result !== null && typeof answer.result === 'object') return answer
        if (answer?.ok === false && typeof answer.error?.code === 'string') return answer
      } catch { /* unreachable or unreadable: the typed refusal below */ }
      return { ok: false, error: { code: MODEL_SYNC_UI.unreadable } }
    }

    /**
     * The "Model for Fishball" block (§10, D26): Check fetches once and lists only the providers the
     * instance lacks, each ticked; Add selected writes exactly the ticked ones; Cancel drops the
     * list (the host lets the check expire). Check is enabled only while the instance is `ready`.
     *
     * The block's state is one value: `{phase, check?, ticked?, items?, notice?, error?}`. `notice`
     * is a fixed message key; `error` a code shown with its own words or as itself.
     * @param t - this card's locale reader.
     * @param state - the instance state from the shared status poll.
     */
    function ModelSync({ t, state }) {
      const P = MODEL_SYNC_UI.phase
      const [view, setView] = React.useState({ phase: P.idle })
      const ready = state === MODEL_SYNC_UI.ready
      const reason = (code) => (MODEL_SYNC_UI.reasons.includes(code) ? t('syncReason.' + code) : code)
      const check = async () => {
        setView({ phase: P.checking })
        const answer = await syncRequest(MODEL_SYNC_UI.checkPath)
        if (!answer.ok) { setView({ phase: P.idle, error: answer.error.code }); return }
        setView({ phase: P.listed, check: answer.result, ticked: answer.result.missing.map((entry) => entry.id) })
      }
      const add = async () => {
        const { check: listed, ticked } = view
        setView({ ...view, phase: P.adding, error: undefined, notice: undefined })
        const answer = await syncRequest(MODEL_SYNC_UI.addPath, { checkId: listed.checkId, ids: ticked })
        if (answer.ok) {
          const unknown = answer.result.items.some((item) => item.reason === MODEL_SYNC_UI.unknownReason)
          setView({ phase: P.result, check: listed, items: answer.result.items, notice: unknown ? 'sync.unknown' : undefined })
          return
        }
        const code = answer.error.code
        // A busy Add leaves this check valid (the coordinator refuses before it consumes it), so
        // the list stays and the user can press Add again.
        if (code === MODEL_SYNC_UI.busy) { setView({ ...view, phase: P.listed, notice: 'sync.busy' }); return }
        // Nothing was written: the child restarted, stopped or changed since the check, or the
        // check expired. The list no longer describes the child, so it goes.
        if (MODEL_SYNC_UI.restarted.includes(code)) { setView({ phase: P.idle, notice: 'sync.restarted' }); return }
        setView({ phase: P.idle, error: code })
      }
      const toggle = (id, on) => setView((current) => ({ ...current, ticked: on ? [...current.ticked, id] : current.ticked.filter((other) => other !== id) }))
      const listed = view.phase === P.listed || view.phase === P.adding
      const busy = view.phase === P.checking || view.phase === P.adding
      const nameOf = (id) => view.check?.missing.find((entry) => entry.id === id)?.name ?? id
      const counts = view.items ? Object.values(MODEL_SYNC_UI.outcome).map((outcome) => [outcome, view.items.filter((item) => item.outcome === outcome).length]).filter(([, count]) => count > 0) : []
      return h('div', { className: CLS.sync, 'data-fishball-model-sync': view.phase },
        h('h3', { className: CLS.syncTitle }, t('sync.title')),
        h('div', { className: CLS.statusRow },
          h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: !ready || busy, 'aria-busy': view.phase === P.checking, 'data-fishball-model-check': true, onClick: () => void check() },
            view.phase === P.checking ? t('sync.checking') : view.phase === P.result ? t('sync.checkAgain') : t('sync.check'))),
        ready ? null : h('p', { className: CLS.hint, role: 'status' }, t('sync.notRunning')),
        view.error ? h('p', { className: CLS.error, role: 'alert' }, t('sync.refused', { code: view.error })) : null,
        view.notice ? h('p', { className: CLS.hint, role: 'status' }, t(view.notice)) : null,
        listed && view.check.missing.length === 0 ? h('p', { className: CLS.hint, role: 'status' }, t('sync.nothing')) : null,
        listed && view.check.missing.length > 0 ? h('ul', { className: CLS.syncList },
          view.check.missing.map((entry) => h('li', { key: entry.id, className: CLS.syncRow, 'data-fishball-model-entry': entry.id },
            h('label', { className: CLS.statusRow },
              h('input', { type: 'checkbox', checked: view.ticked.includes(entry.id), disabled: busy, onChange: (event) => toggle(entry.id, event.target.checked) }),
              h('strong', null, entry.name)),
            h('p', { className: CLS.syncModels }, entry.models.length > 0 ? t('sync.models', { models: entry.models.join(', ') }) : t('sync.noModels'))))) : null,
        listed && view.check.missing.length > 0 ? h('div', { className: CLS.statusRow },
          h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: busy || view.ticked.length === 0 || !ready, 'data-fishball-model-add': true, onClick: () => void add() },
            view.phase === P.adding ? t('sync.adding') : t('sync.add')),
          h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy, onClick: () => setView({ phase: P.idle }) }, t('sync.cancel'))) : null,
        view.phase === P.result ? h(React.Fragment, null,
          h('p', { role: 'status' }, counts.map(([outcome, count]) => t('sync.summary.' + outcome, { count })).join(MODEL_SYNC_UI.separator)),
          h('ul', { className: CLS.syncList }, view.items.map((item) => h('li', { key: item.id, className: CLS.syncRow, 'data-fishball-model-result': item.outcome },
            h('strong', null, nameOf(item.id)),
            h(Tag, { tone: MODEL_SYNC_UI.outcomeTone[item.outcome] ?? STATUS_UI.neutralTone }, t('sync.outcome.' + item.outcome)),
            item.reason ? h('span', { className: CLS.hint }, reason(item.reason)) : null)))) : null,
        (listed || view.phase === P.result) && view.check.present > 0 ? h('p', { className: CLS.hint }, t('sync.present', { count: view.check.present })) : null,
        (listed || view.phase === P.result) && view.check.notOffered.length > 0 ? h('details', null,
          h('summary', { className: CLS.hint }, t('sync.notOffered', { count: view.check.notOffered.length })),
          h('ul', { className: CLS.syncList }, view.check.notOffered.map((entry) => h('li', { key: entry.id, className: CLS.hint },
            h('strong', null, entry.name), ' — ', reason(entry.reason))))) : null,
        h('p', { className: CLS.hint }, t('sync.help')))
    }

    /**
     * The card: the status line, then the `enabled` switch and nothing else. The switch stages a
     * boolean.
     * @param section - the staged form from {@link launchSection}.
     * @param t - this card's locale reader.
     * @returns the row page component.
     */
    function makeCard(section, t) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballInstanceCard(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        // One status poll for the status line and the model block (hooks before the early return).
        const [status, setStatus] = useInstanceStatus()
        if (props.view !== VIEW.page) return t('summary')
        const disabled = !state.writable || state.saving
        return h(React.Fragment, null, h(InstanceStatus, { t, status, setStatus }), h(ModelSync, { t, state: status?.state }), h(SettingsForm, {
          labels: formLabels(t),
          state,
          onSave: section.actions.save,
          onDiscard: section.actions.discard,
        },
          h('div', { key: FIELD.enabled, className: CLS.feature },
            h('label', { className: CLS.toggleRow },
              h('span', null, t('field.enabled')),
              h(Switch, {
                checked: state.fields[FIELD.enabled].text === FLAG.on,
                label: t('field.enabled'),
                disabled,
                onChange: (on) => section.actions.edit(FIELD.enabled, on ? FLAG.on : FLAG.off),
              })),
            h('p', { className: CLS.hint }, t('enabledHint')))))
      }
    }

    /** DSH plugin styles are per page; the id keeps a reload from stacking two copies. */
    function mountStyles() {
      const style = document.createElement('style')
      style.id = STYLE.id
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    exports.name = PLUGIN.id
    exports.inject = ['slots', 'locale', 'configForms']
    exports.apply = function apply(ctx) {
      const t = ctx.locale.bind(PLUGIN.locale)
      ctx.effect(() => ctx.locale.register(PLUGIN.locale, { en, zh }), 'fishball instance: dictionaries')
      ctx.effect(mountStyles, 'fishball instance: styles')
      // Registered while the Host serves this row's settings namespace, so a deployment without
      // the instance package shows no trace of the card, and the row's Configure control appears
      // only where a configuration exists (the Plugins page asks slot keys for it).
      ctx.effect(() => {
        const section = launchSection(ctx.configForms.get(PLUGIN.id))
        const Card = makeCard(section, t)
        const stopServing = ctx.configForms.whileServed([PLUGIN.id], () =>
          ctx.slots.inject(PLUGIN.slot, () => ctx.slots.register({
            name: PLUGIN.slot,
            key: `${PLUGIN.id}#${PLUGIN.id}`,
            locale: PLUGIN.locale,
          }, Card)))
        return () => { stopServing(); section.dispose() }
      }, 'fishball instance: Plugins card')
    }
    return module.exports
  },
})

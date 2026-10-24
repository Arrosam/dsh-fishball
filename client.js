/**
 * Fishball browser half (DESIGN §10).
 *
 * 1. Brand: fills sidebar.brand.mark / sidebar.brand.name at slot priority -1 (a single
 *    slot renders its LOWEST priority; the shipped brand uses 0 — spike S14). The name
 *    occupant takes over its enclosing button's click (capture phase, so it runs before
 *    the shell's New Session handler) and opens the assistant session. On macOS Desktop
 *    the brand row is a drag region without a button; there Fishball opens from its
 *    pinned session and its Plugins page.
 * 2. Settings live on Fishball's own page under Plugins (owner's choice, P2): the
 *    page's `plugins.bundle.config` entry shows status and recovery actions, the live
 *    limits form (DSH's staged settings form; the Host schema decides validity) and the
 *    tools Fishball never uses. There is no separate settings panel.
 * 3. Header action in Fishball's own session: opens that Plugins page.
 *
 * The mark is FishMark from the owner's fishball app (assets/icon.svg, THIRD_PARTY_NOTICES).
 *
 * State comes from GET /api/fishball/events (server-sent snapshots).
 */
window.__ModuleLoader__.load({
  id: 'dsh-fishball',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { Button, SettingsForm, SettingsFormModel, SettingsValueField, Switch, Tag, settingsNumberField } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const PACKAGE_NAME = 'dsh-fishball'
    /** Host row id; also the settings namespace configForms serves (cordis.patch.yml). */
    const ENTRY_ID = 'fishball'
    const NS = 'fishball'
    const BRAND_PRIORITY = -1
    const HEADER_ACTION_ORDER = 5
    /** Plugins page main-panel id (dsh-client-ui-plugin-manager PANEL_ID) and its navigation service. */
    const PLUGINS_PANEL = 'plugins'
    /** Client services read on demand (not injected: Fishball works without each of them). */
    const SERVICE = Object.freeze({ pluginNavigation: 'pluginNavigation', layout: 'layout', uiWorkspace: 'uiWorkspace' })
    const SUMMARY_VIEW = 'summary'
    const HEADER_ACTION_ID = 'fishball-settings'
    /** Host statuses (src/constants.js STATUS) and the recovery actions each one offers. */
    const STATUS = Object.freeze({ starting: 'starting', live: 'live', recovery: 'recovery', archived: 'archived', stopped: 'stopped', failed: 'failed' })
    const ACTION = Object.freeze({ retry: 'retry', adopt: 'adopt' })
    const OFFERED = Object.freeze({
      [STATUS.recovery]: Object.freeze([ACTION.retry, ACTION.adopt]),
      [STATUS.archived]: Object.freeze([ACTION.retry]),
      [STATUS.stopped]: Object.freeze([ACTION.retry]),
    })
    const API = Object.freeze({ events: 'api/fishball/events', recovery: 'api/fishball/recovery', plugins: 'api/fishball/plugins', toolApprovals: 'api/fishball/tool-approvals/remove', contextWindow: 'api/fishball/context-window' })
    /** The two context-window settings (src/constants.js API.contextWindow body). */
    const CONTEXT_FIELDS = Object.freeze(['contextWindowTokens', 'maxOutputTokens'])
    /** Context-window refusals with their own text (keep in step with src/constants.js CONTEXT_ERROR). */
    const CONTEXT_ERRORS = new Set(['window-too-small', 'output-too-large', 'model-window-unknown'])
    const WHOLE_NUMBER = /^[1-9][0-9]*$/
    /** Host tool statuses (src/constants.js TOOL_STATUS) shown as tags, and the plugin kinds. */
    const TOOL_STATUS = Object.freeze({ visible: 'visible', hidden: 'hidden', pluginOff: 'plugin-off', unchecked: 'unchecked' })
    /** Tag tones used by DSH's own plugin page (neutral, info, danger). */
    const TAG_TONE = Object.freeze({ [TOOL_STATUS.unchecked]: 'danger', [TOOL_STATUS.hidden]: 'neutral', [TOOL_STATUS.pluginOff]: 'neutral' })
    /**
     * Plugin diagnostics with their own text; any other code shows the generic one. A separate
     * client bundle cannot import the host's list: keep it in step with src/constants.js PLUGIN_ERROR.
     */
    const PLUGIN_ERRORS = new Set(['edits-other-rows', 'no-rows', 'row-failed', 'leaks-service', 'no-profile', 'row-id-conflict', 'limit-reached'])
    const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' })
    const SLOT = Object.freeze({
      mark: 'sidebar.brand.mark',
      name: 'sidebar.brand.name',
      bundleConfig: 'plugins.bundle.config',
      headerActions: 'conversation.session.header.actions',
    })
    /**
     * The limit fields, in the order the Host declares them (src/config.js LIMITS). The
     * form model needs its fields before the first state frame arrives, so the browser keeps
     * this list; the Host schema still decides validity on save.
     */
    const LIMIT_FIELDS = Object.freeze(['maxQueuedInputs', 'maxActiveWatches', 'maxSourcesPerPlugin', 'maxFishballOnlyPlugins', 'wakeupsPerHour', 'messagesPerHour', 'sessionsPerHour', 'maxPendingApprovals', 'approvalAnswerSeconds', 'argumentExcerptBytes', 'maxMessageBytes', 'auditEntriesKept'])
    /**
     * FishMark (fishball app, Surfaces.kt): body and eye on a 24-unit grid. In the sidebar the
     * body takes the text colour so it reads on light and dark themes; the eye keeps the
     * app's magenta, the one colour the mark spends.
     */
    const FISH_MARK = Object.freeze({
      viewBox: '0 0 24 24',
      body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
      eye: 'M14.6 7.4 h2 v2 h-2 Z',
      bodyColor: 'currentColor',
      eyeColor: '#EC0A6E',
    })
    const STYLE_ID = 'fishball-style'
    const CLS = Object.freeze({ section: 'fb-section', row: 'fb-row', label: 'fb-label', code: 'fb-code', list: 'fb-list', name: 'fb-name', mark: 'fb-mark', plugin: 'fb-plugin', grow: 'fb-grow', muted: 'fb-muted' })

    const en = {
      brandName: 'Fishball',
      brandLabel: 'Open Fishball',
      status: 'Status',
      session: 'Session',
      folder: 'Folder',
      error: 'Problem',
      'status.starting': 'Starting',
      'status.live': 'Running',
      'status.recovery': 'Needs your decision',
      'status.archived': 'Archived',
      'status.stopped': 'Stopped',
      'status.failed': 'Could not start (restart DSH)',
      recoverFailed: 'That did not work. Check the status above and try again.',
      retry: 'Try again',
      adopt: 'Start a new Fishball session',
      openChat: 'Open chat',
      hiddenTools: 'Tools Fishball never uses',
      hiddenToolsHint: 'They save files, change the profile, or start agents inside Fishball\'s own session.',
      limits: 'Safety limits',
      openSettings: 'Fishball settings',
      contextWindow: 'Context window',
      contextHint: 'Leave the window empty to use the model\'s full window. A smaller window makes Fishball summarise its conversation sooner; only Fishball\'s session is affected.',
      'contextField.contextWindowTokens': 'Context window (tokens)',
      'contextField.maxOutputTokens': 'Reply length cap (tokens)',
      contextModel: 'Model window',
      contextEffective: 'Window in use',
      contextThreshold: 'Summarises at',
      contextPressure: 'In use now',
      contextOutput: 'Reply cap',
      contextUnknown: 'unknown',
      contextNone: 'none',
      contextDefault: 'Default',
      contextCompactionOff: 'Compaction is off for Fishball, so only the reply cap applies. Turn it on under Plugins for Fishball.',
      'contextError.window-too-small': 'That window is too small: it cannot hold Fishball\'s instructions, tools, a summary and recent messages.',
      'contextError.output-too-large': 'The reply cap does not fit in the window.',
      'contextError.model-window-unknown': 'The model does not report its window, so a smaller one cannot be set.',
      contextSaveFailed: 'That value was not accepted.',
      contextInvalid: 'Enter a whole number, or leave it empty.',
      plugins: 'Plugins for Fishball',
      pluginsHint: 'Fishball\'s own on/off choice. Other sessions and the profile are not changed. A change applies when Fishball\'s current turn ends.',
      pluginToggle: 'Use {name} in Fishball',
      'kind.profile': 'Everyone',
      'kind.fishball-only': 'Fishball only',
      'kind.builtin': 'Built in',
      pending: 'Applies after this turn',
      waiting: 'Starting…',
      'pluginError.row-id-conflict': 'Two of its parts have the same name, so it cannot run for Fishball',
      'pluginError.limit-reached': 'Too many plugins running only for Fishball',
      pluginErrorOther: 'Could not start for Fishball',
      changedByfishball: 'Changed by Fishball',
      changedByuser: 'Changed by you',
      'tool.unchecked': 'Not checked',
      'tool.hidden': 'Hidden',
      'tool.plugin-off': 'Off',
      allowedTools: 'Tools you allowed',
      allowedToolsHint: 'Nobody had checked these tools; you allowed them for Fishball. Removing one hides it again until you allow it.',
      remove: 'Remove',
      noAllowed: 'None.',
      otherTools: 'Other tools not shown to Fishball',
      'pluginError.edits-other-rows': 'Changes other plugins, so it cannot run for Fishball only',
      'pluginError.no-rows': 'Adds nothing Fishball can run',
      'pluginError.row-failed': 'Failed to start for Fishball',
      'pluginError.leaks-service': 'Would change DSH for every session, so it was stopped',
      'pluginError.no-profile': 'Needs a DSH profile',
      changeFailed: 'That change was not accepted.',
      'field.maxQueuedInputs': 'Queued inputs not yet read',
      'field.maxActiveWatches': 'Active "tell me when finished" watches',
      'field.maxSourcesPerPlugin': 'Feeds per plugin',
      'field.maxFishballOnlyPlugins': 'Plugins running only for Fishball',
      'field.wakeupsPerHour': 'Wake-ups per hour from non-user inputs (0 = no cap)',
      'field.messagesPerHour': 'Messages Fishball sends per hour (0 = no cap)',
      'field.sessionsPerHour': 'Sessions Fishball starts per hour (0 = no cap)',
      'field.maxPendingApprovals': 'Permission requests Fishball decides at once',
      'field.approvalAnswerSeconds': 'Seconds Fishball has to answer a request',
      'field.argumentExcerptBytes': 'Bytes of a request\'s command Fishball sees',
      'field.maxMessageBytes': 'Bytes in one message',
      'field.auditEntriesKept': 'Entries kept in each audit list',
      reset: 'Reset to default',
      overridden: 'Custom',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The values were not accepted. Use whole numbers: at least 1, or at least 0 for the hourly caps.',
      invalid: 'Enter a whole number.',
      unavailable: 'Fishball is not loaded, so its limits cannot be changed right now.',
      readOnly: 'This deployment stores settings read-only.',
    }
    const zh = {
      brandName: 'Fishball',
      brandLabel: '打开 Fishball',
      status: '状态',
      session: '会话',
      folder: '文件夹',
      error: '问题',
      'status.starting': '启动中',
      'status.live': '运行中',
      'status.recovery': '需要你的决定',
      'status.archived': '已归档',
      'status.stopped': '已停止',
      'status.failed': '无法启动（请重启 DSH）',
      recoverFailed: '操作未成功。请查看上方状态后重试。',
      retry: '重试',
      adopt: '新建 Fishball 会话',
      openChat: '打开对话',
      hiddenTools: 'Fishball 永不使用的工具',
      hiddenToolsHint: '它们会保存文件、修改配置，或在 Fishball 自己的会话里启动代理。',
      limits: '安全限制',
      openSettings: 'Fishball 设置',
      contextWindow: '上下文窗口',
      contextHint: '留空则使用模型的完整窗口。窗口越小，Fishball 越早总结对话；只影响 Fishball 的会话。',
      'contextField.contextWindowTokens': '上下文窗口（token）',
      'contextField.maxOutputTokens': '回复长度上限（token）',
      contextModel: '模型窗口',
      contextEffective: '当前使用的窗口',
      contextThreshold: '总结阈值',
      contextPressure: '当前占用',
      contextOutput: '回复上限',
      contextUnknown: '未知',
      contextNone: '无',
      contextDefault: '默认',
      contextCompactionOff: 'Fishball 的压缩已关闭，因此只有回复上限生效。请在“Fishball 的插件”中开启。',
      'contextError.window-too-small': '窗口太小：放不下 Fishball 的指令、工具、总结和最近的消息。',
      'contextError.output-too-large': '回复上限超出了窗口。',
      'contextError.model-window-unknown': '模型没有报告其窗口，因此无法设置更小的窗口。',
      contextSaveFailed: '该值未被接受。',
      contextInvalid: '请输入整数，或留空。',
      plugins: 'Fishball 的插件',
      pluginsHint: '仅 Fishball 自己的开关，不影响其他会话和配置。更改在 Fishball 当前回合结束后生效。',
      pluginToggle: '在 Fishball 中使用 {name}',
      'kind.profile': '所有会话',
      'kind.fishball-only': '仅 Fishball',
      'kind.builtin': '内置',
      pending: '本回合结束后生效',
      waiting: '启动中…',
      'pluginError.row-id-conflict': '它有两个部分同名，不能仅为 Fishball 运行',
      'pluginError.limit-reached': '仅为 Fishball 运行的插件过多',
      pluginErrorOther: '为 Fishball 启动失败',
      changedByfishball: '由 Fishball 更改',
      changedByuser: '由你更改',
      'tool.unchecked': '未检查',
      'tool.hidden': '已隐藏',
      'tool.plugin-off': '已关闭',
      allowedTools: '你允许的工具',
      allowedToolsHint: '这些工具未经检查，是你允许 Fishball 使用的。移除后会再次隐藏，直到你重新允许。',
      remove: '移除',
      noAllowed: '无。',
      otherTools: '未向 Fishball 显示的其他工具',
      'pluginError.edits-other-rows': '它会修改其他插件，不能仅为 Fishball 运行',
      'pluginError.no-rows': '没有可为 Fishball 运行的内容',
      'pluginError.row-failed': '为 Fishball 启动失败',
      'pluginError.leaks-service': '会影响所有会话，因此已停止',
      'pluginError.no-profile': '需要 DSH 配置',
      changeFailed: '该更改未被接受。',
      'field.maxQueuedInputs': '尚未读取的排队输入',
      'field.maxActiveWatches': '进行中的“完成时通知我”',
      'field.maxSourcesPerPlugin': '每个插件的信息源',
      'field.maxFishballOnlyPlugins': '仅为 Fishball 运行的插件',
      'field.wakeupsPerHour': '每小时非用户输入唤醒次数（0 = 不限）',
      'field.messagesPerHour': 'Fishball 每小时发送的消息（0 = 不限）',
      'field.sessionsPerHour': 'Fishball 每小时新建的会话（0 = 不限）',
      'field.maxPendingApprovals': 'Fishball 同时处理的权限请求',
      'field.approvalAnswerSeconds': 'Fishball 回答请求的秒数',
      'field.argumentExcerptBytes': 'Fishball 可见的请求命令字节数',
      'field.maxMessageBytes': '单条消息字节数',
      'field.auditEntriesKept': '每个审计列表保留的条目',
      reset: '恢复默认',
      overridden: '已自定义',
      save: '保存',
      saving: '保存中…',
      saveFailed: '这些值未被接受。请使用整数：至少为 1，每小时上限至少为 0。',
      invalid: '请输入整数。',
      unavailable: 'Fishball 当前未加载，暂时无法修改限制。',
      readOnly: '本部署的设置为只读。',
    }

    const css = [
      `.${CLS.section}{display:flex;flex-direction:column;gap:12px;margin:0 0 24px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13)}`,
      `.${CLS.mark}{color:var(--dsw-alias-label-primary)}`,
      `.${CLS.row}{display:flex;gap:12px;align-items:baseline}`,
      `.${CLS.label}{min-width:120px;color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.code}{font-family:var(--ds-font-family-code);overflow-wrap:anywhere}`,
      `.${CLS.list}{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}`,
      `.${CLS.list} li{padding:2px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-family:var(--ds-font-family-code)}`,
      `.${CLS.name}{font-weight:600}`,
      `.${CLS.plugin}{display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-primary)}`,
      `.${CLS.grow}{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}`,
      `.${CLS.muted}{color:var(--dsw-alias-label-tertiary)}`,
    ].join('')

    const apiUrl = (path) => new URL(path, document.baseURI).toString()

    /** One shared EventSource for all components; reconnects by itself. */
    const stateSource = (() => {
      let snapshot = { status: STATUS.starting, sessionId: null, error: null, limits: {}, hiddenTools: [] }
      const listeners = new Set()
      let source
      const open = () => {
        if (source) return
        source = new EventSource(apiUrl(API.events))
        source.onmessage = (event) => {
          try { snapshot = JSON.parse(event.data) } catch { return }
          for (const listener of listeners) listener()
        }
      }
      return {
        subscribe(listener) {
          listeners.add(listener)
          open()
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0 && source) { source.close(); source = undefined }
          }
        },
        get: () => snapshot,
      }
    })()
    const useFishball = () => React.useSyncExternalStore(stateSource.subscribe, stateSource.get)

    /** POST one command to the Host. @returns { ok, code } (code: the Host's refusal code, if any). */
    async function send(path, body) {
      try {
        const response = await fetch(apiUrl(path), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
        if (response.ok) return { ok: true, code: null }
        const answer = await response.json().catch(() => ({}))
        return { ok: false, code: typeof answer.code === 'string' ? answer.code : null }
      } catch {
        return { ok: false, code: null }
      }
    }
    /** POST one command. @returns whether it was accepted. */
    const post = async (path, body) => (await send(path, body)).ok
    const recover = (action) => post(API.recovery, { action })

    function Mark({ size }) {
      return h('svg', { width: size, height: size, viewBox: FISH_MARK.viewBox, className: CLS.mark, 'aria-hidden': true, 'data-fishball-mark': true },
        h('path', { d: FISH_MARK.body, fill: FISH_MARK.bodyColor }),
        h('path', { d: FISH_MARK.eye, fill: FISH_MARK.eyeColor }))
    }

    /** How to open Fishball's page under Plugins, or undefined when no service can. */
    function settingsOpener(ctx) {
      const navigation = ctx.get(SERVICE.pluginNavigation)
      if (navigation !== undefined) return () => navigation.openBundle(PACKAGE_NAME)
      const layout = ctx.get(SERVICE.layout)
      return layout === undefined ? undefined : () => layout.selectPanel(PLUGINS_PANEL)
    }

    function openSettings(ctx) {
      settingsOpener(ctx)?.()
    }

    /** Statuses in which a running agent holds the session, so the brand opens its chat. */
    const CHAT_STATUSES = Object.freeze([STATUS.live, STATUS.starting])

    /**
     * How to open Fishball now: its chat while an agent holds the session (live, or still
     * running its setup turn, whose approval prompts appear only in that chat), else its
     * settings. Undefined when the service that would do it is missing, so the brand leaves
     * the click to the shell.
     */
    function fishballOpener(ctx) {
      const state = stateSource.get()
      if (!CHAT_STATUSES.includes(state.status) || !state.sessionId) return settingsOpener(ctx)
      const workspace = ctx.get(SERVICE.uiWorkspace)
      return workspace === undefined ? undefined : () => workspace.openSession(state.sessionId)
    }

    function openFishball(ctx) {
      fishballOpener(ctx)?.()
    }

    function makeBrandName(ctx, t) {
      return function FishballBrandName() {
        const ref = React.useRef(null)
        // Subscribed only to keep the shared state stream open while the brand is shown:
        // the click handler reads the latest snapshot when it runs.
        useFishball()
        React.useEffect(() => {
          const button = ref.current?.closest('button')
          if (!button) return undefined
          const previous = button.getAttribute('aria-label')
          button.setAttribute('aria-label', t('brandLabel'))
          const onClick = (event) => {
            const open = fishballOpener(ctx)
            if (open === undefined) return
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            open()
          }
          button.addEventListener('click', onClick, true)
          return () => {
            button.removeEventListener('click', onClick, true)
            if (previous === null) button.removeAttribute('aria-label')
            else button.setAttribute('aria-label', previous)
          }
        }, [])
        return h('span', { ref, className: CLS.name, 'data-fishball-name': true }, t('brandName'))
      }
    }

    /** Status, recovery actions and hidden tools; rendered above the limits on Fishball's Plugins page. */
    function makeStatus(ctx, t) {
      return function FishballStatus() {
        const state = useFishball()
        const [recoverFailed, setRecoverFailed] = React.useState(false)
        const status = state.status ?? STATUS.starting
        const offered = OFFERED[status] ?? []
        const run = async (action) => { setRecoverFailed(!(await recover(action))) }
        return h('div', { className: CLS.section, 'data-fishball-settings': true },
          h('div', { className: CLS.row }, h('span', { className: CLS.label }, t('status')), h('span', { 'data-fishball-status': status }, t('status.' + status))),
          state.sessionId ? h('div', { className: CLS.row }, h('span', { className: CLS.label }, t('session')), h('span', { className: CLS.code }, state.sessionId)) : null,
          state.cwd ? h('div', { className: CLS.row }, h('span', { className: CLS.label }, t('folder')), h('span', { className: CLS.code }, state.cwd)) : null,
          state.error ? h('div', { className: CLS.row }, h('span', { className: CLS.label }, t('error')), h('span', { className: CLS.code }, state.error.code)) : null,
          h('div', { className: CLS.row },
            status === STATUS.live ? h(Button, { type: 'button', size: 'sm', onClick: () => openFishball(ctx) }, t('openChat')) : null,
            offered.includes(ACTION.retry) ? h(Button, { type: 'button', size: 'sm', onClick: () => run(ACTION.retry) }, t('retry')) : null,
            offered.includes(ACTION.adopt) ? h(Button, { type: 'button', size: 'sm', variant: 'primary', onClick: () => run(ACTION.adopt) }, t('adopt')) : null),
          recoverFailed ? h('div', { role: 'alert' }, t('recoverFailed')) : null)
      }
    }

    /** A status tag for one tool, in DSH's Tag primitive. */
    function ToolTag({ name, status, t }) {
      return h('li', { key: name }, name, status === TOOL_STATUS.visible ? null : h(Tag, { tone: TAG_TONE[status] }, t('tool.' + status)))
    }

    /**
     * Fishball's plugin catalog (DESIGN §10): one row per plugin with your on/off switch,
     * where it runs, who changed it last and the state of its tools; then the tools you
     * allowed (each with Remove) and other tools Fishball cannot see.
     */
    function makePlugins(t) {
      return function FishballPlugins() {
        const state = useFishball()
        const [failed, setFailed] = React.useState(false)
        const catalog = state.catalog
        if (!catalog) return null
        const run = async (path, body) => { setFailed(!(await post(path, body))) }
        return h('div', { className: CLS.section },
          h('h3', null, t('plugins')),
          h('p', { className: CLS.muted }, t('pluginsHint')),
          failed ? h('div', { role: 'alert' }, t('changeFailed')) : null,
          catalog.plugins.map((plugin) => h('div', { key: plugin.plugin, className: CLS.plugin, 'data-fishball-plugin': plugin.plugin },
            h('div', { className: CLS.grow },
              h('div', { className: CLS.row },
                h('span', { className: CLS.name }, plugin.title),
                h(Tag, { tone: 'neutral' }, t('kind.' + plugin.kind)),
                plugin.on !== plugin.applied ? h(Tag, { tone: 'info' }, t('pending')) : null,
                plugin.waiting ? h(Tag, { tone: 'info' }, t('waiting')) : null),
              plugin.changedBy ? h('span', { className: CLS.muted }, t('changedBy' + plugin.changedBy)) : null,
              plugin.lastError ? h('span', { role: 'status' }, PLUGIN_ERRORS.has(plugin.lastError) ? t('pluginError.' + plugin.lastError) : t('pluginErrorOther')) : null,
              plugin.tools.length > 0 ? h('ul', { className: CLS.list }, plugin.tools.map((tool) => h(ToolTag, { key: tool.name, ...tool, t }))) : null),
            h(Switch, { checked: plugin.on, label: t('pluginToggle', { name: plugin.title }), onChange: (on) => run(API.plugins, { plugin: plugin.plugin, on }) }))),
          h('h3', null, t('allowedTools')),
          h('p', { className: CLS.muted }, t('allowedToolsHint')),
          catalog.allowedTools.length === 0 ? h('p', null, t('noAllowed')) : catalog.allowedTools.map((tool) => h('div', { key: tool.key, className: CLS.row },
            h('span', { className: CLS.code }, tool.toolName),
            h('span', { className: CLS.muted }, tool.module),
            h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => run(API.toolApprovals, { toolKey: tool.key }) }, t('remove')))),
          catalog.otherTools.length > 0 ? h(React.Fragment, null,
            h('h3', null, t('otherTools')),
            h('ul', { className: CLS.list }, catalog.otherTools.map((tool) => h(ToolTag, { key: tool.name, ...tool, t })))) : null)
      }
    }

    /** A token count for display, or a fallback word. */
    const countText = (value, t, fallback) => (value === null || value === undefined ? t(fallback) : Number(value).toLocaleString())

    /**
     * The context window (DESIGN §6): your two values, what is in use, the threshold and
     * the current size. Empty fields mean unset; the Host checks a value against the model.
     */
    function makeContextWindow(t) {
      return function FishballContextWindow() {
        const state = useFishball()
        const view = state.contextWindow
        const baseId = React.useId()
        const stored = (field) => (view?.[field] == null ? '' : String(view[field]))
        const [draft, setDraft] = React.useState(null)
        const [saving, setSaving] = React.useState(false)
        const [problem, setProblem] = React.useState(null)
        if (!view) return null
        const text = (field) => (draft?.[field] ?? stored(field))
        // Digits only and within the safe-integer range, which the Host's check also requires.
        const invalid = (field) => text(field).trim() !== '' && !(WHOLE_NUMBER.test(text(field).trim()) && Number.isSafeInteger(Number(text(field).trim())))
        const dirty = draft !== null && CONTEXT_FIELDS.some((field) => text(field) !== stored(field))
        const save = async () => {
          setSaving(true)
          const body = Object.fromEntries(CONTEXT_FIELDS.map((field) => [field, text(field).trim() === '' ? null : Number(text(field).trim())]))
          const { ok, code } = await send(API.contextWindow, body)
          setSaving(false)
          if (ok) { setDraft(null); setProblem(null) } else setProblem(CONTEXT_ERRORS.has(code) ? 'contextError.' + code : 'contextSaveFailed')
        }
        const info = (label, value, fallback) => h('div', { className: CLS.row }, h('span', { className: CLS.label }, t(label)), h('span', null, countText(value, t, fallback)))
        return h('div', { className: CLS.section, 'data-fishball-context': true },
          h('h3', null, t('contextWindow')),
          h('p', { className: CLS.muted }, t('contextHint')),
          info('contextModel', view.modelWindow, 'contextUnknown'),
          info('contextEffective', view.effectiveWindow, 'contextUnknown'),
          info('contextThreshold', view.threshold, 'contextUnknown'),
          info('contextPressure', view.pressureTokens, 'contextUnknown'),
          info('contextOutput', view.outputCap, 'contextNone'),
          view.error ? h('div', { role: 'status' }, CONTEXT_ERRORS.has(view.error) ? t('contextError.' + view.error) : t('contextSaveFailed')) : null,
          view.compactionOff ? h('div', { role: 'status' }, t('contextCompactionOff')) : null,
          CONTEXT_FIELDS.map((field) => h(SettingsValueField, {
            key: field,
            id: `${baseId}-${field}`,
            label: t('contextField.' + field),
            text: text(field),
            overridden: stored(field) !== '',
            invalid: invalid(field),
            overriddenLabel: t('overridden'),
            resetLabel: t('contextDefault'),
            invalidLabel: t('contextInvalid'),
            disabled: saving,
            numeric: true,
            onEdit: (next) => setDraft({ ...(draft ?? {}), [field]: next }),
            onReset: () => setDraft({ ...(draft ?? {}), [field]: '' }),
          })),
          problem ? h('div', { role: 'alert' }, t(problem)) : null,
          h('div', { className: CLS.row },
            h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: !dirty || saving || CONTEXT_FIELDS.some(invalid), onClick: save }, saving ? t('saving') : t('save'))))
      }
    }

    /** The tools Fishball never uses, as data from the Host. */
    function makeHiddenTools(t) {
      return function FishballHiddenTools() {
        const state = useFishball()
        return h('div', { className: CLS.section },
          h('h3', null, t('hiddenTools')),
          h('p', null, t('hiddenToolsHint')),
          h('ul', { className: CLS.list }, (state.hiddenTools ?? []).map((name) => h('li', { key: name }, name))))
      }
    }

    function makeHeaderAction(ctx, t) {
      return function FishballHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!sessionId || sessionId !== state.sessionId) return null
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => openSettings(ctx) }, t('openSettings'))
      }
    }

    /** DSH's staged form over the row's live config; Save writes through ctx.settings. */
    function limitsSection(scope) {
      const form = new SettingsFormModel(scope, LIMIT_FIELDS.map((field) => settingsNumberField(field)))
      const store = form.bind(() => ({ ...form.shell(), fields: Object.fromEntries(LIMIT_FIELDS.map((field) => [field, form.field(field)])) }))
      return { store, actions: form.actions(), dispose: () => form.dispose() }
    }

    /** Fishball's whole settings page: status, context window, plugins, limits form, hidden tools. */
    function makeSettingsPage(section, Status, ContextWindow, Plugins, HiddenTools, t) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballSettings(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        const baseId = React.useId()
        if (props.view === SUMMARY_VIEW) return null
        const disabled = !state.writable || state.saving
        return h(React.Fragment, null,
          h(Status),
          h(ContextWindow),
          h(Plugins),
          h('h3', null, t('limits')),
          h(SettingsForm, {
            labels: { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') },
            state,
            onSave: section.actions.save,
            onDiscard: section.actions.discard,
          }, LIMIT_FIELDS.map((field) => {
            const value = state.fields[field]
            return h(SettingsValueField, {
              key: field,
              id: `${baseId}-${field}`,
              label: t('field.' + field),
              text: value.text,
              overridden: value.overridden,
              invalid: value.invalid,
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('invalid'),
              disabled,
              numeric: true,
              onEdit: (text) => section.actions.edit(field, text),
              onReset: () => section.actions.resetField(field),
            })
          })),
          h(HiddenTools))
      }
    }

    function mountStyles() {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    exports.name = PACKAGE_NAME
    exports.inject = ['slots', 'locale', 'configForms']
    exports.apply = function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'fishball: dictionaries')
      ctx.effect(mountStyles, 'fishball: styles')
      const BrandName = makeBrandName(ctx, t)
      ctx.effect(() => ctx.slots.inject(SLOT.mark, () => ctx.slots.inject(SLOT.name, function* () {
        yield ctx.slots.register({ name: SLOT.mark, priority: BRAND_PRIORITY }, Mark)
        yield ctx.slots.register({ name: SLOT.name, priority: BRAND_PRIORITY }, BrandName)
      })), 'fishball: brand')
      const HeaderAction = makeHeaderAction(ctx, t)
      ctx.effect(() => ctx.slots.inject(SLOT.headerActions, () => ctx.slots.register({ name: SLOT.headerActions, id: HEADER_ACTION_ID, order: HEADER_ACTION_ORDER, locale: NS }, HeaderAction)), 'fishball: header action')
      ctx.effect(() => {
        const section = limitsSection(ctx.configForms.get(ENTRY_ID))
        const Settings = makeSettingsPage(section, makeStatus(ctx, t), makeContextWindow(t), makePlugins(t), makeHiddenTools(t), t)
        const stopServing = ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject(SLOT.bundleConfig, () => ctx.slots.register({ name: SLOT.bundleConfig, key: PACKAGE_NAME, locale: NS }, Settings)))
        return () => { stopServing(); section.dispose() }
      }, 'fishball: settings page')
    }
    return module.exports
  },
})
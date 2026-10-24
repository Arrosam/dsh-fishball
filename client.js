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
    const { Button, MenuItemButton, Modal, SettingsForm, SettingsFormModel, SettingsValueField, Switch, Tag, settingsNumberField } = require('@deepseek-ai/dsh-client-ui-primitives')
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
    const API = Object.freeze({ events: 'api/fishball/events', recovery: 'api/fishball/recovery', plugins: 'api/fishball/plugins', toolApprovals: 'api/fishball/tool-approvals/remove', contextWindow: 'api/fishball/context-window', send: 'api/fishball/send', watches: 'api/fishball/watches', watchesRemove: 'api/fishball/watches/remove' })
    /** "Tell Fishball when finished" entries (after Send to Fishball) and refusals with text (src/constants.js WATCH_ERROR). */
    const WATCH_MENU = Object.freeze({ id: 'fishball-watch', order: 425 })
    const WATCH_HEADER = Object.freeze({ id: 'fishball-watch', order: 3 })
    const WATCH_ERRORS = new Set(['unknown-session', 'archived', 'is-fishball', 'limit-reached', 'unknown-watch', 'unavailable'])
    const WATCH_ACTIVE = 'active'
    const WATCH_BY_USER = 'user'
    /** "Send to Fishball" refusals with their own text (keep in step with src/constants.js INTAKE_ERROR). */
    const SEND_ERRORS = new Set(['queue-full', 'too-large', 'from-fishball', 'unknown-session', 'unavailable'])
    /** Session-row menu entry and its place (after DSH's own pin/rename/fork/archive, before the id). */
    const SEND_MENU = Object.freeze({ id: 'fishball-send', order: 420 })
    const SEND_HEADER_ID = 'fishball-send'
    /** Just before Fishball's own settings action. */
    const SEND_HEADER_ORDER = 4
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
      sessionMenu: 'sidebar.workspaces.session.menu.item',
      overlay: 'shell.overlay',
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
    const CLS = Object.freeze({ field: 'fb-field', note: 'fb-note', entries: 'fb-entries', section: 'fb-section', row: 'fb-row', label: 'fb-label', code: 'fb-code', list: 'fb-list', name: 'fb-name', mark: 'fb-mark', plugin: 'fb-plugin', grow: 'fb-grow', muted: 'fb-muted' })

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
      sendToFishball: 'Send to Fishball',
      sendTitle: 'Send "{title}" to Fishball',
      sendNoteLabel: 'Note for Fishball (optional)',
      sendHint: 'Fishball reads this session\'s last answer and your note.',
      send: 'Send',
      cancel: 'Cancel',
      close: 'Close',
      sending: 'Sending…',
      'sendError.queue-full': 'Fishball\'s queue is full. Try again later.',
      'sendError.too-large': 'The note is too long.',
      'sendError.from-fishball': 'This is Fishball\'s own session.',
      'sendError.unknown-session': 'This session could not be read.',
      'sendError.unavailable': 'Fishball is not running.',
      sendFailed: 'That did not work.',
      watchSession: 'Tell Fishball when finished',
      watching: 'Fishball is watching',
      watchFailed: 'Fishball could not watch this session.',
      'watchError.unknown-session': 'This session could not be read.',
      'watchError.archived': 'This session is archived.',
      'watchError.is-fishball': 'This is Fishball\'s own session.',
      'watchError.limit-reached': 'Fishball is watching as many sessions as it may.',
      'watchError.unknown-watch': 'That watch is already closed.',
      'watchError.unavailable': 'Fishball is not running.',
      watches: 'Watches',
      watchesHint: 'Sessions Fishball tells you about when they finish. Set one up from a session\'s menu.',
      'watchBy.user': 'You',
      'watchBy.assistant': 'Fishball',
      'watchBy.agent': 'The session itself',
      'watchCondition.finished': 'When finished',
      'watchCondition.per-turn': 'Every turn',
      'watchStatus.active': 'Active',
      'watchStatus.closed': 'Closed',
      'watchStatus.target-missing': 'Session gone',
      watchFired: 'Told {count}×',
      intake: 'Queue',
      intakeHint: 'Inputs that wake Fishball: messages from other sessions, sessions you forward, and notices.',
      intakeQueued: 'Waiting to be read',
      intakeFailed: 'Could not be delivered',
      intakeWakeups: 'Wake-ups this hour',
      'intakeKind.session': 'From a session',
      'intakeKind.user': 'From you',
      'intakeKind.system': 'Notice',
      'intakeKind.watch': 'Watched session',
      'intakeKind.approval': 'Permission request',
      'intakeStatus.pending': 'Waiting',
      'intakeStatus.accepted': 'Queued',
      'intakeStatus.consumed': 'Read',
      'intakeStatus.discarded': 'Cleared',
      'intakeStatus.failed': 'Failed',
      outbox: 'Sent by Fishball',
      outboxHint: 'Messages Fishball sent to other sessions and sessions it started.',
      'outboxKind.message': 'Message',
      'outboxKind.start': 'New session',
      'outboxStatus.delivered': 'Delivered',
      'outboxStatus.unconfirmed': 'Delivered, not confirmed',
      'outboxStatus.failed': 'Failed',
      nothingYet: 'Nothing yet.',
      sources: 'Plugin sources',
      sourcesHint: 'Plugins that send Fishball events through ctx.fishball. A source is off while Fishball is not running or has its plugin turned off.',
      sourceOn: 'Accepting events',
      sourceOff: 'Off',
      'intakeKind.plugin': 'Plugin event',
      approvals: 'Permission requests',
      approvalsHint: 'Other sessions\' permission requests go to Fishball first. It approves only low-risk requests within an allowance you gave it in its chat, and hands the rest to you in that session.',
      approvalsWaiting: 'Waiting for Fishball',
      'approvalAnswer.allow': 'Approved by Fishball',
      'approvalAnswer.escalate': 'Sent to you',
      'approvalAnswer.timeout': 'No answer in time; sent to you',
      'approvalAnswer.withdrawn': 'Withdrawn',
      'approvalOutcome.allowed-once': 'allowed once',
      'approvalOutcome.rejected': 'rejected',
      'approvalOutcome.cancelled': 'cancelled',
      'approvalOutcome.unavailable': 'no answer',
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
      sendToFishball: '发送给 Fishball',
      sendTitle: '把“{title}”发送给 Fishball',
      sendNoteLabel: '给 Fishball 的备注（可选）',
      sendHint: 'Fishball 会读取此会话的最后一条回复和你的备注。',
      send: '发送',
      cancel: '取消',
      close: '关闭',
      sending: '发送中…',
      'sendError.queue-full': 'Fishball 的队列已满，请稍后再试。',
      'sendError.too-large': '备注太长。',
      'sendError.from-fishball': '这是 Fishball 自己的会话。',
      'sendError.unknown-session': '无法读取此会话。',
      'sendError.unavailable': 'Fishball 未在运行。',
      sendFailed: '操作未成功。',
      watchSession: '完成时通知 Fishball',
      watching: 'Fishball 正在关注',
      watchFailed: 'Fishball 无法关注此会话。',
      'watchError.unknown-session': '无法读取此会话。',
      'watchError.archived': '此会话已归档。',
      'watchError.is-fishball': '这是 Fishball 自己的会话。',
      'watchError.limit-reached': 'Fishball 关注的会话已达上限。',
      'watchError.unknown-watch': '该关注已关闭。',
      'watchError.unavailable': 'Fishball 未在运行。',
      watches: '关注',
      watchesHint: '这些会话完成时 Fishball 会告诉你。可在会话菜单中设置。',
      'watchBy.user': '你',
      'watchBy.assistant': 'Fishball',
      'watchBy.agent': '会话自己',
      'watchCondition.finished': '完成时',
      'watchCondition.per-turn': '每个回合',
      'watchStatus.active': '进行中',
      'watchStatus.closed': '已关闭',
      'watchStatus.target-missing': '会话已不存在',
      watchFired: '已通知 {count} 次',
      intake: '队列',
      intakeHint: '会唤醒 Fishball 的输入：其他会话的消息、你转发的会话和通知。',
      intakeQueued: '等待读取',
      intakeFailed: '无法送达',
      intakeWakeups: '本小时唤醒次数',
      'intakeKind.session': '来自会话',
      'intakeKind.user': '来自你',
      'intakeKind.system': '通知',
      'intakeKind.watch': '关注的会话',
      'intakeKind.approval': '权限请求',
      'intakeStatus.pending': '等待中',
      'intakeStatus.accepted': '已排队',
      'intakeStatus.consumed': '已读取',
      'intakeStatus.discarded': '已清除',
      'intakeStatus.failed': '失败',
      outbox: 'Fishball 发出的',
      outboxHint: 'Fishball 发给其他会话的消息和它新建的会话。',
      'outboxKind.message': '消息',
      'outboxKind.start': '新会话',
      'outboxStatus.delivered': '已送达',
      'outboxStatus.unconfirmed': '已送达，未确认',
      'outboxStatus.failed': '失败',
      nothingYet: '暂无。',
      sources: '插件信息源',
      sourcesHint: '通过 ctx.fishball 向 Fishball 发送事件的插件。Fishball 未运行或关闭了该插件时，信息源处于关闭状态。',
      sourceOn: '正在接收事件',
      sourceOff: '已关闭',
      'intakeKind.plugin': '插件事件',
      approvals: '权限请求',
      approvalsHint: '其他会话的权限请求会先交给 Fishball。它只会在你于对话中给出的授权范围内批准低风险请求，其余的交给你在该会话中决定。',
      approvalsWaiting: '等待 Fishball 处理',
      'approvalAnswer.allow': 'Fishball 已批准',
      'approvalAnswer.escalate': '已转交给你',
      'approvalAnswer.timeout': '超时未答复，已转交给你',
      'approvalAnswer.withdrawn': '已撤回',
      'approvalOutcome.allowed-once': '允许一次',
      'approvalOutcome.rejected': '已拒绝',
      'approvalOutcome.cancelled': '已取消',
      'approvalOutcome.unavailable': '无人答复',
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
      `.${CLS.field}{display:flex;flex-direction:column;gap:6px;margin-top:8px}`,
      `.${CLS.note}{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--dsw-alias-border-primary);border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font:inherit;resize:vertical}`,
      `.${CLS.entries}{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}`,
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

    /**
     * "Send to Fishball" (DESIGN §5b): one request store shared by the session-row menu entry
     * and the header action; the dialog lives in the shell overlay so it outlives the menu.
     */
    const sendRequest = (() => {
      let current = null
      const listeners = new Set()
      const set = (next) => { current = next; for (const listener of listeners) listener() }
      return {
        open: (sessionId, title) => set({ sessionId, title }),
        close: () => set(null),
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        get: () => current,
      }
    })()
    const useSendRequest = () => React.useSyncExternalStore(sendRequest.subscribe, sendRequest.get)

    /** Whether a session can be sent: Fishball runs, and it is not Fishball's own session. */
    const canSend = (state, sessionId) => state.status === STATUS.live && Boolean(sessionId) && sessionId !== state.sessionId

    function makeSendMenuItem(t) {
      return function FishballSendMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
        const state = useFishball()
        const [, setMenuOpen] = useMenuOpenState()
        if (!canSend(state, sessionId)) return null
        return h(MenuItemButton, { onSelect: () => { setMenuOpen(false); sendRequest.open(sessionId, displayTitle) } }, t('sendToFishball'))
      }
    }

    function makeSendHeaderAction(t) {
      return function FishballSendHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!canSend(state, sessionId)) return null
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => sendRequest.open(sessionId, '') }, t('sendToFishball'))
      }
    }

    function makeSendDialog(t) {
      return function FishballSendDialog() {
        const request = useSendRequest()
        if (request === null) return null
        return h(SendForm, { key: request.sessionId, request, t })
      }
    }

    /** One request's dialog: the note and in-flight state die with it. */
    function SendForm({ request, t }) {
      const [note, setNote] = React.useState('')
      const [sending, setSending] = React.useState(false)
      const [problem, setProblem] = React.useState(null)
      const close = () => { if (!sending) sendRequest.close() }
      const confirm = async () => {
        setSending(true)
        const { ok, code } = await send(API.send, { sessionId: request.sessionId, note })
        setSending(false)
        if (ok) sendRequest.close()
        else setProblem(SEND_ERRORS.has(code) ? 'sendError.' + code : 'sendFailed')
      }
      return h(Modal, {
        open: true,
        onClose: close,
        closeLabel: t('close'),
        title: request.title ? t('sendTitle', { title: request.title }) : t('sendToFishball'),
        footer: h(React.Fragment, null,
          h(Button, { type: 'button', variant: 'outline', disabled: sending, onClick: close }, t('cancel')),
          h(Button, { type: 'button', variant: 'primary', disabled: sending, onClick: confirm }, sending ? t('sending') : t('send'))),
      },
        h('p', { className: CLS.muted }, t('sendHint')),
        h('label', { className: CLS.field },
          h('span', null, t('sendNoteLabel')),
          h('textarea', { className: CLS.note, value: note, rows: 4, 'data-modal-autofocus': true, disabled: sending, onChange: (event) => { setNote(event.target.value); setProblem(null) } })),
        problem ? h('div', { role: 'alert' }, t(problem)) : null)
    }

    /** The queue and the outbox (DESIGN §10): counts and recent entries, no message text. */
    function makeIntake(t) {
      return function FishballIntake() {
        const state = useFishball()
        const intake = state.intake
        const outbox = state.outbox
        if (!intake || !outbox) return null
        const row = (label, value) => h('div', { className: CLS.row }, h('span', { className: CLS.label }, t(label)), h('span', null, String(value)))
        return h(React.Fragment, null,
          h('div', { className: CLS.section, 'data-fishball-intake': true },
            h('h3', null, t('intake')),
            h('p', { className: CLS.muted }, t('intakeHint')),
            row('intakeQueued', intake.queued),
            row('intakeFailed', intake.failed),
            row('intakeWakeups', intake.wakeupsThisHour),
            intake.items.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, intake.items.map((item) => h('li', { key: item.intakeId },
              h(Tag, { tone: 'neutral' }, t('intakeKind.' + item.kind)), ' ',
              h('span', { className: CLS.code }, item.sourceIdentity), ' ',
              h(Tag, { tone: item.status === 'failed' ? 'danger' : 'info' }, t('intakeStatus.' + item.status)), ' ',
              h('span', { className: CLS.muted }, item.createdAt))))),
          h('div', { className: CLS.section, 'data-fishball-outbox': true },
            h('h3', null, t('outbox')),
            h('p', { className: CLS.muted }, t('outboxHint')),
            outbox.entries.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, outbox.entries.map((entry) => h('li', { key: entry.key },
              h(Tag, { tone: 'neutral' }, t('outboxKind.' + entry.kind)), ' ',
              h('span', { className: CLS.code }, entry.targetSessionId ?? entry.folder ?? ''), ' ',
              h(Tag, { tone: entry.status === 'failed' ? 'danger' : 'info' }, t('outboxStatus.' + entry.status)), ' ',
              h('span', { className: CLS.muted }, entry.at))))))
      }
    }

    /**
     * Whether YOU have an active watch on a session (the entries then say so). A watch Fishball
     * or the session set up (e.g. per-turn) is separate: yours is still offered.
     */
    const isWatched = (state, sessionId) => (state.watches?.watches ?? []).some((watch) => watch.targetSessionId === sessionId && watch.status === WATCH_ACTIVE && watch.createdBy?.kind === WATCH_BY_USER)

    /**
     * Watch requests and their refusal, in one store outside the menu: a menu entry unmounts when
     * the menu closes, so the refusal is shown by the overlay (makeWatchNotice), not by the entry.
     */
    const watchNotice = (() => {
      let current = null
      const listeners = new Set()
      const set = (next) => { current = next; for (const listener of listeners) listener() }
      return {
        async watch(sessionId) {
          const { ok, code } = await send(API.watches, { sessionId })
          set(ok ? null : WATCH_ERRORS.has(code) ? 'watchError.' + code : 'watchFailed')
        },
        dismiss: () => set(null),
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        get: () => current,
      }
    })()

    function makeWatchMenuItem(t) {
      return function FishballWatchMenuItem({ sessionId, useMenuOpenState }) {
        const state = useFishball()
        const [, setMenuOpen] = useMenuOpenState()
        if (!canSend(state, sessionId)) return null
        // Already watched: the entry says so; choosing it again returns the same watch.
        const watched = isWatched(state, sessionId)
        return h(MenuItemButton, { onSelect: () => { setMenuOpen(false); void watchNotice.watch(sessionId) } }, watched ? t('watching') : t('watchSession'))
      }
    }

    function makeWatchHeaderAction(t) {
      return function FishballWatchHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!canSend(state, sessionId)) return null
        const watched = isWatched(state, sessionId)
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: watched, onClick: () => void watchNotice.watch(sessionId) }, watched ? t('watching') : t('watchSession'))
      }
    }

    /** The refusal of the last watch request, as a dialog in the shell overlay. */
    function makeWatchNotice(t) {
      return function FishballWatchNotice() {
        const problem = React.useSyncExternalStore(watchNotice.subscribe, watchNotice.get)
        if (problem === null) return null
        return h(Modal, {
          open: true,
          onClose: watchNotice.dismiss,
          closeLabel: t('close'),
          title: t('watchSession'),
          footer: h(Button, { type: 'button', variant: 'primary', onClick: watchNotice.dismiss }, t('close')),
        }, h('div', { role: 'alert' }, t(problem)))
      }
    }

    /** The watches section (DESIGN §10): each watch with who set it up, and Remove. */
    function makeWatches(t) {
      return function FishballWatches() {
        const state = useFishball()
        const [problem, setProblem] = React.useState(null)
        const view = state.watches
        if (!view) return null
        const remove = async (watchId) => {
          const { ok, code } = await send(API.watchesRemove, { watchId })
          setProblem(ok ? null : WATCH_ERRORS.has(code) ? 'watchError.' + code : 'watchFailed')
        }
        return h('div', { className: CLS.section, 'data-fishball-watches': true },
          h('h3', null, t('watches')),
          h('p', { className: CLS.muted }, t('watchesHint')),
          problem ? h('div', { role: 'alert' }, t(problem)) : null,
          view.watches.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, view.watches.map((watch) => h('li', { key: watch.id },
            h('span', { className: CLS.code }, watch.targetSessionId), ' ',
            h(Tag, { tone: 'neutral' }, t('watchCondition.' + watch.condition)), ' ',
            h(Tag, { tone: 'neutral' }, t('watchBy.' + watch.createdBy.kind)), ' ',
            h(Tag, { tone: watch.status === WATCH_ACTIVE ? 'info' : 'neutral' }, t('watchStatus.' + watch.status)), ' ',
            watch.firedCount > 0 ? h('span', { className: CLS.muted }, t('watchFired', { count: watch.firedCount })) : null, ' ',
            watch.status === WATCH_ACTIVE ? h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => void remove(watch.id) }, t('remove')) : null))))
      }
    }

    /** Plugin sources (DESIGN §8, §10): each registered source and whether it accepts events. */
    function makeSources(t) {
      return function FishballSources() {
        const state = useFishball()
        const view = state.sources
        if (!view) return null
        return h('div', { className: CLS.section, 'data-fishball-sources': true },
          h('h3', null, t('sources')),
          h('p', { className: CLS.muted }, t('sourcesHint')),
          view.sources.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, view.sources.map((source) => h('li', { key: source.identity },
            h('span', { className: CLS.name }, source.title), ' ',
            h('span', { className: CLS.code }, source.identity), ' ',
            h(Tag, { tone: source.enabled ? 'info' : 'neutral' }, t(source.enabled ? 'sourceOn' : 'sourceOff'))))))
      }
    }

    /** Permission requests (DESIGN §10): waiting ones, then the recent audit. Never the arguments. */
    function makeApprovals(t) {
      return function FishballApprovals() {
        const state = useFishball()
        const view = state.approvals
        if (!view) return null
        return h('div', { className: CLS.section, 'data-fishball-approvals': true },
          h('h3', null, t('approvals')),
          h('p', { className: CLS.muted }, t('approvalsHint')),
          view.pending.length > 0 ? h('ul', { className: CLS.entries }, view.pending.map((p) => h('li', { key: p.id },
            h(Tag, { tone: 'info' }, t('approvalsWaiting')), ' ', h('span', { className: CLS.code }, p.toolName), ' ', h('span', { className: CLS.muted }, p.sessionId)))) : null,
          view.recent.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, view.recent.map((entry) => h('li', { key: entry.key },
            h(Tag, { tone: entry.answer === 'allow' ? 'danger' : 'neutral' }, t('approvalAnswer.' + entry.answer)), ' ',
            h('span', { className: CLS.code }, entry.toolName), ' ',
            h('span', { className: CLS.muted }, entry.sessionId), ' ',
            h('span', { className: CLS.muted }, t('approvalOutcome.' + entry.finalOutcome)), ' ',
            entry.rationale ? h('span', null, entry.rationale) : null))))
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
    function makeSettingsPage(section, Status, ContextWindow, Intake, Watches, Approvals, Sources, Plugins, HiddenTools, t) {
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
          h(Intake),
          h(Watches),
          h(Approvals),
          h(Sources),
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
      ctx.effect(() => ctx.slots.inject(SLOT.headerActions, function* () {
        yield ctx.slots.register({ name: SLOT.headerActions, id: HEADER_ACTION_ID, order: HEADER_ACTION_ORDER, locale: NS }, HeaderAction)
        yield ctx.slots.register({ name: SLOT.headerActions, id: SEND_HEADER_ID, order: SEND_HEADER_ORDER, locale: NS }, makeSendHeaderAction(t))
        yield ctx.slots.register({ name: SLOT.headerActions, id: WATCH_HEADER.id, order: WATCH_HEADER.order, locale: NS }, makeWatchHeaderAction(t))
      }), 'fishball: header actions')
      ctx.effect(() => ctx.slots.inject(SLOT.sessionMenu, function* () {
        yield ctx.slots.register({ name: SLOT.sessionMenu, id: SEND_MENU.id, order: SEND_MENU.order, locale: NS }, makeSendMenuItem(t))
        yield ctx.slots.register({ name: SLOT.sessionMenu, id: WATCH_MENU.id, order: WATCH_MENU.order, locale: NS }, makeWatchMenuItem(t))
      }), 'fishball: session menu')
      ctx.effect(() => ctx.slots.inject(SLOT.overlay, function* () {
        yield ctx.slots.register({ name: SLOT.overlay, id: SEND_MENU.id, locale: NS }, makeSendDialog(t))
        yield ctx.slots.register({ name: SLOT.overlay, id: WATCH_MENU.id, locale: NS }, makeWatchNotice(t))
      }), 'fishball: dialogs')
      ctx.effect(() => {
        const section = limitsSection(ctx.configForms.get(ENTRY_ID))
        const Settings = makeSettingsPage(section, makeStatus(ctx, t), makeContextWindow(t), makeIntake(t), makeWatches(t), makeApprovals(t), makeSources(t), makePlugins(t), makeHiddenTools(t), t)
        const stopServing = ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject(SLOT.bundleConfig, () => ctx.slots.register({ name: SLOT.bundleConfig, key: PACKAGE_NAME, locale: NS }, Settings)))
        return () => { stopServing(); section.dispose() }
      }, 'fishball: settings page')
    }
    return module.exports
  },
})
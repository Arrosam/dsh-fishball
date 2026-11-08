/**
 * The custom page's words (I9; design D30, §0.5 "Languages", §0.9 U7: one page, two dictionaries).
 *
 * Every user-visible string of the page lives here, in an English and a Chinese dictionary with
 * the same keys: the shell, the chat, the composer, the approvals and reminders rows, the record
 * rows, the settings view, and the main proxy's 503 page (src/slim/host/embed.js imports this
 * module on the main side, so both halves apply one language rule).
 *
 * The language is the page URL's first `lang` parameter (contract 1.1 UI_LANG, which the
 * connector appends to the framed path, task K2): exactly `zh` selects Chinese, and anything else,
 * or no `lang`, selects English, DSH's own fallback locale (dsh-client-locale FALLBACK_LOCALE).
 * The page reads it once; a DSH language change reloads the frame (K2), so nothing here re-reads.
 *
 * The `record.*` entries repeat the connector's `record.*` words (packages/connector/client.js,
 * its en and zh dictionaries) key for key and word for word (§0.9 U6); a test compares them.
 *
 * Values are plain text with `{name}` placeholders, as DSH's own dictionaries write them, so the
 * two dictionaries can be compared key by key. Callers assign the result as textContent; the 503
 * page escapes it.
 *
 * This module is served to the browser as a no-build file (src/slim/child/server.js /ui/*) and
 * imported by Node on the main side, so it uses no DOM and no Node API.
 */

/** The `lang` parameter and its two values (contract 1.1 UI_LANG; the page imports no contract file). */
export const LANG = Object.freeze({ parameter: 'lang', en: 'en', zh: 'zh' })

/** `<html lang>` and the date and number locale per language: DSH's own mapping (syncDocumentLanguage). */
const LOCALE = Object.freeze({ [LANG.en]: 'en', [LANG.zh]: 'zh-CN' })

/** A `{name}` placeholder in a dictionary value. */
const PLACEHOLDER = /\{(\w+)\}/g

/** The key that joins a page's own failure words with the refusal code it got (§0.9 answer, I9). */
const WITH_CODE = 'common.withCode'

const EN = Object.freeze({
  [WITH_CODE]: '{message} ({code})',

  'page.title': 'Fishball',
  'shell.reconnecting': 'Reconnecting…',
  'shell.settings': 'Settings',
  'shell.back': 'Back to chat',
  'shell.chatRegion': 'Fishball chat',
  'shell.remindersRegion': 'Reminders',

  'chat.author.user': 'You',
  'chat.author.schedule': 'Reminder',
  'chat.author.other': 'Context',
  'chat.fishball': 'Fishball',
  'chat.tool': 'Tool',
  'chat.working': 'Fishball is working…',
  'chat.idle': 'Ready',
  'chat.running': 'Running',
  'chat.done': 'Done',
  'chat.failed': 'Failed',
  'chat.model': 'Model',
  'chat.effort': 'Reasoning effort',
  'chat.defaultEffort': 'Default effort',
  'chat.chooseModel': 'Choose a model',
  'chat.noModels': 'No models',
  'chat.loadFailed': 'The conversation could not be loaded.',
  'chat.sendFailed': 'The message could not be sent.',
  'chat.modelFailed': 'The model choice could not be applied.',

  'composer.readOnly': 'Read Only',
  'composer.readOnlyHint': 'Fishball\'s session is read-only. The composer has no permission control.',
  'composer.prompt': 'Message Fishball',
  'composer.send': 'Send',
  'composer.attach': 'Attach',
  'composer.attachHint': 'Add images or files',
  'composer.image': 'Image',
  'composer.file': 'File',
  'composer.remove': 'Remove',
  'composer.removeName': 'Remove attachment: {name}',
  'composer.noPreview': 'Preview unavailable.',
  'composer.from': 'from {session}',
  'composer.bytes': '{bytes} bytes',
  'composer.attachFailed': 'The attachment could not be added.',

  'approvals.cardNote': 'Fishball decides this request with its own tools. This row is the view of the live card.',
  'approvals.question': 'Fishball is waiting for your answer',
  'approvals.tool': 'Tool',
  'approvals.prompt': 'Prompt',
  'approvals.arguments': 'Arguments',
  'approvals.argumentsTruncated': 'truncated',
  'approvals.reason': 'Reason',
  'approvals.answer': 'Fishball answered',
  'approvals.outcome': 'Outcome',
  'approvals.settled': 'You decided',
  'approvals.merged': 'Fishball made {count} decisions',
  'approvals.expires': 'expires in {minutes} min',
  'approvals.expiring': 'expiring',
  'approvals.waiting': 'waiting',
  'approvals.custom': 'Your own answer',
  'approvals.submit': 'Answer',
  'approvals.approvePlan': 'Approve plan',
  'approvals.keepPlanning': 'Keep planning',
  'approvals.feedback': 'Feedback for the plan',
  'approvals.answered': 'The user answered: {text}',
  'approvals.closed': 'closed',
  'approvals.closedReason': 'Card closed before you answered: {reason}',
  'approvals.failed': 'The answer was refused.',
  'approvals.noOption': 'No options',
  'approvals.kind.approval': 'Permission request',
  'approvals.kind.grant': 'Standing grant',
  'approvals.kind.question': 'Question',
  'approvals.kind.escalation': 'Escalation',
  'approvals.kind.plan-review': 'Plan review',
  'approvals.decision.allow': 'allowed once',
  'approvals.decision.grant': 'allowed and granted',
  'approvals.decision.reject': 'rejected',
  'approvals.decision.ask': 'asked a question',
  'approvals.decision.escalate': 'escalated to you',
  'approvals.choice.allow': 'Allow once',
  'approvals.choice.grant': 'Allow and grant',
  'approvals.choice.reject': 'Reject',
  'approvals.choice.ask': 'Ask the session',
  'approvals.choice.escalate': 'Escalate to you',
  'approvals.outcome.revoked': 'grant revoked',
  'approvals.outcome.toUser': 'sent to you',
  'approvals.outcome.leftToUser': 'left to you, unanswered by Fishball',
  'approvals.outcome.answered': 'answered',
  'approvals.outcome.waiting': 'waiting',
  'approvals.ran.passFishball': 'ran on Fishball\'s one-time approval',
  'approvals.ran.passUser': 'ran on your one-time approval',
  'approvals.ran.grantFishball': 'ran on Fishball\'s standing grant',

  'reminders.heading': 'Reminders',
  'reminders.loading': 'Loading reminders…',
  'reminders.empty': 'No reminders yet.',
  'reminders.loadFailed': 'Reminders could not be loaded.',
  'reminders.cancelFailed': 'The reminder could not be cancelled.',
  'reminders.cancel': 'Cancel',
  'reminders.delete': 'Delete',
  'reminders.cancelName': 'Cancel reminder: {title}',
  'reminders.deleteName': 'Delete reminder: {title}',
  'reminders.showing': 'Showing {shown} of {total} reminders.',
  'reminders.status.active': 'Active',
  'reminders.status.paused': 'Paused',
  'reminders.status.ended': 'Ended',

  'record.question': 'Question', 'record.plan-review': 'Plan review', 'record.permission': 'Permission request',
  'record.by.user': 'You', 'record.by.fishball': 'Fishball', 'record.place.pile': 'on the card', 'record.place.session': 'in the session',
  'record.outcome.allowed': 'Allowed once', 'record.outcome.granted': 'Allowed and granted', 'record.outcome.rejected': 'Rejected',
  'record.outcome.answered': 'Answered', 'record.outcome.skipped': 'Skipped', 'record.outcome.closed': 'Closed',
  'record.from': 'From', 'record.answer': 'Answer', 'record.tool': 'Tool', 'record.arguments': 'Arguments', 'record.reason': 'Reason', 'record.note': 'Note', 'record.closed': 'Why it closed', 'record.own': 'Fishball asked you',

  'settings.region': 'Fishball settings',
  'settings.statusTitle': 'Status',
  'settings.statusHint': 'Restart stops Fishball\'s private instance and starts it again; its own home and settings are kept.',
  'settings.restart': 'Restart',
  'settings.restarting': 'Restarting…',
  'settings.reload': 'Reload',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',
  'settings.state.disabled': 'disabled',
  'settings.state.waiting': 'waiting',
  'settings.state.starting': 'starting',
  'settings.state.ready': 'running',
  'settings.state.stopping': 'stopping',
  'settings.state.stopped': 'stopped',
  'settings.state.failed': 'failed',
  'settings.state.connector-missing': 'connector missing',
  'settings.modelTitle': 'Model',
  'settings.modelHint': 'Fishball\'s default model and reasoning effort, from its own catalog. A change applies to its next request and does not change the model your other sessions use.',
  'settings.modelSyncHint': 'New models from DSH are added from Fishball instance → Model for Fishball in DSH\'s Plugins.',
  'settings.provider': 'Provider',
  'settings.model': 'Model',
  'settings.effort': 'Reasoning effort',
  'settings.effortDefault': 'Model default',
  'settings.modelUnknown': 'The saved model {model} (provider {provider}) is not in Fishball\'s current catalog. Choose another model, or use the running model.',
  'settings.modelCatalogEmpty': 'Provider {provider} lists no models in Fishball\'s catalog right now. It may need a credential, or no model is configured for it.',
  'settings.modelProviderUnknown': 'The saved provider {provider} is not available in Fishball. Choose another provider.',
  'settings.modelRunning': 'Fishball is currently running {provider} / {model}.',
  'settings.useRunningModel': 'Use the running model',
  'settings.modelSaved': 'Saved. Fishball uses it from its next request.',
  'settings.modelSavedNotApplied': 'Saved as the default. The live chat could not take it now; its next request may still use the previous model.',
  'settings.pluginsTitle': 'Plugins',
  'settings.pluginsHint': 'Installed in Fishball\'s own profile; nothing here changes DSH\'s plugins.',
  'settings.installed': 'Installed',
  'settings.noPlugins': 'No plugins are installed in Fishball.',
  'settings.enabled': 'On',
  'settings.core': 'Core',
  'settings.pluginToggle': 'Use {name} in Fishball',
  'settings.remove': 'Uninstall',
  'settings.removeLabel': 'Uninstall {name} from Fishball',
  'settings.installTitle': 'Install a plugin',
  'settings.installHint': 'A package name with an optional version, a Git address, a tarball URL or an absolute folder path.',
  'settings.installSpec': 'Package spec',
  'settings.install': 'Install',
  'settings.installLabel': 'Install {name} for Fishball',
  'settings.recommendedTitle': 'Recommended plugins',
  'settings.recommendedHint': 'A fixed list chosen for Fishball. Installing one changes only Fishball\'s profile.',
  'settings.category.context': 'Context management',
  'settings.category.memory': 'Memory',
  'settings.category.channel': 'Channel',
  'settings.category.pet': 'Pet',
  'settings.pluginDone': 'Done.',
  'settings.settingsTitle': 'Plugin settings',
  'settings.ns.session-log-deepseek': 'DeepSeek session log upload',
  'settings.ns.agent-default-model': 'Default model',
  'settings.ns.llm-pi-ai': 'pi-ai model adapter',
  'settings.ns.ui-settings-general': 'General settings',
  'settings.ns.ui-theme': 'Theme',
  'settings.ns.fishball-connector': 'Fishball connector',
  'settings.field.enabled': 'Enabled',
  'settings.field.provider': 'Provider',
  'settings.field.model': 'Model',
  'settings.field.reasoningEffort': 'Reasoning effort',
  'settings.field.providers': 'Providers',
  'settings.field.maxBytes': 'Maximum bytes',
  'settings.settingsHint': 'The settings Fishball\'s own plugins publish. Each Save sends the revision this page read, so a change made elsewhere is refused instead of overwritten.',
  'settings.settingsReadOnly': 'Fishball stores settings read-only, so they cannot be changed here.',
  'settings.settingsNone': 'No plugin in Fishball publishes a setting.',
  'settings.settingsSaved': 'Saved.',
  'settings.stale': 'This changed elsewhere since the page read it, so nothing was written. The current values were reloaded; review them and save again.',
  'settings.settingsInvalid': 'A value is not valid for its field.',
  'settings.secretSet': 'Set; type a new value to replace it.',
  'settings.secretUnset': 'Not set.',
  'settings.listHint': 'One item per line.',
  'settings.readOnlyField': 'Shown only; it cannot be changed here.',
  'settings.refused': 'Refused: {code}',

  'unavailable.title': 'Fishball unavailable',
  'unavailable.heading': 'Fishball is not available',
  'unavailable.state': 'State:',
  'unavailable.code': 'Code:',
  'unavailable.retryHint': 'Retry starts the isolated Fishball again.',
  'unavailable.retry': 'Retry',
})

const ZH = Object.freeze({
  [WITH_CODE]: '{message}（{code}）',

  'page.title': 'Fishball',
  'shell.reconnecting': '正在重新连接…',
  'shell.settings': '设置',
  'shell.back': '返回聊天',
  'shell.chatRegion': 'Fishball 聊天',
  'shell.remindersRegion': '提醒',

  'chat.author.user': '你',
  'chat.author.schedule': '提醒',
  'chat.author.other': '上下文',
  'chat.fishball': 'Fishball',
  'chat.tool': '工具',
  'chat.working': 'Fishball 正在处理…',
  'chat.idle': '就绪',
  'chat.running': '运行中',
  'chat.done': '完成',
  'chat.failed': '失败',
  'chat.model': '模型',
  'chat.effort': '推理强度',
  'chat.defaultEffort': '默认强度',
  'chat.chooseModel': '选择模型',
  'chat.noModels': '没有可用模型',
  'chat.loadFailed': '对话未能读取。',
  'chat.sendFailed': '消息未能发送。',
  'chat.modelFailed': '模型选择未能应用。',

  'composer.readOnly': '只读',
  'composer.readOnlyHint': 'Fishball 的会话是只读的。输入框没有权限控制。',
  'composer.prompt': '给 Fishball 发消息',
  'composer.send': '发送',
  'composer.attach': '附件',
  'composer.attachHint': '添加图片或文件',
  'composer.image': '图片',
  'composer.file': '文件',
  'composer.remove': '移除',
  'composer.removeName': '移除附件：{name}',
  'composer.noPreview': '无法预览。',
  'composer.from': '来自 {session}',
  'composer.bytes': '{bytes} 字节',
  'composer.attachFailed': '附件未能添加。',

  'approvals.cardNote': 'Fishball 会用自己的工具处理这个请求。这一行只是实时卡片的视图。',
  'approvals.question': 'Fishball 正在等你回答',
  'approvals.tool': '工具',
  'approvals.prompt': '提示',
  'approvals.arguments': '参数',
  'approvals.argumentsTruncated': '已截断',
  'approvals.reason': '理由',
  'approvals.answer': 'Fishball 的回答',
  'approvals.outcome': '结果',
  'approvals.settled': '你的决定',
  'approvals.merged': 'Fishball 做了 {count} 个决定',
  'approvals.expires': '{minutes} 分钟后过期',
  'approvals.expiring': '即将过期',
  'approvals.waiting': '等待中',
  'approvals.custom': '你自己的回答',
  'approvals.submit': '回答',
  'approvals.approvePlan': '批准计划',
  'approvals.keepPlanning': '继续规划',
  'approvals.feedback': '对计划的反馈',
  'approvals.answered': '用户回答了：{text}',
  'approvals.closed': '已关闭',
  'approvals.closedReason': '卡片在你回答前已关闭：{reason}',
  'approvals.failed': '回答被拒绝。',
  'approvals.noOption': '没有选项',
  'approvals.kind.approval': '权限请求',
  'approvals.kind.grant': '长期授权',
  'approvals.kind.question': '问题',
  'approvals.kind.escalation': '升级',
  'approvals.kind.plan-review': '计划审阅',
  'approvals.decision.allow': '已允许一次',
  'approvals.decision.grant': '已允许并授权',
  'approvals.decision.reject': '已拒绝',
  'approvals.decision.ask': '提出了问题',
  'approvals.decision.escalate': '已转交给你',
  'approvals.choice.allow': '允许一次',
  'approvals.choice.grant': '允许并授权',
  'approvals.choice.reject': '拒绝',
  'approvals.choice.ask': '询问会话',
  'approvals.choice.escalate': '转交给你',
  'approvals.outcome.revoked': '授权已撤销',
  'approvals.outcome.toUser': '已发给你',
  'approvals.outcome.leftToUser': '留给你，Fishball 未回答',
  'approvals.outcome.answered': '已回答',
  'approvals.outcome.waiting': '等待中',
  'approvals.ran.passFishball': '凭 Fishball 的一次性批准运行',
  'approvals.ran.passUser': '凭你的一次性批准运行',
  'approvals.ran.grantFishball': '凭 Fishball 的长期授权运行',

  'reminders.heading': '提醒',
  'reminders.loading': '正在读取提醒…',
  'reminders.empty': '还没有提醒。',
  'reminders.loadFailed': '提醒未能读取。',
  'reminders.cancelFailed': '提醒未能取消。',
  'reminders.cancel': '取消',
  'reminders.delete': '删除',
  'reminders.cancelName': '取消提醒：{title}',
  'reminders.deleteName': '删除提醒：{title}',
  'reminders.showing': '显示 {total} 个提醒中的 {shown} 个。',
  'reminders.status.active': '进行中',
  'reminders.status.paused': '已暂停',
  'reminders.status.ended': '已结束',

  'record.question': '问题', 'record.plan-review': '计划审阅', 'record.permission': '权限请求',
  'record.by.user': '你', 'record.by.fishball': 'Fishball', 'record.place.pile': '在卡片上', 'record.place.session': '在会话中',
  'record.outcome.allowed': '已允许一次', 'record.outcome.granted': '已允许并授权', 'record.outcome.rejected': '已拒绝',
  'record.outcome.answered': '已回答', 'record.outcome.skipped': '已跳过', 'record.outcome.closed': '已关闭',
  'record.from': '来自', 'record.answer': '回答', 'record.tool': '工具', 'record.arguments': '参数', 'record.reason': '理由', 'record.note': '备注', 'record.closed': '关闭原因', 'record.own': 'Fishball 问你',

  'settings.region': 'Fishball 设置',
  'settings.statusTitle': '状态',
  'settings.statusHint': '重启会停止 Fishball 的私有实例并再次启动；它自己的主目录和设置会保留。',
  'settings.restart': '重启',
  'settings.restarting': '正在重启…',
  'settings.reload': '重新读取',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.state.disabled': '已禁用',
  'settings.state.waiting': '等待中',
  'settings.state.starting': '启动中',
  'settings.state.ready': '运行中',
  'settings.state.stopping': '停止中',
  'settings.state.stopped': '已停止',
  'settings.state.failed': '失败',
  'settings.state.connector-missing': '缺少连接器',
  'settings.modelTitle': '模型',
  'settings.modelHint': 'Fishball 的默认模型和推理强度，来自它自己的模型目录。更改会在它的下一次请求生效，不会改变你其他会话使用的模型。',
  'settings.modelSyncHint': 'DSH 中的新模型请在 DSH 的插件页面 → Fishball 实例 → Fishball 的模型 中添加。',
  'settings.provider': '提供商',
  'settings.model': '模型',
  'settings.effort': '推理强度',
  'settings.effortDefault': '模型默认',
  'settings.modelUnknown': '已保存的模型 {model}（提供商 {provider}）不在 Fishball 当前的目录中。请选择另一个模型，或使用正在运行的模型。',
  'settings.modelCatalogEmpty': '提供商 {provider} 目前在 Fishball 的目录中没有列出任何模型。它可能需要凭据，或尚未配置模型。',
  'settings.modelProviderUnknown': '已保存的提供商 {provider} 在 Fishball 中不可用。请选择另一个提供商。',
  'settings.modelRunning': 'Fishball 当前正在运行 {provider} / {model}。',
  'settings.useRunningModel': '使用正在运行的模型',
  'settings.modelSaved': '已保存。Fishball 会在下一次请求使用它。',
  'settings.modelSavedNotApplied': '已保存为默认值。当前聊天未能立即采用；它的下一次请求可能仍使用此前的模型。',
  'settings.pluginsTitle': '插件',
  'settings.pluginsHint': '安装在 Fishball 自己的配置中；此处不会改变 DSH 的插件。',
  'settings.installed': '已安装',
  'settings.noPlugins': 'Fishball 中尚未安装插件。',
  'settings.enabled': '开启',
  'settings.core': '核心',
  'settings.pluginToggle': '在 Fishball 中使用 {name}',
  'settings.remove': '卸载',
  'settings.removeLabel': '从 Fishball 卸载 {name}',
  'settings.installTitle': '安装插件',
  'settings.installHint': '包名（可带版本）、Git 地址、压缩包 URL 或绝对文件夹路径。',
  'settings.installSpec': '包规格',
  'settings.install': '安装',
  'settings.installLabel': '为 Fishball 安装 {name}',
  'settings.recommendedTitle': '推荐插件',
  'settings.recommendedHint': '为 Fishball 选定的固定列表。安装只改 Fishball 的配置。',
  'settings.category.context': '上下文管理',
  'settings.category.memory': '记忆',
  'settings.category.channel': '渠道',
  'settings.category.pet': '宠物',
  'settings.pluginDone': '已完成。',
  'settings.settingsTitle': '插件设置',
  'settings.ns.session-log-deepseek': 'DeepSeek 会话日志上传',
  'settings.ns.agent-default-model': '默认模型',
  'settings.ns.llm-pi-ai': 'pi-ai 模型适配',
  'settings.ns.ui-settings-general': '常规设置',
  'settings.ns.ui-theme': '主题',
  'settings.ns.fishball-connector': 'Fishball 连接器',
  'settings.field.enabled': '启用',
  'settings.field.provider': '提供商',
  'settings.field.model': '模型',
  'settings.field.reasoningEffort': '推理强度',
  'settings.field.providers': '提供商',
  'settings.field.maxBytes': '最大字节数',
  'settings.settingsHint': 'Fishball 自己的插件公开的设置。每次保存都会发送本页读取的修订号，因此在别处发生的更改会被拒绝，不会被覆盖。',
  'settings.settingsReadOnly': 'Fishball 以只读方式存储设置，因此不能在这里修改。',
  'settings.settingsNone': 'Fishball 中没有插件公开设置。',
  'settings.settingsSaved': '已保存。',
  'settings.stale': '自本页读取以来这里已在别处更改，因此没有写入任何内容。已重新读取当前值；请检查后再次保存。',
  'settings.settingsInvalid': '有值不符合其字段。',
  'settings.secretSet': '已设置；输入新值可替换。',
  'settings.secretUnset': '未设置。',
  'settings.listHint': '每行一项。',
  'settings.readOnlyField': '仅显示，不能在这里修改。',
  'settings.refused': '已拒绝：{code}',

  'unavailable.title': 'Fishball 不可用',
  'unavailable.heading': 'Fishball 当前不可用',
  'unavailable.state': '状态：',
  'unavailable.code': '代码：',
  'unavailable.retryHint': '重试会重新启动隔离的 Fishball。',
  'unavailable.retry': '重试',
})

/** The two dictionaries by language; their key sets are equal (§18.2 I9 R3). */
export const DICTIONARIES = Object.freeze({ [LANG.en]: EN, [LANG.zh]: ZH })

/**
 * The page's language from a URL search string: the first `lang` value when it names a
 * dictionary exactly, otherwise English (no `lang`, an empty one, `ZH`, `zh-CN`, …).
 *
 * @param {unknown} search - a `location.search` or URL search string; anything else is no `lang`.
 * @returns {'en'|'zh'}
 */
export function languageOf(search) {
  const value = new URLSearchParams(typeof search === 'string' ? search : '').get(LANG.parameter)
  return value !== null && Object.hasOwn(DICTIONARIES, value) ? value : LANG.en
}

/**
 * The words of one language.
 *
 * `t(key, params)` returns the value with each `{name}` replaced by `params[name]`, or undefined
 * for a key the dictionary does not have: keys built from data (a record's kind, a status) can
 * name a value this version does not know, and each caller chooses its own fallback for that.
 * `failure(key, code)` is the page's own failure words, followed by the refusal code when there
 * is one; the page never shows a child's English message (I9, the user's answer of 2026-11-07).
 *
 * @param {'en'|'zh'} lang - a language from languageOf; an unknown one is English.
 * @returns {{ lang: string, locale: string, t: (key: string, params?: object) => string|undefined,
 *   failure: (key: string, code?: unknown) => string }}
 */
export function createI18n(lang) {
  const language = Object.hasOwn(DICTIONARIES, lang) ? lang : LANG.en
  const words = DICTIONARIES[language]
  function t(key, params) {
    if (!Object.hasOwn(words, key)) return undefined
    const template = words[key]
    if (params === undefined) return template
    return template.replace(PLACEHOLDER, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match))
  }
  function failure(key, code) {
    return typeof code === 'string' && code !== '' ? t(WITH_CODE, { message: t(key), code }) : t(key)
  }
  return Object.freeze({ lang: language, locale: LOCALE[language], t, failure })
}

/** The words for a URL search string: languageOf, then createI18n. */
export function i18nOf(search) { return createI18n(languageOf(search)) }

/** English, for a view mounted without the page's words (the shell always passes them). */
export const DEFAULT_I18N = createI18n(LANG.en)

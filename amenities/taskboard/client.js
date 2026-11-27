/**
 * fishball-taskboard's browser half (docs/plugins/fishball-taskboard.md §4): the "Task board" tab of
 * DSH's right sidebar (a page type of `sidebarRightTabs`, opened by kind), a checklist entry in the
 * conversation header and one on the sidebar guide. The tab follows the board over the row's SSE
 * route and saves the user's edit with one POST of the whole wanted board; the row then tells
 * Fishball what changed. A draft is never mixed with Fishball's live changes: a save against an
 * older revision is refused `stale` and the draft stays, so nothing typed is lost.
 */
window.__ModuleLoader__.load({
  id: 'fishball-taskboard',
  factory(require) {
    const React = require('react')
    const {
      Button, Input, Tooltip, IconChecklistOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, IconEditOutlineRegular,
      IconChevronDownOutlineRegular, IconCheckCircleFillRegular, IconCloseCircleFillRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /** The row's constants as this chunk needs them (restated: a browser chunk imports no module). */
    const BOARD = Object.freeze({
      name: 'fishball-taskboard',
      locale: 'fishball-taskboard',
      kind: 'fishball-taskboard',
      route: Object.freeze({ board: 'api/fishball-taskboard/board', events: 'api/fishball-taskboard/events' }),
      /**
       * Core's page stream (fishball-shared `SEAM_PAGE_STREAM`, restated: a chunk imports no module):
       * the browser service fishball-ui provides, and the board's topic on it (the row's
       * `HOST.pageTopic`).
       */
      pageStream: Object.freeze({ client: 'fishballPageStream', topic: 'fishball-taskboard' }),
      health: Object.freeze({ live: 'live', closed: 'closed' }),
      statuses: Object.freeze(['todo', 'in_progress', 'blocked', 'done', 'dropped']),
      open: Object.freeze(['todo', 'in_progress', 'blocked']),
      done: 'done',
      /** What the overall bar leaves out of its total: a dropped task is neither done nor still to do. */
      dropped: 'dropped',
      progress: Object.freeze({ min: 0, max: 100 }),
      percent: 100,
      percentSign: '%',
      classSeparator: ' ',
      id: Object.freeze({ task: 't_', memo: 'm_' }),
      code: Object.freeze({ stale: 'stale', invalid: 'invalid-input', limit: 'limit-reached' }),
      http: Object.freeze({ ok: 200, conflict: 409 }),
      /** A save error's field path names a draft item by its array index (`tasks[3].title`, routes §4). */
      itemField: /^(tasks|memos)\[(\d+)\]/,
      header: Object.freeze({ slot: 'conversation.session.header.actions', id: 'fishball-taskboard', order: 92 }),
      guide: Object.freeze({ id: 'board', order: 60 }),
      tooltip: Object.freeze({ side: 'bottom', align: 'end', portal: true }),
      button: Object.freeze({ type: 'button', size: 'sm', variant: 'ghost' }),
      /** The view's own disclosure controls are native buttons (see `disclosure`), typed as BOARD.button.type. */
      nativeButton: 'button',
      icon: 16,
      smallIcon: 14,
      indentPx: 16,
      /** A note longer than this many code points, or with a line break, is clamped behind "Show more". */
      note: Object.freeze({ clampChars: 120, lineBreak: '\n' }),
      styleId: 'fishball-taskboard-style',
      /**
       * The accent: Fishball's magenta (fishball-ui's brand `accent.fishball.color`), or DSH's own
       * accent while the Fishball page wears the DeepSeek brand (fishball-page's `brand.attribute` on
       * <html>, restated: a chunk imports no module). Only fills and marks use it, never small text:
       * #EC0A6E is 4.36:1 on white, under the 4.5:1 text minimum.
       */
      accent: Object.freeze({ fishball: '#EC0A6E', brandAttribute: 'data-fishball-page-brand', deepseek: 'deepseek', business: '--dsw-alias-state-business-primary' }),
      /** The custom properties the sheet sets: the accent and bar fill on the root; a status's tone (and blocked's fill) where data-status is. */
      cssVar: Object.freeze({ accent: '--fb-tb-accent', tone: '--fb-tb-tone', fill: '--fb-tb-fill' }),
      /** The DSH tokens the status colours come from. */
      token: Object.freeze({
        secondary: '--dsw-alias-label-secondary', tertiary: '--dsw-alias-label-tertiary',
        warn: '--dsw-alias-state-warn-primary', success: '--dsw-alias-state-success-primary',
      }),
      /** View-only disclosure keys (the user, 2026-11-22: never saved, reset when the tab remounts); each names a state flipped from its default. */
      flip: Object.freeze({ subtasks: 'subtasks:', details: 'details:', note: 'note:', completed: 'completed' }),
      /** color-mix shares of the tone or accent, by use. */
      mix: Object.freeze({ chip: '14%', summary: '4%', memo: '5%', glowBorder: '55%', glowRing: '14%', doneFill: '6%', error: '8%' }),
      /** The public hooks of the tab's markup (what tests and other parts may read). */
      hook: Object.freeze({
        root: 'data-fishball-taskboard', task: 'data-fishball-task', status: 'data-status', condensed: 'data-condensed', chip: 'data-fishball-status',
        title: 'data-fishball-title', summary: 'data-fishball-taskboard-summary', count: 'data-fishball-count', overall: 'data-fishball-overall',
        completed: 'data-fishball-completed', note: 'data-fishball-note', details: 'data-fishball-task-details', memo: 'data-fishball-memo', empty: 'data-fishball-empty',
      }),
      mode: Object.freeze({ view: 'view', edit: 'edit' }),
      css: Object.freeze({
        root: 'fb-tb', bar: 'fb-tb-bar', heading: 'fb-tb-heading', list: 'fb-tb-list', row: 'fb-tb-row', head: 'fb-tb-head', subtasks: 'fb-tb-subtasks',
        card: 'fb-tb-card', title: 'fb-tb-title', memoText: 'fb-tb-memo-text', meta: 'fb-tb-meta', note: 'fb-tb-note', noteBox: 'fb-tb-note-box', clamp: 'fb-tb-clamp', link: 'fb-tb-link', meter: 'fb-tb-meter', fill: 'fb-tb-fill', percent: 'fb-tb-percent',
        chip: 'fb-tb-chip', summary: 'fb-tb-summary', counts: 'fb-tb-counts', count: 'fb-tb-count', overall: 'fb-tb-overall',
        toggle: 'fb-tb-toggle', chevron: 'fb-tb-chevron', condensed: 'fb-tb-condensed', line: 'fb-tb-line', mark: 'fb-tb-mark', details: 'fb-tb-details',
        group: 'fb-tb-group', groupToggle: 'fb-tb-group-toggle', memo: 'fb-tb-memo', section: 'fb-tb-section',
        notice: 'fb-tb-notice', error: 'fb-tb-error', field: 'fb-tb-field', area: 'fb-tb-area', number: 'fb-tb-number', empty: 'fb-tb-empty', select: 'fb-tb-select', invalid: 'fb-tb-invalid',
      }),
    })

    const AUTO = Object.freeze({
      route: Object.freeze({ read: 'api/fishball-taskboard/auto', settings: 'api/fishball-taskboard/auto/settings', undo: 'api/fishball-taskboard/auto/undo', archive: 'api/fishball-taskboard/auto/archive-notice' }),
      topic: 'fishball-taskboard-auto', event: 'auto', remoteSession: 'remote.session',
      screen: Object.freeze({ settings: 'autoSettings', history: 'autoHistory', batch: 'autoBatch', review: 'autoReviews', diagnostics: 'autoDiagnostics' }),
      state: Object.freeze({ loading: 'loading', ready: 'ready', failed: 'failed' }),
      field: Object.freeze({ status: 'autoStatus', progress: 'autoProgress', note: 'taskNote', noteAppend: 'autoNoteAppend' }),
      notice: Object.freeze({ unknown: 'unknown' }),
      reason: Object.freeze({ off: 'off', storageUnavailable: 'storage-unavailable' }),
      pending: 'pending', owner: 'owner', modelUnset: '', arrow: ' → ', pathSeparator: ' › ', summarySeparator: ' · ',
      limit: Object.freeze({ concurrency: 1, callsPerHour: 6, timeoutSeconds: 30, inputTokens: 8192, outputTokens: 1024, tasks: 20 }),
      hook: Object.freeze({
        tools: 'data-fishball-auto-tools', panel: 'data-fishball-auto-panel', model: 'data-fishball-auto-model',
        update: 'data-fishball-auto-update', review: 'data-fishball-auto-review', undo: 'data-fishball-auto-undo',
      }),
      css: Object.freeze({ label: 'fb-tb-auto-label', panel: 'fb-tb-auto-panel', tag: 'fb-tb-auto-tag', diff: 'fb-tb-auto-diff', kv: 'fb-tb-auto-kv' }),
    })

    const en = {
      title: 'Task board',
      open: 'Open task board',
      guideDescription: "Fishball's tasks and memos; you can edit them.",
      tasks: 'Tasks', memos: 'Memos',
      unfinished: '{n} unfinished',
      empty: 'Nothing yet.',
      completed: 'Completed ({n})',
      overall: '{done} of {total} done', overallLabel: 'Overall progress',
      collapseSubtasks: 'Collapse subtasks', expandSubtasks: 'Expand subtasks',
      showMore: 'Show more', showLess: 'Show less',
      edit: 'Edit', save: 'Save', cancel: 'Cancel', reload: 'Reload',
      addTask: 'Add task', addSubtask: 'Add subtask', deleteTask: 'Delete task and its subtasks', addMemo: 'Add memo', deleteMemo: 'Delete memo',
      taskTitle: 'Title', taskNote: 'Note', taskStatus: 'Status', taskProgress: 'Progress (%)', memoText: 'Memo',
      'status.todo': 'To do', 'status.in_progress': 'In progress', 'status.blocked': 'Blocked', 'status.done': 'Done', 'status.dropped': 'Dropped',
      loading: 'Loading…',
      lost: 'The board cannot be reached right now; retrying.',
      changedMeanwhile: 'The board changed while you were editing (Fishball or another window). Reload to see it (your draft is dropped).',
      closed: 'The board cannot be reached. Reopen this tab to try again.',
      stale: 'Not saved: the board changed meanwhile. Your draft is kept; Reload to start again from the current board.',
      invalid: 'Not saved: {field} has a value that is not valid (marked below).',
      untitled: 'an untitled item',
      limit: 'Not saved: the board would be over its limit ({field}).',
      failed: 'Not saved: the board could not be written. Try again.',
      saved: 'Saved; Fishball was told what changed.',
      savedUntold: 'Saved, but Fishball could not be told right now.',
      unchanged: 'Nothing changed.',
      autoSettings: 'Auto-update settings', autoHistory: 'Update history', autoBatch: 'Batch details',
      autoReviews: 'Completion reviews', autoDiagnostics: 'Diagnostics', autoBack: 'Back to task board',
      autoReadFailed: 'Could not load auto-update information. You can still edit the board.',
      autoDisabled: 'Off — no calls, automatic writes, or notifications. You and Fishball can still edit the board.',
      autoOff: 'Off', autoEnabled: 'Enabled', autoPaused: 'Paused — {reason}', autoUnknown: 'Availability could not be verified.',
      'autoReason.host-unavailable': 'this host cannot verify source turns or safely call an update model', 'autoReason.model-unavailable': 'the selected model is unavailable',
      'autoReason.storage-unavailable': 'writes are paused because storage could not be confirmed; restart Fishball to check the saved state',
      'autoReason.capacity': 'audit storage is at capacity', 'autoReason.off': 'no model selected',
      autoModel: 'Update model', autoNoModel: 'No model (off)', autoTurnOff: 'Turn off auto-update',
      autoModelLoading: 'Loading the local DSH model catalog…', autoModelFailed: 'Could not read the model catalog. Reopen settings to retry.',
      autoNoChoices: 'No models in this DSH are eligible for task board auto-update.', autoStoredRoute: 'Saved route: {route}',
      autoSettingsModelFailed: 'That model is no longer available. Choose another model or leave auto-update off.',
      autoSettingsFailed: 'Could not save the setting. The last confirmed choice is shown.',
      autoSaved: 'Auto-update setting saved.', autoSaving: 'Saving…',
      autoDataRoute: 'Selected route: {route}', autoDataBefore: 'Before selecting a model',
      autoData: 'The selected provider receives the verified final assistant reply for this turn and the entire task tree, including unrelated and closed tasks: task IDs, parent IDs, titles, statuses, progress, and notes. Memos, conversation history, tool results, attachments, permissions, and credentials are not included. Replies and notes can themselves contain sensitive information. A model in your local DSH catalog may run with an external provider.',
      autoModelPolicy: 'This setting changes only task board auto-update. It never falls back to another model. Turning it off clears the model; turning it off or switching models invalidates in-flight results but cannot recall a request or refund usage.',
      autoRules: 'Write rules (read-only)',
      autoRuleFields: 'Updates only existing open tasks: status, explicit non-decreasing progress below 100%, and evidence-based note additions. No new tasks, title or hierarchy changes, or memo edits.',
      autoRuleReview: 'Completion or 100% suggestions await Fishball review. The model cannot use tools.',
      autoRuleConflict: 'If the board changes before commit, the whole batch is skipped. Only actual task changes trigger a Fishball notification.',
      autoBudget: 'Call budget',
      autoBudgetText: '{tasks} total tasks at most (including closed tasks); {concurrency} concurrent request; up to {callsPerHour} calls per rolling hour; {timeoutSeconds}-second timeout; at most {inputTokens} input and {outputTokens} output tokens; no automatic retry. If the full input does not fit, the turn is skipped.',
      autoUpdated: 'Automatically updated', autoUpdatedCount: '{n} tasks updated', autoUpdatedOne: '1 task updated',
      autoPending: 'Awaiting Fishball review', autoPendingCount: '{n} pending review', autoNotDone: 'Not marked complete by auto-update',
      autoNoteAppend: 'Note appended', autoStatus: 'Status', autoProgress: 'Progress', autoBatchLabel: 'Batch {id}',
      autoBatchSummary: 'v{revision} · {n} task changes', autoBatchOne: 'v{revision} · 1 task change', autoRetention: 'Completed audit records are retained for up to {days} days. Without a retained batch, undo is unavailable.',
      autoNoBatches: 'No retained update batches.', autoRecordMissing: 'This record is no longer available.',
      autoParentId: 'Direct parent ID', autoCommittedProgress: 'Task progress at commit', autoSourceSession: 'Source session', autoSourceTarget: 'Source target', autoSourceTurn: 'Source turn', autoRevision: 'Board version',
      autoTime: 'Recorded at', autoNotification: 'Fishball notification', autoNotifyQuiet: 'This feature adds no chat copy or desktop push.',
      'autoNotice.none': 'Not sent — no task changes', 'autoNotice.pending': 'Pending delivery', 'autoNotice.claimed': 'Delivery started; not confirmed',
      'autoNotice.accepted': 'Accepted into the Fishball queue (not read)', 'autoNotice.failed': 'Not delivered — board changes are still saved',
      'autoNotice.unknown': 'Delivery result unknown — board changes are still saved',
      autoParent: 'Direct parent: {title} · {progress}', autoNoParent: 'Top-level task — no parent', autoEvidence: 'Evidence from the turn',
      autoTaskId: 'Task ID', autoBatchActions: 'Batch actions', autoVersion: 'v{revision}', autoOtherDiagnostic: 'Other reason', autoDiagnosticCount: '{label}: {count}',
      autoBefore: 'Before', autoAfter: 'After', autoRestored: 'Restored value', autoEmptyValue: '(empty)',
      autoReviewWaitingBoard: 'Current values are unavailable until the board and audit have the same revision.',
      autoNoReviews: 'No retained completion reviews.', autoMissingTask: 'This task is no longer on the board.',
      autoReviewReadOnly: 'Read-only. Fishball must verify the evidence before deciding. Opening this record does not complete the task or wake Fishball.',
      autoReviewCurrent: 'Current task values', autoReviewSuggested: 'Suggested values (not an automatic write)',
      'autoReviewStatus.pending': 'Awaiting Fishball review', 'autoReviewStatus.confirmed': 'Confirmed', 'autoReviewStatus.rejected': 'Rejected',
      'autoReviewStatus.voided': 'Voided',
      autoUndo: 'Undo this batch', autoUndoConfirm: 'Confirm batch undo',
      autoUndoExplain: 'Review the {n} affected tasks above. Undo restores only the listed fields in a new board revision and voids any still-pending reviews in this batch. It does not retract a notification.',
      autoUndoStale: 'Undo unavailable: the board or batch has changed. Review the differences and edit manually.',
      autoUndoBlocked: 'This batch can no longer be undone.', autoUndoFailed: 'Could not confirm that the batch was undone. Check the update history before trying again.',
      autoUndone: 'Batch undone at v{revision}. The original batch remains in history.', autoUndoTime: 'Undone at', autoUndoActor: 'Undone by', autoOwner: 'Board owner',
      autoAlreadyUndone: 'This batch was already undone.',
      autoArchivedUnknown: 'Archived — delivery result is still unknown', autoArchivedAt: 'Archived at', autoArchive: 'Archive unknown delivery',
      autoArchiveExplain: 'Archiving leaves the delivery result unknown. It does not send another notification or change the board.',
      autoArchiveFailed: 'Could not confirm delivery was archived. Check the batch details before trying again.',
      autoBatchChanged: 'The batch changed. Check its current details before trying again.',
      autoRemovedAppend: 'Removed the note fragment added by this batch',
      autoNoDiagnostics: 'No skipped or failed attempts recorded.', autoSentLastHour: 'Calls in the past hour', autoLastResult: 'Latest diagnostic',
      autoDiagnosticsHint: 'These reasons did not cause an automatic task write. No-match and unchanged results are normal. Nothing here reruns an old turn.',
      'autoDiagnostic.row-budget': 'Too many tasks', 'autoDiagnostic.rate-budget': 'Hourly call budget reached', 'autoDiagnostic.busy': 'Another analysis is running',
      'autoDiagnostic.input-budget': 'Input did not fit', 'autoDiagnostic.stale': 'Board changed; whole batch skipped', 'autoDiagnostic.no-change': 'No match or no changes',
      'autoDiagnostic.invalid-output': 'Invalid model output', 'autoDiagnostic.timeout': 'Request timed out', 'autoDiagnostic.rate-limited': 'Provider rate-limited the request',
      'autoDiagnostic.model-failed': 'Model request failed', 'autoDiagnostic.invalid-source': 'Source turn could not be verified',
      'autoDiagnostic.duplicate': 'Duplicate turn', 'autoDiagnostic.off': 'No model selected', 'autoDiagnostic.host-unavailable': 'Source verification unavailable',
      'autoDiagnostic.model-unavailable': 'Selected model unavailable', 'autoDiagnostic.capacity': 'Audit storage at capacity',
    }
    const zh = {
      title: '任务板',
      open: '打开任务板',
      guideDescription: 'Fishball 的任务和备忘，可由你编辑。',
      tasks: '任务', memos: '备忘',
      unfinished: '{n} 项未完成',
      empty: '还没有内容。',
      completed: '已结束（{n}）',
      overall: '已完成 {done}/{total}', overallLabel: '总体进度',
      collapseSubtasks: '收起子任务', expandSubtasks: '展开子任务',
      showMore: '展开', showLess: '收起',
      edit: '编辑', save: '保存', cancel: '取消', reload: '重新载入',
      addTask: '添加任务', addSubtask: '添加子任务', deleteTask: '删除任务及其子任务', addMemo: '添加备忘', deleteMemo: '删除备忘',
      taskTitle: '标题', taskNote: '备注', taskStatus: '状态', taskProgress: '进度（%）', memoText: '备忘',
      'status.todo': '待办', 'status.in_progress': '进行中', 'status.blocked': '受阻', 'status.done': '已完成', 'status.dropped': '已放弃',
      loading: '正在载入…',
      lost: '暂时无法连接任务板，正在重试。',
      changedMeanwhile: '你编辑期间任务板已被修改（Fishball 或另一个窗口）。可重新载入查看（会丢弃草稿）。',
      closed: '无法连接任务板。请重新打开此标签页重试。',
      stale: '未保存：任务板期间已被修改。草稿已保留；重新载入可从当前任务板重新开始。',
      invalid: '未保存：{field} 有无效的值（已在下方标出）。',
      untitled: '一个无标题的条目',
      limit: '未保存：任务板会超出上限（{field}）。',
      failed: '未保存：无法写入任务板，请重试。',
      saved: '已保存，并已告知 Fishball 改了什么。',
      savedUntold: '已保存，但暂时无法告知 Fishball。',
      unchanged: '没有改动。',
      autoSettings: '自动更新设置', autoHistory: '更新记录', autoBatch: '批次详情',
      autoReviews: '完成待复核', autoDiagnostics: '未写入诊断', autoBack: '返回任务板',
      autoReadFailed: '无法读取自动更新信息，仍可手动编辑任务板。',
      autoDisabled: '已关闭，不会调用模型、自动写入或通知。你和 Fishball 仍可照常编辑任务板。',
      autoOff: '已关闭', autoEnabled: '已启用', autoPaused: '已暂停：{reason}', autoUnknown: '无法确认当前是否可用。',
      'autoReason.host-unavailable': '宿主无法验证本轮来源或安全地调用更新模型', 'autoReason.model-unavailable': '所选模型不可用',
      'autoReason.storage-unavailable': '写入结果无法确认，已暂停写入；请重启 Fishball 核对已保存状态',
      'autoReason.capacity': '审计存储已达上限', 'autoReason.off': '未选择模型',
      autoModel: '更新模型', autoNoModel: '不选择模型（关闭）', autoTurnOff: '关闭自动更新',
      autoModelLoading: '正在载入本机 DSH 模型目录…', autoModelFailed: '无法读取模型目录。请重新打开设置重试。',
      autoNoChoices: '此 DSH 中没有符合任务板自动更新条件的模型。', autoStoredRoute: '已保存的路由：{route}',
      autoSettingsModelFailed: '此模型已不可用。请选择其他模型，或保持关闭。',
      autoSettingsFailed: '无法保存设置。当前显示上次确认的选择。',
      autoSaved: '自动更新设置已保存。', autoSaving: '正在保存…',
      autoDataRoute: '所选路由：{route}', autoDataBefore: '启用前确认',
      autoData: '所选供应商会收到经验证的本轮助手最终回复和整棵任务树，包括无关任务和已关闭任务：任务 ID、直属父任务 ID、标题、状态、进度和备注。不会发送备忘、历史对话、工具结果、附件、权限或凭据。回复和备注本身可能含敏感信息。本机 DSH 目录中的模型可能由外部供应商运行。',
      autoModelPolicy: '此项只影响任务板自动更新，不会回退到其他模型。关闭会清空模型；关闭或换模型会让在途结果作废，但不能撤回已发出的请求或退回用量。',
      autoRules: '写入规则（只读）',
      autoRuleFields: '只更新已有且未关闭的任务：状态、有明确依据的非倒退进度（低于 100%），或追加有证据的备注。不创建任务、不改标题和层级、不写备忘。',
      autoRuleReview: '完成或 100% 的建议留待 Fishball 复核。模型没有工具权限。',
      autoRuleConflict: '提交前任务板已变化则整批跳过。只有任务实际变化才通知 Fishball。',
      autoBudget: '调用预算',
      autoBudgetText: '整棵树最多 {tasks} 项（含已关闭）；最多 {concurrency} 个并发，滚动一小时最多 {callsPerHour} 次；单次限时 {timeoutSeconds} 秒；最多 {inputTokens} 输入、{outputTokens} 输出 token；不自动重试。完整输入放不下时整次跳过。',
      autoUpdated: '自动更新', autoUpdatedCount: '{n} 项已更新', autoUpdatedOne: '1 项已更新',
      autoPending: '待 Fishball 复核', autoPendingCount: '{n} 项待复核', autoNotDone: '未被自动标为完成',
      autoNoteAppend: '追加备注', autoStatus: '状态', autoProgress: '进度', autoBatchLabel: '批次 {id}',
      autoBatchSummary: 'v{revision} · {n} 项任务变更', autoBatchOne: 'v{revision} · 1 项任务变更', autoRetention: '已结束的审计记录最多保留 {days} 天。没有保留的批次记录时无法撤销。',
      autoNoBatches: '没有保留的更新批次。', autoRecordMissing: '此记录已不可用。',
      autoParentId: '直属父任务 ID', autoCommittedProgress: '提交时的任务进度', autoSourceSession: '来源会话', autoSourceTarget: '来源目标', autoSourceTurn: '来源回合', autoRevision: '任务板版本',
      autoTime: '记录时间', autoNotification: 'Fishball 通知', autoNotifyQuiet: '此功能不另发聊天副本或桌面推送。',
      'autoNotice.none': '未发送：无任务改动', 'autoNotice.pending': '等待投递', 'autoNotice.claimed': '已发起投递，结果未确认',
      'autoNotice.accepted': '已入 Fishball 队列（非已读）', 'autoNotice.failed': '未送达：任务板变更已保存',
      'autoNotice.unknown': '投递结果未知：任务板变更已保存',
      autoParent: '直属父任务：{title} · {progress}', autoNoParent: '顶层任务，无父任务', autoEvidence: '本轮依据',
      autoTaskId: '任务 ID', autoBatchActions: '批次操作', autoVersion: 'v{revision}', autoOtherDiagnostic: '其他原因', autoDiagnosticCount: '{label}：{count}',
      autoBefore: '变更前', autoAfter: '变更后', autoRestored: '已恢复的值', autoEmptyValue: '（空）',
      autoReviewWaitingBoard: '任务板和审计记录的版本一致后，才能显示当前值。',
      autoNoReviews: '没有保留的复核记录。', autoMissingTask: '此任务已不在任务板上。',
      autoReviewReadOnly: '此处只读。Fishball 需核实依据后再决定；查看不会结案，也不会唤醒 Fishball。',
      autoReviewCurrent: '任务当前值', autoReviewSuggested: '建议值（不会自动写入）',
      'autoReviewStatus.pending': '待 Fishball 复核', 'autoReviewStatus.confirmed': '已确认', 'autoReviewStatus.rejected': '已拒绝',
      'autoReviewStatus.voided': '已作废',
      autoUndo: '撤销此批次', autoUndoConfirm: '确认整批撤销',
      autoUndoExplain: '请核对上方 {n} 项受影响任务。撤销只恢复列出的字段，生成新的任务板版本，并作废同批仍待复核的记录，不会收回通知。',
      autoUndoStale: '无法撤销：任务板或批次已变化。请核对差异后手动编辑。',
      autoUndoBlocked: '此批次已不能撤销。', autoUndoFailed: '无法确认是否已撤销。请先查看更新记录，再决定是否重试。',
      autoUndone: '已撤销，任务板版本为 v{revision}。原批次仍保留在更新记录中。', autoUndoTime: '撤销时间', autoUndoActor: '操作人', autoOwner: '任务板所有者',
      autoAlreadyUndone: '此批次已撤销。',
      autoArchivedUnknown: '已归档，投递结果仍未知', autoArchivedAt: '归档时间', autoArchive: '归档未知投递',
      autoArchiveExplain: '归档后投递结果仍为未知，不会重发通知或更改任务板。',
      autoArchiveFailed: '无法确认是否已归档。请先查看批次详情，再决定是否重试。',
      autoBatchChanged: '批次已变化。请核对当前详情后再试。',
      autoRemovedAppend: '已移除此批追加的备注片段',
      autoNoDiagnostics: '未记录跳过或失败的尝试。', autoSentLastHour: '过去一小时的调用', autoLastResult: '最近一条诊断',
      autoDiagnosticsHint: '这些结果未引起自动写入。没有匹配或没有改动是正常情况。这里不会重跑旧回合。',
      'autoDiagnostic.row-budget': '任务数量超限', 'autoDiagnostic.rate-budget': '每小时调用预算已用完', 'autoDiagnostic.busy': '已有分析正在运行',
      'autoDiagnostic.input-budget': '完整输入超限', 'autoDiagnostic.stale': '任务板已变，整批跳过', 'autoDiagnostic.no-change': '无匹配或无改动',
      'autoDiagnostic.invalid-output': '模型返回无效', 'autoDiagnostic.timeout': '请求超时', 'autoDiagnostic.rate-limited': '供应商限流',
      'autoDiagnostic.model-failed': '模型调用失败', 'autoDiagnostic.invalid-source': '无法验证本轮来源',
      'autoDiagnostic.duplicate': '重复回合', 'autoDiagnostic.off': '未选择模型', 'autoDiagnostic.host-unavailable': '无法验证来源',
      'autoDiagnostic.model-unavailable': '所选模型不可用', 'autoDiagnostic.capacity': '审计存储已达上限',
    }

    const S = BOARD.css
    const mix = (color, share, base = 'transparent') => `color-mix(in srgb,${color} ${share},${base})`
    const layer = 'var(--dsw-alias-bg-layer-1)'
    /** A custom property read as a CSS value: each built `var(...)` comes from here. */
    const cssVar = (name) => `var(${name})`
    const accentVar = cssVar(BOARD.cssVar.accent)
    const toneVar = cssVar(BOARD.cssVar.tone)
    const warnVar = cssVar(BOARD.token.warn)
    /** Each status's colour, for its chip's dot and tint and a condensed row's mark. */
    const TONE = Object.freeze({
      todo: cssVar(BOARD.token.secondary), in_progress: accentVar, blocked: warnVar,
      done: cssVar(BOARD.token.success), dropped: cssVar(BOARD.token.tertiary),
    })
    /**
     * An open row's bar fill (V2) differs from the root's accent only while blocked (DSH's warning
     * colour); the root's accent is also what the overall bar uses.
     */
    const FILL = Object.freeze({ blocked: warnVar })
    // Each status sets its tone (and an open one its bar fill) where its row or count chip is, so one chip, mark and fill rule serves all five.
    const tones = BOARD.statuses.map((status) => `.${S.root} [${BOARD.hook.status}="${status}"],.${S.root} [${BOARD.hook.count}="${status}"]{${BOARD.cssVar.tone}:${TONE[status]}${FILL[status] ? ';' + BOARD.cssVar.fill + ':' + FILL[status] : ''}}`)
    const condensedOf = (status) => `.${S.condensed}[${BOARD.hook.status}="${status}"]`
    const css = [
      `.${S.root}{${BOARD.cssVar.accent}:${BOARD.accent.fishball};${BOARD.cssVar.fill}:${accentVar};display:flex;flex-direction:column;gap:12px;padding:12px;height:100%;box-sizing:border-box;overflow:auto;overflow-x:hidden;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-primary)}`,
      `[${BOARD.accent.brandAttribute}="${BOARD.accent.deepseek}"] .${S.root}{${BOARD.cssVar.accent}:${cssVar(BOARD.accent.business)}}`,
      ...tones,
      // Only the tab's own native controls: DSH's Buttons keep their own focus style.
      `${[S.toggle, S.line, S.link, S.groupToggle, S.area, S.select].map((name) => `.${name}:focus-visible`).join(',')}{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}`,
      `.${S.bar}{display:flex;align-items:center;gap:8px;flex-wrap:wrap}`,
      `.${S.heading}{margin:0;font:var(--dsw-font-s-strong-14);flex:1;min-width:0}`,
      `.${S.section}{margin-top:8px}`,
      // The summary: counts per status, then the overall bar, on a faint accent tint.
      `.${S.summary}{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:${mix(accentVar, BOARD.mix.summary, layer)}}`,
      `.${S.counts}{display:flex;flex-wrap:wrap;gap:4px}`,
      `.${S.count} strong{font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary)}`,
      `.${S.overall}{display:flex;align-items:center;gap:8px}`,
      `.${S.overall} .${S.meter}{height:6px}`,
      `.${S.list},.${S.subtasks}{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;min-width:0}`,
      `.${S.list}>li,.${S.subtasks}>li{display:flex;flex-direction:column;gap:6px;min-width:0}`,
      // A subtask list hangs off its parent on a connector line.
      `.${S.subtasks}{margin-inline-start:9px;padding-inline-start:10px;border-inline-start:1px solid var(--dsw-alias-border-l2)}`,
      `.${S.card},.${S.row}{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:${layer};min-width:0}`,
      `.${S.head}{display:flex;align-items:flex-start;gap:6px;min-width:0}`,
      `.${S.title}{flex:1;min-width:0;font:var(--dsw-font-xs-strong-13);overflow-wrap:anywhere}`,
      `.${S.chip}{flex-shrink:0;display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:var(--dsw-radius-xl);background:${mix(toneVar, BOARD.mix.chip)};font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);white-space:nowrap}`,
      `.${S.chip}::before{content:"";width:6px;height:6px;border-radius:50%;background:${toneVar}}`,
      `.${S.meta}{display:flex;align-items:center;gap:8px;min-width:0}`,
      `.${S.meter}{flex:1;min-width:24px;height:4px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-border-l2);overflow:hidden}`,
      // The fill is a <span>: without display:block it is an inline box, whose width and height are
      // ignored, so it rendered 0x0 at every progress value (the empty bar the user saw).
      `.${S.fill}{display:block;height:100%;border-radius:inherit;background:${cssVar(BOARD.cssVar.fill)}}`,
      `.${S.percent}{flex-shrink:0;min-width:4ch;text-align:end;font:var(--dsw-font-xxs-12);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}`,
      `.${S.noteBox}{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0}`,
      `.${S.note}{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      `.${S.clamp}{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}`,
      `.${S.link}{padding:0;border:0;background:none;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary);cursor:pointer}`,
      `.${S.toggle}{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-xs);background:none;color:var(--dsw-alias-label-tertiary);cursor:pointer}`,
      `.${S.toggle}:hover{background:var(--dsw-alias-interactive-bg-hover)}`,
      `.${S.chevron}{display:inline-flex;flex-shrink:0;color:var(--dsw-alias-label-tertiary);transition:transform .15s}`,
      `[aria-expanded="false"]>.${S.chevron}{transform:rotate(-90deg)}`,
      // A closed task condensed to one line (the user, 2026-11-22: "condensing, not folding"): done glows green, dropped is grey.
      // `li.` (0,1,1) only to follow the list items' gap rule; the status rules below (0,2,0) must outrank it.
      `li.${S.condensed}{gap:0;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:${layer}}`,
      `${condensedOf(BOARD.done)}{border-color:${mix(toneVar, BOARD.mix.glowBorder)};background:${mix(toneVar, BOARD.mix.doneFill, layer)};box-shadow:0 0 0 3px ${mix(toneVar, BOARD.mix.glowRing)},0 0 10px ${mix(toneVar, BOARD.mix.glowRing)}}`,
      `${condensedOf(BOARD.dropped)}{background:transparent}`,
      `${condensedOf(BOARD.dropped)}>.${S.line}>.${S.title}{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}`,
      `.${S.line}{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;min-width:0;padding:5px 10px;border:0;border-radius:inherit;background:none;font:inherit;color:inherit;text-align:start}`,
      `button.${S.line}{cursor:pointer}`,
      `.${S.line}>.${S.title}{font:var(--dsw-font-xs-13);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
      `.${S.mark}{display:inline-flex;flex-shrink:0;color:${toneVar}}`,
      `.${S.details}{display:flex;flex-direction:column;gap:6px;padding:0 10px 8px}`,
      `.${S.group}{display:flex;flex-direction:column;gap:6px}`,
      `.${S.groupToggle}{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 0;border:0;background:none;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-secondary);cursor:pointer}`,
      `.${S.memo}{background:${mix(accentVar, BOARD.mix.memo, layer)};box-shadow:inset 3px 0 0 ${accentVar}}`,
      `.${S.memoText}{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${S.notice}{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      `.${S.error}{margin:0;padding:6px 10px;border-radius:var(--dsw-radius-sm);background:${mix('var(--dsw-alias-state-error-primary)', BOARD.mix.error)};font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary)}`,
      `.${S.field}{display:flex;gap:6px;align-items:center;flex-wrap:wrap}`,
      `.${S.area}{width:100%;box-sizing:border-box;min-height:48px;resize:vertical;font:var(--dsw-font-xxs-12);color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);padding:6px 8px}`,
      `.${S.number}{width:64px}`,
      `.${S.select}{height:28px;font:inherit;color:inherit;background:${layer};border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);padding:0 6px}`,
      `.${S.invalid}{outline:1px solid var(--dsw-alias-state-error-primary);outline-offset:1px}`,
      `.${S.empty}{margin:0;padding:16px 12px;text-align:center;border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-tertiary)}`,
      `.${AUTO.css.panel}{display:flex;flex-direction:column;gap:10px;overflow-wrap:anywhere}`,
      `.${AUTO.css.panel} :is(h3,h4,p,dl,dd,blockquote){margin:0}` ,
      `.${AUTO.css.panel} ol{margin:0;padding-inline-start:20px}` ,
      `.${AUTO.css.label}{font:var(--dsw-font-xs-strong-13)}` ,
      `.${AUTO.css.tag}{background:${mix(accentVar, BOARD.mix.chip)}}` ,
      `.${AUTO.css.tag}[${AUTO.hook.review}]{background:${mix(warnVar, BOARD.mix.chip)}}` ,
      `.${AUTO.css.kv}{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:4px 8px}` ,
      `.${AUTO.css.kv} dt{color:var(--dsw-alias-label-secondary)}` ,
      `.${AUTO.css.diff}{border-inline-start:2px solid var(--dsw-alias-border-l2);padding-inline-start:8px;white-space:pre-wrap}` ,
      `.${AUTO.css.panel} .${S.select}{max-width:100%}` ,
    ].join('')

    const url = (path) => new URL(path, document.baseURI)
    const randomId = (prefix) => prefix + crypto.randomUUID()

    /**
     * The board as the row streams it: `{board, lost, closed}`, shared by every mounted tab.
     *
     * On the Fishball page the board is a topic of core's one page stream (`BOARD.pageStream`), read
     * through fishball-ui's `fishballPageStream` service: a browser holds at most 6 HTTP/1.1
     * connections per host, shared by every tab, and DSH's own calls (sending a message, uploads)
     * queue behind open streams, so an amenity adds a topic, never a connection (the user,
     * 2026-11-21). `lost` follows that stream's health. Only where the service is absent (no
     * fishball-ui or core: a standalone install) the tab opens the row's own route, where EventSource
     * retries by itself after an error and a valid frame clears `lost`; `closed`: it gave up.
     * Either way the source is held only while a tab is mounted.
     */
    function createFeed(ctx) {
      let state = { board: undefined, lost: false, closed: false, autoSignal: undefined }
      const listeners = new Set()
      let leave
      const set = (next) => { state = { ...state, ...next }; listeners.forEach((listener) => listener()) }
      // A frame that is not a board keeps the last good one (both sources), so the tab never draws a broken board.
      const isBoard = (value) => value !== null && typeof value === 'object' && Array.isArray(value.tasks) && Array.isArray(value.memos)
      // `false` refuses the frame on the page connection, so its health does not clear the tab's notice.
      const take = (board) => {
        if (!isBoard(board)) return false
        set({ board, lost: false, closed: false })
        return true
      }
      // Audit frames invalidate only the independent read. They are not board revisions or health frames.
      const invalidateAuto = () => set({ autoSignal: (state.autoSignal ?? 0) + 1 })
      /** The row's own route: the standalone fallback. */
      function ownSource() {
        const source = new EventSource(url(BOARD.route.events), { withCredentials: true })
        source.onmessage = (event) => { try { take(JSON.parse(event.data)) } catch { set({ lost: true }) } }
        source.addEventListener?.(AUTO.event, invalidateAuto)
        source.onerror = () => set({ lost: true, closed: source.readyState === EventSource.CLOSED })
        return () => source.close()
      }
      function open() {
        const shared = ctx.get(BOARD.pageStream.client)
        if (typeof shared?.subscribe !== 'function') return ownSource()
        const leaveBoard = shared.subscribe(BOARD.pageStream.topic, {
          frame: take,
          health: (word) => set({ lost: word !== BOARD.health.live, closed: word === BOARD.health.closed }),
        })
        const leaveAuto = shared.subscribe(AUTO.topic, { frame: invalidateAuto, health: () => {} })
        return () => { leaveAuto(); leaveBoard() }
      }
      return {
        get: () => state,
        subscribe(listener) {
          listeners.add(listener)
          leave ??= open()
          return () => {
            listeners.delete(listener)
            if (listeners.size > 0) return
            leave?.()
            leave = undefined
            state = { ...state, closed: false, autoSignal: undefined }
          }
        },
      }
    }

    /** Same-origin board requests; status 0 when no answer came. Never throws. */
    async function request(path, payload, signal) {
      try {
        const write = payload === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }
        const response = await fetch(url(path), { credentials: 'same-origin', cache: 'no-store', signal, ...write })
        return { status: response.status, body: await response.json().catch(() => null) }
      } catch { return { status: 0, body: null } }
    }

    const save = (draft) => request(BOARD.route.board, draft)

    function useAuto(revision, signal) {
      const [reload, setReload] = React.useState(0)
      const [loaded, setLoaded] = React.useState(undefined)
      // Older streams never announce audit. Don't probe on ordinary board frames until the
      // server advertises it (also sent after reconnect), unless the owner opens an audit panel.
      React.useEffect(() => {
        if (revision === undefined || (signal === undefined && reload === 0)) return
        const abort = new AbortController()
        void request(AUTO.route.read, undefined, abort.signal).then(({ status, body }) => {
          if (abort.signal.aborted) return
          const valid = status === BOARD.http.ok && body?.ok === true && Number.isSafeInteger(body.revision)
            && Array.isArray(body.batches) && Array.isArray(body.reviews)
          setLoaded((last) => ({ signal, reload, revision, snapshot: valid ? body : last?.snapshot, failure: !valid }))
        })
        return () => abort.abort()
      }, [revision, signal, reload])
      const refreshing = loaded?.signal !== signal || loaded?.reload !== reload || loaded?.revision !== revision
      return { snapshot: loaded?.snapshot, failure: loaded?.failure, refreshing, refresh: () => setReload((n) => n + 1) }
    }

    /**
     * The draft item a refused field names (`tasks[3].title` → the fourth draft task), so the error
     * shows its title and marks its row: rows are drawn in tree order, not the draft's array order.
     */
    function itemOf(draft, field) {
      const match = BOARD.itemField.exec(field ?? '')
      return match ? draft[match[1]][Number(match[2])] : undefined
    }

    /** The outcome line of a save, from the route's answer (§4); `itemId` marks the refused row. */
    function outcomeOf(t, { status, body }, draft) {
      if (status === BOARD.http.ok && body?.ok) return { text: !body.changed ? t('unchanged') : body.notified ? t('saved') : t('savedUntold'), done: true }
      if (body?.code === BOARD.code.stale) return { text: t('stale'), error: true }
      const item = itemOf(draft, body?.field)
      const field = item ? (item.title ?? item.text) || t('untitled') : body?.field ?? ''
      if (body?.code === BOARD.code.invalid) return { text: t('invalid', { field }), error: true, itemId: item?.id }
      if (body?.code === BOARD.code.limit) return { text: t('limit', { field }), error: true, itemId: item?.id }
      return { text: t('failed'), error: true }
    }

    /** Tasks in tree order with their depth (top level 0), following parentId from the board's order. */
    function treeOf(tasks) {
      const rows = []
      const walk = (parent, depth) => { for (const task of tasks) if (task.parentId === parent) { rows.push({ task, depth }); walk(task.id, depth + 1) } }
      walk(null, 0)
      return rows
    }
    /** `id` and every task under it. */
    function subtree(tasks, id) {
      const ids = new Set([id])
      const walk = (parent) => { for (const task of tasks) if (task.parentId === parent) { ids.add(task.id); walk(task.id) } }
      walk(id)
      return ids
    }

    const isOpen = (task) => BOARD.open.includes(task.status)
    /**
     * The view's reading of the tasks: each task's children in board order, and whether a task's
     * whole subtree is closed. Only such a task condenses (the user, 2026-11-22): a closed parent with
     * an open subtask stays a full row, so the open work under it is never hidden.
     */
    function shapeOf(tasks) {
      const children = new Map()
      for (const task of tasks) children.set(task.parentId, [...(children.get(task.parentId) ?? []), task])
      const kids = (id) => children.get(id) ?? []
      const settled = new Map()
      const allClosed = (task) => {
        if (!settled.has(task.id)) settled.set(task.id, !isOpen(task) && kids(task.id).every(allClosed))
        return settled.get(task.id)
      }
      return { kids, allClosed }
    }

    const statusText = (t, status) => t('status.' + status)
    const iconButton = (label, Icon, onClick) => h(Tooltip, { ...BOARD.tooltip, label }, h(Button, { ...BOARD.button, 'aria-label': label, onClick }, h(Icon, { size: BOARD.icon })))
    const chevron = () => h('span', { className: S.chevron, 'aria-hidden': true }, h(IconChevronDownOutlineRegular, { size: BOARD.smallIcon }))
    /** A native disclosure button: `open` is its aria-expanded; the chevron turns with it (sheet). */
    const disclosure = ({ className, open, onClick, label }, ...children) =>
      h(BOARD.nativeButton, { type: BOARD.button.type, className, 'aria-expanded': open, 'aria-label': label, onClick }, ...children)
    const percentOf = (value, max) => (max > 0 ? (value / max) * BOARD.percent : BOARD.progress.min)
    /** Class names joined, the empty ones left out. */
    const classes = (...names) => names.filter(Boolean).join(BOARD.classSeparator)
    const percentText = (value) => value + BOARD.percentSign
    const Chip = ({ t, status }) => h('span', { className: S.chip, [BOARD.hook.chip]: status }, statusText(t, status))

    /** A slim bar; its fill is the first child, `value` of `max` wide. */
    const Meter = ({ value, max, label, extra }) => h('span', {
      className: S.meter, role: 'progressbar', 'aria-label': label, 'aria-valuemin': BOARD.progress.min, 'aria-valuemax': max, 'aria-valuenow': value, ...extra,
    }, h('span', { className: S.fill, style: { width: percentText(percentOf(value, max)) } }))

    const codePoints = (text) => [...text].length
    /** A muted note; a long one (BOARD.note) is clamped behind Show more / Show less. */
    function Note({ id, text, view }) {
      if (!text) return null
      const long = codePoints(text) > BOARD.note.clampChars || text.includes(BOARD.note.lineBreak)
      const open = view.flipped(BOARD.flip.note + id)
      return h('div', { className: S.noteBox },
        h('p', { className: classes(S.note, long && !open && S.clamp), [BOARD.hook.note]: true }, text),
        long ? disclosure({ className: S.link, open, onClick: () => view.flip(BOARD.flip.note + id) }, view.t(open ? 'showLess' : 'showMore')) : null)
    }

    /** A task as the view draws it: condensed when its whole subtree is closed, else a full row. */
    const TaskNode = ({ task, view }) => h(view.shape.allClosed(task) ? CondensedRow : FullRow, { task, view })

    /** A full row: title, status, (open only) bar and percentage, note, and its subtasks on a connector. */
    function FullRow({ task, view }) {
      const { t } = view
      const children = view.shape.kids(task.id)
      const shown = !view.flipped(BOARD.flip.subtasks + task.id)
      return h('li', { [BOARD.hook.task]: task.id, [BOARD.hook.status]: task.status },
        h('div', { className: S.card },
          h('div', { className: S.head },
            children.length > 0
              ? disclosure({ className: S.toggle, open: shown, label: t(shown ? 'collapseSubtasks' : 'expandSubtasks'), onClick: () => view.flip(BOARD.flip.subtasks + task.id) }, chevron())
              : null,
            h('span', { className: S.title, [BOARD.hook.title]: true }, task.title),
            h(Chip, { t, status: task.status })),
          // A closed task's progress no longer matters (the user, 2026-11-22): no bar, no percentage.
          isOpen(task)
            ? h('div', { className: S.meta }, h(Meter, { value: task.progress, max: BOARD.progress.max, label: t('taskProgress') }), h('span', { className: S.percent }, percentText(task.progress)))
            : null,
          h(Note, { id: task.id, text: task.note, view }),
          h(TaskAutoMarks, { task, view })),
        shown ? h(Subtasks, { tasks: children, view }) : null)
    }

    /** A task's subtasks on the connector line; nothing when it has none. */
    const Subtasks = ({ tasks, view }) => (tasks.length > 0 ? h('ul', { className: S.subtasks }, tasks.map((child) => h(TaskNode, { key: child.id, task: child, view }))) : null)

    /**
     * A closed task with a closed subtree, condensed to one line: a mark, the title and the status;
     * done glows green, dropped is grey (sheet). When it has a note or subtasks, the line is a button
     * that reveals them (the direct children, each condensed in turn); never a bar.
     */
    function CondensedRow({ task, view }) {
      const { t } = view
      const children = view.shape.kids(task.id)
      const hasDetails = Boolean(task.note) || children.length > 0
      const open = view.flipped(BOARD.flip.details + task.id)
      const Mark = task.status === BOARD.done ? IconCheckCircleFillRegular : IconCloseCircleFillRegular
      // Spread as separate children below, so these need no keys.
      const line = [
        h('span', { className: S.mark, 'aria-hidden': true }, h(Mark, { size: BOARD.smallIcon })),
        h('span', { className: S.title, [BOARD.hook.title]: true }, task.title),
        h(Chip, { t, status: task.status }),
        hasDetails ? chevron() : null,
      ]
      return h('li', { className: S.condensed, [BOARD.hook.task]: task.id, [BOARD.hook.status]: task.status, [BOARD.hook.condensed]: true },
        hasDetails ? disclosure({ className: S.line, open, onClick: () => view.flip(BOARD.flip.details + task.id) }, ...line) : h('div', { className: S.line }, ...line),
        h(TaskAutoMarks, { task, view }),
        hasDetails && open
          ? h('div', { className: S.details, [BOARD.hook.details]: true },
            h(Note, { id: task.id, text: task.note, view }),
            h(Subtasks, { tasks: children, view }))
          : null)
    }

    /** Counts per status (statuses with none left out) and the overall bar: done of every task not dropped. */
    function Summary({ tasks, t }) {
      const count = (status) => tasks.filter((task) => task.status === status).length
      const total = tasks.length - count(BOARD.dropped)
      const done = count(BOARD.done)
      return h('div', { className: S.summary, [BOARD.hook.summary]: true },
        h('div', { className: S.counts }, BOARD.statuses.filter((status) => count(status) > 0).map((status) =>
          h('span', { key: status, className: classes(S.chip, S.count), [BOARD.hook.count]: status }, h('strong', null, count(status)), statusText(t, status)))),
        total > 0
          ? h('div', { className: S.overall },
            h(Meter, { value: done, max: total, label: t('overallLabel'), extra: { [BOARD.hook.overall]: true } }),
            h('span', { className: S.percent }, t('overall', { done, total })))
          : null)
    }

    /** The view's task list: open top-level work first, then the closed ones in a Completed group (collapsed by default). */
    function TaskTree({ view }) {
      const top = view.shape.kids(null)
      const finished = top.filter(view.shape.allClosed)
      const open = view.flipped(BOARD.flip.completed)
      const current = top.filter((task) => !view.shape.allClosed(task))
      return h(React.Fragment, null,
        current.length > 0 ? h('ul', { className: S.list }, current.map((task) => h(TaskNode, { key: task.id, task, view }))) : null,
        finished.length > 0
          ? h('div', { className: S.group, [BOARD.hook.completed]: true },
            disclosure({ className: S.groupToggle, open, onClick: () => view.flip(BOARD.flip.completed) }, chevron(), view.t('completed', { n: finished.length })),
            open ? h('ul', { className: S.list }, finished.map((task) => h(CondensedRow, { key: task.id, task, view }))) : null)
          : null)
    }

    const rowClass = (invalid) => classes(S.row, invalid && S.invalid)

    function TaskEdit({ task, depth, t, edit, add, remove, invalid }) {
      const set = (name) => (event) => edit(task.id, name, event.target.value)
      return h('li', { className: rowClass(invalid), 'aria-invalid': invalid || undefined, style: { marginInlineStart: depth * BOARD.indentPx }, [BOARD.hook.task]: task.id, [BOARD.hook.status]: task.status },
        h(Input, { 'aria-label': t('taskTitle'), value: task.title, onChange: set('title') }),
        h('div', { className: S.field },
          h('select', { className: S.select, 'aria-label': t('taskStatus'), value: task.status, onChange: set('status') },
            BOARD.statuses.map((status) => h('option', { key: status, value: status }, statusText(t, status)))),
          h(Input, { className: S.number, type: 'number', min: BOARD.progress.min, max: BOARD.progress.max, step: 1, 'aria-label': t('taskProgress'), value: String(task.progress),
            onChange: (event) => edit(task.id, 'progress', event.target.value === '' ? event.target.value : Number(event.target.value)) }),
          iconButton(t('addSubtask'), IconPlusOutlineRegular, () => add(task.id)),
          iconButton(t('deleteTask'), IconTrashOutlineRegular, () => remove(task.id))),
        h('textarea', { className: S.area, 'aria-label': t('taskNote'), value: task.note, onChange: set('note') }))
    }

    /** A memo: a card with the accent edge (view), or its text area and delete (edit). */
    function MemoRow({ memo, editing, t, edit, remove, invalid }) {
      if (!editing) return h('li', { className: classes(S.card, S.memo), [BOARD.hook.memo]: memo.id }, h('p', { className: S.memoText }, memo.text))
      return h('li', { className: rowClass(invalid), 'aria-invalid': invalid || undefined, [BOARD.hook.memo]: memo.id },
        h('textarea', { className: S.area, 'aria-label': t('memoText'), value: memo.text, onChange: (event) => edit(memo.id, event.target.value) }),
        h('div', { className: S.field }, iconButton(t('deleteMemo'), IconTrashOutlineRegular, () => remove(memo.id))))
    }

    const Empty = ({ t }) => h('p', { className: S.empty, [BOARD.hook.empty]: true }, t('empty'))

    /** A draft board: the fields the route takes, nothing else (§4). */
    const draftOf = (board) => ({
      baseRevision: board.revision,
      tasks: board.tasks.map(({ id, parentId, title, note, status, progress }) => ({ id, parentId, title, note, status, progress })),
      memos: board.memos.map(({ id, text }) => ({ id, text })),
    })

    const autoButton = (label, onClick, props) => h(Button, { ...BOARD.button, variant: 'outline', onClick, ...props }, label)
    const autoNotice = (text, error = false) => h('p', { className: error ? S.error : S.notice, role: error ? 'alert' : 'status' }, text)
    const autoCard = (title, ...children) => h('section', { className: S.card }, h('h4', { className: AUTO.css.label }, title), ...children)
    const autoFacts = (pairs) => h('dl', { className: AUTO.css.kv }, pairs.filter(([, value]) => value !== undefined).map(([label, value]) =>
      h(React.Fragment, { key: label }, h('dt', null, label), h('dd', null, value))))
    const modelKey = (model) => model == null ? AUTO.modelUnset : JSON.stringify([model.provider, model.model])
    const modelRoute = (model) => model == null ? undefined : model.provider + ' / ' + model.model
    const versionText = (t, revision) => t('autoVersion', { revision })
    const timestamp = (at) => Number.isFinite(at) ? new Date(at).toLocaleString() : undefined
    const autoText = (t, namespace, value, fallback) => {
      const key = namespace + '.' + value
      return Object.hasOwn(en, key) ? t(key) : fallback
    }

    function useAutoCatalog(ctx) {
      const [catalog, setCatalog] = React.useState({ status: AUTO.state.loading })
      React.useEffect(() => {
        let live = true
        const fail = () => { if (live) setCatalog({ status: AUTO.state.failed }) }
        // Match the core model picker's on-demand lookup; missing remote.session must not remove the tab.
        void Promise.resolve().then(() => ctx.get(AUTO.remoteSession).modelCatalog()).then((answer) => {
          if (!live) return
          if (answer?.ok !== true || !Array.isArray(answer.value?.groups)) { fail(); return }
          const labels = new Map(answer.value.groups.flatMap((group) => group.models.map((model) => [
            modelKey({ provider: group.id, model: model.id }), group.name + ' / ' + model.name,
          ])))
          setCatalog({ status: AUTO.state.ready, labels })
        }).catch(fail)
        return () => { live = false }
      }, [ctx])
      return catalog
    }

    function AutoSettings({ ctx, t, audit, open }) {
      const { snapshot, failure, refreshing, refresh } = audit
      const catalog = useAutoCatalog(ctx)
      const id = React.useId()
      const [picked, setPicked] = React.useState(undefined)
      const [saving, setSaving] = React.useState(false)
      const [result, setResult] = React.useState(undefined)
      const current = modelKey(snapshot.model)
      const choices = new Map((snapshot.models ?? []).map((model) => [modelKey(model), model]))
      const pickable = catalog.status === AUTO.state.ready
      const value = picked ?? current
      const selected = choices.get(value)
      const route = modelRoute(selected ?? (value === current && value !== AUTO.modelUnset ? snapshot.model : null))
      const labelOf = (model) => catalog.labels?.get(modelKey(model)) ?? modelRoute(model)
      const paused = snapshot.reason ? snapshot.reason !== AUTO.reason.off : snapshot.model != null && snapshot.available !== true
      const autoStatus = paused ? t('autoPaused', { reason: autoText(t, 'autoReason', snapshot.reason, t('autoUnknown')) })
        : snapshot.model == null ? t('autoOff') : t('autoEnabled')
      const locked = saving || refreshing || failure || snapshot.reason === AUTO.reason.storageUnavailable
      const saveModel = async (model) => {
        if (locked) return
        setSaving(true)
        setResult(undefined)
        const { status, body } = await request(AUTO.route.settings, { model })
        const ok = status === BOARD.http.ok && body?.ok === true
        setPicked(undefined)
        setResult(ok ? { key: 'autoSaved' } : { key: body?.code === BOARD.code.invalid && body.field === 'model' ? 'autoSettingsModelFailed' : 'autoSettingsFailed', error: true })
        refresh()
        setSaving(false)
      }
      const catalogNote = !pickable ? t(catalog.status === AUTO.state.loading ? 'autoModelLoading' : 'autoModelFailed') : choices.size === 0 ? t('autoNoChoices') : null
      const changePick = (event) => { setPicked(event.target.value); setResult(undefined) }
      return h(React.Fragment, null,
        autoCard(t('autoModel'),
          autoNotice(autoStatus),
          snapshot.model == null ? autoNotice(t('autoDisabled')) : null,
          snapshot.model == null ? null : h('p', null, t('autoStoredRoute', { route: modelRoute(snapshot.model) })),
          h('strong', null, route ? t('autoDataRoute', { route }) : t('autoDataBefore')),
          h('p', null, t('autoData')),
          h('label', { htmlFor: id, className: AUTO.css.label }, t('autoModel')),
          h('div', { className: S.field },
            h('select', { id, className: S.select, value, disabled: !pickable || locked, onChange: changePick, [AUTO.hook.model]: true },
              h('option', { value: AUTO.modelUnset }, t('autoNoModel')),
              value !== AUTO.modelUnset && !selected ? h('option', { value, disabled: true }, value === current ? labelOf(snapshot.model) : value) : null,
              [...choices].map(([key, model]) => h('option', { key, value: key }, labelOf(model)))),
            autoButton(t('save'), () => void saveModel(selected ?? null), { disabled: !pickable || locked || value === current || (value !== AUTO.modelUnset && !selected) }),
            snapshot.model != null ? autoButton(t('autoTurnOff'), () => void saveModel(null), { disabled: locked }) : null),
          catalogNote ? autoNotice(catalogNote) : null,
          saving ? autoNotice(t('autoSaving')) : null,
          result ? autoNotice(t(result.key), result.error) : null,
          h('p', { className: S.notice }, t('autoModelPolicy'))),
        autoCard(t('autoRules'), h('ol', null, ['autoRuleFields', 'autoRuleReview', 'autoRuleConflict'].map((key) => h('li', { key }, t(key))))),
        autoCard(t('autoBudget'), h('p', null, t('autoBudgetText', AUTO.limit))),
        h('div', { className: S.field }, autoButton(t('autoHistory'), () => open(AUTO.screen.history)), autoButton(t('autoDiagnostics'), () => open(AUTO.screen.diagnostics))))
    }

    const batchName = (t, batchId) => t('autoBatchLabel', { id: batchId })
    const byTime = (left, right) => right.createdAt - left.createdAt || right.revision - left.revision
    const autoFieldText = (t, field, value) => field === 'status' ? statusText(t, value)
      : field === 'progress' ? percentText(value) : value === '' ? t('autoEmptyValue') : value
    const pendingReviews = (snapshot) => snapshot.reviews.filter((review) => review.status === AUTO.pending)
    const parentText = (t, parent) => parent == null ? t('autoNoParent') : t('autoParent', {
      title: parent.path?.length ? parent.path.join(AUTO.pathSeparator) : parent.title, progress: percentText(parent.progress),
    })
    const evidenceBlock = (t, evidence) => evidence ? h('div', null,
      h('p', { className: S.notice }, t('autoEvidence')), h('blockquote', { className: AUTO.css.diff }, evidence)) : null
    const sourceFacts = (t, source) => [
      [t('autoSourceSession'), source?.sessionId], [t('autoSourceTarget'), source?.targetId], [t('autoSourceTurn'), source?.turnId],
    ]

    /** Only show live markers from a matching projection; older changes belong in history. */
    function auditMarks(snapshot, revision) {
      if (snapshot?.revision !== revision) return undefined
      const last = snapshot.batches.find((batch) => batch.revision === revision && !batch.undone && batch.changes?.length > 0)
      const reviews = pendingReviews(snapshot)
      return { last, reviews, changes: new Map(last?.changes.map((change) => [change.taskId, change])),
        byTask: new Map(reviews.map((review) => [review.taskId, review])) }
    }

    function TaskAutoMarks({ task, view }) {
      if (!view.marks) return null
      const { t, marks, auditOpen } = view
      const change = marks.changes.get(task.id)
      const review = marks.byTask.get(task.id)
      if (!change && !review) return null
      const summary = Object.entries(change?.fields ?? {}).filter(([field]) => Object.hasOwn(AUTO.field, field)).map(([field, { before, after }]) =>
        field === 'note' ? t('autoNoteAppend') : [before, after].map((value) => autoFieldText(t, field, value)).join(AUTO.arrow))
      return h('div', { className: classes(S.field, S.notice) },
        change ? autoButton(t('autoUpdated'), () => auditOpen(AUTO.screen.batch, marks.last.batchId), {
          className: AUTO.css.tag, [AUTO.hook.update]: task.id,
        }) : null,
        summary.join(AUTO.summarySeparator),
        review ? h(React.Fragment, null, autoButton(t('autoPending'), () => auditOpen(AUTO.screen.review, review.reviewId), {
          className: AUTO.css.tag, [AUTO.hook.review]: task.id,
        }), t('autoNotDone')) : null)
    }

    function AutoHistory({ t, snapshot, open }) {
      return h(React.Fragment, null,
        Number.isFinite(snapshot.retentionDays) ? autoNotice(t('autoRetention', { days: snapshot.retentionDays })) : null,
        snapshot.batches.length === 0 ? autoNotice(t('autoNoBatches')) : h('ul', { className: S.list },
          [...snapshot.batches].sort(byTime).map((batch) => h('li', { key: batch.batchId }, autoCard(batchName(t, batch.batchId),
            h('p', null, t(batch.changes.length === 1 ? 'autoBatchOne' : 'autoBatchSummary', { revision: batch.revision, n: batch.changes.length })),
            autoNotice(timestamp(batch.createdAt)),
            batch.undone ? autoNotice(t('autoUndone', { revision: batch.undone.revision })) : null,
            h('div', { className: S.field }, autoButton(t('autoBatch'), () => open(AUTO.screen.batch, batch.batchId))))))))
    }

    function AuditChange({ t, change, undone }) {
      const valuePair = (field, { before, after }) => {
        // Non-undoable batches expose only the appended fragment, not the old note or complete new note.
        if (field === 'note' && before === null) return h('div', { key: field, className: AUTO.css.diff },
          h('strong', null, t(undone ? 'autoRemovedAppend' : 'autoNoteAppend')), h('p', null, after))
        const values = undone ? [after, before] : [before, after]
        const labels = [t('autoBefore'), t(undone ? 'autoRestored' : 'autoAfter')]
        return h('div', { key: field, className: AUTO.css.diff },
          h('strong', null, t(AUTO.field[field])), autoFacts(labels.map((label, i) => [label, autoFieldText(t, field, values[i])])))
      }
      return autoCard(change.title,
        autoFacts([[t('autoTaskId'), change.taskId], [t('autoCommittedProgress'), percentText(change.progress)], [t('autoParentId'), change.parent?.taskId]]),
        autoNotice(parentText(t, change.parent)),
        ...Object.entries(change.fields).filter(([field]) => Object.hasOwn(AUTO.field, field)).map(([field, diff]) => valuePair(field, diff)),
        evidenceBlock(t, change.evidence))
    }

    function AutoBatch({ t, batch, board, audit, lost, open }) {
      const [confirm, setConfirm] = React.useState(undefined)
      const [busy, setBusy] = React.useState(false)
      const [result, setResult] = React.useState(undefined)
      if (!batch) return autoNotice(t('autoRecordMissing'))
      const { snapshot, failure, refreshing, refresh } = audit
      const { batchId, batchVersion, revision, changes, undone, archivedAt } = batch
      const stale = board.revision !== revision || snapshot.revision !== revision
      const locked = lost || busy || refreshing || failure || snapshot.reason === AUTO.reason.storageUnavailable
      const canUndo = batch.undoable === true && !stale && !undone
      const isConfirmed = confirm?.expectedBatchVersion === batchVersion && confirm?.baseRevision === board.revision
      const begin = () => {
        setResult(undefined)
        setConfirm({ batchId, expectedBatchVersion: batchVersion, baseRevision: board.revision })
      }
      const canArchive = batch.notification === AUTO.notice.unknown && archivedAt === undefined
      const mutate = async (path, payload, message) => {
        if (locked) return
        setBusy(true)
        setConfirm(undefined)
        setResult(undefined)
        const { status, body } = await request(path, payload)
        if (status === BOARD.http.ok && body?.ok === true) setResult(message.success?.(body))
        else setResult({ key: status === BOARD.http.conflict || body?.code === BOARD.code.stale ? message.stale : message.failure, error: true })
        refresh()
        setBusy(false)
      }
      const undo = () => {
        // Submit the exact versions the owner confirmed. Never rebase a pending confirmation.
        if (canUndo && isConfirmed) void mutate(AUTO.route.undo, confirm, {
          success: (body) => body.alreadyUndone ? { key: 'autoAlreadyUndone' } : { key: 'autoUndone', values: { revision: body.revision } },
          stale: 'autoUndoStale', failure: 'autoUndoFailed',
        })
      }
      const archive = () => {
        if (canArchive) void mutate(AUTO.route.archive, { batchId, expectedBatchVersion: batchVersion }, {
          stale: 'autoBatchChanged', failure: 'autoArchiveFailed',
        })
      }
      const reviews = snapshot.reviews.filter((review) => review.batchId === batchId)
      return h(React.Fragment, null,
        autoCard(batchName(t, batchId), autoFacts([
          ...sourceFacts(t, batch.source), [t('autoModel'), modelRoute(batch.model)],
          [t('autoRevision'), [batch.baseRevision, revision].map((v) => versionText(t, v)).join(AUTO.arrow)],
          [t('autoTime'), timestamp(batch.createdAt)],
          [t('autoNotification'), archivedAt === undefined ? autoText(t, 'autoNotice', batch.notification, t('autoUnknown')) : t('autoArchivedUnknown')],
          [t('autoArchivedAt'), timestamp(archivedAt)],
        ]), autoNotice(t('autoNotifyQuiet'))),
        ...changes.map((change) => h(AuditChange, { key: change.taskId, t, change, undone })),
        autoCard(t('autoBatchActions'),
          undone ? h(React.Fragment, null, autoNotice(t('autoUndone', { revision: undone.revision })), autoFacts([
            [t('autoUndoTime'), timestamp(undone.at)], [t('autoUndoActor'), undone.actor === AUTO.owner ? t('autoOwner') : undefined],
          ])) : changes.length === 0 ? null : canUndo
            ? autoNotice(t('autoUndoExplain', { n: changes.length })) : autoNotice(t(stale ? 'autoUndoStale' : 'autoUndoBlocked')),
          canArchive ? autoNotice(t('autoArchiveExplain')) : null,
          result && !(undone && !result.error) ? autoNotice(t(result.key, result.values), result.error) : null,
          h('div', { className: S.field },
            canUndo && !isConfirmed ? autoButton(t('autoUndo'), begin, { disabled: locked, [AUTO.hook.undo]: batchId }) : null,
            canUndo && isConfirmed ? h(React.Fragment, null,
              autoButton(t('autoUndoConfirm'), undo, { variant: 'primary', disabled: locked }),
              autoButton(t('cancel'), () => setConfirm(undefined))) : null,
            canArchive ? autoButton(t('autoArchive'), archive, { disabled: locked }) : null,
            reviews.length ? autoButton(t('autoReviews'), () => open(AUTO.screen.review, undefined, batchId)) : null,
            autoButton(t('autoHistory'), () => open(AUTO.screen.history)))))
    }

    function AutoReviews({ t, snapshot, board, panel, open }) {
      const reviews = snapshot.reviews.filter((review) => (!panel.id || review.reviewId === panel.id) && (!panel.batchId || review.batchId === panel.batchId))
      const matched = board.revision === snapshot.revision
      const tasks = new Map(matched ? board.tasks.map((task) => [task.id, task]) : [])
      return h(React.Fragment, null, autoNotice(t('autoReviewReadOnly')),
        reviews.length === 0 ? autoNotice(t(panel.id ? 'autoRecordMissing' : 'autoNoReviews')) : null,
        ...reviews.map((review) => {
          const task = tasks.get(review.taskId)
          const parent = task ? tasks.get(task.parentId) : undefined
          const current = !matched ? t('autoReviewWaitingBoard')
            : task ? [statusText(t, task.status), percentText(task.progress)].join(AUTO.summarySeparator) : t('autoMissingTask')
          const suggestion = Object.entries(review.suggestion ?? {}).filter(([field]) => Object.hasOwn(AUTO.field, field)).map(([field, value]) =>
            [t(AUTO.field[field]), autoFieldText(t, field, value)])
          return h('div', { key: review.reviewId }, autoCard(review.title,
            autoNotice(autoText(t, 'autoReviewStatus', review.status, t('autoUnknown'))),
            parent ? autoNotice(parentText(t, parent)) : task ? autoNotice(t('autoNoParent')) : null,
            autoFacts([[t('autoTaskId'), review.taskId], [t('autoReviewCurrent'), current], ...sourceFacts(t, review.source), [t('autoRevision'), versionText(t, review.baseRevision)]]),
            h('strong', null, t('autoReviewSuggested')), autoFacts(suggestion), evidenceBlock(t, review.evidence),
            h('div', { className: S.field }, autoButton(batchName(t, review.batchId), () => open(AUTO.screen.batch, review.batchId)))))
        }))
    }

    function AutoDiagnostics({ t, diagnostics, open }) {
      const { counts, last, sentLastHour } = diagnostics ?? {}
      const reason = (key) => autoText(t, 'autoDiagnostic', key, t('autoOtherDiagnostic'))
      const details = Object.entries(counts ?? {}).map(([key, count]) => [reason(key), count, key])
      return h(React.Fragment, null, autoNotice(t('autoDiagnosticsHint')),
        autoFacts([[t('autoSentLastHour'), sentLastHour], [t('autoLastResult'), last ? [reason(last.reason), timestamp(last.at)].filter(Boolean).join(AUTO.summarySeparator) : undefined]]),
        details.length ? h('ul', null, details.map(([label, count, key]) => h('li', { key }, t('autoDiagnosticCount', { label, count })))) : autoNotice(t('autoNoDiagnostics')),
        h('div', { className: S.field }, autoButton(t('autoSettings'), () => open(AUTO.screen.settings))))
    }

    function AutoPanel({ ctx, t, audit, board, lost, panel, open, close }) {
      const title = React.useRef(null)
      React.useEffect(() => title.current?.focus(), [panel])
      const { snapshot, failure, refreshing } = audit
      const screens = {
        [AUTO.screen.settings]: () => h(AutoSettings, { ctx, t, audit, open }),
        [AUTO.screen.history]: () => h(AutoHistory, { t, snapshot, open }),
        [AUTO.screen.batch]: () => h(AutoBatch, { key: panel.id, t, batch: snapshot.batches.find((batch) => batch.batchId === panel.id), board, audit, lost, open }),
        [AUTO.screen.review]: () => h(AutoReviews, { t, snapshot, board, panel, open }),
        [AUTO.screen.diagnostics]: () => h(AutoDiagnostics, { t, diagnostics: snapshot.diagnostics, open }),
      }
      return h('section', { className: AUTO.css.panel, 'aria-label': t(panel.screen), [AUTO.hook.panel]: panel.screen },
        h('div', { className: S.bar }, h('h3', { className: S.heading, tabIndex: -1, ref: title }, t(panel.screen)), autoButton(t('autoBack'), close)),
        failure ? h('div', { className: S.field }, autoNotice(t('autoReadFailed'), true), autoButton(t('reload'), audit.refresh)) : null,
        snapshot?.reason === AUTO.reason.storageUnavailable && panel.screen !== AUTO.screen.settings ? autoNotice(t('autoReason.storage-unavailable'), true) : null,
        !snapshot ? refreshing && !failure ? autoNotice(t('loading')) : null : screens[panel.screen]())
    }

    function AutoToolbar({ t, marks, open }) {
      const { last, reviews } = marks ?? {}
      return h('div', { className: S.bar, [AUTO.hook.tools]: true },
        autoButton(t('autoSettings'), () => open(AUTO.screen.settings)),
        autoButton(t('autoHistory'), () => open(AUTO.screen.history)),
        last ? autoButton(t(last.changes.length === 1 ? 'autoUpdatedOne' : 'autoUpdatedCount', { n: last.changes.length }), () => open(AUTO.screen.batch, last.batchId)) : null,
        reviews?.length ? autoButton(t('autoPendingCount', { n: reviews.length }), () => open(AUTO.screen.review)) : null,
        last ? h('span', { className: S.notice }, timestamp(last.createdAt)) : null)
    }

    function makeTab(ctx, feed) {
      const t = ctx.locale.bind(BOARD.locale)
      return function TaskboardTab() {
        React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
        const { board, lost, closed, autoSignal } = React.useSyncExternalStore(feed.subscribe, feed.get)
        const audit = useAuto(board?.revision, autoSignal)
        const lostText = closed ? t('closed') : t('lost')
        const [draft, setDraft] = React.useState(undefined)
        const [busy, setBusy] = React.useState(false)
        const [outcome, setOutcome] = React.useState(undefined)
        // The view's disclosures: the keys flipped from their default (BOARD.flip). Tab state only.
        const [flips, setFlips] = React.useState(() => new Set())
        const [panel, setPanel] = React.useState(undefined)
        const boardTitle = React.useRef(null)
        const focusBoard = React.useRef(false)
        React.useEffect(() => {
          if (panel || !focusBoard.current) return
          focusBoard.current = false
          boardTitle.current?.focus()
        }, [panel])
        if (board === undefined) return h('div', { className: S.root }, h('p', { className: S.notice, role: 'status' }, lost ? lostText : t('loading')))
        const editing = draft !== undefined
        const marks = !audit.failure && !lost ? auditMarks(audit.snapshot, board.revision) : undefined
        const auditOpen = (screen, id, batchId) => { setPanel({ screen, id, batchId }); audit.refresh() }
        const auditClose = () => { focusBoard.current = true; setPanel(undefined) }
        if (panel && !editing) return h('div', { className: S.root, [BOARD.hook.root]: BOARD.mode.view },
          h(AutoPanel, { ctx, t, audit, board, lost, panel, open: auditOpen, close: auditClose }))
        const shown = editing ? draft : board
        const change = (next) => { setDraft(next); setOutcome(undefined) }
        const editTask = (id, name, value) => change({ ...draft, tasks: draft.tasks.map((task) => (task.id === id ? { ...task, [name]: value } : task)) })
        const addTask = (parentId) => change({ ...draft, tasks: [...draft.tasks, { id: randomId(BOARD.id.task), parentId, title: '', note: '', status: BOARD.statuses[0], progress: BOARD.progress.min }] })
        const removeTask = (id) => { const gone = subtree(draft.tasks, id); change({ ...draft, tasks: draft.tasks.filter((task) => !gone.has(task.id)) }) }
        const editMemo = (id, text) => change({ ...draft, memos: draft.memos.map((memo) => (memo.id === id ? { ...memo, text } : memo)) })
        const addMemo = () => change({ ...draft, memos: [...draft.memos, { id: randomId(BOARD.id.memo), text: '' }] })
        const removeMemo = (id) => change({ ...draft, memos: draft.memos.filter((memo) => memo.id !== id) })
        const submit = async () => {
          setBusy(true)
          const result = outcomeOf(t, await save(draft), draft)
          setBusy(false)
          setOutcome(result)
          if (result.done) setDraft(undefined)
        }
        const view = {
          t, marks, auditOpen, shape: shapeOf(shown.tasks),
          flipped: (key) => flips.has(key),
          flip: (key) => setFlips((current) => { const next = new Set(current); if (!next.delete(key)) next.add(key); return next }),
        }
        const unfinished = shown.tasks.filter(isOpen).length
        const addButton = (label, onClick) => h('div', null, h(Button, { ...BOARD.button, onClick }, h(IconPlusOutlineRegular, { size: BOARD.icon }), ' ', label))
        // Edit mode lists every task flat in tree order (no condensing, grouping or collapse), so each field stays reachable.
        const tasks = shown.tasks.length === 0
          ? h(Empty, { t })
          : editing
            ? h('ul', { className: S.list }, treeOf(shown.tasks).map(({ task, depth }) =>
              h(TaskEdit, { key: task.id, task, depth, t, edit: editTask, add: addTask, remove: removeTask, invalid: outcome?.itemId === task.id })))
            : h(TaskTree, { view })
        return h('div', { className: S.root, [BOARD.hook.root]: editing ? BOARD.mode.edit : BOARD.mode.view },
          h('div', { className: S.bar },
            h('h2', { className: S.heading, tabIndex: -1, ref: boardTitle }, t('tasks'), ' · ', t('unfinished', { n: unfinished })),
            editing
              ? [h(Button, { key: 'save', ...BOARD.button, variant: 'primary', disabled: busy, onClick: submit }, t('save')),
                h(Button, { key: 'cancel', ...BOARD.button, disabled: busy, onClick: () => change(undefined) }, t('cancel'))]
              : h(Button, { ...BOARD.button, onClick: () => change(draftOf(board)) }, h(IconEditOutlineRegular, { size: BOARD.icon }), ' ', t('edit'))),
          lost ? h('p', { className: S.notice, role: 'status' }, lostText) : null,
          audit.snapshot?.reason === AUTO.reason.storageUnavailable ? autoNotice(t('autoReason.storage-unavailable'), true) : null,
          editing && board.revision !== draft.baseRevision
            ? h('p', { className: S.notice, role: 'status' }, t('changedMeanwhile'), ' ', h(Button, { ...BOARD.button, onClick: () => change(undefined) }, t('reload')))
            : null,
          outcome ? h('p', { className: outcome.error ? S.error : S.notice, role: outcome.error ? 'alert' : 'status' }, outcome.text) : null,
          !editing && shown.tasks.length > 0 ? h(Summary, { tasks: shown.tasks, t }) : null,
          !editing ? h(AutoToolbar, { t, marks, open: auditOpen }) : null,
          tasks,
          editing ? addButton(t('addTask'), () => addTask(null)) : null,
          h('div', { className: classes(S.bar, S.section) }, h('h2', { className: S.heading }, t('memos'))),
          shown.memos.length === 0 ? h(Empty, { t }) : h('ul', { className: S.list },
            shown.memos.map((memo) => h(MemoRow, { key: memo.id, memo, editing, t, edit: editMemo, remove: removeMemo, invalid: outcome?.itemId === memo.id }))),
          editing ? addButton(t('addMemo'), addMemo) : null)
      }
    }

    function makeHeaderEntry(ctx) {
      const t = ctx.locale.bind(BOARD.locale)
      return function TaskboardEntry() {
        React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
        return iconButton(t('open'), IconChecklistOutlineRegular, () => ctx.sidebarRight.openTab(BOARD.kind))
      }
    }

    function apply(ctx) {
      const t = ctx.locale.bind(BOARD.locale)
      const feed = createFeed(ctx)
      ctx.effect(() => ctx.locale.register(BOARD.locale, { en, zh }), BOARD.name + ': dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.id = BOARD.styleId
        style.textContent = css
        document.head.appendChild(style)
        return () => style.remove()
      }, BOARD.name + ': styles')
      // A page type: opened by kind, one per pane, recognising no resource address (as ui-schedule's task
      // tab). `keepMounted`: the draft lives in the body's state, so hiding the column, switching
      // sessions or docking must not unmount it, or the user's typing would be lost (§4).
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: BOARD.name, kind: BOARD.kind, keepMounted: true, title: () => t('title'),
        guide: [{ id: BOARD.guide.id, order: BOARD.guide.order, title: () => t('title'), description: () => t('guideDescription'), icon: IconChecklistOutlineRegular }],
      }), BOARD.name + ': tab type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: BOARD.name, locale: BOARD.locale }, makeTab(ctx, feed))), BOARD.name + ': tab body')
      ctx.effect(() => ctx.slots.inject(BOARD.header.slot, () => ctx.slots.register({
        name: BOARD.header.slot, id: BOARD.header.id, order: BOARD.header.order, locale: BOARD.locale,
      }, makeHeaderEntry(ctx))), BOARD.name + ': header entry')
    }

    return { name: BOARD.name, inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'], apply }
  },
})

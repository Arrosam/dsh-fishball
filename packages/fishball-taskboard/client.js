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
    const { Button, Input, Tooltip, IconChecklistOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /** The row's constants as this chunk needs them (restated: a browser chunk imports no module). */
    const BOARD = Object.freeze({
      name: 'fishball-taskboard',
      locale: 'fishball-taskboard',
      kind: 'fishball-taskboard',
      route: Object.freeze({ board: 'api/fishball-taskboard/board', events: 'api/fishball-taskboard/events' }),
      statuses: Object.freeze(['todo', 'in_progress', 'blocked', 'done', 'dropped']),
      open: Object.freeze(['todo', 'in_progress', 'blocked']),
      progress: Object.freeze({ min: 0, max: 100 }),
      id: Object.freeze({ task: 't_', memo: 'm_' }),
      code: Object.freeze({ stale: 'stale', invalid: 'invalid-input', limit: 'limit-reached' }),
      http: Object.freeze({ ok: 200 }),
      /** A save error's field path names a draft item by its array index (`tasks[3].title`, routes §4). */
      itemField: /^(tasks|memos)\[(\d+)\]/,
      header: Object.freeze({ slot: 'conversation.session.header.actions', id: 'fishball-taskboard', order: 92 }),
      guide: Object.freeze({ id: 'board', order: 60 }),
      tooltip: Object.freeze({ side: 'bottom', align: 'end', portal: true }),
      button: Object.freeze({ type: 'button', size: 'sm', variant: 'ghost' }),
      icon: 16,
      indentPx: 16,
      styleId: 'fishball-taskboard-style',
      css: Object.freeze({
        root: 'fb-tb', bar: 'fb-tb-bar', heading: 'fb-tb-heading', list: 'fb-tb-list', row: 'fb-tb-row', closed: 'fb-tb-closed',
        title: 'fb-tb-title', meta: 'fb-tb-meta', note: 'fb-tb-note', meter: 'fb-tb-meter', fill: 'fb-tb-fill',
        notice: 'fb-tb-notice', error: 'fb-tb-error', field: 'fb-tb-field', area: 'fb-tb-area', number: 'fb-tb-number', empty: 'fb-tb-empty', select: 'fb-tb-select', invalid: 'fb-tb-invalid',
      }),
    })

    const en = {
      title: 'Task board',
      open: 'Open task board',
      guideDescription: "Fishball's tasks and memos; you can edit them.",
      tasks: 'Tasks', memos: 'Memos',
      unfinished: '{n} unfinished',
      empty: 'Nothing yet.',
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
    }
    const zh = {
      title: '任务板',
      open: '打开任务板',
      guideDescription: 'Fishball 的任务和备忘，可由你编辑。',
      tasks: '任务', memos: '备忘',
      unfinished: '{n} 项未完成',
      empty: '还没有内容。',
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
    }

    const css = [
      `.${BOARD.css.root}{display:flex;flex-direction:column;gap:12px;padding:12px;height:100%;overflow:auto;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-primary)}`,
      `.${BOARD.css.bar}{display:flex;align-items:center;gap:8px;flex-wrap:wrap}`,
      `.${BOARD.css.heading}{margin:0;font:var(--dsw-font-s-strong-14);flex:1}`,
      `.${BOARD.css.list}{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}`,
      `.${BOARD.css.row}{display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}`,
      `.${BOARD.css.closed}{opacity:.6}`,
      `.${BOARD.css.title}{font:var(--dsw-font-xs-13);overflow-wrap:anywhere}`,
      `.${BOARD.css.meta}{display:flex;gap:8px;align-items:center;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      `.${BOARD.css.note}{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      `.${BOARD.css.meter}{flex:1;height:4px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-border-l2);overflow:hidden}`,
      `.${BOARD.css.fill}{height:100%;background:var(--dsw-alias-state-business-primary)}`,
      `.${BOARD.css.notice}{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      `.${BOARD.css.error}{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary)}`,
      `.${BOARD.css.field}{display:flex;gap:6px;align-items:center;flex-wrap:wrap}`,
      `.${BOARD.css.area}{width:100%;box-sizing:border-box;min-height:48px;resize:vertical;font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);padding:4px 6px}`,
      `.${BOARD.css.number}{width:64px}`,
      `.${BOARD.css.select}{font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);padding:2px 4px}`,
      `.${BOARD.css.invalid}{outline:1px solid var(--dsw-alias-state-error-primary);outline-offset:1px}`,
      `.${BOARD.css.empty}{margin:0;color:var(--dsw-alias-label-tertiary)}`,
    ].join('')

    const url = (path) => new URL(path, document.baseURI)
    const randomId = (prefix) => prefix + crypto.randomUUID()

    /**
     * The board as the row streams it: `{board, lost}`, shared by every mounted tab. EventSource
     * retries by itself after an error; a valid frame clears `lost`.
     */
    function createFeed() {
      // `lost`: an error while EventSource retries by itself; `closed`: it gave up (a non-200 answer).
      let state = { board: undefined, lost: false, closed: false }
      const listeners = new Set()
      let source
      const set = (next) => { state = { ...state, ...next }; listeners.forEach((listener) => listener()) }
      return {
        get: () => state,
        subscribe(listener) {
          listeners.add(listener)
          if (!source) {
            source = new EventSource(url(BOARD.route.events), { withCredentials: true })
            source.onmessage = (event) => { try { set({ board: JSON.parse(event.data), lost: false, closed: false }) } catch { set({ lost: true }) } }
            source.onerror = () => set({ lost: true, closed: source?.readyState === EventSource.CLOSED })
          }
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0) { source?.close(); source = undefined; state = { ...state, closed: false } }
          }
        },
      }
    }

    /** One POST of the whole wanted board: `{status, body}`, status 0 when no answer came. Never throws. */
    async function save(draft) {
      try {
        const response = await fetch(url(BOARD.route.board), {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
        })
        return { status: response.status, body: await response.json().catch(() => null) }
      } catch { return { status: 0, body: null } }
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

    const statusText = (t, status) => t('status.' + status)
    const iconButton = (label, Icon, onClick) => h(Tooltip, { ...BOARD.tooltip, label }, h(Button, { ...BOARD.button, 'aria-label': label, onClick }, h(Icon, { size: BOARD.icon })))

    function TaskView({ task, depth, t }) {
      const closed = !BOARD.open.includes(task.status)
      return h('li', { className: BOARD.css.row + (closed ? ' ' + BOARD.css.closed : ''), style: { marginInlineStart: depth * BOARD.indentPx }, 'data-fishball-task': task.id },
        h('span', { className: BOARD.css.title }, task.title),
        h('span', { className: BOARD.css.meta },
          statusText(t, task.status),
          h('span', { className: BOARD.css.meter, role: 'progressbar', 'aria-label': t('taskProgress'), 'aria-valuemin': BOARD.progress.min, 'aria-valuemax': BOARD.progress.max, 'aria-valuenow': task.progress },
            h('span', { className: BOARD.css.fill, style: { width: task.progress + '%' } })),
          task.progress + '%'),
        task.note ? h('p', { className: BOARD.css.note }, task.note) : null)
    }

    const rowClass = (invalid) => BOARD.css.row + (invalid ? ' ' + BOARD.css.invalid : '')

    function TaskEdit({ task, depth, t, edit, add, remove, invalid }) {
      const set = (name) => (event) => edit(task.id, name, event.target.value)
      return h('li', { className: rowClass(invalid), 'aria-invalid': invalid || undefined, style: { marginInlineStart: depth * BOARD.indentPx }, 'data-fishball-task': task.id },
        h(Input, { 'aria-label': t('taskTitle'), value: task.title, onChange: set('title') }),
        h('div', { className: BOARD.css.field },
          h('select', { className: BOARD.css.select, 'aria-label': t('taskStatus'), value: task.status, onChange: set('status') },
            BOARD.statuses.map((status) => h('option', { key: status, value: status }, statusText(t, status)))),
          h(Input, { className: BOARD.css.number, type: 'number', min: BOARD.progress.min, max: BOARD.progress.max, step: 1, 'aria-label': t('taskProgress'), value: String(task.progress),
            onChange: (event) => edit(task.id, 'progress', event.target.value === '' ? event.target.value : Number(event.target.value)) }),
          iconButton(t('addSubtask'), IconPlusOutlineRegular, () => add(task.id)),
          iconButton(t('deleteTask'), IconTrashOutlineRegular, () => remove(task.id))),
        h('textarea', { className: BOARD.css.area, 'aria-label': t('taskNote'), value: task.note, onChange: set('note') }))
    }

    function MemoRow({ memo, editing, t, edit, remove, invalid }) {
      if (!editing) return h('li', { className: BOARD.css.row, 'data-fishball-memo': memo.id }, h('p', { className: BOARD.css.note }, memo.text))
      return h('li', { className: rowClass(invalid), 'aria-invalid': invalid || undefined, 'data-fishball-memo': memo.id },
        h('textarea', { className: BOARD.css.area, 'aria-label': t('memoText'), value: memo.text, onChange: (event) => edit(memo.id, event.target.value) }),
        h('div', { className: BOARD.css.field }, iconButton(t('deleteMemo'), IconTrashOutlineRegular, () => remove(memo.id))))
    }

    /** A draft board: the fields the route takes, nothing else (§4). */
    const draftOf = (board) => ({
      baseRevision: board.revision,
      tasks: board.tasks.map(({ id, parentId, title, note, status, progress }) => ({ id, parentId, title, note, status, progress })),
      memos: board.memos.map(({ id, text }) => ({ id, text })),
    })

    function makeTab(ctx, feed) {
      const t = ctx.locale.bind(BOARD.locale)
      return function TaskboardTab() {
        React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
        const { board, lost, closed } = React.useSyncExternalStore(feed.subscribe, feed.get)
        const lostText = closed ? t('closed') : t('lost')
        const [draft, setDraft] = React.useState(undefined)
        const [busy, setBusy] = React.useState(false)
        const [outcome, setOutcome] = React.useState(undefined)
        if (board === undefined) return h('div', { className: BOARD.css.root }, h('p', { className: BOARD.css.notice, role: 'status' }, lost ? lostText : t('loading')))
        const editing = draft !== undefined
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
        const unfinished = shown.tasks.filter((task) => BOARD.open.includes(task.status)).length
        const rows = treeOf(shown.tasks)
        return h('div', { className: BOARD.css.root, 'data-fishball-taskboard': editing ? 'edit' : 'view' },
          h('div', { className: BOARD.css.bar },
            h('h2', { className: BOARD.css.heading }, t('tasks'), ' · ', t('unfinished', { n: unfinished })),
            editing
              ? [h(Button, { key: 'save', ...BOARD.button, variant: 'primary', disabled: busy, onClick: submit }, t('save')),
                h(Button, { key: 'cancel', ...BOARD.button, disabled: busy, onClick: () => change(undefined) }, t('cancel'))]
              : h(Button, { ...BOARD.button, onClick: () => change(draftOf(board)) }, t('edit'))),
          lost ? h('p', { className: BOARD.css.notice, role: 'status' }, lostText) : null,
          editing && board.revision !== draft.baseRevision
            ? h('p', { className: BOARD.css.notice, role: 'status' }, t('changedMeanwhile'), ' ', h(Button, { ...BOARD.button, onClick: () => change(undefined) }, t('reload')))
            : null,
          outcome ? h('p', { className: outcome.error ? BOARD.css.error : BOARD.css.notice, role: outcome.error ? 'alert' : 'status' }, outcome.text) : null,
          rows.length === 0 ? h('p', { className: BOARD.css.empty }, t('empty')) : h('ul', { className: BOARD.css.list },
            rows.map(({ task, depth }) => (editing
              ? h(TaskEdit, { key: task.id, task, depth, t, edit: editTask, add: addTask, remove: removeTask, invalid: outcome?.itemId === task.id })
              : h(TaskView, { key: task.id, task, depth, t })))),
          editing ? h('div', null, h(Button, { ...BOARD.button, onClick: () => addTask(null) }, h(IconPlusOutlineRegular, { size: BOARD.icon }), ' ', t('addTask'))) : null,
          h('div', { className: BOARD.css.bar }, h('h2', { className: BOARD.css.heading }, t('memos'))),
          shown.memos.length === 0 ? h('p', { className: BOARD.css.empty }, t('empty')) : h('ul', { className: BOARD.css.list },
            shown.memos.map((memo) => h(MemoRow, { key: memo.id, memo, editing, t, edit: editMemo, remove: removeMemo, invalid: outcome?.itemId === memo.id }))),
          editing ? h('div', null, h(Button, { ...BOARD.button, onClick: addMemo }, h(IconPlusOutlineRegular, { size: BOARD.icon }), ' ', t('addMemo'))) : null)
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
      const feed = createFeed()
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

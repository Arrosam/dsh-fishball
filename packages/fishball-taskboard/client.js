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
      http: Object.freeze({ ok: 200 }),
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
      let state = { board: undefined, lost: false, closed: false }
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
      /** The row's own route: the standalone fallback. */
      function ownSource() {
        const source = new EventSource(url(BOARD.route.events), { withCredentials: true })
        source.onmessage = (event) => { try { take(JSON.parse(event.data)) } catch { set({ lost: true }) } }
        source.onerror = () => set({ lost: true, closed: source.readyState === EventSource.CLOSED })
        return () => source.close()
      }
      function open() {
        const shared = ctx.get(BOARD.pageStream.client)
        if (typeof shared?.subscribe !== 'function') return ownSource()
        return shared.subscribe(BOARD.pageStream.topic, {
          frame: take,
          health: (word) => set({ lost: word !== BOARD.health.live, closed: word === BOARD.health.closed }),
        })
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
            state = { ...state, closed: false }
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
          h(Note, { id: task.id, text: task.note, view })),
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

    function makeTab(ctx, feed) {
      const t = ctx.locale.bind(BOARD.locale)
      return function TaskboardTab() {
        React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
        const { board, lost, closed } = React.useSyncExternalStore(feed.subscribe, feed.get)
        const lostText = closed ? t('closed') : t('lost')
        const [draft, setDraft] = React.useState(undefined)
        const [busy, setBusy] = React.useState(false)
        const [outcome, setOutcome] = React.useState(undefined)
        // The view's disclosures: the keys flipped from their default (BOARD.flip). Tab state only.
        const [flips, setFlips] = React.useState(() => new Set())
        if (board === undefined) return h('div', { className: S.root }, h('p', { className: S.notice, role: 'status' }, lost ? lostText : t('loading')))
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
        const view = {
          t, shape: shapeOf(shown.tasks),
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
            h('h2', { className: S.heading }, t('tasks'), ' · ', t('unfinished', { n: unfinished })),
            editing
              ? [h(Button, { key: 'save', ...BOARD.button, variant: 'primary', disabled: busy, onClick: submit }, t('save')),
                h(Button, { key: 'cancel', ...BOARD.button, disabled: busy, onClick: () => change(undefined) }, t('cancel'))]
              : h(Button, { ...BOARD.button, onClick: () => change(draftOf(board)) }, h(IconEditOutlineRegular, { size: BOARD.icon }), ' ', t('edit'))),
          lost ? h('p', { className: S.notice, role: 'status' }, lostText) : null,
          editing && board.revision !== draft.baseRevision
            ? h('p', { className: S.notice, role: 'status' }, t('changedMeanwhile'), ' ', h(Button, { ...BOARD.button, onClick: () => change(undefined) }, t('reload')))
            : null,
          outcome ? h('p', { className: outcome.error ? S.error : S.notice, role: outcome.error ? 'alert' : 'status' }, outcome.text) : null,
          !editing && shown.tasks.length > 0 ? h(Summary, { tasks: shown.tasks, t }) : null,
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

/**
 * S37 fixture browser half (revision 11 browser UI). Four prototypes, one per question:
 * 1. `tool.call.toolview` key `ask_fishball`: the running row shows Allow once / Reject and posts
 *    the answer to /api/s37/answer.
 * 2. "Asked Fishball: <answer>" tags:
 *    - `ask_user_question`: a keyed occupant at priority -1 that renders DSH's own question row
 *      (the next occupant, as the messenger does for input rows, S25) and adds the tag;
 *    - `exit_plan_mode` has no keyed view in DSH (it renders through ui-tool's private generic
 *      card), so three placements are tried, chosen by localStorage `s37.planTag`:
 *      `tail` (default, recommended) adds a `conversation.chat.turnTail` entry beside the plan card,
 *      `node` shadows the whole `conversation.chat.node` `tool-call` row (fails: the visible row
 *      does not render through it),
 *      `toolview` replaces the row with Fishball's own.
 * 3. `conversation.input.dock` in the stand-in Fishball session: "Waiting for you (n)" pile.
 * 4. `sidebar.workspaces.session.menu.item` and `conversation.session.header.actions`:
 *    Hand over to Fishball / Take back from Fishball.
 * window.__s37 records the props each slot entry received, for the evidence file.
 */
window.__ModuleLoader__.load({
  id: 'fishball-spike-client-slots',
  factory(require) {
    const React = require('react')
    const P = require('@deepseek-ai/dsh-client-ui-primitives')
    const { Button, Tag, MenuItemButton } = P
    const h = React.createElement
    const NAME = 'fishball-spike-client-slots'
    const SLOT = Object.freeze({
      toolview: 'tool.call.toolview', node: 'conversation.chat.node', turnTail: 'conversation.chat.turnTail',
      dock: 'conversation.input.dock', menu: 'sidebar.workspaces.session.menu.item', header: 'conversation.session.header.actions',
    })
    const API = Object.freeze({ events: '/api/s37/events', answer: '/api/s37/answer', manage: '/api/s37/manage' })
    /** A keyed cell renders its lowest priority; DSH's entries use the default 0. */
    const SHADOW_PRIORITY = -1
    const DEFAULT_PRIORITY = 0
    const TAGGED_TOOLS = new Set(['ask_user_question', 'exit_plan_mode'])
    const PLAN_TAG_MODE = (() => { try { return localStorage.getItem('s37.planTag') ?? 'tail' } catch { return 'tail' } })()

    const probe = (window.__s37 ??= { props: {}, events: [], planTagMode: PLAN_TAG_MODE })
    const record = (slot, props) => { probe.props[slot] ??= Object.keys(props).sort() }

    // ---- Host state (server-sent snapshots) ----
    const apiUrl = (path) => new URL(path, document.baseURI).toString()
    const state = (() => {
      let snapshot = { assistantId: null, managed: [], titles: {}, cards: [], tags: {} }
      const listeners = new Set()
      let source
      return {
        subscribe(listener) {
          listeners.add(listener)
          if (!source) {
            source = new EventSource(apiUrl(API.events))
            source.onmessage = (event) => { snapshot = JSON.parse(event.data); probe.snapshot = snapshot; for (const l of listeners) l() }
          }
          return () => listeners.delete(listener)
        },
        get: () => snapshot,
      }
    })()
    const useS37 = () => React.useSyncExternalStore(state.subscribe, state.get)
    const post = async (path, body) => {
      const response = await fetch(apiUrl(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      probe.events.push({ post: path, body, status: response.status })
      return response.ok
    }
    const titleOf = (snap, sessionId) => snap.titles[sessionId] ?? sessionId?.slice(0, 8)
    /** Started blocks carry `argsRaw`; settled result blocks keep it on their `call`. */
    const parseArgs = (block) => { try { return JSON.parse(block?.argsRaw ?? block?.call?.argsRaw ?? '{}') } catch { return {} } }

    // ---- Styles: DSH theme tokens only, so light and dark both follow DSH ----
    const CSS = `
      .s37-row{display:flex;flex-direction:column;gap:6px;padding:6px 0;font-size:13px;color:var(--dsw-alias-label-secondary,inherit)}
      .s37-row-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .s37-title{color:var(--dsw-alias-label-primary,inherit);font-weight:500}
      .s37-mono{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px;white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-module-platform,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));border-radius:8px;padding:6px 8px;margin:0}
      .s37-actions{display:flex;gap:8px;align-items:center}
      .s37-tagline{display:flex;align-items:center;gap:6px;margin:4px 0 2px;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}
      .s37-fishtag{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:12px;background:color-mix(in srgb,#EC0A6E 12%,transparent);color:light-dark(#8a0640,#ff8fc0);border:1px solid color-mix(in srgb,#EC0A6E 35%,transparent)}
      .s37-pile{margin:0 0 8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));border-radius:12px;background:var(--dsw-alias-bg-module-platform,transparent);max-height:45vh;overflow:auto}
      .s37-pile-head{position:sticky;top:0;display:flex;align-items:center;gap:8px;padding:8px 12px;font-weight:600;font-size:13px;color:var(--dsw-alias-label-primary,inherit);background:inherit;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25))}
      .s37-count{min-width:20px;padding:0 6px;border-radius:999px;background:#EC0A6E;color:#fff;font-size:12px;text-align:center}
      .s37-card{padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--dsw-alias-label-secondary,inherit)}
      .s37-card:first-of-type{border-top:none}
      .s37-quote{border-left:3px solid color-mix(in srgb,#EC0A6E 50%,transparent);padding:2px 8px;margin:0;white-space:pre-wrap}
      .s37-thread{display:flex;flex-direction:column;gap:2px;margin:0;padding-left:16px}
      .s37-note{margin:0;width:100%;box-sizing:border-box;border-radius:8px;padding:6px 8px;font:inherit;background:transparent;color:inherit;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
      .s37-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;opacity:.75}
    `
    const mountStyles = () => { const el = document.createElement('style'); el.id = 's37-styles'; el.textContent = CSS; document.head.appendChild(el); return () => el.remove() }

    // ---- 1. ask_fishball row ----
    function AllowReject({ cardId, compact }) {
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')
      const answer = async (decision) => { setBusy(true); await post(API.answer, { id: cardId, decision, note: note || undefined }); setBusy(false) }
      return h('div', { className: 's37-actions', 'data-s37-allow-reject': cardId },
        compact ? null : h('input', { className: 's37-note', placeholder: 'Note for the agent (optional, sent with Reject)', value: note, onChange: (e) => setNote(e.target.value), style: { flex: 1 } }),
        h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: busy, onClick: () => answer('allow'), 'data-s37-allow': cardId }, 'Allow once'),
        h(Button, { type: 'button', size: 'sm', variant: 'secondary', disabled: busy, onClick: () => answer('reject'), 'data-s37-reject': cardId }, 'Reject'))
    }
    function AskFishballRow(props) {
      record('tool.call.toolview[ask_fishball]', props)
      probe.askPhase = props.phase
      const snap = useS37()
      const args = parseArgs(props.block)
      const card = snap.cards.find((c) => c.callId === props.callId)
      const resultText = props.phase === 'result' ? (props.block?.content ?? props.block?.result?.content ?? []).map?.((b) => b.text).join('') : null
      return h('div', { className: 's37-row', 'data-s37-ask-row': props.callId, 'data-s37-phase': props.phase },
        h('div', { className: 's37-row-head' },
          h('span', { className: 's37-title' }, 'Asking Fishball'),
          h('span', null, `${args.tool ?? '…'} `),
          props.phase === 'start' ? h(Tag, { tone: 'warning' }, card ? 'Waiting for an answer' : 'Waiting') : null,
          props.phase === 'result' ? h(Tag, { tone: 'neutral' }, resultText || 'Answered') : null),
        args.arguments ? h('pre', { className: 's37-mono' }, JSON.stringify(args.arguments, null, 2)) : null,
        args.why ? h('div', null, 'Reason: ', args.why) : null,
        props.phase === 'start' && card ? h(AllowReject, { cardId: card.id, compact: true }) : null)
    }

    // ---- 2. Asked Fishball tags ----
    function FishballTag({ callId }) {
      const snap = useS37()
      const tag = snap.tags[callId]
      if (!tag) return null
      return h('div', { className: 's37-tagline', 'data-s37-tag': callId }, h('span', { className: 's37-fishtag' }, '🐟 Asked Fishball'), h('span', null, tag.answer))
    }
    /** The entry this one shadows: the lowest priority strictly above ours (messenger S25 pattern). */
    function nextEntry(slots, name, key) {
      let next
      for (const entry of slots.entries(name)) {
        const priority = entry.options.priority ?? DEFAULT_PRIORITY
        if (entry.options.key !== key || priority <= SHADOW_PRIORITY) continue
        if (next === undefined || priority < (next.options.priority ?? DEFAULT_PRIORITY)) next = entry
      }
      return next
    }
    function makeQuestionRow(slots) {
      return function QuestionRow(props) {
        record('tool.call.toolview[ask_user_question]', props)
        const next = nextEntry(slots, SLOT.toolview, 'ask_user_question')
        probe.questionNext = next !== undefined
        return h(React.Fragment, null, next ? h(next.component, props) : null, h(FishballTag, { callId: props.callId }))
      }
    }
    /** `node` mode: shadow the whole tool-call node; DSH's ToolCallTree still renders inside. */
    function makeToolCallNode(slots) {
      return function ToolCallNode(props) {
        record('conversation.chat.node[tool-call]', props)
        const next = nextEntry(slots, SLOT.node, 'tool-call')
        // A tool-call node's data is `{root}`: the root call block (preparing, started or result).
        const root = props.node?.data?.root
        const name = root?.name ?? root?.call?.name
        const callId = root?.callId ?? root?.call?.callId
        probe.nodeSample ??= root ? { kind: props.node.kind, rootKeys: Object.keys(root).sort(), name, callId } : null
        ;(probe.nodeRenders ??= []).push({ name, callId, hasNext: next !== undefined })
        const inner = next ? h(next.component, props) : null
        if (!TAGGED_TOOLS.has(name) || name === 'ask_user_question') return inner
        return h('div', { 'data-s37-node-wrap': callId, style: { display: 'contents' } }, inner, h(FishballTag, { callId }))
      }
    }
    /** `toolview` mode for exit_plan_mode: Fishball's own row (DSH's generic card is private). */
    function PlanRowOwn(props) {
      record('tool.call.toolview[exit_plan_mode]', props)
      const args = parseArgs(props.block)
      const title = /^#\s+(.+)$/m.exec(args.plan ?? '')?.[1] ?? 'Plan'
      return h('div', { className: 's37-row' }, h('div', { className: 's37-row-head' }, h('span', { className: 's37-title' }, 'Plan review'), h('span', null, title)), h(FishballTag, { callId: props.callId }))
    }
    /** `tail` mode: tags for the turn's plan reviews, after DSH's plan card. */
    function PlanTail(props) {
      record('conversation.chat.turnTail', props)
      const snap = useS37()
      probe.tailTurn ??= props.turn && typeof props.turn === 'object' ? { keys: Object.keys(props.turn).sort(), json: JSON.stringify(props.turn).slice(0, 400) } : { value: props.turn }
      // A tag names its session and its call's log seq; this turn owns the seqs between its start and end.
      const from = props.turn?.start?.seq ?? Infinity
      const to = props.turn?.end?.seq ?? Infinity
      const ids = Object.keys(snap.tags).filter((id) => {
        const tag = snap.tags[id]
        return tag.sessionId === props.sessionId && tag.plan && tag.seq !== null && tag.seq > from && tag.seq < to
      })
      probe.tailIds = ids
      return ids.length ? h('div', null, ids.map((id) => h(FishballTag, { key: id, callId: id }))) : null
    }

    // ---- 3. The pile ----
    function Card({ card, snap }) {
      const [open, setOpen] = React.useState(false)
      return h('div', { className: 's37-card', 'data-s37-card': card.id },
        h('div', { className: 's37-row-head' },
          h('span', { className: 's37-title' }, card.kind === 'fishball' ? 'Fishball' : titleOf(snap, card.sessionId)),
          h(Tag, { tone: card.kind === 'question' ? 'info' : 'warning' }, card.kind === 'question' ? 'Question' : 'Permission'),
          h('span', { className: 's37-mono', style: { padding: '0 6px' } }, card.tool)),
        h('pre', { className: 's37-mono' }, card.kind === 'question' ? card.question : JSON.stringify(card.arguments, null, 2)),
        card.why ? h('div', null, h('span', { className: 's37-label' }, 'Reason '), card.why) : null,
        card.note ? h('div', null, h('span', { className: 's37-label' }, 'Fishball '), card.note) : null,
        h('button', { type: 'button', onClick: () => setOpen(!open), 'aria-expanded': open, 'data-s37-details': card.id, style: { all: 'unset', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' } }, open ? 'Hide details' : 'Details'),
        open ? h('div', { 'data-s37-details-body': card.id, style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          card.quotes.length ? h('div', null, h('div', { className: 's37-label' }, 'The user asked'), card.quotes.map((q) => h('blockquote', { key: q.id, className: 's37-quote' }, q.text))) : null,
          card.thread.length ? h('div', null, h('div', { className: 's37-label' }, 'Discussion'), h('ol', { className: 's37-thread' }, card.thread.map((m, i) => h('li', { key: i }, h('b', null, m.from + ': '), m.text)))) : null) : null,
        card.kind === 'permission' || card.kind === 'fishball' ? h(AllowReject, { cardId: card.id }) : null)
    }
    function Pile(props) {
      record('conversation.input.dock', props)
      const snap = useS37()
      if (!props.sessionId || props.sessionId !== snap.assistantId || snap.cards.length === 0) return null
      return h('section', { className: 's37-pile', 'data-s37-pile': '', 'aria-label': 'Waiting for you' },
        h('div', { className: 's37-pile-head' }, 'Waiting for you', h('span', { className: 's37-count', 'data-s37-count': snap.cards.length }, snap.cards.length)),
        snap.cards.map((card) => h(Card, { key: card.id, card, snap })))
    }

    // ---- 4. Hand over / Take back ----
    const handLabel = (managed) => (managed ? 'Take back from Fishball' : 'Hand over to Fishball')
    function useHand(sessionId) {
      const snap = useS37()
      if (!sessionId || sessionId === snap.assistantId) return null
      const managed = snap.managed.includes(sessionId)
      return { managed, toggle: () => post(API.manage, { sessionId, managed: !managed }) }
    }
    function HandMenuItem(props) {
      record('sidebar.workspaces.session.menu.item', props)
      const hand = useHand(props.sessionId)
      const [, setMenuOpen] = props.useMenuOpenState?.() ?? []
      if (!hand) return null
      return h(MenuItemButton, { onSelect: () => { setMenuOpen?.(false); hand.toggle() }, 'data-s37-hand-menu': props.sessionId }, handLabel(hand.managed))
    }
    function HandHeaderAction(props) {
      record('conversation.session.header.actions', props)
      const hand = useHand(props.sessionId)
      if (!hand) return null
      return h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: hand.toggle, 'data-s37-hand-header': props.sessionId }, handLabel(hand.managed))
    }

    return {
      name: NAME,
      inject: ['slots'],
      apply(ctx) {
        probe.primitives = Object.keys(P).sort()
        // Spike-only helper: open a session by id (the build opens sessions the same way, client.js §10).
        window.__s37open = (sessionId) => ctx.get('uiWorkspace')?.openSession(sessionId)
        ctx.effect(mountStyles, 's37 styles')
        ctx.effect(() => ctx.slots.inject(SLOT.toolview, function* () {
          yield ctx.slots.register({ name: SLOT.toolview, key: 'ask_fishball', locale: 'conversation' }, AskFishballRow)
          yield ctx.slots.register({ name: SLOT.toolview, key: 'ask_user_question', priority: SHADOW_PRIORITY, locale: 'conversation' }, makeQuestionRow(ctx.slots))
          if (PLAN_TAG_MODE === 'toolview') yield ctx.slots.register({ name: SLOT.toolview, key: 'exit_plan_mode', locale: 'conversation' }, PlanRowOwn)
        }), 's37 tool views')
        if (PLAN_TAG_MODE === 'node') ctx.effect(() => ctx.slots.inject(SLOT.node, () => ctx.slots.register({ name: SLOT.node, key: 'tool-call', priority: SHADOW_PRIORITY, locale: 'conversation' }, makeToolCallNode(ctx.slots))), 's37 tool-call node')
        if (PLAN_TAG_MODE === 'tail') ctx.effect(() => ctx.slots.inject(SLOT.turnTail, () => ctx.slots.register({ name: SLOT.turnTail, id: 's37-plan-tag', locale: 'conversation' }, PlanTail)), 's37 turn tail')
        ctx.effect(() => ctx.slots.inject(SLOT.dock, () => ctx.slots.register({ name: SLOT.dock, id: 's37-pile', order: -100, locale: 'conversation' }, Pile)), 's37 pile')
        ctx.effect(() => ctx.slots.inject(SLOT.menu, () => ctx.slots.register({ name: SLOT.menu, id: 's37-hand', locale: 'conversation' }, HandMenuItem)), 's37 menu')
        ctx.effect(() => ctx.slots.inject(SLOT.header, () => ctx.slots.register({ name: SLOT.header, id: 's37-hand', locale: 'conversation' }, HandHeaderAction)), 's37 header')
      },
    }
  },
})

/**
 * The card record's browser half: one conversation definition and its chat-node view, shared by
 * every DSH session view that shows Fishball's card records (a managed session's view here, and
 * Fishball's own chat in the instance, I7). It was the connector's `./records` export (design
 * §0.2); V3 R-EMBED moved it to fishball-embed-ui with the connector's client, and the connector
 * no longer exports it (R-ARCH-03).
 *
 * It is a package-local chunk of embed-UI's client bundle, not a second bundle: DSH's client
 * module loader serves only a package's `client.js` and its `client.*.js` siblings (the
 * CLIENT_CHUNK rule of dsh-client-modules, the same in 0.2.1-rc.5 and 0.2.2-rc.1), and this
 * repository has no build step, so client.connector.js loads it with `require.async('./client.records.js')`.
 * The registration is skipped when no module loader exists (a plain Node import), so importing the
 * file outside a DSH page has no effect instead of throwing.
 *
 * The record itself (`plugin:fishball/card-record`, v1) is written by the connector row
 * (src/card-records.js, contract card-record.js); keep CARD_RECORD in step with it. DSH sends a
 * plugin record to the browser but never to the model. The node is DSH's collapsed DisclosureRow:
 * one line with the kind, the outcome, who and when; expanded, the questions or the call, the
 * answer and the note. No new chat primitive: DSH's own row, its own icons and the caller's classes.
 */
globalThis.__ModuleLoader__?.load({
  // A chunk of fishball-embed-ui's client since V3 R-EMBED (it moved here from the connector).
  id: 'fishball-embed-ui',
  chunk: 'client.records.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const { Button, DisclosureRow, IconQuestionOutlineRegular, IconShieldOutlineRegular, Input, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    /** The records part's sub-plugin (recordsPart below): its name and the client services it reads. */
    const RECORDS_PART = Object.freeze({ name: 'fishball-embed-ui: records', inject: Object.freeze(['slots', 'locale']) })

    const CARD_RECORD = Object.freeze({ type: 'plugin:fishball/card-record', version: 1, kind: 'fishball-card-record', node: 'fishball-card-record', permission: 'permission', iconPx: 14, separator: ' · ' })
    /** DSH's conversation-definition vocabulary this definition uses (dsh-client-ui-conversation). */
    const VIEW = Object.freeze({ target: 'chat', role: 'start', visible: 'visible', groupTree: 'turn', unresolved: Object.freeze({ kind: 'unresolved' }) })

    /** Who and where, as one phrase: "You · on the card", or "Fishball". A closure names no one. */
    const recordWho = (record, t) => record.by === undefined ? '' : [t('record.by.' + record.by), ...(record.place === undefined ? [] : [t('record.place.' + record.place)])].join(' ')

    const cardRecordDefinition = Object.freeze({
      kind: CARD_RECORD.kind,
      target: VIEW.target,
      match: (event) => event.type === CARD_RECORD.type && event.data?.v === CARD_RECORD.version && typeof event.data.id === 'string' ? { id: event.data.id, role: VIEW.role } : null,
      start: (_context, match) => ({ seq: match.event.seq, record: match.event.data }),
      update: (context) => context.state,
      // Outside the turn's process group ("turn"), so a record written while the turn runs is not
      // folded into its tool-call steps; at the record's own seq, so it reads where the card ended.
      buildViewNode: (context) => context.state === undefined ? null : {
        key: context.key, kind: CARD_RECORD.node, id: context.id, target: VIEW.target, anchorSeq: context.state.seq,
        location: context.start?.location ?? VIEW.unresolved, visibility: VIEW.visible, groupTree: VIEW.groupTree, data: context.state.record,
      },
    })

    /**
     * The chat node for one record.
     * @param {object} deps
     * @param {(key: string, params?: object) => string} deps.t - the caller's bound dictionary (the `record.*` keys).
     * @param {(label: string, text: string) => object} deps.labelled - the caller's "Label: text" line (plain text, never markup).
     * @param {{muted: string, recordBody: string, pre: string}} deps.classes - the caller's style classes.
     * @returns a React component taking `{node}` (DSH's chat node, whose `data` is the record).
     */
    function makeCardRecordView({ t, labelled, classes }) {
      return function FishballCardRecord({ node }) {
        const record = node.data
        const [open, setOpen] = React.useState(false)
        const questions = Array.isArray(record.questions) ? record.questions : []
        const first = questions[0]
        const title = record.own === true ? t('record.own') : t('record.' + record.kind)
        const line = [
          record.kind === CARD_RECORD.permission ? record.tool : first?.header || first?.question,
          t('record.outcome.' + record.outcome) + (record.answer ? ': ' + record.answer : ''),
          recordWho(record, t),
          new Date(record.at).toLocaleString(),
        ].filter(Boolean).join(CARD_RECORD.separator)
        const from = record.from === undefined ? null : labelled(t('record.from'), record.from.title || record.from.sessionId)
        return h(DisclosureRow, {
          icon: h(record.kind === CARD_RECORD.permission ? IconShieldOutlineRegular : IconQuestionOutlineRegular, { size: CARD_RECORD.iconPx }),
          title, collapsedContent: h('span', { className: classes.muted }, CARD_RECORD.separator + line),
          open, expandable: true, expandOnRowClick: true, onToggle: () => setOpen((value) => !value),
        }, h('div', { className: classes.recordBody, 'data-fishball-card-record': record.cardId },
          from,
          ...questions.map((item, index) => h('div', { key: index },
            h('div', null, item.header ? item.header + ': ' + item.question : item.question),
            Array.isArray(item.options) && item.options.length > 0 ? h('div', { className: classes.muted }, item.options.join(CARD_RECORD.separator)) : null)),
          record.tool ? labelled(t('record.tool'), record.tool) : null,
          record.arguments ? h('pre', { className: classes.pre, 'aria-label': t('record.arguments') }, record.arguments) : null,
          record.reason ? labelled(t('record.reason'), record.reason) : null,
          record.answer ? labelled(t('record.answer'), record.answer) : null,
          record.note ? labelled(t('record.note'), record.note) : null,
          record.closed ? labelled(t('record.closed'), record.closed) : null))
      }
    }

    /**
     * The records part (V3 U-SHELL split; U-RECORDS owns this chunk from W4): the ask_fishball row
     * in the asking session and the card records in any session view, as a client plugin over the
     * shell's kit (client.shell.js `kit`). Moved unchanged from the V2 connector client; the shell
     * starts it as a sub-plugin of its row, so a chunk that fails to load loses only this part.
     * @param kit - the shell's shared state stream, helpers, vocabulary and seats.
     */
    function recordsPart(kit) {
      const { NS, SLOT, API, CLS, PILE_LIST, MOTION_QUERY, useFishball, send } = kit

      /** The ask_fishball row (S37): DSH has no view for this tool, so this entry draws the whole row. */
      const ASK_ROW = Object.freeze({ tool: 'ask_fishball', phaseStart: 'start', phaseResult: 'result' })
      /** ask_fishball's answer codes with their own words (keep in step with src/constants.js ASK_RESULT, ASK_ERROR). */
      const ASK_CODES = new Set(['allowed', 'rejected', 'question', 'unavailable', 'over-capacity', 'no-longer-managed', 'not-user-message', 'too-large', 'expired', 'invalid-request', 'empty', 'cancelled'])
      /** Your answer on a card (src/constants.js CARD_DECISION) and refusals with their own text. */
      const CARD_DECISION = Object.freeze({ allow: 'allow', reject: 'reject' })
      const CARD_ERRORS = new Set(['expired', 'too-large', 'unavailable'])
      // ask_fishball's reason_from for Fishball's own reason (rev11-ui-fixes R3); a row from before the fix has none.
      const REASON_FROM_FISHBALL = 'fishball'
      const JSON_INDENT = 2

      /** POST your answer on a card. @returns null when accepted, else the refusal's text. */
      async function answerCard(requestId, decision, note, t) {
        const { ok, code } = await send(API.requestsAnswer, { requestId, decision, ...(note ? { note } : {}) })
        if (ok) return null
        return t(CARD_ERRORS.has(code) ? 'cardError.' + code : 'cardFailed')
      }

      /**
       * One answer in flight at a time, shared by the pile's rows, its detail and the session's row:
       * busy while it runs, then the refusal's text, or null and onDone() once it was taken.
       */
      function useSubmit() {
        const [busy, setBusy] = React.useState(false)
        const [problem, setProblem] = React.useState(null)
        const run = async (submit, onDone) => {
          setBusy(true)
          const refusal = await submit()
          setBusy(false)
          setProblem(refusal)
          if (refusal === null) onDone?.()
        }
        return { busy, problem, run }
      }

      /** A small button on a card; every card control is one of these, disabled while an answer is in flight. */
      const cardButton = (t, busy, key, variant, onClick, label) => h(Button, { key, type: 'button', size: 'sm', variant, disabled: busy, onClick }, t(label))
      const problemLine = (problem) => (problem ? h('div', { role: 'alert' }, problem) : null)

      /** How long a reveal takes now: none when you asked for less motion (DESIGN §10e animation). */
      const revealMs = () => (window.matchMedia(MOTION_QUERY).matches ? PILE_LIST.revealMs : 0)

      /**
       * Shows or hides its children with a short open/close (DESIGN §10e animation, rev11-pile-list).
       * The box grows from no height to its own (a grid row from 0fr to 1fr) while it fades in, so the
       * entries around it reflow smoothly with it; closing runs the other way, and once closed nothing
       * is drawn, not even the box. A box mounted shown opens, so new entries arrive the same way.
       * The state is drawn as data-fishball-reveal (hidden, opening, open, closing); while not shown
       * the box is inert, so a closing entry can't be clicked or focused.
       */
      function Reveal({ shown, as = 'div', className, children, ...rest }) {
        const S = PILE_LIST.reveal
        const ref = React.useRef(null)
        const [state, setState] = React.useState(S.hidden)
        React.useLayoutEffect(() => {
          if (ref.current) ref.current.inert = !shown
          const target = shown ? S.open : S.hidden
          if (state === target) return undefined
          const ms = revealMs()
          if (ms === 0) {
            setState(target)
            return undefined
          }
          const moving = shown ? S.opening : S.closing
          if (state !== moving) {
            // Lay the current size out before the change, so the browser has a size to move from.
            void ref.current?.offsetHeight
            setState(moving)
            return undefined
          }
          const timer = setTimeout(() => setState(target), ms)
          return () => clearTimeout(timer)
        }, [shown, state])
        if (state === S.hidden && !shown) return null
        return h(as, { ref, className: className ? `${CLS.reveal} ${className}` : CLS.reveal, 'data-fishball-reveal': state, 'aria-hidden': shown ? undefined : true, ...rest },
          h('div', { className: CLS.revealInner }, children))
      }

      /**
       * Allow once / Reject on one card, the same in your pile's detail and on the session's running
       * row (item 15). Both read the card from the Host's snapshot, so an answer in either place clears
       * both. Reject first opens an optional note to the agent (DESIGN §10e).
       * @param onDone - optional, called once your answer was taken (the pile's detail goes back to its list).
       */
      function CardAnswer({ requestId, t, onDone }) {
        const id = React.useId()
        const { busy, problem, run } = useSubmit()
        const [rejecting, setRejecting] = React.useState(false)
        const [note, setNote] = React.useState('')
        const answer = (decision) => run(() => answerCard(requestId, decision, decision === CARD_DECISION.reject ? note.trim() : '', t), onDone)
        const button = (key, variant, onClick, label) => cardButton(t, busy, key, variant, onClick, label)
        return h('div', { className: CLS.grow, 'data-fishball-card-answer': requestId },
          h(Reveal, { shown: rejecting }, h('div', { className: CLS.field },
            h('label', { htmlFor: id, className: CLS.muted }, t('rejectNote')),
            h(Input, { id, value: note, onChange: (event) => setNote(event.target.value) }))),
          h('div', { className: CLS.actions },
            button('allow', 'primary', () => void answer(CARD_DECISION.allow), 'allowOnce'),
            rejecting ? button('send', 'secondary', () => void answer(CARD_DECISION.reject), 'rejectSend') : button('reject', 'secondary', () => setRejecting(true), 'reject'),
            rejecting ? button('cancel', 'ghost', () => { setRejecting(false); setNote('') }, 'cancel') : null),
          problemLine(problem))
      }

      /** A labelled line of text from another session or from Fishball (plain text, never markup: §10c framing rule). */
      const labelled = (label, text) => h('div', null, h('span', { className: CLS.muted }, label + ': '), text)

      /** An ask_fishball call's arguments: a started block keeps them in argsRaw, a settled one on its call (S37). */
      function askArguments(block) {
        try {
          const value = JSON.parse(block?.argsRaw ?? block?.call?.argsRaw ?? '{}')
          return value !== null && typeof value === 'object' ? value : {}
        } catch { return {} }
      }

      /** A settled call's answer: the JSON ask_fishball returned ({ value }), or its text ({ text }), e.g. an aborted call. */
      function askResult(block) {
        const content = block?.content ?? block?.result?.content
        const text = Array.isArray(content) ? content.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('') : ''
        try {
          const value = JSON.parse(text)
          if (value !== null && typeof value === 'object' && typeof value.code === 'string') return { value }
        } catch { /* not ask_fishball's JSON: shown as text */ }
        return { text }
      }

      /**
       * The running ask_fishball row in the asking session (DESIGN §10e, S37). DSH has no view for this
       * tool, so this entry is the whole row: what is asked, whether it waits for Fishball or for you,
       * and Allow once / Reject once the request is your card (Reading: not while Fishball decides).
       */
      function makeAskRow(t) {
        return function FishballAskRow({ callId, phase, block }) {
          const state = useFishball()
          const args = askArguments(block)
          const card = phase === ASK_ROW.phaseStart ? (state.pile ?? []).find((entry) => entry.callId === callId) : undefined
          const replying = typeof args.request_id === 'string'
          const result = phase === ASK_ROW.phaseResult ? askResult(block) : null
          const code = result?.value?.code
          return h('div', { className: CLS.askRow, 'data-fishball-ask-row': callId, 'data-fishball-phase': phase },
            h('div', { className: CLS.cardHead },
              h('span', { className: CLS.title }, t(replying ? 'askRowReply' : 'askRowTitle')),
              typeof args.tool === 'string' ? h('span', { className: CLS.code }, args.tool) : null,
              phase === ASK_ROW.phaseStart ? h(Tag, { tone: card ? 'danger' : 'info' }, t(card ? 'askRowWaitingYou' : 'askRowWaitingFishball')) : null,
              code !== undefined ? h(Tag, { tone: 'neutral' }, ASK_CODES.has(code) ? t('askResult.' + code) : code) : null),
            args.arguments !== undefined ? h('pre', { className: CLS.pre }, JSON.stringify(args.arguments, null, JSON_INDENT)) : null,
            typeof args.why === 'string' && args.why ? labelled(t('cardReason'), args.why) : null,
            replying && typeof args.reply === 'string' ? h('div', null, args.reply) : null,
            // Fishball's reject reason carries the pile card's Fishball label; your own Reject note, and a
            // row from before reason_from, keep Reason (rev11-ui-fixes R3).
            typeof result?.value?.reason === 'string' ? labelled(t(result.value.reason_from === REASON_FROM_FISHBALL ? 'cardFishballNote' : 'cardReason'), result.value.reason) : null,
            typeof result?.value?.question === 'string' ? labelled(t('cardFishballNote'), result.value.question) : null,
            result?.text ? h('div', { className: CLS.muted }, result.text) : null,
            card ? h(CardAnswer, { requestId: card.requestId, t }) : null)
        }
      }


      return {
        name: RECORDS_PART.name,
        inject: RECORDS_PART.inject,
        apply(ctx) {
          const t = ctx.locale.bind(NS)
          ctx.effect(() => ctx.slots.inject(SLOT.toolview, () => ctx.slots.register({ name: SLOT.toolview, key: ASK_ROW.tool, locale: NS }, makeAskRow(t))), 'fishball: ask_fishball row')
          // Card records in any DSH session view. The uiConversation service is read on demand, so an
          // older DSH without it keeps working.
          // The definition and view are this chunk's own, so they arrive with this part.
          ctx.inject(['uiConversation'], (scope) => {
            scope.effect(() => scope.uiConversation.events.register(cardRecordDefinition), 'fishball: card record definition')
          })
          const CardRecord = makeCardRecordView({ t, labelled, classes: { muted: CLS.muted, recordBody: CLS.recordBody, pre: CLS.pre } })
          ctx.effect(() => ctx.slots.inject(SLOT.chatNode, () => ctx.slots.register({ name: SLOT.chatNode, key: CARD_RECORD.node, locale: NS }, CardRecord)), 'fishball: card record row')
        },
      }
    }

    module.exports = { CARD_RECORD, cardRecordDefinition, makeCardRecordView, recordsPart }
    return module.exports
  },
})

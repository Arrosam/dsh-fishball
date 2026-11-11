/**
 * The card record's browser half: one conversation definition and its chat-node view, shared by
 * every DSH session view that shows Fishball's card records (a managed session's view here, and
 * Fishball's own chat in the instance, I7). It is the connector's `./records` export (design §0.2).
 *
 * It is a package-local chunk of the connector's client bundle, not a second bundle: DSH's client
 * module loader serves only a package's `client.js` and its `client.*.js` siblings (the
 * CLIENT_CHUNK rule of dsh-client-modules, the same in 0.2.1-rc.5 and 0.2.2-rc.1), and this
 * repository has no build step, so client.js loads it with `require.async('./client.records.js')`.
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
  id: 'fishball-connector',
  chunk: 'client.records.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const { DisclosureRow, IconQuestionOutlineRegular, IconShieldOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

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

    module.exports = { CARD_RECORD, cardRecordDefinition, makeCardRecordView }
    return module.exports
  },
})

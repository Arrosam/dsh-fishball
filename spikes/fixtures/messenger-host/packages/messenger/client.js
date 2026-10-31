/**
 * S24b/S25/S26 fixture messenger browser half (as packages/messenger/client.js would be).
 * Pass 2 (S25): Fishball-only rows. Each occupant mirrors the shipped entry's registration
 * options (locale, inject, children) so it receives the same props; for any session but the
 * assistant it renders the shipped component unchanged, and for the assistant it wraps the
 * shipped component in a bubble with an author taken from the row's source.
 * window.__s25 records registration errors and which path each row took.
 */
window.__ModuleLoader__.load({
  id: 'fishball-spike-messenger',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const SLOT = 'conversation.chat.node'
    const KINDS = ['user', 'steering', 'context', 'turn-trigger', 'assistant-step']
    const log = (what) => { (window.__s24 ??= []).push(what) }
    let assistantId = null
    fetch('api/fishball-spike/state', { cache: 'no-store' }).then((r) => r.json()).then((s) => { assistantId = s.sessionId })

    function authorOf(kind, data) {
      if (kind === 'assistant-step') return 'Fishball'
      const source = data?.source ?? {}
      if (source.author?.name) return source.author.name
      if (source.kind === 'agent-message') return 'session ' + String(source.senderSessionId).slice(8, 16)
      if (source.kind === 'user') return 'You'
      return String(source.kind ?? 'unknown')
    }
    function makeRow(slots, kind, self) {
      return function Row(props) {
        // The shipped entry for this key: the live one that is not ours.
        const shipped = slots.entries(SLOT).find((e) => e.options.key === kind && e !== self.entry)
        const stats = (window.__s25.paths[kind] ??= { shipped: 0, bubble: 0, missing: 0 })
        if (shipped === undefined) { stats.missing++; return null }
        const inner = h(shipped.component, props)
        if (props.sessionId !== assistantId) { stats.shipped++; return inner }
        stats.bubble++
        const mine = props.node?.data?.source?.kind === 'user'
        return h('div', { 'data-s25-bubble': kind, 'data-s25-author': authorOf(kind, props.node?.data), style: { margin: '6px 0', padding: '6px 10px', borderRadius: 14, border: '2px solid ' + (mine ? '#3b82f6' : '#e11d74'), marginLeft: mine ? '20%' : 0, marginRight: mine ? 0 : '20%' } },
          h('div', { style: { fontSize: 11, fontWeight: 600, opacity: 0.8 } }, authorOf(kind, props.node?.data)), inner)
      }
    }
    return {
      name: 'fishball-spike-messenger',
      inject: ['slots'],
      apply(ctx) {
        log('messenger: applied')
        window.__s25 = { slots: ctx.slots, ctx, require, paths: {}, errors: [] }
        ctx.effect(() => () => log('messenger: disposed'), 'spike messenger marker')
        ctx.effect(() => ctx.slots.inject(SLOT, function* () {
          for (const kind of KINDS) {
            const shipped = ctx.slots.entries(SLOT).find((e) => e.options.key === kind && e.options.priority === undefined)
            const self = {}
            const options = { name: SLOT, key: kind, priority: -1 }
            if (shipped?.locale !== undefined) options.locale = shipped.locale
            if (shipped?.inject !== undefined) options.inject = shipped.inject
            if (shipped?.children !== undefined) options.children = shipped.children
            try {
              const dispose = ctx.slots.register(options, makeRow(ctx.slots, kind, self))
              self.entry = ctx.slots.entries(SLOT).find((e) => e.options.key === kind && e.options.priority === -1)
              yield dispose
            } catch (error) { window.__s25.errors.push(kind + ': ' + error.message) }
          }
        }), 'spike messenger rows')
        ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 's24-mark', order: 99 }, () => h('span', { 'data-s24-messenger': '' }, 'M'))), 'spike messenger header mark')
      },
    }
  },
})

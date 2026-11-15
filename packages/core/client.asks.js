/**
 * Fishball's ask cards, browser half (task F-ASKCARD; R-FB-11, R-UI-12; Q-U2; Q3 = A). A
 * package-local chunk of core's own client, beside client.js: DSH serves only flat
 * `client.<name>.js` chunks (the CLIENT_CHUNK rule, both SDKs), so it cannot live in `ui/asks/`.
 * F-WIRE (W4b) starts `asksPlugin` from client.js as a sub-plugin, as it starts the settings panel;
 * F-UI later moves it to fishball-ui with the rest of the page.
 *
 * It runs only where core runs, the Fishball DSH (hosted child or standalone), so the main DSH never
 * shows a card (Q-U2). Inside it, a card is drawn in the manager's conversation only: DSH's
 * session-scoped `conversation.input.dock` list, above the composer, for the session whose id the
 * card stream names as the manager's. Every other session draws nothing.
 *
 * The state is the server half's (src/asks/): the stream route sends `{managerSessionId, cards}`
 * and the answer route commits once. A card shows the asking session, its question and Allow /
 * Reject with an optional reason; an answered or closed card shows its state, with no control, and
 * the server refuses a late answer anyway.
 *
 * The words are the slim page's current approval wording (src/slim/ui/i18n.js, en and zh), restated
 * because a chunk cannot import that module; the zh review is deferred by the user, so they are not
 * reworded here.
 */
globalThis.__ModuleLoader__?.load({
  id: 'fishball-core',
  chunk: 'client.asks.js',
  factory(require) {
    const React = require('react')
    const { Button, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const ASKS_UI = Object.freeze({
      name: 'fishball-core: asks',
      locale: 'fishball-asks',
      slot: 'conversation.input.dock',
      id: 'fishball-asks',
      // Before DSH's own queue dock (order 20), so an open card is the first thing above the composer.
      order: 10,
      // Page-relative, as src/asks/constants.js ASK_ROUTE (without its leading `/`).
      events: 'api/fishball/asks/events',
      answer: 'api/fishball/asks/answer',
      jsonHeaders: Object.freeze({ 'content-type': 'application/json' }),
      state: Object.freeze({ open: 'open', answered: 'answered', closed: 'closed' }),
      css: Object.freeze({ id: 'fishball-asks-style', root: 'fb-asks', card: 'fb-ask-card', meta: 'fb-ask-meta', question: 'fb-ask-question', row: 'fb-ask-row', reason: 'fb-ask-reason', error: 'fb-ask-error' }),
      tone: Object.freeze({ open: 'info', done: 'neutral' }),
      reasonRows: 2,
    })

    const en = {
      waiting: 'Fishball is waiting for your answer',
      from: 'From',
      'choice.allow': 'Allow once',
      'choice.reject': 'Reject',
      reason: 'Reason',
      'state.answered': 'answered',
      'state.closed': 'closed',
      failed: 'The answer was refused.',
    }
    const zh = {
      waiting: 'Fishball 正在等你回答',
      from: '来自',
      'choice.allow': '允许一次',
      'choice.reject': '拒绝',
      reason: '理由',
      'state.answered': '已回答',
      'state.closed': '已关闭',
      failed: '回答被拒绝。',
    }

    const css = [
      `.${ASKS_UI.css.root}{display:grid;gap:8px;margin:0 0 8px}`,
      `.${ASKS_UI.css.card}{display:grid;gap:6px;padding:10px 12px;border:1px solid var(--dsw-alias-separator-primary);border-radius:8px;background:var(--dsw-alias-background-secondary);font:var(--dsw-font-xs-13)}`,
      `.${ASKS_UI.css.meta}{display:flex;align-items:center;flex-wrap:wrap;gap:6px;color:var(--dsw-alias-label-tertiary)}`,
      `.${ASKS_UI.css.question}{margin:0;white-space:pre-wrap;color:var(--dsw-alias-label-primary)}`,
      `.${ASKS_UI.css.row}{display:flex;align-items:center;flex-wrap:wrap;gap:8px}`,
      `.${ASKS_UI.css.reason}{width:100%;box-sizing:border-box;resize:vertical;font:inherit}`,
      `.${ASKS_UI.css.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')

    function mountStyle() {
      const style = document.createElement('style')
      style.id = ASKS_UI.css.id
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    const apiUrl = (path) => new URL(path, document.baseURI).toString()

    /** One shared stream for every mounted dock; reconnects by itself (EventSource). */
    function cardStream() {
      let snapshot = Object.freeze({ managerSessionId: null, cards: Object.freeze([]) })
      const listeners = new Set()
      let source
      const open = () => {
        source = new EventSource(apiUrl(ASKS_UI.events))
        source.onmessage = (message) => {
          try { snapshot = Object.freeze(JSON.parse(message.data)) } catch { return }
          for (const listener of [...listeners]) listener()
        }
      }
      return {
        get: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          if (source === undefined) open()
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0 && source !== undefined) { source.close(); source = undefined }
          }
        },
      }
    }

    function makeDock(stream, t) {
      /** One card: the asking session, the question, and Allow / Reject with an optional reason. */
      function AskCard({ card }) {
        const [reason, setReason] = React.useState('')
        const [sending, setSending] = React.useState(false)
        const [failed, setFailed] = React.useState(false)
        const open = card.state === ASKS_UI.state.open
        const send = async (choice) => {
          setSending(true)
          setFailed(false)
          let ok = false
          try {
            const response = await fetch(apiUrl(ASKS_UI.answer), { method: 'POST', headers: ASKS_UI.jsonHeaders, body: JSON.stringify({ approvalId: card.approvalId, choice, text: reason }) })
            ok = (await response.json())?.ok === true
          } catch { ok = false }
          setSending(false)
          // A refusal that closed the card arrives on the stream; any other leaves it answerable.
          if (!ok) setFailed(true)
        }
        return h('div', { className: ASKS_UI.css.card, 'data-fishball-ask': card.approvalId, 'data-fishball-ask-state': card.state },
          h('div', { className: ASKS_UI.css.meta },
            h(Tag, { tone: open ? ASKS_UI.tone.open : ASKS_UI.tone.done }, open ? t('waiting') : t('state.' + card.state)),
            h('span', null, t('from') + ': ' + (card.sessionTitle ?? card.sessionId)),
            h('span', null, new Date(card.askedAt).toLocaleString())),
          h('p', { className: ASKS_UI.css.question }, card.question),
          open ? h('textarea', {
            className: ASKS_UI.css.reason, rows: ASKS_UI.reasonRows, value: reason, placeholder: t('reason'), 'aria-label': t('reason'),
            disabled: sending, onChange: (event) => setReason(event.target.value),
          }) : null,
          open ? h('div', { className: ASKS_UI.css.row },
            card.choices.map((choice) => h(Button, {
              key: choice, type: 'button', size: 'sm', variant: choice === card.choices[0] ? 'primary' : 'outline',
              disabled: sending, 'data-fishball-ask-choice': choice, onClick: () => send(choice),
            }, t('choice.' + choice)))) : null,
          failed ? h('p', { className: ASKS_UI.css.error, role: 'alert' }, t('failed')) : null)
      }

      return function FishballAsks({ sessionId }) {
        const { managerSessionId, cards } = React.useSyncExternalStore(stream.subscribe, stream.get)
        // Only Fishball's own conversation shows its cards (Q-U2: never another session's view).
        if (sessionId === undefined || sessionId !== managerSessionId || cards.length === 0) return null
        return h('div', { className: ASKS_UI.css.root, 'data-fishball-asks': true }, cards.map((card) => h(AskCard, { key: card.approvalId, card })))
      }
    }

    function apply(ctx) {
      const t = ctx.locale.bind(ASKS_UI.locale)
      const stream = cardStream()
      ctx.effect(() => ctx.locale.register(ASKS_UI.locale, { en, zh }), 'fishball asks: dictionaries')
      ctx.effect(mountStyle, 'fishball asks: styles')
      ctx.effect(() => ctx.slots.inject(ASKS_UI.slot, () => ctx.slots.register({
        name: ASKS_UI.slot, id: ASKS_UI.id, order: ASKS_UI.order, locale: ASKS_UI.locale,
        inject: (sessionId) => ({ sessionId }),
      }, makeDock(stream, t))), 'fishball asks: card dock')
    }

    return { asksPlugin: Object.freeze({ name: ASKS_UI.name, inject: ['slots', 'locale'], apply }) }
  },
})

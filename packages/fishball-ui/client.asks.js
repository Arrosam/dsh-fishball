/**
 * Fishball's ask cards, browser half (task F-ASKCARD; R-FB-11, R-UI-12; Q-U2; Q3 = A). A
 * package-local chunk of fishball-ui's client, beside client.js: DSH serves only flat
 * `client.<name>.js` chunks (the CLIENT_CHUNK rule, both SDKs). fishball-ui's client.js starts
 * `asksPart` as a sub-plugin. F-UI moved it here from core: the card store and its routes stay
 * core's (src/asks/), the drawing is fishball-ui's (R-FB-14).
 *
 * It runs only where fishball-ui runs beside core, the Fishball DSH (hosted child or standalone),
 * so the main DSH never shows a card (Q-U2). Inside it, a card is drawn in the manager's
 * conversation only: DSH's session-scoped `conversation.input.dock` list, above the composer, for
 * the session whose id the card stream names as the manager's. Every other session draws nothing.
 *
 * The state is the server half's (src/asks/): the stream route sends `{managerSessionId, cards}`
 * and the answer route commits once. A card shows the asking session, its question, the call's
 * arguments and the session's reason when the request carries them (the user, 2026-11-17), and the
 * card's choices (Allow / Reject, or Reject alone for incomplete arguments) with an optional reason; an answered or closed card shows its state, with no control, and
 * the server refuses a late answer anyway.
 *
 * The words are the approval wording of the earlier Fishball page (en and zh), kept as they were;
 * the zh review is deferred by the user, so they are not reworded here.
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  chunk: 'client.asks.js',
  factory(require) {
    const React = require('react')
    const { Button, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const ASKS_UI = Object.freeze({
      name: 'fishball-ui: asks',
      locale: 'fishball-asks',
      slot: 'conversation.input.dock',
      id: 'fishball-asks',
      // Before DSH's own docks in this slot (todo 0, goal 10, queue 20, both SDKs), so an open card
      // is the first thing above the composer.
      order: -10,
      // Core's published routes and card states, restated because fishball-ui imports nothing of
      // core (Q-G2): core's src/asks/constants.js ASK_ROUTE paths without their leading `/`
      // (page-relative), and CARD_STATE.
      events: 'api/fishball/asks/events',
      answer: 'api/fishball/asks/answer',
      jsonHeaders: Object.freeze({ 'content-type': 'application/json' }),
      state: Object.freeze({ open: 'open', answered: 'answered', closed: 'closed' }),
      css: Object.freeze({ id: 'fishball-asks-style', root: 'fb-asks', card: 'fb-ask-card', meta: 'fb-ask-meta', from: 'fb-ask-from', time: 'fb-ask-time', body: 'fb-ask-body', question: 'fb-ask-question', detail: 'fb-ask-detail', label: 'fb-ask-label', args: 'fb-ask-args', row: 'fb-ask-row', reason: 'fb-ask-reason', error: 'fb-ask-error' }),
      // K1's ARGUMENTS_STATUS word for whole arguments (core's AskCard.argumentsStatus, ask-card.d.ts).
      argumentsComplete: 'complete',
      // DSH's Tag tones: an open card sits in the approval card's warn band; a finished one is quiet.
      tone: Object.freeze({ open: 'warning', done: 'neutral' }),
      reasonRows: 2,
      /**
       * UI-FIX-F: the reason box's placeholder ink. DSH's own input placeholder token
       * (`--dsw-alias-label-dimmed`) is 1.26:1 on the box's layer-3 fill in both themes, so the hint
       * could not be read. The secondary label is 5.8:1 (light) and 8.0:1 (dark) there, past WCAG
       * AA's 4.5:1; tertiary would be 3.7:1 in light. Typed text stays primary, so it still reads as
       * a hint. The rule also sets `opacity:1`: a browser that dims placeholders by default (Firefox
       * draws them at 54%) would otherwise undo the ratio.
       */
      placeholderInk: '--dsw-alias-label-secondary',
      /**
       * R-FIX-FUI: the Intl locale a card's time is written in, per page language (kit `useLang`), as
       * DSH's own schedule copy names one per language; the browser's time zone is kept.
       */
      timeLocale: Object.freeze({ en: 'en', zh: 'zh-CN' }),
    })

    const en = {
      waiting: 'Fishball is waiting for your answer',
      from: 'From',
      'choice.allow': 'Allow once',
      'choice.reject': 'Reject',
      reason: 'Reason',
      'detail.arguments': 'Arguments',
      'detail.reason': 'The session\'s reason',
      'detail.incomplete': 'The arguments are incomplete, so this request can only be rejected.',
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
      'detail.arguments': '参数',
      'detail.reason': '会话给出的理由',
      'detail.incomplete': '参数不完整，因此只能拒绝此请求。',
      'state.answered': '已回答',
      'state.closed': '已关闭',
      failed: '回答被拒绝。',
    }

    // UI-POLISH-F: the layout of DSH's own approval card (dsh-client-ui-approval, both SDKs): a warn
    // band naming who asks, the question as the headline, the details, and the choices at the end.
    // An answered or closed card keeps only the band and the question, muted.
    const openCard = `[data-fishball-ask-state="${ASKS_UI.state.open}"]`
    const css = [
      // The warn stroke is an overlay above the children, so the opaque band cannot paint over it.
      `.${ASKS_UI.css.card}{position:relative}`,
      `.${ASKS_UI.css.card}${openCard}::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px var(--dsw-alias-state-warn-secondary);pointer-events:none}`,
      `.${ASKS_UI.css.card}:not(${openCard}){color:var(--dsw-alias-label-secondary)}`,
      `.${ASKS_UI.css.meta}{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 16px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}`,
      // Only the Tag carries the warn colour: warn text on the warn band is too faint to read.
      `.${ASKS_UI.css.card}${openCard} .${ASKS_UI.css.meta}{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-secondary)}`,
      `.${ASKS_UI.css.from}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
      `.${ASKS_UI.css.time}{margin-left:auto;white-space:nowrap}`,
      `.${ASKS_UI.css.body}{display:grid;gap:8px;padding:12px 16px 14px}`,
      `.${ASKS_UI.css.question}{margin:0;white-space:pre-wrap;font:var(--dsw-font-s-strong-14);color:var(--dsw-alias-label-primary)}`,
      `.${ASKS_UI.css.card}:not(${openCard}) .${ASKS_UI.css.question}{font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-secondary)}`,
      `.${ASKS_UI.css.detail}{margin:0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}`,
      `.${ASKS_UI.css.label}{margin:0 0 4px;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-tertiary)}`,
      // The arguments wrap at spaces first and split a token only when it is longer than the line
      // (`overflow-wrap:anywhere`, UI-FIX-F): `word-break:break-all` cut `--runInBand` mid-word at 390px.
      `.${ASKS_UI.css.args}{margin:0;max-height:12em;overflow:auto;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-module-platform);font:var(--dsw-font-xxs-12);font-family:var(--ds-font-family-code, monospace);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${ASKS_UI.css.row}{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}`,
      // The input look of DSH's settings fields (SettingsValueField, both SDKs).
      `.${ASKS_UI.css.reason}{width:100%;box-sizing:border-box;resize:vertical;padding:6px 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13)}`,
      `.${ASKS_UI.css.reason}::placeholder{color:var(${ASKS_UI.placeholderInk});opacity:1}`,
      `.${ASKS_UI.css.reason}:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:-1px}`,
      `.${ASKS_UI.css.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')

    const apiUrl = (path) => new URL(path, document.baseURI).toString()

    /**
     * One shared stream for every mounted dock (kit `liveStream`: EventSource retries by itself, and
     * the kit marks the cached cards stale meanwhile, R-FIX-FUI). A frame that is not the route's
     * shape keeps the last good snapshot.
     */
    const cardStream = (kit) => kit.liveStream({
      url: () => apiUrl(ASKS_UI.events),
      valid: (next) => next !== null && typeof next === 'object' && Array.isArray(next.cards),
      initial: Object.freeze({ managerSessionId: null, cards: Object.freeze([]) }),
    })

    function makeDock(ctx, stream, kit) {
      /** One card: the asking session, the question, and Allow / Reject with an optional reason. */
      function AskCard({ card, t, stale, timeLocale }) {
        const [reason, setReason] = React.useState('')
        const [sending, setSending] = React.useState(false)
        const [failed, setFailed] = React.useState(false)
        const open = card.state === ASKS_UI.state.open
        // A card from a stream that is not live may be answered or closed already: no control acts
        // on it until a fresh frame (R-FIX-FUI). Core still refuses a late answer anyway.
        const locked = sending || stale
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
        return h('div', { className: [kit.css.card, ASKS_UI.css.card].join(' '), 'data-fishball-ask': card.approvalId, 'data-fishball-ask-state': card.state },
          h('div', { className: ASKS_UI.css.meta },
            h(Tag, { tone: open ? ASKS_UI.tone.open : ASKS_UI.tone.done }, open ? t('waiting') : t('state.' + card.state)),
            h('span', { className: ASKS_UI.css.from }, t('from') + ': ' + (card.sessionTitle ?? card.sessionId)),
            h('span', { className: ASKS_UI.css.time }, new Date(card.askedAt).toLocaleString(timeLocale))),
          h('div', { className: ASKS_UI.css.body },
            h('p', { className: ASKS_UI.css.question }, card.question),
            // The user, 2026-11-17: "Show arguments and reason". Plain text children: React escapes them.
            card.arguments == null ? null : h('div', { 'data-fishball-ask-arguments': true },
              h('p', { className: ASKS_UI.css.label }, t('detail.arguments')),
              h('pre', { className: ASKS_UI.css.args }, card.arguments)),
            card.reason == null ? null : h('p', { className: ASKS_UI.css.detail, 'data-fishball-ask-reason': true }, t('detail.reason') + ': ' + card.reason),
            open && card.argumentsStatus != null && card.argumentsStatus !== ASKS_UI.argumentsComplete
              ? h('p', { className: ASKS_UI.css.detail, 'data-fishball-ask-incomplete': true }, t('detail.incomplete')) : null,
            open ? h('textarea', {
              className: ASKS_UI.css.reason, rows: ASKS_UI.reasonRows, value: reason, placeholder: t('reason'), 'aria-label': t('reason'),
              disabled: locked, onChange: (event) => setReason(event.target.value),
            }) : null,
            open ? h('div', { className: ASKS_UI.css.row },
              card.choices.map((choice) => h(Button, {
                key: choice, type: 'button', size: 'sm', variant: choice === card.choices[0] ? 'primary' : 'outline',
                disabled: locked, 'data-fishball-ask-choice': choice, onClick: () => send(choice),
              }, t('choice.' + choice)))) : null,
            failed && open ? h('p', { className: ASKS_UI.css.error, role: 'alert' }, t('failed')) : null))
      }

      // `t` is the slot's own locale prop (registered with `locale`), so a language switch re-renders
      // the dock, as DSH's goal and queue docks are drawn.
      return function FishballAsks({ sessionId, t }) {
        const lang = kit.useLang(ctx)
        const { frame: { managerSessionId, cards }, health } = React.useSyncExternalStore(stream.subscribe, stream.get)
        // Only Fishball's own conversation shows its cards (Q-U2: never another session's view).
        if (sessionId === undefined || sessionId !== managerSessionId || cards.length === 0) return null
        const stale = health !== kit.HEALTH.live
        return h('div', { className: [kit.css.dock, ASKS_UI.css.root].join(' '), 'data-fishball-asks': true, 'data-fishball-asks-stale': stale ? health : undefined },
          stale ? h('div', { className: kit.css.card }, h(kit.StreamNotice, { health, lang })) : null,
          cards.map((card) => h(AskCard, { key: card.approvalId, card, t, stale, timeLocale: ASKS_UI.timeLocale[lang] })))
      }
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function asksPart(kit) {
      function apply(ctx) {
        const stream = cardStream(kit)
        ctx.effect(() => ctx.locale.register(ASKS_UI.locale, { en, zh }), 'fishball asks: dictionaries')
        ctx.effect(() => kit.mountStyle(ASKS_UI.css.id, css), 'fishball asks: styles')
        ctx.effect(() => ctx.slots.inject(ASKS_UI.slot, () => ctx.slots.register({
          name: ASKS_UI.slot, id: ASKS_UI.id, order: ASKS_UI.order, locale: ASKS_UI.locale,
          inject: (sessionId) => ({ sessionId }),
        }, makeDock(ctx, stream, kit))), 'fishball asks: card dock')
      }
      return Object.freeze({ name: ASKS_UI.name, inject: ['slots', 'locale'], apply })
    }

    return { asksPart }
  },
})

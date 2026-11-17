/**
 * The Fishball page's status strip, browser half (F-WIRE; design §5a.2, §6.3a steps 1–2; R-FB-03,
 * R-FB-04, R-FB-09, R-FB-10). A package-local chunk of fishball-ui's client (DSH serves only flat
 * `client.<name>.js` chunks, CLIENT_CHUNK, both SDKs); client.js starts `stripPart`.
 *
 * It draws what fishball-ui's Node row serves (src/status/route.js: `stripView` of core's status
 * snapshot, one SSE frame per change), as a status card above the composer in DSH's
 * `conversation.input.dock` slot (UI-POLISH-F: a heading row with the state's dot, badge, the
 * contributed-tools chip and the control; the other lines below it), and its one control: Connect
 * or Cancel, which call core's own
 * Connect routes (K3a: fishball-ui draws through core's routes). Connect opens the approval page in
 * a new tab with no link back to this page, and also shows it as a link, as core's settings page
 * does (a browser may block an open after an await unnoticed). The strip holds no state of its own.
 * When the stream is lost (R-FIX-FUI) the card stops showing the last frame's state: it marks itself
 * stale, says so, and offers Reconnect once EventSource gave up.
 * In a Fishball DSH the page shows only the manager's conversation, so the dock draws for any session.
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  chunk: 'client.strip.js',
  factory(require) {
    const React = require('react')
    const { Button, StateDot, Tag, Tooltip, IconCordisPluginOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /**
     * The connected badge's ink (UI-FIX-F), DSH tokens only. DSH's success Tag draws
     * `--dsw-alias-state-success-primary` (#22c55e in both themes) on a 10% tint of itself: 2.0:1 in
     * the light theme, and the tint is 1.1:1 (light) / 1.2:1 (dark) against the heading row, so
     * neither the word nor the badge's edge could be seen. Half the success colour, half the theme's
     * primary label, darkens it in light and lightens it in dark: the word is 5.7:1 (light) and
     * 6.8:1 (dark) on the badge (WCAG AA 4.5:1), and the same ink as a 1px outline is 6.2:1 / 8.0:1
     * against the heading row (non-text 3:1). It stays green.
     */
    const SUCCESS_INK = 'color-mix(in srgb,var(--dsw-alias-state-success-primary) 50%,var(--dsw-alias-label-primary))'
    const STRIP = Object.freeze({
      name: 'fishball-ui: strip',
      slot: 'conversation.input.dock',
      id: 'fishball-strip',
      // Before the ask cards (-10) and DSH's own docks (0, 10, 20): the status first.
      order: -20,
      // fishball-ui's route (src/status/route.js STRIP_ROUTE.path) and core's Connect routes
      // (core src/settings/constants.js CONNECT_ROUTE), page-relative; restated: a chunk imports no module.
      events: 'api/fishball/strip',
      langParameter: 'lang',
      lang: Object.freeze({ en: 'en' }),
      connect: 'api/fishball/connect',
      cancel: 'api/fishball/connect/cancel',
      press: Object.freeze({ method: 'POST', credentials: 'same-origin', cache: 'no-store' }),
      // `SEAM_STATUS.control` and the `approval-url` ConnectBegin outcome (K3a connect.d.ts).
      action: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
      approvalOutcome: 'approval-url',
      webSchemes: Object.freeze(['https:', 'http:']),
      open: Object.freeze({ target: '_blank', features: 'noopener', rel: 'noopener noreferrer' }),
      css: Object.freeze({
        id: 'fishball-strip-style', root: 'fb-strip', card: 'fb-strip-card', head: 'fb-strip-head', title: 'fb-strip-title',
        aside: 'fb-strip-aside', chip: 'fb-strip-chip', body: 'fb-strip-body', line: 'fb-strip-line', link: 'fb-strip-link',
        badge: 'fb-strip-badge',
      }),
      /** `stripView`'s tools line kind (src/status/index.js `STRIP_KIND.tools`): drawn as the chip, not a line. */
      toolsKind: 'contributed-tools',
      /**
       * The card's look per `card.state` (src/status/text.js `CARD`): DSH's Tag tone and StateDot
       * state. A state this chunk does not know draws as failed, as `stripView` itself does.
       */
      // `accent`: the state's colour token, tinting the heading row; quiet states have none.
      // `ink`: the badge's text and outline colour where DSH's Tag tone alone is too faint (UI-FIX-F,
      // `SUCCESS_INK` above); null keeps the Tag's own look.
      tone: Object.freeze({
        connected: Object.freeze({ tag: 'success', dot: 'done', accent: '--dsw-alias-state-success-primary', ink: SUCCESS_INK }),
        unset: Object.freeze({ tag: 'neutral', dot: 'idle', accent: null, ink: null }),
        disconnected: Object.freeze({ tag: 'outline', dot: 'idle', accent: null, ink: null }),
        connecting: Object.freeze({ tag: 'info', dot: 'ongoing', accent: '--dsw-alias-state-business-primary', ink: null }),
        attention: Object.freeze({ tag: 'warning', dot: 'warning', accent: '--dsw-alias-state-warn-primary', ink: null }),
        failed: Object.freeze({ tag: 'danger', dot: 'error', accent: '--dsw-alias-state-error-primary', ink: null }),
        off: Object.freeze({ tag: 'neutral', dot: 'idle', accent: null, ink: null }),
      }),
      tooltip: Object.freeze({ side: 'top', portal: true }),
      fallbackTone: 'failed',
      /**
       * The look of a card whose stream is not live (R-FIX-FUI): the quiet `disconnected` look. A
       * lost stream is not "failed", which would claim to know the target's state.
       */
      staleTone: 'disconnected',
      /**
       * The card's title before any frame arrived (`stripView`'s `card.title`, src/status/text.js
       * `card.title`, restated: a chunk imports no module).
       */
      title: Object.freeze({ en: 'Target DSH', zh: '目标 DSH' }),
      // Connect is the card's call to action; Cancel only backs out of an attempt.
      buttonVariant: Object.freeze({ connect: 'primary', cancel: 'outline' }),
      icon: 14,
    })
    // The card's accent is the state's own colour in DSH's tokens, as a faint tint like DSH's Tag's.
    const accentRule = (state, token) => `.${STRIP.css.root}[data-fishball-strip-state="${state}"] .${STRIP.css.head}{background:color-mix(in srgb,var(${token}) 6%,transparent)}`
    // The badge keeps the Tag's tint fill; only its words and a 1px inner outline take the ink.
    const inkRule = (state, ink) => `.${STRIP.css.root}[data-fishball-strip-state="${state}"] .${STRIP.css.badge}{color:${ink};box-shadow:inset 0 0 0 1px ${ink}}`
    const css = [
      `.${STRIP.css.head}{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 12px 10px 16px;min-height:28px}`,
      `.${STRIP.css.title}{font:var(--dsw-font-xs-strong-13);color:var(--dsw-alias-label-primary)}`,
      `.${STRIP.css.aside}{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-left:auto}`,
      `.${STRIP.css.chip}{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);white-space:nowrap}`,
      // The lines start under the heading's title: the head's 16px padding, the 10px dot and its 8px gap.
      `.${STRIP.css.body}{display:grid;gap:4px;padding:0 16px 12px 34px;color:var(--dsw-alias-label-secondary)}`,
      `.${STRIP.css.body}:empty{display:none}`,
      `.${STRIP.css.line}{margin:0}`,
      `.${STRIP.css.link}{justify-self:start;color:var(--dsw-alias-link);text-decoration:none}`,
      `.${STRIP.css.link}:hover{text-decoration:underline}`,
      ...Object.entries(STRIP.tone).filter(([, tone]) => tone.accent !== null).map(([state, tone]) => accentRule(state, tone.accent)),
      ...Object.entries(STRIP.tone).filter(([, tone]) => tone.ink !== null).map(([state, tone]) => inkRule(state, tone.ink)),
    ].join('')
    const apiUrl = (path) => new URL(path, document.baseURI)

    /**
     * One strip stream per language for every mounted dock (kit `liveStream`: EventSource retries by
     * itself, and the kit marks the cached view stale meanwhile, R-FIX-FUI).
     */
    function stripStream(kit) {
      let lang = STRIP.lang.en
      const url = () => {
        const next = apiUrl(STRIP.events)
        next.searchParams.set(STRIP.langParameter, lang)
        return next
      }
      const stream = kit.liveStream({ url, valid: (next) => next !== null && typeof next === 'object' && Array.isArray(next.lines) })
      return Object.freeze({
        ...stream,
        /** Follows `wanted` (the page's language): a change reopens the stream in it. */
        use(wanted) {
          if (wanted === lang) return
          lang = wanted
          stream.reopen()
        },
      })
    }

    /** One press of the control: core's route; Connect's approval URL, when it answers one. */
    async function press(action) {
      try {
        const response = await fetch(apiUrl(action === STRIP.action.connect ? STRIP.connect : STRIP.cancel), STRIP.press)
        const body = response.ok ? await response.json() : undefined
        // Only a web address is opened or linked: a defence in depth, since core's route answers only
        // the connector's approval URL.
        if (body?.outcome !== STRIP.approvalOutcome || typeof body.url !== 'string' || !URL.canParse(body.url)) return undefined
        return STRIP.webSchemes.includes(new URL(body.url).protocol) ? body.url : undefined
      } catch { return undefined }
    }

    function makeDock(ctx, stream, kit) {
      return function FishballStrip() {
        const lang = kit.useLang(ctx)
        React.useEffect(() => { stream.use(lang) }, [lang])
        const { frame: view, health } = React.useSyncExternalStore(stream.subscribe, stream.get)
        const [approvalUrl, setApprovalUrl] = React.useState(undefined)
        const live = health === kit.HEALTH.live
        // Nothing heard yet and nothing wrong: nothing to draw. A stream that failed before its
        // first frame still draws the card, so the loss is seen and Reconnect offered (R-FIX-FUI).
        if (view === null && live) return null
        const onPress = async () => {
          const url = await press(view.control.action)
          if (url !== undefined) window.open(url, STRIP.open.target, STRIP.open.features)
          setApprovalUrl(url)
        }
        // While the stream is not live the cached state is no claim: the card keeps its title and
        // drops its state, lines, tools and control, so it never says "Connected" from an old frame.
        const card = view?.card
        const tone = live ? STRIP.tone[card.state] ?? STRIP.tone[STRIP.fallbackTone] : STRIP.tone[STRIP.staleTone]
        const lines = live ? view.lines : []
        const tools = lines.find((line) => line.kind === STRIP.toolsKind)
        const control = live ? view.control : null
        const title = card?.title ?? (STRIP.title[lang] ?? STRIP.title[STRIP.lang.en])
        // The heading row holds the state and the one action; the lines below say why.
        return h('div', {
          className: [kit.css.dock, STRIP.css.root].join(' '), 'data-fishball-strip': true, 'data-fishball-strip-state': live ? card.state : STRIP.staleTone,
          'data-fishball-strip-stale': live ? undefined : health, role: 'status',
        },
          h('div', { className: [kit.css.card, STRIP.css.card].join(' ') },
            h('div', { className: STRIP.css.head },
              h(StateDot, { state: tone.dot }),
              h('span', { className: STRIP.css.title }, title),
              h(Tag, { tone: tone.tag, className: STRIP.css.badge }, h('span', { 'data-fishball-strip-badge': true }, live ? card.badge : kit.staleText(lang))),
              h('div', { className: STRIP.css.aside },
                tools === undefined ? null : h(Tooltip, { ...STRIP.tooltip, label: card.toolsHint },
                  h('span', { className: STRIP.css.chip, tabIndex: 0, 'aria-label': `${tools.text} · ${card.toolsHint}`, 'data-fishball-strip-line': tools.kind },
                    h(IconCordisPluginOutlineRegular, { size: STRIP.icon }), tools.text)),
                control === null ? null : h(Button, { type: 'button', size: 'sm', variant: STRIP.buttonVariant[control.action], 'data-fishball-strip-control': control.action, onClick: () => void onPress() }, control.label))),
            h(kit.StreamNotice, { health, lang, onRetry: () => stream.reopen() }),
            h('div', { className: STRIP.css.body },
              lines.filter((line) => line !== tools).map((line) => h('p', { key: line.kind, className: STRIP.css.line, 'data-fishball-strip-line': line.kind }, line.text)),
              approvalUrl === undefined || control?.action !== STRIP.action.cancel ? null
                : h('a', { className: STRIP.css.link, href: approvalUrl, title: approvalUrl, target: STRIP.open.target, rel: STRIP.open.rel, 'data-fishball-strip-approval': true }, card.openApproval))))
      }
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function stripPart(kit) {
      function apply(ctx) {
        const stream = stripStream(kit)
        ctx.effect(() => kit.mountStyle(STRIP.css.id, css), STRIP.name + ': styles')
        ctx.effect(() => ctx.slots.inject(STRIP.slot, () => ctx.slots.register({ name: STRIP.slot, id: STRIP.id, order: STRIP.order }, makeDock(ctx, stream, kit))), STRIP.name + ': dock')
      }
      return Object.freeze({ name: STRIP.name, inject: ['slots', 'locale'], apply })
    }

    return { stripPart }
  },
})

/**
 * The Fishball page's status strip, browser half (F-WIRE; design §5a.2, §6.3a steps 1–2; R-FB-03,
 * R-FB-04, R-FB-09, R-FB-10). A package-local chunk of fishball-ui's client (DSH serves only flat
 * `client.<name>.js` chunks, CLIENT_CHUNK, both SDKs); client.js starts `stripPart`.
 *
 * It draws what fishball-ui's Node row serves (src/status/route.js: `stripView` of core's status
 * snapshot, one SSE frame per change), as one line per entry above the composer in DSH's
 * `conversation.input.dock` slot, and its one control: Connect or Cancel, which call core's own
 * Connect routes (K3a: fishball-ui draws through core's routes). Connect opens the approval page in
 * a new tab with no link back to this page, and also shows it as a link, as core's settings page
 * does (a browser may block an open after an await unnoticed). The strip holds no state of its own.
 * In a Fishball DSH the page shows only the manager's conversation, so the dock draws for any session.
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  chunk: 'client.strip.js',
  factory(require) {
    const React = require('react')
    const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

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
      connect: 'api/fishball/connect',
      cancel: 'api/fishball/connect/cancel',
      press: Object.freeze({ method: 'POST', credentials: 'same-origin', cache: 'no-store' }),
      // `SEAM_STATUS.control` and the `approval-url` ConnectBegin outcome (K3a connect.d.ts).
      action: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
      approvalOutcome: 'approval-url',
      open: Object.freeze({ target: '_blank', features: 'noopener', rel: 'noopener noreferrer' }),
      chinese: 'zh',
      lang: Object.freeze({ zh: 'zh', en: 'en' }),
      css: Object.freeze({ id: 'fishball-strip-style', root: 'fb-strip', line: 'fb-strip-line', row: 'fb-strip-row' }),
    })
    const css = [
      `.${STRIP.css.root}{display:grid;gap:4px;margin:0 0 8px;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-secondary)}`,
      `.${STRIP.css.line}{margin:0}`,
      `.${STRIP.css.row}{display:flex;align-items:center;flex-wrap:wrap;gap:8px}`,
    ].join('')
    const apiUrl = (path) => new URL(path, document.baseURI)

    /** One strip stream per language for every mounted dock; EventSource reconnects by itself. */
    function stripStream() {
      let snapshot = null
      let lang
      let source
      const listeners = new Set()
      const open = () => {
        const url = apiUrl(STRIP.events)
        url.searchParams.set(STRIP.langParameter, lang)
        source = new EventSource(url)
        source.onmessage = (message) => {
          let next
          try { next = JSON.parse(message.data) } catch { return }
          if (next === null || typeof next !== 'object' || !Array.isArray(next.lines)) return
          snapshot = Object.freeze(next)
          for (const listener of [...listeners]) listener()
        }
      }
      return {
        get: () => snapshot,
        /** Follows `wanted` (the page's language): a change reopens the stream in it. */
        use(wanted) {
          if (wanted === lang) return
          lang = wanted
          if (source !== undefined) { source.close(); open() }
        },
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

    /** One press of the control: core's route; Connect's approval URL, when it answers one. */
    async function press(action) {
      try {
        const response = await fetch(apiUrl(action === STRIP.action.connect ? STRIP.connect : STRIP.cancel), STRIP.press)
        const body = response.ok ? await response.json() : undefined
        return body?.outcome === STRIP.approvalOutcome && typeof body.url === 'string' ? body.url : undefined
      } catch { return undefined }
    }

    function makeDock(ctx, stream) {
      return function FishballStrip() {
        const lang = React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getLocale().active).startsWith(STRIP.chinese) ? STRIP.lang.zh : STRIP.lang.en
        React.useEffect(() => { stream.use(lang) }, [lang])
        const view = React.useSyncExternalStore(stream.subscribe, stream.get)
        const [approvalUrl, setApprovalUrl] = React.useState(undefined)
        if (view === null) return null
        const onPress = async () => {
          const url = await press(view.control.action)
          if (url !== undefined) window.open(url, STRIP.open.target, STRIP.open.features)
          setApprovalUrl(url)
        }
        return h('div', { className: STRIP.css.root, 'data-fishball-strip': true, role: 'status' },
          view.lines.map((line) => h('p', { key: line.kind, className: STRIP.css.line, 'data-fishball-strip-line': line.kind }, line.text)),
          view.control === null ? null : h('div', { className: STRIP.css.row },
            h(Button, { type: 'button', size: 'sm', variant: 'outline', 'data-fishball-strip-control': view.control.action, onClick: () => void onPress() }, view.control.label),
            approvalUrl === undefined || view.control.action !== STRIP.action.cancel ? null
              : h('a', { href: approvalUrl, target: STRIP.open.target, rel: STRIP.open.rel }, approvalUrl)))
      }
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function stripPart(kit) {
      function apply(ctx) {
        const stream = stripStream()
        stream.use(STRIP.lang.en)
        ctx.effect(() => kit.mountStyle(STRIP.css.id, css), STRIP.name + ': styles')
        ctx.effect(() => ctx.slots.inject(STRIP.slot, () => ctx.slots.register({ name: STRIP.slot, id: STRIP.id, order: STRIP.order }, makeDock(ctx, stream))), STRIP.name + ': dock')
      }
      return Object.freeze({ name: STRIP.name, inject: ['slots', 'locale'], apply })
    }

    return { stripPart }
  },
})

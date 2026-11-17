/**
 * The pairing card, browser half (R-FIX-FUI; F-PAIR; R-ID-07, R-ID-10, R-NAME-03; AUTH-UC-05,
 * AUTH-ST-03). A package-local chunk of fishball-ui's client (DSH serves only flat `client.<name>.js`
 * chunks, CLIENT_CHUNK, both SDKs); client.js starts `pairingPart`.
 *
 * It draws what fishball-ui's Node row serves (src/pairing/route.js: `pairingView` of core's
 * `ui.pairing.state()`, one SSE frame per change, in the page's language and the browser's time
 * zone), as a card above the composer in DSH's `conversation.input.dock` slot, and only while there
 * is something to say. A warning names the bound pair and when it was last seen and offers the
 * choices core offers. Continue is enabled only once the box "No other Fishball or agent uses this
 * id with this token" is ticked, and core refuses it unconfirmed anyway. A press posts to the
 * choose route; the card holds no state but the box and the last press's failure. Core's next frame
 * says what the choice did. In a Fishball DSH the page shows only the manager's conversation, so the
 * dock draws for any session, as the status strip's does.
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  chunk: 'client.pairing.js',
  factory(require) {
    const React = require('react')
    const { Button, Checkbox, StateDot } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const PAIRING = Object.freeze({
      name: 'fishball-ui: pairing',
      slot: 'conversation.input.dock',
      id: 'fishball-pairing',
      // After the status strip (-20), before the ask cards (-10): what holds the link, under its state.
      order: -15,
      // fishball-ui's routes (src/pairing/route.js PAIRING_ROUTE), page-relative; restated: a chunk imports no module.
      events: 'api/fishball/pairing',
      choose: 'api/fishball/pairing/choose',
      langParameter: 'lang',
      zoneParameter: 'tz',
      press: Object.freeze({ method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: Object.freeze({ 'content-type': 'application/json' }) }),
      dot: 'warning',
      css: Object.freeze({ id: 'fishball-pairing-style', head: 'fb-pairing-head', title: 'fb-pairing-title', body: 'fb-pairing-body', line: 'fb-pairing-line', row: 'fb-pairing-row', error: 'fb-pairing-error' }),
    })
    // The strip card's layout (client.strip.js), DSH tokens only: a heading row with the warn dot,
    // the lines below it, the choices at the end, as DSH's own approval card ends with its choices.
    const css = [
      `.${PAIRING.css.head}{display:flex;align-items:center;gap:8px;padding:10px 12px 10px 16px;min-height:28px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 6%,transparent)}`,
      `.${PAIRING.css.title}{font:var(--dsw-font-xs-strong-13);color:var(--dsw-alias-label-primary)}`,
      `.${PAIRING.css.body}{display:grid;gap:8px;padding:8px 16px 12px 34px;color:var(--dsw-alias-label-secondary)}`,
      `.${PAIRING.css.line}{margin:0}`,
      `.${PAIRING.css.row}{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}`,
      `.${PAIRING.css.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')
    const apiUrl = (path) => new URL(path, document.baseURI)
    /** The browser's own time zone, the one the last-seen time is written in. */
    const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

    /** One pairing stream per language for every mounted dock, in the browser's time zone (kit `langStream`). */
    const pairingStream = (kit) => kit.langStream({
      path: PAIRING.events, langParameter: PAIRING.langParameter, params: () => ({ [PAIRING.zoneParameter]: timeZone() }),
      valid: (next) => next !== null && typeof next === 'object' && Array.isArray(next.lines) && Array.isArray(next.choices),
    })

    /** One choice: core's answer `{ok}`; a refusal, a non-200 or no answer reads as not done. */
    async function choose(choice, confirmed) {
      try {
        const response = await fetch(apiUrl(PAIRING.choose), { ...PAIRING.press, body: JSON.stringify({ choice, confirmed }) })
        return (await response.json())?.ok === true
      } catch { return false }
    }

    /**
     * One warning's body: its lines, the box and the choices. It is keyed by the warning
     * (`pairingView`'s `key`), so a new warning, even one of the same state, starts with the box
     * unticked and no failure: a tick is the user's word for that one pairing only (R-ID-07).
     */
    function PairingBody({ view, locked: streamLocked }) {
      const [ticked, setTicked] = React.useState(false)
      const [sending, setSending] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const locked = sending || streamLocked
      const press = async (choice) => {
        setSending(true)
        setFailed(false)
        const ok = await choose(choice, ticked)
        setSending(false)
        setFailed(!ok)
      }
      return h('div', { className: PAIRING.css.body },
        view.lines.map((line) => h('p', { key: line.kind, className: PAIRING.css.line, 'data-fishball-pairing-line': line.kind }, line.text)),
        view.confirm === null ? null : h('div', { 'data-fishball-pairing-confirm': true },
          h(Checkbox, { checked: ticked, disabled: locked, label: view.confirm, onChange: (on) => setTicked(on === true) })),
        view.choices.length === 0 ? null : h('div', { className: PAIRING.css.row },
          view.choices.map((entry, index) => h(Button, {
            key: entry.choice, type: 'button', size: 'sm', variant: index === 0 ? 'primary' : 'outline',
            disabled: locked || (entry.needsConfirm && !ticked), 'data-fishball-pairing-choice': entry.choice,
            onClick: () => void press(entry.choice),
          }, entry.label))),
        failed ? h('p', { className: PAIRING.css.error, role: 'alert', 'data-fishball-pairing-failed': true }, view.failed) : null)
    }

    function makeDock(ctx, stream, kit) {
      return function FishballPairing() {
        const lang = kit.useLang(ctx)
        React.useEffect(() => { stream.use(lang) }, [lang])
        const { frame: view, health } = React.useSyncExternalStore(stream.subscribe, stream.get)
        if (view === null || view.lines.length === 0) return null
        // A warning from a stream that is not live may be over already: it stays readable, but no
        // control acts on it until a fresh frame (R-FIX-FUI). Core refuses a choice it no longer offers.
        const stale = health !== kit.HEALTH.live
        return h('div', { className: kit.css.dock, 'data-fishball-pairing': true, 'data-fishball-pairing-state': view.state, 'data-fishball-pairing-stale': stale ? health : undefined },
          h('div', { className: kit.css.card },
            h('div', { className: PAIRING.css.head }, h(StateDot, { state: PAIRING.dot }), h('span', { className: PAIRING.css.title }, view.title)),
            h(kit.StreamNotice, { health, lang }),
            h(PairingBody, { key: view.key, view, locked: stale })))
      }
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function pairingPart(kit) {
      function apply(ctx) {
        const stream = pairingStream(kit)
        ctx.effect(() => kit.mountStyle(PAIRING.css.id, css), PAIRING.name + ': styles')
        ctx.effect(() => ctx.slots.inject(PAIRING.slot, () => ctx.slots.register({ name: PAIRING.slot, id: PAIRING.id, order: PAIRING.order }, makeDock(ctx, stream, kit))), PAIRING.name + ': dock')
      }
      return Object.freeze({ name: PAIRING.name, inject: ['slots', 'locale'], apply })
    }

    return { pairingPart }
  },
})

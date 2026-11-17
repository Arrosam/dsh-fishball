/**
 * fishball-ui's `dsh.client` entry (requirements 1.38 Q-N2; R-FB-14): the browser half of the
 * fishball-ui row. DSH serves it once for the package, because fishball-ui's patch mounts exactly
 * one path row whose module has no manifest of its own (`fishball-ui`, index.js); the page and the
 * Recommended tab are their own small packages (fishball-page/, fishball-recommend-plugins/).
 *
 * The row is on only beside core (its patch's condition), so this runs only in a Fishball DSH and
 * never without core (Q-G2). It loads its parts, package-local chunks beside it (DSH serves only
 * `client.<name>.js` siblings of a package's client.js, CLIENT_CHUNK, both SDKs), and runs each as
 * its own sub-plugin of this row, with the kit below:
 * - client.entries.js: the Fishball page's "Fishball settings" and "DSH settings" entries and the
 *   `view=settings` continuation;
 * - client.asks.js: the ask cards in Fishball's own conversation, over core's routes;
 * - client.strip.js: the status strip and its Connect / Cancel control (F-WIRE);
 * - client.pairing.js: the pairing card, core's pairing warning and its choices (R-FIX-FUI);
 * - client.model.js: the dialog that asks for Fishball's model while it is unset (F-WIRE).
 *
 * A chunk that fails to load loses only its part, logged once; a chunk that arrives after this row
 * stopped is not started (the same rule as core's client.js and dsh-connector-ui's parts, whose
 * `start` this restates: a browser package could share it only through a client library chunk both
 * load, and none exists; dsh-connector-ui is on the other side besides, R-ARCH-10).
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  factory(require) {
    const React = require('react')
    const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const UI = Object.freeze({
      name: 'fishball-ui',
      parts: Object.freeze([
        Object.freeze({ chunk: './client.entries.js', factory: 'entriesPart' }),
        Object.freeze({ chunk: './client.asks.js', factory: 'asksPart' }),
        Object.freeze({ chunk: './client.strip.js', factory: 'stripPart' }),
        Object.freeze({ chunk: './client.pairing.js', factory: 'pairingPart' }),
        Object.freeze({ chunk: './client.model.js', factory: 'modelPart' }),
      ]),
      unavailable: 'fishball-ui: part unavailable',
      base: 'fishball-ui-base-style',
      chinese: 'zh',
      lang: Object.freeze({ zh: 'zh', en: 'en' }),
      /**
       * Core's settings page: core's bundle page on DSH's Plugins page (core's `contracts/constants.js`
       * `GUARDS.bundleName`, restated: fishball-ui imports nothing of core, Q-G2), through DSH's
       * plugin navigation service, else the Plugins list itself. Shared by the "Fishball settings"
       * header entry and the sidebar targets (MULTI-3: add/remove/URL editing live there).
       */
      coreSettings: Object.freeze({ bundle: 'fishball-core', navigation: 'pluginNavigation', pluginsPanel: 'plugins' }),
    })

    /**
     * A live stream's health (R-FIX-FUI): `live` while the last thing heard is a valid frame (or
     * nothing yet), `stale` after an `error` while EventSource retries by itself, `closed` once it
     * gave up (`readyState` CLOSED: an HTTP, auth or content-type failure), when only Reconnect
     * opens it again. A fresh valid frame makes it `live` again. Its words are the parts' data
     * markers (`data-fishball-*-stale`, `data-fishball-stream-notice`).
     */
    const HEALTH = Object.freeze({ live: 'live', stale: 'stale', closed: 'closed' })
    /** EventSource.CLOSED, the readyState after which it never retries (WHATWG HTML §9.2). */
    const SOURCE_CLOSED = 2
    const STREAM_CSS = Object.freeze({ notice: 'fb-ui-stream-notice' })
    const streamText = {
      en: { stale: 'Reconnecting to Fishball… What is shown here may be out of date.', closed: 'The connection to Fishball was lost. What is shown here may be out of date.', retry: 'Reconnect', staleBadge: 'Out of date' },
      zh: { stale: '正在重新连接 Fishball… 此处显示的内容可能已过时。', closed: '与 Fishball 的连接已断开。此处显示的内容可能已过时。', retry: '重新连接', staleBadge: '已过时' },
    }

    /**
     * The look the parts share (UI-POLISH-F), one style sheet for the row, DSH tokens only:
     * - `dock`: a block in DSH's `conversation.input.dock` sized as DSH's own goal dock is (the
     *   composer's side clearance and dock inset, both SDKs), so Fishball's cards line up with it;
     * - `card`: the surface of DSH's composer cards (approval, questions): the input fill, the panel
     *   elevation, the xl radius;
     * - `iconButton`: a square, icon-only DSH sm Button, as DSH's own header actions are.
     */
    const CSS = Object.freeze({ dock: 'fb-ui-dock', card: 'fb-ui-card', iconButton: 'fb-ui-icon-button' })
    const baseCss = [
      // The composer variables are the conversation's (dsh-client-ui-conversation), not the theme's;
      // the fallbacks keep the width valid if a dock ever renders outside it.
      `.${CSS.dock}{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance, 0px) - 4 * var(--dsh-composer-dock-inset, 0px));max-width:calc(var(--dsh-composer-card-max-width, 100%) - 4 * var(--dsh-composer-dock-inset, 0px));margin:0 auto 8px;display:grid;gap:8px}`,
      `.${CSS.card}{box-sizing:border-box;min-width:0;border-radius:var(--dsw-radius-xl);background:var(--dsw-specific-input-major);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);overflow:hidden}`,
      `.${CSS.iconButton}{width:28px;padding:0;color:var(--dsw-alias-label-secondary)}`,
      // The stale notice: DSH's warn ink on its warn band, as the open ask card's band.
      `.${STREAM_CSS.notice}{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0;padding:8px 16px;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12)}`,
    ].join('')

    /**
     * Every live stream of this row, so one Reconnect reopens them all: a lost stream usually has one
     * cause for all of them (DSH restarted, the owner's session ended), and a part whose stream stays
     * closed would never show the next ask or pairing warning.
     */
    const streams = new Set()
    const reopenAll = () => { for (const stream of streams) stream.reopen() }

    /**
     * One live stream (R-FIX-FUI): an EventSource on `url()` shared by every mounted part that
     * subscribes, opened at the first subscriber and closed after the last. `valid(frame)` says which
     * parsed frames are the route's shape; any other keeps the last good one. `get()` is
     * `{frame, health}`: the last valid frame (or `initial`) and its `HEALTH`. `reopen()` closes the
     * source and opens a fresh one (Reconnect, or a changed `url()`).
     */
    function liveStream({ url, valid, initial = null }) {
      let snapshot = Object.freeze({ frame: initial, health: HEALTH.live })
      let source
      const listeners = new Set()
      const publish = (next) => {
        snapshot = Object.freeze({ ...snapshot, ...next })
        for (const listener of [...listeners]) listener()
      }
      // A source opened again after it gave up is trying, as EventSource's own retry is, until a frame.
      const retrying = () => { if (snapshot.health === HEALTH.closed) publish({ health: HEALTH.stale }) }
      const open = () => {
        const current = new EventSource(url())
        source = current
        current.onmessage = (message) => {
          let next
          try { next = JSON.parse(message.data) } catch { return }
          if (!valid(next)) return
          publish({ frame: Object.freeze(next), health: HEALTH.live })
        }
        // An error on a source this stream already replaced or closed says nothing about the current one.
        current.onerror = () => {
          if (source !== current) return
          publish({ health: current.readyState === SOURCE_CLOSED ? HEALTH.closed : HEALTH.stale })
        }
      }
      const close = () => { source?.close(); source = undefined }
      const stream = Object.freeze({
        get: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          if (source === undefined) { open(); retrying() }
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0) close()
          }
        },
        /** A fresh source, if any part is subscribed (Reconnect, or a changed `url()`). */
        reopen() {
          if (source === undefined) return
          close()
          open()
          retrying()
        },
      })
      streams.add(stream)
      return stream
    }

    /**
     * A live stream of a fishball-ui route drawn in the page's language: `url` is `path` with the
     * language as `langParameter` and `params()`'s extra query values. `use(wanted)` follows the
     * page's language; a change reopens the stream in it.
     */
    function langStream({ path, langParameter, params = () => ({}), valid }) {
      let lang = UI.lang.en
      const url = () => {
        const next = new URL(path, document.baseURI)
        next.searchParams.set(langParameter, lang)
        for (const [name, value] of Object.entries(params())) next.searchParams.set(name, value)
        return next
      }
      const stream = liveStream({ url, valid })
      return Object.freeze({
        ...stream,
        use(wanted) {
          if (wanted === lang) return
          lang = wanted
          stream.reopen()
        },
      })
    }

    /** The page's language, `zh` or `en`, followed live (DSH's locale service, as the parts read it). */
    function useLang(ctx) {
      const active = React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getLocale().active)
      return active.startsWith(UI.chinese) ? UI.lang.zh : UI.lang.en
    }

    /**
     * The notice a part shows instead of its cached view while the stream is not live, with
     * Reconnect (every stream of this row) once the stream gave up; null while live.
     */
    function StreamNotice({ health, lang }) {
      if (health === HEALTH.live) return null
      const text = streamText[lang] ?? streamText[UI.lang.en]
      return h('div', { className: STREAM_CSS.notice, role: 'status', 'data-fishball-stream-notice': health },
        h('span', null, text[health]),
        health === HEALTH.closed ? h(Button, { type: 'button', size: 'sm', variant: 'outline', 'data-fishball-stream-retry': true, onClick: reopenAll }, text.retry) : null)
    }

    /**
     * What the parts share: `css`, the shared class names, and `mountStyle(id, cssText)`, which adds
     * one style sheet to the document and returns its disposer, for a part's `ctx.effect`; the id
     * names it for a reader of the DOM. Since R-FIX-FUI also the live streams' lifecycle
     * (`liveStream`, `langStream`, `HEALTH`, `StreamNotice`, `staleText`) and `useLang`, so the
     * sidebar targets, the ask cards and the pairing card mark a lost stream the same way; since
     * MULTI-3 `openCoreSettings`.
     */
    const kit = Object.freeze({
      /** The shared class names (`CSS`); their sheet is mounted once by this row. */
      css: CSS,
      HEALTH,
      liveStream,
      langStream,
      useLang,
      StreamNotice,
      /** Opens core's settings page (`UI.coreSettings`); `ctx` needs `layout`. */
      openCoreSettings(ctx) {
        const navigation = ctx.get(UI.coreSettings.navigation)
        if (navigation) navigation.openBundle(UI.coreSettings.bundle)
        else ctx.layout.selectPanel(UI.coreSettings.pluginsPanel)
      },
      /** The badge word of a view shown while its stream is not live, in `lang`. */
      staleText: (lang) => (streamText[lang] ?? streamText[UI.lang.en]).staleBadge,
      mountStyle(id, cssText) {
        const style = document.createElement('style')
        style.id = id
        style.textContent = cssText
        document.head.appendChild(style)
        return () => style.remove()
      },
    })

    /** Load one part and start it as a sub-plugin while this row still runs. */
    function start(ctx, { chunk, factory }) {
      ctx.effect(() => {
        let live = true
        require.async(chunk).then((module) => { if (live) ctx.plugin(module[factory](kit)) })
          .catch((error) => { ctx.logger?.warn?.(UI.unavailable, chunk, error) })
        return () => { live = false }
      }, UI.name + ': ' + chunk)
    }

    function apply(ctx) {
      ctx.effect(() => kit.mountStyle(UI.base, baseCss), UI.name + ': base styles')
      for (const part of UI.parts) start(ctx, part)
    }

    // No inject of its own: each part declares the client services it needs and starts with them.
    return { name: UI.name, apply }
  },
})

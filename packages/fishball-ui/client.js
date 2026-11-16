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
 * - client.asks.js: the ask cards in Fishball's own conversation, over core's routes.
 *
 * A chunk that fails to load loses only its part, logged once; a chunk that arrives after this row
 * stopped is not started (the same rule as core's client.js and dsh-connector-ui's parts, whose
 * `start` this restates: a browser package could share it only through a client library chunk both
 * load, and none exists; dsh-connector-ui is on the other side besides, R-ARCH-10).
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  factory(require) {
    const UI = Object.freeze({
      name: 'fishball-ui',
      parts: Object.freeze([
        Object.freeze({ chunk: './client.entries.js', factory: 'entriesPart' }),
        Object.freeze({ chunk: './client.asks.js', factory: 'asksPart' }),
      ]),
      unavailable: 'fishball-ui: part unavailable',
    })

    /**
     * What the parts share. `mountStyle(id, cssText)` adds one style sheet to the document and
     * returns its disposer, for a part's `ctx.effect`; the id names it for a reader of the DOM.
     */
    const kit = Object.freeze({
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
      for (const part of UI.parts) start(ctx, part)
    }

    // No inject of its own: each part declares the client services it needs and starts with them.
    return { name: UI.name, apply }
  },
})

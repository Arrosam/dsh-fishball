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
    const UI = Object.freeze({
      name: 'fishball-ui',
      parts: Object.freeze([
        Object.freeze({ chunk: './client.entries.js', factory: 'entriesPart' }),
        Object.freeze({ chunk: './client.asks.js', factory: 'asksPart' }),
        Object.freeze({ chunk: './client.strip.js', factory: 'stripPart' }),
        Object.freeze({ chunk: './client.model.js', factory: 'modelPart' }),
      ]),
      unavailable: 'fishball-ui: part unavailable',
      base: 'fishball-ui-base-style',
    })

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
    ].join('')

    /**
     * What the parts share: `css`, the shared class names, and `mountStyle(id, cssText)`, which adds
     * one style sheet to the document and returns its disposer, for a part's `ctx.effect`; the id
     * names it for a reader of the DOM.
     */
    const kit = Object.freeze({
      /** The shared class names (`CSS`); their sheet is mounted once by this row. */
      css: CSS,
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

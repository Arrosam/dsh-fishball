/**
 * dsh-connector-ui, browser half (V3 R-EMBED, U-SHELL, U-DRAW; R-ARCH-04: every host-DSH UI change
 * from the DSH side comes from this package, and it only draws: requirements 1.34). It loads its
 * parts and runs each as its own sub-plugin of this row, so each keeps its name, injects and effects:
 * - client.shell.js: the shell (the window or the no-instance hint, the sidebar fish, the
 *   connector's Plugins card, the style sheet and dictionary) and the kit the parts share;
 * - client.marks.js: the managed-session marks and Hand over / Take back (Q-G5 = A);
 * - client.attention.js: the fish's light and the notify prompt (R-FN-01, §13.6).
 * The instance's card moved to the instance's own settings page with I-HOST (requirements 1.33
 * Q-D1 = B, R-ARCH-05), so this package draws nothing of the instance but its window.
 * The parts draw the connector UI backend's snapshot and call its routes; they keep no state.
 * There are no cards (Q-U2) and no inline records (Q-G4).
 *
 * They are package-local chunks, not folders, because DSH's client modules serve a package's
 * `client.js` and only `client.<name>.js` files beside it (CLIENT_CHUNK in dsh-client-modules, the
 * same in 0.2.1-rc.5 and 0.2.2-rc.1), and this repository has no build step (user decision
 * 2026-11-13; W3 brief F2, Q-7).
 *
 * Each part loads on its own: a chunk that fails to load loses only its part, logged once, never
 * the other. A part that arrives after this row stopped is not started. The marks and attention
 * parts need the shell's kit, so they start once the shell's chunk arrived; without it they are
 * logged as unavailable with it. Because the parts arrive as chunks after this entry
 * runs, they start one chunk request later than the V2 bundles did (DESIGN.md §17).
 */
window.__ModuleLoader__.load({
  id: 'dsh-connector-ui',
  factory(require) {
    const EMBED = Object.freeze({
      name: 'dsh-connector-ui',
      shell: './client.shell.js',
      /**
       * Each kit part: its chunk, the factory it exports, and when it runs (UIM-EP-01, design §4.2).
       * `needs` lists alternatives, each a set of availability flags that must all be set
       * (src/host/services.js); any one alternative is enough. The marks and the light draw the
       * connector UI backend, so they need it alone.
       */
      parts: Object.freeze([
        Object.freeze({ chunk: './client.marks.js', factory: 'marksPart', needs: Object.freeze([Object.freeze(['connector'])]) }),
        Object.freeze({ chunk: './client.attention.js', factory: 'attentionPart', needs: Object.freeze([Object.freeze(['connector'])]) }),
      ]),
      /**
       * Nothing runs without a local connector (Q-U1: "embed UI是connector的附属插件，不能脱离connector
       * 运作"; the host half logs `connector-missing`). The shell runs only with the connector's UI
       * backend, which the connector row provides; it is the only alternative (V2 was never
       * deployed, so no V2 connector counts as one).
       */
      shellNeeds: Object.freeze([Object.freeze(['connector'])]),
      /**
       * What the host half reports usable (src/host/constants.js ROUTE.services, page-relative; this
       * classic script cannot import it): `{ok, connector, page, routes, ui}`. Read here,
       * not in a part, so every part waits only on this one read and never on another chunk.
       * Unreadable is "nothing", so nothing registers.
       */
      servicesPath: 'api/dsh-connector-ui/services',
      read: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      none: Object.freeze({ connector: false, page: false, routes: Object.freeze({}), ui: Object.freeze({}) }),
      unavailable: 'fishball embed-ui: part unavailable',
    })

    /**
     * Start one loaded part as a sub-plugin while this row still runs (a load that resolves to
     * nothing, a part not wanted here, starts nothing). The load is held by an
     * effect: once the row stops (disposed, or unloaded for a reload), the cleanup marks it dead
     * and a late arrival starts nothing, since a stopped context refuses new effects. A failed
     * load and a failed start are logged the same way.
     */
    function start(ctx, label, load) {
      ctx.effect(() => {
        let live = true
        load().then((plugin) => { if (live && plugin !== undefined) ctx.plugin(plugin) })
          .catch((error) => { ctx.logger?.warn?.(EMBED.unavailable, label, error) })
        return () => { live = false }
      }, EMBED.name + ': ' + label)
    }

    /** One read of the host half's availability (EMBED.servicesPath). */
    async function readAvailability() {
      try {
        const response = await fetch(new URL(EMBED.servicesPath, document.baseURI).toString(), EMBED.read)
        const value = await response.json()
        return response.ok && value?.ok === true ? value : EMBED.none
      } catch { return EMBED.none }
    }

    /** Whether one alternative of `needs` has all its flags set in the host half's availability. */
    const wanted = (available, needs) => needs.some((flags) => flags.every((flag) => available[flag] === true))

    /**
     * Reads what the host half reports usable once (the shell's readAvailability), then starts
     * only the parts it allows: without a local connector, nothing registers (Q-U1; the host half
     * logs `connector-missing`). A part that is not started loads no chunk.
     */
    function apply(ctx) {
      const shell = require.async(EMBED.shell)
      const available = readAvailability()
      const when = (needs, load) => () => available.then((flags) => (wanted(flags, needs) ? load(flags) : undefined))
      start(ctx, EMBED.shell, when(EMBED.shellNeeds, (flags) => shell.then((module) => module.shellPlugin(flags))))
      for (const part of EMBED.parts) {
        start(ctx, part.chunk, when(part.needs, (flags) => Promise.all([shell, require.async(part.chunk)]).then(([{ kit }, module]) => module[part.factory](kit, flags))))
      }
    }

    // No inject of its own: each part declares the client services it needs and starts with them.
    return { name: EMBED.name, apply }
  },
})

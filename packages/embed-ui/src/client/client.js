/**
 * fishball-embed-ui, browser half (V3 R-EMBED, U-SHELL; R-ARCH-04: every host-DSH UI change
 * Fishball makes comes from this package). It loads its parts and runs each as its own sub-plugin
 * of this row, so each keeps its name, injects and effects:
 * - client.shell.js: the shell (the Fishball view and frame, the sidebar entry and brand, the
 *   connector's Plugins card, the style sheet and dictionary) and the kit the parts share;
 * - client.marks.js: Hand over / Take back and the managed-session marks (U-MARKS in W4);
 * - client.attention.js: the fish's unread latch in the shell's seats (U-ATTN in W4);
 * - client.records.js: the ask_fishball row and the card records (U-RECORDS in W4);
 * - client.instance.js: the instance's Plugins card, given the instance-owned status line
 *   client.status.js (a symlink to packages/instance/src/child-settings/client.status.js).
 * The split moved the V2 code unchanged; the parts read the connector's V2 state through the kit.
 *
 * They are package-local chunks, not folders, because DSH's client modules serve a package's
 * `client.js` and only `client.<name>.js` files beside it (CLIENT_CHUNK in dsh-client-modules, the
 * same in 0.2.1-rc.5 and 0.2.2-rc.1), and this repository has no build step (user decision
 * 2026-11-13; W3 brief F2, Q-7).
 *
 * Each part loads on its own: a chunk that fails to load loses only its part, logged once, never
 * the other. A part that arrives after this row stopped is not started. The marks, attention and
 * records parts need the shell's kit, so they start once the shell's chunk arrived; without it
 * they are logged as unavailable with it. Because the parts arrive as chunks after this entry
 * runs, they start one chunk request later than the V2 bundles did (DESIGN.md §17).
 */
window.__ModuleLoader__.load({
  id: 'fishball-embed-ui',
  factory(require) {
    const EMBED = Object.freeze({
      name: 'fishball-embed-ui',
      shell: './client.shell.js',
      /**
       * Each kit part: its chunk, the factory it exports, and when it runs (UIM-EP-01). `needs` names
       * the availability flags of which any one is enough (src/host/services.js): marks and the fish
       * latch need the connector (V2's service is the W3 fallback until C-WIRE); the ask row and
       * the card records draw a managed session's own events and the connector's V2 state, so they
       * follow the connector too.
       */
      parts: Object.freeze([
        Object.freeze({ chunk: './client.marks.js', factory: 'marksPart', needs: Object.freeze(['connector', 'legacy']) }),
        Object.freeze({ chunk: './client.attention.js', factory: 'attentionPart', needs: Object.freeze(['connector', 'legacy']) }),
        Object.freeze({ chunk: './client.records.js', factory: 'recordsPart', needs: Object.freeze(['connector', 'legacy']) }),
      ]),
      /**
       * The shell runs with any service. The instance card needs no flag: it registers only while
       * the instance row's settings are served (configForms.whileServed), as in V2.
       */
      shellNeeds: Object.freeze(['page', 'connector', 'legacy']),
      instance: './client.instance.js',
      status: './client.status.js',
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

    /** Whether any flag in `needs` is set in the host half's availability. */
    const wanted = (available, needs) => needs.some((flag) => available[flag] === true)

    /**
     * Reads what the host half reports usable once (the shell's readAvailability), then starts
     * only the parts it allows: with nothing usable, nothing registers (UIM-EP-01 row 1; the host
     * half logs `instance-missing`). A part that is not started loads no chunk.
     */
    function apply(ctx) {
      const shell = require.async(EMBED.shell)
      const available = shell.then((module) => module.readAvailability())
      const when = (needs, load) => () => available.then((flags) => (wanted(flags, needs) ? load(flags) : undefined))
      start(ctx, EMBED.shell, when(EMBED.shellNeeds, (flags) => shell.then((module) => module.shellPlugin(flags))))
      for (const part of EMBED.parts) {
        start(ctx, part.chunk, when(part.needs, () => Promise.all([shell, require.async(part.chunk)]).then(([{ kit }, module]) => module[part.factory](kit))))
      }
      // With the locator, the card's model sync goes through the host half's routes (R-HOST-07,
      // design §4.2); without it, through the instance's own V2 routes, as before.
      start(ctx, EMBED.instance, () => Promise.all([require.async(EMBED.instance), require.async(EMBED.status), shell, available])
        .then(([instance, { shared, layout }, { kit }, flags]) => instance.instancePlugin(shared, layout, flags.page ? kit.CHILD_UI.route : undefined)))
    }

    // No inject of its own: each part declares the client services it needs and starts with them.
    return { name: EMBED.name, apply }
  },
})

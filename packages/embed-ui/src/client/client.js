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
      /** Each kit part: its chunk and the factory it exports. */
      parts: Object.freeze([
        Object.freeze({ chunk: './client.marks.js', factory: 'marksPart' }),
        Object.freeze({ chunk: './client.attention.js', factory: 'attentionPart' }),
        Object.freeze({ chunk: './client.records.js', factory: 'recordsPart' }),
      ]),
      instance: './client.instance.js',
      status: './client.status.js',
      unavailable: 'fishball embed-ui: part unavailable',
    })

    /**
     * Start one loaded part as a sub-plugin while this row still runs. The load is held by an
     * effect: once the row stops (disposed, or unloaded for a reload), the cleanup marks it dead
     * and a late arrival starts nothing, since a stopped context refuses new effects. A failed
     * load and a failed start are logged the same way.
     */
    function start(ctx, label, load) {
      ctx.effect(() => {
        let live = true
        load().then((plugin) => { if (live) ctx.plugin(plugin) })
          .catch((error) => { ctx.logger?.warn?.(EMBED.unavailable, label, error) })
        return () => { live = false }
      }, EMBED.name + ': ' + label)
    }

    function apply(ctx) {
      const shell = require.async(EMBED.shell)
      start(ctx, EMBED.shell, () => shell)
      for (const part of EMBED.parts) {
        start(ctx, part.chunk, () => Promise.all([shell, require.async(part.chunk)]).then(([{ kit }, module]) => module[part.factory](kit)))
      }
      start(ctx, EMBED.instance, () => Promise.all([require.async(EMBED.instance), require.async(EMBED.status)])
        .then(([instance, { shared, layout }]) => instance.instancePlugin(shared, layout)))
    }

    // No inject of its own: each part declares the client services it needs and starts with them.
    return { name: EMBED.name, apply }
  },
})

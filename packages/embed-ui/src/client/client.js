/**
 * fishball-embed-ui, browser half (V3 R-EMBED; R-ARCH-04: every host-DSH UI change Fishball makes
 * comes from this package). It loads the two V2 main-DSH clients that R-EMBED moved here unchanged
 * and runs each as its own sub-plugin of this row, so each keeps its name, injects and effects:
 * - client.connector.js: the V2 connector client (brand, Fishball view and frame, sidebar row,
 *   Hand over / Take back, managed marks, ask_fishball row, card records, the connector's Plugins
 *   card), with its own chunk client.records.js;
 * - client.instance.js: the instance's Plugins card, given the instance-owned status line
 *   client.status.js (a symlink to packages/instance/src/child-settings/client.status.js).
 *
 * They are package-local chunks, not folders, because DSH's client modules serve a package's
 * `client.js` and only `client.<name>.js` files beside it (CLIENT_CHUNK in dsh-client-modules, the
 * same in 0.2.1-rc.5 and 0.2.2-rc.1), and this repository has no build step (user decision
 * 2026-11-13). U-SHELL later splits them into its shell, marks, attention and records modules.
 *
 * Each part loads on its own: a chunk that fails to load loses only its part, logged once, never
 * the other. A part that arrives after this row stopped is not started. Because the parts arrive
 * as chunks after this entry runs, they start one chunk request later than the V2 bundles did
 * (DESIGN.md §17).
 */
window.__ModuleLoader__.load({
  id: 'fishball-embed-ui',
  factory(require) {
    const EMBED = Object.freeze({
      name: 'fishball-embed-ui',
      connector: './client.connector.js',
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
      start(ctx, EMBED.connector, () => require.async(EMBED.connector))
      start(ctx, EMBED.instance, () => Promise.all([require.async(EMBED.instance), require.async(EMBED.status)])
        .then(([instance, { shared, layout }]) => instance.instancePlugin(shared, layout)))
    }

    // No inject of its own: each part declares the client services it needs and starts with them.
    return { name: EMBED.name, apply }
  },
})

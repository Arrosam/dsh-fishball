/**
 * fishball-core's `dsh.client` entry (design §5a.1): the browser half of its `fishball-ui`
 * component. DSH serves it once for the package, because core's patch mounts exactly one row whose
 * module has no manifest of its own (`fishball-ui`, ui/patch/index.js); every other core row is a
 * package subpath (`fishball-core/...`) or its own ui package, so DSH's client modules never see
 * core mounted twice (I-PLACE probe Q-13, both SDKs).
 *
 * It starts core's own settings page, the package-local chunk client.settings.js, as a sub-plugin
 * of this row (F-SETTINGS: the page on DSH's Plugins page and its two entries on the Fishball
 * page), the same in a hosted child and in a standalone DSH. The page and the Recommended tab stay
 * their own ui packages for now.
 *
 * A chunk that fails to load loses only the settings page, logged once; a chunk that arrives after
 * this row stopped is not started (the same rule as dsh-connector-ui's parts).
 */
window.__ModuleLoader__.load({
  id: 'fishball-core',
  factory(require) {
    const CORE = Object.freeze({
      name: 'fishball-core',
      settings: './client.settings.js',
      effect: 'fishball-core: settings page',
      unavailable: 'fishball core: settings page unavailable',
    })

    // The same load-then-start shape as dsh-connector-ui's parts (its client.js `start`). It is
    // copied, not shared: two browser packages could share it only through a library chunk both
    // load, and no such client library exists in the set.

    function apply(ctx) {
      ctx.effect(() => {
        let live = true
        require.async(CORE.settings).then(({ settingsPlugin }) => { if (live) ctx.plugin(settingsPlugin) })
          .catch((error) => { ctx.logger?.warn?.(CORE.unavailable, error) })
        return () => { live = false }
      }, CORE.effect)
    }

    // No inject of its own: the settings page declares the client services it needs and starts with them.
    return { name: CORE.name, apply }
  },
})

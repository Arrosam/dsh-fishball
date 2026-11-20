/**
 * dsh-instance's browser half: its own plugin settings page, and nothing else (I-HOST;
 * requirements 1.33 Q-D1 = B, R-ARCH-05: "It changes nothing in the host DSH's own UI; its only
 * browser code is its own plugin settings page"). It loads its two package-local chunks (DSH serves
 * a package's `client.<name>.js` siblings of its `client.js`, CLIENT_CHUNK, both SDKs) and starts
 * the page as its own sub-plugin:
 * - client.status.js: the status line, its Retry and Retry's notice;
 * - client.models.js: the page (Reconnect, Open Fishball, model sync and the row's fields);
 * - client.fishball.js: plugins for the embedded Fishball on DSH's Plugins page (design §28): the
 *   Fishball tab, the Add plugin menu item, the per-plugin button and the install dialog. This
 *   one contributes to DSH's own Plugins page, beyond the instance's settings page (the user,
 *   2026-11-20: every package operation on the child profile moved to the main DSH).
 * A chunk that fails to load is logged once and loses the page; a chunk that arrives after this row
 * stopped is not started (the rule dsh-connector-ui's client.js follows too, restated: the two
 * packages share no browser library).
 */
window.__ModuleLoader__.load({
  id: 'dsh-instance',
  factory(require) {
    const PAGE = Object.freeze({
      name: 'dsh-instance',
      status: './client.status.js',
      page: './client.models.js',
      fishball: './client.fishball.js',
      unavailable: 'dsh-instance: settings page unavailable',
    })

    function apply(ctx) {
      ctx.effect(() => {
        let live = true
        Promise.all([require.async(PAGE.page), require.async(PAGE.status), require.async(PAGE.fishball)])
          .then(([page, { shared, layout }, fishball]) => {
            if (!live) return
            ctx.plugin(page.instancePlugin(shared, layout))
            ctx.plugin(fishball.fishballPlugin(shared, layout))
          })
          .catch((error) => { ctx.logger?.warn?.(PAGE.unavailable, error) })
        return () => { live = false }
      }, PAGE.name + ': settings page')
    }

    // No inject of its own: the page declares the client services it needs and starts with them.
    return { name: PAGE.name, apply }
  },
})

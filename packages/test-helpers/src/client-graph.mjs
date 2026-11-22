/**
 * The module table of a scripted DSH page: DSH's browser module loader as the served client
 * bundles see it (dsh-client-modules' `require`, `require.async` for package-local chunks,
 * `require.asset`), and the Cordis apply of every graph entry with its declared `inject` list.
 *
 * Used by the scripted page (page.mjs): it runs the scripts unread in browser-sandbox.mjs.
 */

/**
 * @param options.page - the browser sandbox (its `registrations` fill the table).
 * @param options.platform - modules the page answers itself (react, primitives, ...), by specifier.
 * @param options.graph - the graph entries this page loaded ({ id, rev, ... }).
 * @param options.loadChunk - `(ownerId, file, row) => Promise<void>`: fetch and run one package-local chunk.
 * @returns {{ materialize(key: string): unknown }} a graph entry by id, a chunk by `<id>/<file>`.
 */
export function moduleTable({ page, platform, graph, loadChunk }) {
  const registered = new Map(page.registrations.map((r) => [r.chunk === undefined ? r.id : r.id + '/' + r.chunk, r]))
  const exportsOf = new Map()
  const materialize = (key) => {
    if (!exportsOf.has(key)) exportsOf.set(key, registered.get(key).factory(requireFor(key.split('/')[0])))
    return exportsOf.get(key)
  }
  function requireFor(ownerId) {
    const require = (spec) => {
      if (spec in platform) return platform[spec]
      const id = spec.replace(/\/client$/, '')
      if (registered.has(id)) return materialize(id)
      throw new Error('scripted page: require(' + JSON.stringify(spec) + ') missed the module table')
    }
    require.async = async (spec) => {
      if (!spec.startsWith('./')) return require(spec)
      const file = spec.slice(2)
      const key = ownerId + '/' + file
      if (!registered.has(key)) {
        await loadChunk(ownerId, file, graph.find((entry) => entry.id === ownerId))
        for (const r of page.registrations) if (r.chunk !== undefined) registered.set(r.id + '/' + r.chunk, r)
      }
      return materialize(key)
    }
    require.asset = (reference) => reference
    return require
  }
  return { materialize }
}

/**
 * Apply every graph entry that exports a Cordis plugin to `root`, as DSH's page does.
 * A factory that throws is recorded in `errors` and skipped.
 * @returns {{ id: string, inject: string[], fiber: unknown }[]}
 */
export function applyPlugins(root, graph, table, errors) {
  const plugins = []
  for (const entry of graph) {
    let plugin
    try { plugin = table.materialize(entry.id) } catch (error) { errors.push(entry.id + ': ' + error.message); continue }
    plugin = plugin?.default ?? plugin
    if (typeof plugin?.apply !== 'function') continue
    plugins.push({ id: entry.id, inject: plugin.inject ?? [], fiber: root.plugin(plugin) })
  }
  return plugins
}

/**
 * DSH's browser module table as served client bundles see it, and the Cordis apply of a page's
 * graph entries.
 *
 * DSH serves each browser bundle as a classic script that registers itself with
 * `__ModuleLoader__.load({id, factory})` (a package-local chunk with `{id, chunk: <file>, factory}`).
 * A factory receives DSH's `require` (dsh-client-modules):
 * - `require(spec)`: a platform module the page answers itself (react, the primitives, …) by
 *   specifier, else another graph entry by id (`<id>/client` names the same entry);
 * - `require.async('./<file>')`: one of the owner's package-local chunks, fetched and run on first
 *   use; any other specifier is `require`;
 * - `require.asset(reference)`: the reference itself.
 * Every graph entry whose exports are a Cordis plugin (`apply`, optional `inject`) is applied to
 * the page's root context, as DSH's page does.
 */
import path from 'node:path'

const GRAPH = Object.freeze({ localPrefix: './', clientSuffix: /\/client$/, separator: '/', rev: 'fbtest' })

const keyOf = (r) => (r.chunk === undefined ? r.id : r.id + GRAPH.separator + r.chunk)

/**
 * @param options.page - a ./browser-sandbox page (its `registrations` fill the table).
 * @param options.platform - modules the page answers itself, by specifier.
 * @param options.graph - the graph entries this page loaded (`{id, rev, …}`).
 * @param options.loadChunk - `(ownerId, file, entry) => Promise<void>`: fetch and run one package-local chunk.
 * @returns {{ materialize(key), has(key), required: string[] }} a graph entry by id, a chunk by
 *   `<id>/<file>` (its factory runs once); `required` lists every specifier asked of `require`.
 */
export function moduleTable({ page, platform, graph, loadChunk }) {
  const registered = new Map(page.registrations.map((r) => [keyOf(r), r]))
  const exportsOf = new Map()
  const required = []
  const refresh = () => { for (const r of page.registrations) if (!registered.has(keyOf(r))) registered.set(keyOf(r), r) }
  const materialize = (key) => {
    refresh()
    if (!registered.has(key)) throw new Error('scripted page: nothing registered as ' + JSON.stringify(key))
    if (!exportsOf.has(key)) exportsOf.set(key, registered.get(key).factory(requireFor(key.split(GRAPH.separator)[0], key)))
    return exportsOf.get(key)
  }
  function requireFor(ownerId, ownerKey) {
    // A scoped id (`@scope/name`) holds a separator itself: the owner is the graph entry the key starts with.
    const owner = graph.find((entry) => ownerKey === entry.id || ownerKey.startsWith(entry.id + GRAPH.separator))?.id ?? ownerId
    const require = (spec) => {
      required.push(spec)
      if (spec in platform) return platform[spec]
      const id = spec.replace(GRAPH.clientSuffix, '')
      refresh()
      if (registered.has(id)) return materialize(id)
      throw new Error('scripted page: require(' + JSON.stringify(spec) + ') missed the module table')
    }
    require.async = async (spec) => {
      if (!spec.startsWith(GRAPH.localPrefix)) return require(spec)
      const file = spec.slice(GRAPH.localPrefix.length)
      const key = owner + GRAPH.separator + file
      refresh()
      if (!registered.has(key)) await loadChunk(owner, file, graph.find((entry) => entry.id === owner))
      return materialize(key)
    }
    require.asset = (reference) => reference
    return require
  }
  return { materialize, has: (key) => { refresh(); return registered.has(key) }, required }
}

/**
 * Apply every graph entry that exports a Cordis plugin to `root`, as DSH's page does. A factory
 * that throws is recorded in `errors` (`<id>: <message>`) and skipped; an entry whose exports are
 * not a plugin is skipped.
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

/**
 * Run a page's client files and build its module table: each client `{id, file}` is run unread
 * (its file URL as `currentScript.src`), and its chunks load from the client file's own folder, as
 * DSH's package-local chunk route serves them. `chunkFiles` (`{'<id>/<file>' | '<file>': absPath}`)
 * loads another file in place of one chunk (a base-commit copy, for a regression check).
 * @returns {{ graph, table, loads: Set<Promise>, settleChunks(settle) }} `loads` holds the chunk loads
 *   in flight; `settleChunks(settle)` settles until none is.
 */
export function loadClients(page, clients, { platform, chunkFiles = {} }) {
  for (const client of clients) page.runFile(client.file)
  const graph = clients.map((c) => ({ id: c.id, rev: GRAPH.rev }))
  const dirOf = (owner) => path.dirname(clients.find((c) => c.id === owner).file)
  const loads = new Set()
  const loadChunk = (owner, file) => {
    const load = (async () => page.runFile(chunkFiles[owner + GRAPH.separator + file] ?? chunkFiles[file] ?? path.join(dirOf(owner), file)))()
    loads.add(load)
    load.finally(() => loads.delete(load)).catch(() => {})
    return load
  }
  const table = moduleTable({ page, platform, graph, loadChunk })
  async function settleChunks(settle) {
    await settle()
    while (loads.size > 0) {
      await Promise.allSettled([...loads])
      await settle()
    }
  }
  return { graph, table, loads, settleChunks }
}

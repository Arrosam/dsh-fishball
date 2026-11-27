/**
 * Module swapping for test worlds: one module graph loaded under a world tag, with some of its
 * modules answered by fakes. A module imported with `?<tag>=<id>` carries that tag to every module
 * it loads below `root`, so each world has its own module instances; a module that resolves to a
 * key of `replace` (an absolute file, or a builtin specifier such as 'node:fs/promises') is answered
 * with that key's fake instead, which carries the tag (and the original's other query parameters)
 * and finds its world's state with `worldOf(tag, import.meta.url)`. A fake never replaces itself,
 * so a fake of a builtin can import the real one.
 *
 * Registered after the SDK binding hook (sdk.mjs), this hook runs first and delegates to it, so a
 * world bound to an SDK stays bound. The state lives on globalThis: a fake may load its own copy of
 * this module (bound to an SDK), and it must see the same worlds.
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const REGISTRY = Symbol.for('dsh-instance.test-helpers.swap')
const registry = (globalThis[REGISTRY] ??= { hooked: false, kinds: new Map() })

const tagOf = (url, tag) => { try { return new URL(url).searchParams.get(tag) ?? undefined } catch { return undefined } }
const withTag = (url, tag, id) => { const next = new URL(url); next.searchParams.set(tag, id); return next.href }
const bare = (url) => { const u = new URL(url); u.search = ''; return u.href }
const keyOf = (key) => (path.isAbsolute(key) ? pathToFileURL(key).href : key)

function hook() {
  if (registry.hooked) return
  registry.hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      for (const [tag, kind] of registry.kinds) {
        const id = tagOf(context.parentURL, tag)
        if (id === undefined) continue
        const parent = bare(context.parentURL)
        const builtin = kind.replace.get(specifier)
        if (builtin !== undefined && builtin !== parent) return { url: withTag(builtin, tag, id), shortCircuit: true }
        const resolved = nextResolve(specifier, context)
        if (!resolved.url.startsWith(kind.root)) return resolved
        const fake = kind.replace.get(bare(resolved.url))
        if (fake === undefined || fake === parent) return { ...resolved, url: withTag(resolved.url, tag, id) }
        const url = new URL(fake)
        for (const [name, value] of new URL(resolved.url).searchParams) url.searchParams.set(name, value)
        return { ...resolved, url: withTag(url.href, tag, id) }
      }
      return nextResolve(specifier, context)
    },
  })
}

/**
 * One kind of world, named by its query `tag`: `root` is the folder whose modules carry the tag,
 * `replace` maps a module (absolute file or builtin specifier) to its fake (absolute file).
 * Returns `{open(state) → id, close(id), importIn(id, file, params?)}`: `open` registers a world's
 * state (installing the hook at the first world), `importIn` imports `file` in that world with
 * the extra query `params` (e.g. an SDK tag).
 */
export function swapWorlds(tag, { root, replace }) {
  const kind = registry.kinds.get(tag) ?? {
    root: pathToFileURL(path.resolve(root) + path.sep).href,
    replace: new Map(Object.entries(replace).map(([key, fake]) => [keyOf(key), pathToFileURL(fake).href])),
    worlds: new Map(),
    counter: 0,
  }
  registry.kinds.set(tag, kind)
  return {
    open(state) { hook(); const id = String(++kind.counter); kind.worlds.set(id, state); return id },
    close(id) { kind.worlds.delete(id) },
    importIn(id, file, params = {}) {
      const url = new URL(pathToFileURL(file))
      for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
      return import(withTag(url.href, tag, id))
    },
  }
}

/** In a fake: the state of the world whose tag its own `url` (import.meta.url) carries. */
export const worldOf = (tag, url) => registry.kinds.get(tag)?.worlds.get(tagOf(url, tag))

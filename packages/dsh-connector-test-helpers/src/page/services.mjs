/**
 * The page services a scripted DSH page provides to client plugins: `slots` (register, inject,
 * entries), `locale` (register, bind, snapshot, language switch) and `layout` (panel info,
 * selectPanel). Re-renders go through the React shim's `rerender`.
 */
/** @param shim - a createReactShim() instance; @param lang - the page language. */
export function pageServices(shim, lang) {
  const entries = new Map()
  const bump = () => shim.rerender()
  const slots = {
    register(options, Component) {
      const list = entries.get(options.name) ?? []
      entries.set(options.name, list)
      const entry = { options, Component }
      list.push(entry)
      bump()
      return () => { const at = list.indexOf(entry); if (at >= 0) { list.splice(at, 1); bump() } }
    },
    // The slot is always declared here, so the injection runs once and its effect is disposed with it.
    // An effect is a disposer or, from a generator callback, an iterable of disposers (the V2 main clients yield several).
    inject(_name, callback) {
      const effect = callback()
      const disposers = typeof effect === 'function' ? [effect] : effect && typeof effect[Symbol.iterator] === 'function' ? [...effect] : []
      return () => { for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose() }
    },
    entries: (name) => [...(entries.get(name) ?? [])],
    entriesOfSlot: (name) => [...(entries.get(name) ?? [])],
    subscribe: () => () => {},
    getVersion: () => 0,
  }
  const dictionaries = new Map()
  const listeners = new Set()
  const translate = (ns, key, params) => {
    const dicts = dictionaries.get(ns)
    const template = dicts?.[lang]?.[key] ?? dicts?.en?.[key] ?? key
    return params && typeof template === 'string' ? template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : template
  }
  let snapshot = { active: lang, revision: 0 }
  const setLang = (next) => {
    if (next === lang) return
    lang = next
    snapshot = { active: lang, revision: snapshot.revision + 1 }
    for (const notify of [...listeners]) notify()
    bump()
  }
  const locale = {
    register(ns, dicts) { dictionaries.set(ns, dicts); bump(); return () => { if (dictionaries.get(ns) === dicts) dictionaries.delete(ns) } },
    bind: (ns) => (key, params) => translate(ns, key, params),
    getSnapshot: () => snapshot,
    getLocale: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    resolveText: (text) => (typeof text === 'string' ? text : text?.[lang] ?? text?.en),
  }
  let active = null
  const layout = {
    panelInfo: { getSnapshot: () => ({ activePanelId: active }), subscribe: () => () => {} },
    selectPanel(id) { active = id; bump() },
    toggleSidebar() {},
  }
  return { slots, locale, layout, entries, setLang }
}

/**
 * Load the child's Fishball client bundles into one scripted page and apply them.
 * @param t - node:test context (cleanup).
 * @param options.sdk - the SDK whose Cordis applies the plugins.
 * @param options.child - { origin, cookie } from admitChild.
 * @param options.lang - page language.
 * @param options.exclude - `(entry, source) => boolean`: graph entries this page does not load (the

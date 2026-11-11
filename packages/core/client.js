/**
 * fishball-core's `dsh.client` entry (design §5a.1). A placeholder with no behaviour (user
 * decision 2026-11-12): the fishball-ui page, recommended tab and slim settings still live in
 * their own ui/ packages, which the hosted child loads as separate rows, and core's bundle patch
 * inserts no row yet, so nothing loads this file. F-GUARDS (spike V3-S6) merges the ui packages
 * into this one entry.
 */
window.__ModuleLoader__.load({
  id: 'fishball-core',
  factory() {
    return { name: 'fishball-core', apply() {} }
  },
})

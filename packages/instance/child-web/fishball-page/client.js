/** Native modules serves classic script registrations, not raw ESM exports. */
window.__ModuleLoader__.load({
  id: 'fishball-page',
  factory() {
    return {
      name: 'fishball-page',
      apply() {
        // PG-1 owns view registration/guards. No navigation or localStorage writes here:
        // a loaded shell does not prove same-origin shortcut or session isolation.
      },
    }
  },
})

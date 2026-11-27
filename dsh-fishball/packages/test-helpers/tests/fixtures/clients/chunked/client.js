// A browser half that loads its package-local chunk on demand (the module table's require.async).
window.__ModuleLoader__.load({ id: 'fbtest-chunked', factory: (require) => ({ part: () => require.async('./client.part.js'), platform: () => require('react') }) })

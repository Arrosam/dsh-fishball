// A browser half that loads its package-local chunk on demand (the injected module loader's async method).
window.__ModuleLoader__.load({ id: 'fbtest-chunked', factory: (load) => ({ part: () => load.async('./client.part.js'), platform: () => load('react') }) })

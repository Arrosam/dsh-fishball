window.__ModuleLoader__.load({ id: 'fbtest-chunked', chunk: 'client.part.js', factory: () => { globalThis.partFactories = (globalThis.partFactories ?? 0) + 1; return { word: 'own part' } } })

// A browser half whose factory throws: the page records a module error and applies the others.
window.__ModuleLoader__.load({ id: 'fbtest-broken', factory: () => { throw new Error('fbtest broken factory') } })

// A browser half whose apply throws: Cordis marks its fiber failed.
window.__ModuleLoader__.load({ id: 'fbtest-failing', factory: () => ({ name: 'fbtest-failing', apply() { throw new Error('fbtest failing apply') } }) })

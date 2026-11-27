// A stand-in for the probe's chunk (the scripted page's chunkFiles replacement).
window.__ModuleLoader__.load({ id: 'fbtest-probe', chunk: 'client.part.js', factory: () => ({ word: 'replacement part' }) })

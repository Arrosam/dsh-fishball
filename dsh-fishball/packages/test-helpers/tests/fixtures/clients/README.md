# Fixture clients

Classic browser scripts, shaped as DSH serves a package's browser half (`__ModuleLoader__.load`), that
fishball-test-helpers' own cases run in the scripted page. They belong to no Fishball package.

| folder | what it is |
|---|---|
| `probe/` | a settings page over DSH's form model, an entry while one of two namespaces is served, and its package-local chunk `client.part.js` |
| `chunked/` | a module whose export loads its chunk `client.part.js` on demand; `other.part.js` registers under the same chunk name |
| `replacement/` | another `client.part.js` (the `chunkFiles` replacement) |
| `broken/` | a factory that throws (a module error) |
| `failing/` | an apply that throws (a failed Cordis fiber) |

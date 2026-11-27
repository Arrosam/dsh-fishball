# fishball-core tests: shared support

Modules several of core's test areas use. Owned by the wire area; another area adds its own as
`<area>-*.mjs` (events: [events-dsh.mjs](<events-dsh.mjs>)).

| module | what |
|---|---|
| [targets-oracle.mjs](<targets-oracle.mjs>) | MULTI-1 oracles restated from the MULTI-0 freeze (contracts/constants.js, fishball-shared ui-seam): ids, keys, handles, credential names, aliases, tool names |
| [core-world.mjs](<core-world.mjs>) (+ [core-world-ext.mjs](<core-world-ext.mjs>), [core-world-names.mjs](<core-world-names.mjs>)) | a booted DSH with core (fishball-test-helpers/dsh-world): `bootCore`, `corePackages`, `CORE_EXTENSION`, `requestAs`, `post`; core's world ops (shape, ensure, snapshot, guards, tools, managerTurn/Call/Tools/System, inbox ids and deliveries, presets, targets, asks, bridge, attention, core off/on, home patch, setChildUrl) |
| [core-static.mjs](<core-static.mjs>) | core's manifest, its patch as DSH parses it, composition with DSH's shipped bundles, `!!js` resolution by DSH's loader, shipped import specifiers |
| [link-swap.mjs](<link-swap.mjs>) | `importWithLink(entry, spy)`: a core module graph with core's link replaced by a test's link module |

# fishball-consultant tests

Run from the repository root with `node scripts/test.mjs fishball-consultant`.

- [consultant.test.mjs](<consultant.test.mjs>) covers the fail-closed consultation lifecycle, owner approval, delivery and replay, quotas, and archival.
- [host.test.mjs](<host.test.mjs>) covers tools, routes, discovery, storage, and the production row's fail-closed binding. The two SDK peers are test doubles; `fishball-shared` resolves as the package's declared dependency.

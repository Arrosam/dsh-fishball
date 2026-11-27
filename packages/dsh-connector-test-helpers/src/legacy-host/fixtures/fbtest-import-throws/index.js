/** Fishball-only fixture whose module throws while it is imported (CASES.md A35); the import is recorded first. */
const store = (globalThis.__fbtestFixtures ??= {})
store.bundleEvents ??= []
store.bundleEvents.push({ bundle: 'fbtest-import-throws', type: 'import', at: Date.now() })
throw new Error('fbtest-import-throws: module throws on purpose')

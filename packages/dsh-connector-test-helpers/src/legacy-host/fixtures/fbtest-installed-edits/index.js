/**
 * Revision 10b: installed for Fishball only, its patch edits another row, so it is blocked and never
 * mounted. Self-contained, with no imports, because the install copies it into Fishball's folder.
 */
const store = (globalThis.__fbtestFixtures ??= {})
store.bundleEvents ??= []

export const name = 'fbtest-installed-edits'
export function apply(ctx) {
  ctx.effect(() => {
    store.bundleEvents.push({ bundle: name, type: 'apply', at: Date.now() })
    return () => { store.bundleEvents.push({ bundle: name, type: 'dispose', at: Date.now() }) }
  }, 'fbtest-installed-edits fixture')
}

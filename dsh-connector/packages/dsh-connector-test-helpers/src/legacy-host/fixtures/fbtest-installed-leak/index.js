/**
 * Revision 10b: a package installed through DSH's plugin manager while DSH runs that provides a service of
 * its own (fbtestInstalledLeaked), so Fishball turns it off with leaks-service. Self-contained, with no
 * imports, because the install copies it into the profile.
 */
const store = (globalThis.__fbtestFixtures ??= {})
store.bundleEvents ??= []

export const name = 'fbtest-installed-leak'
export function apply(ctx) {
  ctx.effect(() => {
    store.bundleEvents.push({ bundle: name, type: 'apply', at: Date.now() })
    return () => { store.bundleEvents.push({ bundle: name, type: 'dispose', at: Date.now() }) }
  }, 'fbtest-installed-leak fixture')
  ctx.provide('fbtestInstalledLeaked', { fbtest: true })
}

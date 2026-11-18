import assert from 'node:assert/strict'
import { brandPage } from './page.mjs'
import { SLOT } from './constants.mjs'

/** Count host resources rather than calls to private cleanup functions. A disposer may throw *after*
 * releasing its own injection; all other releases must still run. */
function probe(fault) {
  const roots = new Set(), live = new Set(), attempts = [], released = [], faults = []
  const fail = (where) => { faults.push(where); throw new Error('fbtest: ' + where) }
  function prepareWorld(w) {
    const Observer = w.html.MutationObserver
    w.html.MutationObserver = class extends Observer {
      observe(node, options) { super.observe(node, options); if (node === w.html.element) roots.add(this) }
      disconnect() { roots.delete(this); super.disconnect() }
    }
    const slots = w.services.slots, inject = slots.inject
    // A slot registration needn't have a mounted consumer. Leave faulting occupants unrendered:
    // a leaked registration must fail the resource oracle, not crash a later React render.
    if (fault !== 'reentry') {
      const register = slots.register
      slots.register = (options, component) => register(options, Object.values(SLOT).includes(options.name) ? () => null : component)
    }
    slots.inject = (name, callback) => {
      if (!Object.values(SLOT).includes(name)) return inject(name, callback)
      attempts.push(name)
      if (fault === 'initial' && attempts.length === 1) fail(fault)
      if (fault === 'second' && attempts.length === 2) fail(fault)
      const off = inject(name, callback), token = { name }
      live.add(token)
      return () => {
        live.delete(token); released.push(name); off()
        if (fault === 'dispose' && released.length === 1) fail(fault)
      }
    }
  }
  return { roots, live, attempts, released, faults, prepareWorld }
}
export function registerFaults(t, sdk) {
  for (const [fault, title] of Object.entries({
    initial: 'initial synchronous injection failure leaves no root watcher',
    second: 'second injection throws: first injection and root watcher are released',
    dispose: 'one throwing disposer cannot strand the other injection or root watcher',
    reentry: 'page-mark exit retains the watcher for re-entry; part teardown releases it',
  })) {
    t('LOGO-FIX', fault, title, async (c) => {
      const p = probe(fault), page = await brandPage(c, sdk, { prepareWorld: p.prepareWorld })
      if (fault === 'reentry') {
        assert.equal(p.live.size, 2)
        await page.setPageMark(false)
        assert.equal(p.live.size, 0)
        assert.ok(p.roots.size > 0, 'still watching for re-entry')
        await page.setPageMark(true)
        assert.equal(p.live.size, 2)
        assert.ok(page.markRoot() && page.nameRoot(), 'both occupants remount')
      } else if (fault === 'dispose') assert.equal(p.live.size, 2, 'two independently releasable injections')
      await page.unmountBrand()
      assert.deepEqual(p.faults, fault === 'reentry' ? [] : [fault], 'host actually exercised the fault')
      assert.deepEqual(p.released.toSorted(), (fault === 'initial' ? [] : fault === 'second' ? p.attempts.slice(0, 1) : p.attempts).toSorted(), 'every successful injection released')
      assert.deepEqual([p.live.size, p.roots.size], [0, 0], 'no live injection or root observer after part teardown')
    })
  }
}

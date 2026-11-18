import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { CORDIS_ENTRY, runtimeOf } from '../../fishball-core/settings/constants.mjs'
import { brandPage } from './page.mjs'
import { SLOT } from './constants.mjs'
import { CLIENT, UI_PACKAGE } from '../package/constants.mjs'

/** Use the installed renderer/Cordis implementations for controller reconciliation and effect
 * disposal. SlotCore ships inside the frontend, not as an importable package; supply only its
 * declaration ledger and contribution storage. Never implement inject/stop in this stand-in. */
async function registryHost(sdk, failing) {
  const runtime = runtimeOf(sdk), cordis = await import(pathToFileURL(path.join(runtime, CORDIS_ENTRY)).href)
  const declarations = new Map(), waits = new Map(), entries = new Map(), registered = [], failures = []
  const asyncErrors = []
  const expected = new Error(`fbtest: deferred ${failing}`)
  class SlotCore {
    onMutate(fn) { this.changed = fn }
    specDynamic(key) { return declarations.get(key) }
    declarationEpoch(key) { return declarations.has(key) ? 1 : 0 }
    subscribeDeclaration(key, fn) { const set = waits.get(key) ?? new Set(); waits.set(key, set); set.add(fn); return () => set.delete(fn) }
    register(options, component) {
      const key = options.name
      registered.push(key)
      if (key === failing) { failures.push(key); throw expected }
      const entry = { options, component }, set = entries.get(key) ?? new Set()
      entries.set(key, set); set.add(entry); this.changed(key)
      return () => { set.delete(entry); this.changed(key) }
    }
    entries(key) { return [...entries.get(key) ?? []] }
  }
  const id = '@deepseek-ai/dsh-client-ui-renderer'
  const file = path.join(runtime, id, 'lib/client.js')
  let renderer
  runInNewContext(readFileSync(file, 'utf8'), {
    window: { __ModuleLoader__: { load(module) { assert.equal(module.id, id); renderer = module } } },
    // Observe the renderer's uncaught-error channel separately from the injected registration fault.
    Error, queueMicrotask: fn => queueMicrotask(() => { try { fn() } catch (error) { asyncErrors.push(error) } }),
  }, { filename: file })
  const platform = { '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-ui-slots': { SlotCore },
    react: { createContext: () => ({}), Component: class {} }, 'react-dom': {}, 'react-dom/client': {}, 'react/jsx-runtime': {} }
  const { SlotRegistry } = renderer.factory(name => { assert.ok(Object.hasOwn(platform, name), name); return platform[name] })
  const ctx = new cordis.Context(), registry = new SlotRegistry(ctx)
  const effects = () => ctx.fiber.getEffects().map(meta => meta.label).filter(label => label.startsWith('slots.'))
  return { registry, effects, registered, failures, asyncErrors, waitCount: () => [...waits.values()].reduce((n, set) => n + set.size, 0),
    declare(key) { declarations.set(key, { scope: 'root' }); for (const fn of [...waits.get(key) ?? []]) fn() } }
}

/** Count host resources rather than calls to private cleanup functions. A disposer may throw *after*
 * releasing its own injection; all other releases must still run. */
function probe(fault, host) {
  const roots = new Set(), live = new Set(), attempts = [], released = [], faults = []
  const fail = (where) => { faults.push(where); throw new Error('fbtest: ' + where) }
  function prepareWorld(w) {
    // Deliver inert sibling chunks via the same module-loader seam used by the real brand chunk.
    // Other UI parts legitimately watch <html>; only the brand part owns resources under test.
    const configure = w.onSandbox
    w.onSandbox = (sandbox) => {
      configure?.(sandbox)
      for (const part of Object.values(CLIENT.parts)) if (part !== CLIENT.parts.brand) {
        sandbox.__ModuleLoader__.load({ id: UI_PACKAGE.name, chunk: part.file, factory: () => ({ [part.export]: () => ({ name: part.file, apply() {} }) }) })
      }
    }
    const Observer = w.html.MutationObserver
    w.html.MutationObserver = class extends Observer {
      observe(node, options) { super.observe(node, options); if (node === w.html.element) roots.add(this) }
      disconnect() { roots.delete(this); super.disconnect() }
    }
    const slots = w.services.slots, inject = slots.inject, register = slots.register
    slots.register = (options, component) => {
      if (!Object.values(SLOT).includes(options.name)) return register(options, component)
      if (host) return host.registry.register(options, component)
      // A slot registration needn't have a mounted consumer. Observe leaked registrations even
      // after setup has failed, without trying to render a partially initialized component.
      return register(options, fault === 'reentry' ? component : () => null)
    }
    slots.inject = (name, callback) => {
      if (!Object.values(SLOT).includes(name)) return inject(name, callback)
      attempts.push(name)
      if (fault === 'initial' && attempts.length === 1) fail(fault)
      if (['second', 'late'].includes(fault) && attempts.length === 2) fail(fault)
      const token = { name }
      const off = host ? host.registry.inject(name, callback) : inject(name, callback)
      live.add(token)
      return () => {
        if (!live.delete(token)) return
        released.push(name); off()
        if (fault === 'dispose' && released.length === 1) fail(fault)
      }
    }
  }
  return { roots, live, attempts, released, faults, prepareWorld }
}
export function registerFaults(t, sdk) {
  for (const failing of Object.values(SLOT)) {
    t('LOGO-FIX', `deferred ${failing}`, 'real SDK registry releases both declaration waits, all entries and all declaration effects', async c => {
      const host = await registryHost(sdk, failing), p = probe('deferred', host)
      const names = Object.values(SLOT), sibling = names.find(name => name !== failing)
      // Both inject calls already returned. Declare the working slot first (vary which of the
      // two it is), so the later failure must remove a provably live sibling contribution.
      const page = await brandPage(c, sdk, { prepareWorld: p.prepareWorld })
      assert.deepEqual(p.attempts.toSorted(), names.toSorted())
      assert.deepEqual([p.live.size, host.waitCount(), host.registered.length], [2, 2, 0])
      host.declare(sibling)
      assert.equal(host.registry.entries(sibling).length, 1)
      assert.ok(host.effects().includes(`slots.inject(${JSON.stringify(sibling)}): declaration`), 'Cordis exposes the active declaration effect')
      assert.ok(p.roots.size > 0)
      host.declare(failing)
      assert.deepEqual(host.registered, [sibling, failing]); assert.deepEqual(host.failures, [failing])
      assert.deepEqual(names.map(name => host.registry.entries(name).length), [0, 0], 'no live contribution, before any yield')
      assert.equal(p.roots.size, 0, 'released root observer synchronously')
      // The failing callback is still returning its effect to the renderer during reconcile.
      // Give it one ordinary microtask, not plugin teardown, to dispose that final effect.
      await Promise.resolve()
      assert.deepEqual(host.asyncErrors, [], 'no fault escapes through the SDK microtask error channel')
      assert.deepEqual([p.live.size, host.waitCount()], [0, 0], 'neither controller nor its declaration wait survives')
      assert.deepEqual(p.released.toSorted(), names.toSorted())
      assert.deepEqual(host.effects(), [], 'no orphaned Cordis declaration or registration effects')
      await page.unmountBrand()
    })
  }
  for (const [fault, title] of Object.entries({
    initial: 'initial synchronous injection failure leaves no root watcher',
    second: 'second injection throws: first injection and root watcher are released',
    late: 'late page mark: second inject throws; sibling and observer are released immediately',
    dispose: 'one throwing disposer cannot strand the other injection or root watcher',
    reentry: 'page-mark exit retains the watcher for re-entry; part teardown releases it',
  })) {
    t('LOGO-FIX', fault, title, async (c) => {
      const p = probe(fault), page = await brandPage(c, sdk, { mark: fault !== 'late', prepareWorld: p.prepareWorld })
      if (fault === 'late') {
        assert.ok(p.roots.size > 0 && !p.attempts.length, 'listening on an initially unmarked root')
        await page.setPageMark(true)
      }
      if (fault === 'reentry') {
        assert.equal(p.live.size, 2)
        await page.setPageMark(false)
        assert.equal(p.live.size, 0)
        assert.ok(p.roots.size > 0, 'still watching for re-entry')
        await page.setPageMark(true)
        assert.equal(p.live.size, 2)
        assert.ok(page.markRoot() && page.nameRoot(), 'both occupants remount')
      } else if (fault === 'dispose') assert.equal(p.live.size, 2, 'two independently releasable injections')
      else {
        assert.deepEqual(p.faults, [fault], 'setup actually failed before teardown')
        assert.deepEqual([p.live.size, p.roots.size], [0, 0], 'no controller or observer after failed setup, BEFORE part teardown')
        for (const name of Object.values(SLOT)) assert.equal(page.world.entries(name).length, 0, `${name}: no stranded occupant`)
      }
      await page.unmountBrand()
      assert.deepEqual(p.faults, fault === 'reentry' ? [] : [fault], 'host actually exercised the fault')
      const succeeded = fault === 'initial' ? [] : ['second', 'late'].includes(fault) ? p.attempts.slice(0, 1) : p.attempts
      assert.deepEqual(p.released.toSorted(), succeeded.toSorted(), 'every successful injection released')
      assert.deepEqual([p.live.size, p.roots.size], [0, 0], 'no live injection or root observer after part teardown')
    })
  }
}

import assert from 'node:assert/strict'
import { after } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromeBinary, keyFor } from 'fishball-test-helpers/browser'
import { BRAND_FIXTURE as FIXTURE, BRAND_PART, HOOK, LABEL, PAGE_MARK, ROUTE, SLOT, STATUS, UI_PARTS } from '../support/brand.mjs'
import { liteDictionaries, startLiteEnvironment } from '../support/lite-env.mjs'
import { UI } from '../support/ui-page.mjs'

/**
 * The scripts this row serves beside LITE's: fishball-ui's entry and brand chunk, and the helpers'
 * EventSource stand-in (a module the page imports; it imports nothing itself).
 */
const SERVED = Object.freeze({ entry: '/ui-entry.js', events: '/fixture/events.mjs', eventSource: fileURLToPath(import.meta.resolve('fishball-test-helpers/event-source')) })

// Run in the LITE child realm. The real page and real UI/brand modules share a native button but
// have independent lifetimes, like two Cordis plugins. Other UI chunks aren't subjects here.
function prepare({ ctx, platform, mount, loadModule }, spec) {
  const sidebar = document.querySelector('[data-slot="sidebar"]')
  const button = document.createElement('button')
  button.id = 'brand-probe'; button.type = 'button'; button.setAttribute('aria-label', spec.label)
  for (const name of spec.slots) {
    const outlet = document.createElement('span'); outlet.dataset.slot = name; outlet.textContent = 'DSH'; button.append(outlet)
  }
  sidebar.prepend(button)
  const probe = window.brandProbe = { native: 0, opens: [], stage: 'starting', beforeGuard: window.__lite.reach(button.id) }
  // Only clicks run the native shell action: keyboard tests need the browser's default click.
  sidebar.addEventListener('click', (event) => { if (button.contains(event.target)) { probe.native++; ctx.uiWorkspace.startSession() } })
  probe.load = async () => {
    const { eventSourceClass } = await import(spec.events)
    const sources = eventSourceClass()
    window.EventSource = sources.EventSource
    // Both views arrive on the page's one connection (spec.page), each frame under its topic.
    probe.deliver = () => {
      for (const s of sources.live(spec.page)) s.deliver({ topic: spec.asks, frame: { managerSessionId: spec.manager, cards: [] } })
      for (const s of sources.live(spec.page)) s.deliver({ topic: spec.strip, frame: { on: true } })
    }
    const entry = (await loadModule(spec.entry)).factory(require)
    await (entry.default ?? entry).apply(scope)
  }
  // Only the two brand outlets have renderers in this fixture. Unrelated page occupants have
  // no matching host seat, just as in DSH when the relevant panel is closed.
  ctx.slots.register = () => () => {}
  const effects = []
  const scope = { ...ctx, effect(fn) { const out = fn(); effects.push(out); return out },
    // Cordis' service seam: since the image-loop fix fishball-ui's client provides the page connection as a
    // browser service (fishballPageStream) that its parts reach; the fixture keeps it on the one scope.
    provide(name, value) { if (value !== undefined) scope[name] = value }, set(name, value) { scope[name] = value; return () => { delete scope[name] } }, get(name) { return scope[name] },
    // Model an active sidebar while the manager isn't the current view on each activation.
    uiSession: { adapter: { current: { getSnapshot: () => ({ key: null }), subscribe: () => () => {} } } },
    uiWorkspace: { ...ctx.uiWorkspace, openSession(id) { probe.opens.push(id); return Promise.resolve() } },
    slots: { ...ctx.slots, register(options, Component) {
      const outlet = button.querySelector(`[data-slot="${options.name}"]`)
      if (!outlet) throw new Error('unexpected slot ' + options.name)
      const { hooks, ...bound } = options.inject?.() ?? {}
      const React = platform('react')
      for (const [name, store] of Object.entries(hooks ?? {})) bound['use' + name[0].toUpperCase() + name.slice(1)] = (pick = v => v) => pick(React.useSyncExternalStore(store.subscribe, store.getSnapshot))
      const fallback = outlet.textContent
      const unmount = mount(outlet, Component, () => ({ ...bound, size: spec.size, t: ctx.locale.bind(options.locale) }))
      return () => { unmount(); outlet.textContent = fallback }
    } },
    plugin(plugin) { return plugin.apply(scope) },
  }
  const gate = new Promise((resolve, reject) => { probe.resolve = resolve; probe.reject = () => reject(new Error('fbtest: brand download failed')) })
  const require = Object.assign((name) => platform(name), { asset: s => s, async: async (ref) => {
    const file = ref.replace(/^\.\//, '')
    if (file !== spec.brand) return { [spec.parts[file]]: () => ({ name: file, apply() {} }) }
    probe.stage = 'pending'
    try { await gate } catch (err) { probe.stage = 'failed'; throw err }
    return (await loadModule('/' + file)).factory(require)
  } })
  probe.teardown = () => { for (const off of effects.splice(0).reverse()) { if (typeof off === 'function') off(); else off?.dispose?.() } }
}
const metadata = { slots: Object.values(SLOT), label: LABEL.newSession.en, manager: FIXTURE.manager, size: FIXTURE.ownerSize,
  ...ROUTE, entry: SERVED.entry, events: SERVED.events, brand: BRAND_PART.file, parts: Object.fromEntries(UI_PARTS.map(p => [p.file, p.export])) }
const inputs = ['pointer', 'Enter', 'Space']
// A queued event need not have an Element target. Use actual text/element descendants of the
// wordmark (or its native fallback), not the button's own click(), which retargets to the button.
function clickDescendant(slot, kind) {
  const outlet = document.querySelector(`#brand-probe [data-slot="${slot}"]`)
  const text = document.createTreeWalker(outlet, NodeFilter.SHOW_TEXT).nextNode()
  const target = kind === 'Text' ? text : text.parentElement
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  return target.nodeType
}
async function activate(tab, id, how, prior) {
  const reach = await tab.evaluate(`__lite.reach(${JSON.stringify(id)})`)
  // Fail-closed controls can legitimately be hidden. Attempt a real click at the last visible
  // position, or focus + trusted key input; a separate targeted activation below covers queued clicks.
  if (!prior || reach.visible) assert.ok(reach.hit && reach.visible && reach.focused, `${id} not reachable by ${how}: ${JSON.stringify(reach)}`)
  const point = reach.visible ? reach.rect : prior.rect
  if (how === 'pointer') return tab.click(point.x, point.y)
  await tab.evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`)
  return tab.press({ ...keyFor(how), text: how === 'Enter' ? '\r' : ' ' })
}
export function registerNative(t) {
  let browser
  after(async () => { await (await browser)?.stop() })
  for (const state of ['pending', 'failed', 'ready', 'unmounted']) t('LOGO-FIX', state, 'trusted pointer/Enter/Space on the native wide brand button', async (c) => {
    if (!chromeBinary()) return c.skip('needs isolated Chromium')
    const scripts = {
      [SERVED.entry]: () => readFileSync(UI.client, 'utf8'),
      ['/' + metadata.brand]: () => readFileSync(UI.file(metadata.brand), 'utf8'),
      [SERVED.events]: () => readFileSync(SERVED.eventSource, 'utf8'),
    }
    const env = await (browser ??= startLiteEnvironment({ scripts })), tab = await env.openChild()
    c.after(() => tab.close())
    // Identical native control semantics, outside the page: all three inputs really generate clicks.
    await tab.evaluate(`document.body.innerHTML='<button id="unguarded">control</button>'; window.activations=[]; unguarded.onclick=e=>activations.push([e.isTrusted,e.detail])`)
    for (const how of inputs) await activate(tab, 'unguarded', how)
    assert.deepEqual(await tab.evaluate('activations'), [[true, 1], [true, 0], [true, 0]], 'native default click for each key')
    await tab.evaluate(`__lite.start(${JSON.stringify({ dicts: liteDictionaries(), restoredSession: FIXTURE.manager, session: { sessionId: FIXTURE.manager } })}, seams=>(${prepare})(seams,${JSON.stringify(metadata)}))`)
    await tab.evaluate('brandProbe.loading = brandProbe.load(); true')
    const wait = async expression => assert.equal(await tab.evaluate(`(async()=>{ const end=performance.now()+3000; while(!(${expression}) && performance.now()<end) await new Promise(r=>setTimeout(r,15)); return !!(${expression}) })()`), true, expression)
    await wait(`brandProbe.stage==='pending'`)
    if (state === 'failed') { await tab.evaluate('brandProbe.reject(); brandProbe.loading'); await wait(`brandProbe.stage==='failed'`) }
    if (state === 'ready' || state === 'unmounted') {
      await tab.evaluate('brandProbe.resolve()'); await wait(`document.querySelector('[${HOOK.mark}]')`)
      await tab.evaluate('brandProbe.deliver()'); await wait(`document.querySelector('[${HOOK.state}="${STATUS.connected.state}"]')`)
      if (state === 'unmounted') await tab.evaluate('brandProbe.teardown()')
    }
    assert.equal(await tab.evaluate(`document.documentElement.hasAttribute('${PAGE_MARK}')`), true, 'page remains active')
    assert.equal(await tab.evaluate(`!!document.querySelector('[${HOOK.mark}]')`), state === 'ready', 'brand occupant matches phase')
    const prior = await tab.evaluate('brandProbe.beforeGuard')
    assert.ok(prior.hit && prior.visible && prior.focused, 'wide button reachable before page mounts')
    const counts = [], actions = [...inputs, ...(state === 'ready' ? [] : ['queued click']), 'Text', 'Element']
    for (const how of actions) {
      if (how === 'queued click') await tab.evaluate(`document.getElementById('brand-probe').click()`)
      else if (how === 'Text' || how === 'Element') assert.equal(await tab.evaluate(`(${clickDescendant})(${JSON.stringify(SLOT.name)}, ${JSON.stringify(how)})`), how === 'Text' ? 3 : 1, how)
      else await activate(tab, 'brand-probe', how, state === 'ready' ? undefined : prior)
      counts.push(await tab.evaluate(`({ native: brandProbe.native, opens: [...brandProbe.opens], creates: __lite.log.calls.filter(c=>(c.service==='sessions' && c.method==='create') || (c.service==='uiWorkspace' && c.method==='startSession')).length })`))
    }
    assert.deepEqual(await tab.evaluate('__lite.log.errors'), [], `${state}: no uncaught browser errors`)
    assert.deepEqual(counts, actions.map((_, i) => ({ native: 0, creates: 0, opens: state === 'ready' ? Array(i + 1).fill(FIXTURE.manager) : [] })), 'each input has only the permitted session effect')
  })
}
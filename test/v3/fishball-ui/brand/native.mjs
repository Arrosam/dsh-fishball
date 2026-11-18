import assert from 'node:assert/strict'
import { after } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromeBinary, keyFor, startEnvironment } from '../../../v2-page-cases/lite-browser.mjs'
import { CLIENT, UI_PACKAGE } from '../package/constants.mjs'
import { FIXTURE, HOOK, LABEL, PAGE_MARK, ROUTE, SLOT, STATUS } from './constants.mjs'

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
    const { eventSourceClass } = await import('/fixture/events.mjs')
    const sources = eventSourceClass()
    window.EventSource = sources.EventSource
    probe.deliver = () => {
      for (const s of sources.live(spec.asks)) s.deliver({ managerSessionId: spec.manager, cards: [] })
      for (const s of sources.live(spec.strip)) s.deliver({ on: true })
    }
    const entry = (await loadModule('/ui-entry.js')).factory(require)
    await (entry.default ?? entry).apply(scope)
  }
  // Only the two brand outlets have renderers in this fixture. Unrelated page occupants have
  // no matching host seat, just as in DSH when the relevant panel is closed.
  ctx.slots.register = () => () => {}
  const effects = []
  const scope = { ...ctx, effect(fn) { const out = fn(); effects.push(out); return out },
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
  ...ROUTE, brand: CLIENT.parts.brand.file, parts: Object.fromEntries(Object.values(CLIENT.parts).map(p => [p.file, p.export])) }
const dicts = { sidebar: { en: { 'session.new.label': LABEL.newSession.en } }, chat: { en: { 'message.branch': 'Branch' } }, conversation: { en: { 'session.hierarchy': 'Hierarchy', 'hero.chooseWorkspace': 'Choose workspace' } } }
const inputs = ['pointer', 'Enter', 'Space']
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
export function registerNative(t, sdk) {
  let browser
  after(async () => { await (await browser)?.stop() })
  for (const state of ['pending', 'failed', 'ready', 'unmounted']) t('LOGO-FIX', state, 'trusted pointer/Enter/Space on the native wide brand button', async (c) => {
    if (!chromeBinary()) return c.skip('needs isolated Chromium')
    const scripts = {
      '/ui-entry.js': () => readFileSync(CLIENT.entry),
      ['/' + metadata.brand]: () => readFileSync(path.join(UI_PACKAGE.dir, metadata.brand)),
      '/fixture/events.mjs': () => readFileSync(new URL('../stream/event-source.mjs', import.meta.url)),
    }
    const env = await (browser ??= startEnvironment({ scripts })), tab = await env.openChild({ sdk })
    c.after(() => tab.close())
    // Identical native control semantics, outside the page: all three inputs really generate clicks.
    await tab.evaluate(`document.body.innerHTML='<button id="unguarded">control</button>'; window.activations=[]; unguarded.onclick=e=>activations.push([e.isTrusted,e.detail])`)
    for (const how of inputs) await activate(tab, 'unguarded', how)
    assert.deepEqual(await tab.evaluate('activations'), [[true, 1], [true, 0], [true, 0]], 'native default click for each key')
    await tab.evaluate(`__lite.start(${JSON.stringify({ dicts, restoredSession: FIXTURE.manager, session: { sessionId: FIXTURE.manager } })}, seams=>(${prepare})(seams,${JSON.stringify(metadata)}))`)
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
    const counts = [], actions = state === 'ready' ? inputs : [...inputs, 'queued click']
    for (const how of actions) {
      if (how === 'queued click') await tab.evaluate(`document.getElementById('brand-probe').click()`)
      else await activate(tab, 'brand-probe', how, state === 'ready' ? undefined : prior)
      counts.push(await tab.evaluate(`({ native: brandProbe.native, opens: [...brandProbe.opens], creates: __lite.log.calls.filter(c=>(c.service==='sessions' && c.method==='create') || (c.service==='uiWorkspace' && c.method==='startSession')).length })`))
    }
    assert.deepEqual(counts, actions.map((_, i) => ({ native: 0, creates: 0, opens: state === 'ready' ? Array(i + 1).fill(FIXTURE.manager) : [] })), 'each input has only the permitted session effect')
  })
}

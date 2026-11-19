/** R3B-07 at the child side of the documented #view=chat&lang=… landing. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { until } from '../../../support/util.mjs'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { runtimeOf } from '../../fishball-core/package/constants.mjs'
import { navPage } from './nav-page.mjs'
import { NAV, NAV_PAGE } from './polish-constants.mjs'

const SDK_LOCALE = '@deepseek-ai/dsh-client-locale'
const BUDGET_MS = 2000
const [en, zh] = NAV_PAGE.langs

/** The first settings read can return *after* the launcher mounts. A successful write queued
 * during loading is accepted after that first read; accepting it updates the form subscribers. */
function settings(saved, loading) {
  const changes = new EventEmitter()
  let release
  const firstRead = new Promise((resolve) => { release = resolve })
  let snapshot = { status: 'loading', writable: false }
  function publish(preference) {
    const value = { preference }
    snapshot = { status: 'ready', value, user: value, base: {}, revision: (snapshot.revision ?? 0) + 1, writable: true }
    changes.emit('change')
  }
  function loaded() { publish(saved); release() }
  if (!loading) loaded()
  return {
    loaded,
    form: {
      getSnapshot: () => snapshot,
      subscribe(fn) { changes.on('change', fn); return () => changes.off('change', fn) },
      async set(field, value) { assert.equal(field, 'preference'); await firstRead; publish(value); return true },
    },
  }
}

async function openChild(t, sdk, hostLang, pref) {
  let locale
  const page = await navPage(t, sdk, { lang: en, prepare(page, ctx) {
    const { sandbox, window } = page
    window.location.hash = new URLSearchParams({ view: 'chat', lang: hostLang }).toString()
    const parent = { postMessage() {} }
    const history = { replaceState(_data, _title, url) { window.location.href = new URL(url, window.location).href } }
    for (const target of [sandbox, window]) Object.assign(target, { self: window, parent, top: parent, location: window.location, history })

    const events = new EventEmitter()
    ctx.on = (event, fn) => { events.on(event, fn); return () => events.off(event, fn) }
    ctx.emit = events.emit.bind(events)
    ctx.configForms = { get: (ns) => ns === 'locale' ? pref.form : undefined }
    const file = path.join(runtimeOf(sdk), SDK_LOCALE, 'lib/client.js')
    page.run(fs.readFileSync(file, 'utf8'), file)
    // LocaleRuntime itself does not need the Language settings row's rendering modules.
    const { LocaleRuntime } = page.registrations.find((r) => r.id === SDK_LOCALE).factory(() => ({}))
    locale = ctx.locale = new LocaleRuntime(ctx, pref.form)
    // The SDK's locale plugin keeps the rendered document's language in sync with its runtime.
    const sync = () => { page.document.documentElement.lang = locale.getLocale().active }
    ctx.effect(() => locale.subscribe(sync)); sync()
  } })
  const label = () => page.nodes().find((n) => n.tag === 'button' && n.props.className?.split(' ').includes(NAV.launcherClass))?.props['aria-label']
  async function displays(lang) {
    const expected = NAV.labels[lang].settings
    assert.ok(await until(() => locale.getLocale().active === lang && label() === expected, BUDGET_MS),
      `expected child ${lang}/${expected}; got ${locale.getLocale().active}/${label()}`)
    assert.deepEqual(page.log.errors, [])
  }
  return { displays, locale, settle: page.settle }
}

export function registerEmbedLocaleCases(sdk) {
  caseTest(sdk, 'R3B-07', 'late child', 'English landing survives late settings from a Chinese visit, without locking native Settings', async (t) => {
    const pref = settings(zh, true)
    const child = await openChild(t, sdk, en, pref)
    pref.loaded()
    await child.settle()
    await child.displays(en)
    child.locale.setLocale(zh) // Native Language row's action, after startup is over.
    await child.settle()
    await child.displays(zh)
  })
  caseTest(sdk, 'R3B-07', 'reload', 'each new child document shows the selected Chinese on an English browser', async (t) => {
    const pref = settings(en, false)
    for (const load of ['first visit', 'reload']) await t.test(load, async (c) => {
      const child = await openChild(c, sdk, zh, pref)
      await child.displays(zh)
    })
  })
}

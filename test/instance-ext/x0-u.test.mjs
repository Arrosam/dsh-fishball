/**
 * W0 / X0-U — page modules, routes, signals and the X3 fallback row (X4–X7).
 *
 * Observation points: the child's HTTP surface (`GET /api/ui-extensions`, `ui/ext/*`,
 * `api/ext/*`, the shell document's CSP) and the SSE `ext` event. The page-side hook object is
 * exercised where it is observable without a browser: the module list and the served files.
 *
 * Techniques: EP, P, ST, BVA. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { bootChild } from '../support/instance-ext.mjs'

const MODULE = 'export default function mount(hook) { return hook }\n'
const STYLE = '.fold { color: red }\n'

async function live(t) {
  const h = await bootChild(t, { activate: true })
  return { h, service: h.requireInstance() }
}

/** One module's files in a throwaway directory the test owns. */
async function pluginFiles(h, pluginId, { module = MODULE, style = STYLE } = {}) {
  const dir = path.join(h.home, 'plugins', pluginId)
  await mkdir(dir, { recursive: true })
  const modulePath = path.join(dir, 'module.js')
  const stylePath = path.join(dir, 'module.css')
  await writeFile(modulePath, module)
  await writeFile(stylePath, style)
  return { modulePath, stylePath }
}

/** Read `event:`/`data:` frames from the child's SSE stream for a bounded window. */
async function readSse(h, { ms = 250 } = {}) {
  const app = h.app
  const controller = new AbortController()
  const response = await fetch(app.origin + '/api/events', {
    headers: { authorization: 'Bearer ' + app.bearer },
    signal: controller.signal,
  })
  assert.equal(response.status, 200)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + ms
  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now())
      const result = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ done: true }), remaining)),
      ])
      if (result.done) break
      text += decoder.decode(result.value, { stream: true })
    }
  } finally {
    controller.abort()
    try { await reader.cancel() } catch { /* closed */ }
  }
  return text
}

const frames = (text) => text.split('\n\n').map((block) => {
  const lines = block.split('\n')
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
  const data = lines.find((line) => line.startsWith('data:'))?.slice(5).trim()
  return event === undefined ? undefined : { event, data }
}).filter(Boolean)

describe('X0-U page modules and routes (X4, X5)', () => {
  it('XU-P-01 with no module the list is empty and the page still works', async (t) => {
    const { h } = await live(t)
    const answer = await h.http('/api/ui-extensions')
    assert.equal(answer.status, 200)
    assert.deepEqual(await answer.json(), [])
    assert.equal((await h.http('/')).status, 200, 'the shell still loads')
  })

  it('XU-P-02 one registered module is listed with its plugin id and files', async (t) => {
    const { h, service } = await live(t)
    const { modulePath, stylePath } = await pluginFiles(h, 'fishball-fold-notify')
    service.ui.register({ pluginId: 'fishball-fold-notify', module: modulePath, style: stylePath })
    const answer = await h.http('/api/ui-extensions')
    assert.equal(answer.status, 200)
    const list = await answer.json()
    assert.equal(list.length, 1)
    assert.equal(list[0].pluginId, 'fishball-fold-notify')
    assert.equal(list[0].module, modulePath)
    assert.equal(list[0].style, stylePath)
  })

  it('XU-P-03 two modules are listed in registration order', async (t) => {
    const { h, service } = await live(t)
    const fold = await pluginFiles(h, 'fishball-fold-notify')
    const board = await pluginFiles(h, 'fishball-board')
    service.ui.register({ pluginId: 'fishball-fold-notify', module: fold.modulePath })
    service.ui.register({ pluginId: 'fishball-board', module: board.modulePath })
    const list = await (await h.http('/api/ui-extensions')).json()
    assert.deepEqual(list.map((item) => item.pluginId), ['fishball-fold-notify', 'fishball-board'])
  })

  it('XU-EP-01 the module and its style are served under ui/ext/<pluginId>/', async (t) => {
    const { h, service } = await live(t)
    const { modulePath, stylePath } = await pluginFiles(h, 'fishball-fold-notify')
    service.ui.register({ pluginId: 'fishball-fold-notify', module: modulePath, style: stylePath })
    const js = await h.http('/ui/ext/fishball-fold-notify/module.js')
    assert.equal(js.status, 200)
    assert.equal(await js.text(), MODULE)
    const css = await h.http('/ui/ext/fishball-fold-notify/module.css')
    assert.equal(css.status, 200)
    assert.equal(await css.text(), STYLE)
  })

  it('XU-EP-02 a missing module file is 404', async (t) => {
    const { h, service } = await live(t)
    const { modulePath } = await pluginFiles(h, 'fishball-fold-notify')
    service.ui.register({ pluginId: 'fishball-fold-notify', module: modulePath })
    assert.equal((await h.http('/ui/ext/fishball-fold-notify/missing.js')).status, 404)
  })

  it('XU-EP-03 a path escape is 404', async (t) => {
    const { h, service } = await live(t)
    const { modulePath } = await pluginFiles(h, 'fishball-fold-notify')
    service.ui.register({ pluginId: 'fishball-fold-notify', module: modulePath })
    const answer = await h.http('/ui/ext/fishball-fold-notify/%2e%2e%2f%2e%2e%2fsecret.js')
    assert.equal(answer.status, 404)
  })

  it('XU-ST-01 dispose removes the module from the list and stops serving it', async (t) => {
    const { h, service } = await live(t)
    const { modulePath } = await pluginFiles(h, 'fishball-fold-notify')
    const dispose = service.ui.register({ pluginId: 'fishball-fold-notify', module: modulePath })
    assert.equal((await (await h.http('/api/ui-extensions')).json()).length, 1)
    dispose()
    assert.deepEqual(await (await h.http('/api/ui-extensions')).json(), [])
    assert.equal((await h.http('/ui/ext/fishball-fold-notify/module.js')).status, 404)
  })

  it('XU-P-04 a route answers its status and JSON body', async (t) => {
    const { h, service } = await live(t)
    let seen
    service.ui.registerRoute('fishball-fold-notify', {
      method: 'GET',
      path: 'seen',
      handler: (request) => { seen = request; return { status: 200, body: { ok: true, seen: 1 } } },
    })
    const answer = await h.http('/api/ext/fishball-fold-notify/seen')
    assert.equal(answer.status, 200)
    assert.deepEqual(await answer.json(), { ok: true, seen: 1 })
    assert.ok(seen !== undefined, 'the handler was called')
  })

  it('XU-EP-04 a wrong method for a registered route is 405', async (t) => {
    const { h, service } = await live(t)
    service.ui.registerRoute('fishball-fold-notify', { method: 'POST', path: 'seen', handler: () => ({ status: 200, body: { ok: true } }) })
    assert.equal((await h.http('/api/ext/fishball-fold-notify/seen')).status, 405)
    assert.equal((await h.http('/api/ext/fishball-fold-notify/seen', { method: 'POST', body: {} })).status, 200)
  })

  it('XU-EP-05 a body over the api limit is refused and the handler is not called', async (t) => {
    const { h, service } = await live(t)
    let called = false
    service.ui.registerRoute('fishball-fold-notify', { method: 'POST', path: 'seen', handler: () => { called = true; return { status: 200, body: { ok: true } } } })
    const answer = await h.http('/api/ext/fishball-fold-notify/seen', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) })
    assert.ok(answer.status >= 400 && answer.status < 500, 'the oversize body is a 4xx, got ' + answer.status)
    assert.equal(called, false)
  })

  it('XU-P-05 the CSP is still self only', async (t) => {
    const { h } = await live(t)
    const answer = await h.http('/')
    const csp = answer.headers.get('content-security-policy')
    assert.ok(csp, 'the shell has a CSP')
    assert.match(csp, /default-src 'self'/)
    assert.doesNotMatch(csp, /https?:/)
  })
})

describe('X0-U signals and the fallback row (X6, X3)', () => {
  it('XU-EP-06 signals are coalesced per (pluginId, type) in one tick', async (t) => {
    const { h, service } = await live(t)
    service.ui.register({ pluginId: 'fishball-board', module: (await pluginFiles(h, 'fishball-board')).modulePath })
    const reading = readSse(h, { ms: 300 })
    await new Promise((resolve) => setTimeout(resolve, 30))
    service.ui.signal('fishball-board', 'refresh')
    service.ui.signal('fishball-board', 'refresh')
    service.ui.signal('fishball-board', 'other')
    const text = await reading
    const ext = frames(text).filter((frame) => frame.event === 'ext')
    assert.equal(ext.length, 2, 'two distinct (pluginId, type) pairs, one event each')
    const payloads = ext.map((frame) => JSON.parse(frame.data))
    assert.deepEqual(payloads.sort((a, b) => a.type.localeCompare(b.type)), [
      { pluginId: 'fishball-board', type: 'other' },
      { pluginId: 'fishball-board', type: 'refresh' },
    ])
  })

  it('XU-P-06 the X3 text fallback row is drawn when no page module renders the entry', async (t) => {
    const { h, service } = await live(t)
    service.chat.registerRecordProjector('fishball-fold-notify', 'plugin:fishball-fold-notify/notice', (value) => ({ id: 'plain', at: 1, data: value, text: 'fold notice text' }))
    h.manager().session.append('plugin:fishball-fold-notify/notice', {})
    const body = await (await h.http('/api/chat')).json()
    const entry = body.entries.find((candidate) => candidate.id === 'plain')
    assert.equal(entry.kind, 'plugin')
    assert.equal(entry.text, 'fold notice text')
  })
})

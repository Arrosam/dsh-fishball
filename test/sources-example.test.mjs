/**
 * P8 X8 (R5): the example plugin examples/fishball-source-example, linked into the test profile
 * (FBTEST_EXAMPLE=everyone | only) with notes in its row config (FBTEST_EXAMPLE_NOTES).
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | EXA-00 | ST (first boot of a new install; plugin statuses) | X7, X8 | the profile-enabled example starts off in Fishball: its source is listed disabled and no note arrives; the user then turns it on for Fishball |
 * | EXA-01 | ST (off -user on-> on: onEnabled republishes) | X8, X5 | each note reaches Fishball exactly once, as a notice (summary 'Plugin event: "Example notes"') whose block has the note's title and body and whose identity is fishball-source-example/fishball-source-example/notes; Fishball's model reads each; items kind plugin, consumed; the source is listed with plugin fishball-source-example, enabled |
 * | EXA-02 | ST (restart) | X6, X8 | nothing is delivered twice; the source is listed again |
 * | EXA-03 | ST on -user off for Fishball-> off -restart with a new note-> | X7, X8 | its code keeps running (the source is registered again after the restart and listed disabled); the new note's publish is 'disabled': nothing stored or delivered |
 * | EXA-04 | ST off -on-> on | X7, X8 | enabled again; onEnabled makes the example republish: the new note arrives exactly once, the earlier notes are not delivered twice |
 * | EXO-01 | ST (installed, off in the profile, off for Fishball) | X8 | its code never ran: no source, nothing delivered, after Fishball is live |
 * | EXO-02 | ST off -user on for Fishball-> on | X8 | its code runs; each note arrives exactly once; identity bundle fishball-source-example |
 * | EXO-03 | ST on -off-> off -restart with a new note-> | X8 | its code stops: the source leaves the state; after the restart it is still not listed and the new note does not arrive |
 * | EXO-04 | ST off -on again-> on | X6, X8 | the new note arrives exactly once; the earlier notes are not delivered twice |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, EXAMPLE, NOTICE, PLUGIN_INTAKE_KIND, SOURCE_IDENTITY, SOURCE_SUMMARY, STATUS } from './support/constants.mjs'
import { HOOK, T, intakeNow, pluginAuthor, pluginNotices, settledIdle, sourcesNow, untilSeen, untrustedBlock } from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

const LONG = { timeout: 120000 }
const tag = Math.random().toString(36).slice(2, 8)
const note = (i) => ({ id: 'note-' + i, title: 'Example note ' + i + ' ' + tag, body: 'EXBODY' + i + tag + ' something happened.' })
const NOTES = [1, 2, 3].map(note)
/** A note added to the config while DSH is down (EXA-03, EXO-03). */
const LATER = note(4)
const IDENT = SOURCE_IDENTITY(EXAMPLE.name, EXAMPLE.row, EXAMPLE.source.id)
const exampleEnv = (mode, notes = NOTES) => ({ FBTEST_EXAMPLE: mode, FBTEST_EXAMPLE_NOTES: JSON.stringify(notes) })

/** Count each note's notices after a quiet period; returns an array of counts. */
async function noteCounts(host, fb, quietMs = 1500, notes = NOTES) {
  await sleep(quietMs)
  await settledIdle(host, fb)
  const out = []
  for (const n of notes) out.push((await pluginNotices(host, fb, n.body)).length)
  return out
}
const ALL = [...NOTES, LATER]
const exampleListed = async (host) => ((await sourcesNow(host))?.sources ?? []).find((s) => s.identity.startsWith(EXAMPLE.name + '/'))
const pluginItems = async (host) => (await intakeNow(host)).items.filter((i) => i.sourceIdentity?.startsWith(EXAMPLE.name + '/'))

describe('P8 R5: the example plugin enabled for everyone', () => {
  let host
  let home
  let fb
  const reboot = async (notes = NOTES) => {
    await host.stop()
    host = await bootHost(home, { env: exampleEnv('everyone', notes) })
    assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
  }
  before(async () => {
    home = newHome('example-everyone')
    host = await bootHost(home, { env: exampleEnv('everyone') })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'precondition: live')
    fb = st.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('EXA-00 a new install starts the example off in Fishball: listed disabled, nothing delivered; the user turns it on', T, async () => {
    assert.ok(await until(async () => (await exampleListed(host)) !== undefined, 15000, 100), 'its code runs for everyone: the source is registered')
    assert.equal((await exampleListed(host)).enabled, false)
    await sleep(2000)
    assert.deepEqual(await noteCounts(host, fb, 0), NOTES.map(() => 0), 'no note delivered while off for Fishball')
    assert.equal((await pluginItems(host)).length, 0, 'nothing stored')
    const res = await host.post(API.plugins, { plugin: EXAMPLE.name, on: true })
    assert.equal(res.status, 200, res.text)
  })

  it('EXA-01 each note reaches Fishball once and wakes it, once the example is on for Fishball', T, async () => {
    for (const n of NOTES) assert.ok(await untilSeen(host, fb, n.body, 15000), n.id + ' reached Fishball\'s model')
    assert.deepEqual(await noteCounts(host, fb), NOTES.map(() => 1))
    for (const n of NOTES) {
      const m = (await pluginNotices(host, fb, n.body))[0]
      // P11 R4: the example's source is the author.
      assert.deepEqual(m.source, { ...NOTICE, summary: SOURCE_SUMMARY(EXAMPLE.source.title), author: pluginAuthor(EXAMPLE.source.title, IDENT) })
      const block = untrustedBlock(m.text)
      assert.equal(block.fields.source, IDENT)
      assert.equal(block.fields.title, n.title)
      assert.equal(block.fields.body, n.body)
      assert.ok(block.header.includes(JSON.stringify(EXAMPLE.source.title)))
    }
    const items = await pluginItems(host)
    assert.equal(items.length, NOTES.length)
    for (const i of items) { assert.equal(i.kind, PLUGIN_INTAKE_KIND); assert.equal(i.sourceIdentity, IDENT) }
    assert.ok(await until(async () => (await pluginItems(host)).every((i) => i.status === 'consumed'), 5000, 100), 'consumed')
    const listed = await exampleListed(host)
    assert.deepEqual(listed, { identity: IDENT, plugin: EXAMPLE.name, title: EXAMPLE.source.title, enabled: true })
  })

  it('EXA-02 a DSH restart delivers nothing twice', LONG, async () => {
    await settledIdle(host, fb)
    await reboot()
    await sleep(3000)
    assert.deepEqual(await noteCounts(host, fb), NOTES.map(() => 1))
    assert.equal((await pluginItems(host)).length, NOTES.length)
    assert.equal((await exampleListed(host))?.enabled, true)
  })

  it('EXA-03 off for Fishball: its code keeps running, and a new note is disabled (nothing stored or delivered)', LONG, async () => {
    const res = await host.post(API.plugins, { plugin: EXAMPLE.name, on: false })
    assert.equal(res.status, 200, res.text)
    assert.ok(await until(async () => (await exampleListed(host))?.enabled === false, 8000, 50), 'listed disabled')
    const before = (await pluginItems(host)).length
    await settledIdle(host, fb)
    await reboot(ALL)
    assert.ok(await until(async () => (await exampleListed(host)) !== undefined, 15000, 100), 'its code ran again after the restart: the source is registered')
    assert.equal((await exampleListed(host)).enabled, false)
    await sleep(3000)
    assert.deepEqual(await noteCounts(host, fb, 0, ALL), [1, 1, 1, 0], 'the new note is not delivered')
    assert.equal((await pluginItems(host)).length, before, 'nothing stored')
  })

  it('EXA-04 on again: the new note arrives exactly once, nothing else twice', T, async () => {
    assert.equal((await host.post(API.plugins, { plugin: EXAMPLE.name, on: true })).status, 200)
    assert.ok(await until(async () => (await exampleListed(host))?.enabled === true, 8000, 50))
    assert.ok(await untilSeen(host, fb, LATER.body, 15000), 'the new note arrived once enabled')
    assert.deepEqual(await noteCounts(host, fb, 2000, ALL), [1, 1, 1, 1])
  })
})

describe('P8 R5: the example plugin for Fishball only', () => {
  let host
  let home
  let fb
  before(async () => {
    home = newHome('example-only')
    host = await bootHost(home, { env: exampleEnv('only') })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'precondition: live')
    fb = st.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('EXO-01 installed but off: its code never runs and nothing arrives', T, async () => {
    await sleep(2000)
    assert.equal(await exampleListed(host), undefined)
    assert.deepEqual(await noteCounts(host, fb, 0), NOTES.map(() => 0))
    const entry = (await host.state()).catalog.plugins.find((p) => p.plugin === EXAMPLE.name)
    assert.equal(entry?.kind, 'fishball-only')
    assert.equal(entry?.on, false)
  })

  it('EXO-02 turned on for Fishball: its code runs and each note arrives once', T, async (t) => {
    const res = await host.post(API.plugins, { plugin: EXAMPLE.name, on: true })
    assert.equal(res.status, 200, res.text)
    for (const n of NOTES) assert.ok(await untilSeen(host, fb, n.body, 15000), n.id + ' reached Fishball')
    assert.deepEqual(await noteCounts(host, fb), NOTES.map(() => 1))
    const listed = await exampleListed(host)
    t.diagnostic('identity ' + listed?.identity)
    assert.equal(listed?.plugin, EXAMPLE.name)
    assert.equal(listed?.enabled, true)
    assert.ok(listed.identity.endsWith('/' + EXAMPLE.source.id))
  })

  it('EXO-03 turned off: its code stops; after a restart with a new note it still does not run', LONG, async () => {
    assert.equal((await host.post(API.plugins, { plugin: EXAMPLE.name, on: false })).status, 200)
    assert.ok(await until(async () => (await exampleListed(host)) === undefined, 8000, 50), 'source removed')
    await settledIdle(host, fb)
    await host.stop()
    host = await bootHost(home, { env: exampleEnv('only', ALL) })
    assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
    await sleep(3000)
    assert.equal(await exampleListed(host), undefined, 'not running')
    assert.deepEqual(await noteCounts(host, fb, 0, ALL), [1, 1, 1, 0])
  })

  it('EXO-04 on again: the new note arrives exactly once, nothing else twice', T, async () => {
    assert.equal((await host.post(API.plugins, { plugin: EXAMPLE.name, on: true })).status, 200)
    assert.ok(await until(async () => (await exampleListed(host))?.enabled === true, 10000, 50))
    assert.ok(await untilSeen(host, fb, LATER.body, 15000))
    assert.deepEqual(await noteCounts(host, fb, 2000, ALL), [1, 1, 1, 1])
  })
})

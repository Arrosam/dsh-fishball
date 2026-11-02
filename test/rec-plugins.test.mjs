/**
 * Revision 12 (DESIGN §10f, §9 `notices`, §14 "Recommended plugins (revision 12)"): the recommended list in the
 * state snapshot and the one-time welcome card's state. Host side only; the settings-page section, the dialog
 * flow and the card's place are on the hand-check list (hand-checks/rec-plugins.md).
 * The user's answers over the design text: the list is a section on Fishball's settings page (the snapshot is the
 * same), Install opens the existing "Install for Fishball" dialog (no new route), a DSH plugin off in Fishball
 * offers "Turn on for Fishball", `dsh-idle-compact` installs from npm under its own name, the card sits above the pile.
 * No test reaches npm: installs use local stand-ins named like listed packages (fixtures/rec-*).
 *
 * | id | technique | requirement | expected |
 * |----|-----------|-------------|----------|
 * | REC-01 | EP | snapshot shape | recommended = {highlighted, categories}; 4 categories in order, each {category, plugins}; highlighted = the first two category ids; the fourth (Pet) has no entries |
 * | REC-02 | EP + BVA | entry shape | each entry exactly {blocked, packageName, plugin, source, spec, state}; non-empty strings, an https source, state in {install, installed, dsh-on, dsh-off}, plugin/blocked string or null |
 * | REC-03 | EP | the list | every entry is one of the design's for its category (none added); dsh-idle-compact is in the first category; each highlighted category has at least one entry; names unique |
 * | REC-04 ×7 | EP | left out (1c) | billion-context, dsh-handoff-compaction, @xmanrui/dsh-im, dsh-plugin-weixin, @wsz987/dsh-channels, dsh-lark-bot, @agentscope-ai/reme-dsh-plugin are never listed |
 * | REC-05 | EP | your answer: npm | dsh-idle-compact's spec is exactly `dsh-idle-compact` |
 * | REC-06 | DT (package not in the catalog) | Install | on a profile with none of them: every entry state `install`, plugin null, blocked null |
 * | REC-07 | EP | events | the first SSE frame's recommended and welcome equal GET state's |
 * | REC-08 | EP | no new install route | POST /api/fishball/recommended/install answers as a path no route serves; nothing installed |
 * | REC-10 ×2 | DT (DSH plugin, on in DSH, off in Fishball) | "In DSH, off in Fishball" + Turn on | dsh-telegram-notify and smart-compaction: state `dsh-off`, plugin = the package name, blocked null |
 * | REC-11 | ST dsh-off -user on-> dsh-on -user off-> dsh-off | Turn on for Fishball = POST /api/fishball/plugins | state follows the catalog live in the event stream; no prompt; the DSH profile files byte-identical; the other DSH plugin unchanged |
 * | REC-12 | ST install -install of a local copy-> installed | Install through the dialog's route | before `install`; install 200; after: `installed`, plugin `fishball:dsh-idle-compact`, blocked null; no prompt; profile unchanged |
 * | REC-13 | ST installed on -off-> installed | an installed plugin has no action whether on or off | state stays `installed` after the switch is off and on |
 * | REC-14 | DT (installed × blocked) | a blocked entry shows its reason, no action | meow-memory stand-in (edits another row): state `installed`, blocked `edits-other-rows`, equal to the catalog's |
 * | REC-15 | ST installed -uninstall-> install | removing it brings Install back | dsh-idle-compact and meow-memory entries `install` again, plugin null, blocked null; profile unchanged |
 * | REC-16 | EP (invariant, after every step above) | an entry follows the catalog by package name | none → install; fishball-installed → installed; DSH plugin on/off → dsh-on/dsh-off; plugin and blocked equal the catalog entry's |
 * | WEL-01 | ST (fresh home) | not shown yet | welcome deep-equals {show:true}; the state has the `welcome` and `recommended` keys |
 * | WEL-02 ×7 | EP | seen: other bodies | invalid JSON, [], "x", 5, null, true, {a:1} -> 400 {ok:false, code:'bad-body'}; show stays true |
 * | WEL-03 ×2 | EP | auth and fence | no cookie, and a foreign Origin: not 200; show stays true |
 * | WEL-04 | ST show -seen-> seen | POST {} | 200; show false in GET state and in a new event stream's first frame |
 * | WEL-05 | ST seen -seen again-> seen | a repeat | 200; show still false; no turn, no event in Fishball's session |
 * | WEL-06 | EP | not in Fishball's context | Fishball's next request mentions neither the card nor the list; Fishball's session log gained no event from seen; Fishball stays idle |
 * | WEL-07 | ST (restart) | never again | after a clean restart on the same home: show false; recommended unchanged |
 * | WEL-08 | ST (crash) | stored before the answer | after seen answered 200 and the process was killed: show false after the restart |
 * | WEL-09 | ST (not live) | the store needs no session | seen posted right after boot, before Fishball is live: 200; show false once live and after a restart |
 * | WEL-10 | ST (existing install) | Reading: every install shows it once | a home first booted by the previous version: show true after the upgrade; seen -> false; a restart keeps false |
 * | WEL-11 | EP | a new home is separate | a second fresh home still starts with show true |
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  API, BLOCKED, INSTALL_API, INSTALLED_KEY, KIND, MS, PRE_REV12, REC_API, REC_CATEGORY_COUNT, REC_ENTRY_KEYS, REC_HIGHLIGHT_COUNT, REC_IDLE_SPEC, REC_LINK_ENV,
  REC_LISTED, REC_NEVER, REC_ROOT_KEYS, REC_STANDIN, REC_STATE, REPO, STATE_KEYS, STATE_KEYS_OPTIONAL, STATUS, TEST_HOMES, WELCOME_BAD_BODIES,
} from './support/constants.mjs'
import { HOOK, INSTALL_MS, T, catalogSettled, pluginIn, profileSnapshot, settle, settledIdle, turn, untilCatalog } from './support/expect.mjs'
import { bootHost, bootLive, newHome, until } from './support/host.mjs'

const INSTALL_T = { timeout: INSTALL_MS + 30000 }
const SYNC_MS = 10000
/** The entries of every category; a snapshot without the list fails here, so no case passes on a missing list. */
const entries = (state) => {
  assert.ok(Array.isArray(state?.recommended?.categories), 'the snapshot has recommended.categories: ' + JSON.stringify(state?.recommended))
  return state.recommended.categories.flatMap((c) => c.plugins ?? [])
}
const entryOf = (state, name) => entries(state).find((e) => e.packageName === name)
const REJECTED_ORIGIN = 'http://fbtest-foreign.invalid'

/**
 * REC-16: the entry follows the catalog by package name (DESIGN §10f table). A package installed for Fishball only
 * wins over a DSH plugin of the same name; a catalog kind the table does not name (a profile bundle that is off in
 * DSH) is not judged.
 */
function expectFollowsCatalog(state, label) {
  const plugins = state.catalog.plugins
  for (const e of entries(state)) {
    const matches = plugins.filter((p) => p.packageName === e.packageName)
    const p = matches.find((x) => x.kind === KIND.installed) ?? matches[0]
    const at = label + ' ' + e.packageName
    if (!p) {
      assert.deepEqual([e.state, e.plugin, e.blocked], [REC_STATE.install, null, null], at + ' not in the catalog')
      continue
    }
    assert.equal(e.plugin, p.plugin, at + ' plugin key')
    assert.equal(e.blocked, p.blocked ?? null, at + ' blocked')
    if (p.kind === KIND.installed) assert.equal(e.state, REC_STATE.installed, at)
    else if (p.kind === KIND.profile) assert.equal(e.state, p.on ? REC_STATE.dshOn : REC_STATE.dshOff, at)
  }
}

describe('Revision 12 recommended list: shape and content', () => {
  let host

  before(async () => {
    const booted = await bootLive(newHome('rec-shape'))
    host = booted.host
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('REC-01 recommended has four categories in order, the first two highlighted, and Pet with no entries', T, async () => {
    const rec = (await host.state()).recommended
    assert.equal(typeof rec, 'object', JSON.stringify(rec))
    assert.deepEqual(Object.keys(rec).sort(), REC_ROOT_KEYS)
    assert.equal(rec.categories.length, REC_CATEGORY_COUNT)
    for (const c of rec.categories) assert.deepEqual(Object.keys(c).sort(), ['category', 'plugins'], String(c.category))
    const ids = rec.categories.map((c) => c.category)
    assert.equal(new Set(ids).size, REC_CATEGORY_COUNT, 'category ids unique')
    assert.deepEqual(rec.highlighted, ids.slice(0, REC_HIGHLIGHT_COUNT))
    assert.equal(rec.categories.at(-1).plugins.length, 0, 'Pet lists no plugin')
  })

  it('REC-02 every entry has the six fields with their types', T, async () => {
    const all = entries(await host.state())
    assert.ok(all.length > 0)
    for (const e of all) {
      assert.deepEqual(Object.keys(e).sort(), REC_ENTRY_KEYS, e.packageName)
      for (const k of ['packageName', 'spec']) { assert.equal(typeof e[k], 'string', e.packageName + ' ' + k); assert.ok(e[k].trim().length > 0, e.packageName + ' ' + k + ' empty') }
      assert.equal(new URL(e.source).protocol, 'https:', e.packageName + ' source ' + e.source)
      assert.ok(Object.values(REC_STATE).includes(e.state), e.packageName + ' state ' + e.state)
      for (const k of ['plugin', 'blocked']) assert.ok(e[k] === null || (typeof e[k] === 'string' && e[k].length > 0), e.packageName + ' ' + k + ' ' + JSON.stringify(e[k]))
    }
  })

  it('REC-03 only the design\'s plugins are listed, in their categories; dsh-idle-compact leads the first', T, async () => {
    const rec = (await host.state()).recommended
    rec.categories.forEach((c, i) => {
      for (const e of c.plugins) assert.ok(REC_LISTED[i].includes(e.packageName), e.packageName + ' is not a design entry of category ' + i)
    })
    for (const c of rec.categories.slice(0, REC_HIGHLIGHT_COUNT)) assert.ok(c.plugins.length > 0, 'highlighted ' + c.category + ' has entries')
    assert.ok(rec.categories[0].plugins.some((e) => e.packageName === REC_STANDIN.idle.name), 'dsh-idle-compact in the first category')
    const names = entries({ recommended: rec }).map((e) => e.packageName)
    assert.equal(new Set(names).size, names.length, 'names unique')
  })

  for (const name of REC_NEVER) {
    it('REC-04 ' + name + ' is never listed', T, async () => {
      assert.equal(entryOf(await host.state(), name), undefined)
    })
  }

  it('REC-05 dsh-idle-compact installs from npm under its own name', T, async () => {
    assert.equal(entryOf(await host.state(), REC_STANDIN.idle.name)?.spec, REC_IDLE_SPEC)
  })

  it('REC-06 with none of them in the catalog every entry offers Install and carries no plugin or reason', T, async () => {
    const state = await host.state()
    for (const e of entries(state)) assert.deepEqual([e.state, e.plugin, e.blocked], [REC_STATE.install, null, null], e.packageName)
    expectFollowsCatalog(state, 'REC-06')
  })

  it('REC-07 the first event frame carries the same recommended and welcome as GET state', T, async () => {
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, MS.sseFirstFrame, 20), 'a first frame')
      const got = await host.state()
      assert.deepEqual(stream.frames[0].recommended, got.recommended)
      assert.deepEqual(stream.frames[0].welcome, got.welcome)
    } finally { stream.close() }
  })

  it('REC-08 the old recommended install route is gone and installs nothing', T, async () => {
    const unknown = await host.post(API.unknownRoute, { id: REC_STANDIN.idle.name })
    const res = await host.post(REC_API.removedInstall, { id: REC_STANDIN.idle.name })
    assert.notEqual(res.status, 200, res.text)
    assert.equal(res.status, unknown.status, 'the same answer as a path no route serves')
    assert.equal(pluginIn(await catalogSettled(host), INSTALLED_KEY(REC_STANDIN.idle.name)), undefined)
  })
})

describe('Revision 12 recommended entries: states and their actions', () => {
  let host
  let home
  let fb
  let profile

  const approvals = async () => (await host.call('approvals')).length
  const stateNow = () => host.state()
  const waitEntry = async (name, want, label) => {
    const got = await until(async () => { const s = await stateNow(); const e = entryOf(s, name); return e && e.state === want ? s : false }, SYNC_MS, 100)
    assert.ok(got, label + ': ' + name + ' never reached ' + want + ' (now ' + JSON.stringify(entryOf(await stateNow(), name)) + ')')
    return got
  }
  const toggle = async (plugin, on) => {
    const r = await host.post(API.plugins, { plugin, on })
    assert.equal(r.status, 200, 'toggle ' + plugin + ': ' + r.text)
  }
  const install = (spec, requestId) => host.post(INSTALL_API.install, { spec, requestId, approvedBuilds: [] })

  before(async () => {
    home = newHome('rec-states')
    const booted = await bootLive(home, { env: REC_LINK_ENV })
    host = booted.host
    fb = booted.state?.sessionId
    await settledIdle(host, fb)
    await settle(host)
    profile = profileSnapshot(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  for (const b of [REC_STANDIN.telegram, REC_STANDIN.smart]) {
    it('REC-10 ' + b.name + ' on in DSH and off in Fishball shows dsh-off with its plugin key', T, async () => {
      const state = await stateNow()
      const p = pluginIn(state.catalog, b.name)
      assert.equal(p?.kind, KIND.profile, 'precondition: a DSH plugin')
      assert.equal(p.on, false, 'precondition: off in Fishball')
      const e = entryOf(state, b.name)
      assert.ok(e, 'listed')
      assert.deepEqual([e.state, e.plugin, e.blocked], [REC_STATE.dshOff, b.name, null])
      expectFollowsCatalog(state, 'REC-10')
    })
  }

  it('REC-11 Turn on for Fishball (the plugin route) moves the entry dsh-off -> dsh-on -> dsh-off, live', T, async () => {
    const asked = await approvals()
    const stream = await host.sse()
    try {
      await toggle(REC_STANDIN.telegram.name, true)
      assert.ok(await until(() => stream.frames.some((f) => entryOf(f, REC_STANDIN.telegram.name)?.state === REC_STATE.dshOn), SYNC_MS, 50), 'the event stream carries dsh-on')
      const on = await waitEntry(REC_STANDIN.telegram.name, REC_STATE.dshOn, 'on')
      assert.equal(entryOf(on, REC_STANDIN.smart.name).state, REC_STATE.dshOff, 'the other DSH plugin is unchanged')
      expectFollowsCatalog(await catalogSettled(host).then(() => stateNow()), 'REC-11 on')
      await toggle(REC_STANDIN.telegram.name, false)
      await waitEntry(REC_STANDIN.telegram.name, REC_STATE.dshOff, 'off again')
    } finally { stream.close() }
    assert.equal(await approvals(), asked, 'no prompt')
    assert.deepEqual(profileSnapshot(home), profile, 'the DSH profile files are byte-identical')
  })

  it('REC-12 installing a local copy named dsh-idle-compact moves its entry install -> installed, with no prompt', INSTALL_T, async () => {
    assert.equal(entryOf(await stateNow(), REC_STANDIN.idle.name).state, REC_STATE.install, 'precondition')
    const asked = await approvals()
    const res = await install(REC_STANDIN.idle.dir, 'fbtest-rec-12')
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    const key = INSTALLED_KEY(REC_STANDIN.idle.name)
    const state = await waitEntry(REC_STANDIN.idle.name, REC_STATE.installed, 'installed')
    const e = entryOf(state, REC_STANDIN.idle.name)
    assert.deepEqual([e.plugin, e.blocked], [key, null])
    assert.equal(pluginIn(state.catalog, key)?.kind, KIND.installed)
    assert.equal(await approvals(), asked, 'no prompt: your click is the approval')
    expectFollowsCatalog(state, 'REC-12')
    assert.deepEqual(profileSnapshot(home), profile, 'the DSH profile files are byte-identical')
  })

  it('REC-13 an installed plugin stays "installed" whether its switch is on or off', T, async () => {
    const key = INSTALLED_KEY(REC_STANDIN.idle.name)
    await toggle(key, false)
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, key)?.on === false, SYNC_MS), 'off')
    assert.equal(entryOf(await stateNow(), REC_STANDIN.idle.name).state, REC_STATE.installed)
    await toggle(key, true)
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, key)?.on === true, SYNC_MS), 'on')
    assert.equal(entryOf(await stateNow(), REC_STANDIN.idle.name).state, REC_STATE.installed)
    expectFollowsCatalog(await stateNow(), 'REC-13')
  })

  it('REC-14 an installed plugin the catalog blocks shows installed with the catalog\'s reason', INSTALL_T, async () => {
    const res = await install(REC_STANDIN.meow.dir, 'fbtest-rec-14')
    assert.equal(res.status, 200, res.text)
    const key = INSTALLED_KEY(REC_STANDIN.meow.name)
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, key), INSTALL_MS), 'listed')
    const state = await stateNow()
    const e = entryOf(state, REC_STANDIN.meow.name)
    assert.deepEqual([e.state, e.plugin, e.blocked], [REC_STATE.installed, key, BLOCKED.editsOtherRows])
    assert.equal(pluginIn(state.catalog, key).blocked, e.blocked)
    expectFollowsCatalog(state, 'REC-14')
  })

  it('REC-15 uninstalling brings Install back and clears the plugin key and the reason', INSTALL_T, async () => {
    for (const b of [REC_STANDIN.idle, REC_STANDIN.meow]) {
      const removed = await host.post(API.pluginsRemove, { plugin: INSTALLED_KEY(b.name) })
      assert.equal(removed.status, 200, removed.text)
      assert.ok(await untilCatalog(host, (c) => !pluginIn(c, INSTALLED_KEY(b.name)), INSTALL_MS), b.name + ' gone')
      const e = entryOf(await waitEntry(b.name, REC_STATE.install, 'uninstalled'), b.name)
      assert.deepEqual([e.plugin, e.blocked], [null, null])
    }
    expectFollowsCatalog(await stateNow(), 'REC-15')
    assert.deepEqual(profileSnapshot(home), profile, 'the DSH profile files are byte-identical')
  })
})

describe('Revision 12 welcome card: once only', () => {
  let host
  let home
  let fb

  const seen = (body = {}, opts) => host.post(REC_API.seen, body, opts)
  const eventsOfFishball = async () => (await host.call('inspect', { sessionId: fb, events: true })).events.length
  const reboot = async () => {
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    await settledIdle(host, fb)
  }

  before(async () => {
    home = newHome('rec-welcome')
    await reboot()
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('WEL-01 a fresh home has not shown the card: welcome is {show:true}', T, async () => {
    const s = await host.state()
    assert.deepEqual(s.welcome, { show: true })
    assert.deepEqual(Object.keys(s).filter((k) => !STATE_KEYS_OPTIONAL.includes(k)).sort(), STATE_KEYS)
  })

  for (const [label, body, raw] of WELCOME_BAD_BODIES) {
    it('WEL-02 seen with ' + label + ' answers 400 bad-body and the card is still to show', T, async () => {
      const res = await seen(body, { raw: Boolean(raw) })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: 'bad-body' })
      assert.deepEqual((await host.state()).welcome, { show: true })
    })
  }

  it('WEL-03 seen without the browser cookie is refused', T, async () => {
    const res = await fetch(host.origin + REC_API.seen, { method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' }, body: '{}' })
    assert.notEqual(res.status, 200, await res.text())
    assert.deepEqual((await host.state()).welcome, { show: true })
  })

  it('WEL-03 seen from a foreign Origin is refused', T, async () => {
    const res = await seen({}, { headers: { origin: REJECTED_ORIGIN } })
    assert.notEqual(res.status, 200, res.text)
    assert.deepEqual((await host.state()).welcome, { show: true })
  })

  it('WEL-04 seen answers 200 and show is false in GET state and in a new event stream', T, async () => {
    const before = await eventsOfFishball()
    const res = await seen()
    assert.equal(res.status, 200, res.text)
    assert.deepEqual((await host.state()).welcome, { show: false })
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, MS.sseFirstFrame, 20), 'a first frame')
      assert.deepEqual(stream.frames[0].welcome, { show: false })
    } finally { stream.close() }
    assert.equal(await eventsOfFishball(), before, 'no event in Fishball\'s session')
  })

  it('WEL-05 a second seen answers 200 and changes nothing', T, async () => {
    const before = await eventsOfFishball()
    const first = await host.state()
    const res = await seen()
    assert.equal(res.status, 200, res.text)
    const after = await host.state()
    assert.deepEqual(after.welcome, { show: false })
    assert.deepEqual(after.recommended, first.recommended)
    assert.equal(await eventsOfFishball(), before)
    assert.equal(await host.call('agentStatus', { sessionId: fb }), 'idle', 'no turn started')
  })

  it('WEL-06 Fishball is told nothing of the card or the list', T, async () => {
    const req = (await turn(host, fb, [[{ text: 'ok' }]])).requests.at(-1)
    const text = JSON.stringify(req)
    for (const needle of ['Welcome to Fishball', 'See recommended plugins', 'Recommended for Fishball']) assert.equal(text.includes(needle), false, needle)
    for (const e of entries(await host.state())) assert.equal(text.includes(e.source), false, 'the list reaches the prompt: ' + e.source)
  })

  it('WEL-07 after a clean restart the card does not come back and the list is unchanged', T, async () => {
    const list = (await host.state()).recommended
    await host.stop()
    await reboot()
    const s = await host.state()
    assert.deepEqual(s.welcome, { show: false })
    assert.deepEqual(s.recommended, list)
  })

  it('WEL-11 a second fresh home starts with show true', T, async () => {
    const other = await bootLive(newHome('rec-welcome-other'))
    try { assert.deepEqual((await other.host.state()).welcome, { show: true }) } finally { await other.host.stop() }
  })
})

describe('Revision 12 welcome card: crash and not live', () => {
  const LONG = { timeout: 150000 }

  it('WEL-08 seen survives a crash right after it answered', LONG, async () => {
    const home = newHome('rec-welcome-crash')
    let { host } = await bootLive(home)
    try {
      assert.equal((await host.post(REC_API.seen, {})).status, 200)
      await host.kill()
      host = (await bootLive(home)).host
      assert.deepEqual((await host.state()).welcome, { show: false })
    } finally { await host?.stop() }
  })

  it('WEL-09 seen posted before Fishball is live is stored', LONG, async () => {
    const home = newHome('rec-welcome-early')
    let host = await bootHost(home)
    try {
      const early = (await host.state())?.status
      const res = await host.post(REC_API.seen, {})
      assert.equal(res.status, 200, 'status at the time: ' + early + ': ' + res.text)
      assert.ok(await host.waitStatus(STATUS.live), 'live')
      assert.deepEqual((await host.state()).welcome, { show: false })
      await host.stop()
      host = (await bootLive(home)).host
      assert.deepEqual((await host.state()).welcome, { show: false })
    } finally { await host?.stop() }
  })
})

describe('Revision 12 welcome card on an existing install', () => {
  const LONG = { timeout: 200000 }
  let host
  let home
  let oldDir

  before(async () => {
    oldDir = path.join(path.dirname(TEST_HOMES), 'fbtest-prerev12-' + process.pid)
    fs.rmSync(oldDir, { recursive: true, force: true })
    fs.mkdirSync(oldDir, { recursive: true })
    const tar = oldDir + '.tar'
    execFileSync('git', ['-C', REPO, 'archive', '--output', tar, PRE_REV12.commit])
    execFileSync('tar', ['-x', '-f', tar, '-C', oldDir])
    fs.rmSync(tar, { force: true })
    home = newHome('rec-welcome-upgrade')
    host = (await bootLive(home, { env: { FBTEST_PLUGIN_DIR: oldDir } })).host
  }, { timeout: 180000 })
  after(async () => { await host?.stop(); fs.rmSync(oldDir, { recursive: true, force: true }) }, HOOK)

  it('WEL-10 a home first booted by the previous version shows the card once after the upgrade', LONG, async () => {
    assert.equal(Object.hasOwn(await host.state(), 'welcome'), false, 'precondition: the previous version has no welcome')
    await host.stop()
    host = (await bootLive(home)).host
    assert.deepEqual((await host.state()).welcome, { show: true })
    assert.equal(entries(await host.state()).length > 0, true, 'the list is there')
    assert.equal((await host.post(REC_API.seen, {})).status, 200)
    assert.deepEqual((await host.state()).welcome, { show: false })
    await host.stop()
    host = (await bootLive(home)).host
    assert.deepEqual((await host.state()).welcome, { show: false })
  })
})

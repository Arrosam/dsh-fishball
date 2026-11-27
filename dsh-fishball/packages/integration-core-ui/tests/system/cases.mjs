/**
 * A booted standalone DSH with fishball-core and fishball-ui (core's ./ui/ component; one bundle), old
 * fishball-ui/package UI-UC-01 + EFIX3-UI-SYS-01, fishball-ui/model-dialog MODEL-SYS-01 / STRIP-SYS-01 /
 * STRIP-DT-02 / MODEL-ST-03, fishball-core/wire WIRE-SYS (the ui+core and board stand-in+ui+core
 * compositions, SHELVE broken board), fishball-core/status PLAT-DT-02's integration row, and
 * SESSIONS-WATCH SYS S1–S4 (DESIGN §35: the strip topic on the page stream while a page watches).
 *
 * Techniques: UC (UI-UC-01 main 1–5, E1, A1, A2), EP (composition partitions: ui+core, board+ui+core,
 * broken board), ST (core off by HMR → UI rows gone, picker restored; S1–S4 watch transitions), BVA (one
 * watch interval). Level: system. Observed through DSH's loader, settings and plugin manager, core's and
 * fishball-ui's published services, the owner routes, the page's boot graph, and the scripted model.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { scenario } from 'fishball-test-helpers/dsh-world'
import { startFakeDsh } from 'fishball-test-helpers/fake-connector'
import { TOOL } from 'fishball-test-helpers/connector-contract/mcp-schema'
import { until } from 'fishball-test-helpers/wait'
import { GUARDS, TARGETS } from 'fishball-core/contracts'
import { SEAM_PAGE_STREAM, SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { NOTICE, ROWS, CORE_SPLIT } from '../patch/constants.mjs'
import { NAMES } from '../support/names.mjs'
import { EXTENSION, corePackages } from '../support/world.mjs'
import { SYS } from './constants.mjs'

const show = (v) => JSON.stringify(v)
const rowGuard = (id) => GUARDS.code.rowPrefix + id
const isOk = (r) => r?.status === GUARDS.status.ok && r.overridden.length === 0
const BOARD_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'fishball-board')
// These rows assert directly offered tools, not the default PTC transport.
const NATIVE_MANAGER = [{ id: NAMES.core, config: { ptc: false } }]

async function waitReport(h, test, ms = SYS.recomposeMs) {
  let last
  await until(async () => { last = await h.call('report'); return test(last) }, ms, SYS.pollMs)
  return last
}
const settledSet = async (h) => { let s; await until(async () => { s = await h.call('snapshot'); return s?.set != null }, SYS.callMs, SYS.pollMs); return s?.set }
/** The SSE route read from Node until its first data line (or every message, with `all`). */
async function readStream(h, route) {
  const controller = new AbortController()
  const res = await fetch(h.origin + route, { headers: { cookie: h.cookie, origin: h.origin }, signal: controller.signal })
  const stream = { status: res.status, type: res.headers.get('content-type') ?? '', messages: [] }
  const pump = (async () => {
    let buffer = ''
    try {
      for await (const chunk of res.body) {
        buffer += new TextDecoder().decode(chunk)
        const blocks = buffer.split(SYS.sse.separator)
        buffer = blocks.pop()
        for (const block of blocks) {
          const data = block.split(SYS.sse.line).filter((l) => l.startsWith(SYS.sse.data)).map((l) => l.slice(SYS.sse.data.length).trim()).join('')
          if (data) { try { stream.messages.push(JSON.parse(data)) } catch { stream.messages.push({ unparsable: data }) } }
        }
      }
    } catch { /* aborted */ }
  })()
  stream.close = async () => { controller.abort(); await pump }
  return stream
}
const query = (lang) => '?' + new URLSearchParams({ [SEAM_PAGE_STREAM.langParameter]: lang, [SEAM_PAGE_STREAM.zoneParameter]: Intl.DateTimeFormat().resolvedOptions().timeZone })
/** The ids of the page's boot graph (DSH's __DSH_BOOT__ entries), DSH's own packages left out. */
async function graphIds(h) {
  const html = (await h.request('/')).text
  const m = SYS.bootGraph.exec(html)
  if (!m) throw new Error('the page carries no __DSH_BOOT__ graph')
  return JSON.parse(m[1]).entries.map((e) => e.id).filter((id) => !id.startsWith(SYS.dshScope))
}
/** A copy of the board stand-in whose engines.dsh no DSH meets (DSH skips it as incompatible). */
function brokenBoard() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), SYS.brokenPrefix))
  fs.cpSync(BOARD_DIR, dir, { recursive: true })
  const file = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(file, JSON.stringify({ ...pkg, engines: { ...pkg.engines, dsh: SYS.impossibleEngine } }))
  return dir
}
/** Per-target token reference (core's contracts TARGETS.credentials). */
const tokenRefOf = ({ targetId, endpointEpoch }) => {
  const c = TARGETS.credentials
  const part = (text) => text.split(c.refReplaced).join(c.refReplacement)
  return c.tokenRefPrefix + part(targetId) + c.tokenRefSeparator + part(endpointEpoch)
}

export function registerSystemCases() {
  const both = scenario(SYS.home.both, [async (boot, f) => {
    const h = await boot({ overlay: NATIVE_MANAGER })
    f.started = await h.call('startedBundles')
    f.rows = await h.call('activeRows', { ids: [...ROWS.guards, ...Object.keys(ROWS.component), ROWS.coreMissing, SYS.modelRow] })
    f.notice = await h.call('rowConfig', { id: NOTICE.row, field: NOTICE.field })
    f.uiGuards = await h.call('service', { name: NAMES.uiGuards })
    f.graph = await graphIds(h)
    f.tab = (await h.request(SYS.recommendedRoute)).status
    f.logs = await h.call('logs')
    f.report = await waitReport(h, (r) => r !== null, SYS.readyMs)
    f.settled = await waitReport(h, isOk, SYS.readyMs)
    f.shape = await h.call('shape')
    f.snapshot = await h.call('snapshot')
    f.set = await settledSet(h)
    f.tools = await h.call('managerTools')
    // UI-UC-01 A1/A2: the owner re-enables a UI row, then also a core row; then restores both.
    const ui = ROWS.guards[0]
    const core = CORE_SPLIT.guards[0]
    await h.call('setRowEnabled', { id: ui, enabled: true })
    f.oneSet = await waitReport(h, (r) => r?.overridden?.includes(rowGuard(ui)))
    await h.call('setRowEnabled', { id: core, enabled: true })
    f.twoSet = await waitReport(h, (r) => r?.overridden?.includes(rowGuard(core)))
    await h.call('setRowEnabled', { id: ui, enabled: false })
    await h.call('setRowEnabled', { id: core, enabled: false })
    f.restored = await waitReport(h, (r) => !r?.overridden?.includes(rowGuard(ui)) && !r?.overridden?.includes(rowGuard(core)))
    // STRIP-SYS-01: the strip route's immediate first frame, per language.
    f.strip = {}
    for (const lang of SYS.langs) {
      const s = await readStream(h, SYS.stripRoute + lang)
      await until(() => s.messages.length > 0, SYS.frameMs, SYS.pollMs)
      f.strip[lang] = { status: s.status, type: s.type, frame: s.messages[0] }
      await s.close()
    }
    // STRIP-DT-02: core's per-target Connect route with an unknown id; the withdrawn K3a route.
    f.connectUnknown = await h.request(SEAM_TARGETS.route.connect, { method: 'POST', body: { [SEAM_TARGETS.route.targetIdField]: SYS.unknownTarget } })
    f.withdrawn = await h.request(SYS.withdrawnConnect, { method: 'POST', body: {} })
    // MODEL-ST-03: core switched off live (HMR): its UI rows go, DSH's picker returns, no strip, no Connect.
    await h.call('setCore', { enabled: false })
    await until(async () => (await h.call('rows', { ids: [SYS.modelRow] }))[0].disabled === false, SYS.callMs, SYS.pollMs)
    f.off = {
      rows: await h.call('activeRows', { ids: [SYS.modelRow, ROWS.coreMissing, ...Object.keys(ROWS.component)] }),
      strip: (await h.request(SYS.stripRoute + SYS.langs[0])).status,
      connect: await h.request(SEAM_TARGETS.route.connect, { method: 'POST', body: { [SEAM_TARGETS.route.targetIdField]: SYS.unknownTarget } }),
    }
  }], { packages: corePackages(), extension: EXTENSION })

  const board = scenario(SYS.home.board, [async (boot, f) => {
    const h = await boot({ overlay: NATIVE_MANAGER })
    f.rows = await h.call('rows', { ids: [NAMES.board] })
    f.set = await settledSet(h)
    f.shape = await h.call('shape')
    f.tools = await h.call('managerTools')
    f.report = await waitReport(h, isOk, SYS.readyMs)
  }], { packages: corePackages([{ dir: BOARD_DIR, name: NAMES.board }]), extension: EXTENSION })

  const broken = scenario(SYS.home.broken, [async (boot, f) => {
    const dir = brokenBoard()
    try {
      const h = await boot({ packages: [{ dir, name: NAMES.board }] })
      f.set = await settledSet(h)
      f.rows = await h.call('rows', { ids: [NAMES.board] })
    } finally {
      // Guard the one recursive delete: the mkdtemp copy this step made.
      if (path.dirname(dir) === fs.realpathSync(os.tmpdir()) && path.basename(dir).startsWith(SYS.brokenPrefix)) fs.rmSync(dir, { recursive: true, force: true })
    }
  }], { packages: corePackages(), extension: EXTENSION })

  const watch = scenario(SYS.home.watch, [async (boot, f) => {
    const h = await boot()
    const sessions = []
    const fake = await startFakeDsh({ name: SYS.targetName, onTool: (name) => (name === TOOL.sessionsList ? { sessions: structuredClone(sessions) } : undefined) })
    try {
      const added = await h.call('targetAction', { op: 'add', args: [fake.url()] })
      if (!added.ok) throw new Error('add refused: ' + show(added))
      const view = async () => (await h.call('targets')).targets.find((t) => t.targetId === added.targetId)
      await h.call('credSet', { ref: tokenRefOf(await view()), value: fake.addEntry().secret })
      const reads = () => fake.callsOf(TOOL.sessionsList).length
      f.connected = Boolean(await until(async () => (await view())?.state === SEAM_TARGETS.state.connected && Array.isArray((await view()).runningSessions), SYS.connectMs, SYS.pollMs))
      // S4: no page stream → no read over one interval and a margin.
      let n = reads()
      await new Promise((resolve) => setTimeout(resolve, SYS.watch.intervalMs + SYS.watch.marginMs))
      f.s4idle = reads() - n
      const stream = await readStream(h, SEAM_PAGE_STREAM.route + query(SYS.langs[0]))
      try {
        f.streamStatus = stream.status
        f.s3 = Boolean(await until(() => reads() > n, SYS.watch.atOnceMs, SYS.pollMs))
        sessions.push({ ...SYS.watch.session })
        const id = SYS.watch.session.sessionId
        f.s1 = Boolean(await until(async () => (await view())?.runningSessions?.some((x) => x.sessionId === id), SYS.watch.intervalMs + SYS.watch.marginMs, SYS.pollMs))
        f.s1strip = Boolean(await until(() => stream.messages.some((m) => m?.topic === SEAM_PAGE_STREAM.topic.strip && m.frame?.targets?.some((t) => t.sessions?.some((x) => x.sessionId === id))), SYS.watch.marginMs, SYS.pollMs))
        sessions[0].running = false
        f.s2 = Boolean(await until(async () => (await view())?.runningSessions?.length === 0, SYS.watch.intervalMs + SYS.watch.marginMs, SYS.pollMs))
      } finally { await stream.close() }
      await new Promise((resolve) => setTimeout(resolve, SYS.watch.marginMs))
      n = reads()
      await new Promise((resolve) => setTimeout(resolve, SYS.watch.intervalMs + SYS.watch.marginMs))
      f.s4closed = reads() - n
    } finally { await fake.stop() }
  }], { packages: corePackages(), extension: EXTENSION })

  const reader = (source) => async (...keys) => {
    const f = await source()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const readBoth = reader(both)
  const t = (id, row, title, fn) => caseTest(id, row, title, { timeout: SYS.caseMs }, fn)
  const state = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))

  // ---------------------------------------------------------------- UI-UC-01 (core + its UI component)
  t('UI-UC-01', 'main 1', 'core is the started bundle; fishball-ui is its ./ui/ component row, not a bundle', async () => {
    const f = await readBoth('started')
    assert.ok(f.started.includes(NAMES.core), show(f.started))
    assert.equal(f.started.includes(NAMES.ui), false, show(f.started))
  })
  t('UI-UC-01', 'main 2', `core + fishball-ui: the ${ROWS.guards.length} UI guard rows are disabled`, async () => {
    const f = await readBoth('rows')
    assert.deepEqual(f.rows.filter((r) => ROWS.guards.includes(r.id) && r.present && !r.disabled).map((r) => r.id), [])
  })
  t('UI-UC-01', 'main 2', 'core + its UI component: fishball-ui, fishball-page and fishball-recommend-plugins run; there is no core-missing row', async () => {
    const s = state((await readBoth('rows')).rows)
    for (const id of Object.keys(ROWS.component)) assert.ok(s[id]?.present && !s[id].disabled && s[id].active, id + ': ' + show(s[id]))
    assert.equal(s[ROWS.coreMissing]?.present, false)
  })
  t('UI-UC-01', 'main 3', `core + fishball-ui: ${NAMES.uiGuards} is provided, a frozen marker carrying no rows`, async () => {
    const f = await readBoth('uiGuards')
    assert.ok(f.uiGuards.present, 'no ' + NAMES.uiGuards)
    assert.equal(f.uiGuards.keys.includes('rows'), false, show(f.uiGuards))
    assert.equal(f.uiGuards.frozen, true)
  })
  t('UI-UC-01', 'main 4', 'core + fishball-ui on a default install: the guard report is ok', async () => {
    const f = await readBoth('settled')
    assert.ok(isOk(f.settled), show(f.settled))
  })
  t('UI-UC-01', 'main 5', "core + fishball-ui: the page serves fishball-ui's client entry, the page and the tab; the tab's route answers", async () => {
    const f = await readBoth('graph', 'tab')
    for (const id of [NAMES.ui, ...Object.values(ROWS.subPackages)]) assert.ok(f.graph.includes(id), id + ' not in ' + show(f.graph))
    assert.equal(f.tab, SYS.ok)
  })
  t('UI-UC-01', 'E1', 'core + fishball-ui: no fishball-core-missing line', async () => {
    const f = await readBoth('logs')
    assert.deepEqual(f.logs.filter((l) => l.text.includes(SYS.coreMissingLine)), [])
  })
  t('UI-UC-01', 'A1', 'the owner re-enables a UI row: guards-overridden naming row:<id> (R-FB-09); restoring it clears that guard', async () => {
    const f = await readBoth('oneSet', 'restored')
    assert.equal(f.oneSet?.status, GUARDS.status.overridden, show(f.oneSet))
    assert.ok(f.oneSet.overridden.includes(rowGuard(ROWS.guards[0])), show(f.oneSet))
    assert.equal(f.restored.overridden.includes(rowGuard(ROWS.guards[0])), false, show(f.restored))
  })
  t('UI-UC-01', 'A1 restore', 'after the restore the report is ok again', async () => {
    const f = await readBoth('restored')
    assert.ok(isOk(f.restored), show(f.restored))
  })
  t('UI-UC-01', 'A2', "a core row and a UI row on at once: both are named, core's row first (core's rows, then the UI's)", async () => {
    const list = (await readBoth('twoSet')).twoSet?.overridden ?? []
    const coreAt = list.indexOf(rowGuard(CORE_SPLIT.guards[0]))
    const uiAt = list.indexOf(rowGuard(ROWS.guards[0]))
    assert.ok(coreAt >= 0 && uiAt >= 0 && coreAt < uiAt, show(list))
  })
  t('EFIX3-UI-SYS-01', 'standalone', `core + fishball-ui in a real standalone DSH (no child row): ${NOTICE.row} is described with no ${NOTICE.field} (the notice behaves as before)`, async () => {
    const f = await readBoth('notice')
    assert.equal(f.notice.described, true, show(f.notice))
    assert.equal(f.notice.has, false, show(f.notice))
  })

  // ---------------------------------------------------------------- the model dialog's live core
  t('MODEL-SYS-01', '', "core + fishball-ui: DSH's composer model picker row (ui-model-selection) is present and off", async () => {
    const s = state((await readBoth('rows')).rows)
    assert.ok(s[SYS.modelRow]?.present, show(s[SYS.modelRow]))
    assert.equal(s[SYS.modelRow].disabled, true)
  })
  for (const lang of SYS.langs) {
    t('STRIP-SYS-01', lang, `(${lang}) fishball-ui's strip route answers text/event-stream with an immediate frame {${SYS.frameKeys.join(', ')}}; standalone with no target: on, empty list, an empty text`, async () => {
      const r = (await readBoth('strip')).strip[lang]
      assert.equal(r.status, SYS.ok)
      assert.ok(r.type.includes(SYS.sse.type), r.type)
      assert.deepEqual(Object.keys(r.frame ?? {}).sort(), [...SYS.frameKeys].sort())
      assert.ok(Array.isArray(r.frame.targets) && Array.isArray(r.frame.notices))
      if (r.frame.on && r.frame.targets.length === 0) assert.ok(typeof r.frame.empty === 'string' && r.frame.empty.length > 0, 'no empty text')
    })
  }
  t('STRIP-DT-02', 'unknown target', "core's per-target Connect route (SEAM_TARGETS.route.connect) answers an unknown targetId 404 unknown-target; the withdrawn K3a route is gone", async () => {
    const f = await readBoth('connectUnknown', 'withdrawn')
    assert.equal(f.connectUnknown.status, SEAM_TARGETS.http.notFound, f.connectUnknown.text)
    assert.equal(f.connectUnknown.json?.code, SEAM_TARGETS.refusal.unknownTarget)
    assert.equal(f.withdrawn.status, SEAM_TARGETS.http.notFound, 'the withdrawn route still answers')
  })
  t('MODEL-ST-03', 'core off', 'core switched off live (HMR): its UI component rows go, the composer picker returns, the strip is not served and Connect answers 404 or 503', async () => {
    const f = await readBoth('off')
    const s = state(f.off.rows)
    assert.equal(s[SYS.modelRow].disabled, false, show(s[SYS.modelRow]))
    assert.equal(s[ROWS.coreMissing].present, false)
    for (const id of Object.keys(ROWS.component)) assert.equal(s[id].active, false, id + ' still runs: ' + show(s[id]))
    assert.equal(f.off.strip, SEAM_TARGETS.http.notFound)
    assert.ok([SEAM_TARGETS.http.notFound, SEAM_TARGETS.http.unavailable].includes(f.off.connect.status), f.off.connect.status + ' ' + f.off.connect.text)
  })
  t('PLAT-DT-02', 'integration', "core's status read through the fishballStatus service in a real standalone DSH, as fishball-ui's strip reads it: on, the set ok, no target", async () => {
    const f = await readBoth('snapshot', 'set')
    assert.equal(f.snapshot.fishball, SYS.on, show(f.snapshot))
    assert.deepEqual(f.snapshot.targets, { version: SEAM_TARGETS.snapshotVersion, targets: [] })
    assert.deepEqual(f.set, SYS.setOk)
  })

  // ---------------------------------------------------------------- WIRE-SYS compositions (ui+core, board stand-in+ui+core)
  for (const [label, read, withBoard] of [['fishball-ui+fishball-core', readBoth, false], ['fishball-board+fishball-ui+fishball-core', reader(board), true]]) {
    t('WIRE-SYS', label, `${label}: apiVersion ${SEAM_PAGE_STREAM.apiVersion} and the public service shape (${SYS.members.join(', ')}; ui ${SYS.uiMembers.join(', ')})`, async () => {
      const f = await read('shape')
      assert.equal(f.shape.apiVersion, SEAM_PAGE_STREAM.apiVersion)
      for (const key of SYS.members) assert.ok(f.shape.shape[key], key)
      for (const key of SYS.uiMembers) assert.ok(f.shape.shape.ui[key], 'ui.' + key)
    })
    t('WIRE-SYS', label + ' SHELVE', `${label}: the set is ok, nothing missing, never naming fishball-board${withBoard ? ' (the stand-in board row loaded)' : ''}`, async () => {
      const f = await read('set')
      if (withBoard) assert.deepEqual(f.rows.map((r) => [r.present, r.disabled]), [[true, false]], 'the stand-in board row is not loaded')
      assert.deepEqual(f.set, SYS.setOk)
    })
    t('WIRE-SYS', label + ' tools', `${label}: the manager's model tools are exactly the preset's (${GUARDS.managerTools.join(', ')}) plus core's own`, async () => {
      const f = await read('tools')
      const own = (n) => SYS.coreTools.includes(n) || SYS.privateSkill.test(n)
      for (const name of SYS.coreTools) assert.ok(f.tools.includes(name), name)
      assert.deepEqual(f.tools.filter((n) => !own(n)).sort(), [...GUARDS.managerTools].sort())
    })
  }
  t('WIRE-SYS', 'fishball-board+fishball-ui+fishball-core guards', 'board stand-in + ui + core on a default install: the guard report is ok', async () => {
    const f = await reader(board)('report')
    assert.ok(isOk(f.report), show(f.report))
  })
  t('WIRE-SYS', 'SHELVE broken', 'a broken fishball-board (no DSH meets its engines.dsh) + ui + core: the set is ok, nothing missing', async () => {
    const f = await reader(broken)('set')
    assert.deepEqual(f.set, SYS.setOk)
  })

  // ---------------------------------------------------------------- SESSIONS-WATCH SYS S1–S4 (DESIGN §35)
  const readWatch = reader(watch)
  t('SESSIONS-WATCH', 'SYS S4 idle', 'a connected target, no page stream: no sessions_list read over one interval', async () => {
    const f = await readWatch('connected', 's4idle')
    assert.equal(f.connected, true, 'the target never connected')
    assert.equal(f.s4idle, 0)
  })
  t('SESSIONS-WATCH', 'SYS S3', 'the page stream opens: one read at once, well inside one interval', async () => {
    const f = await readWatch('s3', 'streamStatus')
    assert.equal(f.streamStatus, SYS.ok)
    assert.equal(f.s3, true)
  })
  t('SESSIONS-WATCH', 'SYS S1', "a session that starts by itself appears in core's targets within one interval, and in fishball-ui's strip topic on the page stream", async () => {
    const f = await readWatch('s1', 's1strip')
    assert.equal(f.s1, true, 'not in ui.targets')
    assert.equal(f.s1strip, true, 'not in the strip topic')
  })
  t('SESSIONS-WATCH', 'SYS S2', 'it stops running: gone within one interval', async () => {
    assert.equal((await readWatch('s2')).s2, true)
  })
  t('SESSIONS-WATCH', 'SYS S4 closed', 'the last page stream closed: no more reads over one interval', async () => {
    assert.equal((await readWatch('s4closed')).s4closed, 0)
  })
}

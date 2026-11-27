/**
 * F-STATUS black-box cases (USE-CASES.md): core's status snapshot, the strip view, the set
 * completeness check (PLAT-DT-02, no member since SHELVE-BOARD 2026-11-18, so always ok; HOST-DT-03
 * rule 10), the contributed-tools count (R-EXT-14), `fishball-off` (R-FB-10) and the
 * display of core's target status (REM-DT-01; R-FB-03, R-FB-04; design §6.3a Connect).
 *
 * Techniques, Use Cases first (UC-STATUS-01…06), then Decision Tables (REM-DT-01 display rules,
 * F-STATUS-DT-01 line/control rules 1–5 (amended 2026-11-16) and their order rows, PLAT-DT-02 rules 1–6, HOST-DT-03
 * rule 10), EP (F-STATUS-EP-01 target usability, F-STATUS-EP-02 bundles never reported), BVA
 * (contributed count 0/1/n, fiber ACTIVE/FAILED, the app-ready boundary) and State Transitions
 * (Connect, the set across `plugin-manager/changed`, close).
 *
 * Level: unit with fakes, on a real Cordis Context of the current DSH (world.mjs): DSH's `appReady`,
 * `pluginManager` and `loader` are faked to their DSH types; core's ports to the relayed contract.
 * Rows withdrawn by MULTI-0 (fishball-ui's strip view, the scalar ports) and the old `todo` rows
 * (the page's press, F-WIRE's real DSH, a hosted child) are not registered: README.md says where
 * each went.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
// The link area's process-wide network recorder (packages/core/tests/link/, port-core-link's).
import { watchNetwork } from '../link/net-probe.mjs'
import {
  BOARD, CONNECT_STATUS, FIXTURE, HOST, LINE, LINK_STATUS, MODEL, NEVER_REPORTED, SECRET,
  SNAPSHOT_KEYS, SUBJECT, TARGET, TARGETS_SNAPSHOT, WAIT, WITHDRAWN_KEYS,
} from './constants.mjs'
import { NO_FIBER, bundle, entry, initializingEntry, loadingEntry } from './fakes.mjs'
import { statusModule, statusOf } from './subject.mjs'
import { ABSENT, settle, worldFor } from './world.mjs'

const show = (value) => JSON.stringify(value)
/** The line a link status gives when the link's word is kept: `{kind: state, code}`. */
const linkLine = (status) => ({ kind: status.state, code: status.code })
/** The stand-in board (constants.mjs BOARD), loaded: bundle on, its row's entry active. */
const boardBundle = (options) => bundle(BOARD.name, { rows: [[BOARD.row, BOARD.entry]], ...options })
const boardEntry = (options) => entry(BOARD.entry, options)
const SET_OK = Object.freeze({ status: MODEL.set.ok, missing: [] })
/**
 * SHELVE-BOARD (the user, 2026-11-18): core checks no member, so the set is `ok` whatever the board's
 * state: the snapshot's set is SET_OK, and neither language's strip has a set line or mentions the board.
 */
// MULTI-0: the strip text is fishball-ui's; core's oracle is the set alone, and no snapshot word names the board.
async function assertBoardNeverReported(snapshot, why) {
  assert.deepEqual(snapshot.set, SET_OK, `${why}: set`)
  assert.equal(BOARD.mention.exec(show(snapshot.set))?.[0], undefined, `${why}: the set mentions the board`)
}

/** Every key of a value, at any depth. */
function keysDeep(value, out = []) {
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.push(k); keysDeep(v, out) }
  return out
}
/**
 * MULTI-0 (targets.d.ts `TargetView.line`): core's per-target line and control are its pure
 * `stripLine(link, url, connect)` → {line, control}, the rule F-STATUS froze, now per target.
 */
async function lineFor({ link, target = TARGET.usable.https, connect = null }) {
  const mod = await statusModule()
  assert.equal(typeof mod[SUBJECT.line], 'function', `status/index.js exports no ${SUBJECT.line}()`)
  return mod[SUBJECT.line](link, target, connect)
}
async function assertLine(inputs, line, control, why) {
  const got = await lineFor(inputs)
  assert.deepEqual(got.line, line, `${why}: line ${show(got.line)}`)
  assert.equal(got.control, control, `${why}: control ${show(got.control)}`)
  return got
}
/** The settled set once app ready has fired. */
async function readySet(w) {
  w.ready()
  return (await w.until((s) => s.set !== null)).set
}
/** Registers every F-STATUS case on the current DSH. */
export function registerStatusCases() {
  const t = (id, row, title, fn) => caseTest(id, row, title, fn)

  // ---------------------------------------------------------------- the exported surface
  t('F-STATUS-00', 'surface', 'STATUS_MODEL is frozen and spells the relayed words; stripLine is exported', async () => {
    const mod = await statusModule()
    const model = mod[SUBJECT.model]
    assert.ok(Object.isFrozen(model), 'STATUS_MODEL is not frozen')
    for (const [key, value] of Object.entries(MODEL)) assert.deepEqual(model[key], value, `STATUS_MODEL.${key}`)
    assert.equal(typeof mod[SUBJECT.line], 'function', 'no stripLine export')
  })

  // ---------------------------------------------------------------- MULTI-STATUS: the snapshot shape (MULTI-0 StatusSnapshot)
  t('F-STATUS-01', 'snapshot', 'the snapshot is frozen, has exactly {fishball, set, targets, brand}, fishball on, brand {style} fishball for an absent stored value, no withdrawn scalar member, and null for set before ready', async (c) => {
    const w = await worldFor(c)
    const s = w.snapshot()
    assert.ok(Object.isFrozen(s), 'snapshot is not frozen')
    assert.deepEqual(Object.keys(s).sort(), [...SNAPSHOT_KEYS].sort())
    for (const key of WITHDRAWN_KEYS) assert.equal(Object.hasOwn(s, key), false, 'withdrawn member ' + key)
    assert.equal(s.fishball, MODEL.fishball.on)
    assert.deepEqual(s.targets, TARGETS_SNAPSHOT.empty)
    assert.equal(s.set, null)
    // LOGO-BUTTON: the normalized logo theme is always present; an absent stored value is fishball.
    assert.deepEqual(s.brand, { style: 'fishball' })
    assert.ok(Object.isFrozen(s.brand), 'brand is not frozen')
  })
  for (const [part, snapshot] of [['one', TARGETS_SNAPSHOT.one], ['two, zero tools counted', TARGETS_SNAPSHOT.two], ['connected', TARGETS_SNAPSHOT.connected]]) {
    t('MULTI-STATUS-EP-01', part, `snapshot.targets is the targets port's list() exactly (${part})`, async (c) => {
      const w = await worldFor(c, { targets: snapshot })
      assert.deepEqual(w.snapshot().targets, snapshot)
    })
  }
  t('MULTI-STATUS-ST-01', 'change', 'a target list change is emitted once with the new list; an equal list does not re-emit', async (c) => {
    const w = await worldFor(c, { targets: TARGETS_SNAPSHOT.one })
    await settle()
    const before = w.emitted.length
    w.targets.set(TARGETS_SNAPSHOT.one)
    await settle()
    assert.equal(w.emitted.length, before, 'an equal list re-emitted')
    w.targets.set(TARGETS_SNAPSHOT.two)
    await settle()
    assert.equal(w.emitted.length, before + 1)
    assert.deepEqual(w.emitted.at(-1).targets, TARGETS_SNAPSHOT.two)
  })

  // ---------------------------------------------------------------- REM-DT-01 / F-STATUS-DT-01: the per-target line (stripLine, first match wins)
  const remRules = [
    ['rule 1', 'target not set', LINK_STATUS.unset, TARGET.unusable.empty],
    ['rule 2', 'target unreachable', LINK_STATUS.unreachable, TARGET.usable.https],
    ['rule 3', 'token not configured / refused', LINK_STATUS.refused, TARGET.usable.https],
    ['rule 4a', 'a paired credential refused: token-revoked (R-HOST-10)', LINK_STATUS.revoked, TARGET.usable.https],
    ['rule 5', 'connected', LINK_STATUS.connected, TARGET.usable.https],
    ['rule 6', 'V2 connector: TARGET_INCOMPATIBLE', LINK_STATUS.incompatible, TARGET.usable.https],
  ]
  for (const [rule, title, link, target] of remRules) {
    t('REM-DT-01', rule, `${title}: the target's line shows the link word and code, no control (no Connect)`, async () => {
      await assertLine({ link, target }, link.state === LINE.connected ? { kind: LINE.connected, code: null } : linkLine(link), null, rule)
    })
  }

  // ---------------------------------------------------------------- F-STATUS-DT-01: line and control (first match wins)
  // Amended by the dev session 2026-11-16 (design §6.3a step 1: "with a target set and no saved grant,
  // the strip shows Connect"): the old "target-unreachable → link line, no control" rule is withdrawn.
  const dtRules = [
    ['rule 1 connected', 'link connected (Connect needs authorization): connected, no control', { link: LINK_STATUS.connected, connect: CONNECT_STATUS.needsAuthorization }, { kind: LINE.connected, code: null }, null],
    ['rule 1 connected over 3', 'link connected wins over a pending attempt', { link: LINK_STATUS.connected, connect: CONNECT_STATUS.authorizing }, { kind: LINE.connected, code: null }, null],
    ['rule 1 unusable', 'target refused by core (insecure): the link word, no Connect', { link: LINK_STATUS.insecure, target: TARGET.unusable.plainHttpRemote, connect: CONNECT_STATUS.needsAuthorization }, linkLine(LINK_STATUS.insecure), null],
    ['rule 1 unusable over 3', 'target unusable wins over a pending attempt', { link: LINK_STATUS.invalid, target: TARGET.unusable.userinfo, connect: CONNECT_STATUS.authorizing }, linkLine(LINK_STATUS.invalid), null],
    ['rule 1 unusable over 4', 'target unusable wins over needs-configuration', { link: LINK_STATUS.unset, target: TARGET.unusable.blank, connect: CONNECT_STATUS.needsConfiguration }, linkLine(LINK_STATUS.unset), null],
    ['rule 2 no port', 'no Connect port: the link line, no control', { link: LINK_STATUS.refused }, linkLine(LINK_STATUS.refused), null],
    ['rule 2 no port unreachable', 'no Connect port, target unreachable: the link line, no control', { link: LINK_STATUS.unreachable }, linkLine(LINK_STATUS.unreachable), null],
    ['rule 2 authorized', 'Connect authorized: the link line, no control', { link: LINK_STATUS.refused, connect: CONNECT_STATUS.authorized }, linkLine(LINK_STATUS.refused), null],
    ['rule 2 authorized unreachable', 'Connect authorized, target unreachable: the link line, no control', { link: LINK_STATUS.unreachable, connect: CONNECT_STATUS.authorized }, linkLine(LINK_STATUS.unreachable), null],
    ['rule 3', 'attempt pending: "finish on the approval page", cancel', { link: LINK_STATUS.unset, connect: CONNECT_STATUS.authorizing }, { kind: LINE.authorizing, code: null }, MODEL.control.cancel],
    ['rule 3 refused', 'attempt pending while the token is refused: authorizing, cancel', { link: LINK_STATUS.refused, connect: CONNECT_STATUS.authorizing }, { kind: LINE.authorizing, code: null }, MODEL.control.cancel],
    ['rule 3 unreachable', 'attempt pending while the target is unreachable: authorizing, cancel', { link: LINK_STATUS.unreachable, connect: CONNECT_STATUS.authorizing }, { kind: LINE.authorizing, code: null }, MODEL.control.cancel],
    ['rule 4', 'no connect.clientMetadataUrl: needs-configuration with its code, no control', { link: LINK_STATUS.unset, connect: CONNECT_STATUS.needsConfiguration }, linkLine({ state: LINE.needsConfiguration, code: CONNECT_STATUS.needsConfiguration.code }), null],
    ['rule 4 unreachable', 'needs-configuration while the target is unreachable: needs-configuration, no control', { link: LINK_STATUS.unreachable, connect: CONNECT_STATUS.needsConfiguration }, linkLine({ state: LINE.needsConfiguration, code: CONNECT_STATUS.needsConfiguration.code }), null],
    ['rule 5 unset', 'target set, no grant: needs-authorization, Connect', { link: LINK_STATUS.unset, connect: CONNECT_STATUS.needsAuthorization }, linkLine(CONNECT_STATUS.needsAuthorization), MODEL.control.connect],
    ['rule 5 unset failed', 'target set, attempt failed (access_denied): failed with its code, Connect', { link: LINK_STATUS.unset, connect: CONNECT_STATUS.failedDenied }, linkLine(CONNECT_STATUS.failedDenied), MODEL.control.connect],
    ['rule 5 unset failed bare', 'target set, attempt failed with no code: failed, Connect', { link: LINK_STATUS.unset, connect: CONNECT_STATUS.failedBare }, linkLine(CONNECT_STATUS.failedBare), MODEL.control.connect],
    ['rule 5 refused', 'token refused, needs authorization: the link word kept, Connect', { link: LINK_STATUS.refused, connect: CONNECT_STATUS.needsAuthorization }, linkLine(LINK_STATUS.refused), MODEL.control.connect],
    ['rule 5 revoked', 'token-revoked after invalid_grant: the link word kept, Connect', { link: LINK_STATUS.revoked, connect: CONNECT_STATUS.failedGrant }, linkLine(LINK_STATUS.revoked), MODEL.control.connect],
    ['rule 5 unreachable', 'target unreachable, needs authorization: the link word kept, Connect', { link: LINK_STATUS.unreachable, connect: CONNECT_STATUS.needsAuthorization }, linkLine(LINK_STATUS.unreachable), MODEL.control.connect],
    ['rule 5 incompatible', 'TARGET_INCOMPATIBLE, attempt failed: the link word kept, Connect', { link: LINK_STATUS.incompatible, connect: CONNECT_STATUS.failedGrant }, linkLine(LINK_STATUS.incompatible), MODEL.control.connect],
  ]
  for (const [rule, title, inputs, line, control] of dtRules) {
    t('F-STATUS-DT-01', rule, title, async () => { await assertLine(inputs, line, control, rule) })
  }

  // ---------------------------------------------------------------- F-STATUS-EP-01: target usability (F-LINK's rule)
  for (const [name, url] of Object.entries(TARGET.usable)) {
    t('F-STATUS-EP-01', 'usable ' + name, `usable target ${url}: no grant shows Connect (rule 5)`, async (c) => {
      await assertLine({ link: LINK_STATUS.unset, target: url, connect: CONNECT_STATUS.needsAuthorization }, linkLine(CONNECT_STATUS.needsAuthorization), MODEL.control.connect, name)
    })
  }
  const unusableLink = {
    empty: LINK_STATUS.unset, blank: LINK_STATUS.unset, plainHttpRemote: LINK_STATUS.insecure, nearLoopbackV4: LINK_STATUS.insecure,
    nearLoopbackV6: LINK_STATUS.insecure, userinfo: LINK_STATUS.invalid, otherScheme: LINK_STATUS.invalid, notUrl: LINK_STATUS.invalid,
  }
  for (const [name, url] of Object.entries(TARGET.unusable)) {
    t('F-STATUS-EP-01', 'unusable ' + name, `unusable target ${show(name)}: the link word, no Connect (rule 1)`, async (c) => {
      const link = unusableLink[name]
      await assertLine({ link, target: url, connect: CONNECT_STATUS.needsAuthorization }, linkLine(link), null, name)
    })
  }

  // ---------------------------------------------------------------- F-STATUS-ST-01: one target's line through Connect (pure transitions)
  t('F-STATUS-ST-01', 'Connect', 'needs-authorization → authorizing → authorized → link connected: connect, cancel, none', async () => {
    await assertLine({ link: LINK_STATUS.unset, connect: CONNECT_STATUS.needsAuthorization }, linkLine(CONNECT_STATUS.needsAuthorization), MODEL.control.connect, 'start')
    await assertLine({ link: LINK_STATUS.unset, connect: CONNECT_STATUS.authorizing }, { kind: LINE.authorizing, code: null }, MODEL.control.cancel, 'authorizing')
    await assertLine({ link: LINK_STATUS.unset, connect: CONNECT_STATUS.authorized }, linkLine(LINK_STATUS.unset), null, 'authorized')
    await assertLine({ link: LINK_STATUS.connected, connect: CONNECT_STATUS.authorized }, { kind: LINE.connected, code: null }, null, 'connected')
  })
  t('F-STATUS-ST-01', 'failed', 'authorizing → failed (access_denied): Connect is offered again', async () => {
    await assertLine({ link: LINK_STATUS.unset, connect: CONNECT_STATUS.failedDenied }, linkLine(CONNECT_STATUS.failedDenied), MODEL.control.connect, 'failed')
  })

  t('UC-STATUS-01', 'E4', 'a throwing listener affects no other listener and not the port that announced the change', async (c) => {
    const w = await worldFor(c)
    const after = []
    w.status.onChange(() => { throw new Error('fbtest listener fault') })
    w.status.onChange((s) => after.push(s))
    assert.doesNotThrow(() => w.targets.set(TARGETS_SNAPSHOT.one), 'the listener fault reached the port')
    await settle()
    assert.equal(w.emitted.length, 1, 'the listener before the throwing one')
    assert.equal(after.length, 1, 'the listener after the throwing one')
    w.targets.set(TARGETS_SNAPSHOT.two)
    await settle()
    assert.equal(after.length, 2, 'status keeps emitting')
  })
  t('UC-STATUS-01', 'onChange dispose', 'a disposed listener gets nothing more', async (c) => {
    const w = await worldFor(c)
    const got = []
    const dispose = w.status.onChange((s) => got.push(s))
    dispose()
    w.targets.set(TARGETS_SNAPSHOT.one)
    await settle()
    assert.deepEqual(got, [])
    assert.equal(w.emitted.length, 1, 'the other listener still gets it')
  })
  t('UC-STATUS-01', 'postcondition', 'no token value or token field in the snapshot; reading sends and changes nothing', async (c) => {
    const net = await watchNetwork({ quietMs: WAIT.quietMs, settleMs: WAIT.netSettleMs })
    const w = await worldFor(c, { targets: TARGETS_SNAPSHOT.two, ready: true, bundles: [boardBundle()], entries: [boardEntry()] })
    const s = await w.until((x) => x.set !== null)
    assert.ok(!show(s).includes(SECRET), `a credential value appears: ${show(s)}`)
    assert.deepEqual(keysDeep(s).filter((k) => FIXTURE.forbiddenKey.test(k)), [], 'a token field')
    for (let i = 0; i < FIXTURE.tools.many; i++) w.snapshot()
    await settle()
    assert.deepEqual(w.pluginManager.mutations, [], 'the plugin manager changed')
    assert.deepEqual(net.all(), [], 'a network attempt')
  })

  // ---------------------------------------------------------------- PLAT-DT-02 (no member since SHELVE-BOARD) and the app-ready boundary
  t('F-STATUS-ST-04', 'before ready', 'set is null before app ready, also across plugin-manager/changed; computed at app ready', async (c) => {
    const w = await worldFor(c, { bundles: [boardBundle()], entries: [boardEntry()] })
    w.changed()
    await settle()
    assert.equal(w.snapshot().set, null, 'set before app ready')
    assert.deepEqual(await readySet(w), SET_OK)
  })

  t('F-STATUS-ST-04', 'already ready', 'app already ready at createStatus: the set is computed', async (c) => {
    const w = await worldFor(c, { ready: true, bundles: [boardBundle()], entries: [boardEntry()] })
    assert.deepEqual((await w.until((s) => s.set !== null)).set, SET_OK)
  })

  // SHELVE-BOARD (the user, 2026-11-18): the board left core's set check (no member remains), so every
  // rule's board state gives `ok` with nothing missing and no set line. Rules 1, 2, 5 and 6 were `ok`
  // already; rules 3 and 4 (the board reported skipped or failed) are re-baselined at their rows.
  const setRules = [
    ['rule 1', 'board on and loaded → ok', [boardBundle()], [boardEntry()]],
    ['rule 2', 'board not installed (absent from the list) → ok, nothing reported', [], []],
    ['rule 2 listed', 'board listed but not installed and not selected → ok', [bundle(BOARD.name, { enabled: false, installed: false })], []],
    // SHELVE-BOARD (the user, 2026-11-18): was "reported, skipped with the manager code"; the board is no member.
    ['rule 3', 'board enabled but skipped (incompatible) → ok, never reported', [bundle(BOARD.name, { error: HOST.incompatible })], []],
    // SHELVE-BOARD (the user, 2026-11-18): was "reported with that code"; any skip code is not reported.
    ['rule 3 other code', 'board enabled, skipped with operation-error → ok, never reported', [bundle(BOARD.name, { error: HOST.operationError })], []],
    // Dev session decision 2026-11-16 (R-BND-05, design §8.2): selected but unresolvable or unreadable is
    // "enabled but skipped". SHELVE-BOARD (the user, 2026-11-18): it was reported with DSH's error.code;
    // the board is no member now, so unresolved and unreadable are not reported either.
    ['rule 3 unresolved', 'board selected, package not installed (not-bundle) → ok, never reported', [bundle(BOARD.name, { installed: false, error: HOST.notBundle })], []],
    ['rule 3 unreadable', 'board selected and installed, package unreadable (not-bundle) → ok, never reported', [bundle(BOARD.name, { error: HOST.notBundle })], []],
    ['rule 2 unselected unreadable', 'board not selected, package unreadable (not-bundle) → ok (not selected is not installed)', [bundle(BOARD.name, { enabled: false, error: HOST.notBundle })], []],
    // SHELVE-BOARD (the user, 2026-11-18): was "reported, failed, code null"; a failed board row is not reported.
    ['rule 4', 'board enabled, its row failed to load (fiber FAILED) → ok, never reported', [boardBundle()], [boardEntry({ state: HOST.fiberFailed })]],
    // Dev session amendment 2026-11-16: the loader catches an import error and leaves fiber undefined.
    // SHELVE-BOARD (the user, 2026-11-18): was "reported, failed, code null"; the board is no member.
    ['rule 4 no fiber', 'board enabled, its live entry has no fiber after its import settled → ok, never reported', [boardBundle()], [boardEntry({ state: NO_FIBER })]],
    ['rule 5', 'board switched off by the owner → ok', [boardBundle({ enabled: false })], []],
    ['rule 5 incompatible', 'board off while incompatible → ok', [bundle(BOARD.name, { enabled: false, error: HOST.incompatible })], []],
    ['rule 6', "board enabled, its row switched off by the owner (entry disabled) → ok", [boardBundle()], [boardEntry({ disabled: true, state: NO_FIBER })]],
  ]
  for (const [rule, title, bundles, entries] of setRules) {
    t('PLAT-DT-02', rule, title, async (c) => {
      const w = await worldFor(c, { bundles, entries })
      await readySet(w)
      await assertBoardNeverReported(w.snapshot(), rule)
    })
  }

  // SHELVE-BOARD (the user, 2026-11-18): was "ACTIVE (2) is loaded and FAILED (3) is failed"; the board
  // is no member, so both sides of the boundary give ok.
  t('F-STATUS-BVA-02', 'fiber', 'board row fiber ACTIVE (2) and FAILED (3): ok either way, the board never reported', async (c) => {
    for (const state of [HOST.fiberActive, HOST.fiberFailed]) {
      const w = await worldFor(c, { bundles: [boardBundle()], entries: [boardEntry({ state })] })
      await readySet(w)
      await assertBoardNeverReported(w.snapshot(), 'fiber state ' + state)
    }
  })

  t('HOST-DT-03', 'rule 10', 'standalone: fishball-hosted-settings is never reported missing, even enabled and skipped or failed', async (c) => {
    const w = await worldFor(c, {
      bundles: [boardBundle(), bundle(NEVER_REPORTED.hostedSettings, { error: HOST.incompatible }), bundle(NEVER_REPORTED.hostedSettings, { rows: [[NEVER_REPORTED.hostedSettings, FIXTURE.otherEntry]] })],
      entries: [boardEntry(), entry(FIXTURE.otherEntry, { state: HOST.fiberFailed })],
    })
    assert.deepEqual(await readySet(w), SET_OK)
  })

  for (const [name, which] of [['fishball-ui (Q-G1)', NEVER_REPORTED.ui], ['Watchdog (R-FB-07 withdrawn)', NEVER_REPORTED.watchdog], ['an ordinary other bundle', NEVER_REPORTED.other]]) {
    // SHELVE-BOARD (the user, 2026-11-18): was "…; the board alone is" (reported skipped); the board is
    // no member now, so with both skipped the set is ok and the strip names neither.
    t('F-STATUS-EP-02', name, `${which} enabled but skipped, or with a failed row, is never reported; nor is the skipped board`, async (c) => {
      const w = await worldFor(c, {
        bundles: [bundle(BOARD.name, { error: HOST.incompatible }), bundle(which, { error: HOST.incompatible, rows: [[which, FIXTURE.otherEntry]] })],
        entries: [entry(FIXTURE.otherEntry, { state: HOST.fiberFailed })],
      })
      await readySet(w)
      await assertBoardNeverReported(w.snapshot(), which)
      assert.ok(!show(w.snapshot().set).includes(which), `the set names ${which}: ${show(w.snapshot().set)}`)
    })
  }

  // SHELVE-BOARD (the user, 2026-11-18): was "ok → skipped → failed → ok, each emitted"; the board is no
  // member, so the set stays ok through every board state, and (UC-STATUS-01 main 4: equal snapshots
  // do not re-emit) no emission follows a change that leaves the snapshot equal.
  t('F-STATUS-ST-02', 'changed', 'the set stays ok across plugin-manager/changed while the board goes loaded → skipped → failed → loaded; nothing re-emitted', async (c) => {
    const w = await worldFor(c, { bundles: [boardBundle()], entries: [boardEntry()] })
    assert.deepEqual(await readySet(w), SET_OK)
    await settle()
    const before = w.emitted.length
    const steps = [
      ['skipped', () => { w.pluginManager.bundles = [bundle(BOARD.name, { error: HOST.incompatible })] }],
      ['failed', () => { w.pluginManager.bundles = [boardBundle()]; w.loader.list = [boardEntry({ state: HOST.fiberFailed })] }],
      ['loaded', () => { w.loader.list = [boardEntry()] }],
    ]
    for (const [state, act] of steps) {
      act()
      w.changed()
      await settle()
      await assertBoardNeverReported(w.snapshot(), 'board ' + state)
    }
    assert.equal(w.emitted.length, before, `re-emitted an equal snapshot: ${show(w.emitted.slice(before))}`)
    assert.deepEqual(w.pluginManager.mutations, [], 'the check changed the plugin manager')
  })

  /** No snapshot the status emitted carried a set other than null (before app ready) or ok. */
  const assertNeverIncomplete = (w) => {
    const sets = w.emitted.map((s) => s.set).filter((set) => set !== null)
    assert.deepEqual(sets.filter((set) => show(set) !== show(SET_OK)), [], 'an emitted set that is not ok')
  }
  for (const [name, start] of [['fiber loading', loadingEntry], ['import running', initializingEntry]]) {
    for (const end of [HOST.fiberFailed, HOST.fiberActive]) {
      // SHELVE-BOARD (the user, 2026-11-18): for end 3 it was "failed"; the board is no member, so the row
      // ending FAILED gives ok too. End 2 was ok already.
      t('PLAT-DT-02', `rule 4 ${name} ends ${end}`, `plugin-manager/changed while the board row is still loading (${name}): ok once it ends in fiber state ${end}, never reported`, async (c) => {
        const row = start(BOARD.entry)
        const w = await worldFor(c, { bundles: [boardBundle()], entries: [row.entry], ready: true })
        w.changed()
        await settle()
        row.end(end)
        await w.until((x) => x.set !== null)
        await settle()
        await assertBoardNeverReported(w.snapshot(), 'set after the row settled')
        assertNeverIncomplete(w)
      })
    }
  }
  // SHELVE-BOARD (the user, 2026-11-18): was "→ failed"; the board is no member, so its import failing is not reported.
  t('PLAT-DT-02', 'rule 4 import failed', 'a board row whose import is running ends with no fiber (import error) → ok, never reported', async (c) => {
    const row = initializingEntry(BOARD.entry)
    const w = await worldFor(c, { bundles: [boardBundle()], entries: [row.entry], ready: true })
    w.changed()
    await settle()
    row.end(NO_FIBER)
    await w.until((x) => x.set !== null)
    await settle()
    await assertBoardNeverReported(w.snapshot(), 'set after the import failed')
    assertNeverIncomplete(w)
  })

  t('UC-STATUS-02', 'A3', 'no pluginManager service: set stays null after app ready and plugin-manager/changed', async (c) => {
    const w = await worldFor(c, { bundles: ABSENT, entries: [boardEntry()] })
    w.ready()
    w.changed()
    await settle()
    assert.equal(w.snapshot().set, null)
  })

  // ---------------------------------------------------------------- UC-STATUS-06: close
  t('UC-STATUS-06', 'close', 'after close: no emission, no set recompute, and every port listener disposed', async (c) => {
    const w = await worldFor(c, { bundles: [boardBundle()], entries: [boardEntry()] })
    await settle()
    w.close()
    const before = w.emitted.length
    const lists = w.pluginManager.lists
    w.targets.set(TARGETS_SNAPSHOT.two)
    w.ready()
    w.changed()
    await settle()
    assert.equal(w.emitted.length, before, `emitted after close: ${show(w.emitted.slice(before))}`)
    assert.equal(w.pluginManager.lists, lists, 'the set was read after close')
    assert.equal(w.targets.listeners, 0, 'port subscriptions left after close')
  })

  // Dev session amendment 2026-11-16: createStatus ties close() to ctx.effect when ctx has one.
  t('UC-STATUS-06', 'ctx disposed', 'created in a Cordis plugin: disposing its fiber stops emissions and port subscriptions', async (c) => {
    const w = await worldFor(c, { plugin: true })
    await settle()
    await w.fiber.dispose()
    const before = w.emitted.length
    w.targets.set(TARGETS_SNAPSHOT.two)
    await settle()
    assert.equal(w.emitted.length, before, `emitted after the context was disposed: ${show(w.emitted.slice(before))}`)
    assert.equal(w.targets.listeners, 0, 'port subscriptions left')
  })

  // ---------------------------------------------------------------- R-FB-10: fishball-off
  for (const [name, service] of [['undefined', undefined], ['null', null], ['an object without snapshot', {}], ['a string', MODEL.serviceName]]) {
    t('UC-STATUS-05', 'off ' + name, `statusOf(${name}) is the frozen fishball-off status; the strip shows one fishball-off line`, async () => {
      const s = await statusOf(service)
      assert.deepEqual(s, { fishball: MODEL.fishball.off })
      assert.ok(Object.isFrozen(s), 'not frozen')
      // StatusSnapshot: without core, exactly {fishball: 'fishball-off'} with no `targets`.
      assert.equal(Object.hasOwn(s, 'targets'), false)
    })
  }

  t('UC-STATUS-05', 'on', 'statusOf(a live status) is its snapshot', async (c) => {
    const w = await worldFor(c, { targets: TARGETS_SNAPSHOT.one })
    assert.deepEqual(await statusOf(w.status), w.snapshot())
  })
}

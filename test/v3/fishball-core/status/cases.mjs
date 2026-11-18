/**
 * F-STATUS black-box cases (USE-CASES.md): core's status snapshot, the strip view, the set
 * completeness check (PLAT-DT-02, no member since SHELVE-BOARD 2026-11-18, so always ok; HOST-DT-03
 * rule 10), the guards notice (R-FB-09, design §5a.2), the contributed-tools count (R-EXT-14), `fishball-off` (R-FB-10) and the
 * display of core's target status (REM-DT-01; R-FB-03, R-FB-04; design §6.3a Connect).
 *
 * Techniques, Use Cases first (UC-STATUS-01…06), then Decision Tables (REM-DT-01 display rules,
 * F-STATUS-DT-01 line/control rules 1–5 (amended 2026-11-16) and their order rows, PLAT-DT-02 rules 1–6, HOST-DT-03
 * rule 10), EP (F-STATUS-EP-01 target usability, F-STATUS-EP-02 bundles never reported), BVA
 * (contributed count 0/1/n, fiber ACTIVE/FAILED, the app-ready boundary) and State Transitions
 * (Connect, the set across `plugin-manager/changed`, the one notice per start, close).
 *
 * Level: unit with fakes, on a real Cordis Context of each SDK (world.mjs): DSH's `appReady`,
 * `pluginManager` and `loader` are faked to their SDK types; core's ports to the relayed contract.
 * Rows that need the page, F-WIRE's real DSH wiring or a hosted child are `todo` and name the owner.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { caseName, caseTest } from '../../contract/package-boundaries/cases.mjs'
import { watchNetwork } from '../link/net-probe.mjs'
import {
  BOARD, CONNECT_STATUS, FIXTURE, GUARD, HOST, LATER, LINE, LINK_STATUS, MODEL, NEVER_REPORTED, PROBE, SECRET,
  SNAPSHOT_KEYS, SUBJECT, TARGET, TARGETS_SNAPSHOT, WAIT, WITHDRAWN_KEYS, WITHDRAWN_ROW,
} from './constants.mjs'
import { NOTIFY, NO_FIBER, bundle, entry, initializingEntry, loadingEntry } from './fakes.mjs'
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
async function assertBoardNeverReported(sdk, snapshot, why) {
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
async function lineFor(sdk, { link, target = TARGET.usable.https, connect = null }) {
  const mod = await statusModule(sdk)
  assert.equal(typeof mod[SUBJECT.line], 'function', `status/index.js exports no ${SUBJECT.line}()`)
  return mod[SUBJECT.line](link, target, connect)
}
async function assertLine(sdk, inputs, line, control, why) {
  const got = await lineFor(sdk, inputs)
  assert.deepEqual(got.line, line, `${why}: line ${show(got.line)}`)
  assert.equal(got.control, control, `${why}: control ${show(got.control)}`)
  return got
}
/** The settled set once app ready has fired. */
async function readySet(w) {
  w.ready()
  return (await w.until((s) => s.set !== null)).set
}
/** Registers every F-STATUS case for one SDK. */
export function registerStatusCases(sdk) {
  const t = (id, row, title, fn, todo) => caseTest(sdk, id, row, title, fn, todo)
  const withdrawn = (id, row, title, reason) => test(caseName(sdk, id, row, title), { skip: reason }, () => {})

  // ---------------------------------------------------------------- the exported surface
  t('F-STATUS-00', 'surface', 'STATUS_MODEL is frozen and spells the relayed words; guardsNotice names the list; stripLine is exported', async () => {
    const mod = await statusModule(sdk)
    const model = mod[SUBJECT.model]
    assert.ok(Object.isFrozen(model), 'STATUS_MODEL is not frozen')
    for (const [key, value] of Object.entries(MODEL)) assert.deepEqual(model[key], value, `STATUS_MODEL.${key}`)
    const text = model.text.guardsNotice(GUARD.first.join(GUARD.separator))
    for (const guard of GUARD.first) assert.ok(text.includes(guard), `guardsNotice does not name ${guard}: ${text}`)
    assert.equal(typeof mod[SUBJECT.line], 'function', 'no stripLine export')
  })

  // ---------------------------------------------------------------- MULTI-STATUS: the snapshot shape (MULTI-0 StatusSnapshot)
  t('F-STATUS-01', 'snapshot', 'the snapshot is frozen, has exactly {fishball, guards, set, targets}, fishball on, no withdrawn scalar member, and null for absent guards / set before ready', async (c) => {
    const w = await worldFor(c, sdk)
    const s = w.snapshot()
    assert.ok(Object.isFrozen(s), 'snapshot is not frozen')
    assert.deepEqual(Object.keys(s).sort(), [...SNAPSHOT_KEYS].sort())
    for (const key of WITHDRAWN_KEYS) assert.equal(Object.hasOwn(s, key), false, 'withdrawn member ' + key)
    assert.equal(s.fishball, MODEL.fishball.on)
    assert.deepEqual(s.targets, TARGETS_SNAPSHOT.empty)
    assert.deepEqual({ guards: s.guards, set: s.set }, { guards: null, set: null })
  })
  for (const [part, snapshot] of [['one', TARGETS_SNAPSHOT.one], ['two, zero tools counted', TARGETS_SNAPSHOT.two], ['connected', TARGETS_SNAPSHOT.connected]]) {
    t('MULTI-STATUS-EP-01', part, `snapshot.targets is the targets port's list() exactly (${part})`, async (c) => {
      const w = await worldFor(c, sdk, { targets: snapshot })
      assert.deepEqual(w.snapshot().targets, snapshot)
    })
  }
  t('MULTI-STATUS-ST-01', 'change', 'a target list change is emitted once with the new list; an equal list does not re-emit', async (c) => {
    const w = await worldFor(c, sdk, { targets: TARGETS_SNAPSHOT.one })
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

  t('F-STATUS-02', 'snapshot', 'the snapshot carries the guard report when the port is there', async (c) => {
    const report = GUARD.overridden(GUARD.first)
    const w = await worldFor(c, sdk, { guards: report })
    assert.deepEqual(w.snapshot().guards, report)
  })

  t('F-STATUS-03', 'snapshot', 'a guards port whose report is still undefined gives guards null', async (c) => {
    const w = await worldFor(c, sdk, { guards: undefined })
    assert.equal(w.snapshot().guards, null)
    w.guards.set(GUARD.ok)
    await settle()
    assert.deepEqual(w.snapshot().guards, GUARD.ok, 'the first report appears')
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
      await assertLine(sdk, { link, target }, link.state === LINE.connected ? { kind: LINE.connected, code: null } : linkLine(link), null, rule)
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
    t('F-STATUS-DT-01', rule, title, async () => { await assertLine(sdk, inputs, line, control, rule) })
  }

  // ---------------------------------------------------------------- F-STATUS-EP-01: target usability (F-LINK's rule)
  for (const [name, url] of Object.entries(TARGET.usable)) {
    t('F-STATUS-EP-01', 'usable ' + name, `usable target ${url}: no grant shows Connect (rule 5)`, async (c) => {
      await assertLine(sdk, { link: LINK_STATUS.unset, target: url, connect: CONNECT_STATUS.needsAuthorization }, linkLine(CONNECT_STATUS.needsAuthorization), MODEL.control.connect, name)
    })
  }
  const unusableLink = {
    empty: LINK_STATUS.unset, blank: LINK_STATUS.unset, plainHttpRemote: LINK_STATUS.insecure, nearLoopbackV4: LINK_STATUS.insecure,
    nearLoopbackV6: LINK_STATUS.insecure, userinfo: LINK_STATUS.invalid, otherScheme: LINK_STATUS.invalid, notUrl: LINK_STATUS.invalid,
  }
  for (const [name, url] of Object.entries(TARGET.unusable)) {
    t('F-STATUS-EP-01', 'unusable ' + name, `unusable target ${show(name)}: the link word, no Connect (rule 1)`, async (c) => {
      const link = unusableLink[name]
      await assertLine(sdk, { link, target: url, connect: CONNECT_STATUS.needsAuthorization }, linkLine(link), null, name)
    })
  }

  // ---------------------------------------------------------------- F-STATUS-ST-01: one target's line through Connect (pure transitions)
  t('F-STATUS-ST-01', 'Connect', 'needs-authorization → authorizing → authorized → link connected: connect, cancel, none', async () => {
    await assertLine(sdk, { link: LINK_STATUS.unset, connect: CONNECT_STATUS.needsAuthorization }, linkLine(CONNECT_STATUS.needsAuthorization), MODEL.control.connect, 'start')
    await assertLine(sdk, { link: LINK_STATUS.unset, connect: CONNECT_STATUS.authorizing }, { kind: LINE.authorizing, code: null }, MODEL.control.cancel, 'authorizing')
    await assertLine(sdk, { link: LINK_STATUS.unset, connect: CONNECT_STATUS.authorized }, linkLine(LINK_STATUS.unset), null, 'authorized')
    await assertLine(sdk, { link: LINK_STATUS.connected, connect: CONNECT_STATUS.authorized }, { kind: LINE.connected, code: null }, null, 'connected')
  })
  t('F-STATUS-ST-01', 'failed', 'authorizing → failed (access_denied): Connect is offered again', async () => {
    await assertLine(sdk, { link: LINK_STATUS.unset, connect: CONNECT_STATUS.failedDenied }, linkLine(CONNECT_STATUS.failedDenied), MODEL.control.connect, 'failed')
  })

  t('UC-STATUS-01', 'E4', 'a throwing listener affects no other listener and not the port that announced the change', async (c) => {
    const w = await worldFor(c, sdk)
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
    const w = await worldFor(c, sdk)
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
    const w = await worldFor(c, sdk, { targets: TARGETS_SNAPSHOT.two, guards: GUARD.ok, ready: true, bundles: [boardBundle()], entries: [boardEntry()] })
    const s = await w.until((x) => x.set !== null)
    assert.ok(!show(s).includes(SECRET), `a credential value appears: ${show(s)}`)
    assert.deepEqual(keysDeep(s).filter((k) => FIXTURE.forbiddenKey.test(k)), [], 'a token field')
    for (let i = 0; i < FIXTURE.tools.many; i++) w.snapshot()
    await settle()
    assert.deepEqual(w.pluginManager.mutations, [], 'the plugin manager changed')
    assert.deepEqual(w.notice.calls, [], 'a notice without an overridden report')
    assert.deepEqual(net.all(), [], 'a network attempt')
  })

  // Withdrawn (MULTI-0): their oracle was a scalar port or fishball-ui's strip; each names its successor.
  withdrawn('UC-STATUS-01', 'A5', 'settings/document-updated re-reads target(): the line follows the new target', WITHDRAWN_ROW.target)
  withdrawn('UC-STATUS-01', 'main 4', 'equal snapshots do not re-emit (same link, same target, same report, same count)', WITHDRAWN_ROW.target + '; successor MULTI-STATUS-ST-01')
  withdrawn('F-STATUS-DT-01', 'rule 4 sends nothing', 'needs-configuration: no Connect call and no network attempt while the status is read', WITHDRAWN_ROW.target + '; successor UC-STATUS-01 postcondition')
  for (const name of ['none', 'one', 'many', 'change', 'singular', 'no bridge']) withdrawn('F-STATUS-BVA-01', name, 'contributed tools line', WITHDRAWN_ROW.bridge)
  for (const name of ['order', 'set mechanism skipped', 'set mechanism failed', 'cancel', 'lang', 'never']) withdrawn('F-STATUS-STRIP', name, 'the strip view', WITHDRAWN_ROW.strip)
  withdrawn('UIPF-CARD-DT-01', 'all', 'the status card', WITHDRAWN_ROW.strip)
  withdrawn('UIPF-CARD-BVA-01', 'all', 'the tools chip', WITHDRAWN_ROW.strip)
  withdrawn('UIPF-CARD-EP-01', 'control labels', 'the control labels', WITHDRAWN_ROW.strip)

  // ---------------------------------------------------------------- PLAT-DT-02 (no member since SHELVE-BOARD) and the app-ready boundary
  t('F-STATUS-ST-04', 'before ready', 'set is null before app ready, also across plugin-manager/changed; computed at app ready', async (c) => {
    const w = await worldFor(c, sdk, { bundles: [boardBundle()], entries: [boardEntry()] })
    w.changed()
    await settle()
    assert.equal(w.snapshot().set, null, 'set before app ready')
    assert.deepEqual(await readySet(w), SET_OK)
  })

  t('F-STATUS-ST-04', 'already ready', 'app already ready at createStatus: the set is computed', async (c) => {
    const w = await worldFor(c, sdk, { ready: true, bundles: [boardBundle()], entries: [boardEntry()] })
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
      const w = await worldFor(c, sdk, { bundles, entries })
      await readySet(w)
      await assertBoardNeverReported(sdk, w.snapshot(), rule)
    })
  }

  // SHELVE-BOARD (the user, 2026-11-18): was "ACTIVE (2) is loaded and FAILED (3) is failed"; the board
  // is no member, so both sides of the boundary give ok.
  t('F-STATUS-BVA-02', 'fiber', 'board row fiber ACTIVE (2) and FAILED (3): ok either way, the board never reported', async (c) => {
    for (const state of [HOST.fiberActive, HOST.fiberFailed]) {
      const w = await worldFor(c, sdk, { bundles: [boardBundle()], entries: [boardEntry({ state })] })
      await readySet(w)
      await assertBoardNeverReported(sdk, w.snapshot(), 'fiber state ' + state)
    }
  })

  t('HOST-DT-03', 'rule 10', 'standalone: fishball-hosted-settings is never reported missing, even enabled and skipped or failed', async (c) => {
    const w = await worldFor(c, sdk, {
      bundles: [boardBundle(), bundle(NEVER_REPORTED.hostedSettings, { error: HOST.incompatible }), bundle(NEVER_REPORTED.hostedSettings, { rows: [[NEVER_REPORTED.hostedSettings, FIXTURE.otherEntry]] })],
      entries: [boardEntry(), entry(FIXTURE.otherEntry, { state: HOST.fiberFailed })],
    })
    assert.deepEqual(await readySet(w), SET_OK)
  })

  for (const [name, which] of [['fishball-ui (Q-G1)', NEVER_REPORTED.ui], ['Watchdog (R-FB-07 withdrawn)', NEVER_REPORTED.watchdog], ['an ordinary other bundle', NEVER_REPORTED.other]]) {
    // SHELVE-BOARD (the user, 2026-11-18): was "…; the board alone is" (reported skipped); the board is
    // no member now, so with both skipped the set is ok and the strip names neither.
    t('F-STATUS-EP-02', name, `${which} enabled but skipped, or with a failed row, is never reported; nor is the skipped board`, async (c) => {
      const w = await worldFor(c, sdk, {
        bundles: [bundle(BOARD.name, { error: HOST.incompatible }), bundle(which, { error: HOST.incompatible, rows: [[which, FIXTURE.otherEntry]] })],
        entries: [entry(FIXTURE.otherEntry, { state: HOST.fiberFailed })],
      })
      await readySet(w)
      await assertBoardNeverReported(sdk, w.snapshot(), which)
      assert.ok(!show(w.snapshot().set).includes(which), `the set names ${which}: ${show(w.snapshot().set)}`)
    })
  }

  // SHELVE-BOARD (the user, 2026-11-18): was "ok → skipped → failed → ok, each emitted"; the board is no
  // member, so the set stays ok through every board state, and (UC-STATUS-01 main 4: equal snapshots
  // do not re-emit) no emission follows a change that leaves the snapshot equal.
  t('F-STATUS-ST-02', 'changed', 'the set stays ok across plugin-manager/changed while the board goes loaded → skipped → failed → loaded; nothing re-emitted', async (c) => {
    const w = await worldFor(c, sdk, { bundles: [boardBundle()], entries: [boardEntry()] })
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
      await assertBoardNeverReported(sdk, w.snapshot(), 'board ' + state)
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
        const w = await worldFor(c, sdk, { bundles: [boardBundle()], entries: [row.entry], ready: true })
        w.changed()
        await settle()
        row.end(end)
        await w.until((x) => x.set !== null)
        await settle()
        await assertBoardNeverReported(sdk, w.snapshot(), 'set after the row settled')
        assertNeverIncomplete(w)
      })
    }
  }
  // SHELVE-BOARD (the user, 2026-11-18): was "→ failed"; the board is no member, so its import failing is not reported.
  t('PLAT-DT-02', 'rule 4 import failed', 'a board row whose import is running ends with no fiber (import error) → ok, never reported', async (c) => {
    const row = initializingEntry(BOARD.entry)
    const w = await worldFor(c, sdk, { bundles: [boardBundle()], entries: [row.entry], ready: true })
    w.changed()
    await settle()
    row.end(NO_FIBER)
    await w.until((x) => x.set !== null)
    await settle()
    await assertBoardNeverReported(sdk, w.snapshot(), 'set after the import failed')
    assertNeverIncomplete(w)
  })

  t('UC-STATUS-02', 'A3', 'no pluginManager service: set stays null after app ready and plugin-manager/changed', async (c) => {
    const w = await worldFor(c, sdk, { bundles: ABSENT, entries: [boardEntry()] })
    w.ready()
    w.changed()
    await settle()
    assert.equal(w.snapshot().set, null)
  })

  // ---------------------------------------------------------------- R-FB-09: the guards line and the one notice per start
  t('F-STATUS-ST-03', 'once', 'the first overridden report sends one notice; later reports change only the strip', async (c) => {
    const mod = await statusModule(sdk)
    const w = await worldFor(c, sdk, { guards: undefined })
    w.guards.set(GUARD.overridden(GUARD.first))
    await settle()
    assert.equal(w.notice.calls.length, 1, `notices: ${show(w.notice.calls)}`)
    const [notice] = w.notice.calls
    assert.equal(notice.pluginId, MODEL.notice.pluginId)
    assert.ok(notice.dedupeKey.startsWith(MODEL.notice.guardsKeyPrefix) && notice.dedupeKey.length > MODEL.notice.guardsKeyPrefix.length, `dedupeKey ${notice.dedupeKey}`)
    assert.equal(notice.text, mod[SUBJECT.model].text.guardsNotice(GUARD.first.join(GUARD.separator)))
    for (const report of [GUARD.ok, GUARD.overridden(GUARD.second), GUARD.overridden(GUARD.first)]) {
      w.guards.set(report)
      await settle()
      assert.deepEqual(w.snapshot().guards, report, 'the snapshot follows the report')
    }
    assert.equal(w.notice.calls.length, 1, `a second notice in one start: ${show(w.notice.calls)}`)
  })

  t('F-STATUS-ST-03', 'at start', 'a report already overridden at createStatus sends the one notice', async (c) => {
    const w = await worldFor(c, sdk, { guards: GUARD.overridden(GUARD.second) })
    await w.until(() => w.notice.calls.length > 0)
    await settle()
    assert.equal(w.notice.calls.length, 1)
  })

  // Dev session amendment 2026-11-16: one notice per DSH start = per process. An HMR recompose re-runs
  // createStatus in the same process with the same dedupeKey; the manager answers 'duplicate' for a key
  // it already accepted, so a second notify with that key is still one notice.
  t('UC-STATUS-03', 'A2 recompose', 'a second createStatus in the same process notifies, if at all, with the same dedupe key', async (c) => {
    const w = await worldFor(c, sdk, { guards: GUARD.overridden(GUARD.first) })
    await w.until(() => w.notice.calls.length > 0)
    const again = await w.recompose()
    await settle()
    assert.deepEqual(again.snapshot().guards, GUARD.overridden(GUARD.first), 'the recomposed status reads the report')
    const keys = new Set(w.notice.calls.map((n) => n.dedupeKey))
    assert.equal(keys.size, 1, `more than one key in one process: ${show([...keys])}`)
    assert.ok(w.notice.calls.length <= 2, `more than one notify per createStatus: ${show(w.notice.calls)}`)
  })

  t('UC-STATUS-03', 'A2 new process', 'a new process (a new DSH start) notifies with another dedupe key; within one process both statuses share one key', () => {
    const run = () => {
      const out = spawnSync(process.execPath, [PROBE.file, sdk], { encoding: 'utf8', timeout: WAIT.probeMs, env: process.env })
      assert.equal(out.status, 0, `key probe failed: ${out.stderr}`)
      return [...out.stdout.matchAll(new RegExp(PROBE.keyLine.source, 'gm'))].map((m) => m[1])
    }
    const [first, second] = [run(), run()]
    assert.ok(first.length > 0 && second.length > 0, `no notice in a probe: ${show({ first, second })}`)
    assert.equal(new Set(first).size, 1, `one process used more than one key: ${show(first)}`)
    assert.equal(new Set(second).size, 1, `one process used more than one key: ${show(second)}`)
    assert.notEqual(first[0], second[0], 'two processes share a dedupe key')
  })

  t('UC-STATUS-03', 'ok', 'an ok report sends no notice; the snapshot carries the ok report', async (c) => {
    const w = await worldFor(c, sdk, { guards: GUARD.ok })
    await settle()
    assert.deepEqual(w.notice.calls, [])
    assert.deepEqual(w.snapshot().guards, GUARD.ok)
  })

  // Dev session amendment 2026-11-16: a rejected notify is logged and retried at the next refresh that
  // still sees guards-overridden, with the same key; never retried after an accepted notify.
  t('UC-STATUS-03', 'E1 retry', 'a rejected notice is logged and retried with the same key at the next overridden refresh; status keeps working', async (c) => {
    const w = await worldFor(c, sdk, { guards: undefined, notify: { outcomes: [NOTIFY.reject] } })
    w.guards.set(GUARD.overridden(GUARD.first))
    await settle()
    assert.equal(w.notice.calls.length, 1, 'first notify')
    assert.ok(w.logs.some((l) => l.type === HOST.warn), `nothing logged: ${show(w.logs)}`)
    w.guards.set(GUARD.overridden(GUARD.second))
    await settle()
    assert.equal(w.notice.calls.length, 2, `not retried at the next overridden refresh: ${show(w.notice.calls)}`)
    assert.equal(w.notice.calls[1].dedupeKey, w.notice.calls[0].dedupeKey, 'the retry uses another key')
    w.guards.set(GUARD.overridden(GUARD.first))
    await settle()
    assert.equal(w.notice.calls.length, 2, `notified again after an accepted notice: ${show(w.notice.calls)}`)
    const before = w.emitted.length
    w.targets.set(TARGETS_SNAPSHOT.one)
    await settle()
    assert.equal(w.emitted.length, before + 1, 'status stopped after the rejection')
  })

  t('UC-STATUS-03', 'E1 ok refresh', 'after a rejection, an ok refresh does not retry; the next overridden one does', async (c) => {
    const w = await worldFor(c, sdk, { guards: undefined, notify: { outcomes: [NOTIFY.reject] } })
    w.guards.set(GUARD.overridden(GUARD.first))
    await settle()
    w.guards.set(GUARD.ok)
    await settle()
    assert.equal(w.notice.calls.length, 1, `retried on an ok report: ${show(w.notice.calls)}`)
    w.guards.set(GUARD.overridden(GUARD.first))
    await settle()
    assert.equal(w.notice.calls.length, 2, 'not retried at the next overridden refresh')
  })

  t('UC-STATUS-03', 'E1 always rejected', 'a notice that keeps being rejected is retried once per overridden refresh, never in a loop', async (c) => {
    const w = await worldFor(c, sdk, { guards: undefined, notify: { then: NOTIFY.reject } })
    w.guards.set(GUARD.overridden(GUARD.first))
    await settle()
    await settle()
    assert.equal(w.notice.calls.length, 1, `retried without a refresh: ${show(w.notice.calls.length)}`)
    w.guards.set(GUARD.overridden(GUARD.second))
    await settle()
    assert.equal(w.notice.calls.length, 2)
    assert.equal(new Set(w.notice.calls.map((n) => n.dedupeKey)).size, 1, 'retries changed the key')
  })

  t('UC-STATUS-03', 'accepted', 'an accepted notice is never retried, whatever reports follow', async (c) => {
    const w = await worldFor(c, sdk, { guards: undefined })
    for (const report of [GUARD.overridden(GUARD.first), GUARD.ok, GUARD.overridden(GUARD.second), GUARD.overridden(GUARD.first)]) {
      w.guards.set(report)
      await settle()
    }
    w.targets.set(TARGETS_SNAPSHOT.one)
    await settle()
    assert.equal(w.notice.calls.length, 1, show(w.notice.calls))
  })

  t('UC-STATUS-03', 'no notify port', 'without notify an overridden report still shows in the snapshot', async (c) => {
    const w = await worldFor(c, sdk, { guards: undefined, notify: ABSENT })
    assert.doesNotThrow(() => w.guards.set(GUARD.overridden(GUARD.first)))
    await settle()
    assert.deepEqual(w.snapshot().guards, GUARD.overridden(GUARD.first))
  })

  // ---------------------------------------------------------------- UC-STATUS-06: close
  t('UC-STATUS-06', 'close', 'after close: no emission, no notice, no set recompute, and every port listener disposed', async (c) => {
    const w = await worldFor(c, sdk, { guards: undefined, bundles: [boardBundle()], entries: [boardEntry()] })
    await settle()
    w.close()
    const before = w.emitted.length
    const lists = w.pluginManager.lists
    w.targets.set(TARGETS_SNAPSHOT.two)
    w.guards.set(GUARD.overridden(GUARD.first))
    w.ready()
    w.changed()
    await settle()
    assert.equal(w.emitted.length, before, `emitted after close: ${show(w.emitted.slice(before))}`)
    assert.deepEqual(w.notice.calls, [], 'a notice after close')
    assert.equal(w.pluginManager.lists, lists, 'the set was read after close')
    assert.deepEqual([w.targets, w.guards].map((p) => p.listeners), [0, 0], 'port subscriptions left after close')
  })

  // Dev session amendment 2026-11-16: createStatus ties close() to ctx.effect when ctx has one.
  t('UC-STATUS-06', 'ctx disposed', 'created in a Cordis plugin: disposing its fiber stops emissions, notices and port subscriptions', async (c) => {
    const w = await worldFor(c, sdk, { plugin: true, guards: undefined })
    await settle()
    await w.fiber.dispose()
    const before = w.emitted.length
    w.targets.set(TARGETS_SNAPSHOT.two)
    w.guards.set(GUARD.overridden(GUARD.first))
    await settle()
    assert.equal(w.emitted.length, before, `emitted after the context was disposed: ${show(w.emitted.slice(before))}`)
    assert.deepEqual(w.notice.calls, [], 'a notice after the context was disposed')
    assert.deepEqual([w.targets, w.guards].map((p) => p.listeners), [0, 0], 'port subscriptions left')
  })

  // ---------------------------------------------------------------- R-FB-10: fishball-off
  for (const [name, service] of [['undefined', undefined], ['null', null], ['an object without snapshot', {}], ['a string', MODEL.serviceName]]) {
    t('UC-STATUS-05', 'off ' + name, `statusOf(${name}) is the frozen fishball-off status; the strip shows one fishball-off line`, async () => {
      const s = await statusOf(sdk, service)
      assert.deepEqual(s, { fishball: MODEL.fishball.off })
      assert.ok(Object.isFrozen(s), 'not frozen')
      // StatusSnapshot: without core, exactly {fishball: 'fishball-off'} with no `targets`.
      assert.equal(Object.hasOwn(s, 'targets'), false)
    })
  }

  t('UC-STATUS-05', 'on', 'statusOf(a live status) is its snapshot', async (c) => {
    const w = await worldFor(c, sdk, { targets: TARGETS_SNAPSHOT.one })
    assert.deepEqual(await statusOf(sdk, w.status), w.snapshot())
  })

  // ---------------------------------------------------------------- todo: other owners
  t('UC-STATUS-01', 'A1 press', 'pressing Connect calls connect.begin(); pressing cancel calls connect.cancel()', () => {}, LATER.press)
  t('PLAT-DT-02', 'integration', 'rules 1–5 in a real standalone DSH, read through the fishballStatus service', () => {}, LATER.wire)
  t('UC-STATUS-01', 'hosted', 'core in a hosted child: target status and set as the child sees them', () => {}, LATER.hosted)
}

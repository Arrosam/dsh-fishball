/**
 * GENTLE-TOOLS black-box rows (USE-CASES.md "UC-STATUS-07"): core's status gives Fishball's manager one
 * gentle, informational notice when the guard report's extraManagerTools names a tool not announced
 * before, remembers what it announced in <profileContext.home>/fishball/manager-tools.json, and keeps
 * its guards notice for the other guards (the lead's relayed requirement, 2026-11-21, and its
 * refinement: 'manager-tools' leaves the guards notice only when the report names extra tools).
 *
 * Techniques: EP (record contents, profile context present / without home / absent), BVA (extras
 * 0 / 1 / 3; missing defaults 0 / 1 / all 4; a subset, the same set, one more), a decision table
 * (overridden codes x extras x missing defaults -> guards notice / tools notice) and state transitions
 * (the announced set across refreshes, restarts, rejection, an in-flight notice and a new name that
 * arrives while one is in flight).
 *
 * Review fixes (the user, 2026-11-21): K3 GuardReport gained `missingManagerTools` (the defaults some
 * live manager lacks); 'manager-tools' leaves the guards notice only when extraManagerTools is non-empty
 * AND missingManagerTools is empty or absent; a new extra name that arrives while a tools notice is in
 * flight is announced once that notice settles (accepted, rejected or nothing new), without another
 * report, never two in flight, nothing after close().
 *
 * Level: unit, on the F-STATUS world (world.mjs: a real Cordis Context of the SDK, the fake ports), with
 * a throwaway home under the OS temp dir as profileContext.home. Only the exported STATUS_MODEL and the
 * record file are read; the implementation is not.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { until } from '../../../support/util.mjs'
import { GUARD, MODEL, TOOLS, TOOLS_KEY_PREFIX, WAIT } from './constants.mjs'
import { NOTIFY } from './fakes.mjs'
import { statusModule } from './subject.mjs'
import { settle, worldFor } from './world.mjs'

const show = (value) => JSON.stringify(value)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** Lets the status's file reads, notify and write settle when nothing is expected to happen. */
const quiet = async () => { await settle(); await sleep(TOOLS.quietMs); await settle() }

/**
 * Fresh fixture tool names for one case: the three base names with a suffix unique to this call, so
 * no case can pass on what another case announced in this process. Sorted as a < b < c.
 */
let serial = 0
function namesOf() {
  serial += 1
  const tag = '_' + process.pid + '_' + serial
  return Object.freeze({ a: TOOLS.names.a + tag, b: TOOLS.names.b + tag, c: TOOLS.names.c + tag })
}

/** A throwaway profile home; removed after the case. */
function homeOf(c) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), TOOLS.homePrefix))
  c.after(() => fs.rmSync(home, { recursive: true, force: true }))
  return home
}
const profileOf = (home) => Object.freeze({ home, name: TOOLS.profileName })
const recordFile = (home) => path.join(home, TOOLS.record.dir, TOOLS.record.file)
/** The record's exact bytes for an announced list. */
const recordText = (list) => JSON.stringify({ [TOOLS.record.key]: [...list].sort() }) + TOOLS.record.eol
const readRecord = (home) => { try { return fs.readFileSync(recordFile(home), 'utf8') } catch { return null } }
function seedRecord(home, text) {
  fs.mkdirSync(path.dirname(recordFile(home)), { recursive: true })
  fs.writeFileSync(recordFile(home), text)
}
async function untilRecord(home, list) {
  await until(() => readRecord(home) === recordText(list), WAIT.untilMs, WAIT.pollMs)
  assert.equal(readRecord(home), recordText(list), 'the record file')
}

/** A report naming 'manager-tools' (after 'others') with these extra tools (and these missing defaults). */
const toolsReport = (extras, others = [], missing = []) => GUARD.overridden([...others, TOOLS.code], extras, missing)
/** Marks a decision-table row whose report has no `missingManagerTools` member at all (the "absent" partition). */
const NO_FIELD = Symbol('no missingManagerTools member')
/** The report for one decision-table row. */
function rowReport(overridden, extras, missing) {
  if (overridden.length === 0) return GUARD.ok
  if (missing !== NO_FIELD) return GUARD.overridden(overridden, extras, missing)
  const { missingManagerTools: _absent, ...rest } = GUARD.overridden(overridden, extras)
  return Object.freeze(rest)
}

/** The surface this file reads: STATUS_MODEL's prefixes and texts. */
async function modelOf(sdk) {
  const model = (await statusModule(sdk)).STATUS_MODEL
  const prefix = model?.notice?.[TOOLS_KEY_PREFIX]
  assert.equal(typeof prefix, 'string', 'STATUS_MODEL.notice.toolsKeyPrefix')
  assert.equal(typeof model?.text?.toolsNotice, 'function', 'STATUS_MODEL.text.toolsNotice')
  const isTools = (n) => typeof n?.dedupeKey === 'string' && n.dedupeKey.startsWith(prefix)
  const isGuards = (n) => typeof n?.dedupeKey === 'string' && n.dedupeKey.startsWith(MODEL.notice.guardsKeyPrefix)
  return {
    model, prefix, isTools, isGuards,
    toolsText: (list) => model.text.toolsNotice([...list].join(TOOLS.separator)),
    guardsText: (list) => model.text.guardsNotice([...list].join(GUARD.separator)),
  }
}

/** One status world with the tools vocabulary bound. */
async function toolsWorld(c, sdk, o = {}) {
  const m = await modelOf(sdk)
  const w = await worldFor(c, sdk, { guards: undefined, ...o })
  const tools = () => w.notice.calls.filter(m.isTools)
  const guards = () => w.notice.calls.filter(m.isGuards)
  return {
    w, m, tools, guards,
    /** Sets the report and waits until the tools notices number 'count' (then lets the rest settle). */
    async report(report, count) {
      w.guards.set(report)
      if (count !== undefined) await until(() => tools().length >= count, WAIT.untilMs, WAIT.pollMs)
      await quiet()
    },
    /** One tools notice for 'list': exactly its shape. */
    assertToolsNotice(notice, list, why) {
      assert.equal(notice?.pluginId, MODEL.notice.pluginId, why + ': pluginId')
      assert.ok(notice.dedupeKey.startsWith(m.prefix) && notice.dedupeKey.length > m.prefix.length, why + ': dedupeKey ' + notice.dedupeKey)
      assert.equal(notice.text, m.toolsText(list), why + ': text')
    },
  }
}

/** Registers the GENTLE-TOOLS rows on the F-STATUS case registrar 't'. */
export function registerToolsNoticeCases(t, sdk) {
  // ------------------------------------------------------------------ the surface
  t('TOOLS-00', 'text', 'toolsNotice names every listed tool, is gentle (not "overridden", not "weaker" / "guarantees") and is not the guards notice', async () => {
    const { model } = await modelOf(sdk)
    const n = namesOf()
    for (const list of [[n.a], [n.a, n.b, n.c]]) {
      const text = model.text.toolsNotice(list.join(TOOLS.separator))
      assert.equal(typeof text, 'string')
      for (const name of list) assert.ok(text.includes(name), 'toolsNotice does not name ' + name + ': ' + text)
      for (const word of TOOLS.harsh) assert.equal(word.test(text), false, 'toolsNotice is not gentle (' + word + '): ' + text)
      assert.notEqual(text, model.text.guardsNotice(list.join(GUARD.separator)), 'toolsNotice is the guards notice')
    }
  })

  // ------------------------------------------------------------------ main flow, BVA on the extras
  for (const [label, pick] of [['one extra', (n) => [n.a]], ['three extras', (n) => [n.a, n.b, n.c]]]) {
    t('TOOLS-UC-01', 'main ' + label, 'a report with unannounced extras gives ONE tools notice listing them all (sorted, ", "), then the record holds them as one JSON line', async (c) => {
      const home = homeOf(c)
      const list = pick(namesOf())
      const s = await toolsWorld(c, sdk, { profile: profileOf(home) })
      await s.report(toolsReport(list), 1)
      assert.equal(s.tools().length, 1, show(s.w.notice.calls))
      s.assertToolsNotice(s.tools()[0], list, 'the notice')
      await untilRecord(home, list)
      await s.report(toolsReport(list))
      assert.equal(s.tools().length, 1, 'a second notice for the same set: ' + show(s.tools()))
    })
  }
  t('TOOLS-BVA-01', 'zero', 'no extras (ok report, or manager-tools with []) gives no tools notice and writes no record', async (c) => {
    const home = homeOf(c)
    const s = await toolsWorld(c, sdk, { profile: profileOf(home) })
    for (const report of [GUARD.ok, toolsReport([])]) await s.report(report)
    assert.deepEqual(s.tools(), [])
    assert.equal(readRecord(home), null, 'a record without any extra tool')
  })

  // ------------------------------------------------------------------ rule 2: persistence (state transitions over one home)
  t('TOOLS-ST-01', 'announced set', 'one status: a -> notice; a -> none; a,b -> notice "a, b"; b -> none; ok -> none; a -> none; a,b,c -> notice "a, b, c"; the record is the union each time', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    const s = await toolsWorld(c, sdk, { profile: profileOf(home) })
    // [extras (null: an ok report), the notice's list (null: none), the record after]
    const steps = [
      [[n.a], [n.a], [n.a]],
      [[n.a], null, [n.a]],
      [[n.a, n.b], [n.a, n.b], [n.a, n.b]],
      [[n.b], null, [n.a, n.b]],
      [null, null, [n.a, n.b]],
      [[n.a], null, [n.a, n.b]],
      [[n.a, n.b, n.c], [n.a, n.b, n.c], [n.a, n.b, n.c]],
    ]
    let count = 0
    for (const [extras, notice, record] of steps) {
      const why = 'after extras ' + show(extras)
      if (notice) count += 1
      await s.report(extras === null ? GUARD.ok : toolsReport(extras), count)
      assert.equal(s.tools().length, count, why + ': notices ' + show(s.tools()))
      if (notice) s.assertToolsNotice(s.tools().at(-1), notice, why)
      await untilRecord(home, record)
    }
    const keys = s.tools().map((x) => x.dedupeKey)
    assert.equal(new Set(keys).size, keys.length, 'two notices of different sets share a dedupe key (the manager would drop the later one): ' + show(keys))
  })

  t('TOOLS-ST-02', 'restart', 'a new status over the same home (a restart): the same set or a subset gives no notice; one more tool gives exactly one notice listing all current extras', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    const first = await toolsWorld(c, sdk, { profile: profileOf(home) })
    await first.report(toolsReport([n.a, n.b]), 1)
    await untilRecord(home, [n.a, n.b])
    first.w.close()
    const again = await toolsWorld(c, sdk, { profile: profileOf(home) })
    for (const extras of [[n.a], [n.a, n.b], [n.b]]) await again.report(toolsReport(extras))
    assert.deepEqual(again.tools(), [], 'a restart re-announced known tools')
    await again.report(toolsReport([n.a, n.b, n.c]), 1)
    assert.equal(again.tools().length, 1, show(again.tools()))
    again.assertToolsNotice(again.tools()[0], [n.a, n.b, n.c], 'the new tool')
    assert.notEqual(again.tools()[0].dedupeKey, first.tools()[0].dedupeKey, 'the new set reuses the earlier dedupe key')
    await untilRecord(home, [n.a, n.b, n.c])
  })

  t('TOOLS-ST-02', 'at start', 'a report already carrying recorded extras when the status is created gives no notice and leaves the record as it is', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    seedRecord(home, recordText([n.a, n.b]))
    const s = await toolsWorld(c, sdk, { profile: profileOf(home), guards: toolsReport([n.a, n.b]) })
    await quiet()
    assert.deepEqual(s.tools(), [])
    assert.equal(readRecord(home), recordText([n.a, n.b]), 'the record changed without a new tool')
  })

  t('TOOLS-EP-01', 'seeded record', 'a record written before (another process) is honoured: its names give no notice; a new one gives one notice listing all current extras; the record becomes the union', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    seedRecord(home, recordText([n.a, n.c]))
    const s = await toolsWorld(c, sdk, { profile: profileOf(home) })
    await s.report(toolsReport([n.a]))
    assert.deepEqual(s.tools(), [], 'a recorded name was announced again')
    await s.report(toolsReport([n.a, n.b]), 1)
    assert.equal(s.tools().length, 1)
    s.assertToolsNotice(s.tools()[0], [n.a, n.b], 'the notice lists every current extra, announced ones included')
    await untilRecord(home, [n.a, n.b, n.c])
  })

  t('TOOLS-EP-01', 'another home', 'what one home recorded does not count for another home: the same names are announced there', async (c) => {
    const n = namesOf()
    const homeA = homeOf(c)
    const homeB = homeOf(c)
    seedRecord(homeA, recordText([n.a]))
    const s = await toolsWorld(c, sdk, { profile: profileOf(homeB) })
    await s.report(toolsReport([n.a]), 1)
    assert.equal(s.tools().length, 1)
    await untilRecord(homeB, [n.a])
    assert.equal(readRecord(homeA), recordText([n.a]), 'the other home was written')
  })

  for (const [label, text] of Object.entries(TOOLS.malformed)) {
    t('TOOLS-EP-02', label, 'a malformed record (' + label + ') counts as nothing announced: one notice, no throw, then the record is rewritten to the current extras', async (c) => {
      const home = homeOf(c)
      const n = namesOf()
      seedRecord(home, text)
      const s = await toolsWorld(c, sdk, { profile: profileOf(home) })
      await s.report(toolsReport([n.a, n.b]), 1)
      assert.equal(s.tools().length, 1, show(s.w.notice.calls))
      s.assertToolsNotice(s.tools()[0], [n.a, n.b], 'the notice')
      await untilRecord(home, [n.a, n.b])
    })
  }
  t('TOOLS-EP-02', 'unreadable', 'an unreadable record (the path is a directory) counts as nothing announced: one notice, no throw, the status keeps working', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    fs.mkdirSync(recordFile(home), { recursive: true })
    const s = await toolsWorld(c, sdk, { profile: profileOf(home) })
    await s.report(toolsReport([n.a]), 1)
    assert.equal(s.tools().length, 1, show(s.w.notice.calls))
    s.assertToolsNotice(s.tools()[0], [n.a], 'the notice')
    const report = toolsReport([n.a], [TOOLS.other])
    await s.report(report)
    assert.deepEqual(s.w.snapshot().guards, report, 'the status stopped following the report')
  })

  // ------------------------------------------------------------------ rule 3: rejection and the in-flight notice
  t('TOOLS-ST-03', 'rejected', 'a rejected tools notice records nothing and is not retried on a report without the name; the next refresh that still sees it sends it again; once accepted it is recorded and not repeated', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    const m = await modelOf(sdk)
    let rejections = 1
    const decide = (notice) => (m.isTools(notice) && rejections-- > 0 ? NOTIFY.reject : NOTIFY.accept)
    const s = await toolsWorld(c, sdk, { profile: profileOf(home), notify: { decide } })
    await s.report(toolsReport([n.a]), 1)
    assert.equal(readRecord(home), null, 'recorded although notify rejected')
    await s.report(GUARD.ok)
    assert.equal(s.tools().length, 1, 'retried on a report without the name: ' + show(s.tools()))
    await s.report(toolsReport([n.a], [TOOLS.other]), 2)
    assert.equal(s.tools().length, 2, 'not retried at the next refresh that sees the name')
    s.assertToolsNotice(s.tools()[1], [n.a], 'the retry')
    await untilRecord(home, [n.a])
    await s.report(toolsReport([n.a]))
    assert.equal(s.tools().length, 2, 'notified again after an accepted notice')
  })

  t('TOOLS-ST-03', 'always rejected', 'a tools notice that keeps being rejected is sent once per refresh that sees the name, never in a loop, and never recorded', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    const m = await modelOf(sdk)
    const s = await toolsWorld(c, sdk, { profile: profileOf(home), notify: { decide: (notice) => (m.isTools(notice) ? NOTIFY.reject : NOTIFY.accept) } })
    await s.report(toolsReport([n.a]), 1)
    await quiet()
    assert.equal(s.tools().length, 1, 'retried without a refresh')
    await s.report(toolsReport([n.a], [TOOLS.other]), 2)
    await quiet()
    assert.equal(s.tools().length, 2)
    assert.equal(readRecord(home), null)
  })

  t('TOOLS-ST-04', 'in flight', 'while a tools notice is pending, refreshes with the same extras send no second one and nothing is recorded; once it resolves the record is written', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    const m = await modelOf(sdk)
    const s = await toolsWorld(c, sdk, { profile: profileOf(home), notify: { decide: (notice) => (m.isTools(notice) ? NOTIFY.hold : NOTIFY.accept) } })
    await s.report(toolsReport([n.a, n.b]), 1)
    for (const report of [toolsReport([n.a, n.b], [TOOLS.other]), toolsReport([n.a, n.b])]) await s.report(report)
    assert.equal(s.tools().length, 1, 'a second notice while one is in flight: ' + show(s.tools()))
    assert.equal(readRecord(home), null, 'recorded before notify resolved')
    s.w.notice.held.find((h) => m.isTools(h.notice)).accept()
    await untilRecord(home, [n.a, n.b])
    await s.report(toolsReport([n.a, n.b], [TOOLS.other]))
    assert.equal(s.tools().length, 1, 'notified again after it resolved')
  })

  // ------------------------------------------------------------------ rule 4: no profile context, or one without a home
  for (const [label, profile] of [['no profileContext', undefined], ['profileContext without home', Object.freeze({ name: TOOLS.profileName })]]) {
    t('TOOLS-EP-03', label, '(' + label + ') memory only: the same set again gives no notice, a new name one notice, a re-added name none; no record is written', async (c) => {
      const n = namesOf()
      const cwdRecord = path.resolve(TOOLS.record.dir, TOOLS.record.file)
      const before = fs.existsSync(cwdRecord)
      const s = await toolsWorld(c, sdk, profile ? { profile } : {})
      await s.report(toolsReport([n.a]), 1)
      await s.report(toolsReport([n.a]))
      assert.equal(s.tools().length, 1, 'the same set announced twice in one status')
      await s.report(toolsReport([n.a, n.b]), 2)
      assert.equal(s.tools().length, 2)
      s.assertToolsNotice(s.tools()[1], [n.a, n.b], 'the new name')
      await s.report(toolsReport([n.b]))
      await s.report(toolsReport([n.a, n.b]))
      assert.equal(s.tools().length, 2, 're-adding an announced name notified')
      assert.equal(fs.existsSync(cwdRecord), before, 'a record was written relative to the working directory')
    })
  }

  // ------------------------------------------------------------------ rule 5: the guards notice beside the tools notice (decision table)
  // Review fix (the user, 2026-11-21): 'manager-tools' leaves the guards notice only when extras are
  // non-empty AND missingManagerTools is empty or absent; a missing default keeps it there, and the
  // extras still get their one gentle tools notice. Missing: BVA none / one / all four defaults, and
  // the absent member (NO_FIELD). Rows 1-6 are the GENTLE-TOOLS rows with missing [].
  const other = GUARD.first
  const defaults = [...TOOLS.defaults].sort()
  const oneMissing = [defaults[0]]
  // [rule, overridden, extras?, missingManagerTools (NO_FIELD: no member), the guards notice's list (null: none), a tools notice?]
  const table = [
    ['1 ok', [], false, [], null, false],
    ['2 extras only (manager-tools alone)', [TOOLS.code], true, [], null, true],
    ['3 neither (manager-tools alone)', [TOOLS.code], false, [], [TOOLS.code], false],
    ['4 manager-tools absent, other codes', [...other], false, [], [...other], false],
    ['5 extras only, other codes', [...other, TOOLS.code], true, [], [...other], true],
    ['6 neither, other codes', [...other, TOOLS.code], false, [], [...other, TOOLS.code], false],
    ['7 missing only (one)', [TOOLS.code], false, oneMissing, [TOOLS.code], false],
    ['8 missing only (all four), other codes', [...other, TOOLS.code], false, defaults, [...other, TOOLS.code], false],
    ['9 both (one missing)', [TOOLS.code], true, oneMissing, [TOOLS.code], true],
    ['10 both (all four missing), other codes', [...other, TOOLS.code], true, defaults, [...other, TOOLS.code], true],
    ['11 extras, missing member absent', [TOOLS.code], true, NO_FIELD, null, true],
    ['12 extras, missing member absent, other codes', [...other, TOOLS.code], true, NO_FIELD, [...other], true],
    ['13 manager-tools absent, other codes, missing member absent', [...other], false, NO_FIELD, [...other], false],
  ]
  for (const [rule, overridden, withExtras, missing, guardsList, toolsNotice] of table) {
    const missingLabel = missing === NO_FIELD ? 'absent' : show(missing)
    t('TOOLS-DT-01', rule, 'overridden ' + show(overridden) + ', extras ' + (withExtras ? 'some' : 'none') + ', missing ' + missingLabel + ': guards notice ' + (guardsList ? show(guardsList) : 'none') + ', tools notice ' + (toolsNotice ? 'one' : 'none') + '; each at most once; the snapshot carries the report exactly', async (c) => {
      const home = homeOf(c)
      const n = namesOf()
      const extras = withExtras ? [n.a, n.b] : []
      const report = rowReport(overridden, extras, missing)
      const s = await toolsWorld(c, sdk, { profile: profileOf(home) })
      s.w.guards.set(report)
      await until(() => (!guardsList || s.guards().length > 0) && (!toolsNotice || s.tools().length > 0), WAIT.untilMs, WAIT.pollMs)
      await quiet()
      assert.deepEqual(s.w.snapshot().guards, report, 'the snapshot guards')
      if (guardsList) {
        assert.equal(s.guards().length, 1, 'guards notices: ' + show(s.guards()))
        assert.equal(s.guards()[0].text, s.m.guardsText(guardsList), 'the guards notice list')
      } else {
        assert.deepEqual(s.guards(), [], 'a guards notice')
      }
      if (toolsNotice) {
        assert.equal(s.tools().length, 1, 'tools notices: ' + show(s.tools()))
        s.assertToolsNotice(s.tools()[0], extras, 'the tools notice')
      } else {
        assert.deepEqual(s.tools(), [], 'a tools notice')
      }
      assert.equal(s.w.notice.calls.length, s.guards().length + s.tools().length, 'a notice of neither kind: ' + show(s.w.notice.calls))
      // Later refreshes: an ok report, then the same report again (the guards notice is once per start,
      // the extras are announced by then), so the counts stay.
      await s.report(GUARD.ok)
      await s.report(report)
      assert.deepEqual([s.guards().length, s.tools().length], [guardsList ? 1 : 0, toolsNotice ? 1 : 0], 'a notice repeated: ' + show(s.w.notice.calls))
    })
  }

  // ------------------------------------------------------------------ rule 3 (review fix): a new name while a tools notice is in flight
  /**
   * A status whose every tools notice is held until the case settles it, so "in flight" is exact.
   * settleNext(outcome) settles the oldest unsettled tools notice; inFlight() counts the unsettled ones.
   */
  async function heldWorld(c, home) {
    const m = await modelOf(sdk)
    const s = await toolsWorld(c, sdk, { profile: profileOf(home), notify: { decide: (notice) => (m.isTools(notice) ? NOTIFY.hold : NOTIFY.accept) } })
    let settled = 0
    const heldTools = () => s.w.notice.held.filter((h) => m.isTools(h.notice))
    return {
      ...s,
      inFlight: () => heldTools().length - settled,
      async settleNext(outcome) {
        const h = heldTools()[settled]
        assert.ok(h, 'no tools notice in flight to settle')
        settled += 1
        if (outcome === NOTIFY.reject) h.reject(); else h.accept()
        await settle()
      },
    }
  }
  /** Waits until the tools notices number 'count', then lets the rest settle; asserts exactly 'count'. */
  async function untilTools(s, count, why) {
    await until(() => s.tools().length >= count, WAIT.untilMs, WAIT.pollMs)
    await quiet()
    assert.equal(s.tools().length, count, why + ': ' + show(s.tools()))
  }

  for (const outcome of [NOTIFY.accept, NOTIFY.reject]) {
    t('TOOLS-ST-05', 'new name in flight, first ' + outcome + 'ed', 'a report with a new name while the "a" notice is in flight gives no second one then; once the first is ' + outcome + 'ed, exactly one more notice listing all current extras (a, b), with no further report; never two in flight', async (c) => {
      const home = homeOf(c)
      const n = namesOf()
      const s = await heldWorld(c, home)
      await s.report(toolsReport([n.a]), 1)
      s.assertToolsNotice(s.tools()[0], [n.a], 'the first notice')
      await s.report(toolsReport([n.a, n.b]))
      assert.equal(s.tools().length, 1, 'a second notice while the first is in flight')
      assert.equal(s.inFlight(), 1)
      await s.settleNext(outcome)
      await untilTools(s, 2, 'after the first settled, without a further report')
      s.assertToolsNotice(s.tools()[1], [n.a, n.b], 'the follow-up lists all current extras')
      // An accepted first notice holds its key at the manager, so the follow-up needs another one.
      if (outcome === NOTIFY.accept) assert.notEqual(s.tools()[1].dedupeKey, s.tools()[0].dedupeKey, 'the follow-up reuses the accepted dedupe key (the manager would drop it)')
      assert.equal(s.inFlight(), 1, 'two tools notices in flight')
      await s.settleNext(NOTIFY.accept)
      await untilRecord(home, [n.a, n.b])
      await quiet()
      assert.equal(s.tools().length, 2, 'a third notice with nothing new: ' + show(s.tools()))
    })
  }

  t('TOOLS-ST-05', 'new name in flight, two refreshes', 'two reports while the first notice is in flight (a, b then a, b, c) give, after it settles, exactly one more notice listing the latest extras', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    const s = await heldWorld(c, home)
    await s.report(toolsReport([n.a]), 1)
    await s.report(toolsReport([n.a, n.b]))
    await s.report(toolsReport([n.a, n.b, n.c], [TOOLS.other]))
    assert.equal(s.tools().length, 1, 'a second notice while the first is in flight')
    await s.settleNext(NOTIFY.accept)
    await untilTools(s, 2, 'after the first settled')
    s.assertToolsNotice(s.tools()[1], [n.a, n.b, n.c], 'the follow-up lists all current extras')
    await s.settleNext(NOTIFY.accept)
    await untilRecord(home, [n.a, n.b, n.c])
    await quiet()
    assert.equal(s.tools().length, 2, 'a third notice: ' + show(s.tools()))
  })

  t('TOOLS-ST-05', 'first finds nothing new', 'a recorded "a" report followed at once (same tick) by "a, b": the first refresh finds nothing new, and exactly one notice lists a, b; the record becomes a, b', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    seedRecord(home, recordText([n.a]))
    const s = await toolsWorld(c, sdk, { profile: profileOf(home) })
    s.w.guards.set(toolsReport([n.a]))
    s.w.guards.set(toolsReport([n.a, n.b]))
    await untilTools(s, 1, 'one notice for the new name')
    s.assertToolsNotice(s.tools()[0], [n.a, n.b], 'the notice lists all current extras')
    await untilRecord(home, [n.a, n.b])
  })

  t('TOOLS-ST-05', 'first finds nothing new, at start', 'a status created over a recorded "a" report, then at once "a, b": exactly one notice listing a, b', async (c) => {
    const home = homeOf(c)
    const n = namesOf()
    seedRecord(home, recordText([n.a]))
    const s = await toolsWorld(c, sdk, { profile: profileOf(home), guards: toolsReport([n.a]) })
    s.w.guards.set(toolsReport([n.a, n.b]))
    await untilTools(s, 1, 'one notice for the new name')
    s.assertToolsNotice(s.tools()[0], [n.a, n.b], 'the notice lists all current extras')
    await untilRecord(home, [n.a, n.b])
  })

  for (const outcome of [NOTIFY.accept, NOTIFY.reject]) {
    t('TOOLS-ST-05', 'closed in flight, first ' + outcome + 'ed', 'close() while the first notice is in flight with a new name pending: once the first is ' + outcome + 'ed, no further notice', async (c) => {
      const home = homeOf(c)
      const n = namesOf()
      const s = await heldWorld(c, home)
      await s.report(toolsReport([n.a]), 1)
      await s.report(toolsReport([n.a, n.b]))
      s.w.close()
      await s.settleNext(outcome)
      await quiet()
      assert.equal(s.tools().length, 1, 'a notice after close(): ' + show(s.tools()))
      assert.deepEqual(s.w.notice.calls.filter((x) => !s.m.isTools(x)), [], 'another notice after close()')
    })
  }

  // ------------------------------------------------------------------ rule 6: the snapshot
  t('TOOLS-EP-04', 'snapshot', "the snapshot's guards equals the report as given, extraManagerTools and missingManagerTools included, across extras / ok / no-extras / missing reports", async (c) => {
    const n = namesOf()
    const s = await toolsWorld(c, sdk, { profile: profileOf(homeOf(c)) })
    const missing = [...TOOLS.defaults].sort().slice(0, 2)
    for (const report of [toolsReport([n.a, n.b]), GUARD.ok, toolsReport([]), toolsReport([n.c], [TOOLS.other]), toolsReport([], [], missing), toolsReport([n.a], [TOOLS.other], missing)]) {
      await s.report(report)
      assert.deepEqual(s.w.snapshot().guards, report)
    }
  })
}

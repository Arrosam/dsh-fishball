/**
 * fishball-shared's `./ui-seam`: the data-only contract fishball-core and fishball-ui (and the
 * amenities, for the page stream) read instead of importing each other (requirements 1.38 Q-N2,
 * 1.41 Q-G1/Q-G2; R-FB-14; design §1.0, §34). Black box: the module is imported by its published
 * name (`fishball-shared/ui-seam`) and its manifest export is read; every expected value is in
 * constants.mjs with its source. The index of ids and techniques is ../README.md.
 *
 * - UI-UC-07 (moved from test/v3/fishball-ui/package): the export, UI_SEAM, UI_GUARDS, SEAM_STATUS,
 *   data only. Its "E1 drift" rows compare the seam with fishball-core's constants and are an
 *   integration row (port-ui-b), not here;
 * - SEAM-EP-01: every export is deeply frozen data (no function, no mutable object);
 * - SEAM-EP-02: the remaining word sets (UI_STATUS, UI_INSTANCE, SEAM_PAIRING, SEAM_BRAND);
 * - SEAM-EP-03: SEAM_TARGETS' values and its route classes (GET list, POST actions);
 * - SEAM-EP-04 / SEAM-BVA-01: SEAM_PAGE_STREAM (one connection per page, its route, fields, member, topics).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { caseTest } from 'fishball-test-helpers/cases'
import * as seam from 'fishball-shared/ui-seam'
import { DATA_ONLY, EXPORTS, SEAM_BRAND, SEAM_PAGE_STREAM, SEAM_PAIRING, SEAM_STATUS, SEAM_TARGETS, SUBJECT, UI_GUARDS, UI_INSTANCE, UI_SEAM, UI_STATUS } from './constants.mjs'

const sorted = (values) => [...values].sort()
/** Paths (`a.b`) of every object reachable from `value` that is not frozen, and of every function. */
const unfrozen = (value, at) => {
  if (typeof value === DATA_ONLY.functionType) return [at + ' (a function)']
  if (value === null || typeof value !== 'object') return []
  return [...(Object.isFrozen(value) ? [] : [at]), ...Object.entries(value).flatMap(([k, v]) => unfrozen(v, `${at}.${k}`))]
}
const assertDeepFrozen = (value, name) => assert.deepEqual(unfrozen(value, name), [], name + ' is not deeply frozen data')
const assertDistinct = (values, what) => assert.equal(new Set(values).size, values.length, `${what}: ${JSON.stringify(values)}`)
/** One export equals its oracle exactly and is deeply frozen. */
const assertExport = (name, expected) => {
  assert.deepEqual(seam[name], expected, name)
  assertDeepFrozen(seam[name], name)
}

export function registerUiSeamCases() {
  // ================================================================ UI-UC-07: the shared seam
  caseTest('UI-UC-07', 'main', `fishball-shared exports ${SUBJECT.exportKey} → ${SUBJECT.exportFile}`, () => {
    const manifest = JSON.parse(fs.readFileSync(SUBJECT.manifest, 'utf8'))
    assert.equal(manifest.exports?.[SUBJECT.exportKey], SUBJECT.exportFile)
  })
  caseTest('UI-UC-07', 'UI_SEAM', 'UI_SEAM is {member: ui, coreMissing: fishball-core-missing}, deeply frozen', () => {
    assertExport('UI_SEAM', { ...UI_SEAM })
  })
  caseTest('UI-UC-07', 'UI_GUARDS', 'UI_GUARDS is {service: fishballUiGuards}, deeply frozen', () => {
    assertExport('UI_GUARDS', { ...UI_GUARDS })
  })
  caseTest('UI-UC-07', 'SEAM_STATUS', `SEAM_STATUS has exactly ${SEAM_STATUS.keys.join(', ')}, deeply frozen data, with the status model's and K3/K3a's words`, () => {
    assert.deepEqual(sorted(Object.keys(seam.SEAM_STATUS ?? {})), sorted(SEAM_STATUS.keys))
    assertDeepFrozen(seam.SEAM_STATUS, 'SEAM_STATUS')
    for (const [key, words] of Object.entries(SEAM_STATUS.words)) assert.deepEqual(seam.SEAM_STATUS[key], { ...words }, key)
  })
  caseTest('UI-UC-07', 'data only', 'ui-seam imports nothing (a data-only module both sides load)', () => {
    const code = fs.readFileSync(SUBJECT.file, 'utf8').replace(DATA_ONLY.blockComment, '').replace(DATA_ONLY.lineComment, '')
    assert.deepEqual(DATA_ONLY.importForms.filter((form) => form.test(code)).map(String), [])
  })

  // ================================================================ SEAM-EP-01: every export is frozen data
  caseTest('SEAM-EP-01', 'documented', `ui-seam exports ${EXPORTS.join(', ')}`, () => {
    assert.deepEqual(EXPORTS.filter((name) => !(name in seam)), [])
  })
  caseTest('SEAM-EP-01', 'frozen', 'every export of ui-seam is a deeply frozen object of data: no function, nothing mutable', () => {
    for (const [name, value] of Object.entries(seam)) {
      assert.equal(typeof value, 'object', name)
      assert.notEqual(value, null, name)
      assertDeepFrozen(value, name)
    }
  })
  caseTest('SEAM-EP-01', 'immutable', 'a write to a seam value is refused (strict mode) and changes nothing', () => {
    assert.throws(() => { seam.UI_SEAM.member = UI_SEAM.coreMissing }, TypeError)
    assert.throws(() => { seam.SEAM_TARGETS.route.list = SEAM_TARGETS.actionPrefix }, TypeError)
    assert.equal(seam.UI_SEAM.member, UI_SEAM.member)
    assert.equal(seam.SEAM_TARGETS.route.list, SEAM_TARGETS.routeBase)
  })

  // ================================================================ SEAM-EP-02: the other word sets
  caseTest('SEAM-EP-02', 'UI_STATUS', 'UI_STATUS is {service: fishballStatus} (F-STATUS STATUS_MODEL.serviceName)', () => {
    assertExport('UI_STATUS', { ...UI_STATUS })
  })
  caseTest('SEAM-EP-02', 'UI_INSTANCE', 'UI_INSTANCE names the fishballInstance service and carries an integer apiVersion', () => {
    assert.deepEqual(sorted(Object.keys(seam.UI_INSTANCE ?? {})), sorted(UI_INSTANCE.keys))
    assert.equal(seam.UI_INSTANCE.service, UI_INSTANCE.service)
    assert.ok(Number.isInteger(seam.UI_INSTANCE.apiVersion), String(seam.UI_INSTANCE.apiVersion))
    assertDeepFrozen(seam.UI_INSTANCE, 'UI_INSTANCE')
  })
  caseTest('SEAM-EP-02', 'SEAM_PAIRING', 'SEAM_PAIRING holds the pairing states, choices and name refusals; each group distinct', () => {
    assertExport('SEAM_PAIRING', { state: { ...SEAM_PAIRING.state }, choice: { ...SEAM_PAIRING.choice }, nameRefusal: { ...SEAM_PAIRING.nameRefusal } })
    for (const group of Object.keys(SEAM_PAIRING)) assertDistinct(Object.values(seam.SEAM_PAIRING[group]), group)
  })
  caseTest('SEAM-EP-02', 'SEAM_BRAND', 'SEAM_BRAND: setting brandStyle, two styles fishball and deepseek, default one of them (fishball)', () => {
    assertExport('SEAM_BRAND', { setting: SEAM_BRAND.setting, default: SEAM_BRAND.default, style: { ...SEAM_BRAND.style } })
    assert.ok(Object.values(seam.SEAM_BRAND.style).includes(seam.SEAM_BRAND.default), 'the default is one of the offered styles')
  })

  // ================================================================ SEAM-EP-03: SEAM_TARGETS
  caseTest('SEAM-EP-03', 'values', 'SEAM_TARGETS is deeply frozen and exactly as MULTI-0 and the MULTI-1 list amendment freeze it', () => {
    assertExport('SEAM_TARGETS', SEAM_TARGETS.values)
  })
  caseTest('SEAM-EP-03', 'action routes', `every POST action route is one segment under ${SEAM_TARGETS.actionPrefix}, unique, and the method is POST`, () => {
    const { route } = seam.SEAM_TARGETS
    const paths = SEAM_TARGETS.actions.map((k) => route[k])
    assert.deepEqual(paths.filter((p) => typeof p !== 'string' || !p.startsWith(SEAM_TARGETS.actionPrefix) || p === SEAM_TARGETS.actionPrefix || p.slice(SEAM_TARGETS.actionPrefix.length).includes('/')), [])
    assertDistinct(paths, 'action routes')
    assert.deepEqual(sorted(Object.keys(route).filter((k) => !SEAM_TARGETS.routeMeta.includes(k))), sorted(SEAM_TARGETS.actions))
    assert.equal(route.method, SEAM_TARGETS.values.route.method)
  })
  caseTest('SEAM-EP-03', 'list route', `the list route is exactly ${SEAM_TARGETS.routeBase}, read with GET (not the actions' POST), and no action route equals it`, () => {
    const { route } = seam.SEAM_TARGETS
    assert.equal(route.list, SEAM_TARGETS.routeBase)
    assert.equal(route.read, SEAM_TARGETS.values.route.read)
    assert.notEqual(route.read, route.method)
    assert.deepEqual(SEAM_TARGETS.actions.filter((k) => route[k] === route.list), [])
  })
  caseTest('SEAM-EP-03', 'withdrawn', 'no seam route is a withdrawn K3a Connect route (MULTI-0 review S6)', () => {
    const routes = Object.values(seam.SEAM_TARGETS.route).filter((v) => typeof v === 'string')
    assert.deepEqual(SEAM_TARGETS.withdrawn.filter((w) => routes.includes(w)), [])
  })
  caseTest('SEAM-EP-03', 'words', 'state, kind, identity, placeholder and refusal words are distinct within each group; http statuses distinct', () => {
    for (const group of SEAM_TARGETS.wordGroups) assertDistinct(Object.values(seam.SEAM_TARGETS[group]), group)
    assertDistinct(Object.values(seam.SEAM_TARGETS.route.fields), 'route fields')
    assertDistinct(Object.values(seam.SEAM_TARGETS.http), 'http statuses')
  })

  // ================================================================ SEAM-EP-04 / SEAM-BVA-01: SEAM_PAGE_STREAM
  caseTest('SEAM-EP-04', 'values', 'SEAM_PAGE_STREAM is deeply frozen and exactly as DESIGN §34 sets it', () => {
    assertExport('SEAM_PAGE_STREAM', SEAM_PAGE_STREAM.values)
  })
  for (const { row, value, ok } of SEAM_PAGE_STREAM.perPageBounds) {
    caseTest('SEAM-BVA-01', row, `perPage ${ok ? 'is' : 'is not'} ${value}: the page holds exactly one Fishball connection (§34)`, () => {
      assert.equal(seam.SEAM_PAGE_STREAM.perPage === value, ok)
    })
  }
  caseTest('SEAM-EP-04', 'route', 'the page stream has its own route: none of the older per-view routes, outside the targets routes', () => {
    const { route } = seam.SEAM_PAGE_STREAM
    assert.equal(SEAM_PAGE_STREAM.olderRoutes.includes(route), false, route)
    assert.equal(route.startsWith(SEAM_TARGETS.routeBase), false, route)
  })
  caseTest('SEAM-EP-04', 'fields', 'message fields (topic, frame), query parameters (lang, tz) and topics are each distinct', () => {
    const s = seam.SEAM_PAGE_STREAM
    assertDistinct(Object.values(s.field), 'fields')
    assertDistinct([s.langParameter, s.zoneParameter], 'query parameters')
    assertDistinct(Object.values(s.topic), 'topics')
  })
  caseTest('SEAM-EP-04', 'member', 'the instance member (page) differs from the ui seam member and the targets member', () => {
    assertDistinct([seam.SEAM_PAGE_STREAM.member, seam.UI_SEAM.member, seam.SEAM_TARGETS.member], 'fishballInstance members')
  })
}

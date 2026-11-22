/**
 * E-FIX-3 (B5) black-box rows: core's settings page reads DSH's model catalog under Cordis's inject
 * rule, as a real DSH (and a hosted child) applies it. Requirement (relayed by Fishball,
 * 2026-11-17): with DSH's `remote.session` service and a catalog, the "Fishball's model" select
 * lists the catalog's choices (one option per model, or one per reasoning effort) and never says
 * "The models could not be read." / "无法读取模型。"; an empty catalog says "No model is configured
 * in this DSH yet."; no `remote.session`, a rejected read or `{ok:false}` → the page still renders
 * and says the models could not be read; the page never needs `remote.session` to register.
 *
 * Level: fishball-test-helpers' scripted page with core's client alone (page.mjs) and `remoteSession`
 * set: the current DSH's real Cordis applies the real client.js / client.settings.js, the Remote service carries Cordis's
 * own `remote` tracker and `remote.session` is its own plugin fiber's service, as DSH's gateway
 * mounts it, so a page that did not inject it cannot read it (EFIX3-SET-RULE-01 proves the harness
 * enforces that). Expected values are the requirement's (constants.mjs MODEL_SELECT, CATALOG).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { importDsh } from 'fishball-test-helpers/dsh'
import { cordisRemote, createWorld } from 'fishball-test-helpers/scripted-page'
import { textOf } from 'fishball-test-helpers/react-shim'
import { until } from 'fishball-test-helpers/wait'
import { CATALOG, CATALOG_ANSWER, DSH, HARNESS, MARK, MODEL_SELECT, SUBJECT } from './constants.mjs'
import { corePage, settle } from './page.mjs'

const CORDIS = 'cordis'

const show = (v) => JSON.stringify(v)

/** DSH's `remote.session` face: `modelCatalog()` answers as `how` says; every call counted. */
function sessionFace(catalog, how = CATALOG_ANSWER.ok) {
  const face = {
    calls: 0,
    async modelCatalog() {
      face.calls += 1
      if (how === CATALOG_ANSWER.rejects) throw new Error('fbtest catalog transport failure')
      if (how === CATALOG_ANSWER.refused) return { ok: false, error: { message: 'fbtest catalog refused' } }
      return { ok: true, value: structuredClone(catalog) }
    },
    $on: () => () => {},
  }
  return face
}


/**
 * Core's settings page open (view `page`) with the session face given (`null`: no `remote.session`).
 * `chunk` loads another copy of client.settings.js (the base-commit check).
 */
async function catalogPage(t, { lang = DSH.locales[0], session, chunk } = {}) {
  const page = await corePage(t, { lang, core: {}, remoteSession: session, chunkFiles: chunk ? { [SUBJECT.chunkName]: chunk } : {} })
  // The catalog read is asynchronous: wait for it to have been asked and answered.
  if (session) await until(() => session.calls > 0, HARNESS.waitMs, HARNESS.pollMs)
  await settle()
  return page
}
const options = (page) => page.find((n) => n.tag === MODEL_SELECT.option)
const optionsNaming = (page, name) => options(page).filter((n) => textOf(n).includes(name))
const pageText = (page) => page.text(page.tree())
const failedShown = (page, lang) => pageText(page).includes(MODEL_SELECT.failed[lang])
/** Every model and effort name of a catalog, and how many options each must have. */
function expectedChoices(catalog) {
  return catalog.groups.flatMap((g) => g.models.flatMap((m) => (m.reasoning?.efforts?.length
    ? m.reasoning.efforts.map((e) => ({ label: `${m.name} / ${e.name}`, model: m.name, effort: e.name }))
    : [{ label: m.name, model: m.name }])))
}
/** The oracle "the catalog's choices are listed": each choice has exactly one option. */
function listedProblems(page, catalog) {
  const problems = []
  for (const c of expectedChoices(catalog)) {
    const hits = options(page).filter((n) => textOf(n).includes(c.model) && (c.effort === undefined || textOf(n).includes(c.effort)))
    if (hits.length !== 1) problems.push(`${c.label}: ${hits.length} options`)
  }
  // "one per reasoning effort": a model with efforts has exactly as many options as efforts.
  for (const g of catalog.groups) for (const m of g.models) {
    const n = m.reasoning?.efforts?.length
    if (n && optionsNaming(page, m.name).length !== n) problems.push(`${m.name}: ${optionsNaming(page, m.name).length} options for ${n} efforts`)
  }
  return problems
}
/** The page itself rendered (its root and its form), whatever the catalog did. */
function assertPageRendered(page) {
  assert.equal(page.entries().length, 1, 'core registered no settings page')
  assert.ok(page.byAttr(MARK.page).length > 0, 'the page root is not rendered')
  assert.deepEqual(page.world.failedFibers, [], 'failed fibers')
  assert.deepEqual(page.world.errors, [], 'module errors')
}

/**
 * client.settings.js at the base commit, in a scratch folder under the run's temp directory (git show,
 * run in this package's folder so the path is the package's own), removed after the test.
 */
function baseChunk(t) {
  const root = fs.realpathSync(os.tmpdir())
  const dir = fs.mkdtempSync(path.join(root, MODEL_SELECT.tempPrefix))
  t.after(() => {
    if (path.dirname(dir) !== root || !path.basename(dir).startsWith(MODEL_SELECT.tempPrefix)) throw new Error('unexpected temp dir ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const file = path.join(dir, SUBJECT.chunkName)
  fs.writeFileSync(file, execFileSync('git', ['show', `${MODEL_SELECT.baseRef}:${MODEL_SELECT.baseChunk}`], { cwd: SUBJECT.packageDir, encoding: 'utf8' }))
  return file
}

export function registerModelCatalogCases() {
  // ---------------------------------------------------------------- the harness enforces Cordis's rule (precondition)
  caseTest('EFIX3-SET-RULE-01', 'harness', "the SDK's Cordis with the page's Remote: a plugin without remote.session in inject cannot read ctx.remote.session (throws); with it, it reads DSH's face; ctx.get('remote.session') answers the face", async (t) => {
    const { Context, Service } = await importDsh(CORDIS)
    const face = sessionFace(CATALOG.one)
    const root = new Context()
    // The Remote service exactly as the page harness builds it (createWorld remoteSession).
    const world = createWorld({ remoteSession: face })
    root.provide(DSH.remoteName, cordisRemote(world.services.remote, Service.tracker))
    const owner = root.plugin({ name: DSH.remoteSession, apply: (ctx) => { ctx.provide(DSH.remoteSession, face) } })
    await owner
    const seen = {}
    const probe = (key, inject) => root.plugin({ name: 'fbtest-probe-' + key, inject, apply(ctx) {
      try { seen[key] = { value: ctx.remote.session } } catch (error) { seen[key] = { error: String(error?.message ?? error) } }
      seen[key].get = ctx.get(DSH.remoteSession)
    } })
    const fibers = [probe('without', [DSH.remoteName]), probe('with', [DSH.remoteName, DSH.remoteSession])]
    await Promise.all(fibers)
    t.after(async () => { for (const f of [...fibers, owner]) await f.dispose?.() })
    assert.ok(seen.without?.error, 'reading ctx.remote.session without inject did not throw: ' + show(seen.without))
    assert.ok(seen.with && !seen.with.error, 'reading it with inject threw: ' + show(seen.with))
    assert.equal(typeof seen.with.value?.modelCatalog, 'function', 'with inject: not the face')
    assert.equal(typeof seen.without.get?.modelCatalog, 'function', "ctx.get('remote.session') without inject: not the face")
  })

  // ---------------------------------------------------------------- EFIX3-SET-UC-01: the catalog is listed (main flow), en and zh
  for (const lang of DSH.locales) {
    caseTest('EFIX3-SET-UC-01', `main ${lang}`, `remote.session provided (own fiber, Cordis's rule): two groups, plain models and a model with two efforts → one option per model / per effort; no "${MODEL_SELECT.failed[lang]}"`, async (t) => {
      const session = sessionFace(CATALOG.mixed)
      const page = await catalogPage(t, { lang, session })
      assertPageRendered(page)
      assert.ok(session.calls >= 1, 'the page never asked for the catalog')
      assert.ok(page.find((n) => n.tag === MODEL_SELECT.select).length > 0, 'no model select on the page')
      assert.deepEqual(listedProblems(page, CATALOG.mixed), [], 'options: ' + show(options(page).map(textOf)))
      assert.equal(failedShown(page, lang), false, 'the page says the models could not be read')
    })
  }

  // ---------------------------------------------------------------- EFIX3-SET-BVA-01: catalog size 0 / 1
  caseTest('EFIX3-SET-BVA-01', '1 model', 'a catalog of one group with one model (no efforts) → exactly one option for it; no "could not be read"', async (t) => {
    const page = await catalogPage(t, { session: sessionFace(CATALOG.one) })
    assertPageRendered(page)
    assert.deepEqual(listedProblems(page, CATALOG.one), [], 'options: ' + show(options(page).map(textOf)))
    assert.equal(failedShown(page, DSH.locales[0]), false)
  })
  caseTest('EFIX3-SET-BVA-01', '0 groups', `an empty catalog (groups: []) → "${MODEL_SELECT.none.en}"; no "could not be read"`, async (t) => {
    const page = await catalogPage(t, { session: sessionFace(CATALOG.empty) })
    assertPageRendered(page)
    assert.ok(pageText(page).includes(MODEL_SELECT.none.en), 'no "none configured" line: ' + pageText(page))
    assert.equal(failedShown(page, DSH.locales[0]), false)
  })

  // ---------------------------------------------------------------- EFIX3-SET-DT-01: service × answer → line
  const rules = [
    ['rule 1', 'no remote.session service at all', null],
    ['rule 2', 'remote.session answers {ok:false}', CATALOG_ANSWER.refused],
    ['rule 3', 'remote.session rejects', CATALOG_ANSWER.rejects],
  ]
  for (const [rule, title, how] of rules) {
    for (const lang of DSH.locales) {
      caseTest('EFIX3-SET-DT-01', `${rule} ${lang}`, `${title} → the page still registers and renders and says "${MODEL_SELECT.failed[lang]}"`, async (t) => {
        const page = await catalogPage(t, { lang, session: how === null ? null : sessionFace(CATALOG.mixed, how) })
        assertPageRendered(page)
        assert.ok(failedShown(page, lang), 'no "could not be read" line: ' + pageText(page))
        assert.deepEqual(options(page).filter((n) => expectedChoices(CATALOG.mixed).some((c) => textOf(n).includes(c.model))).map(textOf), [], 'catalog options shown although the read failed')
      })
    }
  }
  caseTest('EFIX3-SET-DT-01', 'rule 4', 'remote.session answers a catalog → listed (rule of EFIX3-SET-UC-01), and the rest of the page (the target field) is there as well', async (t) => {
    const page = await catalogPage(t, { session: sessionFace(CATALOG.one) })
    assertPageRendered(page)
    assert.ok(page.byAttr(MARK.field).length > 0, 'no setting field rendered')
    assert.deepEqual(listedProblems(page, CATALOG.one), [])
  })

  // ---------------------------------------------------------------- EFIX3-SET-MUT-01: the base commit fails the same oracle
  caseTest('EFIX3-SET-MUT-01', 'base c4845000', `mutating-test sanity: client.settings.js at ${MODEL_SELECT.baseRef} in the same world (catalog provided) does NOT list the catalog and says "could not be read" (the B5 bug, reproduced)`, async (t) => {
    const page = await catalogPage(t, { session: sessionFace(CATALOG.mixed), chunk: baseChunk(t) })
    assert.equal(page.entries().length, 1, 'the base page did not register')
    assert.notDeepEqual(listedProblems(page, CATALOG.mixed), [], 'the base commit passes the oracle: the harness does not model the Cordis rule')
    assert.ok(failedShown(page, DSH.locales[0]), 'the base commit does not show the failure line: ' + pageText(page))
  })
}

/**
 * E-FIX-3 (B5) black-box rows: core's settings page reads DSH's model catalog under Cordis's inject
 * rule, as a real DSH (and a hosted child) applies it. Requirement (relayed by Fishball,
 * 2026-11-17): with DSH's `remote.session` service and a catalog, the "Fishball's model" select
 * lists each catalog model once, and a separate "Reasoning effort" select lists only the selected
 * model's efforts. A successful read never says "The models could not be read." / "无法读取模型。";
 * an empty catalog says "No model is configured in this DSH yet."; no `remote.session`, a rejected
 * read or `{ok:false}` → the page still renders and says the models could not be read; the page
 * never needs `remote.session` to register.
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
import { CATALOG, CATALOG_ANSWER, CORE, DSH, HARNESS, MARK, MODEL_SELECT, SUBJECT } from './constants.mjs'
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
const options = (page, nodes) => page.find((n) => n.tag === MODEL_SELECT.option, nodes)
const matchingOptions = (choices, name) => choices.filter((n) => textOf(n).includes(name))
const optionsNaming = (page, name) => matchingOptions(options(page), name)
const pageText = (page) => page.text(page.tree())
const failedShown = (page, lang) => pageText(page).includes(MODEL_SELECT.failed[lang])
/** Every model and effort name of a catalog, and how many options each must have. */
function expectedChoices(catalog) {
  return catalog.groups.flatMap((g) => g.models.flatMap((m) => (m.reasoning?.efforts?.length
    ? m.reasoning.efforts.map((e) => ({ label: `${m.name} / ${e.name}`, model: m.name, effort: e.name }))
    : [{ label: m.name, model: m.name }])))
}
/** The historical combined-choice oracle, kept for the boundary and base-commit checks. */
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

const PICKER = {
  field: 'model',
  en: { model: "Fishball's model", effort: 'Reasoning effort', dshDefault: "This DSH's default model" },
  zh: { model: 'Fishball 的模型', effort: '推理强度', dshDefault: '此 DSH 的默认模型' },
}

// Keep the original two providers and mixed catalog, adding destinations for each resolution rule.
const [plainProvider, reasoningProvider] = CATALOG.mixed.groups
const [plain] = plainProvider.models
const [thinker] = reasoningProvider.models
const [quick, deep] = thinker.reasoning.efforts
const fast = { id: 'e-fast', name: 'Fbtest Fast Effort' }
const peak = { id: 'e-peak', name: 'Fbtest Peak Effort' }
const thinkingModel = (id, name, efforts, defaultEffort) => ({ id, name, reasoning: { efforts, defaultEffort: defaultEffort.id } })
const overlap = thinkingModel('m-overlap', 'Fbtest Overlap Model', [quick, deep], quick)
const fallback = thinkingModel('m-fallback', 'Fbtest Default Effort Model', [fast, peak], peak)
const invalidDefault = thinkingModel('m-invalid', 'Fbtest Unsupported Default Model', [quick, deep], peak)
const pickerCatalog = { groups: [
  { ...plainProvider, models: [...plainProvider.models, overlap] },
  { ...reasoningProvider, models: [...reasoningProvider.models, fallback, invalidDefault] },
] }

function dropdowns(page, caption) {
  const labels = page.find((n) => n.tag === 'label' && textOf(n) === caption)
  return page.find((n) => n.tag === MODEL_SELECT.select
    && (n.props['aria-label'] === caption || (n.props.id && labels.some((label) => label.props.htmlFor === n.props.id))))
}
function exactlyOne(items, description) {
  assert.equal(items.length, 1, description)
  return items[0]
}
const dropdown = (page, caption) => exactlyOne(dropdowns(page, caption), 'expected one dropdown: ' + caption)
const namedOption = (choices, name) => exactlyOne(matchingOptions(choices, name), 'expected one option: ' + name)
const selectedOption = (select, choice) => assert.equal(select.props.value, choice.props.value, 'expected selected option: ' + textOf(choice))

async function choose(select, choice) {
  assert.ok(!select.props.disabled && !choice.props.disabled && !choice.props.hidden, 'option is not selectable: ' + textOf(choice))
  const { value } = choice.props
  select.props.onChange({ target: { value }, currentTarget: { value } })
  await settle()
}

function assertEffort(page, caption, model, expected) {
  const efforts = model?.reasoning?.efforts ?? []
  if (efforts.length === 0) {
    assert.equal(dropdowns(page, caption).length, 0, 'effort dropdown rendered without supported efforts')
    return
  }
  const select = dropdown(page, caption)
  assert.ok(!select.props.disabled, 'the effort dropdown must be selectable')
  const choices = options(page, select.children)
  assert.deepEqual(choices.map(textOf).sort(), efforts.map((effort) => effort.name).sort(), 'expected only supported efforts, each listed once')
  for (const choice of choices) assert.ok(!choice.props.disabled && !choice.props.hidden, 'supported effort is not selectable: ' + textOf(choice))
  selectedOption(select, namedOption(choices, expected.name))
}

function modelWrite(group, model, effort) {
  const path = [PICKER.field]
  const op = model
    ? { op: DSH.op.set, path, value: { provider: group.id, model: model.id, ...(effort && { reasoningEffort: effort.id }) } }
    : { op: DSH.op.unset, path }
  return { ns: CORE.namespace, ops: [op] }
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
    caseTest('EFIX3-SET-UC-01', `main ${lang}`, `remote.session provided (own fiber, Cordis's rule): one option per model, a separate supported-effort dropdown, and unchanged model writes; no "${MODEL_SELECT.failed[lang]}"`, async (t) => {
      const session = sessionFace(pickerCatalog)
      const page = await catalogPage(t, { lang, session })
      assertPageRendered(page)
      assert.ok(session.calls >= 1, 'the page never asked for the catalog')
      assert.equal(failedShown(page, lang), false, 'the page says the models could not be read')

      const labels = PICKER[lang]
      const modelSelect = () => dropdown(page, labels.model)
      const choices = options(page, modelSelect().children)
      const models = pickerCatalog.groups.flatMap((group) => group.models)
      const defaultChoice = namedOption(choices, labels.dshDefault)
      const listed = new Set([defaultChoice, ...models.map((model) => namedOption(choices, model.name))])
      assert.equal(listed.size, models.length + 1, 'each model and the DSH default need distinct options')
      assert.equal(choices.length, listed.size, 'expected only catalog models and the DSH default: ' + show(choices.map(textOf)))
      for (const effort of [quick, deep, fast, peak]) {
        assert.deepEqual(matchingOptions(choices, effort.name), [], 'effort listed in the model dropdown: ' + effort.name)
      }
      selectedOption(modelSelect(), defaultChoice)
      assertEffort(page, labels.effort)
      assert.deepEqual(page.world.mutations, [], 'displaying the catalog must not save')

      const expectedWrites = []
      for (const [caption, choiceName, group, model, effort] of [
        [labels.model, thinker.name, reasoningProvider, thinker, quick], // No default: first supported.
        [labels.effort, deep.name, reasoningProvider, thinker, deep],
        [labels.model, overlap.name, plainProvider, overlap, deep], // Keep deep even though quick is the default.
        [labels.model, fallback.name, reasoningProvider, fallback, peak], // Deep is unsupported; use peak, not first-listed fast.
        [labels.model, invalidDefault.name, reasoningProvider, invalidDefault, quick], // Both current and advertised default are unsupported.
        [labels.model, plain.name, plainProvider, plain], // Hide the effort dropdown and save without reasoningEffort.
        [labels.model, labels.dshDefault],
      ]) {
        const select = dropdown(page, caption)
        await choose(select, namedOption(options(page, select.children), choiceName))
        const modelPicker = modelSelect()
        selectedOption(modelPicker, namedOption(options(page, modelPicker.children), model?.name ?? labels.dshDefault))
        assertEffort(page, labels.effort, model, effort)
        expectedWrites.push(modelWrite(group, model, effort))
        assert.deepEqual(page.world.mutations.map(({ ns, ops }) => ({ ns, ops })), expectedWrites)
      }
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

  // ---------------------------------------------------------------- EFIX3-SET-MUT-01: the base commit fails the historical catalog oracle
  caseTest('EFIX3-SET-MUT-01', 'base c4845000', `mutating-test sanity: client.settings.js at ${MODEL_SELECT.baseRef} in the same world (catalog provided) does NOT list the catalog and says "could not be read" (the B5 bug, reproduced)`, async (t) => {
    const page = await catalogPage(t, { session: sessionFace(CATALOG.mixed), chunk: baseChunk(t) })
    assert.equal(page.entries().length, 1, 'the base page did not register')
    assert.notDeepEqual(listedProblems(page, CATALOG.mixed), [], 'the base commit passes the oracle: the harness does not model the Cordis rule')
    assert.ok(failedShown(page, DSH.locales[0]), 'the base commit does not show the failure line: ' + pageText(page))
  })
}

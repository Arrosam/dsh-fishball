/**
 * R4/R5 black-box cases for the umbrella's settings pages (README.md beside this file). client.js was
 * not read: it runs in the scripted Plugins page of page.mjs, whose Host serves each member's real
 * Config through DSH's own dsh-settings, and whose form primitives are DSH's own.
 *
 * Techniques: EP (PG-EP-*: the plugin's surface, the entries, summary, controls, labels), DT (PG-DT-01:
 * which namespaces are served × which entries exist), BVA (PG-BVA-01: each number field's min/max
 * edges), ST (PG-ST-*: served → withdrawn → served, ready → unavailable, writable → read-only), UC
 * (PG-UC-*: the user edits and saves), and manifest rows (PG-MF-*).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { manifestOf, UMBRELLA as UMBRELLA_PKG } from '../support/packages.mjs'
import { FORMS, MANIFESTS, PAGE, UMBRELLA } from './constants.mjs'
import { click, openUmbrellaPage, servedFields, textOf, type } from './page.mjs'

const row = (id, part, title, fn) => caseTest(id, part, title, { timeout: PAGE.testMs }, fn)
const show = (v) => JSON.stringify(v)
const ROW_IDS = UMBRELLA.rows.map((r) => r.id)
const numberFields = FORMS.flatMap((f) => f.settings.filter((s) => s.kind === 'number').map((s) => ({ ...s, row: f.row })))

const openRow = (p, rowId, view) => p.open(PAGE.slot.row, PAGE.rowKey(rowId), view)
/** The text input of one scalar setting. */
const inputOf = (v, field) => v.inputs(v.setting(field))[0]
/** The form's Save (outside every list). */
const formSave = (p, v) => v.button(p.text(PAGE.key.save))[0]
function findLabel(node) {
  const stack = [node]
  while (stack.length) { const n = stack.shift(); if (typeof n === 'string') continue; if (n.tag === 'label') return textOf(n); stack.push(...(n.children ?? [])) }
  return undefined
}
const lastMutation = (p, rowId) => p.host(rowId).mutations.at(-1)
async function edit(p, node, text) { type(node, text); await p.settle() }
async function press(p, node) { click(node); await p.settle() }
/** A served schema with one more scalar field no dictionary labels, appended last. */
const withUnlabelled = (rowId) => ({ [rowId]: (Schema, Config) => Schema.object({ ...Config.dict, [PAGE.unlabelledField]: Schema.natural().min(1).volatile().description(PAGE.unlabelledDescription) }) })

/**
 * The controls a served schema gives (R4 as the requirement owner corrected it on 2026-11-22): the
 * number/string fields inside DSH's SettingsForm in schema order, then the array-of-objects (list)
 * fields after that form, in schema order (SettingsForm draws its one Save after its children, and a
 * list has its own Save).
 */
function expectedControls(fields) {
  const isList = (f) => f.node.type === 'array'
  return [...fields.filter((f) => !isList(f)), ...fields.filter(isList)].map((f) => ({ kind: isList(f) ? 'list' : 'setting', name: f.name }))
}

/** Opens one row's page. */
async function opened(t, rowId, options = {}) {
  const p = await openUmbrellaPage(t, options)
  return { p, v: await openRow(p, rowId) }
}

export function registerUmbrellaPageCases() {
  // ---- PG-EP-01: the client plugin
  row('PG-EP-01', 1, `client.js registers one module ${UMBRELLA.id} whose plugin injects ${UMBRELLA.inject.join(', ')}`, async (t) => {
    const p = await openUmbrellaPage(t)
    const registrations = p.definition()
    assert.equal(registrations.length, 1, '__ModuleLoader__.load calls: ' + registrations.length)
    assert.equal(registrations[0].id, UMBRELLA.id)
    const plugin = p.plugin().default ?? p.plugin()
    assert.equal(typeof plugin.apply, 'function')
    const inject = Array.isArray(plugin.inject) ? plugin.inject : Object.keys(plugin.inject ?? {})
    for (const name of UMBRELLA.inject) assert.ok(inject.includes(name), 'inject has ' + name + ': ' + show(inject))
    assert.deepEqual([...new Set(p.required())].sort(), [PAGE.require.primitives, PAGE.require.react].sort(), "only React and DSH's primitives are required")
    assert.deepEqual(p.world.errors, [], 'no module error')
    assert.deepEqual(p.world.failedFibers, [], 'no failed fiber')
  })

  // ---- PG-EP-02: the bundle hint
  row('PG-EP-02', 1, "the plugins.bundle.config hint stays, keyed by the umbrella's package name, and tells the user to open a component to configure it", async (t) => {
    const p = await openUmbrellaPage(t)
    assert.deepEqual(p.entries(PAGE.slot.bundle).map((e) => e.options.key), [UMBRELLA.id])
    const v = await p.open(PAGE.slot.bundle, UMBRELLA.id)
    const text = v.text()
    assert.equal(text.trim(), p.text(PAGE.key.hint), "the hint text is the dictionary's")
    assert.match(text, PAGE.component, 'names a component: ' + show(text))
    assert.ok(p.text(PAGE.key.hint, PAGE.lang.zh)?.length > 0, 'a zh hint')
  })

  // ---- PG-DT-01: served namespaces × configure entries
  const subsets = [['all', ROW_IDS], ['none', []], ...ROW_IDS.map((id) => ['only ' + id, [id]])]
  for (const [label, served] of subsets) {
    row('PG-DT-01', label, `served ${show(served)} → plugins.row.config entries exactly for those rows`, async (t) => {
      const p = await openUmbrellaPage(t, { served })
      assert.deepEqual(p.entries(PAGE.slot.row).map((e) => e.options.key).sort(), served.map(PAGE.rowKey).sort())
    })
  }
  row('PG-DT-01', 'excluded', `served ${show(UMBRELLA.excluded)} too: still no entry for them`, async (t) => {
    const p = await openUmbrellaPage(t)
    for (const id of UMBRELLA.excluded) await p.serve(id)
    const keys = p.entries(PAGE.slot.row).map((e) => e.options.key)
    for (const id of UMBRELLA.excluded) assert.ok(!keys.includes(PAGE.rowKey(id)), id + ': ' + show(keys))
    assert.deepEqual(keys.sort(), ROW_IDS.map(PAGE.rowKey).sort())
  })
  row('PG-DT-01', 'whileServed', 'each row registers through configForms.whileServed([rowId], …), one watch per configurable row', async (t) => {
    const p = await openUmbrellaPage(t, { served: [] })
    assert.deepEqual(p.watches.map((w) => [...w]).sort(), ROW_IDS.map((id) => [id]).sort())
  })

  // ---- PG-ST-01: served → withdrawn → served
  for (const id of ROW_IDS) {
    row('PG-ST-01', id, `${id}: the entry appears when DSH serves it, is withdrawn when it stops, and comes back`, async (t) => {
      const p = await openUmbrellaPage(t, { served: [] })
      assert.equal(p.entry(PAGE.slot.row, PAGE.rowKey(id)), undefined, 'not served → no entry')
      await p.serve(id)
      assert.ok(p.entry(PAGE.slot.row, PAGE.rowKey(id)), 'served → entry')
      await p.serve(id, false)
      assert.equal(p.entry(PAGE.slot.row, PAGE.rowKey(id)), undefined, 'withdrawn')
      await p.serve(id)
      assert.ok(p.entry(PAGE.slot.row, PAGE.rowKey(id)), 'served again')
      assert.equal(p.entries(PAGE.slot.row).length, 1, 'one entry, no duplicate')
    })
  }
  row('PG-ST-01', 'dispose', 'disposing the client plugin withdraws every entry it registered', async (t) => {
    const p = await openUmbrellaPage(t)
    await p.fiber().dispose()
    await p.settle()
    assert.deepEqual(p.entries(PAGE.slot.row), [])
  })

  // ---- PG-EP-03: summary
  for (const id of ROW_IDS) {
    row('PG-EP-03', id, `${id} {view: 'summary'}: one short line of text`, async (t) => {
      const p = await openUmbrellaPage(t)
      const v = await openRow(p, id, PAGE.view.summary)
      const text = v.text().trim()
      assert.ok(text.length > 0, 'non-empty')
      assert.ok(!text.includes('\n'), 'one line: ' + show(text))
      assert.equal(v.inputs().length, 0, 'the summary has no controls')
    })
  }

  // ---- PG-EP-04/05/06: controls, order, labels, hints
  for (const form of FORMS) {
    row('PG-EP-04', form.row, `${form.row} {view: 'page'}: one control per top-level served field: the scalar fields in schema order, then the list fields in schema order`, async (t) => {
      const { p, v } = await opened(t, form.row)
      const fields = servedFields(p.host(form.row).view.schema)
      assert.deepEqual(fields.map((f) => f.name), form.order, 'fixture: the served schema order')
      assert.deepEqual(v.controls(), expectedControls(fields))
    })
    for (const lang of [PAGE.lang.en, PAGE.lang.zh]) {
      row('PG-EP-05', form.row + ' ' + lang, `${form.row} in ${lang}: each label is the umbrella dictionary's, each hint the field's schema description`, async (t) => {
        const { p, v } = await opened(t, form.row, { lang })
        for (const { name, node } of servedFields(p.host(form.row).view.schema)) {
          const expected = p.text(PAGE.key.field(name), lang)
          assert.ok(expected?.length > 0, 'the dictionary labels ' + name + ' in ' + lang)
          const control = node.type === 'array' ? v.list(name) : v.setting(name)
          assert.ok(control, 'a control for ' + name)
          const shown = textOf(control)
          if (node.type !== 'array') assert.equal(findLabel(control), expected, name + ' label')
          else assert.ok(shown.includes(expected), name + ' list title: ' + show(shown))
          assert.ok(shown.includes(node.meta.description), name + ' hint is its description: ' + show(shown))
        }
      })
    }
    row('PG-EP-06', form.row, `${form.row}: a served field the dictionary has no label for still renders, labelled with its name`, async (t) => {
      const { p, v } = await opened(t, form.row, { extend: withUnlabelled(form.row) })
      assert.equal(p.text(PAGE.key.field(PAGE.unlabelledField)), undefined, 'fixture: no label')
      const control = v.setting(PAGE.unlabelledField)
      assert.ok(control, 'rendered: ' + show(v.controls()))
      assert.equal(findLabel(control), PAGE.unlabelledField)
    })
    row('PG-EP-04', form.row + ' appended', `${form.row}: a scalar field appended to the served schema renders after the other scalar fields and before any list field`, async (t) => {
      const { p, v } = await opened(t, form.row, { extend: withUnlabelled(form.row) })
      const fields = servedFields(p.host(form.row).view.schema)
      assert.equal(fields.at(-1).name, PAGE.unlabelledField, 'fixture: appended last')
      assert.deepEqual(v.controls(), expectedControls(fields))
    })
  }

  // ---- PG-UC / PG-BVA: scalar fields
  for (const f of numberFields) {
    row('PG-UC-01', f.name, `${f.name}: typed ${f.min} and saved → mutate([{op: 'set', path: ['${f.name}'], value: ${f.min}}]) with a Number, at the revision read`, async (t) => {
      const { p, v } = await opened(t, f.row)
      await edit(p, inputOf(v, f.name), String(f.min))
      const save = formSave(p, v)
      assert.equal(save?.props.disabled, false, 'Save is enabled')
      await press(p, save)
      const m = lastMutation(p, f.row)
      assert.ok(m, 'one write')
      assert.deepEqual(m.ops, [{ op: PAGE.op.set, path: [f.name], value: f.min }])
      assert.equal(typeof m.ops[0].value, 'number')
      assert.equal(m.expected, PAGE.firstRevision, 'the revision read when editing began')
      assert.equal(p.host(f.row).user[f.name], f.min, 'the Host stored it')
    })
    const ok = [f.min, ...(f.max === undefined ? [] : [f.max])]
    const bad = [f.min - 1, ...(f.max === undefined ? [] : [f.max + 1]), f.min + PAGE.fraction, PAGE.text]
    for (const value of ok) {
      row('PG-BVA-01', f.name + ' ' + value, `${f.name} = ${value} (inside ${f.min}..${f.max ?? '∞'}): Save writes it`, async (t) => {
        const { p, v } = await opened(t, f.row)
        await edit(p, inputOf(v, f.name), String(value))
        await press(p, formSave(p, v))
        assert.deepEqual(lastMutation(p, f.row)?.ops, [{ op: PAGE.op.set, path: [f.name], value }])
      })
    }
    for (const value of bad) {
      row('PG-BVA-01', f.name + ' ' + value, `${f.name} = ${show(value)} (refused by its schema): Save is blocked, nothing is written`, async (t) => {
        const { p, v } = await opened(t, f.row)
        await edit(p, inputOf(v, f.name), String(value))
        const save = formSave(p, v)
        assert.equal(save?.props.disabled, true, 'Save is disabled')
        await press(p, save)
        assert.equal(p.host(f.row).mutations.length, 0, 'no write: ' + show(p.host(f.row).mutations))
      })
    }
  }
  for (const form of FORMS.filter((x) => x.settings.filter((s) => s.kind === 'number').length >= 2)) {
    const [a, b] = form.settings.filter((s) => s.kind === 'number')
    const byPath = (x, y) => x.path[0].localeCompare(y.path[0])
    row('PG-UC-02', form.row, `${form.row}: two fields staged are written together by one Save (one mutate, two ops)`, async (t) => {
      const { p, v } = await opened(t, form.row)
      await edit(p, inputOf(v, a.name), String(a.min))
      await edit(p, inputOf(v, b.name), String(b.min))
      await press(p, formSave(p, v))
      assert.equal(p.host(form.row).mutations.length, 1)
      assert.deepEqual(lastMutation(p, form.row).ops.sort(byPath), [{ op: PAGE.op.set, path: [a.name], value: a.min }, { op: PAGE.op.set, path: [b.name], value: b.min }].sort(byPath))
    })
  }
  for (const f of numberFields) {
    row('PG-UC-03', f.name, `${f.name} set by the user, emptied and saved → mutate([{op: 'unset', path: ['${f.name}']}])`, async (t) => {
      const { p, v } = await opened(t, f.row, { users: { [f.row]: { [f.name]: f.min } } })
      assert.equal(inputOf(v, f.name).props.value, String(f.min), 'shows the stored value')
      await edit(p, inputOf(v, f.name), '')
      await press(p, formSave(p, v))
      assert.deepEqual(lastMutation(p, f.row)?.ops, [{ op: PAGE.op.unset, path: [f.name] }])
      assert.equal(Object.hasOwn(p.host(f.row).user, f.name), false)
    })
  }

  // ---- PG-ST-02/03: unavailable, read-only
  for (const form of FORMS) {
    row('PG-ST-02', form.row, `${form.row}: status 'unavailable' shows the unavailable message instead of controls`, async (t) => {
      const { p, v } = await opened(t, form.row)
      assert.ok(v.inputs().length > 0, 'controls while ready')
      await p.setStatus(form.row, PAGE.status.unavailable)
      assert.equal(v.inputs().length, 0, 'no control: ' + v.text())
      assert.ok(v.text().includes(p.text(PAGE.key.unavailable)), 'the unavailable message: ' + show(v.text()))
    })
    row('PG-ST-03', form.row, `${form.row}: writable false disables every control`, async (t) => {
      const { p, v } = await opened(t, form.row)
      await p.setWritable(false)
      const inputs = v.inputs()
      assert.ok(inputs.length > 0)
      for (const input of inputs) assert.equal(input.props.disabled, true, 'disabled: ' + show(input.props))
      for (const b of v.buttons()) assert.equal(b.props.disabled, true, 'button disabled: ' + textOf(b))
    })
  }

  // ---- PG-MF-*: manifests (R5)
  row('PG-MF-01', UMBRELLA.id, `${UMBRELLA.id}'s dsh.client.inject includes ${UMBRELLA.clientInject}`, () => {
    const manifest = manifestOf(UMBRELLA_PKG)
    assert.ok(manifest.dsh?.client?.inject?.includes(UMBRELLA.clientInject), show(manifest.dsh?.client))
  })
  for (const m of MANIFESTS) {
    row('PG-MF-02', m.pkg, `${m.pkg} depends on ${show(m.depends)} and bundles ${show(m.bundles)}`, () => {
      const manifest = manifestOf({ name: m.pkg })
      for (const name of m.depends) assert.ok(manifest.dependencies?.[name], name + ' in dependencies: ' + show(manifest.dependencies))
      const bundled = [...(manifest.bundleDependencies ?? []), ...(manifest.bundledDependencies ?? [])]
      for (const name of m.bundles) assert.ok(bundled.includes(name), name + ' bundled: ' + show(bundled))
    })
  }
}

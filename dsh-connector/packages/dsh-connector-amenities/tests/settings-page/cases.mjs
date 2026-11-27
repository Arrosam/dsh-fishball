/**
 * R4/R5 black-box cases for the umbrella's settings pages (USE-CASES.md beside this file). client.js
 * was not read: it runs in the scripted Plugins page of page.mjs, whose Host serves each member's real
 * Config through DSH's own dsh-settings, and whose form primitives are DSH's own.
 *
 * Techniques: EP (PG-EP-*: the plugin's surface, the entries, summary, controls, labels), DT (PG-DT-01:
 * which namespaces are served × which entries exist; PG-LS-DT-01: list draft rules × Save), BVA
 * (PG-BVA-01: each number field's min/max edges; PG-LS-BVA-01: serverName 32/33), ST (PG-ST-*: served →
 * withdrawn → served, ready → unavailable, writable → read-only; PG-LS-ST-*: draft → refused → kept),
 * UC (PG-UC-*, PG-LS-UC-*: the user edits and saves), and manifest rows (PG-MF-*).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { CATALOG, FORMS, MANIFESTS, PAGE, UMBRELLA } from './constants.mjs'
import { click, openUmbrellaPage, servedFields, textOf, type } from './page.mjs'

const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), { timeout: PAGE.testMs }, fn)
const show = (v) => JSON.stringify(v)
const ROW_IDS = UMBRELLA.rows.map((r) => r.id)
const formOf = (rowId) => FORMS.find((f) => f.row === rowId)
const numberFields = FORMS.flatMap((f) => f.settings.filter((s) => s.kind === 'number').map((s) => ({ ...s, row: f.row })))
const textFields = FORMS.flatMap((f) => f.settings.filter((s) => s.kind === 'text').map((s) => ({ ...s, row: f.row })))
const lists = FORMS.flatMap((f) => f.lists.map((l) => ({ ...l, row: f.row })))

const openRow = (p, rowId, view) => p.open(PAGE.slot.row, PAGE.rowKey(rowId), view)
/** The text input of one scalar setting. */
const inputOf = (v, field) => v.inputs(v.setting(field))[0]
/** The form's Save (outside every list). */
const formSave = (p, v) => { const [b] = v.button(p.text(PAGE.key.save)); return b }
function findLabel(node) {
  const stack = [node]
  while (stack.length) { const n = stack.shift(); if (typeof n === 'string') continue; if (n.tag === 'label') return textOf(n); stack.push(...(n.children ?? [])) }
  return undefined
}
const lastMutation = (p, rowId) => p.host(rowId).mutations.at(-1)
/** Types into a control and lets the page re-render. */
async function edit(p, node, text) { type(node, text); await p.settle() }
async function press(p, node) { click(node); await p.settle() }

const isModelNode = (node) => node.type === 'object' && node.dict?.provider?.type === 'string' && node.dict?.model?.type === 'string'

/**
 * The controls a served schema gives: model selectors first, then number/string fields inside
 * DSH's SettingsForm in schema order, then array-of-objects (list) fields after that form.
 */
function expectedControls(fields) {
  const models = fields.filter((f) => isModelNode(f.node)).map((f) => ({ kind: 'model', name: f.name }))
  const scalars = fields.filter((f) => !isModelNode(f.node) && f.node.type !== 'array').map((f) => ({ kind: 'setting', name: f.name }))
  const listsOf = fields.filter((f) => f.node.type === 'array').map((f) => ({ kind: 'list', name: f.name }))
  return [...models, ...scalars, ...listsOf]
}

/** Opens one row's page with a starting user layer. */
async function opened(t, sdk, rowId, options = {}) {
  const p = await openUmbrellaPage(t, { sdk, ...options })
  const v = await openRow(p, rowId)
  return { p, v }
}

export function registerUmbrellaPageCases(sdk) {
  // ============================================================================================
  // PG-EP-01: the client plugin

  row(sdk, 'PG-EP-01', 1, `client.js registers one module ${UMBRELLA.id} whose plugin injects ${UMBRELLA.inject.join(', ')}`, async (t) => {
    const p = await openUmbrellaPage(t, { sdk })
    assert.equal(p.definition.id, UMBRELLA.id)
    const plugin = p.plugin.default ?? p.plugin
    assert.equal(typeof plugin.apply, 'function')
    const inject = Array.isArray(plugin.inject) ? plugin.inject : Object.keys(plugin.inject ?? {})
    for (const name of UMBRELLA.inject) assert.ok(inject.includes(name), 'inject has ' + name + ': ' + show(inject))
    assert.deepEqual([...new Set(p.required)].sort(), [PAGE.require.primitives, PAGE.require.react].sort(), 'only React and DSH\'s primitives are required')
    assert.deepEqual(p.errors, [], 'no page error')
  })

  // ============================================================================================
  // PG-EP-02: the bundle hint

  row(sdk, 'PG-EP-02', 1, 'the plugins.bundle.config hint stays, keyed by the umbrella\'s package name, and tells the user to open a component to configure it', async (t) => {
    const p = await openUmbrellaPage(t, { sdk })
    const entries = p.entries(PAGE.slot.bundle)
    assert.deepEqual(entries.map((e) => e.options.key), [UMBRELLA.id])
    const v = await p.open(PAGE.slot.bundle, UMBRELLA.id)
    const text = v.text()
    assert.equal(text.trim(), p.text(PAGE.key.hint), 'the hint text is the dictionary\'s')
    assert.match(text, /component/i, 'names a component: ' + show(text))
    assert.ok(p.text(PAGE.key.hint, PAGE.lang.zh)?.length > 0, 'a zh hint')
  })

  // ============================================================================================
  // PG-DT-01: served namespaces × configure entries

  const subsets = [['all', ROW_IDS], ['none', []], ...ROW_IDS.map((id) => ['only ' + id, [id]])]
  for (const [label, served] of subsets) {
    row(sdk, 'PG-DT-01', label, `served ${show(served)} → plugins.row.config entries exactly for those rows`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, served })
      assert.deepEqual(p.entries(PAGE.slot.row).map((e) => e.options.key).sort(), served.map(PAGE.rowKey).sort())
    })
  }
  row(sdk, 'PG-DT-01', 'excluded', `served ${show(UMBRELLA.excluded)} too: still no entry for them`, async (t) => {
    const p = await openUmbrellaPage(t, { sdk })
    for (const id of UMBRELLA.excluded) await p.serve(id)
    const keys = p.entries(PAGE.slot.row).map((e) => e.options.key)
    for (const id of UMBRELLA.excluded) assert.ok(!keys.includes(PAGE.rowKey(id)), id + ': ' + show(keys))
    assert.deepEqual(keys.sort(), ROW_IDS.map(PAGE.rowKey).sort())
  })
  row(sdk, 'PG-DT-01', 'whileServed', 'each row registers through configForms.whileServed([rowId], …), one watch per configurable row', async (t) => {
    const p = await openUmbrellaPage(t, { sdk, served: [] })
    assert.deepEqual(p.watches.map((w) => [...w]).sort(), ROW_IDS.map((id) => [id]).sort())
  })

  // ============================================================================================
  // PG-ST-01: served → withdrawn → served

  for (const id of ROW_IDS) {
    row(sdk, 'PG-ST-01', id, `${id}: the entry appears when DSH serves it, is withdrawn when it stops, and comes back`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, served: [] })
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
  row(sdk, 'PG-ST-01', 'dispose', 'disposing the client plugin withdraws every entry it registered', async (t) => {
    const p = await openUmbrellaPage(t, { sdk })
    await p.fiber.dispose()
    await p.settle()
    assert.deepEqual(p.entries(PAGE.slot.row), [])
  })

  // ============================================================================================
  // PG-EP-03: summary

  for (const id of ROW_IDS) {
    row(sdk, 'PG-EP-03', id, `${id} {view: 'summary'}: one short line of text`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk })
      const v = await openRow(p, id, PAGE.view.summary)
      const text = v.text().trim()
      assert.ok(text.length > 0, 'non-empty')
      assert.ok(!text.includes('\n'), 'one line: ' + show(text))
      assert.equal(v.inputs().length, 0, 'the summary has no controls')
    })
  }

  // ============================================================================================
  // PG-EP-04/05/06: controls, order, labels, hints

  for (const form of FORMS) {
    row(sdk, 'PG-EP-04', form.row, `${form.row} {view: 'page'}: one control per top-level served field: the scalar fields in schema order, then the list fields in schema order`, async (t) => {
      const { p, v } = await opened(t, sdk, form.row)
      const fields = servedFields(p.host(form.row).view.schema)
      assert.deepEqual(fields.map((f) => f.name), form.order, 'fixture: the served schema order')
      assert.deepEqual(v.controls(), expectedControls(fields))
    })
    for (const lang of [PAGE.lang.en, PAGE.lang.zh]) {
      row(sdk, 'PG-EP-05', form.row + ' ' + lang, `${form.row} in ${lang}: each label is the umbrella dictionary's, each hint the field's schema description`, async (t) => {
        const { p, v } = await opened(t, sdk, form.row, { lang })
        const fields = servedFields(p.host(form.row).view.schema)
        for (const { name, node } of fields) {
          const expected = p.text(PAGE.key.field(name), lang)
          assert.ok(expected?.length > 0, 'the dictionary labels ' + name + ' in ' + lang)
          const control = isModelNode(node) ? v.model(name) : node.type === 'array' ? v.list(name) : v.setting(name)
          assert.ok(control, 'a control for ' + name)
          const shown = textOf(control)
          if (node.type !== 'array') assert.equal(findLabel(control), expected, name + ' label')
          else assert.ok(shown.includes(expected), name + ' list title: ' + show(shown))
          assert.ok(shown.includes(node.meta.description), name + ' hint is its description: ' + show(shown))
        }
      })
    }
    row(sdk, 'PG-EP-06', form.row, `${form.row}: a served field the dictionary has no label for still renders, labelled with its name`, async (t) => {
      const extend = { [form.row]: (Schema, Config) => Schema.object({ ...Config.dict, [PAGE.unlabelledField]: Schema.natural().min(1).volatile().description('fbtest unlabelled') }) }
      const { p, v } = await opened(t, sdk, form.row, { extend })
      assert.equal(p.text(PAGE.key.field(PAGE.unlabelledField)), undefined, 'fixture: no label')
      const control = v.setting(PAGE.unlabelledField)
      assert.ok(control, 'rendered: ' + show(v.controls()))
      assert.equal(findLabel(control), PAGE.unlabelledField)
    })
    row(sdk, 'PG-EP-04', form.row + ' appended', `${form.row}: a scalar field appended to the served schema renders after the other scalar fields and before any list field`, async (t) => {
      const extend = { [form.row]: (Schema, Config) => Schema.object({ ...Config.dict, [PAGE.unlabelledField]: Schema.natural().min(1).volatile().description('fbtest unlabelled') }) }
      const { p, v } = await opened(t, sdk, form.row, { extend })
      const fields = servedFields(p.host(form.row).view.schema)
      assert.equal(fields.at(-1).name, PAGE.unlabelledField, 'fixture: appended last')
      assert.deepEqual(v.controls(), expectedControls(fields))
    })
  }
  for (const extra of FORMS.flatMap((f) => (f.labelledExtra ?? []).map((name) => ({ row: f.row, name })))) {
    row(sdk, 'PG-EP-06', extra.name, `a served ${extra.name} (another branch's field) renders with the dictionary's label, no extra code`, async (t) => {
      const extend = { [extra.row]: (Schema, Config) => Schema.object({ ...Config.dict, [extra.name]: Schema.natural().volatile().description('fbtest future field') }) }
      const { p, v } = await opened(t, sdk, extra.row, { extend })
      assert.equal(findLabel(v.setting(extra.name)), p.text(PAGE.key.field(extra.name)))
    })
  }

  // ============================================================================================
  // PG-UC / PG-BVA: scalar fields

  for (const f of numberFields) {
    row(sdk, 'PG-UC-01', f.name, `${f.name}: typed ${f.min} and saved → mutate([{op: 'set', path: ['${f.name}'], value: ${f.min}}]) with a Number, at the revision read`, async (t) => {
      const { p, v } = await opened(t, sdk, f.row)
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
    const bad = [f.min - 1, ...(f.max === undefined ? [] : [f.max + 1]), f.min + 0.5, 'fbtest']
    for (const value of ok) {
      row(sdk, 'PG-BVA-01', f.name + ' ' + value, `${f.name} = ${value} (inside ${f.min}..${f.max ?? '∞'}): Save writes it`, async (t) => {
        const { p, v } = await opened(t, sdk, f.row)
        await edit(p, inputOf(v, f.name), String(value))
        await press(p, formSave(p, v))
        assert.deepEqual(lastMutation(p, f.row)?.ops, [{ op: PAGE.op.set, path: [f.name], value }])
      })
    }
    for (const value of bad) {
      row(sdk, 'PG-BVA-01', f.name + ' ' + value, `${f.name} = ${show(value)} (refused by its schema): Save is blocked, nothing is written`, async (t) => {
        const { p, v } = await opened(t, sdk, f.row)
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
    row(sdk, 'PG-UC-02', form.row, `${form.row}: two fields staged are written together by one Save (one mutate, two ops)`, async (t) => {
      const { p, v } = await opened(t, sdk, form.row)
      await edit(p, inputOf(v, a.name), String(a.min))
      await edit(p, inputOf(v, b.name), String(b.min))
      await press(p, formSave(p, v))
      assert.equal(p.host(form.row).mutations.length, 1)
      assert.deepEqual(lastMutation(p, form.row).ops.sort((x, y) => x.path[0].localeCompare(y.path[0])), [{ op: PAGE.op.set, path: [a.name], value: a.min }, { op: PAGE.op.set, path: [b.name], value: b.min }].sort((x, y) => x.path[0].localeCompare(y.path[0])))
    })
  }
  for (const f of [...numberFields, ...textFields]) {
    const stored = f.kind === 'number' ? f.min : f.sample
    row(sdk, 'PG-UC-03', f.name, `${f.name} set by the user, emptied and saved → mutate([{op: 'unset', path: ['${f.name}']}])`, async (t) => {
      const { p, v } = await opened(t, sdk, f.row, { users: { [f.row]: { ...(formOf(f.row).baseUser ?? {}), [f.name]: stored } } })
      assert.equal(inputOf(v, f.name).props.value, String(stored), 'shows the stored value')
      await edit(p, inputOf(v, f.name), '')
      await press(p, formSave(p, v))
      assert.deepEqual(lastMutation(p, f.row)?.ops, [{ op: PAGE.op.unset, path: [f.name] }])
      assert.equal(Object.hasOwn(p.host(f.row).user, f.name), false)
    })
  }
  for (const f of textFields) {
    row(sdk, 'PG-UC-04', f.name, `${f.name}: a text control; typed and saved → a set of the string`, async (t) => {
      const { p, v } = await opened(t, sdk, f.row)
      await edit(p, inputOf(v, f.name), f.sample)
      await press(p, formSave(p, v))
      assert.deepEqual(lastMutation(p, f.row)?.ops, [{ op: PAGE.op.set, path: [f.name], value: f.sample }])
    })
  }

  // ============================================================================================
  // PG-ST-02/03: unavailable, read-only

  for (const form of FORMS) {
    row(sdk, 'PG-ST-02', form.row, `${form.row}: status 'unavailable' shows the unavailable message instead of controls`, async (t) => {
      const { p, v } = await opened(t, sdk, form.row)
      assert.ok(v.inputs().length > 0, 'controls while ready')
      await p.setStatus(form.row, PAGE.status.unavailable)
      assert.equal(v.inputs().length, 0, 'no control: ' + v.text())
      assert.equal(v.selects().length, 0, 'no select control: ' + v.text())
      assert.ok(v.text().includes(p.text(PAGE.key.unavailable)), 'the unavailable message: ' + show(v.text()))
    })
    row(sdk, 'PG-ST-03', form.row, `${form.row}: writable false disables every control`, async (t) => {
      const { p, v } = await opened(t, sdk, form.row, { users: { [form.row]: form.baseUser ?? {} } })
      await p.setWritable(false)
      const inputs = v.inputs()
      assert.ok(inputs.length > 0)
      for (const input of inputs) assert.equal(input.props.disabled, true, 'disabled: ' + show(input.props))
      for (const select of v.selects()) assert.equal(select.props.disabled, true, 'select disabled: ' + show(select.props))
      for (const b of v.buttons()) assert.equal(b.props.disabled, true, 'button disabled: ' + textOf(b))
    })
  }

  // ============================================================================================
  // PG-LS-*: an array-of-objects field is a list editor

  for (const list of lists) {
    const L = list.name
    const [nameField, urlField] = list.item
    const itemInputs = (p, v, index) => {
      const item = v.items(L)[index]
      assert.ok(item, 'item ' + index + ' exists: ' + v.items(L).length)
      const inputs = v.inputs(item)
      const by = (field) => inputs.find((i) => i.props['aria-label'] === p.text(PAGE.key.item(L, field)))
      return { item, name: by(nameField), url: by(urlField) }
    }
    const listSave = (p, v) => v.button(p.text(PAGE.key.save), v.list(L))[0]
    const listButton = (p, v, key) => v.button(p.text(key), v.list(L)).filter((b) => !v.items(L).some((it) => v.buttons(it).includes(b)))[0]
    const start = (p) => ({ users: { [list.row]: { ...(formOf(list.row).baseUser ?? {}), [L]: structuredClone(list.start) } } })
    async function addFilled(p, v, entry) {
      await press(p, listButton(p, v, PAGE.key.add))
      const at = v.items(L).length - 1
      await edit(p, itemInputs(p, v, at).name, entry[nameField])
      await edit(p, itemInputs(p, v, at).url, entry[urlField])
      return at
    }

    row(sdk, 'PG-LS-EP-01', L, `${L}: one item per stored entry, each with its ${nameField} and ${urlField} inputs labelled from the dictionary`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, ...start() })
      const v = await openRow(p, list.row)
      assert.equal(v.items(L).length, list.start.length)
      list.start.forEach((entry, i) => {
        const { name, url } = itemInputs(p, v, i)
        assert.equal(name?.props.value, entry[nameField])
        assert.equal(url?.props.value, entry[urlField])
      })
      assert.equal(listSave(p, v), undefined, 'no list Save before an edit')
    })
    row(sdk, 'PG-LS-UC-01', L, `${L}: Add adds an empty item; filled and saved → one mutate([{op: 'set', path: ['${L}'], value: whole list}]) at the revision read when editing began`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, ...start() })
      const v = await openRow(p, list.row)
      await press(p, listButton(p, v, PAGE.key.add))
      assert.equal(v.items(L).length, list.start.length + 1)
      const fresh = itemInputs(p, v, list.start.length)
      assert.equal(fresh.name.props.value, '', 'empty name')
      assert.equal(fresh.url.props.value, '', 'empty url')
      await edit(p, fresh.name, list.added[nameField])
      await edit(p, itemInputs(p, v, list.start.length).url, list.added[urlField])
      const save = listSave(p, v)
      assert.equal(save?.props.disabled, false, 'list Save enabled')
      await press(p, save)
      const m = lastMutation(p, list.row)
      assert.deepEqual(m?.ops, [{ op: PAGE.op.set, path: [L], value: [...list.start, list.added] }])
      assert.equal(m.expected, PAGE.firstRevision)
      assert.deepEqual(p.host(list.row).user[L], [...list.start, list.added])
    })
    row(sdk, 'PG-LS-UC-02', L, `${L}: Remove removes that item; saved → the list without it`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, ...start() })
      const v = await openRow(p, list.row)
      const [remove] = v.button(p.text(PAGE.key.remove), v.items(L)[0])
      await press(p, remove)
      assert.equal(v.items(L).length, list.start.length - 1)
      await press(p, listSave(p, v))
      assert.deepEqual(lastMutation(p, list.row)?.ops, [{ op: PAGE.op.set, path: [L], value: list.start.slice(1) }])
    })
    row(sdk, 'PG-LS-UC-03', L, `${L}: an edited ${urlField} of an existing item is saved with the whole list`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, ...start() })
      const v = await openRow(p, list.row)
      await edit(p, itemInputs(p, v, 0).url, list.added[urlField])
      await press(p, listSave(p, v))
      const expected = structuredClone(list.start)
      expected[0][urlField] = list.added[urlField]
      assert.deepEqual(lastMutation(p, list.row)?.ops, [{ op: PAGE.op.set, path: [L], value: expected }])
    })
    row(sdk, 'PG-LS-UC-04', L, `${L}: removing every item and saving writes []`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, ...start() })
      const v = await openRow(p, list.row)
      while (v.items(L).length > 0) await press(p, v.button(p.text(PAGE.key.remove), v.items(L)[0])[0])
      await press(p, listSave(p, v))
      assert.deepEqual(lastMutation(p, list.row)?.ops, [{ op: PAGE.op.set, path: [L], value: [] }])
    })
    for (const rule of list.refused) {
      row(sdk, 'PG-LS-DT-01', rule.label, `${L}: a new item ${show(rule.entry)} (${rule.why}) blocks the list Save${rule.invalid ? '; its ' + rule.invalid + ' input is aria-invalid' : ''}`, async (t) => {
        const p = await openUmbrellaPage(t, { sdk, ...start() })
        const v = await openRow(p, list.row)
        const at = await addFilled(p, v, rule.entry)
        const save = listSave(p, v)
        assert.ok(save, 'a list Save while a draft exists')
        assert.equal(save.props.disabled, true, 'blocked')
        await press(p, save)
        assert.equal(p.host(list.row).mutations.length, 0, 'nothing written')
        if (rule.invalid) {
          const inputs = itemInputs(p, v, at)
          assert.equal(String(inputs[rule.invalid === nameField ? 'name' : 'url'].props['aria-invalid']), 'true', rule.invalid + ' marked invalid: ' + show(inputs[rule.invalid === nameField ? 'name' : 'url'].props))
        }
      })
    }
    for (const rule of list.accepted) {
      row(sdk, 'PG-LS-DT-01', rule.label, `${L}: a new item ${show(rule.entry)} (${rule.why}) is accepted: Save writes it`, async (t) => {
        const p = await openUmbrellaPage(t, { sdk, ...start() })
        const v = await openRow(p, list.row)
        const at = await addFilled(p, v, rule.entry)
        const inputs = itemInputs(p, v, at)
        for (const input of [inputs.name, inputs.url]) assert.notEqual(String(input.props['aria-invalid']), 'true', 'not marked invalid')
        await press(p, listSave(p, v))
        assert.deepEqual(lastMutation(p, list.row)?.ops, [{ op: PAGE.op.set, path: [L], value: [...list.start, rule.entry] }])
      })
    }
    row(sdk, 'PG-LS-ST-01', 'refused', `${L}: a save the Host refuses shows an error and keeps the draft; the next save lands`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, ...start() })
      const v = await openRow(p, list.row)
      await addFilled(p, v, list.added)
      p.refuseNext(list.row)
      await press(p, listSave(p, v))
      assert.ok(v.alerts().length > 0, 'an error is shown: ' + show(v.text()))
      assert.equal(v.items(L).length, list.start.length + 1, 'the draft is kept')
      assert.equal(itemInputs(p, v, list.start.length).name.props.value, list.added[nameField])
      assert.deepEqual(p.host(list.row).user[L], list.start, 'the Host is unchanged')
      await press(p, listSave(p, v))
      assert.deepEqual(p.host(list.row).user[L], [...list.start, list.added], 'the retry lands')
    })
    row(sdk, 'PG-LS-ST-01', 'stale', `${L}: another editor saved after editing began → the save carries the old revision, is refused, the draft is kept`, async (t) => {
      const p = await openUmbrellaPage(t, { sdk, ...start() })
      const v = await openRow(p, list.row)
      await addFilled(p, v, list.added)
      await p.external(list.row, [{ op: PAGE.op.set, path: [list.otherField], value: list.otherValue }])
      await press(p, listSave(p, v))
      const m = lastMutation(p, list.row)
      assert.equal(m?.expected, PAGE.firstRevision, 'the revision read when editing began')
      assert.notEqual(m.liveRevision, m.expected, 'fixture: the Host moved on')
      assert.ok(v.alerts().length > 0, 'an error is shown')
      assert.equal(v.items(L).length, list.start.length + 1, 'the draft is kept')
    })
  }

  // ============================================================================================
  // PG-MD-*: dedicated model selector (dsh-connector-watchdog)

  const WD_ROW = 'dsh-connector-watchdog'
  const MODEL_FIELD = 'model'
  const choiceVal = (sel) => JSON.stringify([sel.provider, sel.model, sel.reasoningEffort ?? null])

  row(sdk, 'PG-MD-EP-01', 'options', 'model selector defaults to disabled (empty) and lists plain + per-effort catalog models in en and zh', async (t) => {
    for (const lang of [PAGE.lang.en, PAGE.lang.zh]) {
      const { p, v } = await opened(t, sdk, WD_ROW, { lang })
      const select = v.select(MODEL_FIELD)
      assert.ok(select, 'model select rendered')
      assert.equal(select.props.value, '', 'unset by default')
      const opts = v.options(select)
      assert.equal(opts.length, 4, 'disabled + mini + low + high: ' + show(opts.map((o) => textOf(o))))
      assert.equal(opts[0].props.value, '')
      assert.equal(textOf(opts[0]), p.text(PAGE.key.modelDisabled, lang))
      assert.equal(opts[1].props.value, choiceVal(CATALOG.plainSelection))
      assert.equal(textOf(opts[1]), 'Cheap / Mini')
      assert.equal(opts[2].props.value, choiceVal(CATALOG.effortSelection))
      assert.equal(textOf(opts[2]), 'Cheap / Mini Reason · Low')
    }
  })

  row(sdk, 'PG-MD-UC-01', 'pick-plain', 'picking a plain model writes {provider, model} immediately', async (t) => {
    const { p, v } = await opened(t, sdk, WD_ROW)
    await edit(p, v.select(MODEL_FIELD), choiceVal(CATALOG.plainSelection))
    assert.deepEqual(lastMutation(p, WD_ROW)?.ops, [{ op: PAGE.op.set, path: [MODEL_FIELD], value: CATALOG.plainSelection }])
    assert.deepEqual(p.host(WD_ROW).user[MODEL_FIELD], CATALOG.plainSelection)
    assert.equal(v.select(MODEL_FIELD).props.value, choiceVal(CATALOG.plainSelection))
  })

  row(sdk, 'PG-MD-UC-02', 'pick-effort', 'picking a reasoning-effort model writes {provider, model, reasoningEffort} immediately', async (t) => {
    const { p, v } = await opened(t, sdk, WD_ROW)
    await edit(p, v.select(MODEL_FIELD), choiceVal(CATALOG.effortSelection))
    assert.deepEqual(lastMutation(p, WD_ROW)?.ops, [{ op: PAGE.op.set, path: [MODEL_FIELD], value: CATALOG.effortSelection }])
    assert.deepEqual(p.host(WD_ROW).user[MODEL_FIELD], CATALOG.effortSelection)
  })

  row(sdk, 'PG-MD-UC-03', 'clear', 'picking the disabled option unsets model immediately', async (t) => {
    const { p, v } = await opened(t, sdk, WD_ROW, { users: { [WD_ROW]: { [MODEL_FIELD]: CATALOG.plainSelection } } })
    assert.equal(v.select(MODEL_FIELD).props.value, choiceVal(CATALOG.plainSelection))
    await edit(p, v.select(MODEL_FIELD), '')
    assert.deepEqual(lastMutation(p, WD_ROW)?.ops, [{ op: PAGE.op.unset, path: [MODEL_FIELD] }])
    assert.equal(Object.hasOwn(p.host(WD_ROW).user, MODEL_FIELD), false)
    assert.equal(v.select(MODEL_FIELD).props.value, '')
  })

  row(sdk, 'PG-MD-DT-01', 'stale-saved', 'a saved model missing from the catalog stays selected with a readable fallback label and can still be cleared', async (t) => {
    const { p, v } = await opened(t, sdk, WD_ROW, { users: { [WD_ROW]: { [MODEL_FIELD]: CATALOG.staleSelection } } })
    const select = v.select(MODEL_FIELD)
    const staleVal = choiceVal(CATALOG.staleSelection)
    assert.equal(select.props.value, staleVal)
    const staleOpt = v.options(select).find((o) => o.props.value === staleVal)
    assert.ok(staleOpt, 'fallback option kept')
    assert.equal(textOf(staleOpt), 'removed / old-mini · medium')
    await edit(p, select, '')
    assert.deepEqual(lastMutation(p, WD_ROW)?.ops, [{ op: PAGE.op.unset, path: [MODEL_FIELD] }])
  })

  row(sdk, 'PG-MD-ST-01', 'catalog-states', 'missing/failed/empty catalog shows status note without breaking other settings; refused save shows alert', async (t) => {
    for (const [label, remoteSession, key] of [
      ['absent remote.session', null, PAGE.key.modelFailed],
      ['rejected modelCatalog', { modelCatalog: async () => { throw new Error('boom') } }, PAGE.key.modelFailed],
      ['empty catalog', { modelCatalog: async () => ({ ok: true, value: CATALOG.empty }) }, PAGE.key.modelNone],
    ]) {
      const { p, v } = await opened(t, sdk, WD_ROW, { remoteSession })
      assert.ok(v.statuses().some((s) => textOf(s).includes(p.text(key))), label + ': status note shown')
      assert.ok(v.inputs().length > 0, label + ': scalar settings still rendered')
    }
    const { p, v } = await opened(t, sdk, WD_ROW)
    p.refuseNext(WD_ROW)
    await edit(p, v.select(MODEL_FIELD), choiceVal(CATALOG.plainSelection))
    assert.ok(v.alerts().some((a) => textOf(a).includes(p.text(PAGE.key.modelSaveFailed))), 'refused save shows alert')
  })

  // ============================================================================================
  // PG-MF-*: manifests (R5)

  row(sdk, 'PG-MF-01', UMBRELLA.id, `${UMBRELLA.id}'s dsh.client.inject includes ${UMBRELLA.clientInject}`, () => {
    const manifest = JSON.parse(fs.readFileSync(UMBRELLA.manifest, 'utf8'))
    assert.ok(manifest.dsh?.client?.inject?.includes(UMBRELLA.clientInject), show(manifest.dsh?.client))
  })
  for (const m of MANIFESTS) {
    row(sdk, 'PG-MF-02', path.basename(m.dir), `${path.basename(m.dir)} depends on ${show(m.depends)} and bundles ${show(m.bundles)}`, () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(m.dir, 'package.json'), 'utf8'))
      for (const name of m.depends) assert.ok(manifest.dependencies?.[name], name + ' in dependencies: ' + show(manifest.dependencies))
      const bundled = [...(manifest.bundleDependencies ?? []), ...(manifest.bundledDependencies ?? [])]
      for (const name of m.bundles) assert.ok(bundled.includes(name), name + ' bundled: ' + show(bundled))
    })
  }
}

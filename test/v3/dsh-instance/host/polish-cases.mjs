/**
 * UI-POLISH-D rows of the instance's own settings page (constants.mjs PAGE_POLISH; the requirements
 * relayed 2026-11-18 and the developer's note of that day):
 * - UIPD-INST-SECTIONS (EP over the language, en and zh): the h3 headings "Fishball" (above Open
 *   Fishball / Reconnect), "Model for Fishball" and "Launch" (above the enabled switch).
 *   MULTI-2 removes the remote-target override/editor entirely; Open Fishball keeps its icon;
 * - UIPD-INST-RETRY (EP over the instance states the status route answers): Retry
 *   (`data-fishball-instance-retry`) shows only for `failed`, with variant `primary`; the status
 *   tag holds a StateDot before the state words; pressing Retry POSTs retry once;
 * - UIPD-INST-SYNC (state transition + decision): Check lists each missing provider ticked, with
 *   DSH's Checkbox whose label is the name in `<strong>`; unticking one and pressing Add posts
 *   exactly the ticked ids; unticking all disables Add.
 *
 * Level: integration (page.mjs): the real client scripts, the real routes, a scripted service.
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { PAGE_POLISH as P } from './constants.mjs'
import { openInstancePage } from './page.mjs'

const headings = (page) => page.find((n) => n.tag === 'h3').map((n) => page.text(n))
const primitive = (node) => String(node.props[P.primitiveAttr] ?? '')
/** The element child of a Button's `icon` prop rendered by the fake primitive (its export name). */
const hasIcon = (button) => button.children?.some?.((c) => typeof c !== 'string' && primitive(c).startsWith(P.iconPrefix))
const statusTag = (page) => page.byAttr(P.attr.state)[0]

export function registerInstancePolishCases(sdk) {
  // ---------------------------------------------------------------- sections and the remote target (EP over the language)
  for (const lang of P.langs) {
    caseTest(sdk, P.id.sections, lang, `headings ${P.headings[lang].join(' / ')} remain; MULTI-2 removes remote target editor entirely; Open Fishball has an icon`, async (t) => {
      const page = await openInstancePage(t, sdk, { lang })
      await page.until(() => headings(page).length >= P.headings[lang].length)
      assert.deepEqual(headings(page), [...P.headings[lang]])
      // MULTI-2 removes the host override, not just its enabled state or submission handler.
      assert.deepEqual(page.byAttr(P.attr.target), [], 'instance still exposes removed remote target editor')
      assert.deepEqual(page.find((n) => n.props['aria-label'] === P.targetLabel[lang]), [], 'remote override is still editable under another data hook')
      const order = page.find(() => true)
      const [actionsHeading] = page.find((n) => n.tag === 'h3')
      const [open] = page.byAttr(P.attr.open)
      const [reconnect] = page.byAttr(P.attr.reconnect)
      assert.ok(order.indexOf(actionsHeading) < order.indexOf(open) && order.indexOf(open) < order.indexOf(reconnect), 'Open / Reconnect are not under the Fishball heading')
      assert.ok(page.text(open).includes(P.openWords[lang]))
      assert.ok(hasIcon(open), 'Open Fishball has no icon')
    })
  }

  // ---------------------------------------------------------------- Retry only for failed (EP over the state)
  for (const state of P.states) {
    const failed = state === P.failed
    caseTest(sdk, P.id.retry, state, `status ${state} → ${failed ? 'Retry shown, variant primary; pressing it POSTs retry once' : 'no Retry'}; the status tag holds a StateDot`, async (t) => {
      const page = await openInstancePage(t, sdk, { state, code: failed ? 'NATIVE_CHILD_EXITED' : null })
      await page.until(() => statusTag(page)?.props[P.attr.state] === state)
      assert.ok(page.find((n) => primitive(n) === P.stateDot, [statusTag(page)]).length > 0, 'no StateDot in the status line')
      const retry = page.byAttr(P.attr.retry)
      assert.equal(retry.length, failed ? 1 : 0, 'Retry buttons')
      if (!failed) return
      assert.equal(retry[0].props[P.variantAttr], P.primary, 'Retry is not variant primary')
      assert.equal(page.text(retry[0]), P.retryWords.en)
      await page.press(retry[0])
      assert.ok(await page.until(() => page.world.calls.retry === 1), 'Retry did not reach the route')
      assert.equal(page.world.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/retry')).length, 1)
    })
  }

  // ---------------------------------------------------------------- model sync: Checkbox and Add
  const listed = async (t) => {
    const page = await openInstancePage(t, sdk)
    const [check] = await page.until(() => { const c = page.byAttr(P.attr.check); return c.length && !c[0].props.disabled ? c : null })
    assert.ok(check, 'Check is not enabled while ready')
    await page.press(check)
    assert.ok(await page.until(() => page.byAttr(P.attr.entry).length === P.check.missing.length), 'the missing providers are not listed')
    const boxOf = (id) => page.find((n) => n.tag === 'input' && n.props.type === 'checkbox', page.byAttr(P.attr.entry, id))[0]
    return { page, boxOf }
  }
  caseTest(sdk, P.id.sync, 'listed', 'Check → each missing provider is a DSH Checkbox, ticked, labelled with its name in <strong>', async (t) => {
    const { page, boxOf } = await listed(t)
    for (const entry of P.check.missing) {
      const [row] = page.byAttr(P.attr.entry, entry.id)
      const [box] = page.find((n) => primitive(n) === P.checkbox, [row])
      assert.ok(box, 'no Checkbox in ' + entry.id)
      assert.equal(page.find((n) => n.tag === 'strong', [box]).map((n) => page.text(n)).join(), entry.name)
      assert.equal(boxOf(entry.id).props.checked, true, entry.id + ' is not ticked')
    }
  })
  caseTest(sdk, P.id.sync, 'untick one', 'untick the second provider → Add posts {checkId, ids} with exactly the first and third', async (t) => {
    const { page, boxOf } = await listed(t)
    const [first, second, third] = P.check.missing.map((e) => e.id)
    await page.toggle(boxOf(second))
    assert.equal(boxOf(second).props.checked, false)
    await page.press(page.byAttr(P.attr.add)[0])
    assert.ok(await page.until(() => page.world.calls.add.length === 1), 'Add did not reach the route')
    assert.deepEqual(page.world.calls.add, [{ checkId: P.check.checkId, ids: [first, third] }])
  })
  caseTest(sdk, P.id.sync, 'untick, tick', 'untick then tick a provider again → Add posts all three ids', async (t) => {
    const { page, boxOf } = await listed(t)
    const [first] = P.check.missing.map((e) => e.id)
    await page.toggle(boxOf(first))
    await page.toggle(boxOf(first))
    await page.press(page.byAttr(P.attr.add)[0])
    assert.ok(await page.until(() => page.world.calls.add.length === 1))
    assert.deepEqual([...page.world.calls.add[0].ids].sort(), P.check.missing.map((e) => e.id).sort())
  })
  caseTest(sdk, P.id.sync, 'none ticked', 'untick every provider → Add is disabled and nothing is posted', async (t) => {
    const { page, boxOf } = await listed(t)
    for (const entry of P.check.missing) await page.toggle(boxOf(entry.id))
    const [add] = page.byAttr(P.attr.add)
    assert.equal(Boolean(add.props.disabled), true, 'Add is enabled with nothing ticked')
    await page.press(add)
    assert.deepEqual(page.world.calls.add, [])
  })
}

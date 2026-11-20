/** Requirements-only black-box U-WIRE. DT: install combinations; EP: availability and
 * V2-only services; BVA: apiVersion immediately below/at/above 1; ST: managed → takeback
 * → unmanaged moved to packages/dsh-connector/tests/marks (DESIGN.md §28). Real Cordis/C-EXT/UI backend, scripted page, K3 child fake, no child launch. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../../test/v3/contract/package-boundaries/cases.mjs'
import { ATTR, BACKEND, EMBED, EXPECT, FIXTURE, HTTP, MATRIX, ROUTE, SLOT, TAG, TEXT, TOOL, WAIT, WIRE } from './constants.mjs'
import { hostWorld, openPage, byTag, withAttr, textIn, press, row, sessionProps } from './subject.mjs'
const wire = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), { timeout: WAIT.testMs }, fn)
const relativeRoutes = () => Object.fromEntries(Object.entries(BACKEND.routes).map(([key, route]) => [key, route[1].slice(ROUTE.absolutePrefix.length)]))
export function registerUWireCases(sdk) {
  for (const r of MATRIX) wire(sdk, 'UIM-DT-01', r.id, 'headless install matrix (Q-U1/Q-D4/Q-G3/Q-N3)', async (t) => {
    const w = await hostWorld(t, sdk, { ui: r.c, tools: r.c, embed: r.u, child: r.i ? {} : null, legacy: r.legacy })
    // C installs dsh-agent-connector, whose browser entry the page then loads too (DESIGN.md §28).
    const page = await openPage(t, w, { embed: r.u, connector: r.c, withoutConfigForms: true })
    assert.deepEqual(w.logs.filter((l) => l.type === WIRE.error && !l.text.includes(WIRE.missingPrefix)), [], 'loader error')
    assert.equal(w.errors().length, Number(r.u && !r.c))
    assert.equal(w.warns().length, Number(r.u && r.c && !r.i))
    assert.equal(page.live().filter((e) => e.slot === SLOT.fish && e.id === SLOT.fishId).length, Number(r.u && r.c))
    assert.equal(w.names().includes(w.publicName(TOOL.notify)), r.u && r.c, 'tools/list notify ownership')
    if (!r.u) { assert.deepEqual(page.embedDrawn(), []); return }
    const answer = await w.request('GET', ROUTE.services)
    assert.equal(answer.status, HTTP.ok)
    assert.deepEqual(Object.keys(answer.json).sort(), [...ROUTE.servicesKeys].sort())
    assert.deepEqual([answer.json.connector, answer.json.page], [r.c, r.i])
    assert.deepEqual(answer.json.ui, r.c ? relativeRoutes() : {})
    assert.deepEqual(answer.json.routes, Object.fromEntries(ROUTE.routeKeys.map((k) => [k, ROUTE[k].slice(ROUTE.absolutePrefix.length)])))
    assert.equal(page.requests.filter((q) => q.path === ROUTE.services).length, EXPECT.once)
    assert.deepEqual(page.requests.filter((q) => WIRE.forbidden.test(q.path)), [])
    assert.equal(page.live().some((e) => e.slot === WIRE.configSlot), false)
    assert.deepEqual(page.errors, [])
    if (!r.c) { assert.deepEqual(page.live(), []); assert.deepEqual(page.chunks, []); return }
    assert.deepEqual(page.chunkOwners.filter((c) => c.owner === EMBED.moduleId).map((c) => c.file).sort(), [...EMBED.chunks].sort())
    const view = await page.mount(SLOT.main, {}, (e) => e.options.key === SLOT.mainKey)
    if (r.i) {
      assert.ok(await page.waitFor(() => byTag(view.tree(), TAG.iframe).length === EXPECT.once))
      assert.equal(byTag(view.tree(), TAG.iframe)[0].props.src, w.child.admissions.at(-1).url)
    } else {
      assert.equal(withAttr(view.tree(), ATTR.noInstance).length, EXPECT.once)
      assert.ok(textIn(view.tree()).includes(TEXT.hint))
    }
    assert.deepEqual(byTag(view.tree(), TAG.button).filter((n) => WIRE.settings.test(textIn(n) + (n.props[ATTR.ariaLabel] ?? ''))), [], 'embed window header settings button')
  })
  for (const apiVersion of WIRE.versions) wire(sdk, 'UWIRE-BVA-01', apiVersion, 'only apiVersion 1 is a usable UI backend', async (t) => {
    const w = await hostWorld(t, sdk, { uiApiVersion: apiVersion, child: null })
    const answer = await w.request('GET', ROUTE.services)
    assert.equal(answer.json.connector, apiVersion === WIRE.usableVersion)
    assert.equal(Object.hasOwn(answer.json, WIRE.legacyKey), false)
  })
  // HAND-UC-02 main 3 (Take back through the real route) moved to packages/dsh-connector/tests/marks (DESIGN.md §28).
  test.todo(caseName(sdk, 'UIM-DT-01', 'C-WIRE', 'full real connector row supplies dshConnectorUi (C-WIRE; stand-in used above)'))
}

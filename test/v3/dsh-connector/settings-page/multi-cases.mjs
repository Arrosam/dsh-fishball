/** MULTI-2 settings boundary: nonblank DSH display names are text, never HTML or tool names. */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { findAll } from '../../../support/rp-recommend.mjs'
import { worldFor } from '../tokens/world.mjs'
import { CLIENT, POLISH, SUBJECT } from './constants.mjs'
import { input, openTokensPage } from './page.mjs'
import { pageModule } from './subject.mjs'
import { MULTI as M } from '../wire/multi-constants.mjs'

export function registerMultiSettingsCases(sdk) {
  for (const data of M.nameRows.filter((row) => row.value && !row.hostname)) {
    caseTest(sdk, M.id, `settings EP/BVA ${data.id}`, 'name editor preserves a nonblank configured base verbatim and treats markup as text', async (t) => {
      const world = await worldFor(t, sdk)
      const mod = await pageModule(sdk)
      const routes = mod[SUBJECT.routes]({ tokens: world.registry, logger: world.logger })
      const page = await openTokensPage(t, { sdk, world, routes })
      const view = await page.open()
      const field = () => {
        const nodes = findAll([view.one(POLISH.attr.setting, M.refName)], (node) => node.props[CLIENT.primitiveAttr] === 'Input')
        assert.equal(nodes.length, 1, 'name setting must contain exactly one native Input')
        return nodes[0]
      }
      input(field(), data.value)
      await page.settle()
      const edited = field()
      edited.props.onBlur?.({ target: { value: data.value }, currentTarget: { value: data.value }, preventDefault() {}, stopPropagation() {} })
      await page.settle()
      const edits = page.mutations.flatMap((m) => m.ops).filter((op) => op.path?.join('.') === M.refName)
      assert.equal(edits.at(-1)?.value, data.value, 'settings editor trims/sanitizes/truncates nonblank configured DSH name')
      assert.equal(field().props.value, data.value, 'editor lost raw display-name text')
      assert.deepEqual(findAll(view.tree(), (node) => node.props.dangerouslySetInnerHTML !== undefined), [], 'name was rendered as HTML')
      assert.deepEqual(page.errors, [])
      assert.ok(page.required.every((name) => CLIENT.requires.includes(name)), 'settings added a cross-side dependency')
    })
  }
}

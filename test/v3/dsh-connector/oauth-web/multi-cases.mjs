/** MULTI-2: approval displays the resolved bare base as escaped text, not MCP's suffixed identity. */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { decode } from './browser.mjs'
import { open } from './cases.mjs'
import { webWorld } from './subject.mjs'
import { MULTI as M } from '../wire/multi-constants.mjs'

export function registerMultiApprovalCases(sdk) {
  for (const data of M.nameRows.filter((row) => row.value && !row.hostname)) {
    caseTest(sdk, M.id, `approval EP ${data.id}`, 'resolved DSH base renders verbatim as text without extra MCP suffix or executable markup', async (t) => {
      const w = await webWorld(t, sdk, { dshName: () => data.value })
      const flow = await open(w)
      assert.ok(decode(flow.page.body).includes(data.value), 'approval page lost or normalized the resolved base')
      assert.ok(!decode(flow.page.body).includes(data.value + M.suffix), 'approval page appended the discovery suffix')
      assert.doesNotMatch(flow.page.body, /<script\b|<img\b[^>]*onerror\s*=/i, 'configured DSH name became executable HTML')
    })
  }
  caseTest(sdk, M.id, 'approval ST live base', 'the same approval handler reads a changed resolved base on the next request', async (t) => {
    let base = M.hostname
    const w = await webWorld(t, sdk, { dshName: () => base })
    assert.ok(decode((await open(w)).page.body).includes(base))
    base = M.renamed
    assert.ok(decode((await open(w)).page.body).includes(base), 'approval handler cached the old base')
  })
}

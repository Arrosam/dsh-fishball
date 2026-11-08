/**
 * W0 MCP-S1 / MCP-S2 / MCP-S3, requirements-only, pinned to design/instance-ext 15d6f1f.
 * Human main/alternative/exception flows are defined FIRST in the companion use-case design.
 *
 * No reviewed callable spike/report interface exists yet. Do not invent imports, exports or tool
 * names, read product implementation, start DSH/a listener, or assert authored behavior mocks.
 * Each real TODO states its owner, concrete input and observable acceptance. S1/S2 require evidence
 * on BOTH 0.2.1-rc.5 and 0.2.2-rc.1 before S3 can freeze identifiers and shapes.
 */
import { describe, it } from 'node:test'
import { MCP_W0_CASES, todoTitle } from './mcp-w0-cases.spec.mjs'

for (const task of ['MCP-S1', 'MCP-S2', 'MCP-S3']) {
  describe(`${task} requirements acceptance (not yet executable spike evidence)`, () => {
    for (const testCase of MCP_W0_CASES[task]) it.todo(todoTitle(testCase))
  })
}

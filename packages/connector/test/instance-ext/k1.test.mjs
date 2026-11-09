/**
 * W0 / K1 — shared MCP semantic profile, minimal push event/ack and optional attention fixtures.
 * Requirements: design/instance-ext 15d6f1f214144db3575f9bc0ba15238b1450c2a7, §§3/5.1/6,
 * connector-mcp-option §§4.1–8 and DESIGN's 2026-11-09 amendment.
 * Human use cases FIRST: docs/test-design/instance-ext-w0-mcp-use-cases.md.
 *
 * No new shared profile/schema/validator location is frozen, and the old contract export must
 * not be required to survive MCP-SERVER removal. The meaningful unreadMax/payload fixtures are
 * retained as actionable shared acceptance TODOs, not old-control loader assertions. We assert
 * no contract major/minor, tool identifier, envelope, attach API, manifest version or export survival.
 *
 * These are real owner-named TODOs: S3 has not frozen an MCP tool/schema/validator
 * interface or error mapping. Runtime unread projection/removal are MCP-SERVER's W1 work. Never
 * revive the old real-DSH boot/custom-wire harness merely to make these tests executable.
 */
import { describe, it } from 'node:test'
import { MCP_W0_CASES, todoTitle } from './mcp-w0-cases.spec.mjs'

// UC inventories stay first. A TODO is not a pass and does not manufacture a missing-feature fail.
describe('K1 MCP shared conformance acceptance and later runtime obligations', () => {
  for (const testCase of MCP_W0_CASES.K1) it.todo(todoTitle(testCase))
})

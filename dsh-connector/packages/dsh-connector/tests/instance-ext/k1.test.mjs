/**
 * W0 / K1 — shared MCP semantic profile, minimal push event/ack and optional attention fixtures.
 * Requirements: design/instance-ext 15d6f1f214144db3575f9bc0ba15238b1450c2a7, §§3/5.1/6,
 * connector-mcp-option §§4.1–8 and DESIGN's 2026-11-09 amendment.
 * Human use cases FIRST: docs/test-design/instance-ext-w0-mcp-use-cases.md.
 *
 * V2 D1–D3 supersedes K1's prior MCP-removal and producer-owned attention proposal.
 * Public contract 1.2/envelope v2 and legacy control-only compatibility remain. The catalog
 * now requires stateless attention.signal and connector-owned unread/page-open reset.
 * These remain owner-named TODOs, not executed conformance or browser evidence.
 * Historical S1/S2/S3 future-task inventories are not V2 acceptance authority.
 */
import { describe, it } from 'node:test'
import { MCP_W0_CASES, todoTitle } from './mcp-w0-cases.spec.mjs'

// UC inventories stay first. A TODO is not a pass and does not manufacture a missing-feature fail.
describe('K1 MCP shared conformance acceptance and later runtime obligations', () => {
  for (const testCase of MCP_W0_CASES.K1) it.todo(todoTitle(testCase))
})

import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
export const OWN = Object.freeze({
  core: path.join(REPO, 'packages/core'),
  packages: Object.freeze(['core', 'board', 'shared']),
  source: /\.(?:[cm]?js|tsx?|vue)$/,
  dsh: /^(?:dsh-agent-connector|dsh-connector(?:-ui|-adapter|-shared)?|dsh-instance)(?:\/|$)/,
  imports: /(?:\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g,
  v2: /^(?:src\/slim\/|src\/persona\.js$)/,
  contract: 'dsh-connector/contract',
  vendor: 'vendor', generator: 'scripts/vendor-mcp-schema.mjs',
  origin: 'http://127.0.0.1:43210',
  targets: Object.freeze(['http://127.0.0.1:43210', 'http://localhost:43210', 'http://[::1]:43210', 'https://example.test']),
  ids: Object.freeze(['', 'a', 'a'.repeat(64), 'a'.repeat(65), 'a.b', 'a b', null, 1]),
  names: Object.freeze([' A   B ', 'A\t\nB', 'é', 'e\u0301', 'a\u0000b', '', '   ']),
  events: Object.freeze(['contributed:example.ready', 'contributed:fishball.ready', 'contributed:Example.ready', 'contributed:example', `contributed:${'a'.repeat(126)}.b`, `contributed:${'a'.repeat(127)}.b`, 'contributed:example.ready.', null]),
  tools: Object.freeze(['example.ready', 'unknown_tool']),
  withheld: Object.freeze(['inbox_poll', 'inbox_ack', 'pair', 'set_name']),
  send: Object.freeze({ session_message: 'session.message', session_redirect: 'session.redirect' }),
  fixture: Object.freeze({ id: 'own-schema', eventId: 'own-event', payload: {}, schema: { type: 'object', properties: {} } }),
  unknown: /unknown type/i,
  missingRuntime: /Cannot find (?:package|module)|ERR_MODULE_NOT_FOUND|runtime package.*(?:missing|resolve)|not installed/i,
  method: 'GET', ok: 200,
  /** Where the published `approval_answer` input schema carries the approval words (its `answer` object). */
  approvalSchema: Object.freeze({ answer: 'answer', decision: 'decision', risk: 'risk' }),
})

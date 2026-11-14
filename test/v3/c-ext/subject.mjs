/**
 * The one place that binds the cases to C-EXT's module (`packages/connector/src/contrib/index.js`).
 * K2 freezes the contributor-facing service only; the connector-side seam below is C-EXT's, as
 * relayed by Fishball (2026-11-14), so a case never changes when it is adapted:
 *
 * - `createContributions({mailbox, router, sessionExists, onToolsChanged, logger, now})`:
 *   - `mailbox`: K1 `Mailbox` (`commit`, `retire`, …), C-MAILBOX's;
 *   - `router`: K1 `Router.recipientFor(subject)`, C-ROUTE's (R-EXT-17, R-EVS-03);
 *   - `sessionExists(sessionId)`: whether a session of this DSH exists (TQ-14);
 *   - `onToolsChanged()`: called when the tool table changes; the endpoint (C-HTTP) turns it into
 *     `notifications/tools/list_changed`;
 *   - `logger`: `{info, warn}`; here a cordis logger, so the world's exporter sees every line;
 *   - `now()`: the injected clock, in epoch milliseconds (the emit token bucket, EXT-BVA-03);
 * - it returns `{service, provide(ctx), list(), call(publicName, args, {principal, signal})}`:
 *   - `provide(ctx)` provides `fishballConnectorTools` (K2 `TOOLS_API.service`) on the connector
 *     row's context, so the service goes when that row unloads;
 *   - `list()`: the contributed tools as MCP `Tool` objects, in `tools/list` order (R-EXT-12);
 *   - `call(…)`: a K1 `CallToolResult` (R-CON-02, R-EXT-07), or `undefined` for an unknown tool
 *     (the endpoint answers that with JSON-RPC -32602); `principal` is `{key, name}` and
 *     `signal.reason` is one of `cancelled`, `disconnected`, `revoked` (K2 ABORT_REASON).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'

/** C-EXT's module bound to `sdk` (its `@deepseek-ai/*` imports resolve to that SDK). */
export async function contributionsModule(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (C-EXT "Owns" packages/connector/src/contrib/)`)
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  assert.equal(typeof mod[SUBJECT.factory], 'function', `the contrib module exports no ${SUBJECT.factory}`)
  return mod
}

/** Starts the registry and provides the service in the connector row's `ctx`; the cases see `{list, call}`. */
export function startContributions(mod, ctx, ports) {
  const contributions = mod[SUBJECT.factory](ports)
  contributions.provide(ctx)
  return {
    list: () => contributions.list(),
    /** `{result}` for a CallToolResult, `{unknown: true}` for an unknown tool. */
    async call(principal, name, args, signal) {
      const result = await contributions.call(name, args, { principal, signal })
      return result === undefined ? { unknown: true } : { result }
    },
  }
}

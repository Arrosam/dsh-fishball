/**
 * The one place that binds the F-ASKCARD cases to the module (`packages/core/src/asks/index.js`).
 * Its seam, as the task states it (and its relayed clarification of 2026-11-16):
 *
 *   openAskCards(ctx, {defineDomain, domainTable}) → Promise<{table, close}>
 *       opens the cards' dsh-storage-domain table, as core's `openLedger` does;
 *   createAsks({link, table, logger?}) → {service, tool, close}
 *       link     {onPoll(fn) → dispose, callTool(name, args) → Promise<structuredContent>}
 *       service  K3 `fishballInstance.ui.asks`: list(), onChange(fn) → dispose, answer(approvalId, {choice, text?})
 *       tool     the DSH tool `ask_user`: execute({offer_id}) → {ok: true, card} | {ok: false, code}
 *       close()  stops following the link; createAsks takes no clock;
 *   registerAskRoutes(ctx, {service, managerSessionId}) → dispose
 *       `managerSessionId` is a function `() => string | undefined`; it registers through
 *       `ctx.connection.fetch.register(route) → dispose` only, and its disposer withdraws the
 *       routes and closes open streams (no ctx.effect);
 *   ASKS (incl. `tool`, `defaultReason`), CARD_STATE.
 *
 * The module is imported bound to the current DSH (fishball-test-helpers/bind), so its `@deepseek-ai/*` imports resolve there.
 * No file of the module is read; only its exports are used.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { importBound } from 'fishball-test-helpers/bind'
import { SUBJECT } from './constants.mjs'

/** The module's entry bound to the current DSH; a missing entry fails the case that needs it, with a reason. */
export async function asksModule() {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(SUBJECT.packageDir, SUBJECT.entry)} does not exist (F-ASKCARD "Owns" packages/core/src/asks/)`)
  return importBound(SUBJECT.entry)
}

/** One named export of the module (`key` of SUBJECT.exports), or a failure naming it. */
export function exported(mod, key) {
  const name = SUBJECT.exports[key]
  assert.notEqual(mod[name], undefined, `packages/core/src/asks/index.js exports no ${name}`)
  return mod[name]
}

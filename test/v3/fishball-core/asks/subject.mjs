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
 * The module is imported bound to the SDK under test, so its `@deepseek-ai/*` imports resolve there.
 * No file of the module is read; only its exports are used.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { linkContractForSourceRun } from '../../../support/contract-link.mjs'
import { INSTANCE, REPO } from '../../../support/constants.mjs'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'

/** The module's entry bound to `sdk`; a missing entry fails the case that needs it, with a reason. */
export async function asksModule(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(REPO, SUBJECT.entry)} does not exist (F-ASKCARD "Owns" packages/core/src/asks/)`)
  linkContractForSourceRun()
  return importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
}

/**
 * The module as it was before F-FIX (SUBJECT.legacy.ref), used only to WRITE a card record in the
 * old shape (no `arguments`, `argumentsStatus` or `reason`), which the current module then reads.
 * Its import closure (SUBJECT.legacy.files, none of `@deepseek-ai/*`) is exported from git into a
 * temp folder with the same layout and imported from there; the folder is removed after the test.
 */
export async function legacyAsksModule(t) {
  const tmp = fs.realpathSync(os.tmpdir())
  const dir = fs.mkdtempSync(path.join(tmp, SUBJECT.legacy.tempPrefix))
  t.after(() => {
    assert.ok(path.dirname(dir) === tmp && path.basename(dir).startsWith(SUBJECT.legacy.tempPrefix), 'refusing to remove ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  for (const file of SUBJECT.legacy.files) {
    const text = execFileSync('git', ['show', `${SUBJECT.legacy.ref}:${file}`], { cwd: REPO, encoding: 'utf8' })
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  fs.writeFileSync(path.join(dir, SUBJECT.legacy.manifest), JSON.stringify({ type: 'module', private: true }))
  return import(pathToFileURL(path.join(dir, SUBJECT.legacy.entry)).href)
}

/** One named export of the module (`key` of SUBJECT.exports), or a failure naming it. */
export function exported(mod, key) {
  const name = SUBJECT.exports[key]
  assert.notEqual(mod[name], undefined, `packages/core/src/asks/index.js exports no ${name}`)
  return mod[name]
}

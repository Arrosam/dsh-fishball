/**
 * The one place that binds the C-TOKENS-REVEAL cases to the module (`packages/dsh-connector/src/tokens/index.js`).
 * The surface is the one the dev session relayed (2026-11-16), and nothing else of the module is read:
 *
 *   createTokenRegistry({ctx, logger, settings, restoreTokens}) → registry
 *     ctx            a cordis context with `storageDomain` (and `credentials`, which it never uses);
 *     logger         `{warn, info}` (a cordis logger: the world's exporter sees every line);
 *     settings       the K1d SettingsWriter (world.mjs's fake resolves after the registry's sync);
 *     restoreTokens  called after a refused save with the previous list (never awaits the echo).
 *   registry.apply(tokens, reason) → {ok: true} | {ok: false, code: 'token-duplicate', labels}
 *   registry.create(label) / createHosted() → {entryKey, label, value}, the value once
 *   registry.match / get / list / onRevoked   K1 TokenRegistry; entries are K1d TokenEntry
 *   registry.notice() → {code, labels} | undefined;  registry.close()
 *   findDuplicates(tokens) → string[][];  generateTokenValue() → a fresh value;  SYNC_REASON {start, settings}
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE, REPO } from 'dsh-connector-test-helpers/legacy'
import { importInstance } from 'dsh-connector-test-helpers/sdk'
import { resolveRuntimePackages } from '../pairs/subject.mjs'
import { SUBJECT } from './constants.mjs'

const modules = new Map()
/**
 * The module bound to `sdk`: the per-SDK resolve hook makes every `@deepseek-ai/*` (and `zod`)
 * import inside it the installed SDK's own copy, so "[SDK x]" runs the module on that SDK.
 */
export function tokensModule(sdk) {
  if (!modules.has(sdk)) {
    modules.set(sdk, (async () => {
      assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(REPO, SUBJECT.entry)} does not exist (C-TOKENS-REVEAL "Owns" packages/dsh-connector/src/tokens/)`)
      resolveRuntimePackages()
      const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
      for (const name of [SUBJECT.factory, SUBJECT.findDuplicates, SUBJECT.generate]) assert.equal(typeof mod[name], 'function', `the tokens module exports no ${name}()`)
      assert.ok(mod[SUBJECT.syncReason]?.start && mod[SUBJECT.syncReason]?.settings, `the tokens module exports no ${SUBJECT.syncReason} {start, settings}`)
      return mod
    })())
  }
  return modules.get(sdk)
}

const reasons = new Map()
/** `SYNC_REASON` of `sdk`'s module (loaded by makeSubject before any sync runs). */
export const syncReason = (sdk) => reasons.get(sdk)

/** Builds the registry over one world's dependencies. */
export async function makeSubject(sdk, deps) {
  const mod = await tokensModule(sdk)
  reasons.set(sdk, mod[SUBJECT.syncReason])
  const registry = await mod[SUBJECT.factory](deps)
  for (const member of SUBJECT.members) assert.equal(typeof registry?.[member], 'function', `the token registry has no ${member}()`)
  return registry
}

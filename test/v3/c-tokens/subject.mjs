/**
 * The one place that binds the cases to C-TOKENS's module (`packages/connector/src/tokens/index.js`).
 *
 * K1 freezes what the module answers (`TokenRegistry`: `match`, `get`, `list`, `onRevoked`) but not
 * how it is built or fed the native settings; C-WIRE later mounts it in the connector row and owns
 * the settings schema. Until then this seam names the smallest shape the requirements need, so a
 * case never changes when the real names land (the dev session adapts this file only):
 *
 *   <factory>({ctx, logger}) → registry (or a promise of one)
 *     ctx      a cordis context with `ctx.credentials` (dsh-credentials-local) and DSH storage
 *              (dsh-storage-domain over dsh-storage-json), where the module records which values
 *              it generated (design §5.3);
 *     logger   a cordis logger of that context; the world's exporter sees every line it writes.
 *   registry.apply(tokens, reason?) → Promise<{ok: true} | {ok: false, code, …}>
 *     the `settings/document-updated` of the connector's `tokens` list (design §5.1, §5.2):
 *     `tokens` is `[{label, enabled, ref}]`, the whole list. A refused save (`SETTINGS_REFUSAL`)
 *     keeps the previous list. Deleting an entry is a list without it. With no `reason` it is the
 *     user's settings save; `reason` SUBJECT.startReason is the connector's start, which feeds
 *     the stored list without being a save (Q5 = B, the user, 2026-11-14: only a save generates
 *     a value for an entry whose value was unset).
 *   registry.refresh() → Promise
 *     a credential change (`credentials/reference-updated`): re-reads every value of the list.
 *   registry.match / get / list / onRevoked   K1 `TokenRegistry`, unchanged.
 *   registry.close?()   optional: stops listening to the credential store.
 *
 * `<factory>` is the one function export whose name matches SUBJECT.factoryName.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE, REPO } from '../../support/constants.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'

/**
 * The module's factory, bound to `sdk`: the per-SDK resolve hook makes every `@deepseek-ai/*`
 * import inside it (e.g. dsh-credentials' `credentialRef`) the installed SDK's own copy, so
 * "[SDK x]" runs the module on that SDK.
 */
async function factory(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(REPO, SUBJECT.entry)} does not exist (C-TOKENS "Owns" packages/connector/src/tokens/)`)
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  const named = Object.entries(mod).filter(([name, value]) => typeof value === 'function' && SUBJECT.factoryName.test(name))
  assert.equal(named.length, 1, `expected one factory export matching ${SUBJECT.factoryName}, found: ${Object.keys(mod).join(', ')}`)
  return named[0][1]
}

/** Builds the registry over one world. */
export async function makeSubject(sdk, world) {
  const create = await factory(sdk)
  const registry = await create({ ctx: world.ctx, logger: world.logger })
  for (const member of ['apply', 'refresh', 'match', 'get', 'list', 'onRevoked']) {
    assert.equal(typeof registry?.[member], 'function', `the token registry has no ${member}()`)
  }
  return registry
}

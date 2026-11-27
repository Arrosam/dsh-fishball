/**
 * Fixture for the added HARNESS rows (added-cases.mjs), not a suite file: a minimal wire test file
 * that the row runs under plain `node --test`, without --test-force-exit. It boots one world through
 * world.mjs, as every wire file does, and then must leave no worker, IPC pipe or timer alive, so the
 * process exits by itself.
 * - mode ok: a normal boot; the row is active.
 * - mode fail: the row's config is refused by its schema, so the row never provides its services, and
 *   world.mjs's guard fails the boot after the worker started. That failure must stop the worker.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { scenario } from 'dsh-connector-test-helpers/connector-world/world'
import { SURFACE } from 'dsh-connector-test-helpers/connector-world/constants'
import { OP } from 'dsh-connector-test-helpers/connector-world/steps-constants'
import { ADDED, EXIT } from './added-constants.mjs'

const sdk = process.env[EXIT.sdkEnv]
const mode = process.env[EXIT.modeEnv]

test(`wire exit fixture (${mode}) [SDK ${sdk}]`, async () => {
  if (mode === EXIT.mode.ok) {
    const w = await scenario(sdk, ADDED.scenario.exitOk)
    assert.equal((await w.call(OP.row)).active, true)
    return
  }
  const refused = () => ({ [SURFACE.settings.approval]: { [SURFACE.settings.port]: EXIT.refusedPort } })
  await assert.rejects(scenario(sdk, ADDED.scenario.exitFail, { rowConfig: refused }), EXIT.guardFailure)
})

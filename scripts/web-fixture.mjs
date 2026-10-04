import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPlugin } from '../src/index.mjs';
import { record, validateConfig, BootstrapError } from '../src/config.mjs';

export const name = 'bubbles-m1-local-fixture';
export const inject = ['sessions', 'approval', 'webServer', 'connection', 'agents'];
const root = fileURLToPath(new URL('../.runtime/', import.meta.url));
const statePath = `${root}dsh-web-evidence/state.json`;
const privatePath = `${root}dsh-web-private/access.json`;
export const Config = { '~standard': { version: 1, vendor: 'bubbles-fixture', validate(input) {
  try {
    record(input, ['generation', 'databasePath'], 'CONFIG_INVALID');
    if (!Number.isSafeInteger(input.generation) || input.generation < 1 || input.generation > 100) throw new BootstrapError('CONFIG_INVALID');
    validateConfig({ databasePath: input.databasePath });
    return { value: input };
  } catch { return { issues: [{ message: 'CONFIG_INVALID' }] }; }
} } };
function writeState(state) {
  mkdirSync(`${root}dsh-web-evidence`, { recursive: true });
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2) + '\n');
  renameSync(`${statePath}.tmp`, statePath);
}
export async function apply(ctx, config) {
  const state = { loads: 0, unloads: 0, inferenceAttempts: 0 };
  try {
    const previous = JSON.parse(readFileSync(statePath, 'utf8'));
    for (const key of Object.keys(state)) {
      if (Number.isSafeInteger(previous[key]) && previous[key] >= 0) state[key] = previous[key];
    }
  } catch { /* only allowlisted counters survive observer reload */ }
  // This observer and identity are local test code, never an RPC/operator API.
  const fiber = ctx.plugin(createPlugin({ identity: () => ({ ownerId: 'synthetic-web-owner', workspaceId: 'synthetic-web-workspace' }) }),
    { databasePath: config.databasePath });
  await fiber;
  // Public ad-hoc lookup intentionally borrows a reference for disposal tests;
  // this observer owns the child fiber and never publishes that reference.
  const service = ctx.get('bubbles');
  const input = { taskId: 'web-fixture-task', provider: 'synthetic', source: 'web-fixture', eventId: 'web-fixture-event' };
  const intake = service.intake(input);
  const duplicate = service.intake(input);
  state.loads++;
  Object.assign(state, { generation: config.generation, pid: process.pid, phase: 'active',
    deduplicated: duplicate.deduplicated, firstDeduplicated: intake.deduplicated, entries: service.listTasks().length,
    sessions: ctx.sessions.list().length, hostSupported: service.diagnostics().supported,
    target: service.diagnostics().target, loopback: ctx.webServer.host === '127.0.0.1', port: ctx.webServer.port,
    permissionBridge: 'deny-all', identity: 'trusted synthetic local fixture only', operator: 'unavailable' });
  mkdirSync(`${root}dsh-web-private`, { recursive: true, mode: 0o700 });
  writeFileSync(privatePath, JSON.stringify({ url: ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`) }), { mode: 0o600 });
  writeState(state);
  ctx.on('agent/request', () => {
    state.inferenceAttempts++;
    writeState(state);
    throw new BootstrapError('FIXTURE_INFERENCE_DISABLED');
  });
  ctx.effect(() => async () => {
    const pending = fiber.dispose();
    try { service.intake(input); state.staleReference = 'unsafe'; }
    catch (error) { state.staleReference = error.code === 'SERVICE_DISPOSED' ? 'disposed' : 'unexpected'; }
    await pending;
    state.unloads++;
    state.phase = 'disposed';
    writeState(state);
    try { unlinkSync(privatePath); } catch { /* ephemeral access already removed */ }
  }, 'bubbles.fixture-observer');
}

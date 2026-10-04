import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import plugin, { createPlugin, probeHost } from '../src/index.mjs';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';

// Review scope: import only exact project-local official public libraries. This is not the DSH
// app launcher and does not load profiles, settings, credentials or providers.
const packages = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const { Context } = await import(pathToFileURL(`${packages}/cordis/lib/index.js`).href);
const { default: SessionStore } = await import(pathToFileURL(`${packages}/dsh-session/lib/index.js`).href);
const { default: ApprovalService } = await import(pathToFileURL(`${packages}/dsh-user-approval/lib/index.js`).href);
const temporary = mkdtempSync(join(tmpdir(), 'df-host-smoke-'));
const ctx = new Context();
// Suppress host stack logging in negative fixtures; assertions still observe
// exact stable codes. No untrusted input/exception is sent to a log sink.
ctx.logger.exporters?.clear?.();
try {
  await ctx.plugin(SessionStore);
  await ctx.plugin(ApprovalService, { policy: 'never' });
  const report = probeHost(ctx);
  assert.equal(report.supported, true);
  const baselinePlugins = ctx.registry.size;
  assert.equal(ctx.sessions.list().length, 0);

  // Actual public approval execution, with a synthetic session and no model.
  const permissionFiber = ctx.inject(['sessions', 'approval'], async fixtureCtx => {
    const session = fixtureCtx.sessions.create('synthetic-permission-session');
    session.append('turn/start', { turn: 1 });
    const outcome = await fixtureCtx.approval.request({ agent: { session }, toolName: 'synthetic-fixture' });
    assert.equal(outcome, 'rejected');
    session.append('turn/end', { turn: 1 });
  });
  await permissionFiber;
  await permissionFiber.dispose();
  assert.equal(ctx.sessions.list().length, 0);

  // Config failure cannot create a ledger and never echoes sentinel text.
  const badPath = join(temporary, 'must-not-exist.sqlite');
  const invalid = ctx.plugin(plugin, { databasePath: badPath, secret_SENTINEL: 'synthetic-secret' });
  await assert.rejects(Promise.resolve(invalid), error => {
    assert.equal(error.message.includes('synthetic-secret'), false);
    assert.equal(error.message.includes('secret_SENTINEL'), false);
    return /CONFIG_INVALID/.test(error.message);
  });
  await invalid.dispose();
  assert.equal(existsSync(badPath), false);

  // Default native identity is absent; JSON cannot authenticate an intake.
  const native = ctx.plugin(plugin, { databasePath: join(temporary, 'native.sqlite') });
  await native;
  assert.throws(() => ctx.df.intake({ taskId: 'spoof', provider: 'fixture', source: 'source', eventId: 'event', verified: true }), { code: 'IDENTITY_UNAVAILABLE' });
  const nativeReference = ctx.df;
  await native.dispose();
  assert.throws(() => nativeReference.diagnostics(), { code: 'SERVICE_DISPOSED' });

  const databasePath = join(temporary, 'reload.sqlite');
  const identityInput = { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' };
  const trustedFixture = createPlugin({ identity: () => identityInput });
  for (let cycle = 0; cycle <= 10; cycle++) {
    const fiber = ctx.plugin(trustedFixture, { databasePath });
    await fiber;
    const service = ctx.df;
    identityInput.workspaceId = 'mutated-after-load';
    const input = { taskId: `task-${cycle}`, provider: 'fixture', source: 'synthetic-source', eventId: `event-${cycle}` };
    service.intake(input);
    service.intake(input);
    assert.equal(service.listTasks().length, cycle + 1, 'one entry for the duplicate input');
    identityInput.workspaceId = 'synthetic-workspace';
    assert.ok(service.getTask(input.taskId));
    assert.throws(() => service.intake({ ...input, scope: { ownerId: 'other', workspaceId: 'other' } }), { code: 'INPUT_INVALID' });
    assert.throws(() => service.intake(new Proxy(input, { getPrototypeOf() { throw new Error('SYNTHETIC_PROXY_SECRET'); } })), {
      code: 'INPUT_INVALID', message: 'INPUT_INVALID',
    });
    assert.equal(typeof service.grant, 'undefined');
    assert.equal(typeof service.foundation, 'undefined');
    assert.equal(ctx.sessions.list().length, 0, 'no worker sessions created');
    const unloading = fiber.dispose();
    // Do not await cleanup: admission closes at Cordis's synchronous unload
    // state change, even while its disposer promises have not run yet.
    for (const method of Object.values(service)) assert.throws(() => method(), { code: 'SERVICE_DISPOSED' });
    await unloading;
    assert.equal(ctx.df, undefined);
    assert.equal(ctx.registry.size, baselinePlugins, 'no plugin registrations leak');
    for (const method of Object.values(service)) assert.throws(() => method(), { code: 'SERVICE_DISPOSED' });
  }

  // Removal of a required public service unloads dependents; reappearance
  // triggers a fresh capability/config check and a fresh service instance.
  const requiredContext = new Context();
  try {
    const pendingPath = join(temporary, 'pending.sqlite');
    const pending = requiredContext.plugin(trustedFixture, { databasePath: pendingPath });
    await pending;
    assert.equal(requiredContext.df, undefined);
    assert.equal(existsSync(pendingPath), false, 'both required services missing');
    const sessions = requiredContext.plugin(SessionStore);
    await sessions;
    await pending;
    assert.equal(requiredContext.df, undefined);
    assert.equal(existsSync(join(temporary, 'pending.sqlite')), false);
    const approval = requiredContext.plugin(ApprovalService, { policy: 'never' });
    await approval;
    await pending;
    const old = requiredContext.df;
    assert.ok(old);
    const removingApproval = approval.dispose();
    assert.throws(() => old.listTasks(), { code: 'SERVICE_DISPOSED' });
    await removingApproval;
    assert.equal(requiredContext.df, undefined);
    assert.throws(() => old.listTasks(), { code: 'SERVICE_DISPOSED' });
    const replacement = requiredContext.plugin(ApprovalService, { policy: 'never' });
    await replacement;
    await pending;
    assert.ok(requiredContext.df);
    assert.notEqual(requiredContext.df, old);
    const beforeSessionRemoval = requiredContext.df;
    const removingSessions = sessions.dispose();
    assert.throws(() => beforeSessionRemoval.listTasks(), { code: 'SERVICE_DISPOSED' });
    await removingSessions;
    assert.equal(requiredContext.df, undefined);
    await pending.dispose();
    await replacement.dispose();
  } finally { await requiredContext.fiber.dispose(); }
  console.log(JSON.stringify({ result: 'passed', reloads: 10, loads: 11, entries: 11,
    permissionOutcome: 'rejected', inferenceCalls: 0, profileAccess: false,
    probe: report }));
} finally {
  await ctx.fiber.dispose();
  rmSync(temporary, { recursive: true, force: true });
}

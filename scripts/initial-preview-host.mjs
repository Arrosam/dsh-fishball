import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const name = 'df-initial-preview-host';
export const inject = ['appReady', 'agentPresets', 'connection', 'webServer', 'profileContext', 'clientModules', 'llm', 'dfSetup'];
const requireFact = value => { if (!value) throw new Error('INITIAL_PREVIEW_NOT_READY'); };

export async function apply(ctx, config) {
  const release = await ctx.agentPresets.register({ id: 'df-initial-preview-read-only', name: 'DF Read Only', plugins: [] });
  requireFact(typeof release === 'function');
  ctx.effect(() => release, 'df.initial-preview.preset');
  let alive = true;
  ctx.effect(() => () => { alive = false; }, 'df.initial-preview.lifetime');
  // The original CLI commits appReady after its Loader tree settles. Catalogue
  // reads occur here, never inside the row's own activation/Loader wait.
  const cancel = ctx.appReady.onReady(() => { void ready().catch(() => {
    try { writeFileSync(config.readyPath, JSON.stringify({ ok: false, code: 'INITIAL_PREVIEW_NOT_READY', launchId: config.launchId, pid: process.pid, host: '127.0.0.1', port: 3091 }) + '\n', { flag: 'wx', mode: 0o600 }); } catch {}
  }); });
  ctx.effect(() => cancel, 'df.initial-preview.app-ready');
  async function ready() {
    requireFact(alive && ctx.fiber.state === 2 && ctx.fiber.uid !== null);
    requireFact(ctx.profileContext.name === 'df-initial-preview' && realpathSync(ctx.profileContext.dir) === config.profile);
    requireFact(ctx.webServer.host === '127.0.0.1' && ctx.webServer.port === 3091);
    requireFact(typeof ctx.connection.rpc.handle === 'function');
    const clientPath = ctx.clientModules.clientPath('dsh-fishball');
    requireFact(clientPath && realpathSync(clientPath) === join(config.packageRoot, 'lib/client.js'));
    requireFact(createHash('sha256').update(readFileSync(clientPath)).digest('hex') === config.clientDigest);
    const preset = await ctx.agentPresets.resolve('df-initial-preview-read-only');
    requireFact(preset.id === 'df-initial-preview-read-only' && !preset.broken);
    const models = await ctx.llm.listModels('df-testing-local');
    requireFact(models.some(model => model.provider === 'df-testing-local' && model.id === 'df-testing-worker-v1'));
    const setup = ctx.dfSetup.diagnostics();
    requireFact(setup.storage.location === config.databasePath && ['setup_required', 'ready'].includes(setup.phase));
    requireFact(alive && ctx.fiber.state === 2 && ctx.fiber.uid !== null);
    const identity = { ok: true, launchId: config.launchId, pid: process.pid, host: '127.0.0.1', port: 3091, profile: ctx.profileContext.name, package: config.packageVersion, clientDigest: config.clientDigest, preset: preset.id, provider: 'df-testing-local', model: 'df-testing-worker-v1', setupPhase: setup.phase, databasePath: config.databasePath };
    writeFileSync(config.accessPath, JSON.stringify({ ...identity, authenticatedUrl: ctx.connection.authenticatedUrl('http://127.0.0.1:3091') }) + '\n', { flag: 'wx', mode: 0o600 });
    writeFileSync(config.readyPath, JSON.stringify(identity) + '\n', { flag: 'wx', mode: 0o600 });
  }
}
export default Object.freeze({ name, inject, apply });

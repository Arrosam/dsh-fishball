import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { EnvironmentRegistry } from '../src/environment.mjs';
import { probeWorkerHost } from '../src/native-adapter.mjs';
import { runtimePaths, runtimeFiles, checkPrivateFile, verifyRuntimeFixtureHost } from './runtime-web.mjs';
const d = value => createHash('sha256').update(value).digest('hex');
export const fixtureTokenCount = text => text.split(/\s+/u).filter(Boolean).length;
export const name = 'df-runtime-local-fixture';
export const inject = ['sessions', 'approval', 'connection', 'agents', 'llm', 'tools', 'webServer'];
export async function apply(ctx) {
  const provenance = verifyRuntimeFixtureHost();
  if (ctx.llm.listProviders().length !== 0) throw new Error('FIXTURE_MODEL_ROUTE_UNAVAILABLE');
  const state = { loads: 0, unloads: 0, inferenceAttempts: 0, recipientAttempts: 0, toolAttempts: 0, cleanupCalls: 0 };
  try { const old = JSON.parse(readFileSync(runtimeFiles.state, 'utf8')); for (const key of Object.keys(state)) if (Number.isSafeInteger(old[key]) && old[key] >= 0) state[key] = old[key]; } catch {}
  const write = () => {
    mkdirSync(runtimePaths.evidence, { recursive: true, mode: 0o700 });
    writeFileSync(`${runtimeFiles.state}.tmp`, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); renameSync(`${runtimeFiles.state}.tmp`, runtimeFiles.state);
  };
  checkPrivateFile(runtimeFiles.key, 32); const key = readFileSync(runtimeFiles.key);
  // Fail closed on any attempted native inference or tool dispatch. No model
  // or provider catalog is fabricated and no agent is created by this fixture.
  ctx.on('agent/request', () => { state.inferenceAttempts++; write(); throw new Error('FIXTURE_INFERENCE_DISABLED'); });
  ctx.tools.guard(() => { state.toolAttempts++; write(); return 'FIXTURE_TOOLS_DISABLED'; });
  const environment = { environmentRef: d('runtime-fixture-environment'), workspaceRef: d('synthetic-runtime-workspace'), bindingDigest: d('runtime-fixture-binding'), toolsDigest: d('runtime-fixture-empty-tools'), permissionPolicyDigest: d('runtime-fixture-deny-permission'), root: runtimePaths.workspace, cwd: runtimePaths.workspace, provider: 'unconfigured-synthetic-provider', model: 'unconfigured-synthetic-model', reasoningEffort: 'unconfigured', modelRef: d('unconfigured-model'), reasoningRef: d('unconfigured-reasoning'), presetRef: d('unconfigured-preset') };
  const denyRecipient = async () => { state.recipientAttempts++; write(); throw new Error('FIXTURE_RECIPIENT_DISABLED'); };
  const plugin = createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-runtime-owner', workspaceId: 'synthetic-runtime-workspace' }), encryptionKey: () => key, hostPermission: () => false,
    memory: { namespaceRef: d('runtime-fixture-memory'), tokenize: fixtureTokenCount, byteLimit: 16384, tokenLimit: 8192 },
    worker: { environments: new EnvironmentRegistry({ entries: [environment], currentState: () => d('runtime-fixture-state') }), permission: () => false, toolGuard: ({ schemas }) => schemas.length === 0 },
    previewResolver: async () => { throw new Error('PREVIEW_UNAVAILABLE'); }, previewTtlMs: 1000,
    reviewerInstaller: () => () => { state.cleanupCalls++; }, automationInstaller: () => () => { state.cleanupCalls++; },
    results: { recipientAdapter: { send: denyRecipient, query: denyRecipient, open: denyRecipient } },
    notifications: { policyRef: d('runtime-fixture-notifications'), recipientRef: d('runtime-fixture-recipient'), channelRef: d('runtime-fixture-channel'), mergeKeyRef: d('runtime-fixture-merge') },
  });
  const fiber = ctx.plugin(plugin, { databasePath: runtimeFiles.database });
  try { await fiber; } finally { key.fill(0); }
  const service = ctx.get('df'), diagnostic = service.diagnostics(); probeWorkerHost(ctx);
  state.loads++;
  Object.assign(state, { phase: 'active', pid: process.pid, target: diagnostic.target, hostSupported: diagnostic.supported, runtimeExport: 'src/runtime-plugin.mjs:createRuntimePlugin', schemaVersion: diagnostic.schemaVersion, provenance, modelProviders: ctx.llm.listProviders().length, capabilities: diagnostic.capabilities,
    loopback: ctx.webServer.host === '127.0.0.1', port: ctx.webServer.port, sessions: ctx.sessions.list().length,
    policy: 'default-deny', modelReadiness: 'unavailable; no provider/catalog configured', previewMeaning: 'unavailable; no concrete action resolver', credentialBacking: 'synthetic public provider; native BrowserAuth unchanged' });
  mkdirSync(runtimePaths.private, { recursive: true, mode: 0o700 });
  writeFileSync(runtimeFiles.access, JSON.stringify({ url: ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`) }), { mode: 0o600 }); chmodSync(runtimeFiles.access, 0o600);
  write();
  ctx.effect(() => async () => {
    const pending = fiber.dispose();
    try { service.diagnostics(); state.staleReference = 'unsafe'; } catch (error) { state.staleReference = error.code === 'SERVICE_DISPOSED' ? 'disposed' : 'unexpected'; }
    try { await pending; } catch { state.phase = 'cleanup_failed'; write(); throw new Error('FIXTURE_RUNTIME_CLEANUP_FAILED'); }
    state.unloads++; state.phase = 'disposed';
    try { state.sessions = ctx.sessions.list().length; state.sessionObservation = 'queried-at-disposal'; } catch { state.sessionObservation = 'host-session-service-already-disposed'; }
    write();
    try { unlinkSync(runtimeFiles.access); } catch {}
  }, 'df.runtime-fixture-observer');
}

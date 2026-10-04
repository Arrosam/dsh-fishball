import { pathToFileURL } from 'node:url';
import { Config, validateConfig } from './config.mjs';
import { requireHost, resolveHostSource } from './host-probe.mjs';
import { createRuntimePlugin } from './runtime-plugin.mjs';
import { SETUP_BOUNDS, SetupError, SetupState } from './setup-state.mjs';
import { record } from './config.mjs';
import { types } from 'node:util';
const { HostConnectionService } = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-client-connection')).href);
const codes = new Set(['SETUP_REQUIRED', 'SETUP_RECOVERY_REQUIRED', 'SETUP_UNAVAILABLE', 'SETUP_PREVIEW_STALE', 'SETUP_CONFIRMATION_REQUIRED', 'SETUP_INVALID_INPUT', 'REQUEST_ABORTED', 'OPERATOR_REQUIRED', 'SERVICE_DISPOSED']);
const rejected = code => ({ ok: false, error: { code, message: code, details: {} } });
export const name = 'dsh-fishball-installed';
export { Config };
export const inject = Object.freeze(['connection', 'sessions', 'approval', 'webServer', 'profileContext']);
export async function apply(ctx, input) {
  const config = validateConfig(input); requireHost(ctx);
  if (!(ctx.connection instanceof HostConnectionService)) throw new SetupError('SETUP_UNAVAILABLE');
  const peer = ctx.connection.operator;
  if (!peer || !ctx.profileContext) throw new SetupError('SETUP_UNAVAILABLE');
  let active = true, child, childShutdown;
  const alive = () => active && [1, 2].includes(ctx.fiber.state) && ctx.fiber.uid !== null && ctx.connection instanceof HostConnectionService && ctx.connection.operator === peer;
  const admitted = () => alive() && ctx.fiber.state === 2;
  const state = new SetupState({ databasePath: config.databasePath, limits: config.limits,
    profile: { dir: ctx.profileContext.dir, name: ctx.profileContext.name }, isAlive: alive,
    currentProfile: () => ({ dir: ctx.profileContext.dir, name: ctx.profileContext.name }),
    activate: async ({ identity, encryptionKey }) => {
      if (!alive()) throw new SetupError('SERVICE_DISPOSED');
      const current = ctx.plugin(createRuntimePlugin({ identity: () => identity, encryptionKey: () => encryptionKey, hostPermission: () => false }), config); child = current;
      try { await current; if (!alive()) throw new SetupError('SERVICE_DISPOSED'); current.ctx.df.diagnostics(); }
      catch { await current.dispose(); if (child === current) child = undefined; throw new SetupError(alive() ? 'SETUP_RECOVERY_REQUIRED' : 'SERVICE_DISPOSED'); }
      return () => { if (child === current) child = undefined; return current.dispose(); };
    },
  });
  let unregister;
  // The published synchronous own-fiber status event starts child disposal
  // before Cordis's deferred cleanup. This makes the unchanged child's own
  // live-fiber admission fence effective at this parent's explicit closure.
  ctx.on('internal/status', changed => {
    if (changed !== ctx.fiber || alive()) return;
    active = false; unregister?.(); const current = child; child = undefined;
    childShutdown = Promise.resolve(current?.dispose()).catch(() => { throw new SetupError('SETUP_UNAVAILABLE'); });
    childShutdown.catch(() => {});
  });
  ctx.effect(() => async () => { active = false; unregister?.(); await state.dispose(); await childShutdown; }, 'df.installed.setup');
  unregister = ctx.connection.rpc.handle('/df-setup', async (endpoint, payload, signal, admittedPeer) => {
    if (!admitted()) return rejected('SERVICE_DISPOSED');
    if (admittedPeer !== peer) return rejected('OPERATOR_REQUIRED');
    if (signal?.aborted) return rejected('REQUEST_ABORTED');
    try {
      if (!['v1/status', 'v1/prepare', 'v1/confirm'].includes(endpoint)) return rejected('ENDPOINT_NOT_FOUND');
      record(payload, endpoint === 'v1/confirm' ? ['previewRef', 'planDigest', 'accept'] : [], 'SETUP_INVALID_INPUT');
      if (Buffer.byteLength(JSON.stringify(payload)) > SETUP_BOUNDS.inputBytes) throw new SetupError('SETUP_INVALID_INPUT');
      const value = endpoint === 'v1/status' ? state.status(payload) : endpoint === 'v1/prepare' ? state.prepare(payload) : await state.confirm(payload, { signal });
      return { ok: true, value };
    } catch (error) { const field = error && !types.isProxy(error) && Object.getOwnPropertyDescriptor(error, 'code'); return rejected(field && Object.hasOwn(field, 'value') && codes.has(field.value) ? field.value : 'SETUP_UNAVAILABLE'); }
  });
  if (typeof unregister !== 'function') throw new SetupError('SETUP_UNAVAILABLE');
  ctx.provide('dfSetup', Object.freeze({ diagnostics() { return state.status({}); } }));
  await state.resume();
}
export default Object.freeze({ name, inject, Config, apply });

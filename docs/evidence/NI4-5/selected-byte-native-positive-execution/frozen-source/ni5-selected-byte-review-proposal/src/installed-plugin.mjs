import { pathToFileURL } from 'node:url';
import { Config, validateInstalledConfig } from './installed-config.mjs';
import { MEMORY_ACCOUNTING, prepareInstalledMemory } from './installed-memory.mjs';
import { createInstalledAudit } from './installed-audit.mjs';
import { createInstalledWorker } from './installed-worker.mjs';
import { createInstalledEvents } from './installed-events.mjs';
import { createInstalledResults } from './installed-results.mjs';
import { canonicalDigest } from './runtime-security.mjs';
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
  const installed = validateInstalledConfig(input);
  const { memory, worker, audit, automation, results, ...base } = installed, config = Object.freeze(base); requireHost(ctx);
  const bindMemory = memory.enabled ? await prepareInstalledMemory(memory) : undefined;
  if (![1, 2].includes(ctx.fiber.state) || ctx.fiber.uid === null) throw new SetupError('SERVICE_DISPOSED');
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
      const options = { identity: () => identity, encryptionKey: () => encryptionKey, hostPermission: () => false,
        ...(automation.enabled ? createInstalledEvents({ selection: automation, identity, profile: { dir: ctx.profileContext.dir, name: ctx.profileContext.name } }) : {}),
        ...(results.enabled ? createInstalledResults({ selection: results, identity, profile: { dir: ctx.profileContext.dir, name: ctx.profileContext.name } }) : {}),
        ...createInstalledWorker({ selection: worker, auditSelection: audit, identity, profile: { dir: ctx.profileContext.dir, name: ctx.profileContext.name } }),
        ...createInstalledAudit({selection:audit,worker,identity,profile:{dir:ctx.profileContext.dir,name:ctx.profileContext.name}}), installedAuditSelection:audit, installedWorkerSelection:worker,
        ...(bindMemory ? { memory: bindMemory(identity, { dir: ctx.profileContext.dir, name: ctx.profileContext.name }) } : {}) };
      const current = ctx.plugin(createRuntimePlugin(options), config); child = current;
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
      if (!['v1/status', 'v1/prepare', 'v1/confirm', 'v1/features', 'v1/workerStatus','v1/auditStatus'].includes(endpoint)) return rejected('ENDPOINT_NOT_FOUND');
      record(payload, endpoint === 'v1/confirm' ? ['previewRef', 'planDigest', 'accept'] : [], 'SETUP_INVALID_INPUT');
      if (Buffer.byteLength(JSON.stringify(payload)) > SETUP_BOUNDS.inputBytes) throw new SetupError('SETUP_INVALID_INPUT');
      let value;
      if(endpoint==='v1/auditStatus'){
        value=Object.freeze({enabled:audit.enabled,ready:false,reason:audit.enabled?'setup_required':null,bounds:audit.enabled?{inputByteLimit:audit.inputByteLimit,resultByteLimit:audit.resultByteLimit,maxPrivateReviewers:audit.maxPrivateReviewers,maxRepairRounds:audit.maxRepairRounds}:null});
        if(state.status({}).phase==='ready'&&child?.state===2&&child.uid!==null){try{value=child.ctx.df.diagnostics().installedAuditStatus;}catch{value=Object.freeze({...value,ready:false,reason:audit.enabled?'unavailable':null});}}
      } else if (endpoint === 'v1/workerStatus') {
        value = worker.enabled ? Object.freeze({ enabled: true, phase: 'setup_required', reasonCode: 'SETUP_REQUIRED',
          configurationRef: canonicalDigest(['df.installed-worker-config/v1', worker]), policyVersion: null, selection: worker.selection, environment: worker.environment,
          persistence: Object.freeze({ ...worker.persistence, encrypted: false }), bounds: worker.bounds,
          accounting: null, pricing: 'unknown', actionsEnabled: false }) : Object.freeze({ enabled: false, phase: 'disabled', reasonCode: null,
          configurationRef: null, policyVersion: null, selection: null, environment: null, persistence: null,
          bounds: null, accounting: null, pricing: 'unknown', actionsEnabled: false });
        if (worker.enabled && state.status({}).phase === 'ready' && child?.state === 2 && child.uid !== null) {
          try { value = child.ctx.df.diagnostics().installedWorkerStatus; }
          catch { value = Object.freeze({ ...value, phase: 'unavailable', reasonCode: 'WORKER_SOURCE_UNAVAILABLE' }); }
        }
      } else if (endpoint === 'v1/features') {
        let ready = false;
        if (memory.enabled && state.status({}).phase === 'ready' && child?.state === 2 && child.uid !== null) {
          try { ready = child.ctx.df.diagnostics().capabilities.memory === true; } catch { /* Closed/unavailable child is never ready. */ }
        }
        let capabilities = {};
        if (state.status({}).phase === 'ready' && child?.state === 2 && child.uid !== null) { try { capabilities = child.ctx.df.diagnostics().capabilities; } catch {} }
        value = Object.freeze({ automation: Object.freeze({ enabled: automation.enabled, ready: automation.enabled && capabilities.automation === true, automaticStart: false,
            choices: Object.freeze([...(automation.ownerIngress ?? []).map(item => Object.freeze({ key: item.key, kind: 'owner', route: item.route })), ...(automation.schedules ?? []).map(item => Object.freeze({ key: item.key, kind: 'schedule', route: item.route }))]) }),
          results: Object.freeze({ enabled: results.enabled, ready: results.enabled && capabilities.delivery === true, route: results.enabled ? 'local_dsh' : null, requires: results.enabled ? Object.freeze(['worker', 'audit']) : Object.freeze([]), notificationsEnabled: results.enabled && results.notifications.enabled, opening: 'unknown' }),
          memory: Object.freeze({ enabled: memory.enabled, ready, continuityReady: memory.enabled && capabilities.memoryContinuity === true,
          accounting: memory.enabled ? MEMORY_ACCOUNTING : null,
          bounds: memory.enabled ? Object.freeze({ byteLimit: memory.byteLimit, tokenLimit: memory.tokenLimit }) : null }) });
      } else value = endpoint === 'v1/status' ? state.status(payload) : endpoint === 'v1/prepare' ? state.prepare(payload) : await state.confirm(payload, { signal });
      return { ok: true, value };
    } catch (error) { const field = error && !types.isProxy(error) && Object.getOwnPropertyDescriptor(error, 'code'); return rejected(field && Object.hasOwn(field, 'value') && codes.has(field.value) ? field.value : 'SETUP_UNAVAILABLE'); }
  });
  if (typeof unregister !== 'function') throw new SetupError('SETUP_UNAVAILABLE');
  ctx.provide('dfSetup', Object.freeze({ diagnostics() { return state.status({}); } }));
  await state.resume();
}
export default Object.freeze({ name, inject, Config, apply });

import { Foundation } from './foundation.mjs';
import { BootstrapError, Config, record, validateConfig } from './config.mjs';
import { requireHost } from './host-probe.mjs';

export { Config, validateConfig } from './config.mjs';
export { probeHost } from './host-probe.mjs';
export const name = 'dsh-fishball';
export const inject = Object.freeze(['sessions', 'approval']);

const argumentKeys = Object.freeze({
  intake: ['taskId', 'provider', 'source', 'eventId'],
  transition: ['expectedVersion', 'status', 'reason'],
  deleteTask: ['expectedVersion'],
  requestAction: ['actionId', 'kind', 'targetDigest', 'dataDigest', 'limits', 'expectedVersion'],
  claim: ['expectedVersion'], cancel: ['expectedVersion'],
  settle: ['claimId', 'outcome', 'evidenceDigest'],
});

// Dependency injection is a trusted, same-process host integration seam. It is
// not configuration and never accepts scope or authority from operation input.
// Default native loading has no identity bridge and denies all task operations.
export function createPlugin({ identity } = {}) {
  if (identity !== undefined && typeof identity !== 'function') throw new BootstrapError('IDENTITY_ADAPTER_INVALID');
  function apply(ctx, input) {
    const config = validateConfig(input);
    const host = requireHost(ctx);
    if (ctx.reflect.get('df') !== undefined) throw new BootstrapError('SERVICE_ALREADY_REGISTERED');
    let boundScope;
    if (identity) {
      try {
        const value = identity();
        record(value, ['ownerId', 'workspaceId'], 'IDENTITY_UNAVAILABLE');
        for (const key of ['ownerId', 'workspaceId']) {
          if (typeof value[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value[key])) throw new BootstrapError('IDENTITY_UNAVAILABLE');
        }
        boundScope = Object.freeze({ ownerId: value.ownerId, workspaceId: value.workspaceId });
      } catch { throw new BootstrapError('IDENTITY_UNAVAILABLE'); }
    }
    ctx.effect(function* () {
      const foundation = new Foundation({ databasePath: config.databasePath, limits: config.limits,
        hostPermission: () => false, trustedOperators: [] });
      let active = true;
      const alive = () => {
        // Cordis flips public state before its asynchronous disposer queue runs.
        // Closing the captured API at that point covers unload-vs-intake races.
        if (!active || ctx.fiber.state !== 2 || ctx.fiber.uid === null) throw new BootstrapError('SERVICE_DISPOSED');
      };
      const scope = () => {
        alive();
        if (!boundScope) throw new BootstrapError('IDENTITY_UNAVAILABLE');
        return boundScope;
      };
      // Register cleanup before publication so startup failures close storage.
      // This cleanup is synchronous: held references stop admitting immediately.
      yield () => { active = false; foundation.close(); };
      const service = {
        diagnostics() { alive(); return host; },
        intake(input) { return foundation.intake(scope(), record(input, argumentKeys.intake, 'INPUT_INVALID')); },
        getTask(taskId) { return foundation.getTask(scope(), taskId); },
        listTasks() { return foundation.listTasks(scope()); },
        exportTask(taskId) { return foundation.exportTask(scope(), taskId); },
        deleteTask() { alive(); throw new BootstrapError('OPERATOR_UNAVAILABLE'); },
      };
      for (const method of ['transition', 'requestAction', 'cancel']) {
        service[method] = (taskId, input) => foundation[method](scope(), taskId, record(input, argumentKeys[method], 'INPUT_INVALID'));
      }
      for (const method of ['claim', 'settle']) {
        service[method] = (taskId, actionId, input) => foundation[method](scope(), taskId, actionId, record(input, argumentKeys[method], 'INPUT_INVALID'));
      }
      // No grant/revoke/operator mint, tool, event ingress, timer, worker,
      // provider, model, transport, or raw Foundation handle is published.
      ctx.provide('df', Object.freeze(service));
      // Unwind this first, before asynchronous service unregistration waits
      // for dependents: a borrowed service reference loses admission at once.
      yield () => { active = false; };
    }, 'df.lifecycle');
  }
  return Object.freeze({ name, inject, Config, apply });
}

const plugin = createPlugin();
export const apply = plugin.apply;
export default plugin;

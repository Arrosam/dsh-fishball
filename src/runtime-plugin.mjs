import { pathToFileURL } from 'node:url';
import { BootstrapError, Config, record, validateConfig } from './config.mjs';
import { DSH_WEB_RUNTIME_ROOT, requireHost } from './host-probe.mjs';
import { RuntimeStore, reference } from './runtime-store.mjs';
import { Coordinator } from './coordinator.mjs';
import { installOperatorBridge } from './operator-bridge.mjs';

const { HostConnectionService } = await import(pathToFileURL(
  `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`).href);

// These callbacks belong to trusted host composition. Cordis configuration and
// RPC JSON never contain the key, raw identity or authority-bearing handles.
export function createRuntimePlugin({ identity, encryptionKey, hostPermission = () => false,
  runtimeLimits = {}, forbiddenSecrets = [] } = {}) {
  if (identity !== undefined && typeof identity !== 'function' ||
      encryptionKey !== undefined && typeof encryptionKey !== 'function' || typeof hostPermission !== 'function') {
    throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
  }
  function apply(ctx, input) {
    const config = validateConfig(input), host = requireHost(ctx);
    if (!(ctx.connection instanceof HostConnectionService)) throw new BootstrapError('CONNECTION_UNSUPPORTED');
    if (ctx.reflect.get('bubbles') !== undefined) throw new BootstrapError('SERVICE_ALREADY_REGISTERED');
    if (!identity || !encryptionKey) throw new BootstrapError('RUNTIME_ADAPTER_UNAVAILABLE');
    let scope, key;
    try {
      const value = identity();
      record(value, ['ownerId', 'workspaceId'], 'IDENTITY_UNAVAILABLE');
      for (const field of ['ownerId', 'workspaceId']) reference(value[field]);
      scope = Object.freeze({ ownerId: value.ownerId, workspaceId: value.workspaceId });
      const provided = encryptionKey();
      if (!Buffer.isBuffer(provided) || provided.length !== 32) throw new Error();
      key = Buffer.from(provided);
    } catch { throw new BootstrapError('RUNTIME_ADAPTER_UNAVAILABLE'); }
    ctx.effect(function* () {
      const owner = Object.freeze({}), coordinatorHandle = Object.freeze({}), hostHandle = Object.freeze({});
      let store;
      try {
        store = new RuntimeStore({ databasePath: config.databasePath, encryptionKey: key,
          principals: [{ handle: owner, role: 'owner', scope },
            { handle: coordinatorHandle, role: 'coordinator', scope }, { handle: hostHandle, role: 'host', scope }],
          limits: { ...config.limits, ...runtimeLimits }, hostPermission, forbiddenSecrets });
      } finally { key.fill(0); }
      let active = true, bridge;
      const alive = () => active && ctx.fiber.state === 2 && ctx.fiber.uid !== null;
      yield () => { active = false; bridge?.deactivate(); store.close(); };
      const coordinator = new Coordinator({ store, knownSecrets: forbiddenSecrets });
      const singleRef = value => { record(value, ['taskRef'], 'INPUT_INVALID'); referenceCheck(value.taskRef); return value.taskRef; };
      const operations = {
        intake: value => coordinator.register(owner, value),
        status: value => coordinator.status(owner, singleRef(value)),
        list: value => { record(value, [], 'INPUT_INVALID'); return store.listTasks(owner); },
        revise: value => coordinator.revise(owner, value),
        clarify: value => coordinator.clarify(owner, value),
        answer: value => coordinator.answer(owner, value),
        control: value => store.control(owner, value),
        plan: value => store.planAction(owner, value),
        grant: value => store.grantAction(owner, value),
        revoke: value => store.revokeAction(owner, value),
        policy: value => store.policy(owner, value),
        detail: value => {
          record(value, ['taskRef', 'recordRef', 'expectedTaskVersion', 'expectedAuthEpoch'], 'INPUT_INVALID');
          referenceCheck(value.taskRef); referenceCheck(value.recordRef);
          const before = store.task(owner, value.taskRef);
          if (before.version !== value.expectedTaskVersion || before.authEpoch !== value.expectedAuthEpoch) throw new BootstrapError('STALE_VERSION');
          const data = store.readData(owner, { taskRef: value.taskRef, recordRef: value.recordRef });
          const after = store.task(owner, value.taskRef);
          if (after.version !== before.version || after.authEpoch !== before.authEpoch) throw new BootstrapError('STALE_VERSION');
          return Object.freeze({ task: after, data });
        },
        export: value => store.exportTask(owner, { taskRef: singleRef(value) }),
      };
      bridge = installOperatorBridge({ connection: ctx.connection, operations, isAlive: alive });
      yield () => bridge.dispose();
      // Trusted Cordis consumers see diagnostics only. Neither a worker nor a
      // model-facing tool can borrow an owner command closure from the service.
      ctx.provide('bubbles', Object.freeze({ diagnostics() {
        if (!alive()) throw new BootstrapError('SERVICE_DISPOSED');
        return Object.freeze({ target: host.target, supported: host.supported,
          schemaVersion: store.diagnostics().schemaVersion, channel: '/bubbles-rpc',
          identityBridge: 'connection-operator', permissionBridge: 'trusted-policy-required' });
      } }));
      yield () => { active = false; bridge.deactivate(); };
    }, 'bubbles.runtime.lifecycle');
  }
  return Object.freeze({ name: 'bubbles', inject: Object.freeze(['connection', 'sessions', 'approval']), Config, apply });
}

function referenceCheck(value) {
  if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) throw new BootstrapError('INPUT_INVALID');
}
export const runtimePlugin = createRuntimePlugin();
export default runtimePlugin;

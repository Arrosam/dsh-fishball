import { pathToFileURL } from 'node:url';
import { BootstrapError, Config, record, validateConfig } from './config.mjs';
import { DSH_WEB_RUNTIME_ROOT, requireHost } from './host-probe.mjs';
import { RuntimeStore, reference } from './runtime-store.mjs';
import { Coordinator } from './coordinator.mjs';
import { installOperatorBridge } from './operator-bridge.mjs';
import { ApprovalPreview } from './approval-preview.mjs';
import { MemoryAdapter } from './memory.mjs';
import { ContextAssembler } from './context.mjs';
import { NativeAdapter } from './native-adapter.mjs';
import { WorkerManager } from './worker.mjs';
import { RuntimeAudit } from './audit.mjs';
import { ResultPipeline } from './results.mjs';
import { NotificationService } from './notifications.mjs';
import { EventRouter } from './events.mjs';
import { ScheduleDriver } from './scheduler.mjs';
import { ChatAdapter } from './chat.mjs';

const { HostConnectionService } = await import(pathToFileURL(
  `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`).href);

// These callbacks belong to trusted host composition. Cordis configuration and
// RPC JSON never contain the key, raw identity or authority-bearing handles.
export function createRuntimePlugin({ identity, encryptionKey, hostPermission = () => false,
  runtimeLimits = {}, forbiddenSecrets = [], previewResolver, previewTtlMs,
  memory, worker, reviewerInstaller, results, automationInstaller, notifications } = {}) {
  if (identity !== undefined && typeof identity !== 'function' ||
      encryptionKey !== undefined && typeof encryptionKey !== 'function' || typeof hostPermission !== 'function') {
    throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
  }
  if ((previewResolver === undefined) !== (previewTtlMs === undefined) || previewResolver !== undefined && (typeof previewResolver !== 'function' || !Number.isSafeInteger(previewTtlMs) || previewTtlMs < 1 || previewTtlMs > 60000) || reviewerInstaller !== undefined && typeof reviewerInstaller !== 'function') throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
  if (memory !== undefined) {
    record(memory, ['namespaceRef', 'tokenize', 'byteLimit', 'tokenLimit'], 'RUNTIME_ADAPTER_INVALID');
    referenceCheck(memory.namespaceRef);
    if (typeof memory.tokenize !== 'function' || !Number.isSafeInteger(memory.byteLimit) || memory.byteLimit < 1 || memory.byteLimit > 262144 || !Number.isSafeInteger(memory.tokenLimit) || memory.tokenLimit < 1 || memory.tokenLimit > 131072) throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
    memory = Object.freeze({ ...memory });
  }
  if (worker !== undefined) {
    record(worker, ['environments', 'permission', 'toolGuard', 'resolveSession'], 'RUNTIME_ADAPTER_INVALID');
    if (!worker.environments || typeof worker.permission !== 'function' || typeof worker.toolGuard !== 'function' || worker.resolveSession !== undefined && typeof worker.resolveSession !== 'function') throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
    worker = Object.freeze({ ...worker });
  }
  if (results !== undefined) { record(results, ['recipientAdapter', 'progressPolicy'], 'RUNTIME_ADAPTER_INVALID'); results = Object.freeze({ ...results }); }
  if (automationInstaller !== undefined && typeof automationInstaller !== 'function') throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
  if (notifications !== undefined) {
    record(notifications, ['policyRef', 'recipientRef', 'channelRef', 'mergeKeyRef'], 'RUNTIME_ADAPTER_INVALID');
    if (!results) throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
    for (const field of ['policyRef', 'recipientRef', 'channelRef', 'mergeKeyRef']) referenceCheck(notifications[field]);
    notifications = Object.freeze({ ...notifications });
  }
  function apply(ctx, input) {
    const config = validateConfig(input), host = requireHost(ctx);
    if (!(ctx.connection instanceof HostConnectionService)) throw new BootstrapError('CONNECTION_UNSUPPORTED');
    if (ctx.reflect.get('df') !== undefined) throw new BootstrapError('SERVICE_ALREADY_REGISTERED');
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
      let active = true, bridge, manager, preview, reviewerDisposer, automationDisposer, router, schedules;
      const chats = new Set(), scheduleTokens = new Map();
      const alive = () => active && ctx.fiber.state === 2 && ctx.fiber.uid !== null;
      const assertAlive = () => { if (!alive()) throw new BootstrapError('SERVICE_DISPOSED'); };
      yield async () => {
        active = false; bridge?.deactivate(); preview?.dispose();
        let failed = false;
        try { schedules?.dispose(); } catch { failed = true; }
        scheduleTokens.clear();
        for (const chat of chats) { try { chat.dispose(); } catch { failed = true; } }
        chats.clear();
        try { router?.dispose(); } catch { failed = true; }
        try { await automationDisposer?.(); } catch { failed = true; }
        try { await reviewerDisposer?.(); } catch { failed = true; }
        try { await manager?.close(); } catch { failed = true; }
        try { await bridge?.dispose(); } catch { failed = true; }
        try { store.close(); } catch { failed = true; }
        if (failed) throw new BootstrapError('RUNTIME_CLEANUP_UNAVAILABLE');
      };
      const coordinator = new Coordinator({ store, knownSecrets: forbiddenSecrets });
      const audit = new RuntimeAudit(store);
      const projection = memory && new MemoryAdapter({ ...memory, store, handle: coordinatorHandle,
        contextAssembler: new ContextAssembler({ store, tokenize: memory.tokenize, byteLimit: memory.byteLimit, tokenLimit: memory.tokenLimit, knownSecrets: forbiddenSecrets }), knownSecrets: forbiddenSecrets });
      if (worker) {
        const adapter = new NativeAdapter(ctx, { ...worker, messageAdmission: (message, recipient) => {
          assertAlive(); store.assertMessageCurrent(hostHandle, message); store.assertWorkerOwned(hostHandle, recipient); return true;
        } });
        manager = new WorkerManager({ store, hostHandle, adapter });
      }
      if (previewResolver) preview = new ApprovalPreview({ store, ownerHandle: owner, resolve: previewResolver, ttlMs: previewTtlMs, isAlive: alive, knownSecrets: forbiddenSecrets });
      const pipeline = results && new ResultPipeline(store, { ...results, hostHandle });
      const notifier = notifications && new NotificationService(store, { ...notifications, resultPipeline: pipeline });
      const unavailable = () => { throw new BootstrapError('CAPABILITY_UNAVAILABLE'); };
      if (reviewerInstaller) {
        const reviewer = Object.freeze({});
        // The installation owns this separately admitted identity. None of
        // these closures, handles, observations or reports are owner RPCs.
        try { reviewerDisposer = reviewerInstaller(Object.freeze({
          bind: value => { assertAlive(); record(value, ['taskRef', 'generationRef', 'sessionRef', 'readRecordRefs'], 'INPUT_INVALID'); return store.bindExecution(hostHandle, reviewer, { ...value, role: 'reviewer' }); },
          read: value => { assertAlive(); return store.readData(reviewer, value); },
          audit: value => { assertAlive(); record(value, ['taskRef', 'auditRef'], 'INPUT_INVALID'); return audit.read(reviewer, value.taskRef, value.auditRef); },
          report: value => { assertAlive(); return audit.report(reviewer, value); },
          verify: value => { assertAlive(); return store.verifyArtifact(reviewer, value); },
        })); } catch { throw new BootstrapError('RUNTIME_ADAPTER_INVALID'); }
        if (reviewerDisposer !== undefined && typeof reviewerDisposer !== 'function') throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
      }
      const sourceOperations = {
        configureSource: value => { assertAlive(); return store.configureSource(owner, value); },
        configureSubscription: value => { assertAlive(); return store.configureSubscription(owner, value); },
        source: value => { assertAlive(); return store.source(owner, value); },
        subscription: value => { assertAlive(); return store.subscription(owner, value); },
        listSources: (value = {}) => { assertAlive(); record(value, [], 'INPUT_INVALID'); return store.listSources(owner); },
        listSubscriptions: (value = {}) => { assertAlive(); record(value, [], 'INPUT_INVALID'); return store.listSubscriptions(owner); },
        eventReceipt: value => { assertAlive(); return store.eventReceipt(hostHandle, value); },
        listEventReceipts: value => { assertAlive(); return store.listEventReceipts(hostHandle, value); },
      };
      if (automationInstaller) {
        router = new EventRouter({ store, hostHandle, isAlive: alive, knownSecrets: forbiddenSecrets });
        schedules = new ScheduleDriver({ store, hostHandle, router, isAlive: alive, knownSecrets: forbiddenSecrets });
        const installation = Object.freeze({ ...sourceOperations,
          registerEvent: value => { assertAlive(); return router.register(value); },
          ingestEvent: (token, value) => { assertAlive(); return router.ingest(token, value); },
          registerSchedule: value => { assertAlive(); const token = schedules.register(value); scheduleTokens.set(token, Object.freeze({ sourceRef: value.sourceRef, subscriptionRef: value.subscriptionRef, spec: structuredClone(value.spec), goal: value.goal, externalEffect: value.externalEffect, startAfter: value.startAfter })); return token; },
          tickSchedule: token => { assertAlive(); return schedules.tick(token); },
          statusSchedule: token => { assertAlive(); return schedules.status(token); },
          startSchedule: (token, value) => { assertAlive(); return schedules.start(token, value); },
          stopSchedule: token => { assertAlive(); return schedules.stop(token); },
          createChat: value => {
            assertAlive();
            record(value, ['sourceRef', 'subscriptionRef', 'adapterRef', 'providerRef', 'sourceIdentityRef', 'verify', 'authorize', 'isCurrent', 'normalize', 'maxAttachments', 'maxAttachmentBytes', 'outbound', 'attachmentReader'], 'RUNTIME_ADAPTER_INVALID');
            if (chats.size >= 32) throw new BootstrapError('RUNTIME_ADAPTER_CAPACITY');
            const chat = new ChatAdapter({ ...value, store, hostHandle, router, isAlive: alive, knownSecrets: forbiddenSecrets });
            chats.add(chat);
            return Object.freeze({
              ingest: input => { assertAlive(); return chat.ingest(input); },
              status: input => { assertAlive(); return chat.status(input); },
              control: async input => {
                assertAlive(); const receipt = await chat.control(input); assertAlive();
                const workers = manager && ['pause', 'cancel'].includes(input.kind) ? await manager.cancelAfterControl(receipt.task.taskRef) : [];
                return Object.freeze({ receipt, workers });
              },
              readAttachment: input => { assertAlive(); return chat.readAttachment(input); },
              recipientAdapter: () => { assertAlive(); return chat.recipientAdapter(); },
              dispose: () => { chat.dispose(); chats.delete(chat); },
            });
          },
        });
        try { automationDisposer = automationInstaller(installation); }
        catch { throw new BootstrapError('RUNTIME_ADAPTER_INVALID'); }
        if (automationDisposer !== undefined && typeof automationDisposer !== 'function') throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
      }
      const singleRef = value => { record(value, ['taskRef'], 'INPUT_INVALID'); referenceCheck(value.taskRef); return value.taskRef; };
      const operations = {
        intake: value => coordinator.register(owner, value),
        status: value => coordinator.status(owner, singleRef(value)),
        list: value => { record(value, [], 'INPUT_INVALID'); return store.listTasks(owner); },
        revise: value => coordinator.revise(owner, value),
        complete: value => { record(value, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch'], 'INPUT_INVALID'); return store.revise(owner, { ...value, status: 'completed', reason: 'progress' }); },
        clarify: value => coordinator.clarify(owner, value),
        answer: value => coordinator.answer(owner, value),
        control: async value => {
          const receipt = store.control(owner, value);
          const workers = manager && ['pause', 'cancel'].includes(value.kind) ? await manager.cancelAfterControl(value.taskRef) : [];
          return Object.freeze({ receipt, workers });
        },
        configureSource: value => router ? sourceOperations.configureSource(value) : unavailable(),
        configureSubscription: value => router ? sourceOperations.configureSubscription(value) : unavailable(),
        source: value => router ? sourceOperations.source(value) : unavailable(),
        subscription: value => router ? sourceOperations.subscription(value) : unavailable(),
        listSources: value => router ? sourceOperations.listSources(value) : unavailable(),
        listSubscriptions: value => router ? sourceOperations.listSubscriptions(value) : unavailable(),
        eventReceipt: value => router ? sourceOperations.eventReceipt(value) : unavailable(),
        listEventReceipts: value => router ? sourceOperations.listEventReceipts(value) : unavailable(),
        listSchedulePlans: value => {
          record(value, [], 'INPUT_INVALID'); if (!schedules) return unavailable();
          return Object.freeze([...scheduleTokens].map(([token, registration]) => {
            try { return Object.freeze({ ...schedules.status(token), registration }); }
            catch { return Object.freeze({ sourceRef: registration.sourceRef, subscriptionRef: registration.subscriptionRef, state: 'unavailable' }); }
          }));
        },
        approveSchedule: value => router ? store.approveEventClock(owner, value) : unavailable(),
        configureNotifications: value => notifier ? notifier.configure(owner, value) : unavailable(),
        notificationPolicy: value => { record(value, [], 'INPUT_INVALID'); return notifier ? notifier.policy(owner) : unavailable(); },
        pendingNotifications: value => notifier ? notifier.pending(owner, singleRef(value)) : unavailable(),
        prepareNotification: value => notifier ? notifier.prepare(owner, value) : unavailable(),
        acceptNotification: value => notifier ? notifier.accept(owner, value) : unavailable(),
        dispatchNotification: value => notifier ? notifier.dispatch(owner, value) : unavailable(),
        reconcileNotification: value => { record(value, ['taskRef', 'deliveryRef'], 'INPUT_INVALID'); return notifier ? notifier.reconcile(owner, value.taskRef, value.deliveryRef) : unavailable(); },
        plan: value => store.planAction(owner, value),
        preview: value => preview ? preview.prepare(value) : unavailable(),
        grant: value => preview ? preview.grant(value) : unavailable(),
        revoke: value => store.revokeAction(owner, value),
        policy: value => store.policy(owner, value),
        prepareContext: value => projection ? projection.prepareExecutionContext(value) : unavailable(),
        memoryRead: value => { record(value, [], 'INPUT_INVALID'); return projection ? projection.state() : unavailable(); },
        memoryRemember: value => projection ? projection.remember(value) : unavailable(),
        dispatch: value => manager ? manager.dispatch(owner, value) : unavailable(),
        execute: value => manager ? manager.executeContext(owner, value) : unavailable(),
        query: value => manager ? manager.query(owner, value) : unavailable(),
        sessionLink: value => manager ? manager.sessionLink(owner, value) : unavailable(),
        handoff: value => manager ? manager.handoff(owner, value) : unavailable(),
        captureResult: value => manager ? manager.captureResult(owner, value) : unavailable(),
        writeArtifact: value => {
          record(value, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'artifactRef', 'version', 'content'], 'INPUT_INVALID');
          return store.writeArtifact(owner, value);
        },
        artifact: value => store.artifact(owner, value),
        writeProgress: value => store.writeProgress(owner, value),
        configureAudit: value => audit.configure(owner, value),
        audit: value => { record(value, ['taskRef', 'auditRef'], 'INPUT_INVALID'); return audit.read(owner, value.taskRef, value.auditRef); },
        acceptDelivery: value => pipeline ? pipeline.acceptDelivery(owner, value) : unavailable(),
        dispatchDelivery: value => pipeline ? pipeline.dispatch(owner, value) : unavailable(),
        delivery: value => { record(value, ['taskRef', 'deliveryRef'], 'INPUT_INVALID'); return pipeline ? pipeline.delivery(owner, value.taskRef, value.deliveryRef) : unavailable(); },
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
      // Trusted Cordis consumers see diagnostics only. Neither a worker nor a
      // model-facing tool can borrow an owner command closure from the service.
      ctx.provide('df', Object.freeze({ diagnostics() {
        if (!alive()) throw new BootstrapError('SERVICE_DISPOSED');
        return Object.freeze({ target: host.target, supported: host.supported,
          schemaVersion: store.diagnostics().schemaVersion, channel: '/df-rpc',
          identityBridge: 'connection-operator', permissionBridge: 'trusted-policy-required',
          automationBridge: router ? 'private-installed-adapters' : 'unavailable',
          scheduleBridge: schedules ? 'owner-approved-ingress-only' : 'unavailable',
          chatBridge: router ? 'provider-neutral-contract' : 'unavailable',
          notificationBridge: notifier ? 'explicit-policy-review-grant' : 'unavailable',
          capabilities: Object.freeze({ memory: !!projection, preview: !!preview, worker: !!manager, delivery: !!pipeline, reviewer: !!reviewerInstaller, automation: !!router, notifications: !!notifier }) });
      } }));
      yield () => { active = false; bridge.deactivate(); };
    }, 'df.runtime.lifecycle');
  }
  return Object.freeze({ name: 'dsh-fishball', inject: Object.freeze(['connection', 'sessions', 'approval', ...(worker ? ['agents', 'llm', 'tools'] : [])]), Config, apply });
}

function referenceCheck(value) {
  if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) throw new BootstrapError('INPUT_INVALID');
}
export const runtimePlugin = createRuntimePlugin();
export default runtimePlugin;

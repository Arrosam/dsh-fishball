import { types } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';
import { BootstrapError, Config, record, validateConfig } from '../../src/config.mjs';
import { requireHost, resolveHostSource } from '../../src/host-probe.mjs';
import { RuntimeStore, reference } from '../../src/runtime-store.mjs';
import { Coordinator } from '../../src/coordinator.mjs';
import { installOperatorBridge } from '../../src/operator-bridge.mjs';
import { ApprovalPreview } from '../../src/approval-preview.mjs';
import { MemoryAdapter } from '../../src/memory.mjs';
import { createInstalledMemoryContinuity } from '../../src/installed-memory-continuity.mjs';
import { ContextAssembler } from '../../src/context.mjs';
import { NativeAdapter } from '../../src/native-adapter.mjs';
import { WorkerManager } from '../../src/worker.mjs';
import { RuntimeAudit } from '../../src/audit.mjs';
import { ResultPipeline } from '../../src/results.mjs';
import { NotificationService } from '../../src/notifications.mjs';
import { EventRouter } from '../../src/events.mjs';
import { ScheduleDriver } from '../../src/scheduler.mjs';
import { ChatAdapter } from '../../src/chat.mjs';
import { assertInstalledWorkerInvocation, runInstalledWorkerInvocation } from '../../src/installed-invocation.mjs';
import { workerDigest } from '../../src/environment.mjs';

const { HostConnectionService } = await import(pathToFileURL(
  resolveHostSource('@deepseek-ai/dsh-client-connection')).href);

// These callbacks belong to trusted host composition. Cordis configuration and
// RPC JSON never contain the key, raw identity or authority-bearing handles.
export function createRuntimePlugin({ identity, encryptionKey, hostPermission = () => false,
  runtimeLimits = {}, forbiddenSecrets = [], previewResolver, previewTtlMs,
  memory, worker, installedWorkerInstaller, reviewerInstaller, results, automationInstaller, notifications } = {}) {
  if (identity !== undefined && typeof identity !== 'function' ||
      encryptionKey !== undefined && typeof encryptionKey !== 'function' || typeof hostPermission !== 'function') {
    throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
  }
  if ((previewResolver === undefined) !== (previewTtlMs === undefined) || previewResolver !== undefined && (typeof previewResolver !== 'function' || !Number.isSafeInteger(previewTtlMs) || previewTtlMs < 1 || previewTtlMs > 60000) || reviewerInstaller !== undefined && typeof reviewerInstaller !== 'function') throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
  if (installedWorkerInstaller !== undefined && (typeof installedWorkerInstaller !== 'function' || worker !== undefined || previewResolver !== undefined || previewTtlMs !== undefined || !memory)) throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
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
      let store, installed, installedSealed = false;
      const effectivePermission = value => {
        if (!installedWorkerInstaller) return hostPermission(value);
        if (!installed || installedSealed) return false;
        try { return installed.hostPermission(value) === true; } catch { installedSealed = true; return false; }
      };
      try {
        store = new RuntimeStore({ databasePath: config.databasePath, encryptionKey: key,
          principals: [{ handle: owner, role: 'owner', scope },
            { handle: coordinatorHandle, role: 'coordinator', scope }, { handle: hostHandle, role: 'host', scope }],
          limits: { ...config.limits, ...runtimeLimits }, hostPermission: effectivePermission, forbiddenSecrets });
      } finally { key.fill(0); }
      let active = true, bridge, manager, installedManager, preview, reviewerDisposer, automationDisposer, router, schedules, memoryContinuity;
      const chats = new Set(), scheduleTokens = new Map();
      const alive = () => active && ctx.fiber.state === 2 && ctx.fiber.uid !== null;
      const assertAlive = () => { if (!alive()) throw new BootstrapError('SERVICE_DISPOSED'); };
      let receiptListener, receiptSubscriptionUsed = false, nativeCompositionAttempted = false;
      const frozenCopy = value => { const copy = structuredClone(value); const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } return item; }; return freeze(copy); };
      const observe = (operation, input, invoke) => {
        const captured = frozenCopy(input);
        const publish = receipt => {
          if (receiptListener) {
            try { const result = receiptListener(frozenCopy({ operation, input: captured, receipt })); if (types.isPromise(result)) { result.catch(() => {}); throw new Error(); } }
            catch { installedSealed = true; throw new BootstrapError('WORKER_SOURCE_UNAVAILABLE'); }
          }
          return receipt;
        };
        const receipt = invoke();
        return receipt instanceof Promise ? receipt.then(publish) : publish(receipt);
      };
      const installedAlive = () => alive() && !installedSealed;
      yield async () => {
        active = false; installedSealed = true; receiptListener = undefined; bridge?.deactivate(); preview?.dispose();
        let failed = false;
        try { schedules?.dispose(); } catch { failed = true; }
        scheduleTokens.clear();
        for (const chat of chats) { try { chat.dispose(); } catch { failed = true; } }
        chats.clear();
        try { router?.dispose(); } catch { failed = true; }
        try { await automationDisposer?.(); } catch { failed = true; }
        try { await reviewerDisposer?.(); } catch { failed = true; }
        try { await installed?.dispose(); } catch { failed = true; }
        try { await manager?.close(); } catch { failed = true; }
        finally { installedManager?.seal(); }
        try { await bridge?.dispose(); } catch { failed = true; }
        try { memoryContinuity?.dispose(); } catch { failed = true; }
        try { store.close(); } catch { failed = true; }
        if (failed) throw new BootstrapError('RUNTIME_CLEANUP_UNAVAILABLE');
      };
      const coordinator = new Coordinator({ store, knownSecrets: forbiddenSecrets });
      const audit = new RuntimeAudit(store);
      const contextAssembler = memory && new ContextAssembler({ store,
        tokenize: memory.tokenize, byteLimit: memory.byteLimit,
        tokenLimit: memory.tokenLimit, knownSecrets: forbiddenSecrets });
      const projection = memory && new MemoryAdapter({ ...memory, store,
        handle: coordinatorHandle, contextAssembler, knownSecrets: forbiddenSecrets });
      if (installedWorkerInstaller && memory) {
        memoryContinuity = createInstalledMemoryContinuity({ ctx, store,
          ownerHandle: owner, coordinatorProjection: projection, memory,
          contextAssembler, knownSecrets: forbiddenSecrets, clock: Date.now,
          onMutation: event => {
            assertAlive(); assertInstalledWorkerInvocation(ctx);
            return observe(event.operation, event.input, () => event.receipt);
          } });
      }
      if (worker) {
        const adapter = new NativeAdapter(ctx, { ...worker, messageAdmission: (message, recipient) => {
          assertAlive(); store.assertMessageCurrent(hostHandle, message); store.assertWorkerOwned(hostHandle, recipient); return true;
        } });
        manager = new WorkerManager({ store, hostHandle, adapter });
      }
      const composeNativeWorker = value => {
        assertAlive();
        if (!installedAlive() || nativeCompositionAttempted || manager) throw new BootstrapError('WORKER_SOURCE_UNAVAILABLE');
        record(value, ['worker', 'nativeHooks'], 'RUNTIME_ADAPTER_INVALID');
        if (!value.worker || !value.nativeHooks) throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
        record(value.worker, ['environments', 'permission', 'toolGuard', 'resolveSession'], 'RUNTIME_ADAPTER_INVALID');
        record(value.nativeHooks, ['setupAgent', 'commitAgent', 'bindExecution', 'validateResult'], 'RUNTIME_ADAPTER_INVALID');
        if (!value.worker.environments || typeof value.worker.permission !== 'function' || typeof value.worker.toolGuard !== 'function' || value.worker.resolveSession !== undefined && typeof value.worker.resolveSession !== 'function' || ['setupAgent', 'commitAgent', 'bindExecution', 'validateResult'].some(key => typeof value.nativeHooks[key] !== 'function')) throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
        nativeCompositionAttempted = true;
        try {
          const adapter = new NativeAdapter(ctx, { ...value.worker, nativeHooks: value.nativeHooks, messageAdmission: () => false });
          installedManager = installedManagerBinding(ctx, store, adapter);
          manager = new WorkerManager({ store: installedManager.store, hostHandle, adapter: installedManager.adapter });
          return Object.freeze({
            dispatch: input => installedManager.run(() => observe('dispatch', input, () => manager.dispatch(owner, input))),
            executeContext: input => installedManager.run(() => observe('execute', input, () => manager.executeContext(owner, input))),
            query: input => installedManager.run(() => manager.query(owner, input)),
            sessionLink: input => installedManager.run(() => manager.sessionLink(owner, input)),
            captureResult: input => installedManager.run(() => observe('captureResult', input, () => manager.captureValidatedResult(owner, input))),
            finishExecution: input => installedManager.run(() => observe('finishExecution', input, () => manager.finishExecution(owner, input))),
          });
        } catch { installedSealed = true; throw new BootstrapError('WORKER_SOURCE_UNAVAILABLE'); }
      };
      const prepareOwnerPreview = input => {
        if (!preview) throw new BootstrapError('PREVIEW_UNAVAILABLE');
        assertAlive(); if (!installedAlive()) throw new BootstrapError('PREVIEW_UNAVAILABLE');
        return preview.prepare(input);
      };
      const grantOwnerPreview = input => {
        if (!preview) throw new BootstrapError('PREVIEW_UNAVAILABLE');
        assertAlive(); if (!installedAlive()) throw new BootstrapError('PREVIEW_UNAVAILABLE');
        return preview.grant(input);
      };
      if (installedWorkerInstaller) {
        try {
          installed = installedWorkerInstaller(Object.freeze({
            ctx, snapshotOwner: value => { assertAlive(); return store.snapshot(owner, value); },
            readOwnerData: value => { assertAlive(); return store.readData(owner, value); },
            currentPolicy: () => { assertAlive(); return store.getPolicy(owner); },
            installOwnerPolicy: value => { assertAlive(); return observe('policy', value, () => store.policy(owner, value)); },
            planOwnerAction: value => { assertAlive(); return observe('plan', value, () => store.planAction(owner, value)); },
            assertNativeRequestCurrent: value => { assertAlive(); if (!installedAlive()) throw new BootstrapError('WORKER_SOURCE_UNAVAILABLE'); return store.assertNativeRequestCurrent(hostHandle, value); },
            composeNativeWorker, prepareOwnerPreview, grantOwnerPreview,
            subscribeRuntimeReceipts: listener => {
              if (typeof listener !== 'function' || receiptSubscriptionUsed) throw new BootstrapError('RUNTIME_ADAPTER_INVALID');
              receiptSubscriptionUsed = true; receiptListener = listener;
              return () => { if (receiptListener === listener) receiptListener = undefined; };
            }, isAlive: installedAlive,
          }));
          record(installed, ['hostPermission', 'previewResolver', 'previewTtlMs', 'operations', 'status', 'dispose'], 'RUNTIME_ADAPTER_INVALID');
          if (['hostPermission', 'previewResolver', 'status', 'dispose'].some(key => typeof installed[key] !== 'function') || !Number.isSafeInteger(installed.previewTtlMs) || installed.previewTtlMs < 1 || installed.previewTtlMs > 60000) throw new Error();
          const names = ['workerCatalog','workerPolicyPreview','workerPolicyConfirm','workerPlan','workerPreview','workerGrant','workerCreate','workerExecute','workerQuery','workerCapture','workerResult','workerFinish'];
          record(installed.operations, names, 'RUNTIME_ADAPTER_INVALID');
          if (names.some(key => typeof installed.operations[key] !== 'function')) throw new Error();
          // This facade forwards to the one original authoritative store. Only
          // the actual original grantAction success creates an observer event.
          const previewStore = Object.freeze({ snapshot: (...args) => store.snapshot(...args), readData: (...args) => store.readData(...args), grantAction: (handle, input) => observe('grant', input, () => store.grantAction(handle, input)) });
          preview = new ApprovalPreview({ store: previewStore, ownerHandle: owner, resolve: installed.previewResolver, ttlMs: installed.previewTtlMs, isAlive: installedAlive, knownSecrets: forbiddenSecrets });
        } catch { installedSealed = true; throw new BootstrapError('RUNTIME_ADAPTER_INVALID'); }
      } else if (previewResolver) preview = new ApprovalPreview({ store, ownerHandle: owner, resolve: previewResolver, ttlMs: previewTtlMs, isAlive: alive, knownSecrets: forbiddenSecrets });
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
      if (installed) {
        // Successful original mutations notify the single private observer.
        // Grant already observes its actual store mutation inside Preview.
        for (const name of ['prepareContext','policy','plan','revoke','revise']) {
          const original = operations[name];
          operations[name] = input => observe(name, input, () => original(input));
        }
        const originalControl = operations.control;
        operations.control = (input, context) => {
          record(context, ['assertCurrent'], 'SERVICE_DISPOSED');
          if (typeof context.assertCurrent !== 'function') throw new BootstrapError('SERVICE_DISPOSED');
          return runInstalledWorkerInvocation(ctx, context.assertCurrent, () => {
            assertInstalledWorkerInvocation(ctx);
            const invoke = () => observe('control', input, () => originalControl(input));
            return installedManager ? installedManager.run(invoke) : invoke();
          });
        };
        for (const name of ['dispatch','execute','query','sessionLink','handoff','captureResult']) {
          operations[name] = () => { throw new BootstrapError('WORKER_REQUEST_DENIED'); };
        }
        Object.assign(operations, installed.operations);
        operations.memoryCorrect = (input, context) => {
          record(context, ['assertCurrent'], 'SERVICE_DISPOSED');
          if (typeof context.assertCurrent !== 'function') throw new BootstrapError('SERVICE_DISPOSED');
          return runInstalledWorkerInvocation(ctx, context.assertCurrent, () => {
            assertAlive();
            if (!installedAlive() || !memoryContinuity) throw new BootstrapError('SERVICE_DISPOSED');
            return memoryContinuity.operations.memoryCorrect(input);
          });
        };
      }
      bridge = installOperatorBridge({ connection: ctx.connection, operations, isAlive: alive });
      // Trusted Cordis consumers see diagnostics only. Neither a worker nor a
      // model-facing tool can borrow an owner command closure from the service.
      ctx.provide('df', Object.freeze({ diagnostics() {
        if (!alive()) throw new BootstrapError('SERVICE_DISPOSED');
        return Object.freeze({ target: host.target, supported: host.supported,
          schemaVersion: store.diagnostics().schemaVersion, channel: '/df-rpc',
          ...(installed ? { installedWorkerStatus: frozenCopy(installed.status()) } : {}),
          identityBridge: 'connection-operator', permissionBridge: 'trusted-policy-required',
          automationBridge: router ? 'private-installed-adapters' : 'unavailable',
          scheduleBridge: schedules ? 'owner-approved-ingress-only' : 'unavailable',
          chatBridge: router ? 'provider-neutral-contract' : 'unavailable',
          notificationBridge: notifier ? 'explicit-policy-review-grant' : 'unavailable',
          capabilities: Object.freeze({ memory: !!projection, preview: !!preview, worker: !!manager, delivery: !!pipeline, reviewer: !!reviewerInstaller, automation: !!router, notifications: !!notifier }) });
      } }));
      yield () => { active = false; installedSealed = true; bridge?.deactivate(); };
    }, 'df.runtime.lifecycle');
  }
  return Object.freeze({ name: 'dsh-fishball', inject: Object.freeze(['connection', 'sessions', 'approval', 'webServer', ...(worker ? ['agents', 'llm', 'tools'] : [])]), Config, apply });
}

// Private normal-manager binding. It forwards to the same original store and
// adapter; no owner JSON, digest or copied observation establishes provenance.
function installedManagerBinding(ctx, originalStore, originalAdapter) {
  const observations = new AsyncLocalStorage();
  const invocations = new AsyncLocalStorage();
  const claims = new WeakSet(), tickets = new WeakMap(), retained = new Set();
  let observationOpen = true;
  const denied = () => { throw new BootstrapError('WORKER_SOURCE_UNAVAILABLE'); };
  const invoke = (method, args) => Reflect.apply(originalAdapter[method], originalAdapter, args);
  const forward = (method, args) => Reflect.apply(originalStore[method], originalStore, args);
  const assertOwner = () => {
    if (invocations.getStore()?.open !== true) throw new BootstrapError('SERVICE_DISPOSED');
    return assertInstalledWorkerInvocation(ctx);
  };
  function ticketRecord(ticket) {
    const value = tickets.get(ticket);
    if (!value || !observationOpen) denied();
    return value;
  }
  function actualReceipt(ticket, receipt) {
    const value = ticketRecord(ticket), claim = value.claim;
    if (!claim || !receipt || receipt.taskRef !== value.taskRef ||
        receipt.actionRef !== value.actionRef || receipt.actionDigest !== value.actionDigest ||
        receipt.claimRef !== claim.claimRef || receipt.reservationRef !== claim.reservationRef ||
        receipt.generationRef !== value.generationRef ||
        typeof claim.sessionRef === 'string' && receipt.sessionRef !== claim.sessionRef ||
        value.sessionRef !== undefined && receipt.sessionRef !== value.sessionRef) denied();
    referenceCheck(receipt.sessionRef);
    value.sessionRef ??= receipt.sessionRef;
    return Object.freeze({ value, receipt });
  }
  function publish(ticket, receipt) {
    // The exact original adapter return is delivered in a separate source
    // carrier. The manager's later explicit continuation still has its own
    // owner carrier; a denied owner never acquires this carrier by fallback.
    if (!observationOpen) return;
    const source = actualReceipt(ticket, receipt);
    if (source.value.listener) {
      observations.run(source, () => {
        try { source.value.listener(receipt); } catch { /* actual facts stay held if storage refuses */ }
      });
    }
  }
  function returned(method, args, receiptOf = value => value) {
    const result = invoke(method, args);
    const capture = value => { publish(args[0], receiptOf(value)); return value; };
    return types.isPromise(result) ? result.then(capture) : capture(result);
  }
  const store = {};
  for (const method of ['snapshot', 'readData', 'assertClaimCurrent']) {
    store[method] = (...args) => forward(method, args);
  }
  for (const method of ['claimAction', 'beginContextExecution', 'assertExecutionCurrent',
    'writeArtifact', 'settleAction', 'control', 'putHandoff']) {
    store[method] = (...args) => {
      assertOwner();
      const receipt = forward(method, args);
      if (method === 'claimAction') claims.add(receipt);
      return receipt;
    };
  }
  store.workerObservation = (...args) => {
    const source = observations.getStore();
    if (source) {
      if (!observationOpen || !retained.has(source.value) || !source.value.claim) denied();
      const input = args[1], receipt = source.receipt;
      // Match the complete original binding, plus the manager's exact
      // observation command. Nothing in input can create this source carrier.
      const fields = ['taskRef', 'claimRef', 'generationRef', 'phase', 'cursor', 'evidenceRef', 'sessionRef'];
      if (!input || Object.keys(input).some(key => ![...fields, 'commandRef'].includes(key)) ||
          fields.some(key => input[key] !== receipt[key]) ||
          input.commandRef !== workerDigest('worker-observation', receipt.claimRef,
            receipt.phase, receipt.cursor, receipt.evidenceRef)) denied();
    } else {
      // Includes submitted/cancel_requested and explicit reconciliation. A
      // timeout/error's fabricated unknown has no owned-receipt authority.
      assertOwner();
    }
    return forward('workerObservation', args);
  };
  const adapter = {
    async prepare(...args) {
      const ticket = await invoke('prepare', args);
      if (!observationOpen || tickets.has(ticket)) denied();
      const [spec, task, actionDigest] = args;
      const value = { taskRef: task.taskRef, actionRef: spec.actionRef, actionDigest,
        generationRef: spec.executor.generationRef, claim: null, listener: null };
      tickets.set(ticket, value); retained.add(value);
      return ticket;
    },
    bindClaim(ticket, claim, assertion) {
      const value = ticketRecord(ticket);
      if (!claims.has(claim) || value.claim || claim.task?.taskRef !== value.taskRef ||
          claim.actionRef !== value.actionRef || claim.actionDigest !== value.actionDigest ||
          claim.generationRef !== value.generationRef) denied();
      const result = invoke('bindClaim', [ticket, claim, assertion]);
      value.claim = claim;
      return result;
    },
    observe(ticket, listener) {
      const value = ticketRecord(ticket);
      if (value.listener || typeof listener !== 'function') denied();
      value.listener = listener;
      // Retain the actual manager listener through its original shutdown
      // drain even after detaching the native subscription. Seal clears it.
      return invoke('observe', [ticket, receipt => publish(ticket, receipt)]);
    },
  };
  for (const method of ['create', 'resume', 'query', 'cancel', 'dispose', 'shutdown']) {
    adapter[method] = (...args) => returned(method, args);
  }
  for (const method of ['executeContext', 'finishExecution']) {
    adapter[method] = (...args) => returned(method, args, value => value.worker);
  }
  for (const method of ['readResult', 'validateResult', 'sessionLink', 'handoff']) {
    adapter[method] = (...args) => invoke(method, args);
  }
  return Object.freeze({ store: Object.freeze(store), adapter: Object.freeze(adapter),
    run(callback) {
      const invocation = { open: true };
      return invocations.run(invocation, () => {
        try {
          assertOwner();
          const result = callback();
          if (types.isPromise(result)) return result.finally(() => { invocation.open = false; });
          invocation.open = false;
          return result;
        } catch (error) { invocation.open = false; throw error; }
      });
    },
    seal() {
      observationOpen = false;
      for (const value of retained) { value.listener = null; value.claim = null; }
      retained.clear();
    } });
}

function referenceCheck(value) {
  if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) throw new BootstrapError('INPUT_INVALID');
}
export const runtimePlugin = createRuntimePlugin();
export default runtimePlugin;

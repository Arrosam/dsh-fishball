// Normal-only composition over the original schema6 store and public classes.
// No configuration mutation, timer, grant or delivery occurs during composition.
import { BootstrapError } from './config.mjs';
import { exact, canonical, canonicalDigest, hash, ref } from './runtime-security.mjs';
import { EventRouter } from './events.mjs';
import { ScheduleDriver } from './scheduler.mjs';
import { ResultPipeline } from './results.mjs';

const fail = code => { throw new BootstrapError(code); };
const copy = value => {
  const result = JSON.parse(canonical(value));
  const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } return item; };
  return freeze(result);
};
const functions = (value, names) => {
  exact(value, names);
  if (names.some(name => typeof value[name] !== 'function')) fail('RUNTIME_ADAPTER_INVALID');
};

export function createNormalAutomation({ ctx, store, ownerHandle, hostHandle, installer, isAlive, check, knownSecrets }) {
  const router = new EventRouter({ store, hostHandle, isAlive, knownSecrets });
  const schedules = new ScheduleDriver({ store, hostHandle, router, isAlive, knownSecrets });
  const call = (method, handle, input) => { check(); const result = store[method](handle, input); check(); return copy(result); };
  let installed;
  try {
    installed = installer(Object.freeze({ ctx, isAlive,
      configureSource: input => call('configureSource', ownerHandle, input),
      configureLocalSubscription: input => call('configureLocalSubscription', ownerHandle, input),
      readLocalSourcePair: input => call('readLocalSourcePair', hostHandle, input),
      source: input => call('source', ownerHandle, input), subscription: input => call('subscription', ownerHandle, input),
      ingestLocalOwnerEvent: input => call('ingestLocalOwnerEvent', hostHandle, input),
      eventReceipt: input => call('eventReceipt', hostHandle, input), listEventReceipts: input => call('listEventReceipts', hostHandle, input),
      readGoal(input) {
        exact(input, ['taskRef', 'recordRef']); check();
        const task = store.task(ownerHandle, input.taskRef), data = store.readData(ownerHandle, input);
        if (task.taskRef !== input.taskRef || data.recordRef !== input.recordRef || data.kind !== 'goal' || hash(data.content) !== data.digest || Buffer.byteLength(data.content) !== data.byteLength) fail('GOAL_BINDING_INVALID');
        check(); return copy({ ...data, taskRef: task.taskRef });
      },
      registerSchedule: input => { check(); return schedules.register(input); },
      tickSchedule: token => { check(); return schedules.tick(token); },
      statusSchedule: token => { check(); return schedules.status(token); },
      readScheduleClock: input => call('eventClock', hostHandle, input),
      startSchedule: (token, input) => { check(); return schedules.start(token, input); },
      // These two cleanup-only closures retain the original opaque token and
      // remain usable after synchronous admission sealing.
      stopSchedule: token => { if (isAlive()) return schedules.stop(token); return schedules.unregister(token); },
      unregisterSchedule: token => schedules.unregister(token),
      approveSchedule: input => call('approveEventClock', ownerHandle, input),
    }));
    functions(installed, ['configureLocalAutomation', 'ingestLocalEvent', 'localAutomationStatus', 'startLocalSchedule', 'stopLocalSchedule', 'dispose']);
  } catch (error) { schedules.dispose(); router.dispose(); throw error; }
  let disposed = false;
  return Object.freeze({ operations: Object.freeze(Object.fromEntries(['configureLocalAutomation', 'ingestLocalEvent', 'localAutomationStatus', 'startLocalSchedule', 'stopLocalSchedule'].map(name => [name, installed[name]]))),
    approveSchedule: input => call('approveEventClock', ownerHandle, input),
    dispose() { if (disposed) return; disposed = true; try { installed.dispose(); } finally { try { schedules.dispose(); } finally { router.dispose(); } } } });
}

export function localActionFacts({ ctx, installed, workerSelection, store, ownerHandle, check }, input) {
  exact(input, ['taskRef']); ref(input.taskRef); check();
  if (!installed?.auditSupport) fail('RESULT_CAPABILITY_UNAVAILABLE');
  // Both calls enforce accepted policy and native source currentness. Reads do
  // not resolve a guessed provider, create a session or expand resource policy.
  const policyFacts = installed.auditSupport.readFacts('review');
  const native = installed.auditSupport.nativeFacts('review');
  native.assertCurrent();
  const task = store.task(ownerHandle, input.taskRef), policy = store.getPolicy(ownerHandle);
  if (policy.version !== policyFacts.resourcePolicyVersion || policy.modelPolicy?.version !== policyFacts.modelPolicyVersion || policy.modelPolicy.catalogEvidenceRef !== policyFacts.catalogEvidenceRef || !policy.modelPolicy.presetRefs.includes(policyFacts.presetRef)) fail('WORKER_POLICY_STALE');
  const binding = { ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, sourceRef: native.sourceRef,
    environmentRef: native.environmentRef, policyVersion: policy.version, modelPolicyVersion: policy.modelPolicy.version,
    profile: { dir: ctx.profileContext.dir, name: ctx.profileContext.name }, operation: 'df.local-dsh-publication/v1' };
  check(); native.assertCurrent();
  return copy({ resourcePolicyVersion: policy.version, modelPolicyVersion: policy.modelPolicy.version,
    model: { presetRef: policyFacts.presetRef, modelRef: policyFacts.modelRef, reasoningRef: policyFacts.reasoningRef, catalogEvidenceRef: policyFacts.catalogEvidenceRef },
    executor: { environmentRef: native.environmentRef, bindingDigest: canonicalDigest(['df.local-result-binding/v1', binding]), toolsDigest: canonicalDigest([]), permissionPolicyDigest: canonicalDigest(['df.local-result-permission/v1', binding, policy]) },
    labels: { providerLabel: native.labels.provider, modelLabel: native.labels.model, reasoningLabel: native.labels.reasoning, presetLabel: native.labels.preset,
      environmentLabel: 'Current native local result panel', cwd: workerSelection.environment.cwd, toolNames: [], evidenceRef: canonicalDigest(['df.local-result-current-facts/v1', binding, policyFacts]) } });
}

export function createNormalResults({ ctx, store, ownerHandle, hostHandle, identity, profile, installer, isAlive, check, observe, subscribeRuntimeReceipts, readLocalActionFacts, checkLocalAction, grantTtlMs, preparePreview, grantPreview }) {
  const namespace = canonicalDigest(['df.installed-results/v1', identity.ownerId, identity.workspaceId, profile.dir, profile.name]);
  const route = Object.freeze({ recipientRef: canonicalDigest([namespace, 'df.native-owner/v1']), channelRef: canonicalDigest([namespace, 'df.local-results/v1']) });
  let pipeline;
  const call = (method, handle, input) => { check(); const result = store[method](handle, input); check(); return copy(result); };
  const mutate = (method, handle, input, operation = method, origin) => observe(operation, input, () => call(method, handle, input), origin);
  const accepted = input => {
    exact(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'previousDeliveryRef', 'recipientRef', 'channelRef', 'notification'],
      ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef']);
    if (input.recipientRef !== route.recipientRef || input.channelRef !== route.channelRef) fail('LOCAL_DELIVERY_MISMATCH');
    check(); return pipeline.acceptDelivery(ownerHandle, input);
  };
  const installed = installer(Object.freeze({ ctx, isAlive,
    snapshotOwner: input => call('snapshot', ownerHandle, input), readLocalActionFacts, subscribeRuntimeReceipts,
    planOwnerAction: input => mutate('planAction', ownerHandle, input, 'plan', 'local'),
    artifact: input => call('artifact', ownerHandle, input), readArtifact: input => call('readLocalArtifact', ownerHandle, input),
    writeArtifact: input => mutate('writeArtifact', ownerHandle, input), acceptDelivery: accepted,
    getDelivery: input => call('getDelivery', ownerHandle, input),
    listLocalDeliveries(input) {
      exact(input, ['taskRef']); const snapshot = call('snapshot', ownerHandle, input);
      return copy(snapshot.deliveries.filter(d => d.recipientRef === route.recipientRef && d.channelRef === route.channelRef && ['sent', 'delivered', 'unknown', 'failed'].includes(d.state)));
    },
    publishLocalDelivery: input => mutate('publishLocalDelivery', hostHandle, input),
    recordLocalDeliveryAccess: input => mutate('recordLocalDeliveryAccess', hostHandle, input),
    configureLocalNotificationPolicy: input => mutate('configureLocalNotificationPolicy', ownerHandle, input),
    getNotificationPolicy: input => call('getNotificationPolicy', ownerHandle, input),
    writeLocalProgress: input => mutate('writeLocalProgress', ownerHandle, input), readLocalProgress: input => call('readLocalProgress', ownerHandle, input),
  }));
  exact(installed, ['recipientAdapter', 'progressPolicy', 'notifications', 'resolveLocalDelivery', 'localAdmission', 'planLocalDelivery', 'writeLocalReport', 'configureLocalNotifications', 'pendingLocalNotifications', 'prepareLocalNotification', 'acceptLocalNotification', 'localResultsStatus', 'readLocalResult', 'localDeliveryQuery', 'localDeliveryAccess', 'dispose']);
  for (const name of ['resolveLocalDelivery', 'localAdmission', 'planLocalDelivery', 'writeLocalReport', 'configureLocalNotifications', 'pendingLocalNotifications', 'prepareLocalNotification', 'acceptLocalNotification', 'localResultsStatus', 'readLocalResult', 'localDeliveryQuery', 'localDeliveryAccess', 'dispose']) if (typeof installed[name] !== 'function') fail('RUNTIME_ADAPTER_INVALID');
  exact(installed.recipientAdapter, ['send', 'query', 'open']);
  if (Object.values(installed.recipientAdapter).some(value => typeof value !== 'function') || installed.progressPolicy !== null && typeof installed.progressPolicy !== 'function') fail('RUNTIME_ADAPTER_INVALID');
  if (installed.notifications !== null) {
    exact(installed.notifications, ['recipientRef', 'channelRef', 'policyRef', 'mergeKeyRef']);
    if (installed.notifications.recipientRef !== route.recipientRef || installed.notifications.channelRef !== route.channelRef || installed.notifications.policyRef !== canonicalDigest([namespace, 'notification-policy']) || installed.notifications.mergeKeyRef !== canonicalDigest([namespace, 'progress-group'])) fail('RUNTIME_ADAPTER_INVALID');
  }
  // A literal forwarding facade preserves the original host handle and store.
  // Only this private pipeline's claimAction slot selects the typed local core.
  const pipelineStore = Object.freeze(Object.fromEntries(['task', 'writeArtifact', 'writeProgress', 'verifyArtifact', 'artifact', 'deliveryObservation', 'getDelivery', 'readData', 'snapshot', 'settleAction'].map(name => [name, (handle, input) => call(name, handle, input)]).concat([
    ['recordDelivery', (handle, input) => { if (handle !== ownerHandle) fail('UNAUTHORIZED'); return mutate('recordDelivery', ownerHandle, input, 'acceptLocalDelivery'); }],
    ['claimAction', (handle, input) => { if (handle !== hostHandle) fail('UNAUTHORIZED'); return call('claimLocalDelivery', hostHandle, input); }],
  ])));
  pipeline = new ResultPipeline(pipelineStore, { hostHandle, recipientAdapter: installed.recipientAdapter, ...(installed.progressPolicy ? { progressPolicy: installed.progressPolicy } : {}) });
  const operations = Object.fromEntries(['planLocalDelivery', 'writeLocalReport', 'configureLocalNotifications', 'pendingLocalNotifications', 'prepareLocalNotification', 'acceptLocalNotification', 'localResultsStatus', 'readLocalResult', 'localDeliveryQuery', 'localDeliveryAccess'].map(name => [name, installed[name]]));
  operations.acceptLocalDelivery = input => {
    exact(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest']);
    const m = call('readLocalArtifact', ownerHandle, { taskRef: input.taskRef, artifactRef: input.artifactRef, version: input.artifactVersion, digest: input.digest });
    const current = call('artifact', ownerHandle, { taskRef: input.taskRef, artifactRef: input.artifactRef });
    if (current.version !== input.artifactVersion || current.digest !== input.digest || m.artifact.verificationBinding?.source !== 'native' || m.artifact.verificationBinding.verdict !== 'accepted') fail('ARTIFACT_UNVERIFIED');
    return accepted({ ...input, ...route });
  };
  operations.localDeliveryPreview = input => { check(); checkLocalAction(input); return preparePreview(input); };
  operations.localDeliveryGrant = input => {
    check(); checkLocalAction(input);
    const time = Date.now();
    if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= time || input.expiresAt > time + grantTtlMs) fail('APPROVAL_INVALID');
    return grantPreview(input);
  };
  operations.dispatchLocalDelivery = input => { check(); checkLocalAction(input); return pipeline.dispatch(ownerHandle, input); };
  operations.reconcileLocalDelivery = input => { exact(input, ['taskRef', 'deliveryRef']); check(); return pipeline.reconcile(ownerHandle, input.taskRef, input.deliveryRef); };
  return Object.freeze({ operations: Object.freeze(operations), resolve: installed.resolveLocalDelivery,
    permission(record) {
      try {
        if (!installed.localAdmission(record)) return false;
        // This synchronous source read never opens a nested transaction. The
        // core repeats grant/CAS/material/coverage under its existing lock.
        const facts = readLocalActionFacts({ taskRef: record.taskRef });
        return canonical(facts.model) === canonical(record.spec.model) && Object.entries(facts.executor).every(([name, value]) => record.spec.executor[name] === value);
      } catch { return false; }
    }, notificationsEnabled: installed.notifications !== null, dispose: installed.dispose });
}

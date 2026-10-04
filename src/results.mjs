import { fields, digestRef, integer, choice, boundedArray, immutable, evidence, reject, binding, contentDigest, bytesDigest } from './messages.mjs';

export function normalizeReport(input) {
  fields(input, ['originalGoalRef', 'completedScopeRef', 'unfinishedRef', 'nextStepRef', 'verificationState', 'verificationEvidence', 'blockerRefs', 'progressDigest']);
  for (const key of ['originalGoalRef', 'completedScopeRef', 'unfinishedRef', 'nextStepRef', 'progressDigest']) digestRef(input[key]);
  choice(input.verificationState, ['passed', 'failed', 'not_run', 'stale']);
  const verificationEvidence = boundedArray(input.verificationEvidence).map(evidence);
  const blockerRefs = boundedArray(input.blockerRefs).map(digestRef);
  if (['passed', 'failed'].includes(input.verificationState) && verificationEvidence.length === 0) reject('VERIFICATION_REQUIRED');
  if (input.verificationState === 'not_run' && verificationEvidence.length !== 0) reject('VERIFICATION_CONFLICT');
  if (new Set(blockerRefs).size !== blockerRefs.length) reject('INVALID_INPUT');
  return immutable({ ...input, verificationEvidence, blockerRefs });
}

export function normalizeReceipt(input) {
  fields(input, ['artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef', 'permissionState', 'openability', 'observedAt', 'evidenceRef']);
  for (const key of ['artifactRef', 'digest', 'recipientRef', 'channelRef', 'evidenceRef']) digestRef(input[key]);
  integer(input.artifactVersion, 1); integer(input.observedAt);
  choice(input.permissionState, ['granted', 'revoked', 'unknown']);
  choice(input.openability, ['verified', 'failed', 'unknown']);
  return immutable(input);
}

export class ResultPipeline {
  #store; #host; #adapter; #progressPolicy;
  constructor(store, { hostHandle, recipientAdapter, progressPolicy } = {}) {
    if (!store || ['writeArtifact', 'writeProgress', 'verifyArtifact', 'artifact', 'recordDelivery', 'deliveryObservation', 'getDelivery', 'claimAction'].some(name => typeof store[name] !== 'function') || !hostHandle || !recipientAdapter || typeof recipientAdapter.send !== 'function' || typeof recipientAdapter.query !== 'function' || typeof recipientAdapter.open !== 'function') reject('INVALID_CONFIG');
    if (progressPolicy !== undefined && typeof progressPolicy !== 'function') reject('INVALID_CONFIG');
    this.#store = store; this.#host = hostHandle; this.#adapter = recipientAdapter; this.#progressPolicy = progressPolicy;
  }
  writeArtifact(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'artifactRef', 'version', 'content', 'producerClaimRef', 'generationRef'], ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'artifactRef', 'version', 'content']);
    digestRef(input.artifactRef); integer(input.version, 1);
    if (typeof input.content !== 'string') reject('INVALID_INPUT');
    binding(input);
    if (Object.hasOwn(input, 'producerClaimRef')) digestRef(input.producerClaimRef);
    if (Object.hasOwn(input, 'generationRef')) digestRef(input.generationRef);
    return immutable(this.#store.writeArtifact(handle, { ...input, content: immutable(input.content) }));
  }

  verify(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'artifactRef', 'version', 'digest', 'verdict', 'evidenceRef']);
    for (const key of ['taskRef', 'commandRef', 'artifactRef', 'digest', 'evidenceRef']) digestRef(input[key]);
    integer(input.version, 1); choice(input.verdict, ['passed', 'failed', 'not_run']);
    return immutable(this.#store.verifyArtifact(handle, { ...input, verdict: { passed: 'accepted', failed: 'rejected', not_run: 'unknown' }[input.verdict] }));
  }
  artifact(handle, taskRef, artifactRef) {
    digestRef(taskRef); digestRef(artifactRef);
    return immutable(this.#store.artifact(handle, { taskRef, artifactRef }));
  }
  acceptDelivery(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef', 'previousDeliveryRef'], ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef']);
    binding(input); integer(input.artifactVersion, 1);
    for (const key of ['deliveryRef', 'artifactRef', 'digest', 'recipientRef', 'channelRef']) digestRef(input[key]);
    const current = this.#store.artifact(handle, { taskRef: input.taskRef, artifactRef: input.artifactRef });
    if (current.version !== input.artifactVersion || current.digest !== input.digest) reject('ARTIFACT_STALE');
    const task = this.#store.task(handle, input.taskRef);
    const targetDigest = contentDigest({ ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, ...input });
    return immutable(this.#store.recordDelivery(handle, { ...input, targetDigest }));
  }
  retryFailed(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef', 'previousDeliveryRef']);
    digestRef(input.previousDeliveryRef);
    if (input.previousDeliveryRef === input.deliveryRef) reject('RETRY_NEW_ATTEMPT_REQUIRED');
    const prior = this.#store.getDelivery(handle, { taskRef: input.taskRef, deliveryRef: input.previousDeliveryRef });
    if (prior.state !== 'failed') reject('RETRY_UNCONFIRMED');
    // Core rechecks exact negative receipt + prior release and immutable item
    // identity at the accepted retry transaction, before any new grant/claim.
    return this.acceptDelivery(handle, input);
  }
  delivery(handle, taskRef, deliveryRef) {
    digestRef(taskRef); digestRef(deliveryRef);
    return immutable(this.#store.getDelivery(handle, { taskRef, deliveryRef }));
  }
  #receipt(record, receipt) {
    fields(receipt, ['artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef', 'permissionState', 'openability', 'observedAt', 'evidenceRef', 'state']);
    choice(receipt.state, ['sent', 'delivered', 'failed', 'unknown']);
    const { state, ...access } = receipt; const checked = normalizeReceipt(access);
    if (record.artifactRef !== checked.artifactRef || record.artifactVersion !== checked.artifactVersion || record.digest !== checked.digest || record.recipientRef !== checked.recipientRef || record.channelRef !== checked.channelRef) reject('RECEIPT_BINDING_INVALID');
    if (state === 'delivered' && (checked.permissionState !== 'granted' || checked.openability !== 'verified')) reject('OPENING_NOT_VERIFIED');
    return { ...checked, state };
  }
  #observation(taskRef, record, receipt) {
    const checked = this.#receipt(record, receipt);
    return immutable(this.#store.deliveryObservation(this.#host, { taskRef, deliveryRef: record.deliveryRef, commandRef: contentDigest({ deliveryRef: record.deliveryRef, claimRef: record.claimRef, receipt: checked }), state: checked.state, evidenceRef: checked.evidenceRef, permissionState: { granted: 'allowed', revoked: 'denied', unknown: 'unknown' }[checked.permissionState], openability: { verified: 'openable', failed: 'unavailable', unknown: 'unknown' }[checked.openability], observedAt: checked.observedAt, claimRef: record.claimRef, generationRef: record.generationRef }));
  }
  async dispatch(handle, input) {
    fields(input, ['taskRef', 'deliveryRef', 'actionRef', 'actionDigest', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch']); binding(input);
    for (const key of ['deliveryRef', 'actionRef', 'actionDigest']) digestRef(input[key]);
    input = immutable(input);
    const existing = this.#store.getDelivery(handle, { taskRef: input.taskRef, deliveryRef: input.deliveryRef });
    if (existing.state !== 'accepted') return immutable({ dispatched: false, delivery: existing });
    const current = this.#store.artifact(handle, { taskRef: input.taskRef, artifactRef: existing.artifactRef });
    if (current.version !== existing.artifactVersion || current.digest !== existing.digest || current.verification?.verdict !== 'accepted') reject('ARTIFACT_STALE');
    // The core additionally verifies confirmed failed reconciliation, settled
    // prior attempts, current exact artifact and a new exact grant under lock.
    this.#store.claimAction(this.#host, { ...binding(input), actionRef: input.actionRef, actionDigest: input.actionDigest, delivery: { deliveryRef: input.deliveryRef } });
    const record = this.#store.getDelivery(this.#host, { taskRef: input.taskRef, deliveryRef: input.deliveryRef });
    if (record.state !== 'outbox_committed' || !record.claimRef || !record.reservationRef) reject('OUTBOX_NOT_CLAIMED');
    try {
      const artifact = this.#store.artifact(this.#host, { taskRef: input.taskRef, artifactRef: record.artifactRef, version: record.artifactVersion });
      const content = this.#store.readData(this.#host, { taskRef: input.taskRef, recordRef: artifact.recordRef });
      const receipt = await this.#adapter.send(immutable(record), content);
      return immutable({ dispatched: true, delivery: this.#observation(input.taskRef, record, receipt) });
    } catch {
      const delivery = this.#store.deliveryObservation(this.#host, { taskRef: input.taskRef, deliveryRef: record.deliveryRef, commandRef: contentDigest({ deliveryRef: record.deliveryRef, claimRef: record.claimRef, state: 'unknown' }), state: 'unknown', evidenceRef: contentDigest({ code: 'DELIVERY_OUTCOME_UNKNOWN' }), permissionState: 'unknown', openability: 'unknown', observedAt: this.#store.snapshot(this.#host, { taskRef: input.taskRef }).observedAt, claimRef: record.claimRef, generationRef: record.generationRef });
      return immutable({ dispatched: true, delivery });
    }
  }
  async dispatchBatch(handle, inputs) {
    boundedArray(inputs); inputs = immutable(inputs); const seen = new Set(), results = [];
    for (const input of inputs) { digestRef(input.deliveryRef); if (seen.has(input.deliveryRef)) reject('DUPLICATE_DELIVERY'); seen.add(input.deliveryRef); }
    for (const input of inputs) results.push(await this.dispatch(handle, input));
    return immutable(results);
  }
  async reconcile(handle, taskRef, deliveryRef) {
    const record = this.delivery(handle, taskRef, deliveryRef);
    if (!['outbox_committed', 'sent', 'unknown'].includes(record.state)) return record;
    let receipt;
    try { receipt = await this.#adapter.query(record); }
    catch { return immutable({ ...record, reconciliationRequired: true }); }
    return this.#observation(taskRef, record, receipt);
  }
  async currentAccess(handle, taskRef, deliveryRef) {
    const record = this.delivery(handle, taskRef, deliveryRef);
    if (record.state !== 'delivered') reject('DELIVERY_NOT_CONFIRMED');
    const receipt = await this.#adapter.open(record); this.#receipt(record, receipt);
    // A subsequent access observation uses the same historical delivered fact.
    // Core preserves receipt-time access and updates only current availability.
    return this.#observation(taskRef, record, receipt);
  }
  progress(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'progressRef', 'kind', 'report']); binding(input); digestRef(input.progressRef);
    choice(input.kind, ['milestone', 'obstacle', 'question', 'final']);
    if (!this.#progressPolicy) reject('CAPABILITY_UNAVAILABLE');
    const report = normalizeReport(input.report), task = this.#store.task(handle, input.taskRef), snapshot = this.#store.snapshot(handle, { taskRef: input.taskRef });
    const { progressDigest: ignored, ...facts } = report;
    const factualDigest = contentDigest({ status: task.status, report: facts });
    const prior = (snapshot.progress ?? []).find(item => item.digest === bytesDigest(JSON.stringify({ ...facts, progressDigest: factualDigest })));
    if (prior) return immutable({ state: 'unchanged_suppressed', progress: prior, notificationDelivered: false });
    const policy = this.#progressPolicy(immutable({ task, report, kind: input.kind, observedAt: snapshot.observedAt }));
    fields(policy, ['quietUntil', 'coalesceUntil', 'allowObstaclesDuringQuiet']); integer(policy.quietUntil); integer(policy.coalesceUntil); if (typeof policy.allowObstaclesDuringQuiet !== 'boolean') reject('INVALID_CONFIG');
    const now = integer(snapshot.observedAt);
    const state = now < policy.quietUntil && !(input.kind === 'obstacle' && policy.allowObstaclesDuringQuiet) ? 'quiet' : now < policy.coalesceUntil ? 'coalesced' : 'eligible';
    const content = JSON.stringify({ ...facts, progressDigest: factualDigest });
    const progress = this.#store.writeProgress(handle, { ...binding(input), progressRef: input.progressRef, kind: input.kind, content });
    return immutable({ state, progress, notificationDelivered: false });
  }

}

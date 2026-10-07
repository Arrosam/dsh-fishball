import { fields, digestRef, integer, choice, boundedArray, immutable, reject, binding, bytesDigest } from './messages.mjs';
import { normalizeReport, normalizeNotificationBinding } from './results.mjs';

const KINDS = ['milestone', 'obstacle', 'question', 'final'];
export function normalizeNotificationPolicy(input) {
  fields(input, ['enabled', 'timeZone', 'quietWindows', 'emergencyKinds', 'mergeKinds', 'mergeWindowMs', 'minIntervalMs', 'frequency']);
  if (typeof input.enabled !== 'boolean' || typeof input.timeZone !== 'string' || input.timeZone.length > 64 || !/^[A-Za-z0-9_+\/-]+$/.test(input.timeZone)) reject('INVALID_INPUT');
  try { new Intl.DateTimeFormat('en-GB', { timeZone: input.timeZone }).format(0); } catch { reject('TIMEZONE_INVALID'); }
  const quietWindows = boundedArray(input.quietWindows, 8).map(window => {
    fields(window, ['startMinute', 'endMinute']); integer(window.startMinute, 0, 1439); integer(window.endMinute, 0, 1440);
    if (window.startMinute === window.endMinute) reject('INVALID_INPUT');
    return immutable(window);
  });
  const kinds = value => { const list = boundedArray(value, 4).map(kind => choice(kind, KINDS)); if (new Set(list).size !== list.length) reject('INVALID_INPUT'); return list; };
  integer(input.mergeWindowMs, 0, 8640000000000000); integer(input.minIntervalMs, 0, 8640000000000000);
  fields(input.frequency, ['windowMs', 'maxClaims']); integer(input.frequency.windowMs, 1, 8640000000000000); integer(input.frequency.maxClaims, 0, 4096);
  return immutable({ ...input, quietWindows, emergencyKinds: kinds(input.emergencyKinds), mergeKinds: kinds(input.mergeKinds) });
}

// Read-time hints are advisory. The core repeats every classification at the
// atomic claim, alongside exact grant, reservation, group and fact ownership.
function classification(spec, progress, at, window) {
  if (!spec.enabled) return 'disabled';
  const emergency = progress.some(item => spec.emergencyKinds.includes(item.kind));
  if (progress.length > 1 && progress.some(item => !spec.mergeKinds.includes(item.kind))) return 'merge_denied';
  if (!emergency && progress.every(item => spec.mergeKinds.includes(item.kind)) && at - Math.min(...progress.map(item => item.at)) < spec.mergeWindowMs) return 'coalesced';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: spec.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const minute = Number(parts.find(part => part.type === 'hour').value) * 60 + Number(parts.find(part => part.type === 'minute').value);
  if (!emergency && spec.quietWindows.some(w => w.startMinute < w.endMinute ? minute >= w.startMinute && minute < w.endMinute : minute >= w.startMinute || minute < w.endMinute)) return 'quiet';
  if (window && (at < window.windowStart || at < window.lastClaimAt)) return 'clock_unknown';
  if (window && at - window.lastClaimAt < spec.minIntervalMs) return 'interval';
  const count = window && at - window.windowStart < spec.frequency.windowMs ? window.count : 0;
  return count >= spec.frequency.maxClaims ? 'frequency' : 'eligible';
}

export class NotificationService {
  #store; #pipeline; #route;
  constructor(store, { resultPipeline, policyRef, recipientRef, channelRef, mergeKeyRef } = {}) {
    if (!store || ['context', 'snapshot', 'readData', 'artifact', 'getDelivery', 'configureNotificationPolicy', 'getNotificationPolicy'].some(name => typeof store[name] !== 'function') || !resultPipeline || ['writeArtifact', 'acceptDelivery', 'retryFailed', 'dispatch', 'reconcile'].some(name => typeof resultPipeline[name] !== 'function')) reject('INVALID_CONFIG');
    for (const value of [policyRef, recipientRef, channelRef, mergeKeyRef]) digestRef(value);
    this.#store = store; this.#pipeline = resultPipeline;
    this.#route = immutable({ policyRef, recipientRef, channelRef, mergeKeyRef });
  }
  configure(handle, input) {
    fields(input, ['commandRef', 'expectedRevision', 'spec']); digestRef(input.commandRef); integer(input.expectedRevision);
    return immutable(this.#store.configureNotificationPolicy(handle, { ...input, policyRef: this.#route.policyRef, spec: normalizeNotificationPolicy(input.spec) }));
  }
  policy(handle) { return immutable(this.#store.getNotificationPolicy(handle, { policyRef: this.#route.policyRef })); }
  #snapshot(handle, taskRef) {
    digestRef(taskRef);
    const context = this.#store.context(handle, taskRef);
    if (!['owner', 'coordinator', 'host'].includes(context.role)) reject('UNAUTHORIZED');
    return this.#store.snapshot(handle, { taskRef });
  }
  #progress(handle, taskRef, progressRefs, snapshot) {
    const refs = boundedArray(progressRefs).map(digestRef);
    if (!refs.length || new Set(refs).size !== refs.length) reject('INVALID_INPUT');
    return refs.map(progressRef => {
      const item = snapshot.progress.find(record => record.progressRef === progressRef);
      if (!item) reject('PROGRESS_NOT_FOUND');
      choice(item.kind, KINDS); integer(item.at);
      const data = this.#store.readData(handle, { taskRef, recordRef: item.recordRef });
      if (data.kind !== 'progress' || data.digest !== item.digest || bytesDigest(data.content) !== item.digest) reject('PROGRESS_BINDING_INVALID');
      let parsed; try { parsed = JSON.parse(data.content); } catch { reject('PROGRESS_REPORT_INVALID'); }
      const report = normalizeReport(parsed);
      return { ...item, report };
    });
  }
  #manifest(handle, taskRef, progressRefs, snapshot) {
    const progress = this.#progress(handle, taskRef, progressRefs, snapshot).sort((a, b) => a.progressRef.localeCompare(b.progressRef));
    return JSON.stringify(immutable({ version: 1, taskRef, ownerRef: snapshot.task.ownerRef, workspaceRef: snapshot.task.workspaceRef, progress: progress.map(p => ({ progressRef: p.progressRef, digest: p.digest, kind: p.kind, report: p.report })) }));
  }
  pending(handle, taskRef) {
    const snapshot = this.#snapshot(handle, taskRef), policy = this.policy(handle), spec = normalizeNotificationPolicy(policy.spec), at = integer(snapshot.observedAt);
    const endpoint = item => item.recipientRef === this.#route.recipientRef && item.channelRef === this.#route.channelRef;
    const group = snapshot.notifications.find(item => endpoint(item) && item.mergeKeyRef === this.#route.mergeKeyRef);
    const heldGroup = group && (!['delivered', 'failed'].includes(group.state) || !group.released);
    const window = policy.windows.find(endpoint), seen = new Set(), suppressed = [], retryRequired = [], candidates = [];
    for (const item of [...snapshot.progress].sort((a, b) => a.at - b.at || a.progressRef.localeCompare(b.progressRef))) {
      // Validate even suppressed records: corrupted report bytes never become a
      // candidate, trusted kind, emergency exception or diagnostic plaintext.
      this.#progress(handle, taskRef, [item.progressRef], snapshot);
      if (seen.has(item.digest)) { suppressed.push({ progressRef: item.progressRef, reason: 'duplicate_fact' }); continue; }
      seen.add(item.digest);
      const fact = snapshot.notificationFacts.find(f => endpoint(f) && f.digest === item.digest);
      if (fact?.state === 'delivered') { suppressed.push({ progressRef: item.progressRef, reason: 'delivered' }); continue; }
      if (fact && fact.state === 'failed' && fact.released) { retryRequired.push({ progressRef: item.progressRef, previousDeliveryRef: fact.deliveryRef }); continue; }
      candidates.push({ progressRef: item.progressRef, digest: item.digest, kind: item.kind, at: item.at, state: heldGroup || fact ? 'held' : classification(spec, [item], at, window) });
    }
    const mergeable = candidates.filter(p => p.state !== 'held' && spec.mergeKinds.includes(p.kind));
    const batches = [];
    for (let offset = 0; offset < mergeable.length; offset += 16) {
      const batch = mergeable.slice(offset, offset + 16);
      batches.push({ progressRefs: batch.map(p => p.progressRef), state: classification(spec, batch, at, window) });
    }
    for (const item of candidates.filter(p => p.state !== 'held' && !spec.mergeKinds.includes(p.kind))) batches.push({ progressRefs: [item.progressRef], state: item.state });
    return immutable({ taskRef, policyRef: policy.policyRef, policyRevision: policy.revision, timeZone: spec.timeZone, observedAt: at, candidates, batches, suppressed, retryRequired, heldDeliveryRef: heldGroup ? group.deliveryRef : null, notificationDelivered: false });
  }
  prepare(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'artifactRef', 'version', 'progressRefs']); binding(input);
    const snapshot = this.#snapshot(handle, input.taskRef), content = this.#manifest(handle, input.taskRef, input.progressRefs, snapshot);
    const { progressRefs, ...write } = input;
    return this.#pipeline.writeArtifact(handle, { ...write, content });
  }
  accept(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'policyRevision', 'progressRefs', 'previousDeliveryRef'], ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'policyRevision', 'progressRefs']); binding(input);
    const snapshot = this.#snapshot(handle, input.taskRef);
    const notification = normalizeNotificationBinding({ policyRef: this.#route.policyRef, policyRevision: input.policyRevision, progressRefs: input.progressRefs, mergeKeyRef: this.#route.mergeKeyRef });
    const expected = this.#manifest(handle, input.taskRef, notification.progressRefs, snapshot);
    const artifact = this.#store.artifact(handle, { taskRef: input.taskRef, artifactRef: input.artifactRef, version: input.artifactVersion });
    const data = this.#store.readData(handle, { taskRef: input.taskRef, recordRef: artifact.recordRef });
    if (data.content !== expected || data.digest !== input.digest || artifact.digest !== input.digest) reject('NOTIFICATION_ARTIFACT_MISMATCH');
    const { policyRevision, progressRefs, ...delivery } = input;
    const accepted = { ...delivery, recipientRef: this.#route.recipientRef, channelRef: this.#route.channelRef, notification };
    return Object.hasOwn(input, 'previousDeliveryRef') ? this.#pipeline.retryFailed(handle, accepted) : this.#pipeline.acceptDelivery(handle, accepted);
  }
  #delivery(handle, taskRef, deliveryRef) {
    this.#snapshot(handle, taskRef);
    const record = this.#store.getDelivery(handle, { taskRef, deliveryRef });
    if (!record.notification || record.notification.policyRef !== this.#route.policyRef || record.notification.mergeKeyRef !== this.#route.mergeKeyRef || record.recipientRef !== this.#route.recipientRef || record.channelRef !== this.#route.channelRef) reject('NOTIFICATION_BINDING_INVALID');
    return record;
  }
  dispatch(handle, input) {
    fields(input, ['taskRef', 'deliveryRef', 'actionRef', 'actionDigest', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch']); binding(input);
    for (const key of ['deliveryRef', 'actionRef', 'actionDigest']) digestRef(input[key]);
    input = immutable(input);
    this.#delivery(handle, input.taskRef, input.deliveryRef);
    return this.#pipeline.dispatch(handle, input);
  }
  reconcile(handle, taskRef, deliveryRef) { this.#delivery(handle, taskRef, deliveryRef); return this.#pipeline.reconcile(handle, taskRef, deliveryRef); }
}

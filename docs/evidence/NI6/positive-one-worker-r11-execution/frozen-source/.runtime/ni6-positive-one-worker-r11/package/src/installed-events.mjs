import { exact, canonical, canonicalDigest, reference, ref, integer, hash } from './runtime-security.mjs';
import { contextText } from './context.mjs';
import { scheduleSpec, dueOccurrences } from './event-clock.mjs';

export class InstalledEventsError extends Error {
  constructor(code) { super(code); this.name = 'InstalledEventsError'; this.code = code; }
}
const fail = code => { throw new InstalledEventsError(code); };
const MAX_TIME = 8640000000000000, MAX_START = MAX_TIME - 26 * 3600000;
const capture = value => {
  const copy = JSON.parse(canonical(value));
  const freeze = object => { if (object && typeof object === 'object') { Object.values(object).forEach(freeze); Object.freeze(object); } return object; };
  return freeze(copy);
};
const key = value => { if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(value)) fail('INVALID_INPUT'); return value; };
function rate(value) {
  exact(value, ['windowMs', 'maxEvents']); integer(value.windowMs, 1, MAX_TIME); integer(value.maxEvents, 0, 4096);
}

export function validateInstalledEvents(input) {
  try {
    if (input === undefined) return Object.freeze({ enabled: false });
    exact(input, ['enabled', 'ownerIngress', 'schedules'], ['enabled']);
    if (input.enabled === false) { exact(input, ['enabled']); return Object.freeze({ enabled: false }); }
    if (input.enabled !== true) fail('INVALID_INPUT');
    exact(input, ['enabled', 'ownerIngress', 'schedules']);
    // Canonicalize descriptors before reading arrays or nested selections.
    const selection = capture(input);
    if (!Array.isArray(selection.ownerIngress) || !Array.isArray(selection.schedules) ||
        selection.ownerIngress.length > 16 || selection.schedules.length > 16) fail('INVALID_INPUT');
    const keys = new Set();
    for (const item of [...selection.ownerIngress, ...selection.schedules]) {
      key(item.key); if (keys.has(item.key)) fail('INVALID_INPUT'); keys.add(item.key);
      integer(item.maxEventAgeMs, 0, MAX_TIME); rate(item.rate);
    }
    for (const item of selection.ownerIngress) {
      exact(item, ['key', 'maxEventAgeMs', 'rate', 'route']);
      if (!['new_task', 'supplement'].includes(item.route)) fail('INVALID_INPUT');
    }
    for (const item of selection.schedules) {
      exact(item, ['key', 'maxEventAgeMs', 'rate', 'route', 'spec', 'startAfter', 'pollMs', 'goalTaskRef', 'goalRecordRef']);
      if (item.route !== 'new_task') fail('INVALID_INPUT');
      scheduleSpec(item.spec); integer(item.startAfter, 0, MAX_START); integer(item.pollMs, 60000, 86400000);
      ref(item.goalTaskRef); ref(item.goalRecordRef);
    }
    return selection;
  } catch { fail('CONFIG_INVALID'); }
}

const INPUT_METHODS = ['isAlive', 'configureSource', 'configureLocalSubscription', 'readLocalSourcePair', 'source', 'subscription',
  'ingestLocalOwnerEvent', 'eventReceipt', 'listEventReceipts', 'readGoal', 'registerSchedule', 'tickSchedule',
  'statusSchedule', 'readScheduleClock', 'startSchedule', 'stopSchedule', 'unregisterSchedule', 'approveSchedule'];

export function createInstalledEvents(input) {
  exact(input, ['selection', 'identity', 'profile']);
  const selection = validateInstalledEvents(input.selection);
  exact(input.identity, ['ownerId', 'workspaceId']); exact(input.profile, ['dir', 'name']);
  for (const value of [...Object.values(input.identity), ...Object.values(input.profile)]) {
    if (typeof value !== 'string' || !value.trim()) fail('INVALID_INPUT'); contextText(value, [], 4096);
  }
  const namespace = canonicalDigest(['df.installed-events/v1', input.identity.ownerId, input.identity.workspaceId, input.profile.dir, input.profile.name]);
  const slots = new Map();
  for (const [kind, choices] of [['owner', selection.ownerIngress ?? []], ['schedule', selection.schedules ?? []]]) {
    for (const choice of choices) slots.set(choice.key, capture({ kind, choice,
      sourceRef: canonicalDigest([namespace, kind, choice.key, 'source']),
      subscriptionRef: canonicalDigest([namespace, kind, choice.key, 'subscription']),
      sourceIdentityRef: canonicalDigest([namespace, kind, choice.key, 'origin']),
      providerRef: hash(kind === 'owner' ? 'df.native-owner-ingress/v1' : 'df.native-schedule/v1'),
      adapterRef: hash(kind === 'owner' ? 'df.native-owner-adapter/v1' : 'df.native-schedule-adapter/v1') }));
  }
  // A composer installs no source, clock, token, timer or task.
  let installed = false;
  return Object.freeze({ installedAutomationInstaller(installation) {
    exact(installation, ['ctx', ...INPUT_METHODS]);
    if (!installation.ctx || INPUT_METHODS.some(name => typeof installation[name] !== 'function')) fail('EVENT_CAPABILITY_UNAVAILABLE');
    if (installed) fail('EVENT_ALREADY_INSTALLED'); installed = true;
    const api = { ...installation }, running = new Map(), lifecycleReceipts = new Map();
    let active = true;
    const live = () => { try { return active && api.isAlive() === true; } catch { return false; } };
    const check = () => { if (!live()) fail('SERVICE_DISPOSED'); if (!selection.enabled) fail('AUTOMATION_DISABLED'); };
    const slotFor = requested => { key(requested); const slot = slots.get(requested); if (!slot) fail('EVENT_SELECTION_UNAVAILABLE'); return slot; };
    function goal(slot) {
      const data = capture(api.readGoal({ taskRef: slot.choice.goalTaskRef, recordRef: slot.choice.goalRecordRef }));
      if (data.kind !== 'goal' || data.recordRef !== slot.choice.goalRecordRef || data.taskRef !== undefined && data.taskRef !== slot.choice.goalTaskRef) fail('GOAL_BINDING_INVALID');
      contextText(data.content, [], 65536); if (!data.content.trim() || data.digest !== hash(data.content)) fail('GOAL_BINDING_INVALID');
      return data;
    }
    function recipe(slot, targetTaskRef) {
      const template = slot.kind === 'schedule' ? goal(slot) : null;
      const value = { namespace, kind: slot.kind, choice: slot.choice,
        ...(template ? { goalDigest: template.digest } : {}), ...(targetTaskRef ? { targetTaskRef } : {}) };
      return { template, permissionPolicyRef: canonicalDigest(value),
        sourceSpec: { kind: slot.kind === 'schedule' ? 'schedule' : 'internal', identityMode: 'unique_id',
          enabled: true, adapterRef: slot.adapterRef, permissionPolicyRef: canonicalDigest(value),
          maxEventAgeMs: slot.choice.maxEventAgeMs, rate: slot.choice.rate },
        subscriptionSpec: { enabled: true, triggerRef: slot.kind === 'schedule' ? canonicalDigest(slot.choice.spec) : canonicalDigest(['owner-ingress', slot.choice.key]),
          route: slot.choice.route, ...(targetTaskRef ? { targetTaskRef } : {}) } };
    }
    function binding(slot, revisions) {
      check();
      const source = capture(api.source({ sourceRef: slot.sourceRef })), subscription = capture(api.subscription({ subscriptionRef: slot.subscriptionRef }));
      if (!source || !subscription) fail('EVENT_NOT_CONFIGURED');
      if (source.sourceRef !== slot.sourceRef || subscription.subscriptionRef !== slot.subscriptionRef || subscription.sourceRef !== slot.sourceRef) fail('ROUTE_MISMATCH');
      integer(source.revision, 1); integer(subscription.revision, 1);
      if (revisions && (source.revision !== revisions.expectedSourceRevision || subscription.revision !== revisions.expectedSubscriptionRevision)) fail('EVENT_CONFIGURATION_STALE');
      const target = slot.choice.route === 'supplement' ? ref(subscription.spec.targetTaskRef) : undefined;
      const current = recipe(slot, target);
      if (!source.spec.enabled || !subscription.spec.enabled) fail('EVENT_DISABLED');
      if (canonical(source.spec) !== canonical(current.sourceSpec) || canonical(subscription.spec) !== canonical(current.subscriptionSpec)) fail('ROUTE_MISMATCH');
      const association = capture(api.readLocalSourcePair({ sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef }));
      exact(association, ['pair', 'currentness']);
      if (association.currentness === 'missing') {
        if (association.pair !== null || subscription.localPairRef !== undefined) fail('STORAGE_INVALID');
        fail('EVENT_PAIR_MISSING');
      }
      if (!['current', 'stale'].includes(association.currentness)) fail('STORAGE_INVALID');
      validatePair(slot, source, subscription, association.pair);
      if (association.currentness !== 'current') fail('EVENT_PAIR_STALE');
      check(); return { source, subscription, ...current };
    }
    function validatePair(slot, source, subscription, pair) {
      exact(pair, ['contractVersion', 'pairRef', 'sourceRef', 'sourceRevision', 'sourceSpecDigest', 'subscriptionRef', 'subscriptionRevision', 'subscriptionSpecDigest']);
      if (pair.contractVersion !== 'df.local-source-pair/v1') fail('STORAGE_INVALID');
      for (const name of ['pairRef', 'sourceRef', 'sourceSpecDigest', 'subscriptionRef', 'subscriptionSpecDigest']) ref(pair[name]);
      integer(pair.sourceRevision, 1); integer(pair.subscriptionRevision, 1);
      const pairRef = canonicalDigest({ sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef });
      if (pair.pairRef !== pairRef || subscription.localPairRef !== pairRef || pair.sourceRef !== slot.sourceRef || pair.subscriptionRef !== slot.subscriptionRef) fail('STORAGE_INVALID');
      if (pair.sourceRevision !== source.revision || pair.subscriptionRevision !== subscription.revision ||
          pair.sourceSpecDigest !== canonicalDigest(source.spec) || pair.subscriptionSpecDigest !== canonicalDigest(subscription.spec)) fail('EVENT_PAIR_STALE');
    }
    function sealSchedule(slot) {
      const entry = running.get(slot.choice.key); if (!entry) return;
      entry.active = false; running.delete(slot.choice.key);
      // Unregister even when a separate stop fails; stale callbacks are sealed.
      try { api.stopSchedule(entry.token); } finally { api.unregisterSchedule(entry.token); }
    }
    function lifecycle(input, operation, execute) {
      const digest = canonicalDigest({ operation, input }), prior = lifecycleReceipts.get(input.commandRef);
      if (prior) { if (prior.digest !== digest) fail('IDEMPOTENCY_CONFLICT'); return prior.receipt; }
      if (lifecycleReceipts.size >= 128) fail('EVENT_LIFECYCLE_CAPACITY');
      const receipt = capture(execute()); lifecycleReceipts.set(input.commandRef, { digest, receipt }); return receipt;
    }
    const configureLocalAutomation = input => {
      exact(input, ['key', 'commandRef', 'expectedSourceRevision', 'expectedSubscriptionRevision', 'enabled', 'targetTaskRef'],
        ['key', 'commandRef', 'expectedSourceRevision', 'expectedSubscriptionRevision', 'enabled']);
      input = capture(input); ref(input.commandRef); integer(input.expectedSourceRevision); integer(input.expectedSubscriptionRevision);
      if (typeof input.enabled !== 'boolean') fail('INVALID_INPUT'); check(); const slot = slotFor(input.key);
      if (slot.choice.route === 'supplement') ref(input.targetTaskRef); else if (input.targetTaskRef !== undefined) fail('INVALID_INPUT');
      const current = recipe(slot, input.targetTaskRef); sealSchedule(slot); check();
      const source = capture(api.configureSource({ commandRef: canonicalDigest([input.commandRef, 'source']), sourceRef: slot.sourceRef,
        expectedRevision: input.expectedSourceRevision, spec: { ...current.sourceSpec, enabled: input.enabled } }));
      check(); if (source.sourceRef !== slot.sourceRef) fail('ROUTE_MISMATCH'); integer(source.revision, 1);
      const association = capture(api.configureLocalSubscription({ commandRef: canonicalDigest([input.commandRef, 'subscription']), sourceRef: slot.sourceRef,
        subscriptionRef: slot.subscriptionRef, expectedRevision: input.expectedSubscriptionRevision,
        expectedSourceRevision: source.revision, spec: { ...current.subscriptionSpec, enabled: input.enabled } }));
      exact(association, ['subscription', 'pair']); const { subscription, pair } = association;
      check(); if (subscription.subscriptionRef !== slot.subscriptionRef || subscription.sourceRef !== slot.sourceRef) fail('ROUTE_MISMATCH'); integer(subscription.revision, 1);
      validatePair(slot, source, subscription, pair); check();
      return capture({ key: input.key, sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef,
        sourceRevision: source.revision, subscriptionRevision: subscription.revision, enabled: input.enabled });
    };
    const ingestLocalEvent = input => {
      exact(input, ['key', 'commandRef', 'eventId', 'goal', 'taskId', 'expectedTaskVersion', 'expectedAuthEpoch'], ['key', 'commandRef', 'eventId', 'goal']);
      input = capture(input); check(); const slot = slotFor(input.key);
      if (slot.kind !== 'owner') fail('EVENT_SELECTION_UNAVAILABLE');
      if (slot.choice.route === 'new_task') exact(input, ['key', 'commandRef', 'eventId', 'goal', 'taskId']);
      else exact(input, ['key', 'commandRef', 'eventId', 'goal', 'expectedTaskVersion', 'expectedAuthEpoch']);
      ref(input.commandRef); const eventIdRef = reference(input.eventId); contextText(input.goal, [], 65536);
      if (!input.goal.trim()) fail('INVALID_INPUT'); if (slot.choice.route === 'new_task') reference(input.taskId);
      else { integer(input.expectedTaskVersion, 1); integer(input.expectedAuthEpoch); }
      const current = binding(slot); check();
      const receipt = api.ingestLocalOwnerEvent({ commandRef: input.commandRef, sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef,
        expectedSourceRevision: current.source.revision, expectedSubscriptionRevision: current.subscription.revision,
        adapterRef: slot.adapterRef, permissionPolicyRef: current.permissionPolicyRef, providerRef: slot.providerRef, sourceIdentityRef: slot.sourceIdentityRef,
        eventIdRef, goal: input.goal, ...(slot.choice.route === 'new_task' ? { taskId: input.taskId } : {
          targetTaskRef: current.subscription.spec.targetTaskRef, expectedTaskVersion: input.expectedTaskVersion, expectedAuthEpoch: input.expectedAuthEpoch }) });
      check(); return capture(receipt);
    };
    const startLocalSchedule = input => {
      exact(input, ['key', 'commandRef', 'expectedSourceRevision', 'expectedSubscriptionRevision']); input = capture(input);
      ref(input.commandRef); integer(input.expectedSourceRevision, 1); integer(input.expectedSubscriptionRevision, 1);
      check(); const slot = slotFor(input.key); if (slot.kind !== 'schedule') fail('EVENT_SELECTION_UNAVAILABLE');
      const current = binding(slot, input);
      return lifecycle(input, 'start', () => {
        if (running.has(input.key)) fail('SCHEDULE_ALREADY_RUNNING');
        const entry = { active: true, token: null, lastState: null };
        const isCurrent = () => {
          if (!live() || !entry.active) return false;
          try { const next = binding(slot, input); return next.template.digest === current.template.digest; } catch { return false; }
        };
        try {
          entry.token = api.registerSchedule({ sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef, adapterRef: slot.adapterRef,
            providerRef: slot.providerRef, sourceIdentityRef: slot.sourceIdentityRef, spec: slot.choice.spec, startAfter: slot.choice.startAfter,
            goal: current.template.content, externalEffect: true, authorize: () => isCurrent(), isCurrent });
          running.set(input.key, entry); check();
          api.startSchedule(entry.token, { pollMs: slot.choice.pollMs, onStatus: status => {
            if (!isCurrent() || running.get(input.key) !== entry) return;
            const known = ['admitted', 'nothing_due', 'verification_required', 'skipped', 'not_started', 'admission_blocked'];
            try { exact(status, ['state', 'missedCount', 'clockRef', 'expectedCursor', 'planDigest', 'through', 'occurrenceRef', 'scheduledAt', 'receipt', 'startAfter'], ['state']);
              entry.lastState = known.includes(status.state) ? status.state : 'admission_blocked'; } catch { entry.lastState = 'admission_blocked'; }
          } });
          check(); if (!isCurrent()) fail('EVENT_CONFIGURATION_STALE');
        } catch (error) { sealSchedule(slot); throw error; }
        return { key: input.key, sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef, polling: true,
          sourceRevision: current.source.revision, subscriptionRevision: current.subscription.revision };
      });
    };
    const stopLocalSchedule = input => {
      exact(input, ['key', 'commandRef']); input = capture(input); ref(input.commandRef); check();
      const slot = slotFor(input.key); if (slot.kind !== 'schedule') fail('EVENT_SELECTION_UNAVAILABLE');
      return lifecycle(input, 'stop', () => { sealSchedule(slot); return { key: input.key, polling: false }; });
    };
    function pendingProjection(value) {
      if (value === null) return null;
      exact(value, ['through', 'planDigest', 'approved', 'approvedAt', 'approverRef'], ['through', 'planDigest', 'approved']);
      integer(value.through, 0, MAX_TIME); ref(value.planDigest); if (typeof value.approved !== 'boolean') fail('CLOCK_UNAVAILABLE');
      if (Object.hasOwn(value, 'approvedAt') !== Object.hasOwn(value, 'approverRef')) fail('CLOCK_UNAVAILABLE');
      if (value.approvedAt !== undefined) { integer(value.approvedAt, 0, MAX_TIME); ref(value.approverRef); }
      return capture(value);
    }
    function clockProjection(slot, base, current) {
      try {
        const clock = capture(api.readScheduleClock({ sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef, clockRef: base.clockRef }));
        if (clock === null) { base.clockReason = 'CLOCK_MISSING'; return; }
        exact(clock, ['sourceRef', 'subscriptionRef', 'clockRef', 'cursor', 'decision', 'planDigest', 'sourceRevision',
          'subscriptionRevision', 'pendingVerification', 'resolvedVerification'], ['sourceRef', 'subscriptionRef', 'clockRef', 'cursor', 'decision',
          'planDigest', 'sourceRevision', 'subscriptionRevision', 'pendingVerification']);
        if (clock.sourceRef !== slot.sourceRef || clock.subscriptionRef !== slot.subscriptionRef || clock.clockRef !== base.clockRef) fail('CLOCK_UNAVAILABLE');
        if (clock.cursor !== null) integer(clock.cursor, 0, MAX_TIME);
        integer(clock.sourceRevision, 1); integer(clock.subscriptionRevision, 1); ref(clock.planDigest);
        if (!['skipped', 'verification_required', 'ingested'].includes(clock.decision)) fail('CLOCK_UNAVAILABLE');
        const pending = pendingProjection(clock.pendingVerification);
        if (clock.resolvedVerification !== undefined) pendingProjection(clock.resolvedVerification);
        const clockCurrent = !!current && clock.sourceRevision === current.source.revision && clock.subscriptionRevision === current.subscription.revision;
        Object.assign(base, { cursor: clock.cursor, pendingVerification: pending, clockCurrent,
          clockSourceRevision: clock.sourceRevision, clockSubscriptionRevision: clock.subscriptionRevision,
          clockDecision: { decision: clock.decision, planDigest: clock.planDigest }, clockReason: clockCurrent ? null : 'CLOCK_NOT_CURRENT' });
      } catch {
        Object.assign(base, { cursor: null, pendingVerification: null, clockCurrent: null,
          clockSourceRevision: null, clockSubscriptionRevision: null, clockDecision: null, clockReason: 'CLOCK_UNAVAILABLE' });
      }
    }
    function proposal(slot, base) {
      const after = base.cursor ?? slot.choice.startAfter;
      // This is a bounded read-only proposal, never cursor/approval authority.
      // The owner-selected scan budget can deliberately be insufficient.
      // dueOccurrences scans 26h on either side plus rounded minute edges.
      const scanMarginMinutes = 2 * 26 * 60 + 1;
      const budget = slot.choice.spec.kind === 'interval' ? slot.choice.spec.intervalMs :
        Math.max(0, slot.choice.spec.maxScanMinutes - scanMarginMinutes) * 60000;
      const through = base.pendingVerification?.through ?? Math.min(MAX_START, after + budget);
      if (through <= after) return null;
      try { return dueOccurrences(slot.choice.spec, after, through)[0] ?? null; } catch { return null; }
    }
    const localAutomationStatus = input => {
      exact(input, ['key'], []); input = capture(input);
      if (!live()) fail('SERVICE_DISPOSED'); if (input.key !== undefined) slotFor(input.key);
      const selected = input.key === undefined ? [...slots.values()] : [slots.get(input.key)];
      const statuses = selected.map(slot => {
        const base = { key: slot.choice.key, kind: slot.kind, sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef,
          ready: false, reason: selection.enabled ? 'EVENT_NOT_CONFIGURED' : 'AUTOMATION_DISABLED', sourceRevision: null, subscriptionRevision: null,
          polling: false, timezone: slot.kind === 'schedule' ? slot.choice.spec.timezone : null,
          scheduleDigest: slot.kind === 'schedule' ? canonicalDigest(slot.choice.spec) : null, cursor: null, pendingVerification: null, lastState: null,
          clockRef: null, clockCurrent: null, clockSourceRevision: null, clockSubscriptionRevision: null, clockDecision: null, clockReason: null, nextProposedOccurrence: null };
        if (!selection.enabled) return base;
        let current = null;
        try {
          current = binding(slot); Object.assign(base, { ready: true, reason: null, sourceRevision: current.source.revision, subscriptionRevision: current.subscription.revision });
        } catch (error) { base.ready = false; base.reason = error instanceof InstalledEventsError ? error.code : 'EVENT_UNAVAILABLE'; }
        if (slot.kind === 'schedule') {
          base.clockRef = canonicalDigest({ sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef, scheduleDigest: base.scheduleDigest });
          clockProjection(slot, base, current);
          if (base.clockReason !== 'CLOCK_UNAVAILABLE') base.nextProposedOccurrence = proposal(slot, base);
          const entry = running.get(slot.choice.key);
          if (entry) {
            try {
              if (!entry.active) fail('SERVICE_DISPOSED'); const status = capture(api.statusSchedule(entry.token));
              if (status.sourceRef !== slot.sourceRef || status.subscriptionRef !== slot.subscriptionRef || status.scheduleDigest !== base.scheduleDigest) fail('ROUTE_MISMATCH');
              Object.assign(base, { polling: status.polling === true, lastState: entry.lastState });
            } catch { base.ready = false; base.reason = 'EVENT_UNAVAILABLE'; }
          }
        }
        return base;
      });
      // A private closure can synchronously retire its parent while resolving.
      if (!live()) fail('SERVICE_DISPOSED');
      return capture({ enabled: selection.enabled, slots: statuses });
    };
    const dispose = () => {
      if (!active) return; active = false;
      let failed = false;
      for (const slot of slots.values()) { try { sealSchedule(slot); } catch { failed = true; } }
      lifecycleReceipts.clear(); if (failed) fail('EVENT_DISPOSAL_UNAVAILABLE');
    };
    return Object.freeze({ configureLocalAutomation, ingestLocalEvent, localAutomationStatus, startLocalSchedule, stopLocalSchedule, dispose });
  } });
}

import { exact, integer, ref, canonicalDigest } from './runtime-security.mjs';
import { eventCapture } from './events.mjs';
import { contextText } from './context.mjs';
import { scheduleSpec, dueOccurrences, missedPlan } from './event-clock.mjs';

export class SchedulerError extends Error {
  constructor(code) { super(code); this.name = 'SchedulerError'; this.code = code; }
}
const fail = code => { throw new SchedulerError(code); };
const MAX_TIME = 8640000000000000 - 26 * 3600000;

// Private host timers admit only durable task ingress. They never claim an
// action, wake a model or send an external side effect. Ledger is authoritative.
export class ScheduleDriver {
  #store; #host; #router; #clock; #alive; #secrets; #timers; #entries = new Map(); #active = true;
  constructor({ store, hostHandle, router, clock = Date.now, isAlive = () => true,
    knownSecrets = [], timers = { set: setTimeout, clear: clearTimeout } } = {}) {
    if (!store || ['eventClock', 'advanceEventClock'].some(name => typeof store[name] !== 'function') ||
        !hostHandle || !router || ['register', 'binding', 'ingest', 'unregister'].some(name => typeof router[name] !== 'function') ||
        typeof clock !== 'function' || typeof isAlive !== 'function' ||
        !timers || typeof timers.set !== 'function' || typeof timers.clear !== 'function') fail('SCHEDULE_CAPABILITY_UNAVAILABLE');
    contextText('', knownSecrets); this.#store = store; this.#host = hostHandle; this.#router = router;
    this.#clock = clock; this.#alive = isAlive; this.#secrets = [...knownSecrets]; this.#timers = timers;
  }
  #check(entry) {
    let live = false; try { live = this.#active && this.#alive() === true && (!entry || entry.active); } catch {}
    if (!live) fail('SERVICE_DISPOSED');
  }
  #now() { try { return integer(this.#clock(), 0, MAX_TIME); } catch { fail('SCHEDULE_CLOCK_INVALID'); } }
  #entry(token) { const entry = this.#entries.get(token); this.#check(entry); if (!entry) fail('SCHEDULE_REGISTRATION_INVALID'); return entry; }
  register(input) {
    this.#check();
    exact(input, ['sourceRef', 'subscriptionRef', 'adapterRef', 'providerRef', 'sourceIdentityRef',
      'spec', 'startAfter', 'goal', 'externalEffect', 'authorize', 'isCurrent']);
    for (const key of ['sourceRef', 'subscriptionRef', 'adapterRef', 'providerRef', 'sourceIdentityRef']) ref(input[key]);
    const spec = scheduleSpec(input.spec), scheduleDigest = canonicalDigest(spec);
    integer(input.startAfter, 0, MAX_TIME); contextText(input.goal, this.#secrets, 65536);
    if (!input.goal.trim() || typeof input.externalEffect !== 'boolean' || typeof input.authorize !== 'function' ||
        typeof input.isCurrent !== 'function') fail('SCHEDULE_REGISTRATION_INVALID');
    if (this.#entries.size >= 32) fail('SCHEDULE_CAPACITY');
    const entry = { ...input, spec, scheduleDigest, active: true, busy: false, timer: null, polling: false };
    entry.clockRef = canonicalDigest({ sourceRef: entry.sourceRef, subscriptionRef: entry.subscriptionRef, scheduleDigest });
    entry.routerToken = this.#router.register({ sourceRef: entry.sourceRef, subscriptionRef: entry.subscriptionRef,
      adapterRef: entry.adapterRef, providerRef: entry.providerRef, sourceIdentityRef: entry.sourceIdentityRef,
      verify: payload => {
        this.#check(entry); exact(payload, ['scheduleDigest', 'at', 'occurrenceRef']);
        if (payload.scheduleDigest !== scheduleDigest || payload.at < 1 ||
            !dueOccurrences(spec, payload.at - 1, payload.at).some(item => item.occurrenceRef === payload.occurrenceRef)) fail('SCHEDULE_OCCURRENCE_INVALID');
        return { providerRef: entry.providerRef, sourceIdentityRef: entry.sourceIdentityRef,
          eventIdRef: payload.occurrenceRef, observedAt: payload.at };
      },
      authorize: entry.authorize, isCurrent: proof => entry.active && entry.isCurrent(proof) === true,
      normalize: () => ({ goal: entry.goal }) });
    const token = Object.freeze({});
    try { this.#binding(entry); this.#entries.set(token, entry); return token; }
    catch (error) { this.#router.unregister(entry.routerToken); throw error; }
  }
  #binding(entry) {
    this.#check(entry); const binding = this.#router.binding(entry.routerToken);
    if (binding.source.spec.kind !== 'schedule' || binding.source.spec.identityMode !== 'unique_id' ||
        binding.subscription.spec.triggerRef !== entry.scheduleDigest) fail('SCHEDULE_BINDING_MISMATCH');
    return binding;
  }
  #planDigest(entry, binding, after, through, occurrences) {
    return canonicalDigest({ clockRef: entry.clockRef, scheduleDigest: entry.scheduleDigest,
      sourceRevision: binding.source.revision, subscriptionRevision: binding.subscription.revision,
      after, through, occurrences, externalEffect: entry.externalEffect });
  }
  status(token) {
    const entry = this.#entry(token), { source, subscription } = this.#binding(entry), now = this.#now();
    const clock = this.#store.eventClock(this.#host, { sourceRef: entry.sourceRef, subscriptionRef: entry.subscriptionRef, clockRef: entry.clockRef });
    return eventCapture({ sourceRef: entry.sourceRef, subscriptionRef: entry.subscriptionRef,
      scheduleDigest: entry.scheduleDigest, timezone: entry.spec.timezone, clockRef: entry.clockRef,
      sourceRevision: source.revision, subscriptionRevision: subscription.revision,
      cursor: clock?.cursor ?? null, pendingVerification: clock?.pendingVerification ?? null,
      observedAt: now, polling: entry.polling });
  }
  async tick(token) {
    const entry = this.#entry(token); if (entry.busy) fail('SCHEDULE_BUSY'); entry.busy = true;
    try {
      const binding = this.#binding(entry), { source, subscription } = binding, now = this.#now();
      const clock = this.#store.eventClock(this.#host, { sourceRef: entry.sourceRef, subscriptionRef: entry.subscriptionRef, clockRef: entry.clockRef });
      const expectedCursor = clock?.cursor ?? null, after = expectedCursor ?? entry.startAfter;
      if (now < after) {
        if (expectedCursor === null) return eventCapture({ state: 'not_started', startAfter: after, clockRef: entry.clockRef });
        fail('SCHEDULE_CLOCK_ROLLBACK');
      }
      if (clock?.pendingVerification && (clock.sourceRevision !== source.revision || clock.subscriptionRevision !== subscription.revision)) fail('SCHEDULE_PLAN_STALE');
      const through = clock?.pendingVerification?.through ?? now;
      const occurrences = dueOccurrences(entry.spec, after, through);
      const plan = missedPlan(entry.spec, occurrences, now, { externalEffect: entry.externalEffect });
      const common = { sourceRef: entry.sourceRef, subscriptionRef: entry.subscriptionRef,
        expectedSourceRevision: source.revision, expectedSubscriptionRevision: subscription.revision,
        clockRef: entry.clockRef, expectedCursor };
      if (!clock?.pendingVerification && plan.state === 'nothing_due') {
        if (through > after) this.#store.advanceEventClock(this.#host, { ...common,
          commandRef: canonicalDigest({ ...common, through, kind: 'empty_clock' }), through, decision: 'skipped',
          planDigest: this.#planDigest(entry, binding, after, through, occurrences) });
        return eventCapture({ state: 'nothing_due', missedCount: 0, clockRef: entry.clockRef });
      }
      const due = occurrences.at(-1);
      if (!due) fail('SCHEDULE_PLAN_STALE');
      const planDigest = this.#planDigest(entry, binding, after, due.at, occurrences);
      if (clock?.pendingVerification) {
        if (clock.pendingVerification.planDigest !== planDigest || clock.pendingVerification.through !== due.at) fail('SCHEDULE_PLAN_STALE');
        if (!clock.pendingVerification.approved) return eventCapture({ state: 'verification_required', clockRef: entry.clockRef,
          expectedCursor, planDigest, through: due.at, missedCount: occurrences.length });
      } else if (['skipped', 'verification_required'].includes(plan.state)) {
        this.#store.advanceEventClock(this.#host, { ...common, through: due.at, decision: plan.state, planDigest,
          commandRef: canonicalDigest({ ...common, through: due.at, decision: plan.state, planDigest }) });
        return eventCapture({ state: plan.state, clockRef: entry.clockRef, expectedCursor, planDigest,
          through: due.at, missedCount: occurrences.length });
      }
      this.#check(entry);
      const receipt = await this.#router.ingest(entry.routerToken, {
        commandRef: canonicalDigest({ clockRef: entry.clockRef, occurrenceRef: due.occurrenceRef, kind: 'schedule_ingress' }),
        taskId: `df-schedule-${due.occurrenceRef}`, payload: { scheduleDigest: entry.scheduleDigest, at: due.at, occurrenceRef: due.occurrenceRef },
        clockRef: entry.clockRef, expectedCursor, scheduledAt: due.at,
        ...(clock?.pendingVerification ? { verificationPlanDigest: planDigest } : {}) });
      return eventCapture({ state: 'admitted', missedCount: occurrences.length, clockRef: entry.clockRef,
        occurrenceRef: due.occurrenceRef, scheduledAt: due.at, receipt });
    } finally { entry.busy = false; }
  }
  start(token, input) {
    const entry = this.#entry(token); exact(input, ['pollMs', 'onStatus']);
    integer(input.pollMs, 60000, 86400000); if (typeof input.onStatus !== 'function') fail('SCHEDULE_REGISTRATION_INVALID');
    const pollMs = input.pollMs, onStatus = input.onStatus;
    if (entry.polling) fail('SCHEDULE_ALREADY_RUNNING'); entry.polling = true;
    const schedule = () => {
      this.#check(entry); if (!entry.polling) return;
      entry.timer = this.#timers.set(async () => {
        entry.timer = null;
        let result;
        try { result = await this.tick(token); }
        catch { result = Object.freeze({ state: 'admission_blocked' }); }
        try { this.#check(entry); if (entry.polling) onStatus(result); } catch {}
        finally { try { if (entry.polling) schedule(); } catch { entry.polling = false; } }
      }, pollMs);
      entry.timer?.unref?.();
    };
    try { schedule(); } catch (error) { entry.polling = false; throw error; }
  }
  stop(token) { const entry = this.#entry(token); entry.polling = false; if (entry.timer !== null) this.#timers.clear(entry.timer); entry.timer = null; }
  unregister(token) {
    const entry = this.#entries.get(token); if (!entry) return;
    entry.active = false; entry.polling = false; if (entry.timer !== null) this.#timers.clear(entry.timer);
    this.#router.unregister(entry.routerToken); this.#entries.delete(token);
  }
  dispose() { this.#active = false; for (const token of [...this.#entries.keys()]) this.unregister(token); }
}

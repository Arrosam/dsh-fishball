import { fields, binding, digestRef, choice, immutable, reject, integer } from './messages.mjs';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'deleted']);
export function applicableControls(task, paused = false) {
  if (!task || TERMINAL.has(task.status)) return Object.freeze([]);
  if (['recovery_required', 'cancel_requested'].includes(task.status)) return Object.freeze(task.status === 'cancel_requested' ? [] : ['pause', 'cancel']);
  return Object.freeze(paused ? ['resume', 'cancel'] : ['pause', 'cancel']);
}

export class TaskControl {
  #store;
  constructor(store) {
    if (!store || typeof store.control !== 'function' || typeof store.snapshot !== 'function') reject('INVALID_CONFIG');
    this.#store = store;
  }
  apply(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'kind']);
    binding(input); choice(input.kind, ['pause', 'resume', 'cancel']);
    let receipt;
    try { receipt = this.#store.control(handle, input); }
    catch (error) {
      if (['STORAGE_UNAVAILABLE', 'STORAGE_RESTRICTED', 'CLOSED', 'CONTROL_TRANSPORT_UNKNOWN'].includes(error?.code)) return immutable({ outcome: 'unknown', reasonCode: error.code, binding: binding(input), reconciliation: 'read_current' });
      if (!['STALE_VERSION', 'STALE_AUTHORITY', 'TASK_TERMINAL', 'TASK_BLOCKED'].includes(error?.code)) throw error;
      const snapshot = this.#store.snapshot(handle, { taskRef: input.taskRef });
      return immutable({ outcome: ['STALE_VERSION', 'STALE_AUTHORITY'].includes(error.code) ? 'stale' : 'rejected', reasonCode: error.code, task: snapshot.task, observedAt: snapshot.observedAt, reconciliation: 'read_current' });
    }
    return immutable({ ...receipt, outcome: input.kind === 'cancel' && receipt.reservationsHeld > 0 ? 'partial' : 'applied', dispatchState: receipt.control === 'active' ? 'open' : 'blocked', terminationState: input.kind === 'cancel' ? 'requested' : 'not_requested', reconciliation: input.kind === 'cancel' && receipt.reservationsHeld > 0 ? 'query_effect' : 'none' });
  }
  refresh(handle, taskRef) {
    digestRef(taskRef);
    const snapshot = this.#store.snapshot(handle, { taskRef });
    return immutable({ ...snapshot, isSnapshot: true, allowedControls: applicableControls(snapshot.task, snapshot.control === 'paused') });
  }
  list(handle, pagination) {
    if (typeof this.#store.listTasks !== 'function') reject('CAPABILITY_UNAVAILABLE');
    fields(pagination, ['offset', 'limit']); integer(pagination.offset); integer(pagination.limit, 1, 128);
    const tasks = this.#store.listTasks(handle), items = tasks.slice(pagination.offset, pagination.offset + pagination.limit).map(task => ({ ...task, isSnapshot: true }));
    return immutable({ items, total: tasks.length, offset: pagination.offset, limit: pagination.limit, hasMore: pagination.offset + items.length < tasks.length, isSnapshot: true });
  }
}

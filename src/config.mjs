import { isAbsolute } from 'node:path';
import { types } from 'node:util';

export const HOST_TARGET = 'dsh-web-0.2.1-rc.2';
export const DEFAULT_LIMITS = Object.freeze({
  queueCapacity: 32, maxActive: 2, maxAttempts: 3, maxTasks: 1000,
  maxActionsPerTask: 16, maxEventsPerTask: 128, maxMetadataBytes: 1024,
});
const ceilings = Object.freeze({
  queueCapacity: 1000, maxActive: 32, maxAttempts: 10, maxTasks: 10000,
  maxActionsPerTask: 64, maxEventsPerTask: 1024, maxMetadataBytes: 4096,
});

export class BootstrapError extends Error {
  constructor(code) { super(code); this.name = 'BootstrapError'; this.code = code; }
}

// Reject accessors and unusual prototypes before inspecting values. Diagnostics
// never interpolate configuration keys, paths, values, or exception messages.
export function record(value, allowed, code = 'CONFIG_INVALID') {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new BootstrapError(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' ||
      !allowed.includes(key) || !('value' in descriptors[key]) || !descriptors[key].enumerable)) throw new BootstrapError(code);
  return value;
}

export function validateConfig(input) {
  try {
    record(input, ['databasePath', 'hostTarget', 'limits']);
    if (typeof input.databasePath !== 'string' || !isAbsolute(input.databasePath) ||
        input.databasePath.length > 1024 || /[\x00-\x1f\x7f]/.test(input.databasePath)) throw new BootstrapError('CONFIG_INVALID');
    if (input.hostTarget !== undefined && input.hostTarget !== HOST_TARGET) throw new BootstrapError('HOST_TARGET_UNSUPPORTED');
    const provided = input.limits === undefined ? {} : input.limits;
    record(provided, Object.keys(DEFAULT_LIMITS));
    const limits = { ...DEFAULT_LIMITS, ...provided };
    for (const [key, value] of Object.entries(limits)) {
      if (!Number.isSafeInteger(value) || value < 1 || value > ceilings[key]) throw new BootstrapError('CONFIG_INVALID');
    }
    if (limits.maxActive > limits.queueCapacity || limits.queueCapacity > limits.maxTasks) throw new BootstrapError('CONFIG_INVALID');
    if (limits.maxMetadataBytes < 256) throw new BootstrapError('CONFIG_INVALID');
    return Object.freeze({ databasePath: input.databasePath, hostTarget: HOST_TARGET, limits: Object.freeze(limits) });
  } catch (error) {
    throw error instanceof BootstrapError ? error : new BootstrapError('CONFIG_INVALID');
  }
}

// Cordis consumes a synchronous Standard Schema interface.
export const Config = Object.freeze({ '~standard': Object.freeze({
  version: 1, vendor: 'df',
  validate(value) {
    try { return { value: validateConfig(value) }; }
    catch (error) { return { issues: [{ message: error.code }] }; }
  },
}) });

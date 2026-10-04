import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Config, DEFAULT_LIMITS, HOST_TARGET, record, validateConfig } from '../src/config.mjs';
import { DESKTOP_APP_ROOT, probeHost } from '../src/host-probe.mjs';

test('configuration defaults are immutable and input remains unchanged', () => {
  const input = { databasePath: '/tmp/synthetic-ledger.sqlite', limits: { maxActive: 1 } };
  const config = validateConfig(input);
  assert.equal(config.hostTarget, HOST_TARGET);
  assert.deepEqual(config.limits, { ...DEFAULT_LIMITS, maxActive: 1 });
  assert.deepEqual(input.limits, { maxActive: 1 });
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.limits));
});

test('malformed config and unsupported targets fail with redacted stable codes', () => {
  const sentinel = 'SYNTHETIC_SECRET_DO_NOT_LOG';
  for (const value of [undefined, null, [], 1, sentinel,
    { databasePath: sentinel }, { databasePath: '/tmp/a', [sentinel]: true },
    { databasePath: '/tmp/a', hostTarget: sentinel },
    { databasePath: '/tmp/a', limits: { [sentinel]: 1 } },
    { databasePath: '/tmp/a', limits: null },
    { databasePath: '/tmp/a', limits: { queueCapacity: 2, maxActive: 3 } },
    { databasePath: '/tmp/a', limits: { queueCapacity: 1001 } },
    { databasePath: '/tmp/a', limits: { maxTasks: 1 } },
    { databasePath: '/tmp/a', limits: { maxMetadataBytes: 4097 } },
    { databasePath: '/tmp/\u0000a' },
    Object.create({ databasePath: '/tmp/a' }),
    Object.defineProperty({}, 'databasePath', { get() { throw new Error(sentinel); } }),
  ]) {
    assert.throws(() => validateConfig(value), error => {
      assert.equal(error.message.includes(sentinel), false);
      return ['CONFIG_INVALID', 'HOST_TARGET_UNSUPPORTED'].includes(error.code);
    });
  }
});

test('each limit rejects invalid type, zero, negatives and fractions', () => {
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    for (const value of [0, -1, -0, 1.5, NaN, Infinity, '1', true, undefined, null]) {
      assert.throws(() => validateConfig({ databasePath: '/tmp/a', limits: { [key]: value } }), { code: 'CONFIG_INVALID' });
    }
  }
});

test('metadata minimum matches core at N-1, N and N+1 before storage opens', () => {
  for (const value of [255, 256, 257]) {
    const input = { databasePath: '/tmp/synthetic-ledger.sqlite', limits: { maxMetadataBytes: value } };
    if (value === 255) {
      assert.throws(() => validateConfig(input), { code: 'CONFIG_INVALID' });
      assert.deepEqual(Config['~standard'].validate(input), { issues: [{ message: 'CONFIG_INVALID' }] });
    } else {
      assert.equal(validateConfig(input).limits.maxMetadataBytes, value);
      assert.equal(Config['~standard'].validate(input).value.limits.maxMetadataBytes, value);
    }
  }
});

test('hidden valid and invalid limits reject before defaults can weaken explicit caps', () => {
  for (const value of [1, 0]) {
    const limits = Object.defineProperty({}, 'maxActive', { value });
    const input = { databasePath: '/tmp/synthetic-ledger.sqlite', limits };
    assert.throws(() => validateConfig(input), { code: 'CONFIG_INVALID', message: 'CONFIG_INVALID' });
    assert.deepEqual(Config['~standard'].validate(input), { issues: [{ message: 'CONFIG_INVALID' }] });
  }
});

test('synchronous Cordis Standard Schema emits only stable issue codes', () => {
  assert.deepEqual(Config['~standard'].validate({ databasePath: '/tmp/a', credential: 'synthetic-secret' }), {
    issues: [{ message: 'CONFIG_INVALID' }],
  });
  assert.equal(Config['~standard'].validate({ databasePath: '/tmp/a' }).value.hostTarget, HOST_TARGET);
});

test('operation record rejects hostile and revoked proxies before any traps run', () => {
  let traps = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { traps++; throw new Error('SYNTHETIC_PROXY_SECRET'); } });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const input of [hostile, revoked.proxy]) {
    assert.throws(() => record(input, ['taskId'], 'INPUT_INVALID'), { code: 'INPUT_INVALID', message: 'INPUT_INVALID' });
    assert.throws(() => validateConfig(input), { code: 'CONFIG_INVALID', message: 'CONFIG_INVALID' });
  }
  assert.equal(traps, 0);
});

test('version strings and handmade capability lookalikes cannot pass native provenance', () => {
  const report = probeHost({ sessions: { create() {}, get() {}, list() {} }, approval: { request() {}, effectivePolicy() {} }, provide() {}, effect() {}, on() {} });
  assert.equal(report.supported, false);
  assert.ok(report.failures.includes('nativeContext'));
  assert.ok(report.failures.includes('sessionsProvenance'));
  assert.ok(report.failures.includes('approvalProvenance'));
  assert.equal(probeHost({}).supported, false);
});

test('installed public Cordis host fixture validates lifecycle and ten reloads', () => {
  const script = fileURLToPath(new URL('../scripts/host-smoke.mjs', import.meta.url));
  const result = spawnSync(`${DESKTOP_APP_ROOT}/node_modules/node/bin/node`, [script], {
    encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(report.result, 'passed');
  assert.equal(report.reloads, 10);
  assert.equal(report.entries, 11);
  assert.equal(report.probe.supported, true);
  assert.equal(report.permissionOutcome, 'rejected');
  assert.equal(report.inferenceCalls, 0);
});

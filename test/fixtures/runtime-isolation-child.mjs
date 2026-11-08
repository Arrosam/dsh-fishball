import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PROBE, bootProfile, callScripted, installNetworkTripwire,
  loadInstalledRuntime, registerScriptedAdapter,
} from './runtime-isolation-support.mjs';

const [profile, config] = process.argv.slice(2);
const network = installNetworkTripwire();
let ctx;
try {
  const runtime = await loadInstalledRuntime(process.env.DSH_RUNTIME_ROOT);
  const paths = {
    home: runtime.home.resolveDshHome(),
    agents: runtime.home.resolveAgentsHome(),
    cache: runtime.home.dshCachePath(),
  };
  assert.equal(paths.home, process.env.DSH_HOME);
  assert.equal(paths.agents, process.env.DSH_AGENTS_HOME);
  assert.equal(paths.cache, join(paths.home, 'cache'));
  ctx = await bootProfile(runtime, { profile, config });
  const parentGlobalPresent = Object.hasOwn(globalThis, PROBE.globalKey);
  const parentServicePresent = ctx.get(PROBE.service) !== undefined;
  const payload = [];
  const scopeKey = {};
  const childScope = runtime.scope.createScope(ctx, scopeKey);
  childScope.ctx.on(PROBE.event, values => values.push('local-child-hook'));
  ctx.emit(runtime.scope.scopeTarget(ctx, scopeKey), PROBE.event, payload);
  assert.deepEqual(payload, ['local-child-hook']);
  assert.equal(parentGlobalPresent, false);
  assert.equal(parentServicePresent, false);

  const calls = [];
  const providersBefore = ctx.get('llm').listProviders();
  assert.deepEqual(providersBefore, []);
  registerScriptedAdapter(runtime, ctx, calls);
  const outputs = [];
  for (const prepared of [false, true]) {
    const result = await callScripted(childScope.ctx.get('llm'), prepared);
    assert.equal(result.text, PROBE.baseText);
    outputs.push(result.text);
  }
  const markers = [];
  for (const root of [paths.home, paths.agents, profile]) {
    const marker = join(root, PROBE.markerFile);
    await assert.rejects(access(marker), { code: 'ENOENT' });
    await writeFile(marker, 'child-owned');
    markers.push(await readFile(marker, 'utf8'));
  }
  await childScope.dispose();
  await ctx.fiber.dispose();
  ctx = undefined;
  assert.deepEqual(network.attempts, []);
  console.log(PROBE.reportPrefix + JSON.stringify({
    pid: process.pid,
    version: runtime.version,
    identity: runtime.identity,
    profile,
    paths,
    parentGlobalPresent,
    parentServicePresent,
    inheritedHookCalls: payload.filter(value => value === PROBE.marker).length,
    providersBefore,
    outputs,
    providerCalls: calls.length,
    markers,
    networkAttempts: network.attempts,
  }));
} finally {
  if (ctx) await ctx.fiber.dispose();
  network.restore();
}

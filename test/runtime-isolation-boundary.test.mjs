import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  PROBE, bootProfile, callScripted, createLayout, installNetworkTripwire,
  loadInstalledRuntime, registerScriptedAdapter,
} from './fixtures/runtime-isolation-support.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHILD = join(REPO, 'test', 'fixtures', 'runtime-isolation-child.mjs');
const runFile = promisify(execFile);

// Public-host boundary proof only: no Fishball source imports, live accounts,
// production profiles, account bridge, or assertion that migration is complete.
// Decision table: global listener -> all carriers; tagged ancestor -> descendants;
// sibling/descendant listener -> excluded; disposal -> owned listener absent.
const ROUTING_CASES = Object.freeze([
  { target: 'unscoped', expected: ['global'] },
  { target: 'ancestor', expected: ['global', 'ancestor'] },
  { target: 'child', expected: ['global', 'ancestor', 'child'] },
  { target: 'sibling', expected: ['global', 'sibling'] },
]);

async function assertIsolatedChild(runtime, layout) {
  const { stdout, stderr } = await runFile(process.execPath, [CHILD, layout.profile, layout.config], {
    cwd: layout.root,
    env: layout.env,
    timeout: PROBE.childTimeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: PROBE.maxBufferBytes,
    windowsHide: true,
  });
  const reports = stdout.split(String.fromCharCode(10)).filter(line => line.startsWith(PROBE.reportPrefix));
  assert.equal(reports.length, 1, 'exactly one completed subprocess report: ' + stderr);
  const report = JSON.parse(reports[0].slice(PROBE.reportPrefix.length));
  assert.notEqual(report.pid, process.pid);
  assert.equal(report.version, PROBE.runtimeVersion);
  assert.deepEqual(report.identity, runtime.identity, 'child uses identical installed package files');
  assert.equal(report.parentGlobalPresent, false);
  assert.equal(report.parentServicePresent, false);
  assert.equal(report.inheritedHookCalls, 0);
  assert.equal(report.profile, layout.profile);
  assert.deepEqual(report.paths, {
    home: layout.env.DSH_HOME,
    agents: layout.env.DSH_AGENTS_HOME,
    cache: join(layout.env.DSH_HOME, 'cache'),
  });
  assert.deepEqual(report.outputs, [PROBE.baseText, PROBE.baseText]);
  assert.equal(report.providerCalls, 2);
  assert.deepEqual(report.markers, ['child-owned', 'child-owned', 'child-owned']);
  assert.deepEqual(report.networkAttempts, []);
  // Neither a second install nor dependency projection was created in the profile.
  await assert.rejects(access(join(layout.profile, 'node_modules')), { code: 'ENOENT' });
  return report;
}

test('rc.3 public runtime isolation boundary (not Fishball migration acceptance)', {
  timeout: PROBE.timeoutMs,
}, async t => {
  // Default discovery must not require this investigation's specific runtime.
  // Only an absent selector skips; an explicitly invalid selection still fails.
  if (process.env.DSH_RUNTIME_ROOT === undefined) {
    t.skip('Opt-in proof: set DSH_RUNTIME_ROOT to the installed rc.3 node_modules directory');
    return;
  }
  assert.ok(process.env.DSH_RUNTIME_ROOT.trim(), 'DSH_RUNTIME_ROOT must select the installed rc.3 node_modules directory');
  const runtimeRoot = await realpath(resolve(process.env.DSH_RUNTIME_ROOT));
  const scratchParent = join(REPO, '.runtime');
  await mkdir(scratchParent, { recursive: true });
  const scratch = await mkdtemp(join(scratchParent, 'runtime-isolation-boundary-'));
  const parent = await createLayout(join(scratch, 'parent'), runtimeRoot);
  const child = await createLayout(join(scratch, 'child'), runtimeRoot);
  const previousEnv = new Map(Object.keys(parent.env).map(key => [key, process.env[key]]));
  Object.assign(process.env, parent.env);
  const network = installNetworkTripwire();
  const previousGlobal = Object.getOwnPropertyDescriptor(globalThis, PROBE.globalKey);
  globalThis[PROBE.globalKey] = PROBE.marker;
  let ctx;
  try {
    const runtime = await loadInstalledRuntime(runtimeRoot);
    ctx = await bootProfile(runtime, parent, root => {
      root.provide(PROBE.service, { marker: PROBE.marker });
      root.on(PROBE.event, values => values.push(PROBE.marker));
    });
    const calls = [];
    registerScriptedAdapter(runtime, ctx, calls);

    await t.test('EP/decision table: global hooks and services cross child scopes', async () => {
      const root = new runtime.cordis.Context();
      const keys = { ancestor: {}, child: {}, sibling: {} };
      const scopes = {
        ancestor: runtime.scope.createScope(root, keys.ancestor),
        child: runtime.scope.createScope(root, keys.child, { parent: keys.ancestor }),
        sibling: runtime.scope.createScope(root, keys.sibling),
      };
      try {
        root.on(PROBE.event, values => values.push('global'));
        for (const [name, scope] of Object.entries(scopes)) {
          scope.ctx.on(PROBE.event, values => values.push(name));
        }
        for (const row of ROUTING_CASES) {
          const actual = [];
          root.emit(runtime.scope.scopeTarget(root, keys[row.target]), PROBE.event, actual);
          assert.deepEqual(actual, row.expected, row.target);
        }
        await scopes.child.dispose();
        const afterDispose = [];
        root.emit(runtime.scope.scopeTarget(root, keys.child), PROBE.event, afterDispose);
        assert.deepEqual(afterDispose, ['global', 'ancestor']);
        assert.equal(root.get(PROBE.service), undefined, 'fresh root has its own service store');
        assert.equal(globalThis[PROBE.globalKey], PROBE.marker, 'fresh in-process root still shares JS globals');
      } finally {
        await root.fiber.dispose();
      }
      const key = {};
      const childScope = runtime.scope.createScope(ctx, key);
      try {
        assert.equal(childScope.ctx.get(PROBE.service).marker, PROBE.marker);
        const values = [];
        ctx.emit(runtime.scope.scopeTarget(ctx, key), PROBE.event, values);
        assert.deepEqual(values, [PROBE.marker]);
      } finally {
        await childScope.dispose();
      }
    });

    await t.test('State transition: stream and preparedCall retain registered global middleware', async () => {
      const scope = runtime.scope.createScope(ctx, {});
      const llm = scope.ctx.get('llm');
      let middlewareCalls = 0;
      try {
        for (const prepared of [false, true]) {
          assert.equal((await callScripted(llm, prepared)).text, PROBE.baseText);
        }
        const remove = ctx.on('llm/stream', async function* (_options, next) {
          middlewareCalls += 1;
          for await (const chunk of next()) {
            if (chunk.type === 'text-delta') yield { ...chunk, text: PROBE.middlewareText + chunk.text };
            else if (chunk.type === 'block-end' && chunk.block.type === 'text') {
              yield { ...chunk, block: { ...chunk.block, text: PROBE.middlewareText + chunk.block.text } };
            } else yield chunk;
          }
        });
        try {
          for (const prepared of [false, true]) {
            assert.equal((await callScripted(llm, prepared)).text, PROBE.middlewareText + PROBE.baseText);
          }
          assert.equal(middlewareCalls, 2);
          // Child starts while parent's hook, service and middleware are all live.
          for (const root of [parent.env.DSH_HOME, parent.env.DSH_AGENTS_HOME, parent.profile]) {
            await writeFile(join(root, PROBE.markerFile), PROBE.marker);
          }
          const report = await assertIsolatedChild(runtime, child);
          t.diagnostic('Child boot: same rc.3 package realpaths; separate pid/profile/homes; no inherited global, service, event hook or llm middleware; zero network attempts.');
          assert.deepEqual(report.providersBefore, []);
          assert.equal(middlewareCalls, 2, 'child did not invoke parent middleware');
          for (const root of [parent.env.DSH_HOME, parent.env.DSH_AGENTS_HOME, parent.profile]) {
            assert.equal(await readFile(join(root, PROBE.markerFile), 'utf8'), PROBE.marker);
          }
          assert.equal(ctx.get(PROBE.service).marker, PROBE.marker);
          assert.equal(globalThis[PROBE.globalKey], PROBE.marker);
        } finally {
          remove();
        }
        for (const prepared of [false, true]) {
          assert.equal((await callScripted(llm, prepared)).text, PROBE.baseText);
        }
        assert.equal(middlewareCalls, 2, 'disposing middleware restores baseline');
        assert.equal(calls.length, 6, 'all parent calls reached scripted adapter');
      } finally {
        await scope.dispose();
      }
    });

    await t.test('EP/boundaries: independent home overrides and explicit precedence', () => {
      const { resolveDshHome, resolveAgentsHome } = runtime.home;
      const homes = { DSH_HOME: parent.env.DSH_HOME, DSH_AGENTS_HOME: parent.env.DSH_AGENTS_HOME };
      assert.equal(resolveDshHome(undefined, homes), homes.DSH_HOME);
      assert.equal(resolveAgentsHome(undefined, homes), homes.DSH_AGENTS_HOME);
      assert.equal(resolveDshHome(undefined, { ...homes, DSH_AGENTS_HOME: child.env.DSH_AGENTS_HOME }), homes.DSH_HOME);
      assert.equal(resolveAgentsHome(undefined, { ...homes, DSH_HOME: child.env.DSH_HOME }), homes.DSH_AGENTS_HOME);
      assert.equal(resolveDshHome(child.env.DSH_HOME, homes), child.env.DSH_HOME);
      assert.equal(resolveAgentsHome(child.env.DSH_AGENTS_HOME, homes), child.env.DSH_AGENTS_HOME);
      for (const blank of [undefined, '', '   ']) {
        assert.equal(resolveDshHome(undefined, { DSH_HOME: blank }), join(parent.env.HOME, '.dsh'));
        assert.equal(resolveAgentsHome(undefined, { DSH_AGENTS_HOME: blank }), join(parent.env.HOME, '.agents'));
      }
      assert.notEqual(parent.env.DSH_HOME, child.env.DSH_HOME);
      assert.notEqual(parent.env.DSH_AGENTS_HOME, child.env.DSH_AGENTS_HOME);
    });

    assert.deepEqual(network.attempts, []);
    t.diagnostic('PROVED: host scope inheritance, ordinary/prepared LLM middleware retention, same-installed-code isolated child boot, independent path helpers and marker storage.');
    t.diagnostic('NOT PROVED: Fishball production migration, selective account bridge, full service bundle persistence, GUI integration, hostile-plugin/OS isolation, or arbitrary plugin compliance.');
  } finally {
    try {
      if (ctx) await ctx.fiber.dispose();
    } finally {
      network.restore();
      if (previousGlobal) Object.defineProperty(globalThis, PROBE.globalKey, previousGlobal);
      else delete globalThis[PROBE.globalKey];
      for (const [key, value] of previousEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      // Only the exact mkdtemp-created repo-owned tree is eligible for cleanup.
      assert.ok(scratch.startsWith(scratchParent + sep + 'runtime-isolation-boundary-'));
      assert.equal(await realpath(scratch), scratch);
      await rm(scratch, { recursive: true, force: true });
    }
  }
});

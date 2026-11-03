import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';

export const PROBE = Object.freeze({
  runtimeVersion: '0.2.1-rc.3',
  binName: 'runtime-isolation-black-box',
  event: 'runtime-isolation/probe',
  service: 'runtimeIsolationParentOnly',
  globalKey: '__runtimeIsolationParentOnly',
  marker: 'parent-only-marker',
  provider: 'runtime-isolation-scripted',
  model: 'scripted-no-network',
  baseText: 'scripted-answer',
  middlewareText: 'global-middleware:',
  markerFile: 'boundary-marker.txt',
  reportPrefix: 'RUNTIME_ISOLATION_REPORT=',
  timeoutMs: 40_000,
  childTimeoutMs: 12_000,
  maxBufferBytes: 1_048_576,
});

export const PACKAGES = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  scope: '@deepseek-ai/dsh-scope',
  llm: '@deepseek-ai/dsh-llm',
  home: '@deepseek-ai/dsh-home-paths',
  boot: '@deepseek-ai/dsh-app-boot',
});

// No environment spread: never forward accounts, NODE_OPTIONS, plugin settings,
// main profile roots, or credential-bearing environment values to the child.
export function isolatedEnvironment(root, runtimeRoot) {
  return {
    PATH: dirname(process.execPath),
    HOME: join(root, 'os-home'),
    TMPDIR: join(root, 'tmp'),
    DSH_HOME: join(root, 'dsh-home'),
    DSH_AGENTS_HOME: join(root, 'agents-home'),
    DSH_RUNTIME_ROOT: runtimeRoot,
    LANG: 'C',
  };
}

export async function createLayout(root, runtimeRoot) {
  const env = isolatedEnvironment(root, runtimeRoot);
  const profile = join(env.DSH_HOME, 'profiles', 'boundary-proof');
  await Promise.all([env.HOME, env.TMPDIR, env.DSH_AGENTS_HOME, profile]
    .map(path => mkdir(path, { recursive: true })));
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dsh: { profile: { bundles: [] } },
  }));
  await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([]));
  const config = join(profile, 'cordis.yml');
  await writeFile(config, JSON.stringify([{ name: PACKAGES.llm }]));
  return { root, profile, config, env };
}

export async function loadInstalledRuntime(runtimeRoot) {
  // Resolve from the explicitly selected installation, never repo dependencies.
  const require = createRequire(join(resolve(runtimeRoot), '__boundary_probe__.cjs'));
  const modules = {};
  const identity = {};
  for (const [key, specifier] of Object.entries(PACKAGES)) {
    const entry = require.resolve(specifier);
    modules[key] = await import(pathToFileURL(entry).href);
    identity[specifier] = await realpath(entry);
  }
  const installAnchor = require.resolve('@deepseek-ai/dsh/package.json');
  const manifest = JSON.parse(await readFile(installAnchor, 'utf8'));
  assert.equal(manifest.version, PROBE.runtimeVersion, 'proof must use installed rc.3');
  return { ...modules, identity, installAnchor, version: manifest.version };
}

export async function bootProfile(runtime, layout, prepare) {
  // Only test-created profiles are loaded. Never call initProfile, read a user
  // profile, or apply optional main-home patch layers.
  const profile = runtime.boot.loadProfileDirectory(
    PROBE.binName, layout.profile, runtime.installAnchor,
  );
  assert.equal(profile.dir, layout.profile);
  assert.deepEqual(profile.layers, []);
  assert.deepEqual(profile.patches, []);
  assert.deepEqual(profile.skippedBundles, []);
  return runtime.boot.boot(
    PROBE.binName, layout.config, [], prepare,
    pathToFileURL(runtime.installAnchor).href,
  );
}

export function registerScriptedAdapter(runtime, ctx, calls) {
  class ScriptedAdapter extends runtime.llm.LlmAdapter {
    async *stream(options) {
      options.signal?.throwIfAborted();
      calls.push({ provider: options.provider, model: options.model });
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: PROBE.baseText };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: PROBE.baseText } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  return ctx.get('llm').registerAdapter([PROBE.provider], new ScriptedAdapter());
}

export async function callScripted(llm, prepared = false) {
  const config = { provider: PROBE.provider, model: PROBE.model };
  const call = prepared ? await llm.prepareCall(config) : undefined;
  const options = { ...(call?.config ?? config), messages: [] };
  const chunks = [];
  for await (const chunk of call ? call.stream(options) : llm.stream(options)) chunks.push(chunk);
  assert.equal(chunks.at(-1)?.type, 'finish');
  assert.equal(chunks.at(-1)?.reason.kind, 'stop');
  return { chunks, text: chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('') };
}

// Fail closed for common Node network entry points. This guards this bounded
// proof, not arbitrary native code or an OS-level hostile-plugin threat model.
export function installNetworkTripwire() {
  const attempts = [];
  const originals = [];
  const block = (owner, key) => {
    originals.push([owner, key, owner[key]]);
    owner[key] = function () {
      attempts.push(key);
      throw new Error('Network forbidden in runtime isolation proof: ' + key);
    };
  };
  for (const [owner, key] of [
    [globalThis, 'fetch'], [net.Socket.prototype, 'connect'],
    [http, 'request'], [http, 'get'], [https, 'request'], [https, 'get'],
    [dgram.Socket.prototype, 'send'],
  ]) block(owner, key);
  syncBuiltinESMExports();
  return {
    attempts,
    restore() {
      for (const [owner, key, original] of originals) owner[key] = original;
      syncBuiltinESMExports();
    },
  };
}

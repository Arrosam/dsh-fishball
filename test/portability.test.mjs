// Module-only portability cases. Fresh physical plugin/host copies, normal
// bare Node peer links, no launcher/listener/profile/credentials/provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { constants, cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const checkout = fileURLToPath(new URL('../', import.meta.url));
const installedGraph = join(checkout, '.runtime/dsh-web');
const copy = (from, to) => cpSync(from, to, { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true });

test('physical portable package uses exact normal peer graph and rejects missing/mixed/changed host provenance', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'df-portable-module-')), plugin = join(directory, 'profile/node_modules/dsh-fishball'), host = join(directory, 'host');
  mkdirSync(plugin, { recursive: true }); mkdirSync(host);
  try {
    copy(join(checkout, 'src'), join(plugin, 'src'));
    mkdirSync(join(plugin, 'scripts')); copyFileSync(join(checkout, 'scripts/dsh-web-runtime-lock.json'), join(plugin, 'scripts/dsh-web-runtime-lock.json'));
    copyFileSync(join(checkout, 'package.json'), join(plugin, 'package.json'));
    copy(join(installedGraph, 'node_modules'), join(host, 'node_modules'));
    copyFileSync(join(installedGraph, 'package-lock.json'), join(host, 'package-lock.json'));
    copyFileSync(join(installedGraph, 'package.json'), join(host, 'package.json'));
    const namespace = join(plugin, 'node_modules/@deepseek-ai'); mkdirSync(join(plugin, 'node_modules'));
    symlinkSync(join(host, 'node_modules/@deepseek-ai'), namespace);
    assert.equal(existsSync(join(plugin, '.runtime')), false);
    const prelude = `const p=await import(${JSON.stringify(join(plugin, 'src/host-probe.mjs'))});`;
    const native = `
      const {Context}=await import(p.resolveHostSource('@deepseek-ai/cordis'));
      const {SessionStore}=await import(p.resolveHostSource('@deepseek-ai/dsh-session'));
      const {ApprovalService}=await import(p.resolveHostSource('@deepseek-ai/dsh-user-approval'));
      const ctx=new Context();ctx.logger.exporters.clear();
      try {await ctx.plugin(SessionStore);await ctx.plugin(ApprovalService,{policy:'never'});
    `;
    const close = '}finally{await ctx.fiber.dispose();}';
    const run = code => {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], { encoding: 'utf8', timeout: 20000, cwd: directory, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' } });
      assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout.trim());
    };
    await t.test('native bare peers resolve physical separate host and retain exact runtime factory import', () => {
      const result = run(prelude + native + `const report=p.requireHost(ctx);const runtime=await import(${JSON.stringify(join(plugin, 'src/runtime-plugin.mjs'))});console.log(JSON.stringify({supported:report.supported,root:p.DSH_WEB_RUNTIME_ROOT,factory:typeof runtime.createRuntimePlugin,lock:report.checks.runtimeLock}));` + close);
      assert.deepEqual(result, { supported: true, root: realpathSync(host), factory: 'function', lock: true });
    });
    await t.test('missing bare peer never searches plugin .runtime or original checkout', () => {
      unlinkSync(namespace); mkdirSync(join(plugin, '.runtime')); symlinkSync(installedGraph, join(plugin, '.runtime/dsh-web'));
      try {
        const result = run(prelude + `let code;try{p.requireHost({});}catch(e){code=e.code;}let runtimeCode;try{await import(${JSON.stringify(join(plugin, 'src/runtime-plugin.mjs'))});}catch(e){runtimeCode=e.code;}console.log(JSON.stringify({rootAbsent:p.DSH_WEB_RUNTIME_ROOT===undefined,code,runtimeCode}));`);
        assert.deepEqual(result, { rootAbsent: true, code: 'HOST_CAPABILITY_UNSUPPORTED', runtimeCode: 'HOST_CAPABILITY_UNSUPPORTED' });
      } finally { rmSync(join(plugin, '.runtime'), { recursive: true }); symlinkSync(join(host, 'node_modules/@deepseek-ai'), namespace); }
    });
    await t.test('whole host lock remains byte-exact even for harmless root metadata changes', () => {
      const file = join(host, 'package-lock.json'), before = readFileSync(file); writeFileSync(file, Buffer.concat([before, Buffer.from('\n')]));
      try { assert.equal(run(prelude + native + 'console.log(JSON.stringify(p.probeHost(ctx).checks.runtimeLock));' + close), false); }
      finally { writeFileSync(file, before); }
    });
    await t.test('same source with wrong host version is rejected', () => {
      const file = join(host, 'node_modules/@deepseek-ai/dsh/package.json'), before = readFileSync(file), metadata = JSON.parse(before); metadata.version = '0.2.1-alpha.2'; writeFileSync(file, JSON.stringify(metadata));
      try { const result = run(prelude + native + 'console.log(JSON.stringify({supported:p.probeHost(ctx).supported,version:p.probeHost(ctx).checks.harnessVersion}));' + close); assert.deepEqual(result, { supported: false, version: false }); }
      finally { writeFileSync(file, before); }
    });
    await t.test('same package version with changed native source is rejected', () => {
      const file = join(host, 'node_modules/@deepseek-ai/dsh-session/lib/index.js'), before = readFileSync(file); writeFileSync(file, Buffer.concat([before, Buffer.from('\n// synthetic portability mutation\n')]));
      try { const result = run(prelude + native + 'console.log(JSON.stringify({supported:p.probeHost(ctx).supported,source:p.probeHost(ctx).checks.sessionsSource}));' + close); assert.deepEqual(result, { supported: false, source: false }); }
      finally { writeFileSync(file, before); }
    });
    await t.test('same-version duplicate Cordis classes never pass actual host identity', () => {
      const duplicate = join(directory, 'duplicate/node_modules/@deepseek-ai'); mkdirSync(duplicate, { recursive: true }); copy(join(host, 'node_modules/@deepseek-ai/cordis'), join(duplicate, 'cordis'));
      for (const name of ['cosmokit']) symlinkSync(join(host, 'node_modules/@deepseek-ai', name), join(duplicate, name));
      const result = run(prelude + `const{Context}=await import(${JSON.stringify(join(duplicate, 'cordis/lib/index.js'))});const ctx=new Context();ctx.logger.exporters.clear();try{console.log(JSON.stringify(p.probeHost(ctx).checks.nativeContext));}finally{await ctx.fiber.dispose();}`);
      assert.equal(result, false);
    });
    await t.test('source symlink aliases inside the host package remain unsupported', () => {
      const source = join(host, 'node_modules/@deepseek-ai/dsh-session/lib/index.js'), alias = source + '.physical';
      copyFileSync(source, alias); const before = readFileSync(source); unlinkSync(source); symlinkSync(alias, source);
      try {
        const result = run(prelude + `let code;try{p.resolveHostSource('@deepseek-ai/dsh-session');}catch(e){code=e.code;}console.log(JSON.stringify(code));`);
        assert.equal(result, 'HOST_CAPABILITY_UNSUPPORTED');
      } finally { unlinkSync(source); writeFileSync(source, before); unlinkSync(alias); }
    });
    await t.test('a peer override outside the host graph fails before native import', () => {
      unlinkSync(namespace); mkdirSync(namespace);
      for (const name of ['dsh', 'dsh-session', 'dsh-user-approval']) symlinkSync(join(host, 'node_modules/@deepseek-ai', name), join(namespace, name));
      symlinkSync(join(directory, 'duplicate/node_modules/@deepseek-ai/cordis'), join(namespace, 'cordis'));
      const result = run(prelude + `let code;try{p.resolveHostSource('@deepseek-ai/cordis');}catch(e){code=e.code;}console.log(JSON.stringify({code,supported:p.probeHost({}).supported}));`);
      assert.deepEqual(result, { code: 'HOST_CAPABILITY_UNSUPPORTED', supported: false });
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

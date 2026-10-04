import test from 'node:test';
import assert from 'node:assert/strict';
import { constants, cpSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// These source-relocation negatives do not claim an actual npm installation.
// Root may supply an already extracted actual tarball as the public artifact
// input. No host-home/profile/auth/key/access data is copied or inspected.
const checkout = fileURLToPath(new URL('../', import.meta.url));
const suppliedArtifact = process.env.DF_PORTABILITY_ARTIFACT_PACKAGE_DIR;
if (suppliedArtifact !== undefined) assert.ok(isAbsolute(suppliedArtifact));
const artifact = suppliedArtifact === undefined ? checkout : resolve(suppliedArtifact);
const packageMetadata = JSON.parse(readFileSync(join(artifact, 'package.json'), 'utf8'));
assert.equal(packageMetadata.name, 'dsh-fishball');

function relocated(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'df-portability-independent-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const installed = join(root, 'node_modules', packageMetadata.name);
  mkdirSync(installed, { recursive: true });
  // Public source/entry content only. This deliberately excludes ignored host
  // installations, config/data, tests and the original checkout itself.
  for (const name of ['package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) copyFileSync(join(artifact, name), join(installed, name));
  for (const name of ['src', 'lib', 'scripts']) cpSync(join(artifact, name), join(installed, name), { recursive: true, dereference: false });
  assert.equal(existsSync(join(installed, '.runtime')), false);
  function inspect(directory) {
    for (const name of readdirSync(directory)) {
      const target = join(directory, name), entry = lstatSync(target);
      assert.equal(entry.isSymbolicLink(), false, 'relocated public package has no checkout link');
      if (entry.isDirectory()) inspect(target);
      else assert.equal(entry.isFile(), true, 'only regular public package files are copied');
    }
  }
  inspect(installed);
  const cwd = join(root, 'unrelated-cwd');
  mkdirSync(cwd);
  return { root, installed, cwd };
}

function child(f, body) {
  const script = `
    import assert from 'node:assert/strict';
    import { existsSync } from 'node:fs';
    const installed = ${JSON.stringify(f.installed)};
    const original = ${JSON.stringify(checkout)};
    const databasePath = ${JSON.stringify(join(f.root, 'never-admitted.sqlite'))};
    const packageUrl = ${JSON.stringify(pathToFileURL(f.installed + '/').href)};
    ${body}
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: f.cwd,
    env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
    encoding: 'utf8', timeout: 15000, maxBuffer: 128 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'one allowlisted result, no raw callback output');
  const value = JSON.parse(lines[0]);
  assert.equal(existsSync(join(f.root, 'never-admitted.sqlite')), false);
  return value;
}

test('independent portability metadata retains normal exports, preview, MIT and native client dependencies', t => {
  const f = relocated(t), metadata = JSON.parse(readFileSync(join(f.installed, 'package.json'), 'utf8'));
  assert.equal(metadata.name, 'dsh-fishball');
  assert.equal(metadata.type, 'module');
  assert.equal(metadata.private, true);
  assert.equal(metadata.license, 'MIT');
  assert.match(metadata.version, /-preview\./);
  assert.equal(metadata.engines.node, '22.22.2');
  const originalExports = { '.': './src/index.mjs', './runtime': './src/runtime-plugin.mjs', './client': './lib/client.js' };
  for (const [specifier, target] of Object.entries(originalExports)) assert.equal(metadata.exports[specifier], target);
  const installedExtension = Object.hasOwn(metadata.exports, './installed') ? { './installed': './src/installed-plugin.mjs' } : {};
  // Explicit owner-authorized fourth entry; original artifact inputs retain
  // their exact three-export contract. No arbitrary extra export is allowed.
  assert.deepEqual(metadata.exports, { ...originalExports, ...installedExtension });
  for (const target of Object.values(metadata.exports)) {
    assert.equal(isAbsolute(target), false);
    const path = resolve(f.installed, target);
    assert.ok(relative(f.installed, path) && !relative(f.installed, path).startsWith('..'));
    assert.ok(lstatSync(path).isFile());
  }
  assert.equal(metadata.dsh.client.platform, 'web');
  for (const dependency of ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-layout', '@deepseek-ai/dsh-client-ui-sidebar', '@deepseek-ai/dsh-client-ui-workspace']) assert.ok(metadata.dsh.client.inject.includes(dependency));
  assert.ok(readFileSync(join(f.installed, 'LICENSE'), 'utf8').includes('MIT'));
  assert.ok(lstatSync(join(f.installed, 'THIRD_PARTY_NOTICES.md')).isFile());
});

test('independent portability metadata retains exact official peer pins', t => {
  const f = relocated(t), metadata = JSON.parse(readFileSync(join(f.installed, 'package.json'), 'utf8'));
  for (const [name, version] of Object.entries({
    '@deepseek-ai/dsh': '0.2.1-alpha.1', '@deepseek-ai/cordis': '4.0.5-alpha.1',
    '@deepseek-ai/dsh-session': '0.2.1-alpha.1', '@deepseek-ai/dsh-user-approval': '0.2.1-alpha.1',
  })) assert.equal(metadata.peerDependencies[name], version);
});

test('independent portability bare exports resolve inside a regular relocated package from an unrelated cwd', t => {
  const f = relocated(t);
  const result = child(f, `
    const specifiers = ['dsh-fishball', 'dsh-fishball/runtime', 'dsh-fishball/client'${Object.hasOwn(packageMetadata.exports, './installed') ? ", 'dsh-fishball/installed'" : ''}];
    const resolved = specifiers.map(value => import.meta.resolve(value));
    assert.ok(resolved.every(value => value.startsWith(packageUrl) && !value.startsWith(new URL('file://' + original).href)));
    assert.equal(process.env.NODE_PATH, undefined);
    assert.equal(process.env.NODE_OPTIONS, undefined);
    console.log(JSON.stringify({ pathsInsideInstalledPackage: true, exports: resolved.length, hasNodePath: false }));
  `);
  assert.deepEqual(result, { pathsInsideInstalledPackage: true, exports: Object.hasOwn(packageMetadata.exports, './installed') ? 4 : 3, hasNodePath: false });
});

test('independent portability missing peers cannot obtain a supported probe from the development checkout', t => {
  const f = relocated(t);
  const result = child(f, `
    const entry = await import('dsh-fishball');
    assert.equal(entry.name, 'dsh-fishball');
    const report = entry.probeHost({});
    assert.equal(report.supported, false);
    assert.ok(report.failures.length > 0);
    for (const [field, pin] of Object.entries({ harness: '0.2.1-alpha.1', cordis: '4.0.5-alpha.1', sessions: '0.2.1-alpha.1', approval: '0.2.1-alpha.1' })) assert.notEqual(report.versions[field], pin, 'missing peers have no observed pinned version');
    assert.equal(existsSync(databasePath), false);
    console.log(JSON.stringify({ supported: false, observedPinnedPeers: 0, storageCreated: false }));
  `);
  assert.deepEqual(result, { supported: false, observedPinnedPeers: 0, storageCreated: false });
});

test('independent portability missing peers deny foundation admission before identity callbacks or storage', t => {
  const f = relocated(t);
  const result = child(f, `
    const { createPlugin } = await import('dsh-fishball');
    let identityCalls = 0;
    const plugin = createPlugin({ identity() { identityCalls++; return { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }; } });
    let code;
    try { plugin.apply({}, { databasePath }); } catch (error) { code = error.code; assert.equal(error.message, code); }
    assert.equal(code, 'HOST_CAPABILITY_UNSUPPORTED');
    assert.equal(identityCalls, 0);
    assert.equal(existsSync(databasePath), false);
    console.log(JSON.stringify({ code, identityCalls, storageCreated: false }));
  `);
  assert.deepEqual(result, { code: 'HOST_CAPABILITY_UNSUPPORTED', identityCalls: 0, storageCreated: false });
});

test('independent portability declares the complete bounded consumed peer set without changing platform capability gates', t => {
  const f = relocated(t), metadata = JSON.parse(readFileSync(join(f.installed, 'package.json'), 'utf8'));
  const alpha = ['dsh', 'dsh-session', 'dsh-user-approval', 'dsh-web-app', 'dsh-host-webserver',
    'dsh-client-connection', 'dsh-client-ui-renderer', 'dsh-client-ui-layout', 'dsh-client-ui-sidebar',
    'dsh-client-ui-workspace', 'dsh-agent', 'dsh-agent-loop', 'dsh-llm', 'dsh-scope', 'dsh-tools',
    'dsh-session-persistence', 'dsh-session-persistence-jsonl', 'dsh-token-meter'];
  const expected = Object.fromEntries(alpha.map(name => [`@deepseek-ai/${name}`, '0.2.1-alpha.1']));
  expected['@deepseek-ai/cordis'] = '4.0.5-alpha.1';
  expected['@deepseek-ai/node-addon-system'] = expected['@deepseek-ai/node-addon-system-darwin-arm64'] = '0.1.2';
  assert.deepEqual(metadata.peerDependencies, expected);
  assert.deepEqual(metadata.peerDependenciesMeta, { '@deepseek-ai/node-addon-system-darwin-arm64': { optional: true } });
});

test('independent portability uses physical pinned peers and preserves own lifecycle, isolation and durable unknown facts', async t => {
  const f = relocated(t);
  const suppliedHost = process.env.DF_PORTABILITY_HOST_DIR;
  if (suppliedHost !== undefined) assert.ok(isAbsolute(suppliedHost));
  // Fixture input only: no product fallback. Copy public libraries/lock, never
  // home/profile/auth/keys. Root may supply its fresh physical installed host.
  const publicHost = suppliedHost === undefined ? join(checkout, '.runtime/dsh-web') : resolve(suppliedHost);
  const host = join(f.root, 'public-native-host');
  mkdirSync(host);
  cpSync(join(publicHost, 'node_modules'), join(host, 'node_modules'), {
    recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true,
  });
  copyFileSync(join(publicHost, 'package-lock.json'), join(host, 'package-lock.json'));
  copyFileSync(join(publicHost, 'package.json'), join(host, 'package.json'));
  const namespace = join(f.root, 'node_modules/@deepseek-ai');
  // Ordinary temporary bare-peer binding to this copied graph; no original
  // checkout or ignored runtime link. Actual public DSH profile resolution is
  // proved separately by root, not by this Node fixture link.
  symlinkSync(join(host, 'node_modules/@deepseek-ai'), namespace);
  const prelude = `
    const p = await import(new URL('src/host-probe.mjs', packageUrl));
    assert.equal(p.DSH_WEB_RUNTIME_ROOT, ${JSON.stringify(host)});
    assert.ok(!p.DSH_WEB_RUNTIME_ROOT.startsWith(original));
    assert.equal(process.env.NODE_PATH, undefined);
    assert.equal(process.env.NODE_OPTIONS, undefined);
  `;
  const native = (body, { sessions = 'SessionStore', approval = 'ApprovalService', extra = '' } = {}) => `${prelude}
    const { Context } = await import(p.resolveHostSource('@deepseek-ai/cordis'));
    const { SessionStore } = await import(p.resolveHostSource('@deepseek-ai/dsh-session'));
    const { ApprovalService } = await import(p.resolveHostSource('@deepseek-ai/dsh-user-approval'));
    ${extra}
    const ctx = new Context(); ctx.logger.exporters.clear();
    try {
      ${sessions ? `await ctx.plugin(${sessions});` : ''}
      ${approval ? `await ctx.plugin(${approval}, { policy: 'never' });` : ''}
      ${body}
    } finally { await ctx.fiber.dispose(); }
  `;
  const denied = `
    const { createPlugin } = await import('dsh-fishball');
    let identityCalls=0;
    assert.throws(() => createPlugin({identity(){identityCalls++;return {ownerId:'synthetic-owner',workspaceId:'synthetic-workspace'};}}).apply(ctx,{databasePath}),
      {code:'HOST_CAPABILITY_UNSUPPORTED',message:'HOST_CAPABILITY_UNSUPPORTED'});
    assert.equal(identityCalls,0);
    assert.equal(existsSync(databasePath),false);
  `;

  await t.test('genuine native class and every resolved public source belong to copied host, with all exact provenance checks true', () => {
    const value = child(f, native(`
      const report=p.requireHost(ctx);
      assert.deepEqual(report.failures,[]);
      assert.ok(Object.values(report.checks).every(value=>value===true));
      const names=['cordis','dsh-session','dsh-user-approval','dsh-client-connection','dsh-agent','dsh-agent-loop','dsh-llm','dsh-scope','dsh-tools','dsh-session-persistence-jsonl'];
      const sources=names.map(name=>p.resolveHostSource('@deepseek-ai/'+name));
      assert.ok(sources.every(path=>path.startsWith(p.DSH_WEB_RUNTIME_ROOT+'/node_modules/')&&!path.startsWith(original)));
      const runtime=await import('dsh-fishball/runtime');
      assert.equal(typeof runtime.createRuntimePlugin,'function');
      assert.equal(ctx.sessions.list().length,0);
      console.log(JSON.stringify({supported:true,sources:sources.length,factory:true,sessions:0,permissionBridge:report.permissionBridge}));
    `));
    assert.deepEqual(value, { supported:true,sources:10,factory:true,sessions:0,permissionBridge:'deny-all' });
  });

  for (const [name, nativeClass, check] of [['dsh-session', 'SessionStore', 'sessionsProvenance'], ['dsh-user-approval', 'ApprovalService', 'approvalProvenance']]) {
    await t.test(`same-version physical duplicate ${name} service fails with the genuine correct Context before identity or storage`, () => {
      const duplicate = join(host, 'node_modules/@df-independent', name);
      mkdirSync(dirname(duplicate), { recursive:true });
      cpSync(join(host,'node_modules/@deepseek-ai',name),duplicate,{recursive:true,mode:constants.COPYFILE_FICLONE,verbatimSymlinks:true});
      const extra = `const {${nativeClass}:Foreign}=await import(${JSON.stringify(pathToFileURL(join(duplicate,'lib/index.js')).href)}); assert.notEqual(Foreign,${nativeClass});`;
      const value = child(f, native(`
        const report=p.probeHost(ctx);
        assert.equal(report.checks.nativeContext,true);
        assert.equal(report.checks.${check},false);
        assert.equal(report.checks.${check === 'sessionsProvenance' ? 'approvalProvenance' : 'sessionsProvenance'},true);
        ${denied}
        console.log(JSON.stringify({foreignClassDenied:true,nativeContext:true,identityCalls:0,storageCreated:false}));
      `,{ extra, sessions: nativeClass === 'SessionStore' ? 'Foreign' : 'SessionStore', approval: nativeClass === 'ApprovalService' ? 'Foreign' : 'ApprovalService' }));
      assert.deepEqual(value,{foreignClassDenied:true,nativeContext:true,identityCalls:0,storageCreated:false});
    });
  }

  for (const [service, check] of [['sessions','sessionsProvenance'],['approval','approvalProvenance']]) {
    await t.test(`actual native Context missing ${service} cannot invoke identity or create storage`, () => {
      const value = child(f,native(`
        assert.equal(p.probeHost(ctx).checks.${check},false);
        ${denied}
        console.log(JSON.stringify({code:'HOST_CAPABILITY_UNSUPPORTED',identityCalls:0,storageCreated:false}));
      `,{sessions:service==='sessions'?'':'SessionStore',approval:service==='approval'?'':'ApprovalService'}));
      assert.deepEqual(value,{code:'HOST_CAPABILITY_UNSUPPORTED',identityCalls:0,storageCreated:false});
    });
  }

  await t.test('unselected physical duplicates do not override the coherent selected service origin', () => {
    const value=child(f,native(`
      assert.equal(p.requireHost(ctx).supported,true);
      console.log(JSON.stringify({supported:true,selectedOriginalClasses:true}));
    `));
    assert.deepEqual(value,{supported:true,selectedOriginalClasses:true});
  });

  await t.test('helper rejects closed relative-source and package-name partitions with stable output', () => {
    const value=child(f,prelude+`
      const badSources=['','../lib/index.js','lib/../index.js','lib//index.js','./lib/index.js','/lib/index.js','file:///private/synthetic-secret','lib/index.js?secret','lib/index.js#secret',null,1,{}];
      for(const source of badSources) assert.throws(()=>p.resolveHostSource('@deepseek-ai/dsh-session',source),{code:'HOST_CAPABILITY_UNSUPPORTED',message:'HOST_CAPABILITY_UNSUPPORTED'});
      const badNames=['dsh-session','@other/dsh-session','@deepseek-ai/DSH','@deepseek-ai/../cordis','@deepseek-ai/dsh-session/private','SYNTHETIC_RESOLVER_SECRET',null,1];
      for(const name of badNames) assert.throws(()=>p.resolveHostSource(name),{code:'HOST_CAPABILITY_UNSUPPORTED',message:'HOST_CAPABILITY_UNSUPPORTED'});
      console.log(JSON.stringify({rejected:badSources.length+badNames.length,stable:true}));
    `);
    assert.deepEqual(value,{rejected:20,stable:true});
  });

  for (const variant of ['metadata-alias','dangling-source','outside-source']) {
    await t.test(`${variant} refuses source provenance without exposing private path or doing work`, () => {
      const packageDir=join(host,'node_modules/@deepseek-ai/dsh-user-approval');
      const file=join(packageDir,variant==='metadata-alias'?'package.json':'lib/index.js');
      const before=readFileSync(file), alias=file+'.independent-physical';
      copyFileSync(file,alias);unlinkSync(file);
      const outside=join(f.root,'SYNTHETIC_RESOLVER_PRIVATE_SOURCE');
      if(variant==='outside-source')copyFileSync(alias,outside);
      symlinkSync(variant==='metadata-alias'?alias:variant==='dangling-source'?outside+'.missing':outside,file);
      try {
        const value=child(f,prelude+`
          assert.throws(()=>p.resolveHostSource('@deepseek-ai/dsh-user-approval'),{code:'HOST_CAPABILITY_UNSUPPORTED',message:'HOST_CAPABILITY_UNSUPPORTED'});
          assert.equal(p.probeHost({}).supported,false);
          console.log(JSON.stringify({code:'HOST_CAPABILITY_UNSUPPORTED',storageCreated:false}));
        `);
        assert.deepEqual(value,{code:'HOST_CAPABILITY_UNSUPPORTED',storageCreated:false});
      } finally {unlinkSync(file);writeFileSync(file,before);unlinkSync(alias);rmSync(outside,{force:true});}
    });
  }

  await t.test('a missing approval peer is refused rather than replaced by another same-version installation', () => {
    const packageDir=join(host,'node_modules/@deepseek-ai/dsh-user-approval'),held=packageDir+'.independent-held';
    renameSync(packageDir,held);
    try {
      const value=child(f,prelude+`
        assert.throws(()=>p.resolveHostSource('@deepseek-ai/dsh-user-approval'),{code:'HOST_CAPABILITY_UNSUPPORTED',message:'HOST_CAPABILITY_UNSUPPORTED'});
        const {createPlugin}=await import('dsh-fishball');let calls=0;
        assert.throws(()=>createPlugin({identity(){calls++;}}).apply({}, {databasePath}),{code:'HOST_CAPABILITY_UNSUPPORTED'});
        assert.equal(calls,0);
        console.log(JSON.stringify({code:'HOST_CAPABILITY_UNSUPPORTED',identityCalls:0,storageCreated:false}));
      `);
      assert.deepEqual(value,{code:'HOST_CAPABILITY_UNSUPPORTED',identityCalls:0,storageCreated:false});
    } finally {renameSync(held,packageDir);}
  });

  await t.test('strict whole-lock policy rejects valid root metadata edits before identity and storage', () => {
    const file=join(host,'package-lock.json'),before=readFileSync(file),metadata=JSON.parse(before);
    metadata.name='synthetic-harmless-install-root';writeFileSync(file,JSON.stringify(metadata));
    try {
      const value=child(f,native(`
        const report=p.probeHost(ctx);assert.equal(report.checks.runtimeLock,false);
        ${denied}
        console.log(JSON.stringify({runtimeLock:false,identityCalls:0,storageCreated:false}));
      `));
      assert.deepEqual(value,{runtimeLock:false,identityCalls:0,storageCreated:false});
    } finally {writeFileSync(file,before);}
  });

  await t.test('ten owned installed-origin reloads keep one deduped entry, private scope and no orphan session', () => {
    const value=child(f,native(`
      const entry=await import('dsh-fishball');const rawScope={ownerId:'synthetic-native-owner',workspaceId:'synthetic-native-workspace'};
      const db=${JSON.stringify(join(f.root,'reload.sqlite'))};
      const input={taskId:'synthetic-task',provider:'fixture',source:'synthetic-source',eventId:'synthetic-event'};
      let taskRef,identityCalls=0;const old=[];
      for(let i=0;i<11;i++){
        const plugin=entry.createPlugin({identity(){identityCalls++;return rawScope;}});
        const fiber=await ctx.plugin(plugin,{databasePath:db});const service=ctx.df;
        assert.equal(service.diagnostics().supported,true);
        const receipt=service.intake(input);assert.equal(receipt.deduplicated,i>0);
        taskRef??=receipt.task.taskRef;assert.equal(receipt.task.taskRef,taskRef);
        assert.equal(service.listTasks().length,1);
        for(const key of ['grant','revoke','operator','key','foundation','store'])assert.equal(service[key],undefined);
        assert.throws(()=>service.intake({...input,eventId:'forged-'+i,scope:rawScope}),{code:'INPUT_INVALID'});
        const quitting=fiber.dispose();
        assert.throws(()=>service.intake({...input,eventId:'late-'+i}),{code:'SERVICE_DISPOSED'});
        await quitting;assert.equal(ctx.reflect.get('df'),undefined);old.push(service);
        for(const stale of old)assert.throws(()=>stale.listTasks(),{code:'SERVICE_DISPOSED'});
      }
      assert.equal(ctx.sessions.list().length,0);
      console.log(JSON.stringify({loads:11,reloads:10,entries:1,identityCalls,staleReferences:old.length,sessions:0}));
    `));
    assert.deepEqual(value,{loads:11,reloads:10,entries:1,identityCalls:11,staleReferences:11,sessions:0});
  });

  await t.test('default foundation has no payload identity while a second installed-origin process preserves acknowledged scope and dedup', () => {
    const db=join(f.root,'process-reopen.sqlite');
    const run=identity=>child(f,native(`
      const entry=await import('dsh-fishball');
      const fiber=await ctx.plugin(entry.createPlugin(${identity?`{identity:()=>({ownerId:'synthetic-native-owner',workspaceId:'synthetic-native-workspace'})}`:'{}'}),{databasePath:${JSON.stringify(db)}});
      try{
        ${identity?`
          const receipt=ctx.df.intake({taskId:'process-task',provider:'fixture',source:'process-source',eventId:'process-event'});
          assert.equal(ctx.df.listTasks().length,1);
          console.log(JSON.stringify({deduplicated:receipt.deduplicated,taskRef:receipt.task.taskRef,version:receipt.task.version,authEpoch:receipt.task.authEpoch}));
        `:`
          assert.throws(()=>ctx.df.intake({taskId:'forged',provider:'fixture',source:'process-source',eventId:'forged',ownerId:'synthetic-native-owner'}),{code:'IDENTITY_UNAVAILABLE'});
          assert.throws(()=>ctx.df.listTasks(),{code:'IDENTITY_UNAVAILABLE'});
          console.log(JSON.stringify({identityUnavailable:true,sessions:ctx.sessions.list().length}));
        `}
      }finally{await fiber.dispose();}
    `));
    const first=run(true),second=run(true),defaultResult=run(false);
    assert.equal(first.deduplicated,false);assert.equal(second.deduplicated,true);
    assert.deepEqual({...second,deduplicated:false},first);
    assert.deepEqual(defaultResult,{identityUnavailable:true,sessions:0});
  });

  await t.test('separate installed-origin process retains unknown action reservation without automatic replay or new permission', () => {
    const db=join(f.root,'unknown-reopen.sqlite');
    const initial=child(f,prelude+`
      const {Foundation}=await import(new URL('src/foundation.mjs',packageUrl));
      const scope={ownerId:'synthetic-ledger-owner',workspaceId:'synthetic-ledger-workspace'},operator={};let permissions=0;
      const core=new Foundation({databasePath:${JSON.stringify(db)},trustedOperators:[{scope,capability:operator}],hostPermission(){permissions++;return true;}});
      try{
        core.intake(scope,{taskId:'unknown-task',provider:'fixture',source:'unknown-source',eventId:'unknown-event'});
        const version=core.getTask(scope,'unknown-task').version;
        core.requestAction(scope,'unknown-task',{actionId:'unknown-action',kind:'fixture',targetDigest:'a'.repeat(64),dataDigest:'b'.repeat(64),limits:{units:1},expectedVersion:version});
        const current=core.getTask(scope,'unknown-task');
        core.grant(operator,scope,'unknown-task','unknown-action',{expectedVersion:current.version,expectedAuthEpoch:current.authEpoch,expiresAt:Date.now()+60000});
        const claimed=core.claim(scope,'unknown-task','unknown-action',{expectedVersion:core.getTask(scope,'unknown-task').version});
        assert.equal(permissions,1);
        console.log(JSON.stringify({claimId:claimed.claimId,taskRef:claimed.task.taskRef,version:claimed.task.version,permissions}));
      }finally{core.close();}
    `);
    const recovered=child(f,prelude+`
      const {Foundation}=await import(new URL('src/foundation.mjs',packageUrl));let permissions=0;
      const core=new Foundation({databasePath:${JSON.stringify(db)},hostPermission(){permissions++;return false;}});
      try{
        const scope={ownerId:'synthetic-ledger-owner',workspaceId:'synthetic-ledger-workspace'},exported=core.exportTask(scope,'unknown-task');
        assert.equal(exported.task.status,'recovery_required');
        assert.equal(exported.actions[0].state,'unknown');
        assert.equal(exported.actions[0].claimId,${JSON.stringify(initial.claimId)});
        assert.throws(()=>core.transition(scope,'unknown-task',{expectedVersion:exported.task.version,status:'failed',reason:'recovery'}),{code:'RESERVATION_HELD'});
        assert.equal(permissions,0);
        console.log(JSON.stringify({taskRef:exported.task.taskRef,claimId:exported.actions[0].claimId,state:'unknown',reservationHeld:true,permissions}));
      }finally{core.close();}
    `);
    assert.deepEqual(recovered,{taskRef:initial.taskRef,claimId:initial.claimId,state:'unknown',reservationHeld:true,permissions:0});
  });
});

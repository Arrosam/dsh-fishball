// Public profile compiler + temporary Cordis composition only. No boot/listen,
// owned profile preparation, credential content output, provider or tool call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, lstatSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { runtimeProfilePatch } from '../scripts/runtime-web.mjs';
import { FixtureCredentialProvider } from '../scripts/runtime-web-credentials.mjs';
import { verifyFixtureCredentialBacking } from '../scripts/runtime-web-fixture.mjs';
const packages = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const includeFile = `${packages}/cordis-plugin-include/lib/index.js`;
const pins = {
  'cordis-plugin-include/lib/index.js': 'ad5eaf3b80a8fd9945466486493a0d1a8e9590895bcde01e5673f3d07b4fd306',
  'dsh-app-boot/lib/index.js': '619d80619320e953e5ddcee7c71e4b97e90e722a7d17da8819f3bb47e00587be',
  'dsh-base/cordis.patch.yml': '9c2be64f46a193eff3cca190c26e697e8e8eee25c9b40149dfdb56f8142c252d',
  'dsh-web-app/cordis.patch.yml': '3073a35dbb1dafd933143e7c299452256073f9f7f5f129aeeeba85a55fa85192',
};
const hash = data => createHash('sha256').update(data).digest('hex');
for (const [file, expected] of Object.entries(pins)) assert.equal(hash(readFileSync(`${packages}/${file}`)), expected);
const { entryListSchema } = await import(pathToFileURL(includeFile));
const { composeEntries } = await import(`${packages}/dsh-app-boot/lib/index.js`);
const yaml = createRequire(includeFile)('js-yaml');
const layers = ['dsh-base', 'dsh-web-app'].map(name => yaml.load(readFileSync(`${packages}/${name}/cordis.patch.yml`, 'utf8'), { schema: entryListSchema }));
function compile(patch) {
  const warnings = [], entries = [];
  const visit = rows => { for (const row of rows) { entries.push(row); if (row.group && Array.isArray(row.config)) visit(row.config); } };
  visit(composeEntries([...layers, patch], message => warnings.push(message)));
  return { entries, warnings };
}

test('historical name override is a skipped assertion in the actual shipped layer compiler', () => {
  const patch = [{ id: 'credentials', name: '/synthetic/provider.mjs', config: {} }];
  const { entries, warnings } = compile(patch);
  assert.equal(entries.find(row => row.id === 'credentials').name, '@deepseek-ai/dsh-credentials-local');
  assert.equal(entries.find(row => row.id === 'credentials').disabled, undefined);
  assert.equal(warnings.filter(message => message.includes('name mismatch')).length, 1);
  assert.deepEqual(patch, [{ id: 'credentials', name: '/synthetic/provider.mjs', config: {} }]);
});

test('current shipped base/Web/runtime compilation selects exactly one synthetic provider and original Connection', () => {
  const { entries, warnings } = compile(JSON.parse(runtimeProfilePatch()));
  assert.equal(warnings.length, 0);
  const original = entries.filter(row => row.name === '@deepseek-ai/dsh-credentials-local');
  assert.equal(original.length, 1); assert.equal(original[0].disabled, true);
  const provider = entries.filter(row => row.id === 'df-runtime-synthetic-credentials');
  assert.equal(provider.length, 1); assert.equal(provider[0].disabled, undefined);
  assert.equal(provider[0].name, new URL('../scripts/runtime-web-credentials.mjs', import.meta.url).pathname);
  assert.deepEqual(provider[0].config, {});
  assert.equal(entries.filter(row => row.disabled !== true && typeof row.name === 'string' && row.name.includes('credentials')).length, 1);
  const connection = entries.filter(row => row.id === 'connection');
  assert.equal(connection.length, 1); assert.equal(connection[0].name, '@deepseek-ai/dsh-client-connection');
  assert.deepEqual(connection[0].inject, ['webServer']); assert.deepEqual(connection[0].config, { trustedHosts: [] });
});

test('compiled selected provider class and original Loader Connection produce verified private native auth, with no listener', async () => {
  const { Context } = await import(`${packages}/cordis/lib/index.js`);
  const { Loader } = await import(`${packages}/cordis-plugin-loader/lib/index.js`);
  const Connection = await import(`${packages}/dsh-client-connection/lib/index.js`);
  const { WebServer } = await import(`${packages}/dsh-host-webserver/lib/index.js`);
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-selected-provider-')), auth = join(directory, 'auth.json');
  const ctx = new Context(); ctx.logger.exporters.clear();
  try {
    const { entries } = compile(JSON.parse(runtimeProfilePatch()));
    const providerRow = entries.find(row => row.id === 'df-runtime-synthetic-credentials');
    const providerNamespace = await import(pathToFileURL(providerRow.name));
    assert.equal(providerNamespace.FixtureCredentialProvider, FixtureCredentialProvider);
    // Same selected module/factory/class, with the sole trusted test adaptation
    // binding its JSON to fresh temporary storage instead of the owned profile.
    const moduleFile = join(directory, 'provider.mjs');
    writeFileSync(moduleFile, `import { createFixtureCredentialPlugin } from ${JSON.stringify(pathToFileURL(providerRow.name).href)};\nexport const name = 'df-runtime-synthetic-credentials';\nexport const apply = createFixtureCredentialPlugin(${JSON.stringify(auth)}).apply;\n`, { mode: 0o600 });
    let server;
    await ctx.plugin({ apply(c) { server = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
    assert.equal(server.server, undefined);
    await ctx.plugin(Loader);
    const providerId = await ctx.loader.create({ ...providerRow, name: pathToFileURL(moduleFile).href }); await ctx.loader.await();
    const providerEntry = ctx.loader.resolve(providerId); await providerEntry.fiber;
    assert.equal(ctx.credentials instanceof FixtureCredentialProvider, true);
    await assert.rejects(verifyFixtureCredentialBacking(ctx, auth), { message: 'FIXTURE_CREDENTIAL_BACKING_UNAVAILABLE' });
    const connectionRow = entries.find(row => row.id === 'connection');
    const connectionId = await ctx.loader.create({ ...connectionRow, name: pathToFileURL(`${packages}/dsh-client-connection/lib/index.js`).href }); await ctx.loader.await();
    const connectionEntry = ctx.loader.resolve(connectionId); await connectionEntry.fiber;
    assert.equal(connectionEntry.moduleNamespace, Connection); assert.equal(connectionEntry.moduleNamespace.Config, Connection.Config); assert.equal(connectionEntry.moduleNamespace.apply, Connection.apply);
    assert.deepEqual(Object.keys(connectionEntry.fiber.inject).sort(), ['credentials', 'webServer']);
    assert.deepEqual(await verifyFixtureCredentialBacking(ctx, auth), { provider: 'FixtureCredentialProvider', configured: true, kind: 'grant', nativeBrowserAuth: 'unchanged' });
    assert.equal(lstatSync(auth).mode & 0o777, 0o600);
    const wrongBacking = join(directory, 'unrelated.json'); writeFileSync(wrongBacking, '{}', { mode: 0o600 });
    await assert.rejects(verifyFixtureCredentialBacking(ctx, wrongBacking), { message: 'FIXTURE_CREDENTIAL_BACKING_UNAVAILABLE' });
    chmodSync(auth, 0o400); await assert.rejects(verifyFixtureCredentialBacking(ctx, auth), { message: 'FIXTURE_CREDENTIAL_BACKING_UNAVAILABLE' }); chmodSync(auth, 0o600);
    const before = hash(readFileSync(auth));
    const url = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080')); let cookie;
    ctx.connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, { writeHead(status, headers) { assert.equal(status, 303); assert.equal(headers.location, './'); cookie = headers['set-cookie'].split(';')[0]; }, end() {} });
    assert.equal(ctx.connection.admit({ headers: { host: url.host, origin: url.origin, cookie } }).peer, ctx.connection.operator);
    assert.equal(ctx.connection.admit({ headers: { host: url.host, origin: url.origin } }).rejection, 401);
    assert.equal(ctx.connection.admit({ headers: { host: url.host, origin: 'http://synthetic.invalid', cookie } }).rejection, 403);
    chmodSync(auth, 0o644); await assert.rejects(verifyFixtureCredentialBacking(ctx, auth), { message: 'FIXTURE_CREDENTIAL_BACKING_UNAVAILABLE' }); chmodSync(auth, 0o600);
    await assert.rejects(verifyFixtureCredentialBacking({ credentials: { describeRecord: () => ({ configured: true, kind: 'grant', writable: true }) } }, auth), { message: 'FIXTURE_CREDENTIAL_BACKING_UNAVAILABLE' });
    await connectionEntry.fiber.dispose(); await connectionEntry.refresh(); await connectionEntry.fiber;
    assert.equal(hash(readFileSync(auth)), before); assert.equal(server.server, undefined);
    await ctx.fiber.dispose(); assert.equal(server.prefixes.size, 0);
    await assert.rejects(verifyFixtureCredentialBacking(ctx, auth), { message: 'FIXTURE_CREDENTIAL_BACKING_UNAVAILABLE' });
  } finally { await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
});

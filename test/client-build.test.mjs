import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { execFileSync } from 'node:child_process';

test('reproducible native bundle registers one lazy dsh-fishball module and imports host React only on materialization', () => {
  execFileSync(process.execPath, ['scripts/build-client.mjs', '--check'], { cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH }, stdio: 'pipe' });
  const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'); let registration, imports = 0;
  const context = createContext({ window: { __ModuleLoader__: { load(value) { assert.equal(registration, undefined); registration = value; } } } });
  new Script(bundle).runInContext(context); assert.equal(registration.id, 'dsh-fishball'); assert.equal(imports, 0);
  const exports = registration.factory(name => { imports++; assert.equal(name, 'react'); return {}; });
  assert.equal(imports, 1); assert.equal(typeof exports.apply, 'function'); assert.deepEqual(Array.from(exports.inject), ['connection', 'slots', 'layout', 'uiWorkspace']);
  assert.equal(bundle.includes('document.'), false); assert.equal(bundle.includes('process.env'), false);
});

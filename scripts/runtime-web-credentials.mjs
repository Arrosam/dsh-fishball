import { closeSync, existsSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { runtimeFiles, checkPrivateFile } from './runtime-web.mjs';
const { CredentialProvider } = await import(pathToFileURL(`${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai/dsh-credentials/lib/index.js`).href);
const permittedKey = 'client-connection/browser-session';
const fail = () => { throw new Error('FIXTURE_CREDENTIAL_UNAVAILABLE'); };
const copy = value => value === undefined ? undefined : structuredClone(value);
function valid(value) {
  if (!value || value.kind !== 'grant' || Object.keys(value).sort().join() !== 'kind,payload' || !value.payload || Object.keys(value.payload).sort().join() !== 'secret,version' || value.payload.version !== 1 || typeof value.payload.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.payload.secret) || Buffer.from(value.payload.secret, 'base64url').length !== 32 || Buffer.from(value.payload.secret, 'base64url').toString('base64url') !== value.payload.secret) fail();
  return value;
}
// Synthetic backing for the public CredentialProvider interface. Native
// BrowserAuth owns its signing format/token/cookie and admission unchanged.
// No external credential or environment/.env/user-home fallback is available.
export class FixtureCredentialProvider extends CredentialProvider {
  #path; #pending = Promise.resolve(); #active = true;
  constructor(ctx, path = runtimeFiles.auth) {
    super(ctx); this.#path = path; ctx.effect(() => () => { this.#active = false; }, 'df.fixture-credentials');
    // Cordis context access scopes services through a proxy. Bound methods
    // retain the provider's private fields while admission remains native.
    for (const method of ['readRecord', 'describeRecord', 'listRecords', 'modifyRecord']) this[method] = this[method].bind(this);
  }
  async resolve() { return undefined; }
  async describe() { return { configured: false, writable: false }; }
  async set() { fail(); }
  async unset() { fail(); }
  #read(key) {
    if (!this.#active) fail();
    if (key !== permittedKey) return undefined;
    if (!existsSync(this.#path)) return undefined;
    try { checkPrivateFile(this.#path); if (lstatSync(this.#path).size > 1024) fail(); return valid(JSON.parse(readFileSync(this.#path, 'utf8'))); } catch { fail(); }
  }
  async readRecord(key) { return copy(this.#read(key)); }
  async describeRecord(key) { const current = this.#read(key); return { configured: !!current, ...(current ? { kind: current.kind } : {}), writable: key === permittedKey }; }
  async listRecords() { return this.#read(permittedKey) ? [{ key: permittedKey, kind: 'grant' }] : []; }
  async deleteRecord() { fail(); }
  modifyRecord(key, mutate) {
    if (!this.#active || key !== permittedKey || typeof mutate !== 'function') return Promise.reject(new Error('FIXTURE_CREDENTIAL_UNAVAILABLE'));
    const operation = this.#pending.then(async () => {
      let lock;
      const lockPath = `${this.#path}.lock`, temporary = `${this.#path}.tmp`;
      try {
        // Refuse concurrent processes/stale locks rather than guessing or
        // overwriting another synthetic process's BrowserAuth signing key.
        lock = openSync(lockPath, 'wx', 0o600);
        const current = this.#read(key), next = await mutate(copy(current));
        if (!this.#active) fail();
        if (next !== undefined) {
          valid(next);
          if (existsSync(temporary)) fail();
          writeFileSync(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
          renameSync(temporary, this.#path);
        }
        return copy(this.#read(key));
      } catch { fail(); }
      finally { if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); } }
    });
    this.#pending = operation.catch(() => {}); return operation;
  }
}
export const name = 'df-runtime-synthetic-credentials';
export function apply(ctx) { new FixtureCredentialProvider(ctx); }

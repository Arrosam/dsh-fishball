import { constants, closeSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, unlinkSync, writeSync } from 'node:fs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { record } from './config.mjs';
import { RuntimeStore } from './runtime-store.mjs';
import { types } from 'node:util';

export const SETUP_BOUNDS = Object.freeze({ metadataBytes: 4096, inputBytes: 1024, pathChars: 1024, pathDepth: 16, previewLifetimeMs: 60000, keyBytes: 32 });
export class SetupError extends Error { constructor(code) { super(code); this.name = 'SetupError'; this.code = code; } }
const fail = code => { throw new SetupError(code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const refs = value => typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);
const uid = () => process.getuid();
const entry = path => { try { return lstatSync(path); } catch (error) { if (error?.code === 'ENOENT') return undefined; fail('SETUP_UNAVAILABLE'); } };
const fact = info => info ? { dev: info.dev, ino: info.ino, uid: info.uid, mode: info.mode, nlink: info.nlink, size: info.size } : null;
const same = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino;
const codeOf = error => { if (!error || types.isProxy(error)) return undefined; const field = Object.getOwnPropertyDescriptor(error, 'code'); return field && Object.hasOwn(field, 'value') ? field.value : undefined; };
function safeDirectory(path, mode) {
  const info = entry(path);
  let canonical; try { canonical = realpathSync(path); } catch { fail('SETUP_UNAVAILABLE'); }
  if (!info || !info.isDirectory() || info.isSymbolicLink() || info.uid !== uid() || (mode === undefined ? (info.mode & 0o022) !== 0 : (info.mode & 0o7777) !== mode) || canonical !== path) fail('SETUP_UNAVAILABLE');
  return info;
}
function privateFile(path, maxBytes, exactBytes) {
  const info = entry(path);
  if (!info || !info.isFile() || info.isSymbolicLink() || info.uid !== uid() || (info.mode & 0o7777) !== 0o600 || info.nlink !== 1 || info.size > maxBytes || exactBytes !== undefined && info.size !== exactBytes) fail('SETUP_RECOVERY_REQUIRED');
  return info;
}
function readPrivate(path, maxBytes, exactBytes) {
  const initial = privateFile(path, maxBytes, exactBytes), scratch = Buffer.alloc(maxBytes + 1);
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!same(initial, fstatSync(fd))) fail('SETUP_RECOVERY_REQUIRED');
    let length = 0, count;
    while (length < scratch.length && (count = readSync(fd, scratch, length, scratch.length - length, null)) > 0) length += count;
    const final = privateFile(path, maxBytes, exactBytes);
    if (!same(initial, final) || length !== final.size || length > maxBytes || exactBytes !== undefined && length !== exactBytes) fail('SETUP_RECOVERY_REQUIRED');
    return Buffer.from(scratch.subarray(0, length));
  } finally { scratch.fill(0); if (fd !== undefined) closeSync(fd); }
}
function syncDirectory(path) {
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); fsyncSync(fd); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function publishFile(path, bytes) {
  let fd;
  try { fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); writeSync(fd, bytes); fsyncSync(fd); }
  finally { if (fd !== undefined) closeSync(fd); }
  syncDirectory(dirname(path));
  return privateFile(path, bytes.length, bytes.length);
}
function plain(input, allowed) {
  try { record(input, allowed, 'SETUP_INVALID_INPUT'); if (Buffer.byteLength(JSON.stringify(input)) > SETUP_BOUNDS.inputBytes) fail('SETUP_INVALID_INPUT'); }
  catch { fail('SETUP_INVALID_INPUT'); }
}
const metadataKeys = ['format', 'bindingDigest', 'parentDigest', 'databaseDevice', 'databaseInode', 'keyDevice', 'keyInode', 'ownerId', 'workspaceId', 'keyDigest', 'createdAt'];
const authenticated = (metadata, key) => createHmac('sha256', key).update(JSON.stringify(metadata)).digest('hex');

// Trusted process composition only. The native installed entry authenticates
// RPC callers; no scope/key/callback is accepted through serialized config.
export class SetupState {
  #profile; #database; #parent; #namespace; #paths; #binding; #profileFact;
  #active = true; #preview; #clock; #lastClock; #alive; #currentProfile; #activate; #cut; #limits;
  #ready = false; #disposer; #busy = false; #reason;
  constructor({ databasePath, profile, limits, clock = Date.now, isAlive = () => true, currentProfile = () => profile, activate, observeCommit = () => {} }) {
    try {
      if (!profile || typeof profile.dir !== 'string' || typeof profile.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(profile.name) || !isAbsolute(profile.dir) || typeof databasePath !== 'string' || !databasePath.isWellFormed() || !isAbsolute(databasePath) || databasePath.length > SETUP_BOUNDS.pathChars || /[\x00-\x1f\x7f]/.test(databasePath) || resolve(databasePath) !== databasePath || typeof activate !== 'function' || typeof clock !== 'function' || typeof isAlive !== 'function' || typeof currentProfile !== 'function' || typeof observeCommit !== 'function') throw new Error();
      const dir = realpathSync(profile.dir);
      if (dir !== profile.dir) throw new Error();
      const tail = relative(dir, databasePath);
      if (!tail || tail.startsWith('..') || isAbsolute(tail) || tail.split(sep).length < 2 || tail.split(sep).length > SETUP_BOUNDS.pathDepth || databasePath.endsWith(sep)) throw new Error();
      this.#profile = Object.freeze({ dir, name: profile.name }); this.#database = databasePath; this.#parent = dirname(databasePath);
      this.#namespace = `${databasePath}.df-setup`;
      this.#paths = Object.freeze({ key: `${this.#namespace}/key.bin`, metadata: `${this.#namespace}/state.json`, claim: `${this.#namespace}/claim.json`, stage: `${this.#namespace}/staging.sqlite` });
      this.#profileFact = fact(safeDirectory(dir));
      this.#binding = hash(JSON.stringify({ databasePath, profile: this.#profile, uid: uid(), profileInode: this.#profileFact.ino, profileDevice: this.#profileFact.dev }));
      this.#clock = clock; this.#alive = isAlive; this.#currentProfile = currentProfile; this.#activate = activate; this.#cut = observeCommit; this.#limits = limits;
      this.#checkPath();
    } catch { fail('SETUP_UNAVAILABLE'); }
  }
  #assertAlive() { let alive = false; try { alive = this.#active && this.#alive() === true; } catch {} if (!alive) fail('SERVICE_DISPOSED'); }
  #now() { let value; try { value = this.#clock(); } catch { fail('SETUP_UNAVAILABLE'); } if (!Number.isSafeInteger(value) || value < 0 || this.#lastClock !== undefined && value < this.#lastClock) { this.#preview = undefined; fail('SETUP_PREVIEW_STALE'); } this.#lastClock = value; return value; }
  #checkPath() {
    let observed, canonical; try { observed = this.#currentProfile(); canonical = realpathSync(observed?.dir); } catch { fail('SETUP_UNAVAILABLE'); }
    if (!observed || observed.name !== this.#profile.name || observed.dir !== this.#profile.dir || canonical !== this.#profile.dir || !same(this.#profileFact, safeDirectory(this.#profile.dir))) fail('SETUP_UNAVAILABLE');
    const facts = [];
    const components = relative(this.#profile.dir, this.#parent).split(sep); let path = this.#profile.dir;
    for (const component of components) { path = resolve(path, component); const info = entry(path); if (info) safeDirectory(path); facts.push([path, fact(info)]); }
    return facts;
  }
  #emptyFacts() {
    const parents = this.#checkPath();
    const paths = [this.#database, `${this.#database}-wal`, `${this.#database}-shm`, `${this.#database}-journal`, this.#namespace];
    if (paths.some(path => entry(path))) fail('SETUP_RECOVERY_REQUIRED');
    return hash(JSON.stringify({ profile: fact(safeDirectory(this.#profile.dir)), parents, emptyPaths: paths }));
  }
  #parentDigest() { return hash(JSON.stringify(this.#checkPath().map(([path, info]) => [path, info && { dev: info.dev, ino: info.ino, uid: info.uid, mode: info.mode }]))); }
  #read() {
    this.#checkPath();
    const directory = entry(this.#namespace);
    if (!directory) { this.#emptyFacts(); return undefined; }
    safeDirectory(this.#namespace, 0o700);
    const contents = opendirSync(this.#namespace);
    try { let item, count = 0; while ((item = contents.readSync())) { if (++count > 2 || !['key.bin', 'state.json'].includes(item.name)) fail('SETUP_RECOVERY_REQUIRED'); } }
    finally { contents.closeSync(); }
    if (entry(this.#paths.claim) || entry(this.#paths.stage) || entry(`${this.#paths.stage}-journal`) || entry(`${this.#paths.stage}-wal`) || entry(`${this.#paths.stage}-shm`)) fail('SETUP_RECOVERY_REQUIRED');
    if (privateFile(this.#database, 256 * 1024 * 1024).size < 512) fail('SETUP_RECOVERY_REQUIRED');
    for (const suffix of ['-wal', '-shm', '-journal']) if (entry(this.#database + suffix)) fail('SETUP_RECOVERY_REQUIRED');
    let key, bytes;
    try {
      key = readPrivate(this.#paths.key, SETUP_BOUNDS.keyBytes, SETUP_BOUNDS.keyBytes);
      bytes = readPrivate(this.#paths.metadata, SETUP_BOUNDS.metadataBytes);
      const value = JSON.parse(bytes.toString('utf8')); plain(value, [...metadataKeys, 'mac']);
      const database = privateFile(this.#database, 256 * 1024 * 1024), keyFile = privateFile(this.#paths.key, 32, 32);
      if (Object.keys(value).length !== metadataKeys.length + 1 || value.format !== 'df-installed/v1' || value.bindingDigest !== this.#binding || value.parentDigest !== this.#parentDigest() || value.databaseDevice !== database.dev || value.databaseInode !== database.ino || value.keyDevice !== keyFile.dev || value.keyInode !== keyFile.ino || !refs(value.keyDigest) || !refs(value.mac) || !refs(value.ownerId) || !refs(value.workspaceId) || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 || hash(key) !== value.keyDigest) fail('SETUP_RECOVERY_REQUIRED');
      const metadata = Object.fromEntries(metadataKeys.map(name => [name, value[name]]));
      if (!timingSafeEqual(Buffer.from(value.mac, 'hex'), Buffer.from(authenticated(metadata, key), 'hex'))) fail('SETUP_RECOVERY_REQUIRED');
      return { identity: Object.freeze({ ownerId: metadata.ownerId, workspaceId: metadata.workspaceId }), key: Buffer.from(key), verify: this.#publishedVerifier(directory, privateFile(this.#database, 256 * 1024 * 1024), privateFile(this.#paths.key, 32, 32), privateFile(this.#paths.metadata, SETUP_BOUNDS.metadataBytes), hash(key), hash(bytes)) };
    } catch { fail('SETUP_RECOVERY_REQUIRED'); }
    finally { key?.fill(0); bytes?.fill(0); }
  }
  #publishedVerifier(namespace, database, keyFile, metadataFile, keyDigest, metadataDigest) {
    return () => {
      this.#assertAlive(); this.#checkPath();
      if (!same(namespace, safeDirectory(this.#namespace, 0o700)) || !same(database, privateFile(this.#database, 256 * 1024 * 1024)) || !same(keyFile, privateFile(this.#paths.key, 32, 32)) || !same(metadataFile, privateFile(this.#paths.metadata, SETUP_BOUNDS.metadataBytes))) fail('SETUP_RECOVERY_REQUIRED');
      for (const suffix of ['-wal', '-shm', '-journal']) if (entry(this.#database + suffix)) fail('SETUP_RECOVERY_REQUIRED');
      let key, metadata;
      try { key = readPrivate(this.#paths.key, 32, 32); metadata = readPrivate(this.#paths.metadata, SETUP_BOUNDS.metadataBytes); if (hash(key) !== keyDigest || hash(metadata) !== metadataDigest) fail('SETUP_RECOVERY_REQUIRED'); }
      finally { key?.fill(0); metadata?.fill(0); }
    };
  }
  status(input = {}) {
    this.#assertAlive(); plain(input, []);
    const result = { phase: 'setup_required', executionEnabled: false, storage: Object.freeze({ location: this.#database }) };
    let retained;
    try { retained = this.#read(); if (retained) { result.phase = this.#ready ? 'ready' : this.#reason === 'SETUP_RECOVERY_REQUIRED' ? 'recovery_required' : 'unavailable'; if (!this.#ready) result.reasonCode = this.#reason ?? 'SETUP_UNAVAILABLE'; } }
    catch (error) { this.#ready = false; const disposer = this.#disposer; this.#disposer = undefined; try { Promise.resolve(disposer?.()).catch(() => {}); } catch {} result.phase = codeOf(error) === 'SETUP_UNAVAILABLE' ? 'unavailable' : 'recovery_required'; result.reasonCode = result.phase === 'unavailable' ? 'SETUP_UNAVAILABLE' : 'SETUP_RECOVERY_REQUIRED'; }
    finally { retained?.key.fill(0); }
    return Object.freeze(result);
  }
  prepare(input = {}) {
    this.#assertAlive(); plain(input, []); const now = this.#now();
    const emptyDigest = this.#emptyFacts();
    const previewRef = randomBytes(32).toString('hex'), expiresAt = now + SETUP_BOUNDS.previewLifetimeMs;
    if (!Number.isSafeInteger(expiresAt)) fail('SETUP_PREVIEW_STALE');
    const description = Object.freeze({ operation: 'create-local-storage', databaseLocation: this.#database, identityMode: 'native-dsh-owner', encrypted: true, permissions: 'owner-only', externalExecution: false });
    const planDigest = hash(JSON.stringify({ previewRef, expiresAt, description, bindingDigest: this.#binding, emptyDigest }));
    this.#preview = Object.freeze({ previewRef, planDigest, expiresAt, description, emptyDigest });
    return Object.freeze({ previewRef, planDigest, expiresAt, description });
  }
  async #start(retained) {
    let disposer;
    try {
      this.#assertAlive(); this.#checkPath(); retained.verify?.();
      disposer = await this.#activate(Object.freeze({ identity: retained.identity, encryptionKey: retained.key }));
      if (typeof disposer !== 'function') fail('SETUP_UNAVAILABLE');
      this.#assertAlive(); this.#checkPath(); retained.verify?.(); this.#disposer = disposer;
    } catch (error) {
      try { await disposer?.(); } catch {}
      this.#reason = 'SETUP_RECOVERY_REQUIRED'; fail(codeOf(error) === 'SERVICE_DISPOSED' || !this.#active ? 'SERVICE_DISPOSED' : 'SETUP_RECOVERY_REQUIRED');
    } finally { retained.key.fill(0); }
  }
  async resume() {
    this.#assertAlive(); if (this.#busy || this.#ready) return this.status();
    let retained;
    try { retained = this.#read(); if (!retained) return this.status(); this.#busy = true; await this.#start(retained); this.#ready = true; return this.status(); }
    catch (error) { if (codeOf(error) === 'SERVICE_DISPOSED') throw error; this.#reason = 'SETUP_RECOVERY_REQUIRED'; return Object.freeze({ phase: 'recovery_required', executionEnabled: false, storage: Object.freeze({ location: this.#database }), reasonCode: 'SETUP_RECOVERY_REQUIRED' }); }
    finally { retained?.key.fill(0); this.#busy = false; }
  }
  async confirm(input, { signal } = {}) {
    this.#assertAlive(); plain(input, ['previewRef', 'planDigest', 'accept']);
    if (input.accept !== true) fail('SETUP_CONFIRMATION_REQUIRED');
    const preview = this.#preview;
    if (this.#busy || !preview || !refs(input.previewRef) || !refs(input.planDigest) || input.previewRef !== preview.previewRef || input.planDigest !== preview.planDigest || this.#now() >= preview.expiresAt) fail('SETUP_PREVIEW_STALE');
    if (signal?.aborted) fail('REQUEST_ABORTED');
    if (this.#emptyFacts() !== preview.emptyDigest) fail('SETUP_PREVIEW_STALE');
    this.#preview = undefined; this.#busy = true;
    let key, store, claim, namespaceFact, stageFact, keyFact, metadataFact, committed = false;
    try {
      this.#assertAlive(); if (signal?.aborted) fail('REQUEST_ABORTED');
      const beforeFirstWrite = () => {
        this.#assertAlive();
        if (!committed) { if (this.#emptyFacts() !== preview.emptyDigest) fail('SETUP_PREVIEW_STALE'); }
        else this.#checkPath();
        if (signal?.aborted) fail('REQUEST_ABORTED');
        if (!committed && this.#now() >= preview.expiresAt) fail('SETUP_PREVIEW_STALE');
      };
      // The first described parent-directory write (or exclusive namespace
      // claim when parents exist) begins consent commit. Expiry is rechecked
      // immediately before that syscall, after trusted lifetime/path callbacks.
      // Later partial writes remain accountable to this committed consent.
      const components = relative(this.#profile.dir, this.#parent).split(sep); let path = this.#profile.dir;
      for (const component of components) { path = resolve(path, component); if (!entry(path)) { beforeFirstWrite(); mkdirSync(path, { mode: 0o700 }); committed = true; } safeDirectory(path); }
      beforeFirstWrite(); mkdirSync(this.#namespace, { mode: 0o700 }); committed = true; namespaceFact = safeDirectory(this.#namespace, 0o700); syncDirectory(this.#parent);
      claim = publishFile(this.#paths.claim, Buffer.from(JSON.stringify({ format: 'df-setup-claim/v1', bindingDigest: this.#binding })));
      this.#cut('namespace_claimed'); this.#assertAlive(); this.#checkPath();
      if (!same(namespaceFact, safeDirectory(this.#namespace, 0o700))) fail('SETUP_RECOVERY_REQUIRED');
      key = randomBytes(32); const identity = Object.freeze({ ownerId: randomBytes(32).toString('hex'), workspaceId: randomBytes(32).toString('hex') });
      store = new RuntimeStore({ databasePath: this.#paths.stage, encryptionKey: key, principals: [{ handle: Object.freeze({}), role: 'owner', scope: identity }], limits: this.#limits ?? {}, hostPermission: () => false });
      store.close(); store = undefined; stageFact = privateFile(this.#paths.stage, 256 * 1024 * 1024); this.#cut('staging_closed');
      if (['-journal', '-wal', '-shm'].some(suffix => entry(this.#paths.stage + suffix))) fail('SETUP_RECOVERY_REQUIRED');
      this.#assertAlive(); this.#checkPath(); if (!same(namespaceFact, safeDirectory(this.#namespace, 0o700)) || !same(stageFact, entry(this.#paths.stage))) fail('SETUP_RECOVERY_REQUIRED');
      if ([this.#database, `${this.#database}-wal`, `${this.#database}-shm`, `${this.#database}-journal`].some(path => entry(path))) fail('SETUP_RECOVERY_REQUIRED');
      linkSync(this.#paths.stage, this.#database); syncDirectory(this.#parent); this.#cut('database_published');
      if (!same(stageFact, entry(this.#database)) || !same(stageFact, entry(this.#paths.stage))) fail('SETUP_RECOVERY_REQUIRED');
      unlinkSync(this.#paths.stage); syncDirectory(this.#namespace); privateFile(this.#database, 256 * 1024 * 1024);
      keyFact = publishFile(this.#paths.key, key); const keyDigest = hash(key); this.#cut('key_published'); this.#assertAlive(); this.#checkPath();
      if (!same(namespaceFact, safeDirectory(this.#namespace, 0o700)) || !same(stageFact, privateFile(this.#database, 256 * 1024 * 1024)) || !same(keyFact, privateFile(this.#paths.key, 32, 32))) fail('SETUP_RECOVERY_REQUIRED');
      const metadata = { format: 'df-installed/v1', bindingDigest: this.#binding, parentDigest: this.#parentDigest(), databaseDevice: stageFact.dev, databaseInode: stageFact.ino, keyDevice: keyFact.dev, keyInode: keyFact.ino, ownerId: identity.ownerId, workspaceId: identity.workspaceId, keyDigest: hash(key), createdAt: this.#now() };
      const encoded = Buffer.from(JSON.stringify({ ...metadata, mac: authenticated(metadata, key) }));
      const metadataDigest = hash(encoded);
      try { metadataFact = publishFile(this.#paths.metadata, encoded); } finally { encoded.fill(0); }
      this.#cut('metadata_published');
      const verify = this.#publishedVerifier(namespaceFact, stageFact, keyFact, metadataFact, keyDigest, metadataDigest);
      await this.#start({ identity, key, verify }); this.#cut('runtime_ready'); verify();
      this.#assertAlive(); this.#checkPath();
      if (!same(claim, privateFile(this.#paths.claim, SETUP_BOUNDS.metadataBytes)) || !same(namespaceFact, safeDirectory(this.#namespace, 0o700))) fail('SETUP_RECOVERY_REQUIRED');
      unlinkSync(this.#paths.claim); syncDirectory(this.#namespace); this.#ready = true;
      if (signal?.aborted) fail('REQUEST_ABORTED');
      return this.status();
    } catch (error) {
      this.#reason = 'SETUP_RECOVERY_REQUIRED';
      if (!this.#ready) { try { await this.#disposer?.(); } catch {} this.#disposer = undefined; }
      if (codeOf(error) === 'SERVICE_DISPOSED' || codeOf(error) === 'REQUEST_ABORTED') throw error;
      if (!committed && codeOf(error) === 'SETUP_PREVIEW_STALE') throw error;
      fail('SETUP_RECOVERY_REQUIRED');
    } finally { try { store?.close(); } catch {} finally { key?.fill(0); this.#busy = false; } }
  }
  dispose() {
    this.#active = false; this.#preview = undefined; this.#ready = false;
    const disposer = this.#disposer; this.#disposer = undefined;
    return Promise.resolve().then(() => disposer?.()).catch(() => fail('SETUP_UNAVAILABLE'));
  }
}

import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { constants } from 'node:fs';
import { isAbsolute } from 'node:path';

export class FoundationError extends Error {
  constructor(code) { super(code); this.name = 'FoundationError'; this.code = code; }
}
export const fail = code => { throw new FoundationError(code); };
export const SCHEMA_VERSION = 2;
const BASE = {
  tasks: 'CREATE TABLE tasks (owner TEXT NOT NULL, workspace TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, auth_epoch INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,workspace,id))',
  ingress: 'CREATE TABLE ingress (owner TEXT NOT NULL, workspace TEXT NOT NULL, provider TEXT NOT NULL, source TEXT NOT NULL, event TEXT NOT NULL, task TEXT NOT NULL, received_at INTEGER NOT NULL, PRIMARY KEY(owner,workspace,provider,source,event), FOREIGN KEY(owner,workspace,task) REFERENCES tasks(owner,workspace,id))',
  events: 'CREATE TABLE events (owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, sequence INTEGER NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(owner,workspace,task,sequence), FOREIGN KEY(owner,workspace,task) REFERENCES tasks(owner,workspace,id))',
};
const EXTRA = {
  actions: 'CREATE TABLE actions (owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, target_digest TEXT NOT NULL, data_digest TEXT NOT NULL, units INTEGER NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, claim_id TEXT, claim_epoch INTEGER, evidence_digest TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,workspace,task,id), FOREIGN KEY(owner,workspace,task) REFERENCES tasks(owner,workspace,id))',
  grants: 'CREATE TABLE grants (owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, action TEXT NOT NULL, task_version INTEGER NOT NULL, auth_epoch INTEGER NOT NULL, target_digest TEXT NOT NULL, data_digest TEXT NOT NULL, units INTEGER NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL, PRIMARY KEY(owner,workspace,task,action), FOREIGN KEY(owner,workspace,task,action) REFERENCES actions(owner,workspace,task,id))',
  reservations: 'CREATE TABLE reservations (claim_id TEXT PRIMARY KEY, owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, action TEXT NOT NULL, units INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(owner,workspace,task,action) REFERENCES actions(owner,workspace,task,id))',
};
// Version 1 is a bounded task-only foundation; it cannot contain action authority.
export const legacySchemaSql = Object.values(BASE).join(';') + '; PRAGMA user_version=1;';
const normalize = sql => sql.replace(/\s+/g, ' ').trim();

export class Ledger {
  constructor(path, { migrationFault, maxPageCount } = {}) {
    if (typeof path !== 'string' || !isAbsolute(path) || path.length > 4096 || path.includes('\0')) fail('INVALID_CONFIG');
    this.path = path; this.closed = false; this.restricted = false;
    const existed = existsSync(path);
    try {
      if (existed && (!statSync(path).isFile() || statSync(path).size === 0)) fail('STORAGE_INVALID');
      this.db = new DatabaseSync(path);
      this.db.exec('PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > SCHEMA_VERSION) fail('SCHEMA_FUTURE');
      if (version < 0 || (existed && version === 0)) fail('SCHEMA_UNSUPPORTED');
      if (this.db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('STORAGE_INVALID');
      if (!existed) {
        this.db.exec('BEGIN EXCLUSIVE');
        try { for (const sql of Object.values({ ...BASE, ...EXTRA })) this.db.exec(sql); this.db.exec(`PRAGMA user_version=${SCHEMA_VERSION}; COMMIT`); }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
      } else if (version === 1) {
        this.verify(BASE);
        if (this.db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') fail('SCHEMA_UNSUPPORTED');
        this.db.exec('BEGIN EXCLUSIVE');
        try {
          // Lock out concurrent writes before making an exact recoverable copy.
          this.backupPath = `${path}.schema-1.backup`;
          copyFileSync(path, this.backupPath, constants.COPYFILE_EXCL);
          for (const sql of Object.values(EXTRA)) this.db.exec(sql);
          if (migrationFault) migrationFault();
          this.db.exec(`PRAGMA user_version=${SCHEMA_VERSION}; COMMIT`);
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
      } else if (version !== SCHEMA_VERSION) fail('SCHEMA_UNSUPPORTED');
      this.verify({ ...BASE, ...EXTRA });
      if (this.db.prepare('PRAGMA foreign_key_check').all().length) fail('STORAGE_INVALID');
      if (maxPageCount !== undefined) this.db.exec(`PRAGMA max_page_count=${maxPageCount}`);
    } catch (error) {
      try { this.db?.close(); } catch {}
      this.closed = true;
      if (error instanceof FoundationError) throw error;
      fail('STORAGE_UNAVAILABLE');
    }
  }
  verify(expected) {
    const tables = this.db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if (tables.length !== Object.keys(expected).length || tables.some(row => !expected[row.name] || normalize(row.sql) !== normalize(expected[row.name]))) fail('SCHEMA_UNSUPPORTED');
    if (this.db.prepare("SELECT name FROM sqlite_schema WHERE type IN ('trigger','view') OR (type='index' AND name NOT LIKE 'sqlite_autoindex_%')").all().length) fail('SCHEMA_UNSUPPORTED');
  }
  query(sql, ...params) { return this.guarded(() => this.db.prepare(sql).all(...params)); }
  one(sql, ...params) { return this.guarded(() => this.db.prepare(sql).get(...params)); }
  run(sql, ...params) { return this.guarded(() => this.db.prepare(sql).run(...params)); }
  guarded(fn) {
    if (this.closed) fail('CLOSED');
    if (this.restricted) fail('STORAGE_RESTRICTED');
    try { return fn(); } catch (error) { if (error instanceof FoundationError) throw error; this.restricted = true; fail('STORAGE_UNAVAILABLE'); }
  }
  transaction(fn) {
    return this.guarded(() => {
      this.db.exec('BEGIN IMMEDIATE');
      try { const result = fn(); this.db.exec('COMMIT'); return result; }
      catch (error) { try { this.db.exec('ROLLBACK'); } catch { this.restricted = true; } throw error; }
    });
  }
  close() { if (!this.closed) { try { this.db.close(); } catch { fail('STORAGE_UNAVAILABLE'); } finally { this.closed = true; } } }
}

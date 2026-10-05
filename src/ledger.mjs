import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, statSync, openSync, closeSync, fsyncSync, chmodSync, readSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { constants } from 'node:fs';
import { isAbsolute, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export class FoundationError extends Error {
  constructor(code) { super(code); this.name = 'FoundationError'; this.code = code; }
}
export const fail = code => { throw new FoundationError(code); };
export const SCHEMA_VERSION = 6;
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
const RUNTIME = {
 runtime_tasks: 'CREATE TABLE runtime_tasks (owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, control TEXT NOT NULL, PRIMARY KEY(owner,workspace,task), FOREIGN KEY(owner,workspace,task) REFERENCES tasks(owner,workspace,id))',
 runtime_commands: 'CREATE TABLE runtime_commands (owner TEXT NOT NULL, workspace TEXT NOT NULL, id TEXT NOT NULL, task TEXT NOT NULL, digest TEXT NOT NULL, operation TEXT NOT NULL, receipt TEXT NOT NULL, PRIMARY KEY(owner,workspace,id))',
 runtime_data: 'CREATE TABLE runtime_data (owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, digest TEXT NOT NULL, ciphertext BLOB NOT NULL, nonce BLOB NOT NULL, tag BLOB NOT NULL, metadata TEXT NOT NULL, PRIMARY KEY(owner,workspace,task,id), FOREIGN KEY(owner,workspace,task) REFERENCES tasks(owner,workspace,id))',
 runtime_policy: 'CREATE TABLE runtime_policy (owner TEXT NOT NULL, workspace TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,workspace))',
 runtime_actions: 'CREATE TABLE runtime_actions (owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, action TEXT NOT NULL, digest TEXT NOT NULL, spec TEXT NOT NULL, metadata TEXT NOT NULL, PRIMARY KEY(owner,workspace,task,action), FOREIGN KEY(owner,workspace,task,action) REFERENCES actions(owner,workspace,task,id))',
 runtime_workers: 'CREATE TABLE runtime_workers (owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, claim TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,workspace,task,claim), FOREIGN KEY(owner,workspace,task) REFERENCES tasks(owner,workspace,id))',
 runtime_records: 'CREATE TABLE runtime_records (owner TEXT NOT NULL, workspace TEXT NOT NULL, task TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,workspace,task,kind,id), FOREIGN KEY(owner,workspace,task) REFERENCES tasks(owner,workspace,id))',
 runtime_security: 'CREATE TABLE runtime_security (id INTEGER PRIMARY KEY CHECK(id=1), key_digest TEXT NOT NULL)',
};
const AUTOMATION = {
 workspace_memory: 'CREATE TABLE workspace_memory (owner TEXT NOT NULL, workspace TEXT NOT NULL, namespace TEXT NOT NULL, revision INTEGER NOT NULL, digest TEXT NOT NULL, ciphertext BLOB, nonce BLOB, tag BLOB, metadata TEXT NOT NULL, PRIMARY KEY(owner,workspace,namespace))',
 automation_records: 'CREATE TABLE automation_records (owner TEXT NOT NULL, workspace TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, task TEXT, payload TEXT NOT NULL, PRIMARY KEY(owner,workspace,kind,id), FOREIGN KEY(owner,workspace,task) REFERENCES tasks(owner,workspace,id))',
};
// Version 1 is a bounded task-only foundation; it cannot contain action authority.
export const legacySchemaSql = Object.values(BASE).join(';') + '; PRAGMA user_version=1;';
const normalize = sql => sql.replace(/\s+/g, ' ').trim();
// Only DELETE/rollback journals belong to this foundation. Inspect bytes before
// SQLite opens a rejected store: even read-only SQLite can modify WAL's SHM.
function preflight(path, existed) {
  if (existed) {
    const info=statSync(path);
    if (!info.isFile() || info.size===0) fail('STORAGE_INVALID');
    const header=Buffer.alloc(100), fd=openSync(path,'r');
    let read;
    try { read=readSync(fd,header,0,header.length,0); } finally { closeSync(fd); }
    if (read!==header.length || !header.subarray(0,16).equals(Buffer.from('SQLite format 3\0','ascii'))) fail('STORAGE_UNAVAILABLE');
    const version=header.readInt32BE(60);
    if (version>SCHEMA_VERSION) fail('SCHEMA_FUTURE');
    if (![1,2,3,4,5,SCHEMA_VERSION].includes(version)) fail('SCHEMA_UNSUPPORTED');
    if (header[18]!==1 || header[19]!==1) fail('SCHEMA_UNSUPPORTED');
    const pageSize=header.readUInt16BE(16)===1 ? 65536 : header.readUInt16BE(16);
    if (pageSize<512 || pageSize>65536 || (pageSize & (pageSize-1))!==0 || info.size<pageSize || info.size%pageSize!==0 || pageSize-header[20]<480 || header[21]!==64 || header[22]!==32 || header[23]!==32) fail('STORAGE_UNAVAILABLE');
  }
  // lstat also catches a dangling sidecar symlink; no SQLite recovery is allowed
  // on a WAL store, even when the main file's version/header is stale or absent.
  if (lstatSync(`${path}-wal`,{throwIfNoEntry:false}) || lstatSync(`${path}-shm`,{throwIfNoEntry:false})) fail('SCHEMA_UNSUPPORTED');
}


export class Ledger {
  constructor(path, { migrationFault, maxPageCount, validateSnapshot, validateMigration, initializeMigration } = {}) {
    if (typeof path !== 'string' || !isAbsolute(path) || path.length > 4096 || path.includes('\0')) fail('INVALID_CONFIG');
    this.path = path; this.closed = false; this.restricted = false;
    const existed = existsSync(path);
    try {
      preflight(path,existed);
      // An existing rollback journal may need recovery even for read-only SQL.
      // Recover an isolated bounded copy first, so rejected ciphertext/key/legacy
      // metadata never causes SQLite to mutate the original main or journal.
      const journal=lstatSync(`${path}-journal`,{throwIfNoEntry:false});
      if(existed&&journal&&validateSnapshot){
        if(!journal.isFile()||statSync(path).size+journal.size>256*1024*1024)fail('STORAGE_UNAVAILABLE');
        const directory=mkdtempSync(join(tmpdir(),'runtime-ledger-validation-'));
        chmodSync(directory,0o700);
        let snapshot;
        try{
          const snapshotPath=join(directory,'ledger.sqlite');
          copyFileSync(path,snapshotPath,constants.COPYFILE_EXCL);
          chmodSync(snapshotPath,0o600);
          copyFileSync(`${path}-journal`,`${snapshotPath}-journal`,constants.COPYFILE_EXCL);
          chmodSync(`${snapshotPath}-journal`,0o600);
          snapshot=new Ledger(snapshotPath,{validateMigration,initializeMigration});
          validateSnapshot(snapshot);
        }
        finally{
          try{snapshot?.close();}finally{rmSync(directory,{recursive:true,force:true});}
        }
      }
      this.db = new DatabaseSync(path);
      if (!existed) chmodSync(path,0o600);
      this.db.exec('PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > SCHEMA_VERSION) fail('SCHEMA_FUTURE');
      if (version < 0 || (existed && version === 0)) fail('SCHEMA_UNSUPPORTED');
      if (this.db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('STORAGE_INVALID');
      if (!existed) {
        this.db.exec('BEGIN EXCLUSIVE');
        try { this.version(0); if(this.db.prepare("SELECT 1 FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get()) fail('SCHEMA_UNSUPPORTED'); for (const sql of Object.values({ ...BASE, ...EXTRA, ...RUNTIME, ...AUTOMATION })) this.db.exec(sql); this.db.exec(`PRAGMA user_version=${SCHEMA_VERSION}; COMMIT`); }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
      } else if ([1,2,3,4,5].includes(version)) {
        const sourceSchema=version===1 ? BASE : version===2 ? {...BASE,...EXTRA} : version===3 ? {...BASE,...EXTRA,...RUNTIME} : {...BASE,...EXTRA,...RUNTIME,...AUTOMATION};
        this.verify(sourceSchema);
        if (this.db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') fail('SCHEMA_UNSUPPORTED');
        this.db.exec('BEGIN EXCLUSIVE');
        try {
          // Validate source under the exclusive lock before any backup or schema write.
          this.version(version);
          this.verify(sourceSchema);
          this.validateRows(version>=2,version>=3);
          if(version>=3){
            this.validateRuntimeRows(version);
            if(this.db.prepare("SELECT 1 FROM runtime_data WHERE json_extract(metadata,'$.cryptoVersion') IS NOT 2 LIMIT 1").get())fail('CRYPTO_LEGACY_UNVERIFIED');
            if(validateMigration)validateMigration(this);
            else if(this.db.prepare('SELECT 1 FROM runtime_data LIMIT 1').get())fail('RUNTIME_MIGRATION_REQUIRED');
          }
          // Lock out concurrent writes before making an exact recoverable copy.
          this.backupPath = `${path}.schema-${version}.backup`;
          copyFileSync(path, this.backupPath, constants.COPYFILE_EXCL);
          const backupFd=openSync(this.backupPath,'r');
          try { fsyncSync(backupFd); } finally { closeSync(backupFd); }
          const directoryFd=openSync(dirname(path),'r');
          try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
          for (const sql of Object.values(version===1 ? {...EXTRA,...RUNTIME,...AUTOMATION} : version===2 ? {...RUNTIME,...AUTOMATION} : version===3 ? AUTOMATION : {})) this.db.exec(sql);
          if(initializeMigration)initializeMigration(this,version);
          if (migrationFault) { try { migrationFault(); } catch { fail('STORAGE_UNAVAILABLE'); } }
          this.verify({ ...BASE, ...EXTRA, ...RUNTIME, ...AUTOMATION });
          this.validateRows(true,true); this.validateRuntimeRows();
          this.db.exec(`PRAGMA user_version=${SCHEMA_VERSION}`);
          if(validateMigration)validateMigration(this);
          this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
      } else if (version !== SCHEMA_VERSION) fail('SCHEMA_UNSUPPORTED');
      this.db.exec('BEGIN IMMEDIATE');
      try { this.version(SCHEMA_VERSION); this.verify({ ...BASE, ...EXTRA, ...RUNTIME, ...AUTOMATION }); this.validateRows(true,true); this.validateRuntimeRows(); this.db.exec('COMMIT'); }
      catch(error) { this.db.exec('ROLLBACK'); throw error; }
      if (maxPageCount !== undefined) this.db.exec(`PRAGMA max_page_count=${maxPageCount}`);
    } catch (error) {
      try { this.db?.close(); } catch {}
      this.closed = true;
      if (error instanceof FoundationError) throw error;
      fail('STORAGE_UNAVAILABLE');
    }
  }
  version(expected) {
    const actual=this.db.prepare('PRAGMA user_version').get().user_version;
    if(actual>SCHEMA_VERSION) fail('SCHEMA_FUTURE');
    if(actual!==expected || this.db.prepare('PRAGMA journal_mode').get().journal_mode!=='delete') fail('SCHEMA_UNSUPPORTED');
  }
  verify(expected) {
    const tables = this.db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if (tables.length !== Object.keys(expected).length || tables.some(row => !expected[row.name] || normalize(row.sql) !== normalize(expected[row.name]))) fail('SCHEMA_UNSUPPORTED');
    if (this.db.prepare("SELECT name FROM sqlite_schema WHERE type IN ('trigger','view') OR (type='index' AND name NOT LIKE 'sqlite_autoindex_%')").all().length) fail('SCHEMA_UNSUPPORTED');
  }
  validateRows(withActions,withRuntime=false) {
    if (this.db.prepare('SELECT 1 FROM pragma_foreign_key_check LIMIT 1').get()) fail('STORAGE_INVALID');
    const invalid = (table, conditions) => {
      if (this.db.prepare(`SELECT 1 FROM ${table} WHERE ${conditions.join(' OR ')} LIMIT 1`).get()) fail('STORAGE_INVALID');
    };
    const refs = columns => columns.map(column => `(length(${column})!=64 OR ${column} GLOB '*[^a-f0-9]*')`);
    const integers = (columns,min=0) => columns.map(column => `(typeof(${column})!='integer' OR ${column}<${min} OR ${column}>9007199254740991)`);
    const states = "'queued','running','waiting','blocked','recovery_required','cancel_requested','completed','failed','cancelled','deleted'";
    invalid('tasks',[...refs(['owner','workspace','id']),...integers(['version'],1),...integers(['auth_epoch','created_at','updated_at']),`status NOT IN (${states})`]);
    invalid('ingress',[...refs(['owner','workspace','provider','source','event','task']),...integers(['received_at'])]);
    invalid('events',[...refs(['owner','workspace','task']),...integers(['sequence','version'],1),...integers(['at']),`status NOT IN (${states})`,"reason NOT IN ('intake','progress','operator','recovery','fixture','delete','action_requested','grant','revoke','dispatch','cancel','settlement')"]);
    if (this.db.prepare(`SELECT 1 FROM tasks t WHERE (SELECT count(*) FROM ingress i WHERE i.owner=t.owner AND i.workspace=t.workspace AND i.task=t.id)${withRuntime?'<1':'!=1'} OR NOT EXISTS (SELECT 1 FROM events e WHERE e.owner=t.owner AND e.workspace=t.workspace AND e.task=t.id AND e.sequence=(SELECT max(sequence) FROM events x WHERE x.owner=t.owner AND x.workspace=t.workspace AND x.task=t.id) AND e.version=t.version AND e.status=t.status) LIMIT 1`).get()) fail('STORAGE_INVALID');
    if (this.db.prepare('SELECT 1 FROM events GROUP BY owner,workspace,task HAVING min(sequence)!=1 OR max(sequence)!=count(*) LIMIT 1').get()) fail('STORAGE_INVALID');
    if (!withActions) return;
    const kinds="'fixture','read','write','review','repair'";
    invalid('actions',[...refs(['owner','workspace','task','id','target_digest','data_digest']),...integers(['units'],1),...integers(['attempts','created_at','updated_at']),`kind NOT IN (${kinds})`,"state NOT IN ('requested','dispatch_intent','unknown','completed','failed','terminated')", "(state='requested' AND (attempts!=0 OR claim_id IS NOT NULL OR claim_epoch IS NOT NULL))", "(state!='requested' AND (attempts<1 OR claim_id IS NULL OR length(claim_id)!=36 OR claim_id GLOB '*[^a-f0-9-]*' OR claim_epoch IS NULL OR typeof(claim_epoch)!='integer' OR claim_epoch<0))", "(evidence_digest IS NOT NULL AND (length(evidence_digest)!=64 OR evidence_digest GLOB '*[^a-f0-9]*'))"]);
    invalid('grants',[...refs(['owner','workspace','task','action','target_digest','data_digest']),...integers(['task_version','auth_epoch','units'],1),...integers(['expires_at']),`kind NOT IN (${kinds})`,"revoked NOT IN (0,1)"]);
    invalid('reservations',[...refs(['owner','workspace','task','action']),...integers(['units'],1),...integers(['created_at']),"length(claim_id)!=36 OR claim_id GLOB '*[^a-f0-9-]*'"]);
    if(this.db.prepare("SELECT 1 FROM reservations r JOIN actions a ON a.owner=r.owner AND a.workspace=r.workspace AND a.task=r.task AND a.id=r.action WHERE a.claim_id!=r.claim_id OR a.units!=r.units OR a.state NOT IN ('dispatch_intent','unknown') LIMIT 1").get()) fail('STORAGE_INVALID');
    if(this.db.prepare("SELECT 1 FROM actions a WHERE (SELECT count(*) FROM reservations r WHERE r.owner=a.owner AND r.workspace=a.workspace AND r.task=a.task AND r.action=a.id)!=(a.state IN ('dispatch_intent','unknown')) LIMIT 1").get()) fail('STORAGE_INVALID');
    if(this.db.prepare('SELECT 1 FROM grants g JOIN tasks t ON t.owner=g.owner AND t.workspace=g.workspace AND t.id=g.task WHERE g.auth_epoch>t.auth_epoch OR g.task_version>t.version LIMIT 1').get()) fail('STORAGE_INVALID');
    if(this.db.prepare("SELECT 1 FROM reservations r JOIN tasks t ON t.owner=r.owner AND t.workspace=r.workspace AND t.id=r.task WHERE t.status IN ('completed','failed','cancelled','deleted') LIMIT 1").get()) fail('STORAGE_INVALID');
  }
  validateRuntimeRows(version=SCHEMA_VERSION) {
    if(this.db.prepare("SELECT 1 FROM sqlite_schema WHERE name='automation_records'").get()){
      const auditKinds=(version>=5?",'audit_input','audit_result'":'')+(version>=6?",'local_source_pair','local_notification_policy','local_report','normal_provenance_registry'":'');
      if(this.db.prepare(`SELECT 1 FROM automation_records WHERE kind NOT IN ('source','subscription','event','clock','semantic','audit','report','repair','execution','receipt_policy','legacy_command','notification_policy','notification_window','notification_group','notification_fact','notification_claim'${auditKinds}) OR NOT json_valid(payload) LIMIT 1`).get()||this.db.prepare('SELECT 1 FROM workspace_memory WHERE revision<1 OR NOT json_valid(metadata) LIMIT 1').get())fail('STORAGE_INVALID');
    }
    if(this.db.prepare("SELECT 1 FROM sqlite_schema WHERE name='automation_records'").get()&&this.db.prepare("SELECT 1 FROM automation_records a WHERE a.task IS NOT NULL AND NOT EXISTS(SELECT 1 FROM runtime_tasks t WHERE t.owner=a.owner AND t.workspace=a.workspace AND t.task=a.task) LIMIT 1").get())fail('STORAGE_INVALID');
    if(this.db.prepare("SELECT 1 FROM runtime_tasks WHERE control NOT IN ('active','paused','cancel_requested') LIMIT 1").get()) fail('STORAGE_INVALID');
    for(const [table,columns] of Object.entries({runtime_commands:['receipt'],runtime_data:['metadata'],runtime_policy:['payload'],runtime_actions:['spec','metadata'],runtime_workers:['payload'],runtime_records:['payload']})) {
      for(const column of columns) if(this.db.prepare(`SELECT 1 FROM ${table} WHERE NOT json_valid(${column}) LIMIT 1`).get()) fail('STORAGE_INVALID');
    }
    for(const table of ['runtime_data','runtime_actions','runtime_workers','runtime_records',...(this.one("SELECT 1 FROM sqlite_schema WHERE name='automation_records'")?['automation_records']:[])]) {
      if(this.db.prepare(`SELECT 1 FROM ${table} x WHERE x.task IS NOT NULL AND NOT EXISTS (SELECT 1 FROM runtime_tasks t WHERE t.owner=x.owner AND t.workspace=x.workspace AND t.task=x.task) LIMIT 1`).get()) fail('STORAGE_INVALID');
    }
    if(this.db.prepare("SELECT 1 FROM runtime_workers w LEFT JOIN runtime_actions a ON a.owner=w.owner AND a.workspace=w.workspace AND a.task=w.task AND a.action=json_extract(w.payload,'$.actionRef') WHERE a.action IS NULL OR json_extract(a.metadata,'$.claimRef')!=w.claim OR json_extract(w.payload,'$.claimRef')!=w.claim LIMIT 1").get()) fail('STORAGE_INVALID');
  }
  runtimeManaged(keys) { const managed=!!this.one('SELECT 1 FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...keys);if(!managed){for(const table of ['runtime_data','runtime_actions','runtime_workers','runtime_records',...(this.one("SELECT 1 FROM sqlite_schema WHERE name='automation_records'")?['automation_records']:[])])if(this.one(`SELECT 1 FROM ${table} WHERE owner=? AND workspace=? AND task=? LIMIT 1`,...keys))fail('STORAGE_INVALID');}return managed; }
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
      try { this.version(SCHEMA_VERSION); const result = fn(); this.db.exec('COMMIT'); return result; }
      catch (error) { try { this.db.exec('ROLLBACK'); } catch { this.restricted = true; } throw error; }
    });
  }
  close() { if (!this.closed) { try { this.db.close(); } catch { fail('STORAGE_UNAVAILABLE'); } finally { this.closed = true; } } }
}

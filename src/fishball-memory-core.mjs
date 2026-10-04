// Private semantic adaptation of the exact fishball revisions recorded in
// docs/fishball-provenance.md. Redistribution is blocked pending license review.
// No task state, grants, caller authentication, inference or automatic imports.
import { types } from 'node:util';

export const FISHBALL_PINS = Object.freeze({ main: 'f4a887d37b4c60a65ccc7c22fd87b19639287a0a', release: '32ac8236bdb8d93c0a895b81557c4d915cf5e80c' });
export const MEMORY_VERSION = 'bubbles.fishball-memory/v1';
export const DAY_MS = 86400000;
const WORLD_TTL = Object.freeze({ PERMANENT: null, ONE_YEAR: 365 * DAY_MS, ONE_MONTH: 30 * DAY_MS, ALWAYS_RESEARCH: 0 });
const PREFERENCE_TTL = Object.freeze({ PERMANENT: null, SIX_MONTHS: 182 * DAY_MS, ONE_MONTH: 30 * DAY_MS });
const KIND_TTL = Object.freeze({ MEDICAL_CONSTANT: 'PERMANENT', PROFILE: 'PERMANENT', CURRENT_STATE: 'SIX_MONTHS', TRANSIENT: 'ONE_MONTH' });
const TIER = ['LOW', 'PERSONAL', 'INSTITUTIONAL', 'AUTHORITATIVE'];
const MAX_FILE = 4194304;
export class MemoryError extends Error { constructor(code) { super(code); this.name = 'MemoryError'; this.code = code; } }
const fail = code => { throw new MemoryError(code); };
const clone = value => JSON.parse(JSON.stringify(value));
function object(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('MEMORY_INVALID');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !allowed.includes(key) || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')) || required.some(key => !Object.hasOwn(fields, key))) fail('MEMORY_INVALID');
}
function array(value, max = 256) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) fail('MEMORY_LIMIT');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || !Number.isSafeInteger(Number(key)) || Number(key) >= value.length || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')))) fail('MEMORY_INVALID');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(fields, String(i))) fail('MEMORY_INVALID');
  return value;
}
function number(value, min = 0) { if (!Number.isSafeInteger(value) || value < min) fail('MEMORY_INVALID'); return value; }
function text(value, max = 65536) { if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\u0000') || Buffer.byteLength(value, 'utf8') > max) fail('MEMORY_INVALID'); return value; }
function scope(value) {
  object(value, ['ownerRef', 'workspaceRef'], ['ownerRef', 'workspaceRef']);
  for (const ref of Object.values(value)) if (typeof ref !== 'string' || ref.length !== 64 || !/^[a-f0-9]{64}$/.test(ref)) fail('MEMORY_SCOPE');
  return { ownerRef: value.ownerRef, workspaceRef: value.workspaceRef };
}
function vector(value = []) { return array(value, 4096).map(item => { if (typeof item !== 'number' || !Number.isFinite(item) || !Number.isFinite(Math.fround(item))) fail('MEMORY_INVALID'); return Math.fround(item); }); }
function strings(value = [], max = 64) { return array(value, max).map(item => text(item, 8192)); }
function json(value, depth = 0) {
  if (depth > 8) fail('MEMORY_LIMIT');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return text(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('MEMORY_INVALID'); return value; }
  if (Array.isArray(value)) return array(value, 64).map(item => json(item, depth + 1));
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('MEMORY_INVALID');
  const fields = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(fields);
  if (keys.length > 64 || keys.some(key => typeof key !== 'string' || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value'))) fail('MEMORY_INVALID');
  const result = {};
  for (const key of keys) { text(key, 128); Object.defineProperty(result, key, { value: json(fields[key].value, depth + 1), enumerable: true, writable: true, configurable: true }); }
  return result;
}
function secrets(value, forbidden) {
  if (typeof value === 'string') {
    if (forbidden.some(secret => value.includes(secret)) || /\b(?:sk_live_|sk-proj-|Bearer\s+)[A-Za-z0-9_.-]{8,}/i.test(value) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) fail('SECRET_REJECTED');
  } else if (Array.isArray(value)) value.forEach(item => secrets(item, forbidden));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (/^(?:password|api[_-]?key|access[_-]?token|authorization|secret)$/i.test(key)) fail('SECRET_REJECTED');
    secrets(key, forbidden); secrets(item, forbidden);
  }
}
function enumOr(value, options, fallback) { return typeof value === 'string' && options.includes(value) ? value : fallback; }
const TTL_LABELS = Object.freeze({ '永久': 'PERMANENT', '1年': 'ONE_YEAR', '1个月': 'ONE_MONTH', '总是重查': 'ALWAYS_RESEARCH', '6个月': 'SIX_MONTHS' });
export const parseWorldTtl = raw => enumOr(typeof raw === 'string' ? TTL_LABELS[raw.trim()] ?? raw.trim().toUpperCase() : raw, Object.keys(WORLD_TTL), 'ALWAYS_RESEARCH');
export const parsePreferenceTtl = raw => enumOr(typeof raw === 'string' ? TTL_LABELS[raw.trim()] ?? raw.trim().toUpperCase() : raw, Object.keys(PREFERENCE_TTL), 'ONE_MONTH');
function worldFact(value) {
  boundedData(value);
  object(value, ['id', 'question', 'answer', 'ttl', 'tier', 'sources', 'embedding', 'recordedAt', 'invalidatedAt'], ['id', 'question', 'answer', 'ttl', 'tier', 'recordedAt']);
  return { id: number(value.id, 1), question: text(value.question), answer: text(value.answer), ttl: parseWorldTtl(value.ttl), tier: enumOr(value.tier, TIER, 'LOW'), sources: strings(value.sources), embedding: vector(value.embedding), recordedAt: number(value.recordedAt), invalidatedAt: value.invalidatedAt == null ? null : number(value.invalidatedAt) };
}
function preference(value) {
  boundedData(value);
  object(value, ['id', 'text', 'kind', 'ttl', 'embedding', 'recordedAt', 'confirmedAt'], ['id', 'text', 'kind', 'ttl', 'recordedAt']);
  const kind = enumOr(value.kind, Object.keys(KIND_TTL), 'TRANSIENT');
  return { id: number(value.id, 1), text: text(value.text), kind, ttl: enumOr(value.ttl, Object.keys(PREFERENCE_TTL), KIND_TTL[kind]), embedding: vector(value.embedding), recordedAt: number(value.recordedAt), confirmedAt: number(value.confirmedAt ?? value.recordedAt) };
}
function citedSource(value) {
  object(value, ['url', 'displayName', 'explanation', 'tier', 'quote'], ['url', 'displayName', 'tier']);
  return { url: text(value.url, 8192), displayName: text(value.displayName, 8192), explanation: value.explanation == null ? null : text(value.explanation), tier: enumOr(value.tier, TIER, 'LOW'), quote: value.quote == null ? null : text(value.quote) };
}
function round(value) {
  object(value, ['exchanges', 'known', 'thinking', 'said']);
  const exchanges = array(value.exchanges ?? [], 32).map(exchange => {
    object(exchange, ['id', 'name', 'input', 'result', 'isError'], ['id', 'name', 'input', 'result']);
    if (exchange.isError !== undefined && typeof exchange.isError !== 'boolean') fail('MEMORY_INVALID');
    if (!exchange.input || typeof exchange.input !== 'object' || Array.isArray(exchange.input)) fail('MEMORY_INVALID');
    return { id: text(exchange.id, 256), name: text(exchange.name, 256), input: json(exchange.input), result: text(exchange.result), isError: exchange.isError ?? false };
  });
  return { exchanges, known: strings(value.known), thinking: text(value.thinking ?? ''), said: strings(value.said) };
}
function turn(value) {
  boundedData(value);
  object(value, ['id', 'sessionId', 'at', 'speaker', 'text', 'shape', 'sources', 'reasoning', 'images', 'steps', 'rounds', 'inFlight', 'steered', 'quoted'], ['id', 'sessionId', 'at', 'speaker', 'text']);
  for (const key of ['inFlight', 'steered']) if (value[key] !== undefined && typeof value[key] !== 'boolean') fail('MEMORY_INVALID');
  const images = strings(value.images, 16);
  if (images.some(name => name.includes('..') || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name))) fail('MEMORY_INVALID');
  return { id: number(value.id, 1), sessionId: number(value.sessionId, 1), at: number(value.at), speaker: enumOr(value.speaker, ['USER', 'ASSISTANT'], 'USER'), text: text(value.text), shape: value.shape == null ? null : text(value.shape, 128), sources: array(value.sources ?? [], 32).map(citedSource), reasoning: text(value.reasoning ?? ''), images, steps: strings(value.steps), rounds: array(value.rounds ?? [], 32).map(round), inFlight: value.inFlight ?? false, steered: value.steered ?? false, quoted: value.quoted == null ? null : text(value.quoted) };
}
function session(value) {
  if (value === null || value === undefined) return null;
  object(value, ['id', 'startedAt', 'bridge', 'compactedThrough'], ['id', 'startedAt']);
  return { id: number(value.id, 1), startedAt: number(value.startedAt), bridge: value.bridge == null ? null : text(value.bridge), compactedThrough: number(value.compactedThrough ?? 0) };
}
function boundedData(value) {
  let bytes = 0, nodes = 0;
  const add = count => { bytes += count; if (bytes > MAX_FILE || ++nodes > 300000) fail('MEMORY_LIMIT'); };
  function walk(item, depth = 0) {
    if (depth > 12) fail('MEMORY_LIMIT');
    if (item === null || typeof item === 'boolean') { add(item === null ? 4 : item ? 4 : 5); return; }
    if (typeof item === 'string') { text(item); add(Buffer.byteLength(JSON.stringify(item))); return; }
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('MEMORY_INVALID'); add(String(item).length); return; }
    if (Array.isArray(item)) { array(item, 4096); add(2 + Math.max(0, item.length - 1)); for (const child of item) walk(child, depth + 1); return; }
    if (!item || typeof item !== 'object' || types.isProxy(item) || Object.getPrototypeOf(item) !== Object.prototype) fail('MEMORY_INVALID');
    const fields = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(fields);
    if (keys.length > 64 || keys.some(key => typeof key !== 'string' || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value'))) fail('MEMORY_INVALID');
    add(2 + keys.length + Math.max(0, keys.length - 1));
    for (const key of keys) { text(key, 128); add(Buffer.byteLength(JSON.stringify(key))); walk(fields[key].value, depth + 1); }
  }
  walk(value);
}
function whole(value, binding, forbidden = [], native = false) {
  boundedData(value);
  object(value, native ? ['contractVersion', 'scope', 'world', 'preferences', 'turns', 'idSeq', 'session'] : ['world', 'preferences', 'turns', 'idSeq', 'session']);
  if (native && (value.contractVersion !== MEMORY_VERSION || JSON.stringify(scope(value.scope)) !== JSON.stringify(binding))) fail('MEMORY_SCOPE');
  const result = { contractVersion: MEMORY_VERSION, scope: { ...binding }, world: array(value.world ?? []).map(worldFact), preferences: array(value.preferences ?? []).map(preference), turns: array(value.turns ?? [], 1024).map(turn), idSeq: number(value.idSeq ?? 0), session: session(value.session) };
  const seen = new Set();
  for (const item of [...result.world, ...result.preferences, ...result.turns]) { if (seen.has(item.id)) fail('MEMORY_CONFLICT'); seen.add(item.id); result.idSeq = Math.max(result.idSeq, item.id); }
  if (result.session) result.idSeq = Math.max(result.idSeq, result.session.id);
  secrets(result, forbidden);
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_FILE) fail('MEMORY_LIMIT');
  return result;
}
function parseDocument(value) { text(value, MAX_FILE); try { return JSON.parse(value); } catch { fail('MEMORY_CORRUPT'); } }

// Explicit caller-supplied import only. No file, profile, personal data lookup.
// Snapshot and JSONL are fully validated before any merge/write can happen.
export function migratePinnedFishball(options) {
  object(options, ['snapshotText', 'turnLogText', 'scope', 'forbiddenSecrets'], ['scope']);
  let { snapshotText, turnLogText = '', scope: binding, forbiddenSecrets = [] } = options;
  binding = scope(binding); const forbidden = strings(forbiddenSecrets, 64);
  if (forbidden.some(secret => !secret.length)) fail('MEMORY_INVALID');
  const restored = whole(snapshotText === undefined ? {} : parseDocument(snapshotText), binding, forbidden);
  text(turnLogText, MAX_FILE);
  const rows = turnLogText === '' ? [] : turnLogText.split('\n');
  if (rows.at(-1) === '') rows.pop();
  if (rows.length > 4096) fail('MEMORY_LIMIT');
  const logged = new Map();
  for (const row of rows) { if (!row.length) fail('MEMORY_CORRUPT'); const record = turn(parseDocument(row)); secrets(record, forbidden); logged.set(record.id, record); }
  const merged = new Map(restored.turns.map(record => [record.id, record]));
  for (const [id, record] of logged) merged.set(id, record);
  return whole({ ...restored, turns: [...merged.values()].sort((a, b) => a.id - b.id) }, binding, forbidden, true);
}

// Kotlin Char semantics: keep BMP letters/decimal digits, then UTF-16 bigrams.
export function bigrams(value) {
  text(value); let cleaned = '';
  for (let i = 0; i < value.length; i++) if (/[\p{L}\p{Nd}]/u.test(value[i])) cleaned += value[i];
  cleaned = cleaned.toLowerCase(); const result = new Set();
  for (let i = 0; i < cleaned.length - 1; i++) result.add(cleaned.slice(i, i + 2));
  return result;
}
export function jaccard(a, b) {
  const x = bigrams(a), y = bigrams(b); if (!x.size || !y.size) return 0;
  let overlap = 0; for (const item of x) if (y.has(item)) overlap++;
  return overlap / (x.size + y.size - overlap);
}
export function cosine(a, b) {
  a = vector(a); b = vector(b); if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
export function worldFresh(fact, now) { fact = worldFact(fact); number(now); const ttl = WORLD_TTL[fact.ttl]; return fact.invalidatedAt === null && now >= fact.recordedAt && ttl !== 0 && (ttl === null || now - fact.recordedAt < ttl); }
export function preferenceFresh(fact, now) { fact = preference(fact); number(now); const ttl = PREFERENCE_TTL[fact.ttl]; return now >= fact.recordedAt && now >= fact.confirmedAt && (ttl === null || now - fact.confirmedAt < ttl); }
export function needsConfirmation(fact, topic, now) { return ['HEALTH', 'MEDICATION'].includes(topic) && !preferenceFresh(fact, now); }

export class FishballMemoryCore {
  #state; #forbidden; #persist; #blocked = false; #writing = false;
  constructor(options) {
    object(options, ['scope', 'snapshotText', 'persist', 'forbiddenSecrets'], ['scope']);
    let { scope: binding, snapshotText, persist, forbiddenSecrets = [] } = options;
    binding = scope(binding); this.#forbidden = strings(forbiddenSecrets, 64);
    if (this.#forbidden.some(secret => !secret.length) || persist !== undefined && typeof persist !== 'function') fail('MEMORY_INVALID');
    this.#state = whole(snapshotText === undefined ? {} : parseDocument(snapshotText), binding, this.#forbidden, snapshotText !== undefined);
    this.#persist = persist;
  }
  #available() { if (this.#blocked) fail('MEMORY_RECOVERY_REQUIRED'); if (this.#writing) fail('MEMORY_BUSY'); }
  #commit(edit) {
    this.#available(); const next = clone(this.#state); const result = edit(next);
    const checked = whole(next, this.#state.scope, this.#forbidden, true);
    if (this.#persist) {
      this.#writing = true;
      try { if (this.#persist(JSON.stringify(checked)) !== true) fail('MEMORY_IO'); }
      catch { this.#blocked = true; fail('MEMORY_IO'); }
      finally { this.#writing = false; }
    }
    this.#state = checked; return result;
  }
  snapshot() { this.#available(); return clone(this.#state); }
  nextId() { return this.#commit(state => { state.idSeq = number(state.idSeq + 1, 1); return state.idSeq; }); }
  recordWorldFact(value) { value = worldFact(value); return this.#commit(state => { state.world.push(value); return value.id; }); }
  recordPreference(value) { value = preference(value); return this.#commit(state => { state.preferences.push(value); return value.id; }); }
  appendTurn(value) { value = turn(value); return this.#commit(state => { state.turns.push(value); return value.id; }); }
  replaceTurn(value) { value = turn(value); this.#commit(state => { const index = state.turns.findIndex(item => item.id === value.id); if (index < 0) state.turns.push(value); else state.turns[index] = value; }); }
  invalidateWorldFact(id, at) { number(id, 1); number(at); this.#commit(state => { const found = state.world.find(item => item.id === id); if (found) found.invalidatedAt = at; }); }
  confirmPreference(id, at) { number(id, 1); number(at); this.#commit(state => { const found = state.preferences.find(item => item.id === id); if (found) found.confirmedAt = at; }); }
  forgetPreference(id) { number(id, 1); this.#commit(state => { state.preferences = state.preferences.filter(item => item.id !== id); }); }
  dropTurns(ids) { array(ids, 1024).forEach(id => number(id, 1)); const removed = new Set(ids); this.#commit(state => { state.turns = state.turns.filter(item => !removed.has(item.id)); }); }
  clearTurns() { this.#commit(state => { state.turns = []; state.session = null; }); }
  saveSession(value) { value = session(value); this.#commit(state => { state.session = value; }); }
  loadSession() { this.#available(); return clone(this.#state.session); }
  preferences() { this.#available(); return clone(this.#state.preferences); }
  worldFacts() { this.#available(); return clone(this.#state.world); }
  turnsInSession(id) { number(id, 1); this.#available(); return clone(this.#state.turns.filter(item => item.sessionId === id).sort((a, b) => a.at - b.at)); }
  recentTurns(limit = 100) { number(limit); if (limit > 1024) fail('MEMORY_LIMIT'); this.#available(); return limit === 0 ? [] : clone([...this.#state.turns].sort((a, b) => a.at - b.at).slice(-limit)); }
  lastTurnAt() { this.#available(); return this.#state.turns.length ? Math.max(...this.#state.turns.map(item => item.at)) : null; }
  turnCount() { this.#available(); return this.#state.turns.length; }
  turnBytes() { this.#available(); return this.#state.turns.reduce((total, item) => total + Buffer.byteLength(JSON.stringify(item), 'utf8'), 0); }
  recallWorldFact(question, now) {
    text(question); number(now); this.#available();
    const best = this.#state.world.filter(item => item.invalidatedAt === null).map(fact => ({ fact, similarity: jaccard(question, fact.question), fresh: worldFresh(fact, now) })).filter(item => item.similarity >= 0.62).sort((a, b) => b.similarity - a.similarity)[0];
    return best ? clone(best) : null;
  }
  #candidates(facts, terms, vectors, limit, now) {
    terms = strings(terms, 32); vectors = array(vectors, 32).map(vector); number(limit); if (limit > 256) fail('MEMORY_LIMIT');
    const scored = facts.map(fact => ({ fact, similarity: Math.max(0, ...terms.map(term => jaccard(term, fact.question ?? fact.text)), ...vectors.map(query => cosine(query, fact.embedding))), ...(now === undefined ? {} : { fresh: worldFresh(fact, now) }) }));
    return clone(scored.filter(item => item.similarity >= 0.25).sort((a, b) => b.similarity - a.similarity).slice(0, limit));
  }
  recallWorldCandidates(terms, vectors, now, limit = 10) { this.#available(); number(now); return this.#candidates(this.#state.world.filter(item => item.invalidatedAt === null), terms, vectors, limit, now); }
  recallPreferenceCandidates(terms, vectors, limit = 10) { this.#available(); return this.#candidates(this.#state.preferences, terms, vectors, limit); }
  searchTurns(query, options = {}) {
    object(options, ['from', 'to', 'limit']); const { from = null, to = null, limit = 20 } = options;
    text(query); if (from !== null) number(from); if (to !== null) number(to); number(limit); if (limit > 1024 || from !== null && to !== null && from > to) fail('MEMORY_INVALID'); this.#available();
    return clone(this.#state.turns.filter(item => (from === null || item.at >= from) && (to === null || item.at <= to)).map(item => ({ item, score: jaccard(query, item.text) })).filter(({ item, score }) => score > 0.12 || item.text.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.score - a.score || b.item.at - a.item.at).slice(0, limit).map(({ item }) => item));
  }
}

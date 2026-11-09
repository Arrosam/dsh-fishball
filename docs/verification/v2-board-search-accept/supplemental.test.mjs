import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveOfficialSDK } from '../../../test/support/provider-sync-sdk.mjs';
resolveOfficialSDK();
const { createBoardTools } = await import('../../../packages/board/src/board.js');
const { createBoardStore } = await import('../../../packages/board/src/store.js');
const { createBoardSearch } = await import('../../../packages/board/src/search.js');
async function fixture(run) {
 const root = await realpath(os.tmpdir());
 const home = await mkdtemp(path.join(root, 'fbtest-search-independent-'));
 try {
  let clock = Date.now();
  const now = () => clock;
  const store = createBoardStore({ home, now });
  const options = { openStore: () => store, sessionId: () => 'session-fishball', now };
  const exec = { agent: { id: 'session-fishball', session: { id: 'session-fishball' } } };
  const tool = createBoardTools(options).find(t => t.name === 'board_write');
  const search = createBoardSearch(options);
  await run({ setClock: value => { clock = value; }, time: now(), read: () => store.read(), rawWrite: card => tool.execute({ cards: [card] }, exec), write: async card => {
   const result = await tool.execute({ cards: [card] }, exec);
   assert.notEqual(result.ok, false, JSON.stringify(result));
   return result.cards[0]?.id;
  }, search: async query => {
   const result = await search.execute({ query }, exec);
   assert.equal(result.ok, true, JSON.stringify(result));
   return result;
  }, bytes: async () => Promise.all(['board.json','archive.jsonl'].map(name => readFile(path.join(home, 'fishball-board', name), 'utf8'))) });
 } finally {
  const target = await realpath(home);
  assert.equal(path.dirname(target), root);
  assert.ok(path.basename(target).startsWith('fbtest-search-independent-'));
  await rm(target, { recursive: true, force: true });
 }
}
test('Supplemental search edited-away cleared history remains findable and healthy search is byte-readonly', async () => fixture(async rig => {
 const id = await rig.write({ title: 'needle original', note: '', status: 'todo' });
 rig.setClock(rig.time + 1);
 await rig.write({ id, title: 'renamed', note: '', status: 'done' });
 await rig.write({ id, clear: true });
 const before = await rig.bytes();
 const result = await rig.search('needle');
 assert.equal(result.results.length, 1);
 assert.equal(result.results[0].card.title, 'needle original');
 assert.equal(result.results[0].card.id, id);
 assert.equal(result.results[0].archiveLine, 1);
 assert.equal(result.results[0].onBoard, false);
 assert.equal((await rig.search('absent')).results.length, 0);
 assert.deepEqual(await rig.bytes(), before);
}));
test('Supplemental R3 same-id clock rollback selects highest timestamp then highest archive line', async () => fixture(async rig => {
 const id = await rig.write({ title: 'needle first', note: '', status: 'todo' });
 rig.setClock(rig.time + 100);
 await rig.write({ id, title: 'needle highest earlier line', status: 'todo' });
 await rig.write({ id, title: 'needle highest later line', status: 'todo' });
 rig.setClock(rig.time + 50);
 await rig.write({ id, title: 'needle rollback', status: 'todo' });
 const before = await rig.bytes();
 const result = await rig.search('needle');
 assert.equal(result.results.length, 1);
 assert.equal(result.results[0].card.title, 'needle highest later line');
 assert.equal(result.results[0].card.updatedAt, rig.time + 100);
 assert.equal(result.results[0].archiveLine, 3);
 assert.deepEqual(await rig.bytes(), before);
}));

const units = { BMP: 'a', ASTRAL: '🧭', COMBINING: 'e\u0301', MIXED: 'a🧭' };
for (const [kind, unit] of Object.entries(units)) {
 for (const [field, bound] of [['title', 120], ['note', 500]]) {
  for (const delta of [-1, 0, 1]) {
   const length = bound + delta;
   test(`Supplemental R1 ${field} ${kind} ${length} code points`, async () => fixture(async rig => {
    const text = [...unit.repeat(length)].slice(0, length).join('');
    const result = await rig.rawWrite({ title: 'boundary', note: '', status: 'todo', [field]: text });
    if (delta > 0) assert.deepEqual(result, { ok: false, code: 'invalid-input' });
    else {
     assert.equal(result.cards?.length, 1, JSON.stringify(result));
     assert.equal((await rig.read()).cards[0][field], text);
    }
   }));
  }
 }
}

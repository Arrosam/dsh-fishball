/*
 * B11 requirements-only use cases — authored BEFORE reading any test fixture.
 * Sources: pinned board-design §3/§6 (fc9bc8daa66d7c3a19e3275042a008ce571d1443);
 * instance-extension-points X1/X2 and §12.6–12.7
 * (a8bdb0ebdfd7b8985975b8c8e61adc737bb2df74; supersedes retention/search);
 * core requirements:613 and delta:61 (bf39b487b9e6c2b43310cd0af654bc5d359c78c5).
 * Query length is Unicode CODE POINTS, as explicitly requested by the user.
 * No product implementation was read to derive these cases.
 *
 * UC-01 — Manager retrieves permanent historical work.
 * Actor: Fishball manager. Preconditions: plugin enabled; committed snapshots
 * include a year-old, closed, cleared/off-board card and edited-away text.
 * Main flow: submit a trimmed literal query; scan committed history; return the
 * newest matching snapshot per id with provenance, fields and current visibility.
 * Alternative flows: match title, note or both; filter a historical status;
 * return an empty list; omit limit for 20; truncate only distinct matching ids.
 * Exception flows: invalid arguments -> invalid-input; foreign caller ->
 * not-manager; corrupt/unreadable history -> board-unavailable, never partial
 * complete success. Postconditions: board, archive and visibility unchanged.
 *
 * UC-02 — Manager searches independently of context injection.
 * Actor: Fishball manager. Preconditions: X1/X2 present; inject=false.
 * Main flow: X2 registers board_search; manager calls it; history is returned.
 * Alternative flows: create/resume setup scopes; injection enabled.
 * Exception flows: a captured tool called as a non-manager is refused.
 * Postconditions: no worker registration; plugin disposal removes the tool.
 *
 * UC-03 — Manager searches beyond board and recent-history budgets.
 * Actor: Fishball manager. Preconditions: archive exceeds 10,000 lines and has
 * ancient/off-board matches at both ends. Main flow: search all committed lines;
 * return both old and deep matches with correct provenance. Alternative flows:
 * bounded result selection and default/explicit limits are covered by DT-R*.
 * Exception flows: corruption even beyond the selected top hits refuses, rather
 * than claiming a complete scan. Postconditions: no age/line-count cutoff.
 *
 * UC-04 — Manager searches a well-formed board without changing it.
 * Actor: Fishball manager. Preconditions: valid board/archive and context enabled.
 * Main flow: record child-home bytes/metadata and prompt contribution; search for
 * a match; compare the same observations. Alternative flows: no-match search.
 * Exception flows: invalid calls and I/O failures never justify mutation (legacy
 * migration/quarantine oracle is explicitly withheld below). Postconditions:
 * cards, timestamps, archive and current visibility remain unchanged.
 *
 * ST-S*: committed archive -> scan -> success at one stable committed boundary;
 * concurrent append -> next scan may see later committed data, never half a line;
 * cancellation/read failure -> no completeness success. Unsupported deterministic
 * pause/fault seams are TODOs, not replaced by mock search or timing races.
 * DT-M*: title/note match = T/F -> title; F/T -> note; T/T -> both; F/F -> no hit.
 * DT-S*: query matches AND snapshot status equals optional filter -> eligible;
 * current status never changes that decision. DT-R*: filter -> newest matching
 * per id -> updatedAt/line descending -> limit; excess DISTINCT ids -> truncated.
 * ST-01 registered -> disposed -> absent -> disposed again -> still absent.
 * EP-HISTORY covers committed edited-away text; DT-VISIBILITY covers historical
 * closed/off-board snapshots versus the current id projection (not B4 transitions).
 *
 * Case catalogue (one PRIMARY technique per registration; no Error Guessing):
 * DT-01 X2 manager-only registration; EP-01/02 X1 caller rejection;
 * UC-01 permanent year-old cleared/off-board history; UC-02 injection-off;
 * ST-01 dispose lifecycle; EP-HISTORY edited text; DT-VISIBILITY current visibility;
 * BVA-Q* trimmed ASCII and astral 0/1/2/199/200/201 code-point boundaries;
 * BVA-L* limits 0/1/2/19/20/21/49/50/51 and nonintegers;
 * EP-Q*, EP-S*, EP-L*, EP-U* wrong/absent types, statuses, unknown fields;
 * DT-M* title/note/both/neither; EP-M* Unicode/literal/no-fuzzy/no-path behavior;
 * DT-S* all six matching-snapshot statuses; DT-R* selection/dedup/order/limit;
 * EP-F* fresh/unreadable/corrupt archives; UC-03 full unbounded-age/line scan;
 * UC-04 well-formed read-only state; TODO-R* explicitly unresolved requirements;
 * TODO-S* deterministic concurrency/mid-scan fault and native context seams:
 * inspected test fixtures have no supported synchronization/materialization port.
 *
 * Oracle boundaries: R1 original card-field length unit is unresolved (query
 * code points are settled); R3 newest matching snapshot under clock rollback is
 * unresolved. Legacy migration/quarantine versus strict read-only is unresolved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, lstat, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DRIVER = Object.freeze({
  pluginId: 'fishball-board', managerId: 'session-fishball',
  tempPrefix: 'fbtest-b11-search-', boardFile: 'board.json', archiveFile: 'archive.jsonl',
  tool: 'board_search', readTool: 'board_read', guide: 'fishball-board:guide',
  context: 'fishball-board:board', boardVersion: 1, contextCards: 20,
  directoryMode: 0o700, fileMode: 0o600, createdAt: 100,
});

const CASE = Object.freeze({
  queryMin: 1, queryMax: 200, defaultLimit: 20, maxLimit: 50,
  yearMs: 366 * 24 * 60 * 60 * 1000,
  statuses: ['todo', 'in_progress', 'waiting', 'paused', 'done', 'dropped'],
  marker: 'needle', literal: '.*[abc]$(printf BOARD_SEARCH_MUST_NOT_EXECUTE);|`echo x`',
});

// Requirement-derived Use Case registrations come first; all bodies precede helpers.
test('Use Case B11-UC-01 year-old cleared and off-board closed cards remain findable', async (t) => {
  const old = Date.now() - CASE.yearMs;
  const cards = ['done', 'dropped'].map((status, i) => snapshot(i + 1, {
    title: `year-old ${CASE.marker} ${status}`, status, createdAt: old - 1,
    updatedAt: old, closedAt: old,
  }));
  await withRig(t, { archive: cards, board: [] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 2, false);
    assert.deepEqual(result.results.map((hit) => hit.card.id), cards.toReversed().map((card) => card.id));
    for (const hit of result.results) assert.equal(hit.onBoard, false);
  });
});

test('Use Case B11-UC-02 injection off does not remove or disable board_search', async (t) => {
  await withRig(t, { inject: false, archive: [snapshot(1)] }, async (rig) => {
    assert.equal(rig.tools.has('board_search'), true);
    assertSuccess(await rig.search({ query: CASE.marker }), CASE.marker, 1, false);
  });
});

test('Use Case B11-UC-03 no age or line-count cutoff hides a deep ancient match', async (t) => {
  const ancient = snapshot(1, { createdAt: 1, updatedAt: 2, closedAt: 2, status: 'done' });
  const fillers = Array.from({ length: 10001 }, (_, i) => snapshot(2, {
    title: 'unrelated filler', note: '', updatedAt: 1000 + i,
  }));
  const deep = snapshot(3, { title: 'deep needle', updatedAt: 20000 });
  await withRig(t, { archive: [ancient, ...fillers, deep], board: [] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 2, false);
    assert.deepEqual(result.results.map((hit) => [hit.card.id, hit.archiveLine]), [[deep.id, 10003], [ancient.id, 1]]);
  });
});

test('Use Case B11-UC-04 well-formed search leaves cards timestamps files and visibility projection unchanged', async (t) => {
  const card = snapshot(1, { status: 'todo', updatedAt: Date.now() });
  await withRig(t, { archive: [card], board: [card] }, async (rig) => {
    const boardBefore = await rig.readBoard();
    const before = await rig.captureHome();
    const contextBefore = rig.contextDescriptors();
    assertSuccess(await rig.search({ query: CASE.marker }), CASE.marker, 1, false);
    assertSuccess(await rig.search({ query: 'no such text' }), 'no such text', 0, false);
    assert.deepEqual(await rig.captureHome(), before);
    assert.deepEqual(await rig.readBoard(), boardBefore);
    assert.deepEqual(rig.contextDescriptors(), contextBefore);
  });
});

test('Decision Table B11-DT-01 X2 installs board_search in manager setup, never global tools', async (t) => {
  await withRig(t, {}, async (rig) => {
    assert.deepEqual([...new Set(rig.setupPluginIds)], ['fishball-board']);
    assert.equal(rig.tools.has('board_search'), true);
    assert.equal(rig.globalTools.has('board_search'), false);
    assert.equal(rig.guideRegistered(), true);
    const resumed = await rig.resume();
    assert.equal(resumed.tools.has('board_search'), true);
    assertSuccess(await resumed.search({ query: CASE.marker }), CASE.marker, 0, false);
  });
});

for (const [suffix, caller] of [['01', 'worker-session'], ['02', 'other-session']]) {
  test(`EP B11-EP-C${suffix} X1 rejects captured search from ${caller}`, async (t) => {
    await withRig(t, { archive: [snapshot(1)] }, async (rig) => {
      assertRefusal(await rig.search({ query: CASE.marker }, caller), 'not-manager');
    });
  });
}

test('State Transition B11-ST-01 plugin disposal removes the registered search tool idempotently', async (t) => {
  await withRig(t, {}, async (rig) => {
    assert.equal(rig.tools.has('board_search'), true);
    await rig.dispose();
    assert.equal(rig.tools.has('board_search'), false);
    await rig.dispose();
    assert.equal(rig.tools.has('board_search'), false);
  });
});

for (const length of [0, 1, 2, 199, 200, 201]) {
  test(`BVA B11-BVA-QA${String(length).padStart(3, '0')} trimmed ASCII query length ${length}`, async (t) => {
    const query = 'q'.repeat(length);
    await queryBoundary(t, query, length);
  });
}
for (const length of [1, 2, 199, 200, 201]) {
  test(`BVA B11-BVA-QU${String(length).padStart(3, '0')} astral query length ${length} code points`, async (t) => {
    await queryBoundary(t, '🧭'.repeat(length), length);
  });
}

test('BVA B11-BVA-QM200 mixed BMP and astral query uses 200 code points not UTF-16 units', async (t) => {
  await queryBoundary(t, `${'🧭'.repeat(100)}${'q'.repeat(100)}`, CASE.queryMax);
});

test('EP B11-EP-QTRIM Unicode whitespace is trimmed before matching and echoed in success', async (t) => {
  await withRig(t, { archive: [snapshot(1)] }, async (rig) => {
    assertSuccess(await rig.search({ query: '\u2003\t needle \n\u3000' }), CASE.marker, 1, false);
  });
});

test('EP B11-EP-QSPACE whitespace-only query is invalid after trim', async (t) => {
  await invalidInput(t, { query: '\u2003\t\n\u3000' });
});

const invalidQueries = [
  ['MISSING', {}], ['UNDEFINED', { query: undefined }], ['NULL', { query: null }],
  ['NUMBER', { query: 1 }], ['BOOLEAN', { query: true }], ['ARRAY', { query: ['needle'] }],
  ['OBJECT', { query: { text: 'needle' } }],
];
for (const [id, input] of invalidQueries) {
  test(`EP B11-EP-Q${id} query must be a required string`, async (t) => invalidInput(t, input));
}
for (const [id, input] of [['NULL', null], ['ARRAY', []], ['STRING', 'needle'], ['ABSENT', undefined]]) {
  test(`EP B11-EP-ROOT${id} tool input must be an argument object`, async (t) => invalidInput(t, input));
}
for (const field of ['path', 'regex', 'offset', 'unknown']) {
  test(`EP B11-EP-U${field.toUpperCase()} unknown ${field} argument is refused`, async (t) => {
    await invalidInput(t, { query: CASE.marker, [field]: '/tmp/not-an-input' });
  });
}

for (const [id, value] of [
  ['EMPTY', ''], ['UNKNOWN', 'complete'], ['MULTI', ['todo', 'done']], ['NULL', null],
  ['NUMBER', 1], ['BOOLEAN', false], ['OBJECT', { status: 'todo' }],
]) {
  test(`EP B11-EP-S${id} invalid status partition`, async (t) => {
    await invalidInput(t, { query: CASE.marker, status: value });
  });
}

for (const value of [0, 1, 2, 19, 20, 21, 49, 50, 51]) {
  test(`BVA B11-BVA-L${String(value).padStart(2, '0')} limit ${value} is validated without clamping`, async (t) => {
    if (value < 1 || value > CASE.maxLimit) return invalidInput(t, { query: CASE.marker, limit: value });
    await withRig(t, { archive: matchingCards(CASE.maxLimit + 1) }, async (rig) => {
      assertSuccess(await rig.search({ query: CASE.marker, limit: value }), CASE.marker, value, true);
    });
  });
}
for (const [id, value] of [
  ['NEGATIVE', -1], ['FRACTIONLOW', 0.5], ['FRACTION', 20.5], ['NAN', NaN],
  ['INFINITY', Infinity], ['STRING', '20'], ['NULL', null], ['BOOLEAN', true],
  ['ARRAY', [20]], ['OBJECT', { value: 20 }],
]) {
  test(`EP B11-EP-L${id} limit rejects noninteger or wrong-type partition`, async (t) => {
    await invalidInput(t, { query: CASE.marker, limit: value });
  });
}

test('BVA B11-BVA-LDEFAULT omitted limit returns 20 of 21 distinct matches', async (t) => {
  await withRig(t, { archive: matchingCards(CASE.defaultLimit + 1) }, async (rig) => {
    assertSuccess(await rig.search({ query: CASE.marker }), CASE.marker, CASE.defaultLimit, true);
  });
});

for (const [id, title, note, fields] of [
  ['TITLE', 'Needle title', 'no match', ['title']],
  ['NOTE', 'unrelated title', 'a NEEDLE note', ['note']],
  ['BOTH', 'NEEDLE title', 'needle note', ['title', 'note']],
  ['NEITHER', 'unrelated', 'nothing here', []],
]) {
  test(`Decision Table B11-DT-M${id} title/note literal matching and matchedFields`, async (t) => {
    const card = snapshot(1, { title, note });
    await withRig(t, { archive: [card] }, async (rig) => {
      const result = await rig.search({ query: 'NeEdLe' });
      assertSuccess(result, 'NeEdLe', fields.length ? 1 : 0, false);
      if (fields.length) assert.deepEqual([...result.results[0].matchedFields].sort(), [...fields].sort());
    });
  });
}

for (const [id, query, title, expected] of [
  ['NONASCII', 'äωж', 'prefix ÄΩЖ suffix', true],
  ['TURKISH', 'I', 'dotless ı only', false],
  ['DOTTEDI', 'İ', 'i\u0307', true],
  ['SHARPS', 'SS', 'straße', false],
  ['NORMALIZATION', 'é', 'e\u0301', false],
  ['SUBSTRING', 'eed', 'needle', true],
  ['NOTOKEN', 'need le', 'needle', false],
  ['NOFUZZY', 'nedle', 'needle', false],
]) {
  test(`EP B11-EP-M${id} deterministic Unicode lowercase literal matching`, async (t) => {
    await withRig(t, { archive: [snapshot(1, { title, note: '' })] }, async (rig) => {
      assertSuccess(await rig.search({ query }), query, expected ? 1 : 0, false);
    });
  });
}

test('EP B11-EP-MLITERAL regex and shell metacharacters match literally without execution', async (t) => {
  const matching = snapshot(1, { title: 'literal command text', note: CASE.literal });
  const distractor = snapshot(2, { title: 'abc BOARD_SEARCH_MUST_NOT_EXECUTE', note: 'echo x' });
  await withRig(t, { archive: [matching, distractor] }, async (rig) => {
    const before = await rig.captureHome();
    const result = await rig.search({ query: CASE.literal });
    assertSuccess(result, CASE.literal, 1, false);
    assert.deepEqual(result.results[0].card, matching);
    assert.deepEqual(await rig.captureHome(), before);
  });
});

test('EP B11-EP-MPATH a path-looking query is literal text, not a file path input', async (t) => {
  const query = '../../archive.jsonl';
  await withRig(t, { archive: [snapshot(1, { title: query, note: '' })] }, async (rig) => {
    assertSuccess(await rig.search({ query }), query, 1, false);
  });
});

test('EP B11-EP-HISTORY edited-away text returns its matching historical snapshot', async (t) => {
  const historical = snapshot(1, { title: 'old needle title', updatedAt: 1000, status: 'todo' });
  const current = { ...historical, title: 'renamed title', note: 'renamed note', updatedAt: 2000 };
  await withRig(t, { archive: [historical, current], board: [current] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 1, false);
    assert.deepEqual(result.results[0], { card: historical, archiveLine: 1, matchedFields: ['title'], onBoard: true });
  });
});

for (const status of CASE.statuses) {
  test(`Decision Table B11-DT-S${status.toUpperCase()} filter applies to matching snapshot not current status`, async (t) => {
    const historical = snapshot(1, { status, title: 'needle history', updatedAt: 1000 });
    const different = status === 'todo' ? 'in_progress' : 'todo';
    const current = snapshot(1, { status: different, title: 'needle current', updatedAt: 2000 });
    await withRig(t, { archive: [historical, current], board: [current] }, async (rig) => {
      const result = await rig.search({ query: CASE.marker, status });
      assertSuccess(result, CASE.marker, 1, false);
      assert.deepEqual(result.results[0].card, historical);
      assert.equal(result.results[0].archiveLine, 1);
      assert.equal(result.results[0].onBoard, true);
    });
  });
}

test('Decision Table B11-DT-RNEWEST one hit per id uses newest matching snapshot not newest nonmatch', async (t) => {
  const oldest = snapshot(1, { title: 'needle oldest', updatedAt: 1000 });
  const selected = { ...oldest, title: 'needle selected', note: 'needle note', updatedAt: 2000 };
  const newest = { ...selected, title: 'unrelated', note: '', updatedAt: 3000 };
  await withRig(t, { archive: [oldest, selected, newest], board: [newest] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 1, false);
    assert.deepEqual(result.results[0].card, selected);
    assert.equal(result.results[0].archiveLine, 2);
    assert.deepEqual([...result.results[0].matchedFields].sort(), ['note', 'title']);
  });
});

test('Decision Table B11-DT-RORDER updatedAt descending then 1-based archive line descending', async (t) => {
  const a = snapshot(1, { updatedAt: 3000 });
  const b = snapshot(2, { updatedAt: 2000 });
  const c = snapshot(3, { updatedAt: 2000 });
  const d = snapshot(4, { updatedAt: 1000 });
  await withRig(t, { archive: [a, b, d, c] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 4, false);
    assert.deepEqual(result.results.map((hit) => [hit.card.id, hit.archiveLine]), [[a.id, 1], [c.id, 4], [b.id, 2], [d.id, 3]]);
  });
});

test('Decision Table B11-DT-RTIE tied matching snapshots of one id select later archive line', async (t) => {
  const early = snapshot(1, { title: 'needle earlier', updatedAt: 1000 });
  const late = { ...early, title: 'needle later' };
  await withRig(t, { archive: [early, late] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 1, false);
    assert.deepEqual(result.results[0].card, late);
    assert.equal(result.results[0].archiveLine, 2);
  });
});

for (const [id, distinct, limit, expectedTruncated] of [
  ['BELOW', 19, 20, false], ['EXACT', 20, 20, false], ['ABOVE', 21, 20, true],
  ['MAXEXACT', 50, 50, false], ['MAXABOVE', 51, 50, true], ['ONEEXACT', 1, 1, false],
]) {
  test(`Decision Table B11-DT-RTRUNC${id} truncated counts distinct matching ids exactly`, async (t) => {
    const cards = matchingCards(distinct);
    const archive = cards.flatMap((card) => [card, { ...card, updatedAt: card.updatedAt + 1000 }]);
    await withRig(t, { archive }, async (rig) => {
      const result = await rig.search({ query: CASE.marker, limit });
      assertSuccess(result, CASE.marker, Math.min(distinct, limit), expectedTruncated);
      assert.equal(new Set(result.results.map((hit) => hit.card.id)).size, result.results.length);
    });
  });
}

test('Decision Table B11-DT-RFILTER status filtering and dedup precede limit', async (t) => {
  const eligible = matchingCards(3).map((card) => ({ ...card, status: 'done', closedAt: card.updatedAt }));
  const archive = [
    ...eligible,
    ...Array.from({ length: 60 }, (_, i) => snapshot(100 + i, { status: 'todo', updatedAt: 5000 + i })),
    ...Array.from({ length: 60 }, (_, i) => ({ ...eligible[2], updatedAt: 10000 + i, closedAt: 10000 + i })),
  ];
  await withRig(t, { archive }, async (rig) => {
    const result = await rig.search({ query: CASE.marker, status: 'done', limit: 2 });
    assertSuccess(result, CASE.marker, 2, true);
    assert.deepEqual(result.results.map((hit) => hit.card.id), [eligible[2].id, eligible[1].id]);
  });
});

test('EP B11-EP-RCOMPLETE result retains the complete bounded historical card snapshot', async (t) => {
  const card = snapshot(1, {
    title: 'T'.repeat(120), note: `${CASE.marker}${'n'.repeat(500 - CASE.marker.length)}`,
    status: 'waiting', waitingOn: 'user', links: [{ to: 'ses:related-session', relation: 'about' }],
  });
  await withRig(t, { archive: [card], board: [card] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 1, false);
    assert.deepEqual(result.results[0], { card, archiveLine: 1, matchedFields: ['note'], onBoard: true });
  });
});

test('Decision Table B11-DT-VISIBILITY onBoard follows current visibility not the historical snapshot status', async (t) => {
  const old = Date.now() - CASE.yearMs;
  const offBoard = snapshot(1, { status: 'done', updatedAt: old, createdAt: old - 1, closedAt: old });
  const cleared = snapshot(2, { status: 'dropped', updatedAt: Date.now(), closedAt: Date.now() });
  const reopenedHistory = snapshot(3, { status: 'done', updatedAt: old, createdAt: old - 1, closedAt: old });
  const reopenedNow = snapshot(3, {
    title: 'renamed open card', note: '', status: 'todo',
    createdAt: reopenedHistory.createdAt, updatedAt: Date.now(),
  });
  await withRig(t, { archive: [offBoard, cleared, reopenedHistory, reopenedNow], board: [reopenedNow] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 3, false);
    assert.deepEqual(Object.fromEntries(result.results.map((hit) => [hit.card.id, hit.onBoard])), {
      [offBoard.id]: false, [cleared.id]: false, [reopenedHistory.id]: true,
    });
  });
});

test('EP B11-EP-FMISSING fresh missing archive is empty success', async (t) => {
  await withRig(t, {}, async (rig) => assertSuccess(await rig.search({ query: CASE.marker }), CASE.marker, 0, false));
});
for (const [id, archiveText] of [
  ['INVALIDJSON', '{not-json}\n'],
  ['WRONGSHAPE', '{}\n'],
  ['NULL', 'null\n'],
  ['ARRAY', '[]\n'],
  ['BADSTATUS', `${JSON.stringify(snapshot(1, { status: 'not-a-status' }))}\n`],
  ['PARTIALTRAIL', `${JSON.stringify(snapshot(1))}\n{"id":"interrupted`],
  ['CORRUPTMIDDLE', `${JSON.stringify(snapshot(1))}\nnot-json\n${JSON.stringify(snapshot(2))}\n`],
  ['AFTERLIMIT', `${matchingCards(51).map((card) => JSON.stringify(card)).join('\n')}\nnot-json\n`],
]) {
  test(`EP B11-EP-F${id} corrupt archive refuses without empty or partial success`, async (t) => {
    await withRig(t, { archiveText }, async (rig) => {
      assertRefusal(await rig.search({ query: CASE.marker, limit: 1 }), 'board-unavailable');
    });
  });
}

test('EP B11-EP-FUNREADABLE existing unreadable archive is board-unavailable not missing', async (t) => {
  await withRig(t, { archiveAsDirectory: true }, async (rig) => {
    assertRefusal(await rig.search({ query: CASE.marker }), 'board-unavailable');
  });
});

test('Decision Table B11-DT-RDISTINCT equal text on different closed ids is not deduplicated by title or note', async (t) => {
  const first = snapshot(1, { title: 'same needle title', note: 'same needle note' });
  const second = snapshot(2, { title: first.title, note: first.note });
  await withRig(t, { archive: [first, second] }, async (rig) => {
    const result = await rig.search({ query: CASE.marker });
    assertSuccess(result, CASE.marker, 2, false);
    assert.deepEqual(result.results.map((hit) => hit.card.id), [second.id, first.id]);
  });
});

for (const status of ['done', 'dropped']) {
  test(`Decision Table B11-DT-VISIBLE${status.toUpperCase()} recent closed card is onBoard`, async (t) => {
    const now = Date.now();
    const card = snapshot(1, { status, updatedAt: now, closedAt: now });
    await withRig(t, { archive: [card], board: [card] }, async (rig) => {
      const result = await rig.search({ query: CASE.marker });
      assertSuccess(result, CASE.marker, 1, false);
      assert.equal(result.results[0].onBoard, true);
    });
  });
}

test('State Transition B11-ST-CANCELPRE already-cancelled invocation cannot return a completeness success', async (t) => {
  await withRig(t, { archive: matchingCards(CASE.maxLimit + 1) }, async (rig) => {
    assert.equal(rig.tools.has(DRIVER.tool), true);
    const controller = new AbortController();
    controller.abort();
    // Check settlement outside catch: a failed assertion must never become a
    // permitted cancellation rejection. The contract does not choose a code.
    const outcome = await rig.search({ query: CASE.marker }, DRIVER.managerId, controller.signal).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    assert.notEqual(outcome.value?.ok, true);
  });
});

test.todo('BVA B11-TODO-R1 original card title/note Unicode length unit: are astral field bounds code points or UTF-16 units? Query bounds are settled code points');
test.todo('State Transition B11-TODO-R3 clock rollback: does newest matching snapshot mean latest archive line or greatest updatedAt when timestamps decrease?');
test.todo('State Transition B11-TODO-RLEGACY strict read-only search versus legacy board migration: may initialization create archive or rewrite board before search?');
test.todo('State Transition B11-TODO-RQUARANTINE strict read-only search versus corrupt board quarantine: may initialization rename/reset board while archive search is requested?');
test.todo('State Transition B11-TODO-SBOUNDARY stable committed append boundary: requires a supported pause-at-boundary/read seam; no timing race or mock search algorithm');
test.todo('State Transition B11-TODO-SCANCEL mid-scan cancellation must not return completeness success: ToolExecutionContext.signal covers pre-abort, but no supported deterministic scan-pause seam');
test.todo('State Transition B11-TODO-SFAIL scan I/O failure after valid hits must not return completeness success: requires supported mid-scan fault seam');
test.todo('Use Case B11-TODO-SCONTEXT search leaves materialized native context visibility unchanged: fixture only records opaque prompt descriptors; supported materialization seam belongs to B5/X0-C');

/*
 * Local fixture adapter, added AFTER the complete case catalogue and bodies.
 * Fixture-only interfaces: b1 stubContext; instance-ext createContext/createAgentCtx
 * for effect ownership and X2 scope; fixture-tools execute(args, {agent, signal}).
 * This adapter does NOT call bootChild (HTTP/live child not allowed), inspect a
 * product module's source, implement search, or provide private archive hooks.
 * Product loading happens only in a running case, never at test registration.
 */
async function withRig(_t, options, run) {
  const root = await realpath(os.tmpdir());
  const home = await mkdtemp(path.join(root, DRIVER.tempPrefix));
  const boardDir = path.join(home, DRIVER.pluginId);
  let fixture;
  try {
    await mkdir(boardDir, { mode: DRIVER.directoryMode });
    // Avoid exercising legacy migration while testing the independent B11 reader.
    await writeFile(path.join(boardDir, DRIVER.boardFile), JSON.stringify({
      v: DRIVER.boardVersion, cards: options.board ?? [],
    }), { mode: DRIVER.fileMode });
    const archiveFile = path.join(boardDir, DRIVER.archiveFile);
    if (options.archiveAsDirectory) await mkdir(archiveFile);
    else if (options.archiveText !== undefined || options.archive !== undefined) {
      const text = options.archiveText ?? options.archive.map((card) => JSON.stringify(card)).join('\n') + '\n';
      await writeFile(archiveFile, text, { mode: DRIVER.fileMode });
    }
    fixture = createRegistrationFixture(home);
    const { PACKAGE, packageModule } = await import('../../../../test/support/instance-ext-plugins.mjs');
    const row = await packageModule(PACKAGE.board, 'index.js');
    const returned = await row.apply(fixture.ctx, {
      inject: options.inject ?? true, contextCards: DRIVER.contextCards,
    });
    if (typeof returned === 'function') fixture.own(returned);
    assert.ok(fixture.setups.length >= 1, 'board registers its manager setup through X2');
    const managerScope = await fixture.activate(DRIVER.managerId);
    const rig = {
      tools: managerScope.tools,
      globalTools: fixture.globalScope.tools,
      setupPluginIds: fixture.setups.map((entry) => entry.pluginId),
      guideRegistered: () => managerScope.sections.has(DRIVER.guide),
      contextDescriptors: () => [...managerScope.contexts.entries()],
      captureHome: () => captureTree(home),
      readBoard: () => invoke(managerScope, DRIVER.readTool, {}, DRIVER.managerId),
      search: (input, caller = DRIVER.managerId, signal) => invoke(managerScope, DRIVER.tool, input, caller, signal),
      resume: async () => {
        const resumed = await fixture.activate(DRIVER.managerId);
        return { tools: resumed.tools, search: (input) => invoke(resumed, DRIVER.tool, input, DRIVER.managerId) };
      },
      dispose: () => fixture.dispose(),
    };
    return await run(rig);
  } finally {
    await fixture?.dispose();
    // Only remove the exact canonical home created here, never an unchecked path.
    const target = await realpath(home);
    assert.equal(path.dirname(target), root);
    assert.equal(path.basename(target).startsWith(DRIVER.tempPrefix), true);
    await rm(target, { recursive: true, force: true });
  }
}

function createRegistrationFixture(home) {
  const effects = [];
  const setups = [];
  const globalScope = createScope();
  const provided = new Map();
  let disposed = false;
  const services = {
    profileContext: { home },
    tools: globalScope.registry,
    fishballInstance: {
      apiVersion: 1,
      manager: {
        sessionId: () => DRIVER.managerId,
        registerSetup(pluginId, apply) {
          const registration = { pluginId, apply, scopes: [] };
          setups.push(registration);
          return async () => {
            for (const scope of registration.scopes) await scope.dispose();
          };
        },
      },
    },
  };
  const own = (dispose) => { if (typeof dispose === 'function') effects.push(dispose); return dispose; };
  const ctx = {
    ...services,
    get: (name) => provided.has(name) ? provided.get(name) : services[name],
    provide: (name, value) => { provided.set(name, value); return () => provided.delete(name); },
    effect: (execute) => own(execute()),
    logger: () => ({ info() {}, debug() {}, warn() {}, error() {} }),
    on: () => () => {},
  };
  return {
    ctx, setups, globalScope, own,
    async activate(id) {
      const scope = createScope();
      const agent = { id, session: { id } };
      for (const registration of setups) {
        registration.scopes.push(scope);
        const returned = await registration.apply(scope.ctx, agent);
        if (typeof returned === 'function') scope.own(returned);
      }
      return scope;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const dispose of effects.toReversed()) await dispose();
      await globalScope.dispose();
    },
  };
}

function createScope() {
  const tools = new Map();
  const sections = new Map();
  const contexts = new Map();
  const effects = [];
  let disposed = false;
  const own = (dispose) => { if (typeof dispose === 'function') effects.push(dispose); return dispose; };
  const register = (map, name, entry) => {
    assert.equal(map.has(name), false, `duplicate registration: ${name}`);
    map.set(name, entry);
    return own(() => { if (map.get(name) === entry) map.delete(name); });
  };
  const registry = { register: (definition) => register(tools, definition.name, definition) };
  const ctx = {
    tools: registry,
    systemPrompt: {
      section: (entry) => register(sections, entry.name, entry),
      context: (entry) => register(contexts, entry.name, entry),
      getSectionOrder: (name) => name,
      suppressRuntimeContext() {},
    },
    effect: (execute) => own(execute()),
  };
  return {
    ctx, registry, tools, sections, contexts, own,
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const dispose of effects.toReversed()) await dispose();
    },
  };
}

async function invoke(scope, name, input, caller, signal) {
  const definition = scope.tools.get(name);
  assert.ok(definition, `public tool was not registered: ${name}`);
  try {
    return await definition.execute(input, { agent: { id: caller, session: { id: caller } }, signal });
  } catch (error) {
    // The requirement defines a refusal code, not thrown versus returned transport.
    // Preserve an untyped exception as an actual failing test, not a fabricated code.
    if (typeof error?.code !== 'string') throw error;
    return { ok: false, code: error.code };
  }
}

function assertSuccess(result, query, count, truncated) {
  assert.equal(result?.ok, true);
  assert.equal(result.query, query);
  assert.ok(Array.isArray(result.results));
  assert.equal(result.results.length, count);
  assert.equal(result.truncated, truncated);
  for (const hit of result.results) {
    assert.equal(Number.isInteger(hit.archiveLine) && hit.archiveLine >= 1, true);
    assert.equal(typeof hit.onBoard, 'boolean');
    assert.ok(hit.card && typeof hit.card === 'object');
    assert.ok(Array.isArray(hit.matchedFields));
    assert.equal(new Set(hit.matchedFields).size, hit.matchedFields.length);
    assert.ok(hit.matchedFields.length >= 1 && hit.matchedFields.length <= 2);
    for (const field of hit.matchedFields) assert.ok(['title', 'note'].includes(field));
  }
}

function assertRefusal(result, code) {
  assert.notEqual(result?.ok, true, 'a refusal cannot claim success/completeness');
  assert.equal(result?.code, code);
}

async function invalidInput(t, input) {
  await withRig(t, { archive: [snapshot(1)] }, async (rig) => {
    assertRefusal(await rig.search(input), 'invalid-input');
  });
}

async function queryBoundary(t, query, length) {
  // Notes, unlike titles, can hold 201 astral characters under either unresolved
  // card-field length unit. Do not accidentally test an invalid title fixture.
  const card = snapshot(1, { title: 'query boundary', note: query });
  await withRig(t, { archive: [card] }, async (rig) => {
    const result = await rig.search({ query: ` \t${query}\n ` });
    if (length < CASE.queryMin || length > CASE.queryMax) assertRefusal(result, 'invalid-input');
    else {
      assertSuccess(result, query, 1, false);
      assert.deepEqual(result.results[0].card, card);
    }
  });
}

function snapshot(number, overrides = {}) {
  const card = {
    id: `bd_000000001_${number.toString(16).padStart(6, '0')}`,
    title: `${CASE.marker} card ${number}`, status: 'done', note: '', links: [],
    createdAt: DRIVER.createdAt, updatedAt: 1000 + number,
    ...overrides,
  };
  if (card.status === 'waiting') card.waitingOn ??= 'user';
  if (['done', 'dropped'].includes(card.status)) card.closedAt ??= card.updatedAt;
  return card;
}

function matchingCards(count) {
  return Array.from({ length: count }, (_, i) => snapshot(i + 1));
}

async function captureTree(root) {
  const records = [];
  async function visit(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const file = path.join(dir, name);
      const stat = await lstat(file);
      const entry = { path: path.relative(root, file), mode: stat.mode, size: stat.size, mtimeMs: stat.mtimeMs };
      if (stat.isDirectory()) {
        records.push({ ...entry, kind: 'directory' });
        await visit(file);
      } else {
        assert.equal(stat.isFile(), true, 'fixture has only directories and regular files');
        records.push({ ...entry, kind: 'file', bytes: (await readFile(file)).toString('base64') });
      }
    }
  }
  await visit(root);
  return records;
}

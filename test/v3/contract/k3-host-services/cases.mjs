/**
 * K3 black-box cases: the freeze of the host-only service contracts and core's contracts (the
 * settings-section extension point's rows are withdrawn: requirements 1.34 item 4, R-HOST-11) (v3-tasks.md row K3, spec `test/v3-cases` at `b1295de`, "types only"). K3
 * "resolves the K flags in HAND, HOST, UIM, EVT-UC-03"; the cases are those K flags, EVT-UC-03, the
 * interception controller of R-INT-01 (S2-Q1 / Q-S3-2 decided B), the extension point of R-HOST-11
 * (HOST-EP-03 row 3, HOST-UC-08) and PLAT-UC-07's card fields (R-FB-11: "exact card fields: K3").
 *
 * Techniques (the cases' own): EP (HAND-EP-01/02, HOST-EP-03, UIM-EP-01/02: each test names its row
 * and partition), DT (HAND-DT-01/02: the refusal vocabulary each rule needs), ST (HOST-ST-01: the
 * locator vocabulary its transitions name), UC (EVT-UC-03, HOST-UC-05/08, PLAT-UC-07: each test
 * names its flow).
 *
 * Levels: unit (static reading of the frozen `.d.ts` files, declarations.mjs; no product module is
 * loaded). Its one integration row (a probe section in the slim panel) is withdrawn with the
 * extension point (requirements 1.34 item 4). Behaviour behind the types belongs to later tasks and
 * is `todo`, naming the owner.
 *
 * Expected values come from the requirements (R-CON-11, R-ROUTE-05, R-HOST-05/06/10/11, R-UI-01/02,
 * R-INT-01…05, R-FB-10/11) and, where a requirement defers to it, from design §3.6, §4.1, §5.4, §6.1,
 * §6.4 (D§n). Export and type names are K3's choice, so services are found by their Cordis names and
 * members by the names the requirement gives them.
 */
import assert from 'node:assert/strict'
import { withdrawnCase } from '../../fishball-core/settings/withdrawn.mjs'
import { caseTest } from '../package-boundaries/cases.mjs'
import { SET_SIDE, V3 } from '../package-boundaries/constants.mjs'
import {
  API_VERSION, ASK_CARD, CHILD, DATA_ONLY, DATA_ONLY_FORMATTER, DATA_ONLY_SAMPLES, FOLDER, HANDOVER, INTERCEPT,
  LATER, SERVICE, TOKENS,
} from './constants.mjs'
import {
  assertIncludes, assertParams, behaviourScripts, contracts, coreScriptFindings, elementType, member, needDeclarations,
  resultCodes, serviceByShape, serviceMembers, vocabulary,
} from './contracts.mjs'
import { dataOnlyViolations } from './data-only.mjs'
import { specifiers, syntaxErrors } from './declarations.mjs'

const host = () => contracts(FOLDER.hostServices)
const core = () => contracts(FOLDER.coreContracts)

/** A function type `(…) => R` as {params, returns}, through type aliases; null when it is none. */
function signatureOf(c, type) {
  const t = (type ?? '').trim()
  const direct = c.m.members(`{ h: ${t} }`).get('h')
  if (direct?.method) return direct
  for (const d of c.m.decls.get(t) ?? []) if (d.kind === 'alias') return signatureOf(c, d.raw)
  return null
}
const isFunctionType = (c, type) => signatureOf(c, type) !== null
const assertDisposer = (c, found) => assert.ok(isFunctionType(c, found.returns), `${found.name} returns ${JSON.stringify(found.returns)}, not a dispose function`)
const assertApiVersion = (members, service) => {
  const version = member(members, API_VERSION.member, { method: false })
  assert.equal(version.type.trim(), API_VERSION.value, `${service}.apiVersion is typed ${JSON.stringify(version.type)}, not the literal ${API_VERSION.value}`)
}
const assertMembers = (members, expected, service) => assert.deepEqual(expected.filter((n) => !members.has(n)), [], `${service} lacks members; it has ${[...members.keys()].join(', ')}`)
/** The members of a method's resolved result (`Promise` removed); the array element when it is an array. */
const resultMembers = (c, found) => c.m.members(elementType(found.returns) ?? found.returns)

/** The hand-over service's members (host-services). */
const handover = () => serviceMembers(host(), SERVICE.handover)
const tokens = () => serviceMembers(host(), SERVICE.tokens)
const child = () => serviceMembers(host(), SERVICE.child)

/** `fishballInstance.events.intercept` and the types around it (core contracts). */
function intercept() {
  const c = core()
  let members = serviceMembers(c, SERVICE.instance)
  for (const step of INTERCEPT.path.slice(0, -1)) members = c.m.members(member(members, step, { method: false }).type)
  const found = member(members, INTERCEPT.path.at(-1))
  const params = assertParams(found, { params: INTERCEPT.params })
  return { c, found, registration: c.m.members(params[0].type), handler: params[1] }
}
/** The controller type: the handler's second parameter. */
function controller() {
  const { c, handler } = intercept()
  const signature = signatureOf(c, handler.type)
  assert.ok(signature, 'onEvent is not a function type: ' + handler.type)
  assert.ok(signature.params.length >= INTERCEPT.handlerParams, `onEvent takes (e, ctl); declared ${handler.type}`)
  return { c, ctl: c.m.members(signature.params[1].type), signature }
}

export function registerK3Cases(sdk) {
  // ================================================================ the freeze itself: two folders, types only
  for (const [label, get] of [['host-services', host], ['core contracts', core]]) {
    caseTest(sdk, 'K3', 'types', `${label}: the folder holds .d.ts declarations that parse`, () => {
      const c = get()
      needDeclarations(c)
      assert.deepEqual(syntaxErrors(c.texts), [], 'declaration syntax')
    })
  }
  // Host-services stays strictly types only; the K3 amendment 2026-11-14 does not touch it.
  caseTest(sdk, 'K3', 'types', 'host-services: types only, no behaviour code', () => {
    needDeclarations(host())
    assert.deepEqual(behaviourScripts(host()), [], 'script files with code')
  })
  // K3 amendment 2026-11-14 (Fishball, the user's rule: each tunable value is defined once in its
  // contract's constants object): core contracts may also hold one data-only constants.js.
  caseTest(sdk, 'K3', 'types', `core contracts: types plus one data-only ${DATA_ONLY.file} (K3 amendment 2026-11-14)`, () => {
    needDeclarations(core())
    assert.deepEqual(coreScriptFindings(core()), { others: [], constants: [] }, `script files with code other than ${DATA_ONLY.file}, and ${DATA_ONLY.file} violations`)
  })
  for (const [title, text, dataOnly] of DATA_ONLY_SAMPLES) {
    caseTest(sdk, 'K3', 'types', `data-only detector self-check: ${title} → ${dataOnly ? 'passes' : 'fails'}`, () => {
      const found = dataOnlyViolations(text)
      if (dataOnly) assert.deepEqual(found, [], 'reported as not data only')
      else assert.ok(found.length > 0, 'not detected')
    })
  }
  caseTest(sdk, 'K3', 'types', 'data-only detector self-check: the template formatter fails with the formatter allowance off', () => {
    assert.ok(dataOnlyViolations(DATA_ONLY_FORMATTER, { templateFormatters: false }).length > 0, 'the allowance flag does not govern formatters')
  })
  // R-BND-01 / PLAT-EP-07: the connector reaches no module of the set; core reaches nothing of the instance.
  caseTest(sdk, 'K3', 'types', 'host-services declarations reference no package of the Fishball set or the instance', () => {
    needDeclarations(host())
    const banned = [...SET_SIDE, V3.instance.name]
    const hits = [...host().texts].flatMap(([f, t]) => specifiers(t).filter((s) => banned.some((n) => s === n || s.startsWith(n + '/'))).map((s) => f + ': ' + s))
    assert.deepEqual(hits, [])
  })
  caseTest(sdk, 'K3', 'types', 'core contracts reference nothing of dsh-instance', () => {
    needDeclarations(core())
    const hits = [...core().texts].flatMap(([f, t]) => specifiers(t).filter((s) => s === V3.instance.name || s.startsWith(V3.instance.name + '/')).map((s) => f + ': ' + s))
    assert.deepEqual(hits, [])
  })

  // ================================================================ HAND: dshConnectorHandover (D§3.6, K)
  caseTest(sdk, 'HAND-EP-01', 1, `the service ${SERVICE.handover} is declared with ${HANDOVER.members.join(', ')}`, () => {
    assertMembers(handover(), HANDOVER.members, SERVICE.handover)
  })
  caseTest(sdk, 'HAND-EP-01', 1, 'handOver(sessionId, principalKey, note?) and takeBack(sessionId, note?): the note is optional', () => {
    assertParams(member(handover(), 'handOver'), HANDOVER.handOver)
    assertParams(member(handover(), 'takeBack'), HANDOVER.takeBack)
  })
  caseTest(sdk, 'HAND-EP-01', 1, 'onChange(fn) takes one listener and returns a dispose function', () => {
    const found = member(handover(), 'onChange')
    assertParams(found, HANDOVER.onChange)
    assertDisposer(host(), found)
  })
  caseTest(sdk, 'HAND-EP-01', 5, 'the service has no session read, approval, question, prompt or answer member', () => {
    assert.deepEqual([...handover().keys()].filter((n) => HANDOVER.forbiddenMember.test(n) && !HANDOVER.members.includes(n)), [])
  })
  // Re-baselined by C-WIRE-2 (the user's q5, "Remove agentToken entirely"): no `designated` field.
  caseTest(sdk, 'HAND-EP-01', 5, 'principals() entries carry key, name, id, online, enabled, paired (no designated, C-WIRE-2 q5) and no token or entry label', () => {
    const entry = resultMembers(host(), member(handover(), 'principals'))
    assertMembers(entry, HANDOVER.principalFields, 'a principals() entry')
    assert.equal(entry.has(HANDOVER.withdrawnField), false, 'principals() still carries designated')
    assert.deepEqual([...entry.keys()].filter((n) => HANDOVER.secretField.test(n)), [], 'secret-looking fields')
  })
  caseTest(sdk, 'HAND-EP-01', 5, 'managed() entries carry sessionId and principal {key, name, id}, and no secret field', () => {
    const entry = resultMembers(host(), member(handover(), 'managed'))
    assertMembers(entry, HANDOVER.managedFields, 'a managed() entry')
    const principal = host().m.members(entry.get('principal').type)
    assertMembers(principal, ['key', 'name', 'id'], 'managed().principal')
    assert.deepEqual([...principal.keys()].filter((n) => HANDOVER.secretField.test(n)), [], 'secret-looking fields')
  })
  caseTest(sdk, 'HAND-EP-01', 5, 'a nameless principal is allowed: principal name may be null (requirements 1.20, R-NAME-08)', () => {
    const name = resultMembers(host(), member(handover(), 'principals')).get('name')
    assert.ok(/\bnull\b/.test(name.type) || name.optional, 'principals().name is typed ' + name.type)
  })
  for (const [row, title, owner] of [
    [1, 'a plugin in the same DSH injecting the service can call handOver / takeBack / managed / principals', LATER.route],
    [2, 'no MCP tool or route exposes hand-over; a `handover` tool name is an unknown tool', LATER.route],
    [3, 'no browser-reachable hand-over route', LATER.route],
    [4, 'a plugin in another DSH cannot reach it', LATER.route],
  ]) caseTest(sdk, 'HAND-EP-01', row, title, null, owner)

  caseTest(sdk, 'HAND-EP-02', 5, 'the freeze states the stable order of principals() (R-UI-10, K)', () => {
    const found = member(handover(), 'principals')
    const docs = [found.doc, ...(host().m.decls.get(elementType(found.returns) ?? '') ?? []).map((d) => d.doc)].join(' ')
    assert.match(docs, HANDOVER.orderWords, 'principals() documents no order')
  })
  for (const [row, title] of [
    [1, 'none enabled and paired → no Hand over control'], [2, 'one named online → "Hand over to Navigator", green'],
    ['2a', 'one named offline → the same button, red'], [3, 'one nameless → "Hand over to **ID:** agent-x"'],
    ['3a', 'named "ID: agent-x" by hand → plain text'], [4, 'two → "Handover to…" dropdown with lights'],
    ['4a', 'paired but disabled → not listed'], ['4b', 'enabled but unpaired → not listed'],
    [5, 'three named → dropdown in the frozen stable order'], [6, 'no "Hand over to Fishball" unless so named'],
    [7, 'labels from embed-UI locale files'], [8, 'markup in a name shown as text'], [9, 'every light has a text alternative'],
  ]) caseTest(sdk, 'HAND-EP-02', row, title, null, LATER.marks)

  caseTest(sdk, 'HAND-DT-01', '1, 2, 6, 7, 7a', 'handOver refusal codes are a frozen vocabulary holding no-agent, conflict, unknown-session', () => {
    assertIncludes(resultCodes(host(), member(handover(), 'handOver')), HANDOVER.handOverCodes, 'handOver codes')
  })
  caseTest(sdk, 'HAND-DT-01', '3–5', 'handOver success returns {ok: true, principal}', () => {
    const result = host().m.members(member(handover(), 'handOver').returns)
    assertMembers(result, ['ok', 'principal'], 'handOver result')
  })
  caseTest(sdk, 'HAND-DT-02', '3, 4', 'takeBack refusals: unknown-session, and a separate code for an unmanaged session (K)', () => {
    const codes = resultCodes(host(), member(handover(), 'takeBack'))
    assertIncludes(codes, HANDOVER.takeBackCodes, 'takeBack codes')
    assert.ok([...codes].some((code) => !HANDOVER.takeBackCodes.includes(code)), 'no code for "session not managed": ' + JSON.stringify([...codes]))
  })
  for (const [rule, title] of [
    [1, 'session unknown → unknown-session, no event'], [2, 'no enabled, paired principal → no-agent'],
    [3, 'enabled, paired, online → ok; one handover'], [4, 'the designated Fishball → ok, no special case'],
    [5, 'offline → ok; handover waits in its mailbox'], [6, 'disabled or deleted at call time → no-agent; onChange'],
    [7, 'already managed → conflict; manager unchanged'], ['7a', 'enabled but unpaired → no-agent'],
    [8, 'unknown principal key → refused with the frozen code'],
  ]) caseTest(sdk, 'HAND-DT-01', rule, title, null, LATER.route)
  for (const [rule, title] of [
    [1, 'managed by P after a Hand over → ok; takeback to P'], [2, 'managed by P2 that started it → ok; takeback to P2'],
    [3, 'unmanaged → refused with the frozen code; no event'], [4, 'unknown session → unknown-session'],
  ]) caseTest(sdk, 'HAND-DT-02', rule, title, null, LATER.route)
  caseTest(sdk, 'HAND-ST-01', 5, 'P calls session_release → Unmanaged; whether it emits an event (K)', null, LATER.tools)
  caseTest(sdk, 'HAND-ST-01', 9, 'Q calls session_release on P\'s session → refused forbidden (K)', null, LATER.tools)

  // ================================================================ HOST: dshConnectorTokens (D§5.4, K)
  caseTest(sdk, 'HOST-UC-03', 'K', `the service ${SERVICE.tokens} is declared with ${TOKENS.members.join(', ')}`, () => {
    assertMembers(tokens(), TOKENS.members, SERVICE.tokens)
  })
  caseTest(sdk, 'HOST-UC-01', 'main 2', 'createHosted(instanceId) resolves to {entryKey, label, value}: the value once, to the instance, and no ref (R-HOST-05, R1; K1d)', () => {
    const found = member(tokens(), 'createHosted')
    assertParams(found, TOKENS.createHosted)
    assert.match(found.returns, INTERCEPT.promise, 'createHosted is asynchronous')
    const result = host().m.members(found.returns)
    assertMembers(result, TOKENS.createdFields, 'createHosted result')
    assert.deepEqual([...result.keys()].filter((n) => TOKENS.withdrawnField.test(n)), [], 'a credential-reference field (withdrawn by K1d)')
  })
  caseTest(sdk, 'HOST-UC-03', 'E2, E3', 'retire(oldEntryKey, successorEntryKey) is asynchronous and refuses with a machine-readable code', () => {
    const found = member(tokens(), 'retire')
    assertParams(found, TOKENS.retire)
    assert.match(found.returns, INTERCEPT.promise, 'retire is asynchronous')
    assert.ok(resultCodes(host(), found).size > 0, 'retire has no refusal code')
  })
  // K3 amendment I-SUCCEED, the user's Q1 = C, 2026-11-17: the instance retries a successor-unpaired retire on this signal.
  caseTest(sdk, 'HOST-DT-02', 2, 'onChange(fn) takes one listener and returns a dispose function (K3 amendment I-SUCCEED)', () => {
    const found = member(tokens(), 'onChange')
    assertParams(found, TOKENS.onChange)
    assertDisposer(host(), found)
  })
  // HOST-UC-03 main 3, E2 and E3 (the retire behaviour) run in test/v3/dsh-connector/hosted (C-SUCCEED).

  // ================================================================ HOST / UIM: dshInstanceChild (D§4.1, §6.1, K)
  caseTest(sdk, 'HOST-ST-01', 'K', `the service ${SERVICE.child} is declared with ${CHILD.members.join(', ')}`, () => {
    assertMembers(child(), CHILD.members, SERVICE.child)
  })
  caseTest(sdk, 'UIM-EP-01', 5, 'every host-only service carries apiVersion: 1, so an older locator is told apart (K)', () => {
    for (const [service, members] of [[SERVICE.child, child()], [SERVICE.handover, handover()], [SERVICE.tokens, tokens()]]) assertApiVersion(members, service)
  })
  caseTest(sdk, 'HOST-ST-01', 'K', 'status() state names starting and ready (rows 1, 2)', () => {
    const state = host().m.members(member(child(), 'status').returns).get('state')
    assert.ok(state, 'status() has no state')
    assertIncludes(vocabulary(host(), state.type).literals, CHILD.states, 'status().state')
  })
  caseTest(sdk, 'HOST-ST-01', 'K', 'status() code vocabulary holds the lifecycle codes the requirements name (rows 3, 8; R-HOST-10; §6.1)', () => {
    const code = host().m.members(member(child(), 'status').returns).get('code')
    assert.ok(code, 'status() has no code')
    assertIncludes(vocabulary(host(), code.type).literals, CHILD.statusCodes, 'status().code')
    assert.match(code.type + ' ' + host().m.leaves(code.type).map((l) => l.literal ?? l.other).join(' '), /\bnull\b/, 'status().code may be null (no code while ready)')
  })
  caseTest(sdk, 'HOST-UC-05', 'A1', 'targetStatus() states are connected, target-unreachable, token-refused, target-unset (K)', () => {
    const state = host().m.members(member(child(), 'targetStatus').returns).get('state')
    assert.ok(state, 'targetStatus() has no state')
    assertIncludes(vocabulary(host(), state.type).literals, CHILD.targetStates, 'targetStatus().state')
  })
  caseTest(sdk, 'HOST-UC-05', 'A1', 'a reference with no value reports the frozen state (token-refused or target-unset)', null, LATER.host)
  caseTest(sdk, 'UIM-EP-02', '1–3', 'origin(hostname) and admit({view, lang, hostname}) take the loopback hostname', () => {
    assertParams(member(child(), 'origin'), CHILD.origin)
    const [request] = assertParams(member(child(), 'admit'), CHILD.admit)
    assertMembers(host().m.members(request.type), CHILD.admit.fields, 'admit request')
  })
  caseTest(sdk, 'UIM-EP-02', '1–3, 5', 'the hostname is typed as exactly 127.0.0.1, localhost, [::1] (R-UI-02; case variants are not values)', () => {
    const hostname = host().m.members(assertParams(member(child(), 'admit'), CHILD.admit)[0].type).get('hostname')
    const vocab = vocabulary(host(), hostname.type)
    assert.equal(vocab.open, false, 'hostname is an open ' + hostname.type)
    assertIncludes(vocab.literals, CHILD.hostnames, 'admit hostname')
  })
  caseTest(sdk, 'UIM-UC-01', 'post', 'admit resolves to {url} only: no ticket, token or cookie beside it', () => {
    const found = member(child(), 'admit')
    assert.match(found.returns, INTERCEPT.promise, 'admit is asynchronous')
    const result = host().m.members(found.returns)
    assertMembers(result, [CHILD.admissionField], 'admit result')
    assert.deepEqual([...result.keys()].filter((n) => CHILD.admissionSecret.test(n)), [], 'secret-looking fields')
  })
  caseTest(sdk, 'HOST-ST-01', 5, 'retry() takes nothing and is asynchronous; onChange returns a dispose function', () => {
    const retry = member(child(), 'retry')
    assertParams(retry, CHILD.retry)
    assert.match(retry.returns, INTERCEPT.promise, 'retry is asynchronous')
    assertDisposer(host(), member(child(), 'onChange'))
  })
  for (const [row, title] of [
    [1, 'Stopped → host app ready → Starting'], [2, 'Starting → ready → Running, origin set'],
    [3, 'incompatible member → Failed, PROFILE_INCOMPATIBLE naming it'], [4, 'Running → crash → Failed, crash code'],
    [5, 'Failed → Retry → Starting'], [6, 'Running → restart → Starting, origin null until ready'],
    [7, 'Running → host exits → Stopped'], [8, 'core disabled → Running (no fishball-off, R-FB-10 amended by 1.39)'],
    [9, 'Stopped → Retry before host ready → Stopped (K)'], [10, 'Running → uninstall → Removed, export offered first'],
  ]) caseTest(sdk, 'HOST-ST-01', row, title, null, LATER.host)
  caseTest(sdk, 'UIM-EP-02', 5, 'LOCALHOST (case variant) → localhost:<child>, page loads (K: case-normalised)', null, LATER.host)
  caseTest(sdk, 'UIM-EP-02', 6, 'a ticket replayed under another loopback hostname → refused', null, LATER.host)
  caseTest(sdk, 'UIM-UC-02', 'A1', 'the fish with no page to open: click opens nothing (K: no-op or a hint)', null, LATER.shell)
  caseTest(sdk, 'UIM-DT-02', 9, 'a principal renamed later: new records use the new name, earlier ones keep theirs (K)', null, LATER.records)

  // ================================================================ EVT-UC-03: fishballInstance.events.intercept (R-INT-01, D§6.4)
  caseTest(sdk, 'EVT-UC-03', 'main', 'intercept(registration, onEvent) is declared on fishballInstance.events and returns dispose', () => {
    const { c, found } = intercept()
    assertDisposer(c, found)
  })
  caseTest(sdk, 'EVT-UC-03', 'main', 'the registration has pluginId and types (required), filter and priority (optional)', () => {
    const { registration } = intercept()
    assertMembers(registration, INTERCEPT.registrationFields, 'the registration')
    for (const f of INTERCEPT.requiredFields) assert.equal(registration.get(f).optional, false, f + ' is optional')
    for (const f of INTERCEPT.optionalFields) assert.equal(registration.get(f).optional, true, f + ' is required')
  })
  caseTest(sdk, 'EVT-UC-03', 'main', 'filter is a synchronous predicate over the event (returns boolean, not a Promise)', () => {
    const { registration } = intercept()
    const filter = registration.get('filter')
    assert.ok(filter.method, 'filter is not a function: ' + filter.type)
    assert.equal(filter.returns.trim(), 'boolean', 'filter returns ' + filter.returns)
  })
  caseTest(sdk, 'EVT-UC-03', 'post', 'priority is a number whose default 0 is stated in the freeze', () => {
    const { c, registration, found } = intercept()
    const priority = registration.get('priority')
    assert.equal(priority.type.trim(), 'number', 'priority is typed ' + priority.type)
    const docs = [priority.doc, found.doc, ...[...c.m.decls.values()].flat().filter((d) => d.kind === 'interface' && d.members.includes(priority)).map((d) => d.doc)].join(' ')
    assert.ok(INTERCEPT.priorityDefault.word.test(docs) && INTERCEPT.priorityDefault.value.test(docs), 'no "default 0" for priority in: ' + JSON.stringify(docs.trim()))
  })
  caseTest(sdk, 'EVT-UC-03', 'main', 'the handler gets (e, ctl) and returns a Promise', () => {
    const { signature } = controller()
    assert.equal(signature.params.length, INTERCEPT.handlerParams, 'onEvent parameters')
    assert.match(signature.returns, INTERCEPT.promise, 'onEvent returns ' + signature.returns)
  })
  caseTest(sdk, 'EVT-UC-03', 'main', 'ctl has exactly accept, commit and release (R-INT-01, S2-Q1 / Q-S3-2 decided B)', () => {
    assert.deepEqual([...controller().ctl.keys()].sort(), [...INTERCEPT.controller].sort())
  })
  caseTest(sdk, 'EVT-UC-03', 'main', 'ctl.accept() takes nothing and returns a Promise (awaited before any effect)', () => {
    const accept = member(controller().ctl, 'accept')
    assertParams(accept, INTERCEPT.accept)
    assert.match(accept.returns, INTERCEPT.promise, 'accept returns ' + accept.returns)
  })
  caseTest(sdk, 'EVT-UC-03', 'main', 'ctl.commit(send) takes one send function and returns a Promise (the commit fence)', () => {
    const { c, ctl } = controller()
    const commit = member(ctl, 'commit')
    const [send] = assertParams(commit, INTERCEPT.commit)
    assert.ok(isFunctionType(c, send.type), 'send is not a function: ' + send.type)
    assert.match(commit.returns, INTERCEPT.promise, 'commit returns ' + commit.returns)
  })
  caseTest(sdk, 'EVT-UC-03', 'main', 'ctl.release(e, {toFishball: true}) (R-INT-05)', () => {
    const { c, ctl } = controller()
    const [, options] = assertParams(member(ctl, 'release'), { params: INTERCEPT.release.params })
    const toFishball = c.m.members(options.type).get(INTERCEPT.release.option)
    assert.ok(toFishball, 'release options lack ' + INTERCEPT.release.option + ': ' + options.type)
    assert.ok(vocabulary(c, toFishball.type).literals.has('true') || toFishball.type.trim() === 'boolean', 'toFishball is typed ' + toFishball.type)
  })
  caseTest(sdk, 'EVT-DT-02', 7, 'a negative priority is a valid number (K: allowed; R1 receives the event)', () => {
    assert.equal(intercept().registration.get('priority').type.trim(), 'number')
  })
  for (const [row, title] of [
    ['main', 'dispose() → notice events go to Fishball again'],
    ['A1', 'a second plugin with the same types and priority 0 → accepted; one warning naming both; the first still wins'],
    ['E1', 'disposed while an event is in flight to it → the event goes to Fishball'],
    ['post', 'priority defaults to 0 in dispatch'],
  ]) caseTest(sdk, 'EVT-UC-03', row, title, null, LATER.intercept)
  caseTest(sdk, 'EVT-DT-02', 7, 'R1 with priority −1 and no other match receives the event', null, LATER.intercept)

  // ================================================================ HOST-UC-08 / HOST-EP-03 row 3: the settings-section extension point (R-HOST-11)
  // Withdrawn with the point itself (requirements 1.34 item 4, R-HOST-11 withdrawn; F-SETTINGS
  // deleted contracts/settings-sections.d.ts): core's settings are its own Plugins-page settings.
  withdrawnCase(sdk, 'HOST-EP-03', 3, 'core contracts declare the extension point: register(section) with id, title, order, mount, unmount')
  withdrawnCase(sdk, 'HOST-EP-03', 3, 'the extension point names nothing hosting-specific (member names and types)')
  withdrawnCase(sdk, 'HOST-UC-08', 'main 2', 'hosted child: a section registered through the frozen point is mounted in the settings panel, beside the hosted sections [integration]')

  // ================================================================ PLAT-UC-07: the ask card's fields (R-FB-11, "exact card fields: K3")
  caseTest(sdk, 'PLAT-UC-07', 'main 2', 'core contracts declare the ask card: the asking session, the question, choices or a free answer', () => {
    needDeclarations(core())
    const cards = [...core().m.decls].filter(([name]) => {
      const names = [...core().m.members(name).keys()]
      return names.some((n) => ASK_CARD.session.test(n)) && names.some((n) => ASK_CARD.question.test(n)) && names.some((n) => ASK_CARD.choices.test(n) || ASK_CARD.free.test(n))
    })
    assert.ok(cards.length > 0, 'no declaration with session, question and choices / free-answer fields')
  })
  // PLAT-UC-07 main 2–3, A1, E1, E2 (the card's behaviour) are F-ASKCARD's: test/v3/fishball-core/asks/cases.mjs.
}

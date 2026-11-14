/**
 * K3 black-box cases: the freeze of the host-only service contracts and core's settings-section
 * extension point (v3-tasks.md row K3, spec `test/v3-cases` at `b1295de`, "types only"). K3
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
 * loaded) and integration (a real hosted child whose settings page registers a probe section through
 * the frozen extension point; core/page.mjs). Integration rows are written here and run only with
 * FBTEST_V3_INTEGRATION=1 (the K3 brief: "marked to run at integration"). Behaviour behind the types
 * belongs to later tasks and is `todo`, naming the owner.
 *
 * Expected values come from the requirements (R-CON-11, R-ROUTE-05, R-HOST-05/06/10/11, R-UI-01/02,
 * R-INT-01…05, R-FB-10/11) and, where a requirement defers to it, from design §3.6, §4.1, §5.4, §6.1,
 * §6.4 (D§n). Export and type names are K3's choice, so services are found by their Cordis names and
 * members by the names the requirement gives them.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { HOSTING_WORDS, MARK } from '../core/constants.mjs'
import { hostedChildFor } from '../core/hosted.mjs'
import { openSettingsPage } from '../core/page.mjs'
import { caseName, caseTest } from '../shared/cases.mjs'
import { SET_SIDE, V3 } from '../shared/constants.mjs'
import {
  API_VERSION, ASK_CARD, CHILD, DATA_ONLY, DATA_ONLY_FORMATTER, DATA_ONLY_SAMPLES, FOLDER, HANDOVER, INTEGRATION, INTERCEPT,
  LATER, SECTION, SERVICE, TOKENS,
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

/** The settings-section extension point: a service with `register(section)`, the section having the R-CORE fields. */
function extensionPoint() {
  const c = core()
  needDeclarations(c)
  const found = serviceByShape(c, (members) => {
    const register = members.get(SECTION.register)
    return !!register?.method && register.params.length > 0 && SECTION.fields.every((f) => c.m.members(register.params[0].type).has(f))
  })
  assert.ok(found, `no service in ${FOLDER.coreContracts} with ${SECTION.register}(section) taking {${SECTION.fields.join(', ')}}`)
  const register = found.members.get(SECTION.register)
  return { c, ...found, register, section: c.m.members(register.params[0].type) }
}

/** Integration rows: written now, run only at integration (a real hosted child). */
function integrationTest(sdk, id, row, title, fn) {
  const name = caseName(sdk, id, row, title) + ' [integration]'
  if (process.env[INTEGRATION.env] === INTEGRATION.on) test(name, fn)
  else test(name, { skip: INTEGRATION.note }, fn)
}

/**
 * A probe section (test fixture). Assumed contract (a K3 case question): `mount` receives the host
 * element the panel gives the section, as the R-CORE page harness observes it; `unmount` empties it.
 * `title` is a function: the frozen K3 contract (`SectionTitle = () => string`, read at each render
 * so it follows the locale) as R-CORE (3) created it; a string title is a malformed section.
 */
function probeSection(mounted) {
  return {
    id: SECTION.probe.id,
    title: () => SECTION.probe.title,
    order: SECTION.probe.order,
    mount(hostElement) {
      mounted.push(hostElement)
      const element = hostElement.ownerDocument.createElement('div')
      element.setAttribute(SECTION.probe.marker, SECTION.probe.id)
      element.textContent = SECTION.probe.text
      hostElement.appendChild(element)
    },
    unmount(hostElement) { hostElement.replaceChildren() },
  }
}

export function registerK3Cases(sdk) {
  const readyChild = hostedChildFor(INTEGRATION.homeLabel)

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
  caseTest(sdk, 'K3', 'types', 'core contracts reference nothing of fishball-instance', () => {
    needDeclarations(core())
    const hits = [...core().texts].flatMap(([f, t]) => specifiers(t).filter((s) => s === V3.instance.name || s.startsWith(V3.instance.name + '/')).map((s) => f + ': ' + s))
    assert.deepEqual(hits, [])
  })

  // ================================================================ HAND: fishballConnectorHandover (D§3.6, K)
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
  caseTest(sdk, 'HAND-EP-01', 5, 'principals() entries carry key, name, id, online, enabled, paired, designated and no token or entry label', () => {
    const entry = resultMembers(host(), member(handover(), 'principals'))
    assertMembers(entry, HANDOVER.principalFields, 'a principals() entry')
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

  caseTest(sdk, 'HAND-DT-01', '1, 2, 6, 7, 7a', 'handOver refusal codes are a frozen vocabulary holding no-fishball, conflict, unknown-session', () => {
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
    [1, 'session unknown → unknown-session, no event'], [2, 'no enabled, paired principal → no-fishball'],
    [3, 'enabled, paired, online → ok; one handover'], [4, 'the designated Fishball → ok, no special case'],
    [5, 'offline → ok; handover waits in its mailbox'], [6, 'disabled or deleted at call time → no-fishball; onChange'],
    [7, 'already managed → conflict; manager unchanged'], ['7a', 'enabled but unpaired → no-fishball'],
    [8, 'unknown principal key → refused with the frozen code'],
  ]) caseTest(sdk, 'HAND-DT-01', rule, title, null, LATER.route)
  for (const [rule, title] of [
    [1, 'managed by P after a Hand over → ok; takeback to P'], [2, 'managed by P2 that started it → ok; takeback to P2'],
    [3, 'unmanaged → refused with the frozen code; no event'], [4, 'unknown session → unknown-session'],
  ]) caseTest(sdk, 'HAND-DT-02', rule, title, null, LATER.route)
  caseTest(sdk, 'HAND-ST-01', 5, 'P calls session_release → Unmanaged; whether it emits an event (K)', null, LATER.tools)
  caseTest(sdk, 'HAND-ST-01', 9, 'Q calls session_release on P\'s session → refused forbidden (K)', null, LATER.tools)

  // ================================================================ HOST: fishballConnectorTokens (D§5.4, K)
  caseTest(sdk, 'HOST-UC-03', 'K', `the service ${SERVICE.tokens} is declared with ${TOKENS.members.join(', ')}`, () => {
    assertMembers(tokens(), TOKENS.members, SERVICE.tokens)
  })
  caseTest(sdk, 'HOST-UC-01', 'main 2', 'createHosted(instanceId) resolves to {ref, entryKey, label} and never the value (R-HOST-05)', () => {
    const found = member(tokens(), 'createHosted')
    assertParams(found, TOKENS.createHosted)
    assert.match(found.returns, INTERCEPT.promise, 'createHosted is asynchronous')
    const result = host().m.members(found.returns)
    assertMembers(result, TOKENS.createdFields, 'createHosted result')
    assert.deepEqual([...result.keys()].filter((n) => TOKENS.valueField.test(n)), [], 'a value field')
  })
  caseTest(sdk, 'HOST-UC-03', 'E2, E3', 'retire(oldEntryKey, successorEntryKey) is asynchronous and refuses with a machine-readable code', () => {
    const found = member(tokens(), 'retire')
    assertParams(found, TOKENS.retire)
    assert.match(found.returns, INTERCEPT.promise, 'retire is asynchronous')
    assert.ok(resultCodes(host(), found).size > 0, 'retire has no refusal code')
  })
  for (const [row, title] of [
    ['main 3', 'one atomic step moves sessions, role, name, offers (new ids), events; deletes Eo'],
    ['E2', 'a failure midway moves nothing'], ['E3', 'a user-made old entry is refused; nothing moves'],
  ]) caseTest(sdk, 'HOST-UC-03', row, title, null, LATER.succeed)

  // ================================================================ HOST / UIM: fishballChild (D§4.1, §6.1, K)
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
    [7, 'Running → host exits → Stopped'], [8, 'core disabled → Running, fishball-off'],
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
  caseTest(sdk, 'HOST-EP-03', 3, 'core contracts declare the extension point: register(section) with id, title, order, mount, unmount', () => {
    const { section } = extensionPoint()
    for (const f of ['mount', 'unmount']) assert.ok(section.get(f).method, f + ' is not a function')
    for (const f of ['id', 'title', 'order']) assert.equal(section.get(f).method, false, f + ' is a function')
    assert.equal(section.get('order').type.trim(), 'number', 'order is typed ' + section.get('order').type)
  })
  caseTest(sdk, 'HOST-EP-03', 3, 'the extension point names nothing hosting-specific (member names and types)', () => {
    const { service, members, section } = extensionPoint()
    const words = [service, ...[...members.values(), ...section.values()].flatMap((m) => [m.name, m.type, m.returns, ...m.params.map((p) => p.name + ' ' + p.type)])]
    assert.deepEqual(words.filter((w) => HOSTING_WORDS.some((re) => re.test(w))), [])
  })
  integrationTest(sdk, 'HOST-UC-08', 'main 2', 'hosted child: a section registered through the frozen point is mounted in the settings panel, beside the hosted sections', async (t) => {
    const { service } = extensionPoint()
    const { child: admitted } = await readyChild(sdk)
    const mounted = []
    const probe = { name: SECTION.probe.id, inject: [service], apply(ctx) { ctx[service][SECTION.register](probeSection(mounted)) } }
    const page = await openSettingsPage(t, { sdk, child: admitted, plugins: [probe] })
    assert.ok(page.panel, 'no settings panel; plugins ' + JSON.stringify(page.plugins))
    assert.equal((await page.waitFor(SECTION.probe.marker)).length, 1, 'the probe section is not in the panel; mount calls ' + mounted.length)
    assert.ok((await page.waitFor(MARK.status)).length > 0, 'the hosted sections are gone')
    assert.deepEqual(page.failed(), [], 'failed plugins')
    assert.deepEqual(page.errors, [], 'page console errors')
  })
  // When unmount runs (plugin disposal, panel close) is not stated by R-HOST-11 or R-CORE (3): see the K3 case questions.
  caseTest(sdk, 'HOST-UC-08', 'A1', 'a section whose bundle is off is absent: no error, no notice, no placeholder', null, 'I-PLACE (fishball-hosted-settings switched off)')

  // ================================================================ PLAT-UC-07: the ask card's fields (R-FB-11, "exact card fields: K3")
  caseTest(sdk, 'PLAT-UC-07', 'main 2', 'core contracts declare the ask card: the asking session, the question, choices or a free answer', () => {
    needDeclarations(core())
    const cards = [...core().m.decls].filter(([name]) => {
      const names = [...core().m.members(name).keys()]
      return names.some((n) => ASK_CARD.session.test(n)) && names.some((n) => ASK_CARD.question.test(n)) && names.some((n) => ASK_CARD.choices.test(n) || ASK_CARD.free.test(n))
    })
    assert.ok(cards.length > 0, 'no declaration with session, question and choices / free-answer fields')
  })
  for (const [row, title] of [
    ['main 2–3', 'the card shows in Fishball\'s conversation; the user\'s answer is committed once through core\'s link'],
    ['A1', 'Fishball decides itself → no card'], ['E1', '48 h with no answer → still waiting; no timer answers'],
    ['E2', 'settled elsewhere first → closed; a late answer gets already-settled / expired'],
  ]) caseTest(sdk, 'PLAT-UC-07', row, title, null, LATER.askCard)
}

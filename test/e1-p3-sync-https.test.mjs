/**
 * E1 re-test (P3) — a plain-http provider gets the https reason, not the custom-headers one.
 *
 * Requirement (the user's E1 report and its fix): provider sync offers API-key providers whose
 * endpoint is https. A non-https endpoint is refused with its own reason code and en/zh words
 * ("Its endpoint must use https; only https endpoints can be synced"), because the user can fix
 * it in the URL. Custom headers and every other unsafe profile keep `unsupported-provider` and
 * its "for example custom headers" words.
 *
 * The fix makes `unsafeProfileReason()` the one profile-safety rule: the host refuses with that
 * verdict and carries it into the inventory as `profileReason`. The real host seam therefore
 * reports the http reason from the host, not from a guessed null profile.
 *
 * Observation points: the public sync engine's preview (the card's not-offered list), the real
 * host's inventory and addProvider refusals, and the instance card's own en/zh dictionaries (the
 * words the user sees for a reason code).
 *
 * Techniques: DT (endpoint scheme × other unsafe profile; the real host seam), EP (http, https,
 * custom header, %7b template, duplicate model ids, empty input array; en/zh and the reason-code
 * list), BVA (https vs the non-https schemes; a malformed URL is not a protocol rejection).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | P3-DT-01 | DT (http, plain) | unsupported with reason `non-https-endpoint`, never offered |
 * | P3-DT-02 | DT (https, plain) | offered as an addition; no refusal |
 * | P3-DT-03 | DT (https, custom headers) | still `unsupported-provider`, not the https reason |
 * | P3-DT-04 | DT (the real host's addProvider) | http, custom headers, %7b and duplicate ids are refused before a settings write; https is still added |
 * | P3-DT-05 | DT (the absorbed host checks) | `%7b` templates and duplicate model ids reach the card as `unsupported-provider` from the host's `profileReason` |
 * | P3-EP-01 | EP (other non-https scheme) | `ftp:` is the same https reason |
 * | P3-EP-02 | EP (malformed URL) | a string that is not a URL stays `unsupported-provider` |
 * | P3-EP-03 | EP (en words) | the reason says https; the custom-headers reason still says headers |
 * | P3-EP-04 | EP (zh words) | Chinese words that say https, not the English string |
 * | P3-EP-05 | EP (http) | not offered, reason `non-https-endpoint`, and no write |
 * | P3-EP-06 | EP (https, the real host) | offered as an addition, no refusal |
 * | P3-EP-07 | EP (custom header) | `unsupported-provider`, never offered, no write |
 * | P3-EP-08 | EP (%7b template) | `unsupported-provider`, never offered, no write |
 * | P3-EP-09 | EP (duplicate model ids) | `unsupported-provider`, never offered, no write |
 * | P3-EP-10 | EP (empty input array) | `unsupported-provider`, never offered, no write |
 * | P3-H-DT-01 | DT (the real host seam) | a configured http provider reaches the engine with `profileReason: non-https-endpoint`, and the preview reports it |
 * | P3-P-01 | P (page renders it) | the code is in the card's `reasons` list, so no raw code is shown |
 *
 * "Never synced" is observed at both ends: the preview has no add operation, confirming the
 * refused id is rejected, and the real host's addProvider refuses the same profile before it
 * writes settings.
 *
 * The empty-input partition is observed at the engine seam: the installed host resolves
 * `input: []` to DSH's canonical default before safeProfile sees it, so a provider configured
 * that way is indistinguishable from one that omits the field. The shared rule still refuses an
 * empty array in an inventory, which is what this case pins.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { BODY_SOUL, CJK, instanceClientWords } from './support/body-soul-env.mjs'
import { CASE as C, assertNoWrites, assertRejected, clone, engineFixture, inventory, outcome, provider } from './support/provider-sync-engine.mjs'
import { hostFixture } from './support/provider-sync-host.mjs'

const NON_HTTPS = 'non-https-endpoint'
const UNSUPPORTED = 'unsupported-provider'
const HOST_PROFILE_REFUSAL = 'provider-sync-unsupported-profile'
const HTTP_ENDPOINT = 'http://127.0.0.1:7901/v1'
const TEMPLATE_ENDPOINT = 'https://models.example.invalid/%7btenant%7d/v1'

const ID = Object.freeze({
  https: C.ids.add,
  http: 'http-provider',
  header: 'header-provider',
  template: 'template-provider',
  duplicate: 'duplicate-provider',
  empty: 'empty-input-provider',
})
const model = () => clone(C.profile.models[0])
const profile = (changes = {}) => ({ ...clone(C.profile), ...changes })
/** One profile per EP partition; every one keeps a valid key/route so only the named rule differs. */
const PROFILES = Object.freeze({
  [ID.https]: profile(),
  [ID.http]: profile({ baseURL: HTTP_ENDPOINT }),
  [ID.header]: profile({ headers: { 'x-test': '1' } }),
  [ID.template]: profile({ baseURL: TEMPLATE_ENDPOINT }),
  [ID.duplicate]: profile({ models: [model(), model()] }),
  [ID.empty]: profile({ models: [{ ...model(), input: [] }] }),
})
/** The unsafe partitions, the reason the card must show, and the host verdict when it is carried. */
const UNSAFE = Object.freeze([
  { id: ID.http, caseId: 'P3-EP-05', label: 'a plain http endpoint', reason: NON_HTTPS, hostReason: NON_HTTPS },
  { id: ID.header, caseId: 'P3-EP-07', label: 'custom headers', reason: UNSUPPORTED },
  { id: ID.template, caseId: 'P3-EP-08', label: 'a %7b template', reason: UNSUPPORTED, hostReason: UNSUPPORTED },
  { id: ID.duplicate, caseId: 'P3-EP-09', label: 'duplicate model ids', reason: UNSUPPORTED, hostReason: UNSUPPORTED },
  { id: ID.empty, caseId: 'P3-EP-10', label: 'an empty input array', reason: UNSUPPORTED },
])

const profileWith = (changes) => profile(changes)
const sourceWith = (entry) => inventory(C.source, [entry])

/** One preview's not-offered entries as [id, reason]. */
const refusalsOf = (plan) => plan.groups.unsupported.map((entry) => [entry.id, entry.reason]).sort()

/**
 * A target inventory whose namespace fingerprint matches the source host's. A real host hashes
 * DSH's schema structurally; the engine fixture's default target uses the fixture's literal
 * schema, which would otherwise read as an incompatible owner and hide the add.
 */
const targetFor = (source) => {
  const target = inventory(C.target, [])
  target.schemas = clone(source.schemas)
  target.owners = clone(source.owners)
  target.namespaces = clone(source.namespaces)
  return target
}

/** A real host holding one configured profile, with its source credential seeded. */
async function hostSource(t, id) {
  const fixture = await hostFixture(t, { [id]: clone(PROFILES[id]) })
  await fixture.credentials.seed(id, fixture.credentials.record())
  return { fixture, source: await fixture.inventory() }
}

const words = instanceClientWords()
const reasonsList = (() => {
  const source = fs.readFileSync(path.join(BODY_SOUL.instance, 'client.js'), 'utf8')
  const block = /reasons:\s*Object\.freeze\(\[([\s\S]*?)\]\)/.exec(source)
  assert.ok(block, 'the card declares its reason codes')
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
})()

describe('P3 a non-https endpoint has its own sync reason', () => {
  it('P3-DT-01 a plain http endpoint is not offered, with the https reason', async (t) => {
    const fixture = await engineFixture(t, sourceWith(provider(C.ids.add, { profile: profileWith({ baseURL: HTTP_ENDPOINT }) })))
    const plan = await fixture.preview()
    assert.deepEqual(refusalsOf(plan), [[C.ids.add, NON_HTTPS]])
    assert.equal(plan.groups.add.length, 0)
    assertNoWrites(fixture)
  })

  it('P3-DT-02 an https endpoint is still offered', async (t) => {
    const fixture = await engineFixture(t, sourceWith(provider()))
    const plan = await fixture.preview()
    assert.deepEqual(plan.groups.add.map((entry) => entry.id), [C.ids.add])
    assert.deepEqual(plan.groups.unsupported, [])
  })

  it('P3-DT-03 custom headers on an https endpoint keep unsupported-provider', async (t) => {
    const custom = provider(C.ids.add, {
      profile: profileWith({ headers: { 'x-test': '1' } }),
    })
    const fixture = await engineFixture(t, sourceWith(custom))
    const plan = await fixture.preview()
    assert.deepEqual(refusalsOf(plan), [[C.ids.add, UNSUPPORTED]])
  })

  it('P3-DT-04 the host refuses the unsafe profiles it sees before a settings write, and still adds https', async (t) => {
    const target = await hostFixture(t, {})
    await target.inventory()
    for (const entry of UNSAFE.filter((item) => item.id !== ID.empty)) {
      let refusal
      try {
        await target.safe(() => target.host.addProvider(entry.id, clone(PROFILES[entry.id]), C.revision, C.ns))
      } catch (error) { refusal = error }
      assert.ok(refusal, entry.label + ' must be refused')
      assert.equal(refusal.code, HOST_PROFILE_REFUSAL)
      if (entry.hostReason !== undefined) assert.equal(refusal.profileReason, entry.hostReason)
      assert.equal(target.calls.mutation.length, 0, entry.label + ' must not write settings')
    }
    const added = await target.safe(() => target.host.addProvider(ID.https, clone(PROFILES[ID.https]), C.revision, C.ns))
    assert.equal(added.revision, C.revision + 1)
    assert.equal(target.calls.mutation.length, 1)
    assert.deepEqual(target.state.profiles[ID.https], PROFILES[ID.https])
  })

  it('P3-EP-01 any other non-https scheme gets the same https reason', async (t) => {
    const fixture = await engineFixture(t, sourceWith(provider(C.ids.add, { profile: profileWith({ baseURL: 'ftp://models.example.invalid/v1' }) })))
    assert.deepEqual(refusalsOf(await fixture.preview()), [[C.ids.add, NON_HTTPS]])
  })

  it('P3-EP-02 a malformed endpoint is not reported as a protocol rejection', async (t) => {
    const fixture = await engineFixture(t, sourceWith(provider(C.ids.add, { profile: profileWith({ baseURL: 'not a url' }) })))
    assert.deepEqual(refusalsOf(await fixture.preview()), [[C.ids.add, UNSUPPORTED]])
  })

  it('P3-EP-03 the English https reason names https and not custom headers', () => {
    const text = words.en['syncReason.' + NON_HTTPS]
    assert.ok(text, 'the card has words for the https reason')
    assert.match(text, /https/i)
    assert.doesNotMatch(text, /custom header/i)
    assert.match(words.en['syncReason.' + UNSUPPORTED], /custom header/i)
  })

  it('P3-EP-04 the Chinese https reason says https in Chinese words', () => {
    const text = words.zh['syncReason.' + NON_HTTPS]
    assert.ok(text, 'the card has Chinese words for the https reason')
    assert.match(text, CJK)
    assert.match(text, /https/i)
    assert.notEqual(text, words.en['syncReason.' + NON_HTTPS])
    assert.match(words.zh['syncReason.' + UNSUPPORTED], CJK)
  })

  // Each unsafe partition is first observed at the engine seam, where the six profiles are
  // distinguishable. Confirming the refused id proves the preview's refusal is not cosmetic: the
  // engine has no operation it may run, and no write happens.
  for (const entry of UNSAFE) {
    it(entry.caseId + ' ' + entry.label + ' is never offered or synced, and shows its reason', async (t) => {
      const fixture = await engineFixture(t, sourceWith(provider(entry.id, { profile: clone(PROFILES[entry.id]) })))
      const plan = await fixture.preview()
      assert.deepEqual(refusalsOf(plan), [[entry.id, entry.reason]])
      assert.deepEqual(plan.groups.add, [])
      assertRejected(await outcome(() => fixture.confirm(plan, [{ id: entry.id, record: fixture.credentials.record() }])))
      assertNoWrites(fixture)
    })
  }

  it('P3-EP-06 an https provider from the real host is offered', async (t) => {
    const { source } = await hostSource(t, ID.https)
    const engine = await engineFixture(t, source, targetFor(source))
    const plan = await engine.preview()
    assert.deepEqual(plan.groups.add.map((entry) => entry.id), [ID.https])
    assert.deepEqual(plan.groups.unsupported, [])
  })

  it('P3-DT-05 the host carries the shared verdict for the absorbed checks', async (t) => {
    for (const id of [ID.template, ID.duplicate]) {
      const { source } = await hostSource(t, id)
      const entry = source.providers.find((item) => item.id === id)
      assert.equal(entry.supported, false)
      assert.equal(entry.reason, HOST_PROFILE_REFUSAL)
      assert.equal(entry.profileReason, UNSUPPORTED)
      const engine = await engineFixture(t, source, targetFor(source))
      assert.deepEqual(refusalsOf(await engine.preview()), [[id, UNSUPPORTED]])
    }
  })

  it('P3-H-DT-01 the real host carries the http refusal reason into the engine preview', async (t) => {
    const { source } = await hostSource(t, ID.http)
    const entry = source.providers.find((item) => item.id === ID.http)
    assert.equal(entry.supported, false)
    assert.equal(entry.profile, null)
    assert.equal(entry.reason, HOST_PROFILE_REFUSAL)
    assert.equal(entry.profileReason, NON_HTTPS)
    const fixture = await engineFixture(t, source)
    const plan = await fixture.preview()
    assert.deepEqual(refusalsOf(plan), [[ID.http, NON_HTTPS]])
    assert.deepEqual(plan.groups.add, [])
  })

  it('P3-P-01 the card renders the code with words instead of a raw code', () => {
    assert.ok(reasonsList.includes(NON_HTTPS), NON_HTTPS + ' is a known card reason')
    assert.ok(reasonsList.includes(UNSUPPORTED), UNSUPPORTED + ' stays a known card reason')
  })
})

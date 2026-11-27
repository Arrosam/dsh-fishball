/**
 * K3 contract rows: the connector's published declaration of `dshInstanceChild` (host-services/
 * child.d.ts of the sibling dsh-connector checkout) and the instance's real locator, the object the
 * host row provides under that name. The declaration is read as text (types only); the locator is
 * the instance's own module, built from stand-in parts that only satisfy its documented inputs
 * (src/host/locator.js JSDoc), so what is checked is its shape, never a behaviour of the stand-ins.
 *
 * Techniques: EP over the members (declared, present on the real object), the refusal vocabulary.
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { importBound } from '@dsh-instance/test-helpers/sdk'
import { missingSibling } from '@dsh-instance/test-helpers/siblings'
import { aliasLiterals, CONNECTOR, declarationText, hostServicesDir, interfaceMembers, promiseVariants } from './support/declarations.mjs'
import { INSTANCE, K3 } from './support/constants.mjs'

const skip = missingSibling('connector') || (hostServicesDir() ? false : 'the dsh-connector checkout has no packages/dsh-connector/host-services folder')
const child = () => declarationText(CONNECTOR.child)
const members = (text = child()) => {
  const found = interfaceMembers(text, K3.service)
  assert.ok(found, 'child.d.ts declares no interface ' + K3.service)
  return found
}

// Compare the full variants without depending on indentation, spacing, or a trailing semicolon.
const normalizeVariant = (variant) => variant.replace(/\s+/g, ' ').replace(/\s*([{}:;?|])\s*/g, '$1').replace(/;}$/, '}')

eachSdk((sdk) => {
  caseTest(sdk, 'HOST-ST-01', 'K', `the K3 locator declares ${K3.members.join(', ')}; reconnect() returns the published Promise result variants and seven refusal codes`, () => {
    const text = child()
    const declared = members(text)
    assert.deepEqual(K3.members.filter((m) => !declared.has(m)), [], 'members missing from ' + K3.service)
    const reconnect = declared.get('reconnect')
    assert.ok(reconnect.method, 'reconnect is not a method')
    assert.deepEqual(reconnect.params, [], 'reconnect takes parameters')
    const variants = promiseVariants(reconnect.returns)
    assert.ok(variants, 'reconnect returns ' + reconnect.returns)
    assert.deepEqual(variants.map(normalizeVariant).sort(), K3.reconnectVariants.map(normalizeVariant).sort())
    assert.deepEqual(aliasLiterals(text, K3.reconnectType)?.sort(), [...K3.reconnectCodes].sort())
  }, { skip })

  caseTest(sdk, 'AGENT-ENTRY', 'K3', 'child.d.ts declares dshInstanceChild.agentEntry() with no parameters, returning string | null', () => {
    const found = members().get('agentEntry')
    assert.ok(found?.method, 'agentEntry is not a declared method')
    assert.deepEqual(found.params, [], 'agentEntry takes parameters')
    assert.match(found.returns, /^(string\s*\|\s*null|null\s*\|\s*string)$/, 'agentEntry returns ' + found.returns)
  }, { skip })

  caseTest(sdk, 'SYNC', 'Q-G7', 'K3 documents that model sync copies the provider and model lists only, never a default or session model', () => {
    const text = child()
    const at = text.indexOf('interface ProviderSyncStatus')
    assert.ok(at > 0, 'child.d.ts declares no ProviderSyncStatus')
    const doc = text.slice(text.lastIndexOf('/**', at), at)
    for (const re of K3.syncWording) assert.match(doc, re, 'the ProviderSync doc does not say ' + re)
  }, { skip })

  caseTest(sdk, 'HOST-ST-01', 'K', 'the real locator object is the K3 service: apiVersion 1, every declared member, providerSync passed through', async () => {
    const { createChildLocator } = await importBound(sdk, INSTANCE.locator)
    const providerSync = Object.freeze({ status: () => ({ state: 'inactive' }), check: async () => ({ ok: false, error: { code: 'x' } }), add: async () => ({ ok: false, error: { code: 'x' } }) })
    const locator = createChildLocator({
      lifecycle: { status: () => ({ state: 'stopped', code: null }), onChange: () => () => {}, retry: async () => {} },
      origin: () => undefined,
      ticket: async () => '',
      hosted: { reconnect: async () => ({ ok: true }), retryNotice: () => {}, targetStatus: () => ({ state: 'target-unset', code: null }), agentEntry: () => null },
      providerSync,
    })
    assert.equal(locator.apiVersion, K3.apiVersion)
    const declared = skip ? K3.members : [...members().keys()]
    for (const m of declared.filter((n) => !K3.data.includes(n))) assert.equal(typeof locator[m], 'function', m)
    assert.equal(locator.providerSync, providerSync, 'providerSync is not passed through')
  }, { skip })
})

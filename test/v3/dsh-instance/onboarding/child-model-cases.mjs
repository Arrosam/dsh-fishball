/**
 * Part 2 tests: `child-model` Wire Channel & helpers (`constants.js`, `child-model.js`, `wire.js`).
 * Designed strictly from requirements using EP, BVA, DT, and ST.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { CHILD_MODEL_CONTRACT, FIXTURE, ONBOARDING_CONTRACT } from './constants.mjs'
import { childModelModule, fakeChildSettings, memoryWire, nativeConstantsModule, wirePair } from './subject.mjs'

export function registerChildModelCases(sdk) {
  describe(`dsh-instance child-model channel (SDK ${sdk})`, () => {
    test('EP: constants.js exports CHILD_MODEL and ONBOARDING with exact contract values', async () => {
      const { CHILD_MODEL, ONBOARDING } = await nativeConstantsModule(sdk)
      assert.equal(CHILD_MODEL.channel, CHILD_MODEL_CONTRACT.channel)
      assert.equal(CHILD_MODEL.settingsNamespace, CHILD_MODEL_CONTRACT.settingsNamespace)
      assert.deepEqual([...CHILD_MODEL.path], [...CHILD_MODEL_CONTRACT.path])
      assert.deepEqual(CHILD_MODEL.op, CHILD_MODEL_CONTRACT.op)
      assert.deepEqual(CHILD_MODEL.code, CHILD_MODEL_CONTRACT.code)

      assert.equal(ONBOARDING.file, ONBOARDING_CONTRACT.file)
      assert.equal(ONBOARDING.format, ONBOARDING_CONTRACT.format)
      assert.deepEqual(ONBOARDING.outcome, ONBOARDING_CONTRACT.outcome)
    })

    describe('normalizeModelSelection (EP + BVA)', () => {
      const invalidCases = [
        ['null', null],
        ['undefined', undefined],
        ['boolean true', true],
        ['boolean false', false],
        ['number 0', 0],
        ['number 42', 42],
        ['string', 'openai/gpt-5'],
        ['empty array', []],
        ['non-empty array', ['openai', 'gpt-5']],
        ['empty object', {}],
        ['missing provider', { model: 'gpt-5' }],
        ['missing model', { provider: 'openai' }],
        ['blank provider', { provider: '', model: 'gpt-5' }],
        ['whitespace-only provider', { provider: '  \t\n ', model: 'gpt-5' }],
        ['blank model', { provider: 'openai', model: '' }],
        ['whitespace-only model', { provider: 'openai', model: ' \r\n\t ' }],
        ['non-string provider (number)', { provider: 123, model: 'gpt-5' }],
        ['non-string provider (null)', { provider: null, model: 'gpt-5' }],
        ['non-string model (object)', { provider: 'openai', model: {} }],
        ['non-string model (array)', { provider: 'openai', model: ['gpt-5'] }],
      ]

      for (const [label, input] of invalidCases) {
        test(`EP invalid: ${label} -> null`, async () => {
          const { normalizeModelSelection } = await childModelModule(sdk)
          assert.equal(normalizeModelSelection(input), null)
        })
      }

      test('EP/BVA valid: trims whitespace, handles single-char boundaries, strips unknown keys', async () => {
        const { normalizeModelSelection } = await childModelModule(sdk)

        // Single-char minimum valid boundary
        assert.deepEqual(normalizeModelSelection({ provider: 'a', model: 'b' }), { provider: 'a', model: 'b' })

        // Trimming + unknown keys stripped
        const trimmed = normalizeModelSelection({
          provider: '  openai \t',
          model: '\n gpt-5  ',
          reasoningEffort: '  high ',
          extra: 'drop-me',
          nested: { bad: true },
        })
        assert.deepEqual(trimmed, { provider: 'openai', model: 'gpt-5', reasoningEffort: 'high' })
        assert.deepEqual(Object.keys(trimmed).sort(), ['model', 'provider', 'reasoningEffort'])
      })

      test('BVA reasoningEffort: omitted when absent, undefined, null, empty, whitespace-only, or non-string', async () => {
        const { normalizeModelSelection } = await childModelModule(sdk)
        for (const effort of [undefined, null, '', '   \t\n ', 123, {}, []]) {
          const input = effort === undefined ? { provider: 'p', model: 'm' } : { provider: 'p', model: 'm', reasoningEffort: effort }
          const out = normalizeModelSelection(input)
          assert.deepEqual(out, { provider: 'p', model: 'm' })
          assert.equal('reasoningEffort' in out, false, `reasoningEffort must be omitted for ${JSON.stringify(effort)}`)
        }
      })
    })

    describe('sanitizeCatalog (EP + BVA)', () => {
      const invalidCatalogs = [
        ['null', null],
        ['undefined', undefined],
        ['string', 'catalog'],
        ['number', 42],
        ['array', []],
        ['missing groups', {}],
        ['groups is null', { groups: null }],
        ['groups is object', { groups: {} }],
        ['groups is string', { groups: 'bad' }],
      ]

      for (const [label, input] of invalidCatalogs) {
        test(`EP invalid catalog: ${label} -> null`, async () => {
          const { sanitizeCatalog } = await childModelModule(sdk)
          assert.equal(sanitizeCatalog(input), null)
        })
      }

      test('BVA empty & degenerate groups are dropped, leaving { groups: [] }', async () => {
        const { sanitizeCatalog } = await childModelModule(sdk)
        assert.deepEqual(sanitizeCatalog({ groups: [] }), { groups: [] })
        const filtered = sanitizeCatalog({
          groups: [
            null,
            'str',
            { id: '', name: 'Blank Id', models: [{ id: 'm1' }] },
            { id: '   ', models: [{ id: 'm1' }] },
            { id: 'no-models-field' },
            { id: 'empty-models', models: [] },
            { id: 'only-bad-models', models: [null, {}, { id: '' }, { id: '   ' }, { id: 42 }] },
          ],
          extraRoot: 'strip',
        })
        assert.deepEqual(filtered, { groups: [] })
        assert.deepEqual(Object.keys(filtered), ['groups'])
      })

      test('EP valid catalog: trims, defaults name -> id, sanitizes reasoning efforts, strips unknown fields', async () => {
        const { sanitizeCatalog } = await childModelModule(sdk)
        const raw = {
          default: { provider: 'openai', model: 'gpt-5' },
          failures: [{ id: 'f', message: 'fail' }],
          groups: [
            {
              id: '  deepseek  ',
              name: '',
              unknownGroupKey: 1,
              models: [
                {
                  id: ' deepseek-chat ',
                  description: 'extra description stripped',
                  reasoning: { efforts: [] },
                },
                {
                  id: 'deepseek-r1',
                  name: '  DeepSeek R1 ',
                  badge: { label: 'new' },
                  reasoning: {
                    defaultEffort: 'high',
                    efforts: [
                      null,
                      { id: '' },
                      { id: ' low ', name: ' Low ', extra: 'x' },
                      { id: 'high', name: '   ' },
                    ],
                  },
                },
                { id: '   ', name: 'invalid' },
              ],
            },
            {
              id: 'empty-after-filter',
              models: [{ id: '' }],
            },
          ],
        }

        const out = sanitizeCatalog(raw)
        assert.deepEqual(out, {
          groups: [
            {
              id: 'deepseek',
              name: 'deepseek',
              models: [
                { id: 'deepseek-chat', name: 'deepseek-chat' },
                {
                  id: 'deepseek-r1',
                  name: 'DeepSeek R1',
                  reasoning: {
                    efforts: [
                      { id: 'low', name: 'Low' },
                      { id: 'high', name: 'high' },
                    ],
                  },
                },
              ],
            },
          ],
        })
        // Verify reasoning key omitted when efforts empty
        assert.equal('reasoning' in out.groups[0].models[0], false)
      })
    })

    describe('createChildModelClient & createChildModelReceiver (DT + ST + BVA)', () => {
      test('DT-1: read returns namespacePresent=true, normalized model, sanitized catalog, and passes redactSecrets: true', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const wire = memoryWire()
        const settings = fakeChildSettings({
          namespacePresent: true,
          initialModel: { provider: ' deepseek ', model: ' deepseek-chat ', extra: 'ignored' },
        })
        let catalogCalls = 0
        const receiver = createChildModelReceiver({
          settings,
          getCatalog: () => { catalogCalls += 1; return FIXTURE.catalog },
        })
        receiver.attach(wire.child)
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close(); wire.lose() })

        const res = await client.read()
        assert.equal(res.namespacePresent, true)
        assert.deepEqual(res.model, FIXTURE.modelA)
        assert.deepEqual(res.catalog, FIXTURE.catalog)
        assert.equal(catalogCalls, 1)
        assert.deepEqual(settings.calls.describe, [{ redactSecrets: true }])
      })

      test('DT-2: read when namespacePresent=true and model is unset returns model: null', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const wire = memoryWire()
        const settings = fakeChildSettings({ namespacePresent: true, initialModel: null })
        const receiver = createChildModelReceiver({ settings, getCatalog: () => FIXTURE.catalog })
        receiver.attach(wire.child)
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close(); wire.lose() })

        const res = await client.read()
        assert.equal(res.namespacePresent, true)
        assert.equal(res.model, null)
        assert.deepEqual(res.catalog, FIXTURE.catalog)
      })

      test('DT-3: read when fishball-core namespace is absent returns namespacePresent=false, model=null', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const wire = memoryWire()
        const settings = fakeChildSettings({ namespacePresent: false })
        const receiver = createChildModelReceiver({ settings, getCatalog: () => FIXTURE.catalog })
        receiver.attach(wire.child)
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close(); wire.lose() })

        const res = await client.read()
        assert.equal(res.namespacePresent, false)
        assert.equal(res.model, null)
        assert.deepEqual(res.catalog, FIXTURE.catalog)
      })

      test('DT-4: set with valid selection mutates fishball-core ["model"] with descriptor.revision and returns normalized model', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const wire = memoryWire()
        const settings = fakeChildSettings({ namespacePresent: true, initialModel: null, revision: 12 })
        const receiver = createChildModelReceiver({ settings, getCatalog: () => FIXTURE.catalog })
        receiver.attach(wire.child)
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close(); wire.lose() })

        const res = await client.set({ provider: ' openai ', model: ' gpt-5 ', reasoningEffort: ' high ', extra: 1 })
        assert.deepEqual(res, { ok: true, model: FIXTURE.modelB })
        assert.equal(settings.calls.mutate.length, 1)
        assert.deepEqual(settings.calls.mutate[0], {
          ns: CHILD_MODEL_CONTRACT.settingsNamespace,
          ops: [{ op: 'set', path: ['model'], value: FIXTURE.modelB }],
          expectedRevision: 12,
        })

        // Subsequent read reflects persisted model
        const after = await client.read()
        assert.deepEqual(after.model, FIXTURE.modelB)
      })

      test('DT-5: set with invalid selection refuses cleanly with invalid-model without calling mutate', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const wire = memoryWire()
        const settings = fakeChildSettings({ namespacePresent: true })
        const receiver = createChildModelReceiver({ settings, getCatalog: () => FIXTURE.catalog })
        receiver.attach(wire.child)
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close(); wire.lose() })

        for (const bad of [null, {}, { provider: '', model: 'gpt-5' }, { provider: 'openai', model: '  ' }]) {
          const res = await client.set(bad)
          assert.deepEqual(res, { ok: false, code: CHILD_MODEL_CONTRACT.code.invalidModel })
        }
        assert.equal(settings.calls.mutate.length, 0)
      })

      test('DT-6: set when fishball-core namespace missing returns { ok: false, code: "namespace-missing" }', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const wire = memoryWire()
        const settings = fakeChildSettings({ namespacePresent: false })
        const receiver = createChildModelReceiver({ settings, getCatalog: () => FIXTURE.catalog })
        receiver.attach(wire.child)
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close(); wire.lose() })

        const res = await client.set(FIXTURE.modelA)
        assert.deepEqual(res, { ok: false, code: CHILD_MODEL_CONTRACT.code.namespaceMissing })
        assert.equal(settings.calls.mutate.length, 0)
      })

      test('DT-7: set when settings.mutate throws returns { ok: false, code: "write-failed" }', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const wire = memoryWire()
        const settings = fakeChildSettings({ namespacePresent: true, failMutate: true })
        const receiver = createChildModelReceiver({ settings, getCatalog: () => FIXTURE.catalog })
        receiver.attach(wire.child)
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close(); wire.lose() })

        const res = await client.set(FIXTURE.modelA)
        assert.deepEqual(res, { ok: false, code: CHILD_MODEL_CONTRACT.code.writeFailed })
        assert.equal(settings.calls.mutate.length, 1)
      })

      test('ST-1: client rejects read() with CHILD_MODEL_CHANNEL_UNAVAILABLE on timeout', async (t) => {
        const { createChildModelClient } = await childModelModule(sdk)
        const wire = memoryWire()
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.shortTimeoutMs })
        t.after(() => { client.close(); wire.lose() })

        await assert.rejects(
          () => client.read(),
          (err) => err?.name === 'NativeRuntimeError' && err?.code === CHILD_MODEL_CONTRACT.errorCode,
        )
      })

      test('ST-2: client rejects pending and subsequent calls with CHILD_MODEL_CHANNEL_UNAVAILABLE on transport close', async (t) => {
        const { createChildModelClient } = await childModelModule(sdk)
        const wire = memoryWire()
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => client.close())

        const pending = client.read()
        wire.lose()

        await assert.rejects(
          () => pending,
          (err) => err?.name === 'NativeRuntimeError' && err?.code === CHILD_MODEL_CONTRACT.errorCode,
        )
        await assert.rejects(
          () => client.read(),
          (err) => err?.name === 'NativeRuntimeError' && err?.code === CHILD_MODEL_CONTRACT.errorCode,
        )
      })

      test('ST-3: client rejects pending and subsequent calls with CHILD_MODEL_CHANNEL_UNAVAILABLE on client.close()', async (t) => {
        const { createChildModelClient } = await childModelModule(sdk)
        const wire = memoryWire()
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => wire.lose())

        const pending = client.read()
        client.close()

        await assert.rejects(
          () => pending,
          (err) => err?.name === 'NativeRuntimeError' && err?.code === CHILD_MODEL_CONTRACT.errorCode,
        )
        await assert.rejects(
          () => client.read(),
          (err) => err?.name === 'NativeRuntimeError' && err?.code === CHILD_MODEL_CONTRACT.errorCode,
        )
      })

      test('ST-4: concurrent read/set calls correlate replies independently', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const wire = memoryWire()
        const settings = fakeChildSettings({ namespacePresent: true, initialModel: FIXTURE.modelA })
        const receiver = createChildModelReceiver({ settings, getCatalog: () => FIXTURE.catalog })
        receiver.attach(wire.child)
        const client = createChildModelClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close(); wire.lose() })

        const [r1, r2, r3] = await Promise.all([client.read(), client.set(FIXTURE.modelB), client.read()])
        assert.equal(r1.namespacePresent, true)
        assert.equal(r2.ok, true)
        assert.deepEqual(r2.model, FIXTURE.modelB)
        assert.equal(r3.namespacePresent, true)
      })

      test('Integration: real Wire.childModelTransport carries read/set alongside sibling payload channels', async (t) => {
        const { createChildModelClient, createChildModelReceiver } = await childModelModule(sdk)
        const { hostWire, childWire } = await wirePair(t, sdk)
        const settings = fakeChildSettings({ namespacePresent: true, initialModel: null })

        assert.equal(typeof hostWire.childModelTransport, 'function')
        assert.equal(typeof childWire.childModelTransport, 'function')

        // Observe sibling channels to verify strict channel isolation
        const siblingReceived = []
        const hostSync = hostWire.providerSyncTransport?.()
        const childSync = childWire.providerSyncTransport?.()
        const hostCred = hostWire.credentialTransport?.()
        const childCred = childWire.credentialTransport?.()
        childSync?.onMessage((msg) => siblingReceived.push({ ch: 'sync', msg }))
        childCred?.onMessage((msg) => siblingReceived.push({ ch: 'cred', msg }))

        const receiver = createChildModelReceiver({ settings, getCatalog: () => FIXTURE.catalog })
        receiver.attach(childWire.childModelTransport())
        const client = createChildModelClient(hostWire.childModelTransport(), { timeoutMs: FIXTURE.longTimeoutMs })
        t.after(() => { client.close(); receiver.close() })

        // Send traffic on sibling channel while child-model operates
        hostSync?.send(JSON.stringify({ ping: 'sync-only' }))
        hostCred?.send(JSON.stringify({ ping: 'cred-only' }))

        const before = await client.read()
        assert.equal(before.namespacePresent, true)
        assert.equal(before.model, null)

        const written = await client.set(FIXTURE.modelA)
        assert.deepEqual(written, { ok: true, model: FIXTURE.modelA })

        const after = await client.read()
        assert.deepEqual(after.model, FIXTURE.modelA)

        // Sibling messages arrived on their own channels and never contaminated child-model
        if (childSync) {
          assert.ok(siblingReceived.some((e) => e.ch === 'sync' && e.msg.includes('sync-only')))
          assert.equal(siblingReceived.some((e) => e.msg.includes('deepseek-chat')), false, 'child-model payloads must not leak to sibling channels')
        }
      })
    })
  })
}

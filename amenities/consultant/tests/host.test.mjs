import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { createConsultant } from '../src/consultant.js'

const PLUGIN = 'fishball-consultant'
const OWNER = 'profile-owner'
const TARGET = { targetId: 'review-target', endpointEpoch: 'epoch-current' }
const OLD_EPOCH = 'epoch-replaced'
const SPACE = 'neutral-space'
const ROUTE = 'provider/review-v1'
const EFFORT = 'medium'
const TITLE = 'Migration review'
const TOPIC = { kind: 'topic', id: 'topic-1' }
const QUESTION = 'Which approach is easier to roll back?'
const REASON = 'Review is finished.'
const FOREIGN = 'not-owner'
const METADATA = ['models_list', 'workspaces_list']
const ROUTE_NAMES = ['create-topic', 'decision', 'detail', 'discard', 'discovery', 'list', 'reconcile']
const TOOL_NAMES = ['consultant_ask', 'consultant_close']
const FORM = 'application/x-www-form-urlencoded'
const JSON_TYPE = 'application/json'
const INVALID = 'INVALID_INPUT'

// Resolve only the two SDK peers against test doubles. No SDK install, profile, socket, or
// network is needed. fishball-shared resolves through this package's declared dependency.
const dataModule = (source) => 'data:text/javascript,' + encodeURIComponent(source)
const testModules = {
  '@deepseek-ai/dsh-storage-domain': dataModule('export const defineDomain = (definition) => definition'),
  '@deepseek-ai/schemastery': dataModule(
    'const chain = () => Object.fromEntries(["default", "volatile", "min", "max"].map((key) => [key, chain]));'
    + 'export default { string: chain, boolean: chain, natural: chain, object: (shape) => shape }',
  ),
}
register(dataModule('let modules; export function initialize(data) { modules = data }'
  + 'export function resolve(name, context, next) {'
  + 'return Object.hasOwn(modules, name) ? { url: modules[name], shortCircuit: true } : next(name, context) }'),
{ parentURL: import.meta.url, data: testModules })

const { mountTools, openLedger, ownerCards, registerRoutes } = await import('../src/host.js')
const { createDiscovery } = await import('../src/discovery.js')
const { apply } = await import('../index.js')

function toolsForAgent() {
  const tools = new Map()
  return { tools, agentCtx: { tools: { register(tool) {
    assert.ok(!tools.has(tool.name), 'a manager tool is registered only once')
    tools.set(tool.name, tool)
  } } } }
}

function webHost() {
  const routes = new Map()
  const routePath = (name) => '/api/' + PLUGIN + '/' + name
  return {
    routes,
    registry: { register(route) {
      assert.ok(!routes.has(route.path), 'a route is registered only once')
      assert.deepEqual(route.methods, ['POST'])
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    } },
    async post(name, body, options = {}) {
      const path = routePath(name)
      const route = routes.get(path)
      assert.ok(route, 'expected registered route ' + path)
      const request = new Request('https://profile.invalid' + path, {
        method: 'POST', headers: { 'content-type': options.type ?? JSON_TYPE },
        body: options.raw ?? JSON.stringify(body),
      })
      const response = await route.fetch(request)
      return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') }
    },
  }
}

function storageHost() {
  let value
  const calls = []
  let onWrite = () => {}
  return {
    calls,
    beforeWrite(hook) { onWrite = hook },
    storage: { domain: { async open(domain) {
      calls.push(['open', domain.name, domain.version])
      value ??= structuredClone(domain.global.initial)
      return { global: {
        get: () => structuredClone(value),
        async set(next) {
          calls.push(['write', domain.name])
          await onWrite()
          value = structuredClone(domain.global.schema.parse(next))
        },
      }, close: async () => { calls.push(['close', domain.name]) } }
    } } },
  }
}

function bridgeHost() {
  const calls = []
  const privateValue = 'private-target-metadata'
  const models = { ok: true,
    models: [{ model: ROUTE, provider: 'provider', name: 'Review', reasoningEfforts: [EFFORT], privateValue }],
    unavailableProviders: [{ provider: 'offline-provider', privateValue }],
  }
  const workspaces = { ok: true, workspaces: [
    { workspaceId: SPACE, title: 'Neutral review', available: true, privateValue },
    { workspaceId: 'offline-space', title: 'Offline', available: false },
  ] }
  let target = { ...TARGET, name: 'Demo target', state: 'connected', privateValue }
  let beforeReply = () => {}
  const instance = {
    apiVersion: 2,
    ui: { targets: { list: () => ({ targets: [target] }) } },
    bridge(pluginId, allowlist, selector) {
      calls.push(['bridge', pluginId, [...allowlist].sort(), selector])
      // Advertise support for anything, including ordinary worker methods; the consumer must
      // still constrain both the handle and actual calls to read-only metadata.
      return { supports: () => true, async call(name, input) {
        calls.push(['call', name, input])
        await beforeReply()
        return ({ models_list: models, workspaces_list: workspaces })[name]
      } }
    },
  }
  return { calls, instance, privateValue, replaceEpoch() { target = { ...target, endpointEpoch: OLD_EPOCH } }, beforeReply(hook) { beforeReply = hook } }
}

const expectTools = (tools) => assert.deepEqual([...tools.keys()].sort(), TOOL_NAMES)

function expectMetadataOnly(calls) {
  const bridges = calls.filter(([op]) => op === 'bridge')
  const invocations = calls.filter(([op]) => op === 'call')
  assert.ok(bridges.length > 0, 'the configured catalog was reachable')
  assert.deepEqual(invocations.map(([, name]) => name).sort(), METADATA)
  assert.deepEqual(bridges, [['bridge', PLUGIN, METADATA, TARGET]])
  assert.ok(invocations.every(([, , input]) => input === undefined || Object.keys(input).length === 0), 'catalog gets no brief')
}

test('manager scope mounts only ask and close, with closed input schemas and no implicit dispatch', async () => {
  const { agentCtx, tools } = toolsForAgent()
  const calls = []
  const ask = { subject: TOPIC, question: QUESTION }
  const close = { subject: TOPIC, reason: REASON }
  mountTools(agentCtx, {
    ask(input) { calls.push(input); return { ok: true, status: 'awaiting-consent' } },
    close(input) { calls.push(input); return { ok: true, status: 'awaiting-user-close' } },
  })
  expectTools(tools)
  assert.deepEqual(calls, [])
  for (const [name, payload, optional, expected] of [
    [TOOL_NAMES[0], ask, ['evidence'], 'awaiting-consent'],
    [TOOL_NAMES[1], close, [], 'awaiting-user-close'],
  ]) {
    const tool = tools.get(name)
    assert.equal(tool.parameters.additionalProperties, false)
    assert.equal(tool.parameters.properties.subject.additionalProperties, false)
    assert.deepEqual([...tool.parameters.required].sort(), Object.keys(payload).sort())
    assert.deepEqual(Object.keys(tool.parameters.properties).sort(), [...Object.keys(payload), ...optional].sort())
    assert.equal((await tool.execute(payload)).status, expected)
  }
  assert.deepEqual(calls, [ask, close])
})

test('the dedicated decision route consumes only an existing host card and supplies the fixed owner once', async (t) => {
  const web = webHost()
  const cards = ownerCards(OWNER)
  const decisions = []
  const card = () => cards.open({ brief: { question: QUESTION, history: [] } }, (decision) => {
    decisions.push(decision)
    return { ok: true }
  })
  const { cardId } = card()
  const body = { cardId, decision: 'allow' }
  t.after(registerRoutes(web.registry, { consultant: {}, discover: () => assert.fail('no discovery'), cards }))
  assert.deepEqual([...web.routes.keys()].map((path) => path.split('/').at(-1)).sort(), ROUTE_NAMES)
  for (const invalid of [{ ...body, ownerId: FOREIGN }, { ...body, decision: 'skip' }, { ...body, cardId: 'ordinary-ask-user-card' }]) {
    assert.equal((await web.post('decision', invalid)).data.ok, false)
  }
  assert.deepEqual(decisions, [])
  const answers = await Promise.all([web.post('decision', body), web.post('decision', body)])
  assert.equal(answers.filter(({ data }) => data.ok === true).length, 1)
  assert.deepEqual(decisions, [{ ...body, ownerId: OWNER }])
  const cancelled = card()
  cards.cancel(cancelled.cardId)
  const cleared = card()
  cards.clear()
  for (const expired of [cancelled, cleared]) {
    assert.equal((await web.post('decision', { ...expired, decision: 'allow' })).data.ok, false)
  }
  assert.equal(decisions.length, 1)
})

test('HTTP validation rejects non-JSON, malformed, oversized and extra-field bodies without dispatch', async (t) => {
  const web = webHost()
  const calls = []
  const dispatch = () => { calls.push('dispatch'); return { ok: true } }
  t.after(registerRoutes(web.registry, { consultant: { createTopic: dispatch }, discover: dispatch, cards: { answer: dispatch } }))
  for (const [route, body, options] of [
    ['decision', null, { raw: 'cardId=card&decision=allow', type: FORM }],
    ['decision', null, { raw: '{unclosed:' }],
    ['create-topic', { title: 'é'.repeat(8192) }],
    ['discovery', { ...TARGET, question: QUESTION }],
    ['create-topic', [TITLE]],
  ]) {
    const { status, data, cache } = await web.post(route, body, options)
    assert.equal(status, 400, route)
    assert.equal(data.code, INVALID)
    assert.equal(cache, 'no-store')
  }
  assert.deepEqual(calls, [])
})

const INVALID_ROUTE_INPUTS = [
  ['create-topic', 'createTopic', [{}, { title: null }, { title: '  ' }]],
  ['detail', 'detail', [{}, { subject: 'topic-1' }, { subject: { ...TOPIC, workspaceId: SPACE } }]],
  ['discard', 'discard', [{}, { subject: { ...TOPIC, id: '' } }]],
  ['reconcile', 'reconcile', [{}, { subject: { ...TOPIC, kind: 'unknown' } }]],
  ['discovery', null, [{ targetId: TARGET.targetId }, { ...TARGET, endpointEpoch: 2 }]],
]
for (const [route, method, inputs] of INVALID_ROUTE_INPUTS) {
  test('malformed ' + route + ' payloads do not reach the action', async (t) => {
    const web = webHost()
    const calls = []
    const dispatch = (input) => { calls.push(input); return { ok: true } }
    t.after(registerRoutes(web.registry, { consultant: method ? { [method]: dispatch } : {}, discover: dispatch, cards: {} }))
    for (const input of inputs) {
      const { data } = await web.post(route, input)
      assert.deepEqual(calls, [], 'must validate before dispatch: ' + JSON.stringify(input))
      assert.equal(data.code, INVALID)
    }
  })
}

test('discovery projects only read-only target, workspace and model metadata', async () => {
  const h = bridgeHost()
  const discover = createDiscovery(() => h.instance)
  const overview = await discover({})
  assert.deepEqual(overview.targets, [{ ...TARGET, name: 'Demo target', state: 'connected' }])
  assert.deepEqual(h.calls, [], 'listing available targets does not open a bridge')
  const result = await discover(TARGET)
  assert.equal(result.complete, true)
  assert.deepEqual(result.models.map(({ id, reasoningEfforts, available }) => ({ id, reasoningEfforts, available })),
    [{ id: ROUTE, reasoningEfforts: [EFFORT], available: true }])
  assert.deepEqual(result.workspaces, [{ id: SPACE, name: 'Neutral review' }])
  assert.deepEqual(result.unavailableProviders, [{ id: 'offline-provider' }])
  assert.ok(!JSON.stringify(result).includes(h.privateValue))
  expectMetadataOnly(h.calls)
})

test('discovery rejects a stale epoch before bridge creation and discards an in-flight result after replacement', async () => {
  const h = bridgeHost()
  const discover = createDiscovery(() => h.instance)
  const rejected = await discover({ ...TARGET, endpointEpoch: OLD_EPOCH })
  assert.equal(rejected.status.code, 'UNAVAILABLE')
  assert.deepEqual(h.calls, [])
  const reply = Promise.withResolvers()
  h.beforeReply(() => reply.promise)
  const pending = discover(TARGET)
  expectMetadataOnly(h.calls)
  h.replaceEpoch()
  reply.resolve()
  const stale = await pending
  assert.equal(stale.complete, false)
  assert.equal(stale.status.code, 'UNAVAILABLE')
  assert.deepEqual(stale.models, [])
  assert.deepEqual(stale.workspaces, [])
})

test('the named consultant storage domain drains commits before closing and retains topics on reopen', async () => {
  const ctx = storageHost()
  const domain = 'fishball_consultant'
  const first = await openLedger(ctx)
  const consultant = (ledger) => createConsultant({ ledger, getConfig: () => ({}) })
  const started = Promise.withResolvers()
  const finish = Promise.withResolvers()
  ctx.beforeWrite(() => { started.resolve(); return finish.promise })
  const create = consultant(first.ledger).createTopic(TITLE)
  await started.promise
  const close = first.close()
  try { assert.deepEqual(ctx.calls, [['open', domain, 1], ['write', domain]]) }
  finally { finish.resolve() }
  const topic = await create
  assert.equal(topic.ok, true)
  await close
  assert.deepEqual(ctx.calls.at(-1), ['close', domain])
  const reopened = await openLedger(ctx)
  try {
    const detail = await consultant(reopened.ledger).detail(topic.subject)
    assert.ok(JSON.stringify(detail).includes(TITLE))
  } finally { await reopened.close() }
})

test('production apply has no protected capability or worker fallback even with a reachable catalog', async (t) => {
  const h = bridgeHost()
  const web = webHost()
  const storage = storageHost()
  const { agentCtx, tools } = toolsForAgent()
  const effects = []
  const setups = []
  h.instance.manager = {
    registerSetup(pluginId, setup) {
      setups.push(pluginId)
      setup(agentCtx)
      return () => tools.clear()
    },
    notify: () => assert.fail('no advisory notification without a protected capability'),
  }
  await apply({ storage: storage.storage, connection: { fetch: web.registry }, get: (key) => key === 'fishballInstance' ? h.instance : undefined,
    on() {}, effect: (setup) => effects.push(setup()), logger: () => ({ warn: () => assert.fail('compatible core is present') }),
  }, { ...TARGET, workspaceId: SPACE, model: ROUTE, reasoningEffort: EFFORT })
  async function teardown() {
    for (const off of effects.splice(0).reverse()) await off()
  }
  t.after(teardown)
  assert.deepEqual(setups, [PLUGIN])
  expectTools(tools)
  assert.deepEqual(h.calls, [], 'mounting the plugin does not dispatch')
  const { data: created } = await web.post('create-topic', { title: TITLE })
  assert.equal(created.ok, true)
  const response = await tools.get(TOOL_NAMES[0]).execute({ subject: created.subject, question: QUESTION })
  assert.equal(response.code, 'UNAVAILABLE')
  assert.equal(response.reason, 'missing-guarantee')
  expectMetadataOnly(h.calls)
  assert.ok(!JSON.stringify(await web.post('detail', { subject: created.subject })).includes(QUESTION), 'the blocked ask created no disclosure record')
  await teardown()
  assert.equal(web.routes.size, 0)
  assert.equal(tools.size, 0)
})

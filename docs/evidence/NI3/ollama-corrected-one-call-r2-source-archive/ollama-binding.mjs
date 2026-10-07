// Genuine original-public DSH provider plugin. This private source binding is
// separate from DF's deterministic provider and issues no wire-carried authority.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { Context, symbols } from '../dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js';
import { Entry } from '../dsh-web/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js';
import { LlmRuntime, isAgentLoopRequest } from '../dsh-web/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import { AgentRegistry } from '../dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/index.js';
import { SessionStore } from '../dsh-web/node_modules/@deepseek-ai/dsh-session/lib/index.js';
import { scopeOf } from '../dsh-web/node_modules/@deepseek-ai/dsh-scope/lib/index.js';
import { BootstrapError } from '../../src/config.mjs';
import { workerChoiceRecord } from '../../src/installed-worker-config.mjs';
import { canonical, canonicalDigest, exact, ref, integer } from '../../src/runtime-security.mjs';
import { DSH_WEB_RUNTIME_ROOT, resolveHostSource } from '../../src/host-probe.mjs';
import { ApprovedOllamaAdapter, PROVIDER, MODEL, LIMITS } from './ollama-provider.mjs';

export const ACCOUNTING = 'df-ollama-api-token-units/v1';
export const SYSTEM = 'You are a dsh-fishball worker. Use only the approved task context supplied in this turn. Tools and external actions are unavailable.';
export const name = 'df-approved-ollama';
export const inject = Object.freeze(['llm','agents','sessions']);
const deny = () => { throw new BootstrapError('WORKER_REQUEST_DENIED'); };
const hash = value => createHash('sha256').update(value).digest('hex');
const modulePath = realpathSync(fileURLToPath(import.meta.url));
const loadedSource = hash(readFileSync(modulePath));
const providerPath = realpathSync(fileURLToPath(new URL('./ollama-provider.mjs', import.meta.url)));
const loadedProvider = hash(readFileSync(providerPath));
const envelopePath = realpathSync(fileURLToPath(new URL('./ollama-response-envelope.mjs', import.meta.url)));
const loadedEnvelope = hash(readFileSync(envelopePath));
const pinsPath = fileURLToPath(new URL('./source-pins.json', import.meta.url));
const loadedPins = hash(readFileSync(pinsPath));
const bindings = new WeakMap();
const original = value => value?.[symbols.original] ?? value;
function validConfig(value) { try { workerChoiceRecord(value, []); return Object.freeze({}); } catch { deny(); } }
export const Config = Object.freeze({ '~standard': Object.freeze({ version: 1, vendor: 'df',
  validate(value) { try { return { value: validConfig(value) }; } catch { return { issues: [{ message: 'CONFIG_INVALID' }] }; } } }) });

function checkHost(ctx) {
  try {
    if (hash(readFileSync(pinsPath)) !== loadedPins) deny();
    const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
    if (process.version !== 'v22.22.2' || !(ctx instanceof Context) ||
        !(ctx.llm instanceof LlmRuntime) || !(ctx.agents instanceof AgentRegistry) ||
        !(ctx.sessions instanceof SessionStore)) deny();
    if (hash(readFileSync(process.execPath)) !== pins.nodeExpectedSha256 ||
        hash(readFileSync(`${DSH_WEB_RUNTIME_ROOT}/package-lock.json`)) !== pins.hostLock.sha256 ||
        hash(readFileSync(new URL('../../scripts/dsh-web-runtime-lock.json', import.meta.url))) !== pins.hostLock.sha256) deny();
    for (const [pkg, pin] of Object.entries(pins.publicImports)) {
      const source = resolveHostSource(pkg), metadata = JSON.parse(readFileSync(resolveHostSource(pkg, 'package.json')));
      if (metadata.name !== pkg || metadata.version !== pin.version ||
          hash(readFileSync(source)) !== pin.sourceSha256 ||
          hash(readFileSync(resolveHostSource(pkg,'package.json'))) !== pin.packageSha256 ||
          import.meta.resolve(pkg) !== pathToFileURL(source).href) deny();
    }
  } catch { deny(); }
}
function current(binding) {
  try {
    checkHost(binding.ctx);
    const { ctx, entry } = binding;
    if (!binding.active || binding.invalidated || ctx.fiber.state !== 2 || ctx.fiber.uid === null ||
        binding.epoch !== binding.registeredEpoch || original(ctx.llm) !== binding.llm ||
        !(entry instanceof Entry) || ctx.fiber.entry !== entry || entry.fiber !== ctx.fiber ||
        entry.disabled || entry.moduleNamespace?.default !== plugin ||
        binding.adapter.constructor !== ApprovedOllamaAdapter || bindings.get(binding.llm) !== binding ||
        typeof binding.registration !== 'function' || hash(readFileSync(modulePath)) !== loadedSource ||
        hash(readFileSync(providerPath)) !== loadedProvider ||
        hash(readFileSync(envelopePath)) !== loadedEnvelope) deny();
    return true;
  } catch { deny(); }
}
function owned(binding, agent) {
  if (!agent || original(scopeOf(agent.ctx)) !== original(agent) ||
      original(agent.ctx?.agents) !== original(binding.ctx.agents) ||
      original(binding.ctx.agents.get(agent.id)) !== original(agent) ||
      original(binding.ctx.sessions.get(agent.id)) !== original(agent.session) ||
      agent.session.id !== agent.id || agent.options.provider !== PROVIDER || agent.options.model !== MODEL)
    deny();
}
function request(binding, permit, options) {
  if (!options || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype ||
      !isAgentLoopRequest(options)) deny();
  const descriptors = Object.getOwnPropertyDescriptors(options);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === 'symbol') continue;
    if (!['provider','model','reasoningEffort','maxTokens','messages','tools','toolHistory','signal','sessionId','system','temperature','stop','purpose'].includes(key) ||
        !descriptors[key].enumerable || !Object.hasOwn(descriptors[key],'value')) deny();
  }
  const get = key => descriptors[key]?.value;
  const signal = get('signal');
  if (signal !== undefined && (!(signal instanceof AbortSignal) || types.isProxy(signal) ||
      Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal))) deny();
  if (get('provider') !== PROVIDER || get('model') !== MODEL || get('reasoningEffort') !== 'ollama-think-off' ||
      get('maxTokens') !== permit.maxOutputTokens || get('sessionId') !== permit.agent.id ||
      ['system','temperature','stop','purpose'].some(key => get(key) !== undefined) ||
      get('tools') !== undefined && canonical(get('tools')) !== '[]' ||
      get('toolHistory') !== undefined && canonical(get('toolHistory')) !== canonical({tools:[],updates:[]})) deny();
  const messages = JSON.parse(canonical(get('messages')));
  if (messages.length !== 2) deny();
  const [system,user] = messages;
  exact(system,['id','role','content','source']); exact(system.source,['kind']);
  exact(user,['id','role','content','source']); exact(user.source,['kind','form']);
  if (system.role !== 'system' || system.source.kind !== 'system-prompt' ||
      typeof system.id !== 'string' || !system.id || Buffer.byteLength(system.id) > 128 ||
      canonical(system.content) !== canonical([{type:'text',text:SYSTEM}]) || user.role !== 'user' ||
      user.id !== permit.executionRef || user.source.kind !== 'df-context' || user.source.form !== 'local' ||
      canonical(user.content) !== canonical([{type:'text',text:permit.content}]) ||
      Buffer.byteLength(JSON.stringify(get('messages'))) > permit.requestBytes) deny();
}
export function apply(ctx, config) {
  validConfig(config); checkHost(ctx);
  const binding = { ctx, llm: original(ctx.llm), entry: ctx.fiber.entry, epoch: 0, registeredEpoch: null,
    active: true, invalidated: false, registration: null, adapter: null, permits: new WeakMap(), issued: 0 };
  const stop = () => { binding.active = false; binding.invalidated = true; binding.adapter?.close();
    if (bindings.get(binding.llm) === binding) bindings.delete(binding.llm); };
  ctx.on('llm/adapters-updated', () => { binding.epoch++; if (binding.registeredEpoch !== null) binding.invalidated = true; });
  ctx.on('internal/status', changed => { if (changed === ctx.fiber && (ctx.fiber.state === 3 || ctx.fiber.uid === null)) stop(); });
  ctx.effect(() => () => { stop(); binding.registration?.(); }, 'df.approved-ollama-binding');
  binding.adapter = new ApprovedOllamaAdapter({
    initiator: () => original(ctx.agents.currentInitiator()),
    admit({ agent, options, requestBytes }) {
      current(binding); owned(binding,agent);
      const permit = binding.permits.get(original(agent));
      if (!permit || permit.state !== 'prepared') deny();
      try {
        request(binding,permit,options);
        if (requestBytes > permit.requestBytes || permit.assertCurrent(options) !== true) deny();
        current(binding); owned(binding,agent);
        if (original(ctx.agents.currentInitiator()) !== original(agent) || permit.state !== 'prepared') deny();
        permit.state = 'consumed'; // one-use consume immediately precedes transport
        return true;
      } catch { permit.state = 'sealed'; deny(); }
    },
    bindCurrent({agent,options}) {
      current(binding);owned(binding,agent);
      const permit=binding.permits.get(original(agent));
      if(!permit||permit.state!=='consumed')deny();
      // Capture this exact consumed permit once. Rechecks never issue/consume a
      // new permit or substitute current mutable owner authority.
      return()=>{
        current(binding);owned(binding,agent);
        if(binding.permits.get(original(agent))!==permit||
            !['consumed','completed'].includes(permit.state))deny();
        request(binding,permit,options);
        if(permit.assertCurrent(options)!==true)deny();
        return true;
      };
    },
    onResult({ agent, options, usage, resultDigest, outputBytes }) {
      current(binding); owned(binding,agent);
      const permit = binding.permits.get(original(agent));
      if (!permit || permit.state !== 'consumed' || !usage || outputBytes > permit.resultBytes ||
          permit.assertCurrent(options) !== true) deny();
      const inputUnits = usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
      const outputUnits = usage.outputTokens, totalUnits = inputUnits + outputUnits;
      if (totalUnits !== usage.totalTokens || totalUnits > permit.usageUnits || outputUnits > permit.maxOutputTokens) deny();
      permit.usage = Object.freeze({ accounting: ACCOUNTING, inputUnits, outputUnits, totalUnits,
        tokenUsage: Object.freeze({ ...usage }), resultDigest, billingState: 'unknown' });
      permit.state = 'completed'; return true;
    },
  });
  binding.registration = ctx.llm.registerAdapter([PROVIDER],binding.adapter);
  binding.registeredEpoch = binding.epoch; bindings.set(binding.llm,binding);
}
const plugin = Object.freeze({ name, inject, Config, apply });
export default plugin;

export function getApprovedOllamaBinding(ctx) {
  const binding = bindings.get(original(ctx.llm)); if (!binding) deny();
  current(binding);
  if (!(ctx instanceof Context) || original(ctx.llm) !== binding.llm) deny();
  return Object.freeze({ entry: binding.entry,
    sourceRef: canonicalDigest(['df.approved-ollama-source/v2',loadedSource,loadedProvider,loadedEnvelope]),
    accounting: ACCOUNTING, billingState: 'unknown', assertCurrent: () => current(binding),
    audit: () => binding.adapter.audit(),
    issue(input) {
      exact(input,['agent','executionRef','content','maxOutputTokens','requestBytes','resultBytes','usageUnits','assertCurrent']);
      current(binding); owned(binding,input.agent); ref(input.executionRef);
      const agent = original(input.agent);
      if (typeof input.content !== 'string' || !input.content.isWellFormed() ||
          Buffer.byteLength(input.content) > LIMITS.requestBytes || typeof input.assertCurrent !== 'function' ||
          binding.permits.has(agent) || binding.issued >= 1 || binding.adapter.audit().uncertainHold) deny();
      integer(input.maxOutputTokens,128,LIMITS.outputTokens); integer(input.requestBytes,512,LIMITS.requestBytes);
      integer(input.resultBytes,128,LIMITS.outputBytes); integer(input.usageUnits,1,100000000);
      const permit = { ...input, agent, state: 'prepared', usage: null };
      binding.issued++; binding.permits.set(agent,permit);
      return Object.freeze({ seal() { permit.state = 'sealed'; }, usage() { return permit.usage; } });
    },
  });
}

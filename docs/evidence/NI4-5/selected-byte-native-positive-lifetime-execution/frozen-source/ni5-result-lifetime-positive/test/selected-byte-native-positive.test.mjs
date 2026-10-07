// SOURCE ONLY, NOT RUN. BP01: original native producer + selected byte reviewer,
// original normal local publication, one lost outward acknowledgement + read-only query.
// Await exact root executable GO. No semantic quality/product acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, chmodSync, rmSync, lstatSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { resolveHostSource } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { createInstalledWorker } from '../src/installed-worker.mjs';
import { createInstalledAudit } from '../src/installed-audit.mjs';
import { createInstalledResults } from '../src/installed-results.mjs';
import { BYTE_REVIEW_GOAL, BYTE_REVIEW_MODEL } from '../src/installed-synthetic-byte-review.mjs';
import { hash } from '../src/runtime-security.mjs';
const load=name=>import(pathToFileURL(resolveHostSource('@deepseek-ai/'+name)).href);
const {Context}=await load('cordis'),{default:Sessions}=await load('dsh-session'),{default:Projections}=await load('dsh-session-projection'),{default:Approval}=await load('dsh-user-approval'),{AgentRegistry}=await load('dsh-agent'),{LlmRuntime}=await load('dsh-llm'),{default:Tools}=await load('dsh-tools'),{default:Prompt}=await load('dsh-system-prompt'),{default:Presets}=await load('dsh-agent-preset-registry'),{default:Loader}=await load('cordis-plugin-loader'),{WebServer}=await load('dsh-host-webserver'),{HostConnectionService}=await load('dsh-client-connection');
class Response extends Writable{constructor(){super();this.parts=[];}_write(chunk,encoding,done){this.parts.push(Buffer.from(chunk));done();}writeHead(status){this.statusCode=status;}}
// Future separately held executable fixture: original public in-process
// services and JSONL persistence, one synthetic source-owned provider, no
// server.listen/HTTP/network/live accounts/tools/external inference.
async function fixture(t){
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'df-ni5-byte-positive-'));chmodSync(dir,0o700);const data=join(dir,'data'),environment=join(dir,'environment');mkdirSync(data,{mode:0o700});mkdirSync(environment,{mode:0o700});
 const key=Buffer.alloc(32,71);const ctx=new Context(),baseUrl=new URL('../',import.meta.url).href;ctx.baseUrl=baseUrl;ctx.logger.exporters?.clear?.();ctx.provide('profileContext',{dir,name:'ni5-byte-positive-synthetic'});
 const install=async(plugin,config)=>{const fiber=ctx.plugin(plugin,config);await fiber;assert.equal(fiber.state,2);return fiber;};
 t.after(async()=>{try{await ctx.fiber.dispose();}finally{key.fill(0);rmSync(dir,{recursive:true,force:true});}});
 // Public Service constructor registers the service. Never activate a class plugin:
 // activation would invoke WebServer lifecycle and allocate an HTTP server.
 const server=new WebServer(ctx,{host:'127.0.0.1',port:0,compression:'none'});
 assert.equal(server.server,undefined);assert.equal(server.listenedPort,undefined);
 new HostConnectionService(ctx,[],{isAuthenticated:req=>req.headers['x-synthetic-auth']==='approved'});
 let streams=0;ctx.on('llm/stream',(_options,next)=>{streams++;assert.ok(streams<=2,'bounded original stream budget');return next();});
 await install(Projections);await install(Sessions);await install(Approval,{policy:'never'});await install(AgentRegistry);await install(LlmRuntime);await install(Prompt,{});await install(Tools,{});await install(Loader,{baseUrl});
 const entry=async(name,config)=>{const id=await ctx.loader.create({name,config});await ctx.loader.await();const e=ctx.loader.resolve(id);assert.equal(e.fiber.state,2);return e;};
 const directory=join(data,'df-sessions');await entry('@deepseek-ai/dsh-session-persistence-jsonl',{root:directory,compression:'none'});await entry('@deepseek-ai/dsh-agent-loop',{agents:[],maxParallelToolCalls:1});await install(Presets,{default:'ni3-empty'});await ctx.agentPresets.register({id:'ni3-empty',plugins:[]});await entry('dsh-fishball/testing-provider',{});
 const selection=model=>({provider:'df-testing-local',model,agentPreset:'ni3-empty',reasoningEffort:'deterministic',maxOutputTokens:model==='df-testing-worker-v1'?128:4096});
 const worker={enabled:true,selection:selection('df-testing-worker-v1'),environment:{root:environment,cwd:environment},persistence:{directory,compression:'none',retention:'owner-managed'},bounds:{requestBytes:131072,resultBytes:4096},policy:{maxRuntimeMs:60000,maxUsageUnits:600000,maxCostEstimateMicros:0},charges:{runtimeMs:1000,usageUnits:135168},previewTtlMs:60000,grantTtlMs:60000};
 const audit={enabled:true,inputByteLimit:65536,resultByteLimit:4096,maxPrivateReviewers:1,blockingSeverities:['blocking','fatal'],maxRepairRounds:0,maxTotalAttempts:4,review:{selection:selection(BYTE_REVIEW_MODEL),charges:{runtimeMs:1000,usageUnits:135168}}};
 const identity={ownerId:'ni5-byte-positive-owner',workspaceId:'ni5-byte-positive-workspace'},profile={dir,name:'ni5-byte-positive-synthetic'};
 await install(createRuntimePlugin({identity:()=>identity,encryptionKey:()=>Buffer.from(key),memory:{namespaceRef:hash('ni5-byte-memory'),tokenize:text=>Buffer.byteLength(text),byteLimit:65536,tokenLimit:131072},...createInstalledWorker({selection:worker,auditSelection:audit,identity,profile}),...createInstalledAudit({selection:audit,worker,identity,profile}),...createInstalledResults({selection:{enabled:true,route:'local_dsh',admission:{units:1,runtimeMs:1000,usageUnits:135168}},identity,profile}),installedAuditSelection:audit,installedWorkerSelection:worker}),{databasePath:join(data,'runtime.sqlite'),limits:{maxMetadataBytes:4096}});
 let serial=0;const command=()=>hash('ni5-byte-command-'+(++serial));
 async function wire(name,payload={}){const method='v1/'+name,envelope={type:'client-request',rpcId:'ni5-byte-fixture-'+serial,method,payload},req=Readable.from([Buffer.from(JSON.stringify(envelope))]);Object.assign(req,{method:'POST',url:'/df-rpc/'+method,headers:{host:'127.0.0.1:0',origin:'http://127.0.0.1:0','content-type':'application/json','x-synthetic-auth':'approved'}});const response=new Response();await server.prefixes.get('/df-rpc').handler(req,response);assert.equal(response.statusCode,200);const result=JSON.parse(Buffer.concat(response.parts).toString()).result;return result;}
 async function call(name,payload={}){const result=await wire(name,payload);assert.equal(result.ok,true,name+': '+JSON.stringify(result.error));return result.value;}
 const intake=await call('intake',{taskId:'ni5-byte-positive-task',provider:'fixture',source:'local',eventId:'one',commandRef:command(),goal:BYTE_REVIEW_GOAL}),taskRef=intake.task.taskRef;
 const task=async()=>(await call('status',{taskRef})).task,cas=async()=>{const t=await task();return{taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch};};
 return{ctx,server,call,wire,command,taskRef,task,cas,directory,dir,data,streamCount:()=>streams};
}
const leafFact = directory => { const s = lstatSync(directory); return { dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode & 0o777 }; };
// Independently read the real original backend after each stream and again
// after finish. These are read handles, never session recreation or replay.
async function persisted(f, worker, executionRef, sourceKind) {
  const id = 'df-' + worker.generationRef, stat = await f.ctx.sessionPersistence.stat(id);
  assert.ok(stat && stat.sizeBytes > 0 && stat.sizeBytes <= 1048576);
  const read = await f.ctx.sessionPersistence.open(id, 'read');
  try {
    assert.equal(read.id, id); assert.equal(read.header.id, id);
    assert.equal(read.access, 'read'); assert.equal(read.header.isSeeded, false); assert.equal(read.inheritedEventCount, 0);
    const log = await read.read(0, 128), events = log.events;
    assert.deepEqual(events.map(e => e.seq), events.map((_, i) => i));
    const users = events.filter(e => e.type === 'user/message'), answers = events.filter(e => e.type === 'assistant/message');
    const starts = events.filter(e => e.type === 'turn/start'), ends = events.filter(e => e.type === 'turn/end');
    assert.equal(users.length, 1); assert.equal(answers.length, 1); assert.equal(starts.length, 1); assert.equal(ends.length, 1);
    assert.equal(ends[0].data.turn, starts[0].data.turn); assert.ok(ends[0].seq > answers[0].seq);
    assert.equal(users[0].data.id, executionRef); assert.equal(users[0].data.source.kind, sourceKind);
    assert.equal(events.some(e => ['tool/result', 'developer/message', 'assistant/attempt'].includes(e.type)), false);
    const content = answers[0].data.message.content;
    assert.equal(content.length, 1); assert.equal(content[0].type, 'text');
    const usage = answers[0].data.usage;
    assert.ok(Number.isSafeInteger(usage.inputTokens) && usage.inputTokens > 0);
    assert.equal(usage.outputTokens, Buffer.byteLength(content[0].text));
    assert.equal(usage.totalTokens, usage.inputTokens + usage.outputTokens); assert.ok(usage.totalTokens <= 135168);
    return { content: content[0].text, input: users[0].data.content[0].text, usage, digest: hash(content[0].text) };
  } finally { await read.close(); }
}

// Generated only by the future genuine public chain. The approved audit input
// is retained verbatim for later pure recipe cases; these bytes cannot mint a
// native origin. Never overwrite an earlier capture or emit its contents.
function retainApprovedInput(input, log, collected, artifact) {
  assert.equal(hash(log.input), input.digest);
  const body = JSON.parse(log.input);
  assert.equal(body.contractVersion, 'df.audit-input/v1');
  const directory = new URL('../fixture-data/approved-' + input.digest + '/', import.meta.url);
  mkdirSync(new URL('../fixture-data/', import.meta.url), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  const target = new URL('approved-audit-input-v1.json', directory);
  writeFileSync(target, log.input, { flag: 'wx', mode: 0o400 });
  writeFileSync(new URL('capture-metadata.json', directory), JSON.stringify({
    contractVersion: 'df.synthetic-approved-input-capture/v1',
    syntheticOnly: true, nativeAuthorityForClones: false,
    sourceClosure: 'byte-review-source-closure.json',
    input: { recordRef: input.recordRef, digest: input.digest, byteLength: Buffer.byteLength(log.input) },
    selectedModel: BYTE_REVIEW_MODEL,
    nativeResult: collected.report.native,
    artifact: { artifactRef: artifact.artifactRef, version: artifact.version, recordRef: artifact.recordRef, digest: artifact.digest },
    uses: ['later-pure-byte-recipe-tests'],
  }, null, 2) + '\n', { flag: 'wx', mode: 0o400 });
  chmodSync(directory, 0o500);
}

test('BP01 genuine selected byte review publishes once; lost outward ack remains uncertain and query never resends', async t => {
  const f = await fixture(t);
  assert.equal(lstatSync(f.dir).mode & 0o777, 0o700);
  assert.equal(lstatSync(f.data).mode & 0o777, 0o700);
  assert.equal(lstatSync(join(f.data, 'runtime.sqlite')).mode & 0o777, 0o600);
  assert.equal(existsSync(f.directory), false);
  assert.equal(f.streamCount(), 0);
  const catalog = await f.call('workerCatalog');
  const policy = await f.call('workerPolicyPreview', { expectedPolicyVersion: catalog.status.policyVersion });
  assert.equal(policy.description.limits.maxTotalAttempts, 4);
  assert.equal(policy.description.limits.maxAttempts, 1);
  assert.equal(policy.description.limits.maxUsageUnits, 600000);
  assert.equal(policy.description.limits.maxRuntimeMs, 60000);
  assert.equal(policy.description.limits.maxCostEstimateMicros, 0);
  assert.deepEqual(Object.keys(policy.description.auditRoles), ['review']);
  const confirmed = await f.call('workerPolicyConfirm', {
    previewRef: policy.previewRef, planDigest: policy.planDigest, commandRef: f.command(),
    expectedPolicyVersion: policy.expectedPolicyVersion, accept: true,
  });
  assert.equal(existsSync(f.directory), false, 'policy confirmation allocates no native session');

  // Before any producer plan, the original context snapshots a queued task,
  // the exact byte goal, no memory facts and empty original work arrays.
  const context = await f.call('prepareContext', { ...await f.cas(), terms: [], now: Date.now() });
  const contextDetail = await f.call('detail', {
    taskRef: f.taskRef, recordRef: context.recordRef,
    expectedTaskVersion: (await f.task()).version, expectedAuthEpoch: (await f.task()).authEpoch,
  });
  assert.equal(hash(contextDetail.data.content), context.digest);
  const plan = await f.call('workerPlan', { ...await f.cas(), contextRecordRef: context.recordRef });
  const beforeProducer = await f.task();
  const preview = await f.call('workerPreview', {
    taskRef: f.taskRef, actionRef: plan.actionRef, actionDigest: plan.actionDigest,
    recordRef: context.recordRef, expectedTaskVersion: beforeProducer.version, expectedAuthEpoch: beforeProducer.authEpoch,
  });
  assert.equal(preview.description.data.content, contextDetail.data.content);
  assert.equal(preview.description.data.digest, context.digest);
  await f.call('workerGrant', {
    ...await f.cas(), actionRef: plan.actionRef, actionDigest: plan.actionDigest,
    expiresAt: Date.now() + 30000, previewRef: preview.previewRef, accept: true,
  });
  const producer = await f.call('workerCreate', { ...await f.cas(), actionRef: plan.actionRef, actionDigest: plan.actionDigest });
  assert.equal(producer.worker.phase, 'ready');
  assert.equal(f.ctx.agents.get('df-' + producer.worker.generationRef).status, 'idle');
  const leaf = leafFact(f.directory);
  assert.equal(leaf.mode, 0o700); assert.equal(leaf.uid, process.getuid());
  const producerMapping = {
    actionRef: plan.actionRef, actionDigest: plan.actionDigest,
    claimRef: producer.worker.claimRef, generationRef: producer.worker.generationRef,
  };
  const execution = await f.call('workerExecute', { ...await f.cas(), ...producerMapping, contextRecordRef: context.recordRef });
  assert.equal(execution.execution.state, 'committed'); assert.equal(f.streamCount(), 1);
  const producerLog = await persisted(f, producer.worker, execution.execution.executionRef, 'df-context');
  assert.equal(producerLog.input, contextDetail.data.content);
  assert.equal(producerLog.content, `Synthetic local result; approved input SHA-256: ${context.digest}.`);
  assert.equal(Buffer.byteLength(producerLog.content), 113);
  assert.equal(execution.execution.resultDigest, producerLog.digest);
  assert.equal(execution.execution.usage.state, 'actual');
  assert.equal(execution.execution.usage.units, producerLog.usage.totalTokens);
  const { actionDigest: producerActionDigest, ...producerClosed } = producerMapping;
  const artifact = await f.call('workerCapture', { ...await f.cas(), ...producerClosed, executionRef: execution.execution.executionRef });
  const producerFinish = await f.call('workerFinish', { ...await f.cas(), ...producerClosed, executionRef: execution.execution.executionRef });
  assert.equal(producerFinish.reservationHeld, false); assert.equal(producerFinish.outcome, 'completed');
  assert.deepEqual(await persisted(f, producer.worker, execution.execution.executionRef, 'df-context'), producerLog);
  const material = await f.call('readLocalResult', { taskRef: f.taskRef, artifactRef: artifact.artifactRef, version: artifact.version, digest: artifact.digest });
  assert.equal(hash(material.data.content), artifact.digest);
  assert.equal(Buffer.byteLength(material.data.content), material.data.byteLength);
  const envelope = JSON.parse(material.data.content);
  assert.deepEqual(Object.keys(envelope).sort(), ['content', 'contractVersion', 'source']);
  assert.equal(envelope.contractVersion, 'df.native-result/v1');
  assert.deepEqual(Object.keys(envelope.source).sort(), ['actionDigest', 'actionRef', 'claimRef', 'cursor', 'executionRef', 'generationRef', 'inputDigest', 'resultDigest', 'sessionRef', 'taskRef']);
  assert.equal(envelope.content, producerLog.content);
  assert.equal(envelope.source.taskRef, f.taskRef);
  assert.equal(envelope.source.actionRef, plan.actionRef); assert.equal(envelope.source.actionDigest, producerActionDigest);
  assert.equal(envelope.source.claimRef, producer.worker.claimRef); assert.equal(envelope.source.generationRef, producer.worker.generationRef);
  assert.equal(envelope.source.sessionRef, producer.worker.sessionRef); assert.equal(envelope.source.executionRef, execution.execution.executionRef);
  assert.equal(envelope.source.inputDigest, context.digest); assert.equal(envelope.source.resultDigest, producerLog.digest);
  assert.ok(Number.isSafeInteger(envelope.source.cursor) && envelope.source.cursor >= 0 && envelope.source.cursor <= 127);
  assert.notEqual(artifact.digest, producerLog.digest, 'artifact digest covers the full original envelope');

  const originalSnapshot = await f.call('status', { taskRef: f.taskRef });
  const goals = originalSnapshot.data.filter(d => d.kind === 'goal'); assert.equal(goals.length, 1);
  const goal = goals[0], auditRef = f.command();
  const requirement = await f.call('configureAudit', {
    ...await f.cas(), auditRef, expectedAuditRevision: 0, artifactRef: artifact.artifactRef,
    artifactVersion: artifact.version, digest: artifact.digest, contextRecordRef: context.recordRef,
    material: [{ recordRef: artifact.recordRef, digest: artifact.digest }, { recordRef: context.recordRef, digest: context.digest }, { recordRef: goal.recordRef, digest: goal.digest }],
  });
  const input = await f.call('prepareAuditInput', {
    ...await f.cas(), auditRef, expectedAuditRevision: requirement.auditRevision, purpose: 'audit_review', round: 0,
  });
  const reviewPlan = await f.call('planAuditAction', { ...await f.cas(), auditRef, inputRecordRef: input.recordRef, purpose: 'audit_review' });
  const beforeReview = await f.task();
  const reviewPreview = await f.call('auditPreview', {
    taskRef: f.taskRef, actionRef: reviewPlan.actionRef, actionDigest: reviewPlan.actionDigest,
    recordRef: input.recordRef, expectedTaskVersion: beforeReview.version, expectedAuthEpoch: beforeReview.authEpoch,
  });
  assert.equal(reviewPreview.description.data.digest, input.digest);
  assert.equal(reviewPreview.description.model.model, BYTE_REVIEW_MODEL);
  const approvedBytes = reviewPreview.description.data.content;
  assert.equal(hash(approvedBytes), input.digest);
  const approved = JSON.parse(approvedBytes);
  assert.equal(approved.material.length, 3);
  assert.equal(approved.material.find(m => m.recordRef === artifact.recordRef).content, material.data.content);
  assert.equal(approved.material.find(m => m.recordRef === context.recordRef).content, contextDetail.data.content);
  assert.equal(approved.material.find(m => m.recordRef === goal.recordRef).content, BYTE_REVIEW_GOAL);
  await f.call('auditGrant', {
    ...await f.cas(), actionRef: reviewPlan.actionRef, actionDigest: reviewPlan.actionDigest,
    previewRef: reviewPreview.previewRef, expiresAt: Date.now() + 30000, accept: true,
  });
  const reviewer = await f.call('dispatchAudit', { ...await f.cas(), actionRef: reviewPlan.actionRef, actionDigest: reviewPlan.actionDigest });
  assert.notEqual(reviewer.generationRef, producer.worker.generationRef); assert.notEqual(reviewer.sessionRef, producer.worker.sessionRef);
  const reviewMapping = { actionRef: reviewPlan.actionRef, actionDigest: reviewPlan.actionDigest, claimRef: reviewer.claimRef, generationRef: reviewer.generationRef };
  const reviewed = await f.call('executeAudit', { ...await f.cas(), ...reviewMapping, inputRecordRef: input.recordRef });
  assert.equal(reviewed.state, 'committed'); assert.equal(f.streamCount(), 2);
  const reviewerLog = await persisted(f, reviewer, reviewed.executionRef, 'df-audit-input');
  assert.equal(reviewerLog.input, approvedBytes); assert.equal(hash(reviewerLog.input), input.digest);
  const { actionDigest: ignoredReviewDigest, ...reviewClosed } = reviewMapping;
  const collected = await f.call('collectAuditResult', { ...await f.cas(), ...reviewClosed, executionRef: reviewed.executionRef });
  assert.equal(collected.report.verdict, 'passed');
  const covered = approved.material.map(m => m.recordRef).sort();
  assert.deepEqual([...collected.report.coverageRefs].sort(), covered);
  assert.deepEqual(collected.report.unexaminedRefs, []); assert.deepEqual(collected.report.findings, []);
  const response = JSON.parse(reviewerLog.content);
  assert.equal(response.verdict, 'passed'); assert.deepEqual([...response.coverageRefs].sort(), covered);
  assert.deepEqual(response.unexaminedRefs, []); assert.deepEqual(response.findings, []);
  assert.ok(collected.report.native.resultRef);
  const finish = await f.call('auditFinish', { ...await f.cas(), ...reviewClosed, executionRef: reviewed.executionRef });
  assert.equal(finish.reservationHeld, false); assert.equal(finish.outcome, 'completed');
  assert.deepEqual(await persisted(f, reviewer, reviewed.executionRef, 'df-audit-input'), reviewerLog);
  const verified = await f.call('readLocalResult', { taskRef: f.taskRef, artifactRef: artifact.artifactRef, version: artifact.version, digest: artifact.digest });
  assert.equal(verified.data.content, material.data.content);
  assert.equal(verified.artifact.verificationBinding.source, 'native'); assert.equal(verified.artifact.verificationBinding.verdict, 'accepted');
  assert.equal(verified.artifact.verificationBinding.resultRef, collected.report.native.resultRef);
  assert.equal(verified.artifact.verificationBinding.generationRef, reviewer.generationRef);

  const deliveryRef = f.command();
  await f.call('acceptLocalDelivery', { ...await f.cas(), deliveryRef, artifactRef: artifact.artifactRef, artifactVersion: artifact.version, digest: artifact.digest });
  const publicationPlan = await f.call('planLocalDelivery', { ...await f.cas(), deliveryRef });
  const beforePublication = await f.task();
  const publicationPreview = await f.call('localDeliveryPreview', {
    taskRef: f.taskRef, actionRef: publicationPlan.actionRef, actionDigest: publicationPlan.actionDigest,
    recordRef: artifact.recordRef, expectedTaskVersion: beforePublication.version, expectedAuthEpoch: beforePublication.authEpoch,
  });
  assert.equal(publicationPreview.description.data.content, material.data.content);
  assert.equal(publicationPreview.description.data.digest, artifact.digest);
  assert.deepEqual(publicationPreview.description.toolNames, []);
  // Explicit acceptance is this separate exact-preview grant operation; the
  // original local grant contract has no caller-defined `accept` field.
  await f.call('localDeliveryGrant', {
    ...await f.cas(), actionRef: publicationPlan.actionRef, actionDigest: publicationPlan.actionDigest,
    previewRef: publicationPreview.previewRef, expiresAt: Date.now() + 30000,
  });
  let detail = await f.call('status', { taskRef: f.taskRef });
  const parent = { getSnapshot: () => ({ phase: 'ready', stale: false, selected: f.taskRef, detail }), subscribe: () => () => {},
    async refresh() { detail = await f.call('status', { taskRef: f.taskRef }); }, async select(ref) { assert.equal(ref, f.taskRef); } };
  const require = createRequire(import.meta.url);
  const client = require('../src/client-entry.cjs')(name => { assert.equal(name, 'react'); return { createElement() {} }; });
  let dispatchCalls = 0, queryCalls = 0, committedAck;
  const model = client.createNormalModel({ async call(channel, endpoint, payload) {
    assert.equal(channel, '/df-rpc'); const name = endpoint.slice(3);
    if (name === 'dispatchLocalDelivery') dispatchCalls++;
    if (name === 'localDeliveryQuery') queryCalls++;
    const reply = await f.wire(name, payload);
    if (name === 'dispatchLocalDelivery') {
      assert.equal(reply.ok, true); assert.equal(reply.value.dispatched, true); assert.equal(reply.value.delivery.state, 'sent');
      committedAck = reply.value;
      // Drop only this completed outward reply. Do not interrupt the recipient,
      // alter the ledger, fabricate an unknown core outcome or replay a write.
      throw new Error('SYNTHETIC_OUTWARD_ACK_LOST');
    }
    return reply;
  } }, parent, { uuid: () => 'ni5-byte-publication-command', digest: async text => hash(text) });
  t.after(() => model.dispose());
  const dispatchInput = { deliveryRef, actionRef: publicationPlan.actionRef, actionDigest: publicationPlan.actionDigest };
  assert.equal(await model.run('dispatchLocalDelivery', dispatchInput, { cas: true }), false);
  assert.equal(dispatchCalls, 1); assert.equal(committedAck.dispatched, true);
  const uncertain = model.getSnapshot().uncertain;
  assert.equal(uncertain.operation, 'dispatchLocalDelivery');
  assert.equal(uncertain.input.deliveryRef, deliveryRef); assert.equal(uncertain.input.actionDigest, publicationPlan.actionDigest);
  assert.equal(await model.run('dispatchLocalDelivery', dispatchInput, { cas: true }), false);
  assert.equal(dispatchCalls, 1, 'uncertainty blocks a second write before RPC');
  await parent.refresh();
  const publishedBeforeQuery = await f.call('localResultsStatus', { taskRef: f.taskRef });
  assert.equal(publishedBeforeQuery.publications.length, 1); assert.equal(publishedBeforeQuery.publications[0].deliveryRef, deliveryRef);
  assert.equal(publishedBeforeQuery.publications[0].state, 'sent'); assert.equal(publishedBeforeQuery.opening, 'unknown');
  const ledgerBeforeQuery = await f.call('status', { taskRef: f.taskRef });
  assert.equal(await model.run('localDeliveryQuery', { taskRef: f.taskRef, deliveryRef }), true);
  assert.equal(queryCalls, 1); assert.equal(dispatchCalls, 1);
  const query = model.getSnapshot().reply.value;
  assert.equal(query.state, 'sent'); assert.equal(query.permissionState, 'granted'); assert.equal(query.openability, 'unknown');
  assert.equal(query.artifactRef, artifact.artifactRef); assert.equal(query.digest, artifact.digest);
  assert.deepEqual(model.getSnapshot().uncertain, uncertain, 'a read never clears unresolved write acknowledgement');
  const { observedAt: beforeClock, ...ledgerBefore } = ledgerBeforeQuery;
  const { observedAt: afterClock, ...ledgerAfter } = await f.call('status', { taskRef: f.taskRef });
  assert.ok(afterClock >= beforeClock);
  assert.deepEqual(ledgerAfter, ledgerBefore, 'read-only query leaves durable records unchanged; observed clock may advance');
  assert.equal(await model.run('localResultsStatus', { taskRef: f.taskRef }), true);
  assert.deepEqual(model.getSnapshot().results.publications, publishedBeforeQuery.publications);
  const final = await f.call('status', { taskRef: f.taskRef });
  assert.equal(final.deliveries.length, 1); assert.equal(final.deliveries[0].state, 'sent');
  assert.equal(final.actions.length, 3);
  assert.equal(final.actions.reduce((n, a) => n + a.spec.charges.usageUnits, 0), 405504);
  assert.equal(final.actions.reduce((n, a) => n + a.spec.charges.runtimeMs, 0), 3000);
  assert.equal(final.actions.reduce((n, a) => n + a.spec.charges.costEstimateMicros, 0), 0);
  assert.equal(final.policy.limits.maxUsageUnits, 600000); assert.equal(final.policy.limits.maxRuntimeMs, 60000);
  assert.equal(final.policy.version, confirmed.policyVersion);
  assert.equal(f.streamCount(), 2); assert.equal((await f.ctx.sessionPersistence.list()).length, 2);
  assert.deepEqual(f.ctx.tools.schemas(), []); assert.deepEqual(leafFact(f.directory), leaf);
  assert.equal(f.server.server, undefined); assert.equal(f.server.listenedPort, undefined);
  assert.deepEqual(final.notifications, []); assert.deepEqual(final.notificationFacts, []);
  assert.notEqual(final.task.status, 'completed', 'byte equality does not complete the task or product acceptance');
  retainApprovedInput(input, reviewerLog, collected, artifact);
});

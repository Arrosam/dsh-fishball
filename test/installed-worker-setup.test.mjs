import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,rmSync,existsSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable,Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import * as Installed from '../src/installed-plugin.mjs';
import { resolveHostSource } from '../src/host-probe.mjs';
import { FixtureCredentialProvider } from '../scripts/runtime-web-credentials.mjs';
import { reference,canonicalDigest } from '../src/runtime-store.mjs';
const load=name=>import(pathToFileURL(resolveHostSource('@deepseek-ai/'+name)).href);
const {Context}=await load('cordis'),{WebServer}=await load('dsh-host-webserver'),{default:Sessions}=await load('dsh-session'),{default:Approval}=await load('dsh-user-approval'),{Loader}=await load('cordis-plugin-loader');
class Response extends Writable{parts=[];_write(chunk,encoding,done){this.parts.push(Buffer.from(chunk));done();}writeHead(status,headers){this.status=status;this.headers=headers;}}
async function fixture(t,{enabled=true}={}){
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'df-ni2-setup-')),ctx=new Context();ctx.logger.exporters.clear();let server;
 t.after(async()=>{await ctx.fiber.dispose();rmSync(dir,{recursive:true,force:true});});
 await ctx.plugin({apply(c){server=new WebServer(c,{host:'127.0.0.1',port:3080,compression:'none'});}});assert.equal(server.server,undefined);
 await ctx.plugin({apply(c){new FixtureCredentialProvider(c,join(dir,'synthetic-auth.json'));c.provide('profileContext',Object.freeze({dir,name:'synthetic-ni2-setup',builtin:false,installAnchor:dir}));}});
 await ctx.plugin(Sessions);await ctx.plugin(Approval,{policy:'never'});await ctx.plugin(Loader);
 const id=await ctx.loader.create({name:resolveHostSource('@deepseek-ai/dsh-client-connection'),inject:['webServer'],config:{trustedHosts:[]}});await ctx.loader.await();await ctx.loader.resolve(id).fiber.await();
 const url=new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080'));let cookie;
 ctx.connection.authorizeIndex({method:'GET',url:url.pathname+url.search,headers:{host:url.host}},{writeHead(status,headers){assert.equal(status,303);cookie=headers['set-cookie'].split(';')[0];},end(){}});
 const worker={enabled:true,selection:{provider:'df-testing-local',model:'df-testing-worker-v1',agentPreset:'empty',reasoningEffort:null,maxOutputTokens:128},environment:{root:dir,cwd:dir},persistence:{directory:join(dir,'df/df-sessions'),compression:'none',retention:'owner-managed'},bounds:{requestBytes:8192,resultBytes:128},policy:{maxRuntimeMs:10000,maxUsageUnits:20000,maxCostEstimateMicros:0},charges:{runtimeMs:1000,usageUnits:8320},previewTtlMs:30000,grantTtlMs:60000};
 const databasePath=join(dir,'df/runtime.sqlite'),fiber=ctx.plugin(Installed,{databasePath,limits:{maxMetadataBytes:4096},...(enabled?{memory:{enabled:true,byteLimit:65536,tokenLimit:8192},worker}:{})});await fiber;
 let requestIndex=0;const send=async(channel,method,payload={},headers={},borrowed)=>{const request=Readable.from([Buffer.from(JSON.stringify({type:'client-request',rpcId:'synthetic-ni2-setup-'+(++requestIndex),method:'v1/'+method,payload}))]);Object.assign(request,{method:'POST',url:channel+'/v1/'+method,headers:{host:url.host,origin:url.origin,cookie,'content-type':'application/json',...headers}});const response=new Response(),route=borrowed??server.prefixes.get(channel);assert.ok(route);await route.handler(request,response);return{status:response.status,...(response.status===200?JSON.parse(Buffer.concat(response.parts).toString()).result:{})};};
 return{dir,ctx,server,worker,databasePath,fiber,send};
}
const confirm=preview=>({previewRef:preview.previewRef,planDigest:preview.planDigest,accept:true});
test('omitted normal worker cached route is closed disabled and causes zero setup/session work',async t=>{
 const f=await fixture(t,{enabled:false});for(let n=0;n<3;n++){const reply=await f.send('/df-setup','workerStatus');assert.equal(reply.ok,true);assert.deepEqual(reply.value,{enabled:false,phase:'disabled',reasonCode:null,configurationRef:null,policyVersion:null,selection:null,environment:null,persistence:null,bounds:null,accounting:null,pricing:'unknown',actionsEnabled:false});}
 assert.equal(existsSync(dirname(f.databasePath)),false);assert.equal(f.ctx.sessions.list().length,0);assert.equal((await f.send('/df-setup','workerStatus',{enabled:true})).error.code,'SETUP_INVALID_INPUT');
});
test('enabled cached worker status before consent displays choices/plaintext storage but does not resolve optional facts',async t=>{
 const f=await fixture(t);const before=(await f.send('/df-setup','workerStatus')).value;assert.equal(before.phase,'setup_required');assert.equal(before.reasonCode,'SETUP_REQUIRED');assert.equal(before.configurationRef,canonicalDigest(['df.installed-worker-config/v1',f.worker]));assert.equal(before.persistence.encrypted,false);assert.equal(before.persistence.retention,'owner-managed');assert.equal(before.pricing,'unknown');assert.equal(before.actionsEnabled,false);assert.equal(before.policyVersion,null);
 assert.equal(f.ctx.get('llm'),undefined);assert.equal(f.ctx.get('agentLoop'),undefined);assert.equal(existsSync(dirname(f.databasePath)),false);assert.equal(existsSync(f.worker.persistence.directory),false);assert.equal(f.ctx.sessions.list().length,0);
 const preview=(await f.send('/df-setup','prepare')).value;assert.equal((await f.send('/df-setup','workerStatus')).value.phase,'setup_required');assert.equal((await f.send('/df-setup','confirm',{...confirm(preview),accept:false})).error.code,'SETUP_CONFIRMATION_REQUIRED');assert.equal(existsSync(dirname(f.databasePath)),false);
});
test('actual original public owner auth and closed route reject anonymous and caller authority fields',async t=>{
 const f=await fixture(t);assert.equal((await f.send('/df-setup','workerStatus',{}, {cookie:undefined})).status,401);
 for(const payload of [{role:'owner'},{identity:'SYNTHETIC_PRIVATE_CANARY'},{profile:'SYNTHETIC_PRIVATE_CANARY'},{key:'SYNTHETIC_PRIVATE_CANARY'},{accept:true}]){const reply=await f.send('/df-setup','workerStatus',payload);assert.equal(reply.error.code,'SETUP_INVALID_INPUT');assert.equal(JSON.stringify(reply).includes('SYNTHETIC_PRIVATE_CANARY'),false);}
 assert.equal(existsSync(dirname(f.databasePath)),false);assert.equal(existsSync(f.worker.persistence.directory),false);
});
test('confirmed normal setup mounts lazy worker while missing optional services leave task/memory usable and native work unavailable',async t=>{
 const f=await fixture(t),pre=(await f.send('/df-setup','workerStatus')).value,preview=(await f.send('/df-setup','prepare')).value;
 assert.equal((await f.send('/df-setup','confirm',confirm(preview))).value.phase,'ready');const key=readFileSync(f.databasePath+'.df-setup/key.bin'),keyDigest=createHash('sha256').update(key).digest('hex');
 const status=(await f.send('/df-setup','workerStatus')).value;assert.equal(status.configurationRef,pre.configurationRef);assert.equal(status.phase,'needs_refresh');assert.equal(status.actionsEnabled,false);assert.equal(status.accounting,null);assert.equal(status.policyVersion,null);
 assert.equal((await f.send('/df-setup','features')).value.memory.ready,true);assert.equal((await f.send('/df-rpc','workerCatalog')).ok,false);
 const intake=await f.send('/df-rpc','intake',{taskId:'synthetic-ni2-setup-task',provider:'fixture',source:'synthetic',eventId:'one',commandRef:reference('setup-intake'),goal:'Synthetic setup task remains usable'});assert.equal(intake.ok,true);assert.equal((await f.send('/df-rpc','memoryRead')).ok,true);
 assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(f.worker.persistence.directory),false);assert.equal(createHash('sha256').update(readFileSync(f.databasePath+'.df-setup/key.bin')).digest('hex'),keyDigest);
});
test('normal parent disposal withdraws cached worker status and original child routes without worker creation',async t=>{
 const f=await fixture(t),preview=(await f.send('/df-setup','prepare')).value;await f.send('/df-setup','confirm',confirm(preview));const route=f.server.prefixes.get('/df-setup');await f.fiber.dispose();
 assert.equal(f.server.prefixes.has('/df-setup'),false);assert.equal(f.server.prefixes.has('/df-rpc'),false);const reply=await f.send('/df-setup','workerStatus',{}, {},route);assert.equal(reply.error.code,'SERVICE_DISPOSED');assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(f.worker.persistence.directory),false);assert.equal(existsSync(f.databasePath),true);
});

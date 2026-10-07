import test from 'node:test';
import assert from 'node:assert/strict';
import { hash, canonical, canonicalDigest } from '../src/runtime-security.mjs';
import { ROLE_PROMPTS, ROLE_MODELS, roleRecipe } from '../src/installed-role-recipes.mjs';
import { createAuditPhases } from '../src/installed-audit-phases.mjs';
const R=text=>hash(text);
const material=[{recordRef:R('z'),digest:hash('artifact'),kind:'artifact',content:'artifact'},{recordRef:R('a'),digest:hash('context'),kind:'context',content:'context'}].sort((a,b)=>a.recordRef.localeCompare(b.recordRef));
function body(purpose='audit_review'){return JSON.stringify({contractVersion:'df.audit-input/v1',purpose,responseContract:'df.audit-response/v1',bindingDigest:R('binding'),materialDigest:R('material'),material});}
test('source role recipes remain truthful unknown, exact repair119 and separate explicitly selected models',()=>{
 const content=body(),response=JSON.parse(roleRecipe('review',content));assert.deepEqual(response,{contractVersion:'df.audit-response/v1',bindingDigest:R('binding'),materialDigest:R('material'),inputDigest:hash(content),verdict:'unknown',coverageRefs:[],unexaminedRefs:material.map(m=>m.recordRef).sort(),findings:[]});assert.equal(roleRecipe('review',content),canonical(response));
 const repair=body('audit_repair'),text=roleRecipe('repair',repair);assert.equal(text,`Synthetic local repair; approved audit input SHA-256: ${hash(repair)}.`);assert.equal(Buffer.byteLength(text),119);assert.notEqual(ROLE_MODELS.review,ROLE_MODELS.repair);assert.match(ROLE_PROMPTS.review,/does not establish semantic review quality/);
 assert.throws(()=>roleRecipe('review',repair));assert.throws(()=>roleRecipe('repair',content));const bad=JSON.parse(content);bad.material[0].content='forged';assert.throws(()=>roleRecipe('review',JSON.stringify(bad)));
});
function fixture(role){
 const ownerRef=R('owner'),workspaceRef=R('workspace'),taskRef=R('task'),actionRef=R(role+'-action'),claimRef=R(role+'-claim'),generationRef=R(role+'-gen'),executionRef=R(role+'-exec'),sessionRef=R(role+'-session');
 const content=body(role==='review'?'audit_review':'audit_repair'),a={auditRef:R('audit'),auditRevision:1,round:role==='review'?0:1,semanticRevision:1,bindingDigest:R('binding'),materialDigest:R('material'),artifactRef:R('artifact'),artifactVersion:1,artifactDigest:R('artifact-content'),recordRef:R('input'),digest:hash(content),purpose:role==='review'?'audit_review':'audit_repair'};
 const spec={actionRef,role,executor:{sessionRef,generationRef}},actionDigest=canonicalDigest(spec),row={spec,actionDigest,pair:{association:a,data:{content}}};
 const outer={taskRef,actionRef,claimRef,generationRef,executionRef,commandRef:R('outer'),expectedTaskVersion:5,expectedAuthEpoch:0};
 const result={...a,taskRef,actionRef,actionDigest,claimRef,generationRef,executionRef,sessionRef,inputDigest:a.digest,dataDigest:a.artifactDigest,content:roleRecipe(role,content),cursor:4};result.digest=hash(result.content);
 const facts={executionRef,usageUnits:1000,evidenceRef:R('actual-evidence'),resultDigest:result.digest,inputCursor:1};
 const capture={...result,resultRef:executionRef,recordRef:R('captured-result'),state:'captured'};
 const counters={validate:0,capture:0,bind:0,submit:0,write:0},calls=[],receipts=new Map();let denyAfterWrite=false,owner=true;
 const phases=createAuditPhases({ownerRef,workspaceRef,check(){if(!owner)throw Error('OWNER_REVOKED');},planFor(){return row;},manager:()=>({async validateAuditResult(){counters.validate++;return{result,facts};},async captureValidatedAuditResult(input){counters.capture++;calls.push({phase:'capture',input});return capture;}}),bindReviewer(handle,input){counters.bind++;calls.push({phase:'bind',handle,input});},submit(handle,input){counters.submit++;calls.push({phase:'submit',handle,input});return{report:{verdict:'unknown'},verification:{verdict:'unknown'}};},writeArtifact(input){calls.push({phase:'write',input});if(receipts.has(input.commandRef))return receipts.get(input.commandRef);counters.write++;const out={...input,recordRef:R('written'),digest:hash(input.content)};receipts.set(input.commandRef,out);if(denyAfterWrite){denyAfterWrite=false;throw Error('ACK_LOST');}return out;}});
 const privateInput={operationRef:canonicalDigest(['df.installed-audit.collect-operation/v1',{ownerRef,workspaceRef,taskRef},outer]),artifactTarget:role==='repair'?{artifactRef:a.artifactRef,version:2}:null};
 return{phases,counters,calls,outer,privateInput,row,ownerRef,workspaceRef,setAckLost(){denyAfterWrite=true;},revoke(){owner=false;}};
}
test('typed source phases bind a fresh opaque reviewer and retain exact source capture/submission commands',async()=>{
 const f=fixture('review');f.phases.afterDispatch(f.outer,{worker:{...f.outer,actionDigest:f.row.actionDigest,sessionRef:f.row.spec.executor.sessionRef}});assert.equal(f.counters.bind,1);await f.phases.collect(f.outer,f.privateInput);assert.equal(f.counters.validate,1);assert.equal(f.counters.capture,1);assert.equal(f.counters.submit,1);assert.equal(f.counters.write,0);assert.ok(Object.isFrozen(f.calls[0].handle));
 const first=f.calls.find(c=>c.phase==='submit');await f.phases.collect(f.outer,f.privateInput);assert.equal(f.counters.validate,1);assert.equal(f.counters.capture,1);assert.deepEqual(f.calls.filter(c=>c.phase==='submit')[1].input,first.input);
 f.revoke();await assert.rejects(f.phases.collect(f.outer,f.privateInput),/OWNER_REVOKED/);
});
test('typed repair acknowledgement cut reconciles original fixed version and never recollects or recomputes child input',async()=>{
 const f=fixture('repair');f.setAckLost();await assert.rejects(f.phases.collect(f.outer,f.privateInput),/ACK_LOST/);const first=f.calls.find(c=>c.phase==='write').input;
 const current={...f.outer,commandRef:R('explicit-reconcile'),expectedTaskVersion:6};const p={...f.privateInput,operationRef:canonicalDigest(['df.installed-audit.collect-operation/v1',{ownerRef:f.ownerRef,workspaceRef:f.workspaceRef,taskRef:current.taskRef},current])};
 await f.phases.collect(current,p);assert.equal(f.counters.validate,1);assert.equal(f.counters.capture,1);assert.equal(f.counters.write,1);assert.equal(f.counters.bind,0);assert.equal(f.counters.submit,0);assert.deepEqual(f.calls.filter(c=>c.phase==='write')[1].input,first);assert.equal(first.version,2);assert.equal(first.expectedTaskVersion,5);assert.equal(Buffer.byteLength(first.content),119);
 const origin=f.phases.capturedRepairFacts({taskRef:current.taskRef,artifactRef:first.artifactRef,artifactVersion:2,digest:hash(first.content)});assert.equal(origin.producerClaimRef,current.claimRef);assert.equal(origin.resultDigest,hash(first.content));
});

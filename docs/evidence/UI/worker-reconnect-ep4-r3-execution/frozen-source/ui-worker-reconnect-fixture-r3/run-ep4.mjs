import assert from 'node:assert/strict';
import {caseIds,runExecutePreparationCase} from './controller-execute-preparation.mjs';

// ROOT-OWNED FUTURE ENTRY. Executing this file requires separate fixture review/GO.
// No subprocess, network, native service or paid inference. Stop after the first failed cell.
const results=[],started=performance.now();
let failed=false;
for (const caseId of caseIds) {
  if (failed) break;
  const remaining=120000-(performance.now()-started);
  if (remaining < 2000) { process.exitCode=1; failed=true; console.error(JSON.stringify({classification:'UNIT_ONLY',caseId,result:'NOT_RUN_WHOLE_DEADLINE'})); break; }
  const controller=new AbortController();
  // Reserve <=1500ms for explicit cleanup inside the 30s cell ceiling.
  const timer=setTimeout(()=>controller.abort(),Math.min(28000,remaining-2000));
  try {
    const result=await runExecutePreparationCase(caseId,controller.signal);
    results.push(result); console.log(JSON.stringify(result));
  } catch (error) {
    failed=true; process.exitCode=1;
    console.error(JSON.stringify({classification:'UNIT_ONLY',caseId,result:'FAILED_STOP_FIRST',errorName:error?.name??'Error',message:error?.message??'UNIT_ONLY_FAILURE',evidence:error?.unitEvidence??null}));
  } finally { clearTimeout(timer); }
}
if (!failed) {
  const sum=key=>results.reduce((n,result)=>n+result.counts[key],0);
  assert.equal(results.length,4); assert.equal(sum('S'),19); assert.equal(sum('P'),16); assert.equal(sum('E'),3); assert.equal(sum('C'),0); assert.equal(sum('R'),61);
  assert.ok(sum('S')<=20 && sum('R')<=128 && performance.now()-started<=120000);
  console.log(JSON.stringify({classification:'UNIT_ONLY_PUBLIC_MODEL',result:'EP4_UNIT_PASSED',cases:4,S:sum('S'),R:sum('R'),C:0,actualHostProof:false,nativeEffects:0,network:0,modelInference:0}));
}

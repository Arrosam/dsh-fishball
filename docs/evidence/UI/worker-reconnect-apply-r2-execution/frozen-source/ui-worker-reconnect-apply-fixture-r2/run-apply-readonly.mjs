import assert from 'node:assert/strict';
import {caseIds,runApplyReadonlyCase} from './controller-apply-readonly.mjs';

// Future root-owned execution entry; SOURCE-ONLY authoring does not authorize import/run.
const started=performance.now(),results=[];let failed=false;
for(const caseId of caseIds){
  if(failed)break;
  if(performance.now()-started>=120000){failed=true;process.exitCode=1;console.error(JSON.stringify({caseId,result:'NOT_RUN_WHOLE_DEADLINE',classification:'UNIT_ONLY'}));break;}
  const controller=new AbortController(),caseStarted=performance.now(),timer=setTimeout(()=>controller.abort(),1700);
  try{
    const result=await runApplyReadonlyCase(caseId,controller.signal);
    assert.ok(performance.now()-caseStarted<=2000,'ordinary readonly cell ceiling');results.push(result);console.log(JSON.stringify(result));
  }catch(error){failed=true;process.exitCode=1;console.error(JSON.stringify({classification:'UNIT_ONLY',caseId,result:'FAILED_STOP_FIRST',message:error?.message??'UNIT_ONLY_FAILURE',evidence:error?.unitEvidence??null}));}
  finally{clearTimeout(timer);}
}
if(!failed){
  assert.equal(results.length,11);assert.equal(results.reduce((n,row)=>n+row.counts.R,0),48);assert.equal(results.reduce((n,row)=>n+row.counts.M,0),0);
  console.log(JSON.stringify({classification:'UNIT_ONLY_UNCHANGED_APPLY_MODEL',result:'APPLY_UNIT_SUBPARTITIONS_PASSED',cells:11,R:48,M:0,actualOriginalServiceProof:false,actualRenderedUIProof:false,fullFamiliesAccepted:0}));
}

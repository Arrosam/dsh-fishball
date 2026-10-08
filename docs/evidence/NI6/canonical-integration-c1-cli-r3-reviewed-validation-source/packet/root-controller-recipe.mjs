// Inert root-owned functions recipe. Read/review source before a supported once selection.
// Root supplies the exact final pin map after all affected reports and actual approval.
// No candidate starts occur by reading this file. Paste the reviewed body into one owning functions call.
export async function runSelectedFamily(tools, approvedSelection) {
 const cwd='/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball';
 const base='.runtime/ni6-canonical-integration-c1/validation/cli-r3';
 const python='/opt/homebrew/bin/python3';
 const originalReturns=[];const retained=[];
 // Date is an advisory early-admission cut only; actual case/publication deadlines use the ONE Python monotonic plan.
 let controllerCode='PREPARE_FAILED',prepared=false,remaining=0,preparedAt=0,expectedPlanSha256=null,familyDeadlineMonotonic=null;
 const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
 function retain(caseName,r) {
  retained.push(r); // Retain original return immediately before interpretation.
  originalReturns.push({case:caseName,kind:'RETURN',chunkId:typeof r.chunk_id==='string'?r.chunk_id:null,
   sessionId:Number.isInteger(r.session_id)?r.session_id:null,exitCode:Number.isInteger(r.exit_code)?r.exit_code:null,
   outputBytes:new TextEncoder().encode(typeof r.output==='string'?r.output:'').length,
   wallTimeSeconds:typeof r.wall_time_seconds==='number'?r.wall_time_seconds:0});
 }
 function unavailable(caseName){originalReturns.push({case:caseName,kind:'TOOL_UNAVAILABLE',chunkId:null,sessionId:null,exitCode:null,outputBytes:0,wallTimeSeconds:0});}
 const command=(action,value)=>'printf %s '+quote(JSON.stringify(value))+' | '+python+' '+base+'/root-publication.py '+action;
 try {
  let r;
  try {r=await tools.exec_command({cmd:command('prepare',approvedSelection),workdir:cwd,yield_time_ms:1000,max_output_tokens:1000});retain('prepare',r);}
  catch {unavailable('prepare');controllerCode='TOOL_UNAVAILABLE';return;}
  // Preparation is bounded to10s; bounded administrative stdout contains only public deadline metadata.
  for(let n=0;r.session_id&&n<8;n++){r=await tools.write_stdin({session_id:r.session_id,chars:'',yield_time_ms:1000,max_output_tokens:1000});retain('prepare',r);}
  if(r.exit_code!==0||r.session_id)return;
  const prep=JSON.parse(retained.filter((_,i)=>originalReturns[i].case==='prepare').map(x=>x.output||'').join(''));
  if(prep.prepared!==true||typeof prep.familyRemainingSeconds!=='number'||prep.familyRemainingSeconds<=10||prep.familyRemainingSeconds>180)return;
  if(typeof prep.planSha256!=='string'||!(/^[a-f0-9]{64}$/).test(prep.planSha256)||typeof prep.familyDeadlineMonotonic!=='number')return;
  expectedPlanSha256=prep.planSha256;familyDeadlineMonotonic=prep.familyDeadlineMonotonic;
  prepared=true;remaining=prep.familyRemainingSeconds;preparedAt=Date.now();controllerCode='COMPLETE';
  for(const caseName of ['positive','disabled','invalid']){
   if(remaining-(Date.now()-preparedAt)/1000<=10){controllerCode='STOPPED';break;}
   try {
    r=await tools.exec_command({cmd:python+' '+base+'/lifecycle-driver.py .runtime/root-ni6-canonical-integration-c1-cli-r3-plan.json '+caseName,workdir:cwd,yield_time_ms:1000,max_output_tokens:1000});retain(caseName,r);
    // Poll the SAME original session. No retry/new process/signal after uncertain ownership.
    for(let n=0;r.session_id&&n<60;n++){
     r=await tools.write_stdin({session_id:r.session_id,chars:'',yield_time_ms:2000,max_output_tokens:1000});retain(caseName,r);
    }
   }catch{unavailable(caseName);controllerCode='TOOL_UNAVAILABLE';break;}
   if(r.exit_code!==0||r.session_id||originalReturns.filter(x=>x.case===caseName).some(x=>x.outputBytes!==0)){controllerCode='STOPPED';break;}
  }
 }catch{controllerCode='STOPPED';}
 finally {
  // Same owning script, before yielding to the model, including every failed path.
  // Publication itself creates no runtime child, listener, auth access or signal.
  let p;
  try{
   p=await tools.exec_command({cmd:command('publish',{originalToolReturns:originalReturns,controllerCode,expectedPlanSha256,familyDeadlineMonotonic}),workdir:cwd,yield_time_ms:1000,max_output_tokens:1000});
   const publicationOriginalReturns=[p];
   for(let n=0;p.session_id&&n<8;n++){p=await tools.write_stdin({session_id:p.session_id,chars:'',yield_time_ms:1000,max_output_tokens:1000});publicationOriginalReturns.push(p);}
   // Root retains these original returns and final proof seal/timing; no lifecycle promotion.
   return {controllerCode,prepared,originalReturns:retained,publicationOriginalReturns,
    publicProof:'docs/evidence/NI6/canonical-integration-c1-cli-r3-actual-return.json'};
  }catch{return {controllerCode,prepared,originalReturns:retained,publicationUnavailable:true};}
 }
}

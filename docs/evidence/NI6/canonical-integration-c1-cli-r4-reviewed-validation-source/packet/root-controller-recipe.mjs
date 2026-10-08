// Inert root-owned functions recipe. Read/review source before a supported once selection.
// Root supplies the exact final pin map after all affected reports and actual approval.
// No candidate starts occur by reading this file. Paste the reviewed body into one owning functions call.
export async function runSelectedFamily(tools, approvedSelection) {
 const cwd='/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball';
 const base='.runtime/ni6-canonical-integration-c1/validation/cli-r4';
 const python='/opt/homebrew/bin/python3';
 const originalReturns=[];const retained=[];
 // Date is an advisory early-admission cut only; actual case/publication deadlines use the ONE Python monotonic plan.
 let controllerCode='PREPARE_FAILED',prepared=false,remaining=0,preparedAt=0,expectedPlanSha256=null,familyDeadlineMonotonic=null;
 const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
 // Metadata only: ECMAScript code-unit counting; no encoder/global host API.
 function utf8ByteCount(s) {
  let bytes=0;
  for(let i=0;i<s.length;i++){
   const c=s.charCodeAt(i);
   if(c<0x80)bytes++;
   else if(c<0x800)bytes+=2;
   else if(c>=0xd800&&c<=0xdbff&&i+1<s.length&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}
   else bytes+=3; // BMP or standard replacement for an unpaired surrogate.
  }
  return bytes;
 }
 function metadataRegression(){
  // Eight fixed public literals only; future owning invocation, before prepare.
  const vectors=[['',0],['A\u007f',2],['\u0080\u07ff',4],['\u0800\uffff',6],
   ['\ud800\udc00',4],['\ud800',3],['\udc00',3],['A\u00e9\u4e2d\ud83d\ude00\ud800Z\udc00',17]];
  for(const[s,bytes]of vectors)if(utf8ByteCount(s)!==bytes)throw new Error();
 }
 function retain(caseName,r) {
  retained.push(r); // Retain original return immediately before interpretation.
  originalReturns.push({case:caseName,kind:'RETURN',chunkId:typeof r.chunk_id==='string'?r.chunk_id:null,
   sessionId:Number.isInteger(r.session_id)?r.session_id:null,exitCode:Number.isInteger(r.exit_code)?r.exit_code:null,
   outputBytes:utf8ByteCount(typeof r.output==='string'?r.output:''),
   wallTimeSeconds:typeof r.wall_time_seconds==='number'?r.wall_time_seconds:0});
 }
 function unavailable(caseName){originalReturns.push({case:caseName,kind:'TOOL_UNAVAILABLE',chunkId:null,sessionId:null,exitCode:null,outputBytes:0,wallTimeSeconds:0});}
 const command=(action,value)=>'printf %s '+quote(JSON.stringify(value))+' | '+python+' '+base+'/root-publication.py '+action;
 try {
  metadataRegression(); // Failure is CONTROLLER_METADATA_FAILED; zero new tools/private inputs.
  let r;
  const prepareArgs={cmd:command('prepare',approvedSelection),workdir:cwd,yield_time_ms:1000,max_output_tokens:1000};
  try {r=await tools.exec_command(prepareArgs);}
  catch {unavailable('prepare');controllerCode='TOOL_UNAVAILABLE';return;}
  retain('prepare',r);
  // Preparation is bounded to10s; bounded administrative stdout contains only public deadline metadata.
  for(let n=0;r.session_id&&n<8;n++){
   const pollArgs={session_id:r.session_id,chars:'',yield_time_ms:1000,max_output_tokens:1000};
   try{r=await tools.write_stdin(pollArgs);}catch{unavailable('prepare');controllerCode='TOOL_UNAVAILABLE';return;}
   retain('prepare',r);
  }
  if(r.exit_code!==0||r.session_id)return;
  const prep=JSON.parse(retained.filter((_,i)=>originalReturns[i].case==='prepare').map(x=>x.output||'').join(''));
  if(prep.prepared!==true||typeof prep.familyRemainingSeconds!=='number'||prep.familyRemainingSeconds<=10||prep.familyRemainingSeconds>180)return;
  if(typeof prep.planSha256!=='string'||!(/^[a-f0-9]{64}$/).test(prep.planSha256)||typeof prep.familyDeadlineMonotonic!=='number')return;
  expectedPlanSha256=prep.planSha256;familyDeadlineMonotonic=prep.familyDeadlineMonotonic;
  prepared=true;remaining=prep.familyRemainingSeconds;preparedAt=Date.now();controllerCode='COMPLETE';
  for(const caseName of ['positive','disabled','invalid']){
   if(remaining-(Date.now()-preparedAt)/1000<=10){controllerCode='STOPPED';break;}
   const caseArgs={cmd:python+' '+base+'/lifecycle-driver.py .runtime/root-ni6-canonical-integration-c1-cli-r4-plan.json '+caseName,workdir:cwd,yield_time_ms:1000,max_output_tokens:1000};
   try{r=await tools.exec_command(caseArgs);}catch{unavailable(caseName);controllerCode='TOOL_UNAVAILABLE';break;}
   retain(caseName,r);
   // Poll the SAME original session. No retry/new process/signal after uncertain ownership.
   for(let n=0;r.session_id&&n<60;n++){
    const pollArgs={session_id:r.session_id,chars:'',yield_time_ms:2000,max_output_tokens:1000};
    try{r=await tools.write_stdin(pollArgs);}catch{unavailable(caseName);controllerCode='TOOL_UNAVAILABLE';break;}
    retain(caseName,r);
   }
   if(controllerCode==='TOOL_UNAVAILABLE')break;
   if(r.exit_code!==0||r.session_id||originalReturns.filter(x=>x.case===caseName).some(x=>x.outputBytes!==0)){controllerCode='STOPPED';break;}
  }
 }catch{controllerCode='CONTROLLER_METADATA_FAILED';} // Never serialize caught error payloads.
 finally {
  // Same owning script, before yielding to the model, including every failed path.
  // Publication itself creates no runtime child, listener, auth access or signal.
  let p;const publicationOriginalReturns=[];
  try{
   const publishArgs={cmd:command('publish',{originalToolReturns:originalReturns,controllerCode,expectedPlanSha256,familyDeadlineMonotonic}),workdir:cwd,yield_time_ms:1000,max_output_tokens:1000};
   try{p=await tools.exec_command(publishArgs);}catch{return {controllerCode,prepared,originalReturns:retained,publicationOriginalReturns,publicationUnavailable:true};}
   publicationOriginalReturns.push(p); // Retain before interpreting publication metadata.
   for(let n=0;p.session_id&&n<8;n++){
    const pollArgs={session_id:p.session_id,chars:'',yield_time_ms:1000,max_output_tokens:1000};
    try{p=await tools.write_stdin(pollArgs);}catch{return {controllerCode,prepared,originalReturns:retained,publicationOriginalReturns,publicationUnavailable:true};}
    publicationOriginalReturns.push(p);
   }
   // Root retains these original returns and final proof seal/timing; no lifecycle promotion.
   return {controllerCode,prepared,originalReturns:retained,publicationOriginalReturns,
    publicProof:'docs/evidence/NI6/canonical-integration-c1-cli-r4-actual-return.json'};
  }catch{return {controllerCode:'CONTROLLER_METADATA_FAILED',prepared,originalReturns:retained,publicationOriginalReturns,publicationControllerFailed:true};}
 }
}

// PROPOSED SOURCE ONLY. Future root invocation ONLY after actual Mac/UI owner availability.
// The caller redirects both streams to NEW owner-only wx-equivalent private logs.
// No old launch URL or auth.yml is read; no token is printed or sent to any agent.
import {readFile,stat,realpath} from 'node:fs/promises';
import {internals} from '/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni2-install/host/node_modules/@deepseek-ai/dsh-web-app/lib/index.js';
const base='/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ui-qa-a58c522/';
const rollback=process.argv.length===3 && process.argv[2]==='--rollback';
if(process.argv.length!==(rollback?3:2))throw new Error('QA_BROWSER_ARGUMENT_INVALID');
if(process.execPath!=='/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node' || process.version!=='v22.22.2' || process.arch!=='arm64')throw new Error('QA_PINNED_NODE_REQUIRED');
const generation=rollback?'r2-rollback-1':'r2-successor-1';
try{
  const privateDirectory=base+'private';
  if(await realpath(privateDirectory)!==privateDirectory || ((await stat(privateDirectory)).mode&0o077))throw new Error();
  const accessPath=base+`private/fresh-native-access-${generation}.txt`;
  const accessStat=await stat(accessPath);
  if(await realpath(accessPath)!==accessPath || !accessStat.isFile() || (accessStat.mode&0o077) || accessStat.size>4096)throw new Error();
  const ready=JSON.parse(await readFile(base+`evidence/access-ready-${generation}.json`,'utf8'));
  if(ready.result!=='FRESH_PRIVATE_ACCESS_READY' || ready.generation!==generation || ready.host!=='127.0.0.1' || ready.port!==3080 || ready.privateAccessPath!==accessPath || ready.originalStartupAudit!==true || !Number.isSafeInteger(ready.originalCLIpid) || ready.originalCLIpid<1)throw new Error();
  // Root must first compare ready.originalCLIpid with its actual owned 3080 listener.
  const access=(await readFile(accessPath,'utf8')).trim();
  const url=new URL(access);
  if(url.origin!=='http://127.0.0.1:3080' || url.pathname!=='/' || [...url.searchParams.keys()].length!==1 || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('token')??''))throw new Error();
  await internals.openBrowser(access); // Original exported public callable, never replaced.
  console.log(JSON.stringify({result:'ORIGINAL_BROWSER_HANDOFF_COMPLETED',generation,frontendConnection:'NOT_OBSERVED',UIAcceptance:'NOT_RUN',criteria87:'HOLD'}));
}catch{
  console.error(JSON.stringify({result:'ORIGINAL_BROWSER_HANDOFF_FAILED',generation,credentialsPrinted:false,criteria87:'HOLD'}));
  process.exitCode=1;
}

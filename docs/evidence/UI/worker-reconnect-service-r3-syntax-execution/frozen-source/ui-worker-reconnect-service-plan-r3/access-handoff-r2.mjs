// PROPOSED SOURCE ONLY. Root-owned original host plugin, no listener/connection owner.
// Never reads credential records, database, sessions, old access URLs or CLI logs.
import {writeFile,realpath,stat} from 'node:fs/promises';
import {auditStartupEntries} from '/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni2-install/host/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js';
export const name='df-qa-private-access-handoff-r2';
export const inject=['connection','webServer'];
const base='/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ui-qa-a58c522/';
const generations=new Set(['r2-successor-1','r2-rollback-1']);
export function apply(ctx,config) {
  if(!config || Object.keys(config).length!==1 || !generations.has(config.generation))throw new Error('QA_HANDOFF_GENERATION_INVALID');
  const generation=config.generation;
  let alive=true;
  ctx.effect(()=>()=>{alive=false;},'QA r2 private handoff lifetime');
  const pending=ctx.get('loader')?.await();
  if(!pending)throw new Error('QA_LOADER_UNAVAILABLE');
  pending.then(async()=>{
    await auditStartupEntries(ctx.root,'dsh QA',()=>{});
    if(!alive || ctx.webServer.host!=='127.0.0.1' || ctx.webServer.port!==3080)throw new Error('QA_EXACT_BIND_UNAVAILABLE');
    const directory=base+'private';
    if(await realpath(directory)!==directory || ((await stat(directory)).mode&0o077))throw new Error('QA_PRIVATE_PATH_INVALID');
    const access=ctx.connection.authenticatedUrl('http://127.0.0.1:3080/');
    const url=new URL(access);
    if(url.origin!=='http://127.0.0.1:3080' || url.pathname!=='/' || [...url.searchParams.keys()].length!==1 || !url.searchParams.has('token'))throw new Error('QA_AUTH_HANDOFF_INVALID');
    const privateAccessPath=base+`private/fresh-native-access-${generation}.txt`;
    await writeFile(privateAccessPath,access+'\n',{flag:'wx',mode:0o600});
    if(!alive)throw new Error('QA_HANDOFF_DISPOSED');
    await writeFile(base+`evidence/access-ready-${generation}.json`,JSON.stringify({
      result:'FRESH_PRIVATE_ACCESS_READY',generation,originalCLIpid:process.pid,
      host:'127.0.0.1',port:3080,privateAccessPath,originalStartupAudit:true,
      authenticationBootstrapOnly:true,frontendConnection:'NOT_OBSERVED',UIAcceptance:'NOT_RUN',criteria87:'HOLD',
    })+'\n',{flag:'wx',mode:0o600});
  }).catch(()=>ctx.logger.error('QA_PRIVATE_ACCESS_HANDOFF_FAILED'));
}

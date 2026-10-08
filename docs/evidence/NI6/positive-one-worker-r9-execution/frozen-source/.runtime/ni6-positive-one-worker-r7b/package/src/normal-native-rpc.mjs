// Root inserts these named owner-only methods into the EXISTING scoped operator
// service; this module does not register a service, listener or alternate host.
import { exact } from './runtime-security.mjs';
import { runInstalledWorkerInvocation } from './installed-invocation.mjs';
import { immutable } from './installed-worker-facts.mjs';
import { BootstrapError } from './config.mjs';
const resumeNames=['workerResumeStatus','workerResumePrepare','workerResumePlan','workerResumePreview','workerResumeGrant','workerResume'];
export function createNormalNativeRpc({ctx,controls,ownerCommands,check}) {
  const operations={...Object.fromEntries(resumeNames.map(name=>[name,value=>controls[name](value)])),
    ownerNativeFinishCommands:value=>ownerCommands.list(value),ownerNativeFinishCommand:value=>ownerCommands.restore(value),
    ownerNativeFinish:value=>ownerCommands.finishNew(value)};
  return Object.freeze(Object.fromEntries(Object.entries(operations).map(([name,invoke])=>[name,(value,context)=>{
    exact(context,['assertCurrent']);if(typeof context.assertCurrent!=='function')throw new BootstrapError('SERVICE_DISPOSED');
    const input=immutable(value);return runInstalledWorkerInvocation(ctx,context.assertCurrent,async()=>{check();const out=await invoke(input);check();const detached=immutable(out);if(Buffer.byteLength(JSON.stringify({ok:true,value:detached}))>65536)throw new BootstrapError('OUTPUT_TOO_LARGE');check();return detached;});
  }])));
}

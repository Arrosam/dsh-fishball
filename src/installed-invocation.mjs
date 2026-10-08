import { AsyncLocalStorage } from 'node:async_hooks';
import { BootstrapError } from './config.mjs';

// Trusted installed composition only. No wire/config field carries this token.
const storage = new AsyncLocalStorage();
const carriers = new WeakMap();
const codes = new Set(['SERVICE_DISPOSED', 'OPERATOR_REQUIRED', 'REQUEST_ABORTED']);
const denied = code => { throw new BootstrapError(code); };
function guardCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && Object.hasOwn(descriptor, 'value') && codes.has(descriptor.value)
      ? descriptor.value : 'SERVICE_DISPOSED';
  } catch { return 'SERVICE_DISPOSED'; }
}
function record(ctx, token = storage.getStore()) {
  const current = token && carriers.get(token);
  if (!current) denied('SERVICE_DISPOSED');
  if (current.ctx !== ctx) current.denial ??= 'SERVICE_DISPOSED';
  if (current.denial) denied(current.denial);
  return current;
}
export function assertInstalledWorkerInvocation(ctx) {
  const current = record(ctx);
  try {
    if (current.assertCurrent() !== true) current.denial = 'SERVICE_DISPOSED';
  } catch (error) { current.denial = guardCode(error); }
  if (current.denial) denied(current.denial);
  return true;
}
export function captureInstalledWorkerInvocation(ctx) {
  assertInstalledWorkerInvocation(ctx);
  return storage.getStore();
}
export function withInstalledWorkerInvocation(ctx, token, callback) {
  record(ctx, token);
  return storage.run(token, () => {
    assertInstalledWorkerInvocation(ctx);
    return callback();
  });
}
export async function runInstalledWorkerInvocation(ctx, assertCurrent, callback) {
  if (!ctx || typeof ctx !== 'object' || typeof assertCurrent !== 'function' || typeof callback !== 'function') denied('SERVICE_DISPOSED');
  const token = Object.freeze({});
  carriers.set(token, { ctx, assertCurrent, denial: null });
  return storage.run(token, async () => {
    assertInstalledWorkerInvocation(ctx);
    try {
      const result = await callback();
      assertInstalledWorkerInvocation(ctx);
      return result;
    } catch (error) {
      // The exact denied carrier wins over manager/native error wrapping.
      // This assertion never replays the callback or a mutation.
      assertInstalledWorkerInvocation(ctx);
      throw error;
    }
  });
}
import { performance } from 'node:perf_hooks';

// R11 finite ordinary finish wait diagnostic. No carrier or data access.
export const FINISH_WAIT_STAGES=Object.freeze(["000","W01","W02","W03","N01","N02","N03","N04","N05","A01","A02","A03","A04","A05","A06","A07","A08","H01","H02","H03","H04","H05","H06","H07","H08","H09","H10","H11","H12","H13","H14"]);
export function decodeFinishWait(value){
 if(typeof value!=='string'||value.length!==7||!FINISH_WAIT_STAGES.includes(value.slice(0,3))||!/^\d{4}$/.test(value.slice(3))||(value.startsWith('000')&&value!=='0000000'))throw new Error();
 return value;
}
export function createFinishWaitProbe(now=()=>performance.now(),sink=()=>{}){
 let active=false,frozen=false,stage='000',started=0,last=0,value='0000000';
 const time=()=>{const n=now();if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw new Error();last=Math.max(last,n);return last;};
 return Object.freeze({
  begin(){try{if(active||frozen)return;started=time();active=true;}catch{}},
  mark(code){try{if(!active||frozen||code==='000'||!FINISH_WAIT_STAGES.includes(code)||code===stage)return;const t=time();stage=code;started=t;}catch{}},
  freeze(){if(!active||frozen)return value;frozen=true;value=stage==='000'?'0000000':stage+'0000';try{const t=time();value=stage==='000'?'0000000':stage+String(Math.min(9999,Math.max(0,Math.floor(t-started)))).padStart(4,'0');decodeFinishWait(value);}catch{}try{sink(value);}catch{}return value;},
  read(){return value;}
 });
}
const finishWaitProbe=createFinishWaitProbe();
export const beginFinishWait=()=>finishWaitProbe.begin();
export const markFinishWait=code=>finishWaitProbe.mark(code);
export const freezeFinishWait=()=>finishWaitProbe.freeze();

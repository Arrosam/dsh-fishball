import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { FoundationError, fail } from './ledger.mjs';
export { FoundationError as RuntimeError };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const ref = value => { if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)) fail('INVALID_INPUT'); return value; };
export const integer = (value,min=0,max=Number.MAX_SAFE_INTEGER) => { if(!Number.isSafeInteger(value)||value<min||value>max) fail('INVALID_INPUT'); return value; };
export const reference = value => { if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) fail('INVALID_INPUT'); return hash(value); };
export function exact(value,allowed,required=allowed) {
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype) fail('INVALID_INPUT');
 const d=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(d);
 if(keys.some(k=>typeof k!=='string'||!allowed.includes(k)||!d[k].enumerable||!Object.hasOwn(d[k],'value'))||required.some(k=>!Object.hasOwn(d,k))) fail('INVALID_INPUT');
 return value;
}
export function canonical(value,depth=0) {
 if(depth>12) fail('INPUT_TOO_LARGE');
 if(value===null||typeof value==='boolean') return JSON.stringify(value);
 if(typeof value==='number') { integer(value); return String(value); }
 if(typeof value==='string') { if(Buffer.byteLength(value)>65536) fail('INPUT_TOO_LARGE'); return JSON.stringify(value); }
 if(Array.isArray(value)) {
  if(types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>128) fail('INVALID_INPUT');
  const d=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(d).some(k=>typeof k!=='string'||(k!=='length'&&((!/^(0|[1-9]\d*)$/.test(k)||Number(k)>=value.length)||!d[k].enumerable||!Object.hasOwn(d[k],'value'))))) fail('INVALID_INPUT');
  const out=[];for(let i=0;i<value.length;i++) { if(!Object.hasOwn(d,String(i))) fail('INVALID_INPUT'); out.push(canonical(d[i].value,depth+1)); }return '['+out.join(',')+']';
 }
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype) fail('INVALID_INPUT');
 const d=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(d);
 if(keys.length>64||keys.some(k=>typeof k!=='string'||!d[k].enumerable||!Object.hasOwn(d[k],'value'))) fail('INVALID_INPUT');
 return '{'+keys.sort().map(k=>JSON.stringify(k)+':'+canonical(d[k].value,depth+1)).join(',')+'}';
}
export const canonicalDigest = value => hash(canonical(value));
export function normalizedSpec(spec) {
 exact(spec,['actionRef','kind','role','targetDigest','dataDigest','units','charges','attemptGroupRef','attemptIndex','resourcePolicyVersion','modelPolicyVersion','model','executor']);
 for(const k of ['actionRef','targetDigest','dataDigest','attemptGroupRef']) ref(spec[k]);
 if(!['read','write','review','repair'].includes(spec.kind)||!['worker','review','repair'].includes(spec.role)) fail('INVALID_INPUT');
 for(const k of ['units','attemptIndex','resourcePolicyVersion','modelPolicyVersion']) integer(spec[k],1);
 exact(spec.charges,['runtimeMs','usageUnits','costEstimateMicros','costState','costProvenanceRef'],['runtimeMs','usageUnits']);integer(spec.charges.runtimeMs);integer(spec.charges.usageUnits);if(spec.charges.costState!==undefined&&!['estimated','unknown'].includes(spec.charges.costState))fail('INVALID_INPUT');if(spec.charges.costState==='unknown'){if(spec.charges.costEstimateMicros!==undefined)fail('INVALID_INPUT');}else integer(spec.charges.costEstimateMicros);if(spec.charges.costProvenanceRef!==undefined)ref(spec.charges.costProvenanceRef);
 exact(spec.model,['presetRef','modelRef','reasoningRef','catalogEvidenceRef']);for(const v of Object.values(spec.model)) ref(v);
 exact(spec.executor,['mode','generationRef','sessionRef','environmentRef','bindingDigest','toolsDigest','permissionPolicyDigest'],['mode','generationRef','environmentRef','bindingDigest','toolsDigest','permissionPolicyDigest']);
 if(!['create','resume','none'].includes(spec.executor.mode)) fail('INVALID_INPUT');
 for(const [k,v] of Object.entries(spec.executor)) if(k!=='mode') ref(v);
 if(spec.executor.mode==='resume'&&!spec.executor.sessionRef) fail('INVALID_INPUT');
 return JSON.parse(canonical(spec));
}

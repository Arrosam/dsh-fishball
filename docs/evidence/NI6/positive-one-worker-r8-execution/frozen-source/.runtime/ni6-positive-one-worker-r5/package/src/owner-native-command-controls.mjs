// SOURCE-only composition captures the frozen70fe owner-intent core APIs.
// Q is held in the new typed private encrypted data kind; signed command
// receipts contain refs/digests only. No cold pending command is replayed.
import { RuntimeStore as RawRuntimeStore } from './runtime-store.mjs';
import { exact, canonical, ref } from './runtime-security.mjs';
import { ownerFinishRequest } from './normal-contracts.mjs';
import { immutable } from './installed-worker-facts.mjs';
import { BootstrapError } from './config.mjs';
const fail=code=>{throw new BootstrapError(code);};
const lookupNames=['recordOwnerNativeFinishIntent','readOwnerNativeFinishCommand','listOwnerNativeFinishCommands'];
export function createOwnerNativeCommandControls({store,ownerHandle,check,readFinishFirst,assertFinishReady,finish}) {
  const methods=Object.fromEntries(lookupNames.map(name=>[name,Object.getOwnPropertyDescriptor(RawRuntimeStore.prototype,name)?.value]));
  if(Object.values(methods).some(f=>typeof f!=='function'))fail('OWNER_COMMAND_PROTOCOL_UNAVAILABLE');
  const invoke=(name,value)=>{check();const out=Reflect.apply(methods[name],store,[ownerHandle,value]);check();return immutable(out);};
  function parsed(value){exact(value,['state','request','ownerRequestDigest','settlement']);if(value.state==='unreceived'||value.state==='legacy_unrestorable'){if(value.request!==null||value.ownerRequestDigest!==null||value.settlement!==null)fail('INVALID_RESPONSE');return value;}if(!['intent_committed','finish_committed'].includes(value.state))fail('INVALID_RESPONSE');const q=ownerFinishRequest(value.request);ref(value.ownerRequestDigest);if(value.state==='intent_committed'&&value.settlement!==null||value.state==='finish_committed'&&value.settlement===null)fail('INVALID_RESPONSE');return{...value,request:q};}
  return Object.freeze({
    list(value){exact(value,['taskRef','actionRef','claimRef','generationRef','executionRef']);Object.values(value).forEach(ref);const out=invoke('listOwnerNativeFinishCommands',value);exact(out,['commands']);if(!Array.isArray(out.commands)||out.commands.length>16)fail('INVALID_RESPONSE');for(const row of out.commands){exact(row,['commandRef','state']);ref(row.commandRef);if(!['intent_committed','finish_committed','legacy_unrestorable'].includes(row.state))fail('INVALID_RESPONSE');}return out;},
    read(value){exact(value,['taskRef','commandRef']);Object.values(value).forEach(ref);return immutable(parsed(invoke('readOwnerNativeFinishCommand',value)));},
    async finishNew(value){const q=ownerFinishRequest(value);check();
      // The original exact-Q historical read still precedes intent/current
      // CAS/source/maps/native/filesystem work. No old stop/settle is replayed.
      const historical=readFinishFirst(q);if(historical!==null)return historical.receipt;
      // Only prior committed capture and present authentic role associations
      // are read here. No capture/artifact/report effect may occur after Q.
      assertFinishReady(q);check();
      const intent=parsed(invoke('recordOwnerNativeFinishIntent',q));if(intent.state!=='intent_committed'||canonical(intent.request)!==canonical(q))fail('OWNER_COMMAND_CONFLICT');
      check();return finish(q);
    },
    // Cold restoration is read-only. A pending command does not gain finish,
    // stop, collect or retry permission. A committed command returns exactly
    // the genuine original settlement obtained through readFinishFirst(Q).
    restore(value){exact(value,['taskRef','commandRef']);Object.values(value).forEach(ref);const stored=parsed(invoke('readOwnerNativeFinishCommand',value));if(stored.state!=='finish_committed')return immutable(stored);const historical=readFinishFirst(stored.request);if(historical===null||canonical(historical.receipt)!==canonical(stored.settlement))fail('OWNER_COMMAND_CONFLICT');return immutable({...stored,settlement:historical.receipt});},
  });
}

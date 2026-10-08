// Private root composition proposal. Nothing below is a service/RPC capability.
import { RuntimeStore as RawRuntimeStore, assertPreparationSourceBinding } from './runtime-store.mjs';
import { ContextAssembler, assemblePreparedContextFromSource } from './context.mjs';
import { MemoryAdapter } from './memory.mjs';
import { canonical, exact } from './runtime-security.mjs';
import { ownerFinishRequest } from './normal-contracts.mjs';
import { immutable } from './installed-worker-facts.mjs';
import { BootstrapError } from './config.mjs';

const fail = code => { throw new BootstrapError(code); };
const methodNames = ['planNormalNativeAction','claimNormalCreate','recordNormalNativeOrigin','captureNormalNativeResult',
  'captureNormalNativeAuditResult','writeNormalNativeRepairArtifact','finishNormalNativeExecution','planNormalResume',
  'claimNormalResume','resolveNormalNativeIdentity','readNormalNativeFinish','readNormalResumeOrigin','readNormalResumeInput',
  'readNormalNativeArtifact','readNormalNativeAuditResult','readPreparedContextCheck','snapshot','readData','task','getPolicy','policy',
  'workerObservation','assertClaimCurrent','beginContextExecution','beginAuditExecution','assertExecutionCurrent','assertNativeRequestCurrent'];
// Capture genuine descriptors once. Own properties/subclass/facade methods
// cannot become the protected source issuer or override these calls.
const originals = Object.freeze(Object.fromEntries(methodNames.map(name => [name, Object.getOwnPropertyDescriptor(RawRuntimeStore.prototype, name).value])));

export function createSchema7Root({ storeOptions, ownerHandle, coordinatorHandle, hostHandle, memory, source, check, onPreparedNew }) {
  const preparationCapability = Object.freeze({}), nativeCapability = Object.freeze({});
  // Only trusted installed-memory's estimator may arrive through memory. The
  // existing installed binder proves public estimateContent source/lock pins.
  exact(memory, ['namespaceRef','tokenize','byteLimit','tokenLimit']);
  if (typeof memory.tokenize !== 'function' || typeof onPreparedNew !== 'function' || typeof check !== 'function') fail('RUNTIME_ADAPTER_INVALID');
  const store = new RawRuntimeStore({ ...storeOptions,
    preparationPrincipals:[{capability:preparationCapability,ownerHandle,namespaceRef:memory.namespaceRef}],
    nativeObservers:[{capability:nativeCapability,ownerHandle,hostHandle,source:source.descriptor}] });
  const tokenize = text => { check(); source.assertCurrent(); const n = memory.tokenize(text); check(); return n; };
  const contextAssembler = new ContextAssembler({ store, tokenize, byteLimit:memory.byteLimit, tokenLimit:memory.tokenLimit,
    knownSecrets:storeOptions.forbiddenSecrets ?? [], preparationBinding:{capability:preparationCapability,handle:coordinatorHandle} });
  const adapter = new MemoryAdapter({ ...memory, tokenize, store, handle:coordinatorHandle, contextAssembler,
    knownSecrets:storeOptions.forbiddenSecrets ?? [], preparationCapability,
    onPreparedCommit(actual) {
      check(); source.assertCurrent(); assertPreparationSourceBinding(store,preparationCapability,coordinatorHandle,memory.namespaceRef,actual.input.taskRef);
      if (actual.commitDisposition !== 'new') fail('CONTEXT_UNCERTAIN');
      // The genuine adapter already checked task/semantic/memory after commit.
      // This dedicated channel alone may populate current volatile input state.
      const out = onPreparedNew(immutable(actual)); if (out instanceof Promise) { out.catch(()=>{}); fail('CONTEXT_UNCERTAIN'); }
      check(); return out;
    } });
  const currentCall = (name, authority, input) => {
    check(); source.assertCurrent(); const out = Reflect.apply(originals[name],store,[authority,input]); check(); return immutable(out);
  };
  // Kept private by root: no JSON representation, service lookup or Config
  // field returns this object/store/handles. Other genuine root services use raw
  // store for ordinary original methods; its protected brand stays unchanged.
  const native = Object.freeze(Object.fromEntries(methodNames.filter(name => ['planNormal','claimNormal','recordNormal','captureNormal','writeNormal','finishNormal','resolveNormal'].some(prefix=>name.startsWith(prefix))).map(name => [name,input=>currentCall(name,nativeCapability,input)])));
  return Object.freeze({ store, contextAssembler, memoryAdapter:adapter, native,
    prepare(input) { check(); return adapter.prepareExecutionContext(input); },
    async sourceAssembly(input) { check(); const out=await assemblePreparedContextFromSource(contextAssembler,store,preparationCapability,coordinatorHandle,input);check();return immutable(out); },
    readPrepared(input) { return currentCall('readPreparedContextCheck',ownerHandle,input); },
    readResumeOrigin(input) { return currentCall('readNormalResumeOrigin',ownerHandle,input); },
    readResumeInput(input) { return currentCall('readNormalResumeInput',ownerHandle,input); },
    readArtifact(input) { return currentCall('readNormalNativeArtifact',ownerHandle,input); },
    readAuditResult(input) { return currentCall('readNormalNativeAuditResult',ownerHandle,input); },
    readFinishFirst(value) {
      // Deliberately no source/assertCurrent/CAS/map/backend/native work here.
      // check is the existing outer owner/lifetime/invocation gate only.
      const q = ownerFinishRequest(value); check();
      const out = Reflect.apply(originals.readNormalNativeFinish,store,[ownerHandle,q]); check();
      return out === null ? null : immutable(out);
    },
    snapshot(input) { return currentCall('snapshot',ownerHandle,input); },
    policy() { check(); return immutable(Reflect.apply(originals.getPolicy,store,[ownerHandle])); },
    readData(input) { return currentCall('readData',ownerHandle,input); },
    hostCall(name,input) { if (!['workerObservation','assertClaimCurrent','beginContextExecution','beginAuditExecution','assertExecutionCurrent','assertNativeRequestCurrent'].includes(name)) fail('UNAUTHORIZED'); return currentCall(name,hostHandle,input); },
    close() { store.close(); },
  });
}

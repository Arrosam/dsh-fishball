// SOURCE helper only. No imports, DB writes or calls until root grants its own lease.
// Runtime owner supplies actual final source/configuration/spec facts. No fabricated pins.
import assert from 'node:assert/strict';
import { reference } from '../src/runtime-store.mjs';
import { canonicalDigest, normalizedSpec } from '../src/runtime-security.mjs';

// Stops at the genuine charged intent boundary. Never creates/adopts a native session.
// Caller owns a disposable store with real owner/host handles and native capability.
export function exerciseNormalIntentBoundary({store,ownerHandle,hostHandle,capability,task,contextRecordRef,configurationContent,spec,expiresAt}) {
  const commandRef=operation=>reference(`schema7-intent-boundary:${spec.actionRef}:${operation}`);
  const planInput={taskRef:task.taskRef,commandRef:commandRef('plan'),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,contextRecordRef,configurationContent,spec};
  const action=store.planNormalNativeAction(capability,planInput);
  assert.deepEqual(store.planNormalNativeAction(capability,planInput),action);
  const planned=store.snapshot(ownerHandle,{taskRef:task.taskRef}).actions.find(value=>value.actionRef===action.actionRef);
  assert.equal(planned.actionDigest,action.actionDigest);
  assert.equal(action.actionDigest,canonicalDigest({ownerRef:task.ownerRef,workspaceRef:task.workspaceRef,taskRef:task.taskRef,taskVersion:task.version,authEpoch:task.authEpoch,spec:normalizedSpec(spec)}));
  const grant=store.grantAction(ownerHandle,{taskRef:task.taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,commandRef:commandRef('grant'),expectedTaskVersion:action.taskVersion,expectedAuthEpoch:action.authEpoch,expiresAt});
  const claimInput={taskRef:task.taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,commandRef:commandRef('claim'),expectedTaskVersion:grant.taskVersion,expectedAuthEpoch:grant.authEpoch,nativeId:'df-'+spec.executor.generationRef,configurationContent};
  assert.throws(()=>store.claimAction(hostHandle,{taskRef:task.taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,commandRef:commandRef('generic-refused'),expectedTaskVersion:grant.taskVersion,expectedAuthEpoch:grant.authEpoch}),error=>error?.code==='UNAUTHORIZED');
  const result=store.claimNormalCreate(capability,claimInput);
  assert.deepEqual(store.claimNormalCreate(capability,claimInput),result);
  const snapshot=store.snapshot(ownerHandle,{taskRef:task.taskRef});
  assert.equal(snapshot.workers.find(value=>value.claimRef===result.receipt.claimRef).phase,'intent');
  assert.equal(snapshot.actions.find(value=>value.claimRef===result.receipt.claimRef).releaseEvidenceRef,null);
  assert.throws(()=>store.readData(ownerHandle,{taskRef:task.taskRef,recordRef:result.identityRecordRef}),error=>error?.code==='UNAUTHORIZED');
  const q={taskRef:task.taskRef,actionRef:action.actionRef,claimRef:result.receipt.claimRef,generationRef:result.receipt.generationRef,executionRef:commandRef('unadmitted-execution'),commandRef:commandRef('unacknowledged-finish'),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch};
  assert.equal(store.readNormalNativeFinish(ownerHandle,q),null);
  return {action,result,snapshot};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const factory=createRequire(import.meta.url)('../src/client-entry.cjs');
const React={
  createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity).filter(value=>value!==false&&value!=null)}),
  useSyncExternalStore:(_subscribe,getSnapshot)=>getSnapshot(),
  useState:()=>['',()=>{}],
};
const client=factory(()=>React);
const ref='a'.repeat(64);
function buttons(node){return node&&typeof node==='object'?[...(node.type==='button'?[node]:[]),...node.children.flatMap(buttons)]:[];}
function labeled(rows,label){const matches=rows.filter(row=>row.children.join('')===label);assert.equal(matches.length,1);return matches[0];}
function snapshotModel(state,calls){
  const model={subscribe:()=>()=>{},getSnapshot:()=>state};
  for(const name of ['status','prepare','plan','preview','grant','resume','list','restore','acceptHistory','acceptApproval'])model[name]=(...args)=>calls.push({name,args});
  return model;
}

test('continuation and saved-finish cards render before task selection and preserve action gates while busy',()=>{
  let rpcCalls=0;
  const rpc={call(){rpcCalls++;throw new Error('UNEXPECTED_RPC');}};
  const taskModel={subscribe:()=>()=>{},getSnapshot:()=>({phase:'ready',selected:null,detail:null,stale:true})};
  const continuationModel=client.createContinuationModel(rpc,taskModel);
  const recoveryModel=client.createOwnerFinishRecoveryModel(rpc,taskModel);
  try{
    const continuation=buttons(client.ContinuationCard({continuationModel,contextRecordRef:null}));
    assert.deepEqual(continuation.map(row=>row.children.join('')),['Check saved outcome','Load continuation history','Resume this worker idle']);
    assert.equal(continuation.every(row=>row.props.disabled===true),true);
    const recovery=buttons(client.OwnerFinishRecoveryCard({recoveryModel}));
    assert.deepEqual(recovery.map(row=>row.children.join('')),['Read saved commands']);
    assert.equal(recovery[0].props.disabled,true);
    assert.equal(rpcCalls,0,'rendering does not submit or query a task');
  }finally{continuationModel.dispose();recoveryModel.dispose();}

  const calls=[];
  const continuationState={predecessor:{},contextRecordRef:ref,status:{eligible:true},history:null,plan:null,approval:null,grant:null,worker:null,busy:null,stale:false,uncertain:null};
  const selectedContinuation=snapshotModel(continuationState,calls);
  let rows=buttons(client.ContinuationCard({continuationModel:selectedContinuation,contextRecordRef:null}));
  assert.equal(labeled(rows,'Check saved outcome').props.disabled,false);
  assert.equal(labeled(rows,'Load continuation history').props.disabled,false);
  assert.equal(labeled(rows,'Resume this worker idle').props.disabled,true,'resume still needs its distinct plan and grant');
  labeled(rows,'Check saved outcome').props.onClick();
  labeled(rows,'Load continuation history').props.onClick();
  assert.deepEqual(calls,[{name:'status',args:[]},{name:'prepare',args:[ref]}]);
  calls.length=0;
  Object.assign(continuationState,{busy:'workerResumePrepare',history:{description:{}},acceptedHistory:true,plan:{},approval:{description:{}},acceptedApproval:true,grant:{}});
  rows=buttons(client.ContinuationCard({continuationModel:selectedContinuation,contextRecordRef:null}));
  assert.deepEqual(rows.map(row=>row.children.join('')),['Check saved outcome','Load continuation history','Plan this continuation','Load exact approval','Grant exact continuation','Resume this worker idle']);
  assert.equal(rows.every(row=>row.props.type==='button'&&row.props.disabled===true&&typeof row.props.onClick==='function'),true);

  const recoveryState={execution:{executionRef:ref},commands:[{commandRef:ref,state:'intent_committed'}],command:null,error:null,busy:null};
  const selectedRecovery=snapshotModel(recoveryState,calls);
  rows=buttons(client.OwnerFinishRecoveryCard({recoveryModel:selectedRecovery}));
  assert.equal(rows.every(row=>row.props.disabled===false),true);
  labeled(rows,'Read saved commands').props.onClick();
  labeled(rows,'Read intent_committed').props.onClick();
  assert.deepEqual(calls,[{name:'list',args:[]},{name:'restore',args:[ref]}]);
  calls.length=0;
  recoveryState.busy='ownerNativeFinishCommands';
  rows=buttons(client.OwnerFinishRecoveryCard({recoveryModel:selectedRecovery}));
  assert.equal(rows.every(row=>row.props.type==='button'&&row.props.disabled===true&&typeof row.props.onClick==='function'),true);
  assert.deepEqual(calls,[],'rerendering pending controls invokes no action');
});

import { types } from 'node:util';
import { canonical, exact, hash } from './runtime-security.mjs';
import { message } from './normal-contracts.mjs';
import { BootstrapError } from './config.mjs';
const deny=()=>{throw new BootstrapError('WORKER_REQUEST_DENIED');};
// Exact complete effective native request: no tail-only comparison, truncation,
// guessed history, repeated permit, title, compaction or tool request exception.
export function assertWholeNativeRequest(options,{agent,executionRef,content,systemPrompt,selection,bounds,historyMessages}) {
  if(!options||types.isProxy(options)||Object.getPrototypeOf(options)!==Object.prototype)deny();
  const d=Object.getOwnPropertyDescriptors(options);
  for(const k of Reflect.ownKeys(d))if(typeof k==='string'&&(!d[k].enumerable||!Object.hasOwn(d[k],'value')||!['provider','model','reasoningEffort','maxTokens','messages','tools','toolHistory','signal','sessionId','system','temperature','stop','purpose'].includes(k)))deny();
  const get=k=>d[k]?.value;
  const signal=get('signal');if(!(signal instanceof AbortSignal)||types.isProxy(signal))deny();const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;if(Reflect.apply(aborted,signal,[])!==false)deny();
  if(get('provider')!==selection.provider||get('model')!==selection.model||get('reasoningEffort')!=='deterministic'||get('maxTokens')!==selection.maxOutputTokens||get('sessionId')!==agent.id||['system','temperature','stop','purpose'].some(k=>get(k)!==undefined)||get('tools')!==undefined&&canonical(get('tools'))!=='[]'||get('toolHistory')!==undefined&&canonical(get('toolHistory'))!==canonical({tools:[],updates:[]}))deny();
  const actual=JSON.parse(canonical(get('messages')));actual.forEach(message);
  if(historyMessages.length){
    historyMessages.forEach(message);if(historyMessages.length<3||historyMessages.length>17||actual.length!==historyMessages.length+1||canonical(actual.slice(0,-1))!==canonical(historyMessages))deny();
  }else{if(actual.length!==2||actual[0].role!=='system'||actual[0].source.kind!=='system-prompt'||canonical(actual[0].content)!==canonical([{type:'text',text:systemPrompt}]))deny();}
  const user=actual.at(-1);if(user.id!==executionRef||user.role!=='user'||user.source.kind!==(selection.model==='df-testing-worker-v1'?'df-context':'df-audit-input')||user.source.form!=='local'||canonical(user.content)!==canonical([{type:'text',text:content}])||hash(user.content[0].text)!==hash(content)||Buffer.byteLength(JSON.stringify(get('messages')))>bounds.requestBytes)deny();
  if(historyMessages.length&&canonical(actual[0].content)!==canonical([{type:'text',text:systemPrompt}]))deny();
  return true;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {startTelegramPolling} from './telegram-polling.mjs';

const log={info(){},warn(){}};
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function untilAbort(signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(signal.reason);signal.addEventListener('abort',()=>reject(signal.reason),{once:true})})}

test('preserves backlog, acknowledges processed updates, retries failed update',async()=>{
 const reached=gate(),api=[],handled=[],delays=[];
 let calls=0,failed=false;
 const poller=startTelegramPolling({
  log,delay:async ms=>{delays.push(ms)},
  call:async(method,body,options)=>{
   api.push({method,body,timeoutMs:options.timeoutMs});
   if(method==='deleteWebhook')return true;
   calls++;
   if(calls===1)return [{update_id:10},{update_id:11}];
   if(calls===2)return [{update_id:11},{update_id:12}];
   if(calls===3)return [];
   reached.resolve();
   return untilAbort(options.signal);
  },
  handle:async u=>{handled.push(u.update_id);if(u.update_id===11&&!failed){failed=true;throw new Error('temporary database error')}}
 });
 try{
  await reached.promise;
  assert.deepEqual(api[0].body,{drop_pending_updates:false});
  assert.deepEqual(handled,[10,11,11,12]);
  assert.deepEqual(api.slice(1).map(x=>x.body.offset),[undefined,11,13,undefined]);
  assert.equal(api[1].body.timeout,25);
  assert.equal(api[1].timeoutMs,45000);
  assert.deepEqual(delays,[2000]);
 }finally{await poller.stop()}
});

test('blocked client reply does not block subsequent updates; shutdown cancels request',async()=>{
 const reached=gate(),handled=[],offsets=[];
 let calls=0;
 const poller=startTelegramPolling({
  log,call:async(method,body,options)=>{
   if(method==='deleteWebhook')return true;
   offsets.push(body.offset);
   if(++calls===1)return [{update_id:100},{update_id:101}];
   reached.resolve();
   return untilAbort(options.signal);
  },
  handle:async u=>{handled.push(u.update_id);if(u.update_id===100)throw Object.assign(new Error('blocked'),{telegramMethod:'sendMessage',telegramCode:403})}
 });
 try{
  await reached.promise;
  assert.deepEqual(handled,[100,101]);
  assert.deepEqual(offsets,[undefined,102]);
 }finally{await poller.stop()}
});

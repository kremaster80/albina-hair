import test from 'node:test';
import assert from 'node:assert/strict';
import {collectInstagram,startInstagramPolling} from './instagram-polling.mjs';
const id='123456789',account={state:'authorized',loginMode:'unified',userId:id,accessToken:'mock-token',connectedAt:'2026-01-01T00:00:00Z'};
const since=Date.parse('2026-01-02T10:00:00Z'),until=since+60000;
const message=(mid,at,from='222222222',to=id)=>({id:mid,created_time:new Date(at).toISOString(),from:{id:from,username:'test'},to:{data:[{id:to}]},message:'test text'});
test('reads fresh incoming only, traverses conversation pages and sorts messages',async()=>{
 let calls=[];
 const request=async(edge,params,token)=>{
  assert.equal(token,'mock-token');calls.push(edge);
  if(edge===id+'/conversations')return params.after?{data:[{id:'thread2',updated_time:new Date(until).toISOString()}]}:{data:[{id:'old',updated_time:new Date(since-1).toISOString()},{id:'thread1',updated_time:new Date(until).toISOString()}],paging:{next:'unused',cursors:{after:'cursor'}}};
  if(edge==='thread1/messages')return {data:['newer','oldmsg','outgoing','future','wrongrecipient'].map(id=>({id}))};
  if(edge==='thread2/messages')return {data:[{id:'earlier'}]};
  const data={newer:message('newer',since+2000),oldmsg:message('oldmsg',since-1),outgoing:message('outgoing',since+3000,id,'222222222'),future:message('future',until+1),wrongrecipient:message('wrongrecipient',since+1000,'222222222','333333333'),earlier:message('earlier',since+1000)};
  return data[edge];
 };
 const result=await collectInstagram({account,since,until,request});
 assert.deepEqual(result.events.map(x=>x.eventId),['earlier','newer']);
 assert.equal(result.events[0].externalId,'222222222');
 assert.equal(result.events[0].text,'test text');
 assert.ok(!calls.includes('old/messages'));
 assert.equal(result.truncated,0);
});
test('refuses invalid account and incomplete pagination',async()=>{
 await assert.rejects(collectInstagram({account:{...account,loginMode:'legacy'},since,until,request:async()=>{throw Error('must not call')}}));
 await assert.rejects(collectInstagram({account,since,until,request:async()=>({data:[],paging:{next:'yes',cursors:{after:'same'}}})}));
});
test('marks possible API message window loss',async()=>{
 const request=async(edge)=>{
  if(edge.endsWith('/conversations'))return {data:[{id:'thread',updated_time:new Date(until).toISOString()}]};
  if(edge.endsWith('/messages'))return {data:Array.from({length:20},(_,i)=>({id:'m'+i})),paging:{next:'unused'}};
  return message(edge,since+1000);
 };
 const result=await collectInstagram({account,since,until,request});
 assert.equal(result.truncated,1);assert.equal(result.events.length,20);
});
test('first run starts now, stores checkpoint, and skips messages before opt-in',async()=>{
 const queries=[];let imported=0;
 let done;const complete=new Promise(r=>done=r);
 const pool={query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('INSERT'))return {rows:[{started_at:args[1],watermark:args[1]}]};done();return {rows:[]}}};
 const request=async(edge)=>{
  if(edge.endsWith('/conversations'))return {data:[{id:'thread',updated_time:new Date().toISOString()}]};
  if(edge.endsWith('/messages'))return {data:[{id:'old'}]};
  return message('old',since);
 };
 const worker=startInstagramPolling({records:new Map([['instagram',account]]),pool,ingest:async()=>{imported++;return true},request});
 await complete;await worker.stop();
 assert.equal(imported,0);assert.equal(queries.length,2);
});

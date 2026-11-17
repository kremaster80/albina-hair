import test from 'node:test';
import assert from 'node:assert/strict';
import {exchangeWhatsApp,subscribeWhatsApp} from './whatsapp-signup.mjs';
const appId='123456789',wabaId='123456789123',phoneId='987654321987';
const base={appId,appSecret:'mock-secret',code:'mock-authorization-code',wabaId,mode:'coexistence'};
function mock({phones=[{id:phoneId,display_phone_number:'+10000000000'}],onApp=true,valid=true,scopes=['whatsapp_business_management','whatsapp_business_messaging'],next}={}){
 const calls=[];
 const remoteJSON=async(url,options)=>{
  calls.push({url,options});
  if(url.pathname.endsWith('/oauth/access_token'))return {access_token:'mock-token'};
  if(url.pathname.endsWith('/debug_token'))return {data:{is_valid:valid,app_id:appId,scopes}};
  if(url.pathname.endsWith('/phone_numbers'))return {data:phones,paging:next?{next}:{}};
  if(url.pathname.endsWith('/'+phoneId))return {id:phoneId,is_on_biz_app:onApp,platform_type:'CLOUD_API'};
  if(url.pathname.endsWith('/subscribed_apps'))return {success:true};
  throw Error('Unexpected call');
 };
 return {remoteJSON,calls};
}
test('Coexistence resolves a single phone when popup returns only WABA',async()=>{
 const {remoteJSON,calls}=mock();
 const rec=await exchangeWhatsApp({...base,remoteJSON});
 assert.equal(rec.phoneId,phoneId);assert.equal(rec.mode,'coexistence');
 assert.equal(rec.webhookSubscribed,false);
 assert.equal(await subscribeWhatsApp(rec,remoteJSON),true);
 assert.equal(calls.at(-1).options.method,'POST');
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer mock-token');
});
test('reject unverified or ambiguous numbers and insufficient permissions',async()=>{
 for(const opts of [{phones:[]},{phones:[{id:phoneId},{id:'111111111'}]},{next:'next'},{onApp:false},{valid:false},{scopes:[]}]){
  await assert.rejects(exchangeWhatsApp({...base,remoteJSON:mock(opts).remoteJSON}));
 }
 await assert.rejects(exchangeWhatsApp({...base,phoneId:'111111111',remoteJSON:mock().remoteJSON}));
 await assert.rejects(exchangeWhatsApp({...base,mode:'standard',remoteJSON:mock().remoteJSON}));
});
test('standard registered Cloud API number still works',async()=>{
 const rec=await exchangeWhatsApp({...base,mode:'standard',phoneId,remoteJSON:mock({onApp:false}).remoteJSON});
 assert.equal(rec.mode,'standard');
});
test('subscription failure is not marked successful',async()=>{
 await assert.rejects(subscribeWhatsApp({wabaId,accessToken:'mock-token'},async()=>({success:false})));
});

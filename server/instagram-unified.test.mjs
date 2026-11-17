import test from 'node:test';
import assert from 'node:assert/strict';
import {unifiedAuthorizeURL,exchangeUnified,unifiedConfigured} from './instagram-unified.mjs';
const appId='1439107087872898',configId='2047339899261528',appSecret='test-secret',redirectUri='https://example.com/api/integrations/instagram/callback',id='17841412345678901';
const valid={is_valid:true,app_id:appId,scopes:['instagram_basic','instagram_manage_messages'],expires_at:0};
function mock({debug=valid,accounts=[{id}],next}={}){
 const calls=[];
 const remoteJSON=async(url,options)=>{
  calls.push({url,options});
  if(url.pathname.endsWith('/oauth/access_token'))return {access_token:'test-token'};
  if(url.pathname.endsWith('/debug_token'))return {data:debug};
  if(url.pathname.endsWith('/assigned_instagram_accounts'))return {data:accounts,paging:next?{next}:{}};
  if(url.pathname.endsWith('/'+id))return {id,username:'test_salon'};
  throw new Error('Unexpected URL');
 };
 return {calls,remoteJSON};
}
test('uses dashboard URL, config ID and fresh state rather than legacy scopes',()=>{
 const url=unifiedAuthorizeURL({appId,configId,redirectUri,state:'fresh-state'});
 assert.equal(url.origin,'https://www.facebook.com');
 assert.equal(url.pathname,'/dialog/oauth');
 assert.equal(url.searchParams.get('config_id'),configId);
 assert.equal(url.searchParams.get('state'),'fresh-state');
 assert.equal(url.searchParams.get('redirect_uri'),redirectUri);
 assert.equal(url.searchParams.get('scope'),null);
 assert.equal(unifiedConfigured({META_APP_ID:appId,INSTAGRAM_CONFIG_ID:configId,META_APP_SECRET:appSecret}),true);
});
test('verifies token, permissions and professional account',async()=>{
 const {calls,remoteJSON}=mock();
 const record=await exchangeUnified({appId,appSecret,redirectUri,code:'code',remoteJSON});
 assert.equal(record.userId,id);assert.equal(record.account,'@test_salon');assert.equal(record.expiresAt,null);
 assert.equal(calls[1].options.headers.Authorization,'Bearer '+appId+'|'+appSecret);
 assert.equal(calls[2].options.headers.Authorization,'Bearer test-token');
 assert.equal(calls[0].url.searchParams.get('redirect_uri'),redirectUri);
});
test('rejects foreign app, missing permission and ambiguous account',async()=>{
 for(const options of [
  {debug:{...valid,app_id:'999999'}},
  {debug:{...valid,scopes:['instagram_basic']}},
  {accounts:[]},
  {accounts:[{id},{id:'123456789'}]},
  {next:'https://example.com/next'}
 ]){
  await assert.rejects(exchangeUnified({appId,appSecret,redirectUri,code:'code',remoteJSON:mock(options).remoteJSON}));
 }
});

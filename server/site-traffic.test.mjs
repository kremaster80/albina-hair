import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {siteEventPayload} from './site-traffic.mjs';

const source=readFileSync(new URL('../site-traffic.js',import.meta.url),'utf8');
const setup=(search='',referrer='')=>{
 const calls=[];
 const loc={search,hostname:'albinahair.swiftgifts.tg'};
 const window={};
 const context={window,location:loc,document:{referrer},
  URL,URLSearchParams,Set,Object,String,fetch:async(path,options)=>{calls.push({path,payload:JSON.parse(options.body)});return {ok:true}}};
 vm.runInNewContext(source,context);
 return {window,calls};
};
test('recognises all three map UTM links before referrer',()=>{
 for(const [utm,expected] of [
  ['2gis','2gis'],['yandex_maps','yandex_maps'],['google_maps','google_maps']
 ]){
  const {window,calls}=setup('?utm_source='+utm+'&utm_medium=maps&utm_campaign=business_profile','https://other.example/');
  assert.equal(window.SITE_TRAFFIC.source,expected);
  assert.equal(calls[0].path,'/api/site/event');
  assert.equal(calls[0].payload.source,expected);
  assert.equal(calls[0].payload.action,'visit');
 }
});
test('falls back to map referrers without misattributing ordinary search',()=>{
 for(const [ref,expected] of [
  ['https://2gis.ru/moscow/firm/123','2gis'],
  ['https://yandex.ru/maps/org/123','yandex_maps'],
  ['https://maps.yandex.ru/','yandex_maps'],
  ['https://maps.google.com/maps?x=1','google_maps'],
  ['https://www.google.com/maps/place/x','google_maps'],
  ['https://www.google.com/search?q=hair','other'],
  ['https://yandex.ru/search/?text=hair','other'],
  ['', 'direct']
 ]){
  assert.equal(setup('',ref).window.SITE_TRAFFIC.source,expected,ref);
 }
});
test('no user data or full referrer included; rejects unexpected event types',()=>{
 const {window,calls}=setup('?utm_source=2gis');
 window.SITE_TRAFFIC.track('dikidi_click');
 window.SITE_TRAFFIC.track('unknown');
 assert.equal(calls.length,2);
 assert.deepEqual(Object.keys(calls[1].payload).sort(),['action','source']);
 assert.equal(calls[1].payload.action,'dikidi_click');
});
test('server accepts only whitelisted aggregate action and source',()=>{
 assert.deepEqual(siteEventPayload({source:'2gis',action:'visit'}),{source:'2gis',action:'visit'});
 assert.equal(siteEventPayload({source:'https://bad.example',action:'visit'}),null);
 assert.equal(siteEventPayload({source:'2gis',action:'contact_data'}),null);
});

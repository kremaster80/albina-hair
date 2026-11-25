import test from 'node:test';
import assert from 'node:assert/strict';
import {isPassiveInstagramMessage} from './instagram-intent.mjs';

const ig=text=>({source:'instagram',text});
test('Instagram emoji reactions are not new inquiries',()=>{
 for(const text of ['😍','❤️','👍🏻','🔥🔥','🇷🇺','👩‍👩‍👧‍👦','  😍  ','','  '])
  assert.equal(isPassiveInstagramMessage(ig(text)),true,JSON.stringify(text));
 assert.equal(isPassiveInstagramMessage({source:'instagram'}),true);
});
test('real text inquiries are actionable even when an emoji is included',()=>{
 for(const text of ['Здравствуйте','Хочу записаться 😍','😍 А сколько стоит?','1','Как записаться?', '😍!'])
  assert.equal(isPassiveInstagramMessage(ig(text)),false,text);
});
test('other sources are unaffected',()=>{
 assert.equal(isPassiveInstagramMessage({source:'telegram',text:'😍'}),false);
 assert.equal(isPassiveInstagramMessage({source:'dikidi',text:''}),false);
});

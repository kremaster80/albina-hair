import test from 'node:test';
import assert from 'node:assert/strict';
import {gmailConfig,trustedDikidiMail,inferMoscowBookingAt,scanDikidiMailbox} from './dikidi-gmail.mjs';
import {parseDikidiBookingEmail} from './dikidi-email.mjs';

const from='noreply@dikidi.ru';
const original='Создана новая запись к Анна Примерова на 23.11 в 17:00 (2 часа 30 минут). Клиент: Тест Клиент 79260000000';
const authenticated={
 from:{value:[{address:from}]},
 headerLines:[{key:'authentication-results',line:'Authentication-Results: mx.google.com; dkim=pass header.i=@dikidi.ru; spf=pass'}],
 text:original,
 messageId:'<msg-1@dikidi.ru>'
};
test('requires complete Gmail configuration',()=>{
 assert.equal(gmailConfig({DIKIDI_GMAIL_USER:'t08029264@gmail.com',DIKIDI_MAIL_SENDER:from,DIKIDI_GMAIL_APP_PASSWORD:'1234 5678 90ab cdef'}).user,'t08029264@gmail.com');
 assert.equal(gmailConfig({DIKIDI_GMAIL_USER:'t08029264@gmail.com',DIKIDI_MAIL_SENDER:'',DIKIDI_GMAIL_APP_PASSWORD:'abcdefghijklmnop'}),null);
});
test('requires sender match AND Gmail-verified aligned DKIM',()=>{
 assert.equal(trustedDikidiMail(authenticated,from),true);
 assert.equal(trustedDikidiMail({...authenticated,from:{value:[{address:'fraud@example.org'}]}},from),false);
 assert.equal(trustedDikidiMail({...authenticated,headerLines:[{key:'authentication-results',line:'Authentication-Results: mx.google.com; dkim=fail header.i=@dikidi.ru'}]},from),false);
 assert.equal(trustedDikidiMail({...authenticated,headerLines:[{key:'authentication-results',line:'Authentication-Results: evil.example; dkim=pass header.i=@dikidi.ru'}]},from),false);
 assert.equal(trustedDikidiMail({...authenticated,headerLines:[{key:'authentication-results',line:'Authentication-Results: mx.google.com; dkim=pass header.i=@example.org'}]},from),false);
});
test('infers Moscow time from Gmail receipt including year boundary',()=>{
 const booking=parseDikidiBookingEmail(original);
 assert.equal(inferMoscowBookingAt(booking,'2026-11-23T13:00:00Z').toISOString(),'2026-11-23T14:00:00.000Z');
 const jan=parseDikidiBookingEmail(original.replace('23.11','01.01'));
 assert.equal(inferMoscowBookingAt(jan,'2026-12-30T10:00:00Z').toISOString(),'2026-12-31T21:00:00.000Z');
 const feb=parseDikidiBookingEmail(original.replace('23.11','29.02'));
 assert.equal(inferMoscowBookingAt(feb,'2026-02-20T10:00:00Z'),null);
});
test('first poll skips history; later poll deduplicates and checkpoints',async()=>{
 const stored=new Map(),inserted=[];
 const pool={query:async(sql,args)=>{
  if(sql.startsWith('SELECT uid_validity'))return {rowCount:stored.has(args[0])?1:0,rows:stored.has(args[0])?[stored.get(args[0])]:[]};
  if(sql.startsWith('INSERT INTO crm_dikidi_mail_sync')){stored.set(args[0],{uid_validity:args[1],last_uid:args[2]});return {rowCount:1}};
  if(sql.startsWith('UPDATE crm_dikidi_mail_sync')){stored.get(args[0]).last_uid=args[1];return {rowCount:1}};
  throw Error('Unexpected SQL: '+sql);
 }};
 let messages=[{uid:5,source:Buffer.from(original),internalDate:new Date('2026-11-23T13:00:00Z')}];
 let next=6;
 const config={user:'t08029264@gmail.com',from,password:'1234567890123456'};
 const imapFactory=()=>({
  mailbox:{uidValidity:1234n,uidNext:next},
  connect:async()=>{},
  logout:async()=>{},
  getMailboxLock:async()=>({release:()=>{}}),
  async *fetch(){for(const m of messages)yield m}
 });
 const parseMime=async()=>authenticated;
 const ingest=async event=>{inserted.push(event);return true};
 await scanDikidiMailbox({pool,ingest,config,imapFactory,parseMime});
 assert.equal(stored.get(config.user).last_uid,5);
 assert.equal(inserted.length,0);
 messages=[{uid:6,source:Buffer.from(original),internalDate:new Date('2026-11-23T13:00:00Z')}];next=7;
 await scanDikidiMailbox({pool,ingest,config,imapFactory,parseMime});
 assert.equal(inserted.length,1);
 assert.equal(inserted[0].source,'dikidi');
 assert.equal(inserted[0].bookingAt.toISOString(),'2026-11-23T14:00:00.000Z');
 assert.equal(stored.get(config.user).last_uid,6);
 await scanDikidiMailbox({pool,ingest,config,imapFactory,parseMime});
 assert.equal(inserted.length,1);
});

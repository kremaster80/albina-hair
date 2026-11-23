import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
import {createCRM} from './crm.mjs';
if (!process.env.DATABASE_URL || process.env.CRM_TEST_DATABASE !== '1') throw new Error('Use isolated test DB only');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
process.env.INSTAGRAM_CLIENT_SECRET='test_ig_secret';
process.env.META_APP_SECRET='test_wa_secret';
process.env.TELEGRAM_WEBHOOK_VERIFY_TOKEN='test_verify';
process.env.META_WEBHOOK_VERIFY_TOKEN='test_verify';
process.env.TELEGRAM_WEBHOOK_SECRET='test_telegram_secret';
process.env.TELEGRAM_BOT_TOKEN='test_not_a_real_token';
delete process.env.TELEGRAM_ADMIN_CHAT_ID;
process.env.TELEGRAM_PRIVACY_URL='https://example.com/privacy';
const sent=[];
const telegramTransport=async(method,payload)=>{sent.push({method,payload});return {message_id:1}};
const records=new Map([['instagram',{state:'authorized',userId:'111'}],['whatsapp',{state:'authorized',wabaId:'222',phoneId:'333'}]]);
function json(res,code,body){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
const crm=await createCRM({records,json,origin:'https://example.com',telegramTransport});
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');return url.pathname.startsWith('/api/webhooks/')?crm.webhook(req,res,url):crm.admin(req,res,url)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
async function send(provider,data,secret){
 const body=JSON.stringify(data);return fetch(base+'/api/webhooks/'+provider,{method:'POST',headers:{'Content-Type':'application/json',...(provider==='telegram'?{'X-Telegram-Bot-Api-Secret-Token':secret}:{'X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(body).digest('hex')})},body});
}
async function get(path){const r=await fetch(base+'/api/crm/'+path);assert.equal(r.status,200);return r.json()}
try{
 await pool.query('TRUNCATE crm_contacts,crm_leads,crm_messages,crm_notifications,crm_bot_state,crm_bot_updates,crm_bot_reminders RESTART IDENTITY CASCADE');
 const ig={object:'instagram',entry:[{id:'111',messaging:[{sender:{id:'1234'},message:{mid:'ig-1',text:'Стрижка'}}]}]};
 assert.equal((await send('instagram',ig,'wrong')).status,403);
 assert.equal((await send('instagram',ig,'test_ig_secret')).status,200);
 assert.equal((await send('instagram',ig,'test_ig_secret')).status,200);
 assert.equal((await send('instagram',{...ig,entry:[{...ig.entry[0],id:'999'}]},'test_ig_secret')).status,200);
 const wa={object:'whatsapp_business_account',entry:[{id:'222',changes:[{value:{metadata:{phone_number_id:'333'},contacts:[{wa_id:'79000000000',profile:{name:'Клиент тест'}}],messages:[{id:'wa-1',from:'79000000000',text:{body:'Окрашивание'}}]}}]}]};
 assert.equal((await send('whatsapp',wa,'test_wa_secret')).status,200);
 process.env.TELEGRAM_PRIVACY_URL='';
 process.env.DIKIDI_BOOKING_URL='https://dikidi.net/ru/booking/test';
 const bookingOnly={update_id:2,message:{chat:{type:'private',id:5555},from:{id:5555,first_name:'Test'},text:'/start'}};
 assert.equal((await send('telegram',bookingOnly,'test_telegram_secret')).status,200);
 const bookingReply=sent.filter(x=>x.method==='sendMessage').at(-1).payload;
 assert.ok(bookingReply.text.includes('Онлайн-запись'));
 assert.equal(bookingReply.reply_markup.inline_keyboard[0][0].url,process.env.DIKIDI_BOOKING_URL);
 assert.equal((await get('summary')).contacts,2); // No client data collected without consent.
 process.env.TELEGRAM_PRIVACY_URL='https://example.com/privacy';
 delete process.env.DIKIDI_BOOKING_URL;
 const tg={update_id:3,message:{chat:{type:'private',id:3333},from:{id:3333,first_name:'Test'},text:'Уход'}};
 assert.equal((await send('telegram',tg,'bad')).status,403);
 assert.equal((await send('telegram',tg,'test_telegram_secret')).status,200);
 assert.equal((await get('summary')).contacts,2); // before consent, no customer data stored in CRM
 function tap(update_id,id,data){return {update_id,callback_query:{id:'cb'+update_id,from:{id,first_name:'Test'},message:{chat:{id,type:'private'}},data}}}
 assert.equal((await send('telegram',tap(4,3333,'consent:yes'),'test_telegram_secret')).status,200);
 assert.equal((await send('telegram',{...tg,update_id:5},'test_telegram_secret')).status,200);
 assert.equal((await send('telegram',{...tg,update_id:5},'test_telegram_secret')).status,200);
 // A customer attempting an admin callback never obtains a lead card.
 assert.equal((await send('telegram',tap(6,3333,'lead:1'),'test_telegram_secret')).status,200);
 assert.ok(!sent.filter(x=>x.method==='sendMessage').at(-1).payload.text.includes('Заявка #1'));
 process.env.TELEGRAM_ADMIN_CHAT_ID='9999';
 assert.equal((await send('telegram',tap(7,9999,'lead:1'),'test_telegram_secret')).status,200);
 assert.ok(sent.filter(x=>x.method==='sendMessage').at(-1).payload.text.includes('Заявка #1'));
 assert.equal((await send('telegram',tap(8,9999,'status:1:working'),'test_telegram_secret')).status,200);
 assert.equal((await get('leads/1')).lead.status,'working');
 assert.equal((await send('telegram',tap(9,9999,'status:1:new'),'test_telegram_secret')).status,200);
 delete process.env.TELEGRAM_ADMIN_CHAT_ID;
 const summary=await get('summary');assert.equal(summary.status.new,3);assert.equal(summary.contacts,3);
 const leads=(await get('leads?q='+encodeURIComponent('Стрижка'))).leads;assert.equal(leads.length,1);
 const detail=await get('leads/'+leads[0].id);assert.equal(detail.messages.length,1);
 const set=await fetch(base+'/api/crm/leads/'+leads[0].id,{method:'POST',body:JSON.stringify({status:'booked',service:'Стрижка',bookingAt:'2026-12-01T10:00:00Z'})});assert.equal(set.status,200);
 assert.equal((await get('bookings')).bookings.length,1);
 const del=await fetch(base+'/api/crm/clients/'+leads[0].contact_id,{method:'DELETE'});assert.equal(del.status,200);
 assert.equal((await get('summary')).contacts,2);
 // Questionnaire, reminder consent and local bookings.
 assert.equal((await send('telegram',tap(10,3333,'questionnaire'),'test_telegram_secret')).status,200);
 for(let i=0;i<5;i++)assert.equal((await send('telegram',tap(11+i,3333,'q:'+i+':0'),'test_telegram_secret')).status,200);
 assert.equal((await send('telegram',tap(16,3333,'question:submit'),'test_telegram_secret')).status,200);
 const tgLead=(await get('leads?source=telegram')).leads[0];
 assert.ok((await get('leads/'+tgLead.id)).messages.some(x=>x.text.includes('Анкета')));
 assert.equal((await send('telegram',tap(17,3333,'remind:on'),'test_telegram_secret')).status,200);
 await pool.query("UPDATE crm_leads SET status='booked',booking_at=now()+interval '23 hours' WHERE id=$1",[tgLead.id]);
 await crm.telegram.reminders();
 await crm.telegram.reminders();
 assert.equal(sent.filter(x=>x.method==='sendMessage'&&x.payload.text.startsWith('Напоминание от Альбины')).length,1);
 assert.equal((await send('telegram',tap(18,3333,'consent:revoke'),'test_telegram_secret')).status,200);
 assert.equal((await pool.query("SELECT reminders FROM crm_bot_state WHERE chat_id='3333'")).rows[0].reminders,false);
 console.log('CRM and Telegram PostgreSQL integration tests passed');
}finally{await new Promise(resolve=>server.close(resolve));await crm.close();await pool.end()}

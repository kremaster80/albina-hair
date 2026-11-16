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
const records=new Map([['instagram',{state:'authorized',userId:'111'}],['whatsapp',{state:'authorized',wabaId:'222',phoneId:'333'}]]);
function json(res,code,body){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
const crm=await createCRM({records,json,origin:'http://localhost'});
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');return url.pathname.startsWith('/api/webhooks/')?crm.webhook(req,res,url):crm.admin(req,res,url)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
async function send(provider,data,secret){
 const body=JSON.stringify(data);return fetch(base+'/api/webhooks/'+provider,{method:'POST',headers:{'Content-Type':'application/json',...(provider==='telegram'?{'X-Telegram-Bot-Api-Secret-Token':secret}:{'X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(body).digest('hex')})},body});
}
async function get(path){const r=await fetch(base+'/api/crm/'+path);assert.equal(r.status,200);return r.json()}
try{
 await pool.query('TRUNCATE crm_contacts,crm_leads,crm_messages,crm_notifications RESTART IDENTITY CASCADE');
 const ig={object:'instagram',entry:[{id:'111',messaging:[{sender:{id:'1234'},message:{mid:'ig-1',text:'Стрижка'}}]}]};
 assert.equal((await send('instagram',ig,'wrong')).status,403);
 assert.equal((await send('instagram',ig,'test_ig_secret')).status,200);
 assert.equal((await send('instagram',ig,'test_ig_secret')).status,200);
 assert.equal((await send('instagram',{...ig,entry:[{...ig.entry[0],id:'999'}]},'test_ig_secret')).status,200);
 const wa={object:'whatsapp_business_account',entry:[{id:'222',changes:[{value:{metadata:{phone_number_id:'333'},contacts:[{wa_id:'79000000000',profile:{name:'Клиент тест'}}],messages:[{id:'wa-1',from:'79000000000',text:{body:'Окрашивание'}}]}}]}]};
 assert.equal((await send('whatsapp',wa,'test_wa_secret')).status,200);
 const tg={update_id:3,message:{chat:{type:'private',id:3333},from:{id:3333,first_name:'Test'},text:'Уход'}};
 assert.equal((await send('telegram',tg,'bad')).status,403);
 assert.equal((await send('telegram',tg,'test_telegram_secret')).status,200);
 const summary=await get('summary');assert.equal(summary.status.new,3);assert.equal(summary.contacts,3);
 const leads=(await get('leads?q='+encodeURIComponent('Стрижка'))).leads;assert.equal(leads.length,1);
 const detail=await get('leads/'+leads[0].id);assert.equal(detail.messages.length,1);
 const set=await fetch(base+'/api/crm/leads/'+leads[0].id,{method:'POST',body:JSON.stringify({status:'booked',service:'Стрижка',bookingAt:'2026-12-01T10:00:00Z'})});assert.equal(set.status,200);
 assert.equal((await get('bookings')).bookings.length,1);
 const del=await fetch(base+'/api/crm/clients/'+leads[0].contact_id,{method:'DELETE'});assert.equal(del.status,200);
 assert.equal((await get('summary')).contacts,2);
 console.log('CRM PostgreSQL integration tests passed');
}finally{await new Promise(resolve=>server.close(resolve));await crm.close();await pool.end()}

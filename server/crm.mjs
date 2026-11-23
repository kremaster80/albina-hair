import {startGmailMailboxPolling} from './dikidi-gmail.mjs';
import {startInstagramPolling,pollingAccount} from './instagram-polling.mjs';
import {startTelegramPolling} from './telegram-polling.mjs';
import {createTelegram} from './telegram.mjs';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const {Pool}=pg;
const statusNames=new Set(['new','working','booked','closed']);
const sources=new Set(['instagram','whatsapp','telegram','website','yandex','2gis','google','dikidi','manual']);
const clean=(s,n=2000)=>typeof s==='string'?s.trim().slice(0,n):'';
const eq=(a,b)=>{a=Buffer.from(a||'');b=Buffer.from(b||'');return a.length===b.length&&timingSafeEqual(a,b)};
async function rawBody(req,max=1048576){
 const parts=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('Payload too large'),{status:413});parts.push(chunk)}
 return Buffer.concat(parts);
}
const parse=raw=>{try{return JSON.parse(raw.toString('utf8'))}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}};
const invalid=message=>Object.assign(new Error(message),{status:400});
const textReply=(res,status,value)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(value)};
export async function createCRM({records,json,origin,telegramTransport}){
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:5000,statement_timeout:12000});
 await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 async function ingest(e){
   if(!sources.has(e.source)||!e.externalId||!e.eventId)return false;
   const c=await pool.connect();
   try{
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[e.source+':'+e.eventId]);
    if((await c.query('SELECT 1 FROM crm_messages WHERE source=$1 AND event_id=$2',[e.source,e.eventId])).rowCount){await c.query('COMMIT');return false}
    const contact=(await c.query(
     'INSERT INTO crm_contacts(source,external_id,name,phone) VALUES($1,$2,$3,$4) ON CONFLICT(source,external_id) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,\'\'),crm_contacts.name),phone=COALESCE(NULLIF(EXCLUDED.phone,\'\'),crm_contacts.phone),updated_at=now() RETURNING id',
     [e.source,clean(e.externalId,300),clean(e.name,200),clean(e.phone,40)])).rows[0];
    // Serialise message processing per contact after upsert obtains the row lock.
    // Each DIKIDI email is a distinct confirmed booking, not an open enquiry.
    const booking=e.source==='dikidi'&&e.bookingAt instanceof Date&&Number.isFinite(+e.bookingAt);
    let lead=booking?null:(await c.query("SELECT id FROM crm_leads WHERE contact_id=$1 AND status IN ('new','working')",[contact.id])).rows[0];
    const isNew=!lead;
    if(isNew)lead=(await c.query('INSERT INTO crm_leads(contact_id,service,note,status,booking_at) VALUES($1,$2,$3,$4,$5) RETURNING id',[contact.id,clean(e.service,200),clean(e.note),booking?'booked':'new',booking?e.bookingAt:null])).rows[0];
    await c.query('INSERT INTO crm_messages(lead_id,source,event_id,text) VALUES($1,$2,$3,$4)',[lead.id,e.source,clean(e.eventId,300),clean(e.text,4000)||'[Вложение или обращение без текста]']);
    await c.query('UPDATE crm_leads SET updated_at=now() WHERE id=$1',[lead.id]);
    if(isNew)await c.query('INSERT INTO crm_notifications(lead_id) VALUES($1)',[lead.id]);
    await c.query('COMMIT');return true;
   }catch(err){await c.query('ROLLBACK');throw err}finally{c.release()}
 }
 const telegram=createTelegram({pool,ingest,origin,transport:telegramTransport});
 const rowsQuery="SELECT l.id,l.status,l.service,l.note,l.booking_at,l.created_at,l.updated_at,c.id AS contact_id,c.source,c.name,c.phone,c.external_id,(SELECT text FROM crm_messages WHERE lead_id=l.id ORDER BY id DESC LIMIT 1) AS last_message FROM crm_leads l JOIN crm_contacts c ON c.id=l.contact_id";
 async function admin(req,res,url){
  const p=url.pathname;
  try{
   if(req.method==='GET'&&p==='/api/crm/leads'){
    const q=clean(url.searchParams.get('q'),100),state=clean(url.searchParams.get('status'),30),source=clean(url.searchParams.get('source'),30);
    const page=Math.max(0,Math.min(1000,Number.parseInt(url.searchParams.get('page')||'0',10)||0));
    const args=[q,statusNames.has(state)?state:'',sources.has(source)?source:'',page*50];
    const data=await pool.query(rowsQuery+" WHERE ($1='' OR concat_ws(' ',c.name,c.phone,c.external_id,l.service,l.note) ILIKE '%'||$1||'%' OR EXISTS(SELECT 1 FROM crm_messages m WHERE m.lead_id=l.id AND m.text ILIKE '%'||$1||'%')) AND ($2='' OR l.status=$2) AND ($3='' OR c.source=$3) ORDER BY l.updated_at DESC,l.id DESC LIMIT 51 OFFSET $4",args);
    return json(res,200,{leads:data.rows.slice(0,50),hasMore:data.rows.length>50,page});
   }
   if(req.method==='GET'&&p==='/api/crm/summary'){
    const summary=await pool.query('SELECT status,count(*)::int AS count FROM crm_leads GROUP BY status');
    const contacts=await pool.query('SELECT count(*)::int AS count FROM crm_contacts');
    const bySource=await pool.query('SELECT c.source,count(*)::int AS count FROM crm_leads l JOIN crm_contacts c ON c.id=l.contact_id GROUP BY c.source ORDER BY count DESC');
    return json(res,200,{status:Object.fromEntries(summary.rows.map(x=>[x.status,x.count])),contacts:contacts.rows[0].count,sources:bySource.rows});
   }
   if(req.method==='GET'&&p==='/api/crm/clients'){
    const q=clean(url.searchParams.get('q'),100);
    const page=Math.max(0,Math.min(1000,Number.parseInt(url.searchParams.get('page')||'0',10)||0));
    const r=await pool.query("SELECT c.id,c.source,c.name,c.phone,c.external_id,c.updated_at,(SELECT count(*)::int FROM crm_leads l WHERE l.contact_id=c.id) AS lead_count FROM crm_contacts c WHERE ($1='' OR concat_ws(' ',c.name,c.phone,c.external_id) ILIKE '%'||$1||'%') ORDER BY c.updated_at DESC,c.id DESC LIMIT 51 OFFSET $2",[q,page*50]);
    return json(res,200,{clients:r.rows.slice(0,50),hasMore:r.rows.length>50,page});
   }
   const client=p.match(/^\/api\/crm\/clients\/(\d{1,18})$/);
   if(req.method==='GET'&&client){const r=await pool.query(rowsQuery+' WHERE c.id=$1 ORDER BY l.updated_at DESC LIMIT 100',[client[1]]);return json(res,200,{leads:r.rows})}
   if(req.method==='GET'&&p==='/api/crm/bookings'){
    const r=await pool.query(rowsQuery+" WHERE l.booking_at IS NOT NULL AND l.status='booked' ORDER BY l.booking_at LIMIT 100");
    return json(res,200,{bookings:r.rows});
   }
   if(req.method==='POST'&&p==='/api/crm/leads'){
    const b=parse(await rawBody(req,16384));if(!b||typeof b!=='object'||(!clean(b.name,200)&&!clean(b.phone,40)))throw invalid('Укажите имя или телефон');
    const source=sources.has(b.source)?b.source:'manual';
    const phone=clean(b.phone,40);
    // Manual entries must not share an identifier namespace with automatic events.
    const ext='manual:'+randomUUID();
    await ingest({source,externalId:ext,eventId:ext,name:b.name,phone,service:b.service,note:b.note,text:b.note||'Добавлено вручную'});
    return json(res,201,{ok:true});
   }
   const lead=p.match(/^\/api\/crm\/leads\/(\d{1,18})$/);
   if(lead&&req.method==='GET'){
    const r=await pool.query(rowsQuery+' WHERE l.id=$1',[lead[1]]);
    if(!r.rowCount)return json(res,404,{error:'Заявка не найдена'});
    const msgs=await pool.query('SELECT id,text,source,created_at FROM crm_messages WHERE lead_id=$1 ORDER BY id DESC LIMIT 100',[lead[1]]);
    return json(res,200,{lead:r.rows[0],messages:msgs.rows.reverse()});
   }
   if(lead&&req.method==='POST'){
    const b=parse(await rawBody(req,16384));if(!b||!statusNames.has(b.status))throw invalid('Недопустимый статус');
    let booking=null;
    if(b.bookingAt){booking=new Date(b.bookingAt);if(!Number.isFinite(booking.getTime()))throw invalid('Неверная дата')}
    const r=await pool.query('UPDATE crm_leads SET status=$2,service=$3,note=$4,booking_at=$5,updated_at=now() WHERE id=$1 RETURNING id',[lead[1],b.status,clean(b.service,200),clean(b.note),b.status==='booked'?booking:null]);
    return json(res,r.rowCount?200:404,r.rowCount?{ok:true}:{error:'Заявка не найдена'});
   }
   if(client&&req.method==='DELETE'){
    await pool.query("WITH deleted AS (DELETE FROM crm_contacts WHERE id=$1 RETURNING source,external_id) DELETE FROM crm_bot_state WHERE chat_id IN (SELECT external_id FROM deleted WHERE source='telegram')",[client[1]]);return json(res,200,{ok:true});
   }
   return json(res,404,{error:'Not found'});
  }catch(e){return json(res,e.status|| (e.code==='23505'?409:503),{error:e.status?e.message:e.code==='23505'?'У клиента уже есть открытая заявка':'CRM временно недоступна'})}
 }
 function secretFor(provider){return provider==='instagram'&&process.env.INSTAGRAM_LOGIN_MODE!=='unified'?process.env.INSTAGRAM_CLIENT_SECRET:process.env.META_APP_SECRET}
 async function webhook(req,res,url){
  const provider=url.pathname.split('/').pop();
  if(!['instagram','whatsapp','telegram'].includes(provider))return textReply(res,404,'Not found');
  if(provider!=='telegram'&&req.method==='GET'){
   const token=process.env.META_WEBHOOK_VERIFY_TOKEN;
   if(token&&url.searchParams.get('hub.mode')==='subscribe'&&eq(url.searchParams.get('hub.verify_token'),token))return textReply(res,200,url.searchParams.get('hub.challenge')||'');
   return textReply(res,403,'Forbidden');
  }
  if(req.method!=='POST')return textReply(res,405,'Method not allowed');
  try{
   const raw=await rawBody(req);
   if(provider==='telegram'){
    if(process.env.TELEGRAM_UPDATE_MODE==='polling')return textReply(res,410,'Polling enabled');
    const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
    if(!secret||!process.env.TELEGRAM_BOT_TOKEN||!eq(req.headers['x-telegram-bot-api-secret-token'],secret))return textReply(res,403,'Forbidden');
    await telegram.handle(parse(raw));
   }else{
    const secret=secretFor(provider);
    if(!secret||!eq(req.headers['x-hub-signature-256'],'sha256='+createHmac('sha256',secret).update(raw).digest('hex')))return textReply(res,403,'Forbidden');
    const b=parse(raw),account=records.get(provider);
    if(account&&account.state==='authorized'){
     for(const entry of Array.isArray(b.entry)?b.entry:[]){
      if(provider==='instagram'&&b.object==='instagram'&&String(entry.id)===String(account.userId)){
        // Polling and Webhook IDs are not proven equivalent. Use one ingest path.
        if(process.env.INSTAGRAM_UPDATE_MODE==='polling'&&pollingAccount(account))continue;
       for(const m of entry.messaging||[]){if(m.message?.mid&&!m.message.is_echo&&m.sender?.id&&String(m.sender.id)!==String(account.userId))await ingest({source:provider,eventId:m.message.mid,externalId:String(m.sender.id),text:m.message.text})}
      }else if(provider==='whatsapp'&&b.object==='whatsapp_business_account'&&String(entry.id)===String(account.wabaId)){
       for(const change of entry.changes||[]){const v=change.value;if(String(v?.metadata?.phone_number_id)!==String(account.phoneId))continue;
        for(const m of v.messages||[]){if(!m.id||!m.from)continue;const contact=(v.contacts||[]).find(x=>x.wa_id===m.from);await ingest({source:provider,eventId:m.id,externalId:m.from,phone:'+'+m.from,name:contact?.profile?.name,text:m.text?.body||m.button?.text||m.image?.caption||m.video?.caption})}
       }
      }
     }
    }
   }
   return textReply(res,200,'OK');
  }catch(e){return textReply(res,e.status||503,'Retry later')}
 }
 let busy=false;
 const timer=setInterval(async()=>{
  if(busy||!process.env.TELEGRAM_BOT_TOKEN||!/^\d+$/.test(process.env.TELEGRAM_ADMIN_CHAT_ID||''))return;
  busy=true;let c;
  try{
   c=await pool.connect();await c.query('BEGIN');
   const r=await c.query("SELECT n.id,n.lead_id,n.attempts,c.source FROM crm_notifications n JOIN crm_leads l ON l.id=n.lead_id JOIN crm_contacts c ON c.id=l.contact_id WHERE sent_at IS NULL AND next_attempt_at<=now() AND attempts<12 ORDER BY n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1");
   if(r.rowCount){
    const n=r.rows[0];let ok=false;
    try{await telegram.send(process.env.TELEGRAM_ADMIN_CHAT_ID,'Новая заявка #'+n.lead_id+' · '+n.source,[[{text:'Открыть заявку',callback_data:'lead:'+n.lead_id}],[{text:'Рабочий кабинет',url:origin+'/admin/'}]]);ok=true}catch{}
    if(ok)await c.query('UPDATE crm_notifications SET sent_at=now() WHERE id=$1',[n.id]);
    else await c.query("UPDATE crm_notifications SET attempts=attempts+1,next_attempt_at=now()+($2::int * interval '1 second') WHERE id=$1",[n.id,Math.min(3600,30*2**n.attempts)]);
   }
   await c.query('COMMIT');
  }catch{if(c)await c.query('ROLLBACK').catch(()=>{})}finally{c?.release();busy=false}
 },5000);timer.unref();
 const reminderTimer=setInterval(()=>void telegram.reminders().catch(()=>{}),60000);reminderTimer.unref();
 const poller=process.env.TELEGRAM_UPDATE_MODE==='polling'&&process.env.TELEGRAM_BOT_TOKEN?startTelegramPolling({call:telegram.call,handle:telegram.handle}):null;
 const instagramPoller=process.env.INSTAGRAM_UPDATE_MODE==='polling'?startInstagramPolling({records,pool,ingest}):null;
 const dikidiMailPoller=await startGmailMailboxPolling({pool,ingest});
 return {admin,webhook,ingest,telegram,close:async()=>{clearInterval(timer);clearInterval(reminderTimer);await poller?.stop();await instagramPoller?.stop();await dikidiMailPoller?.stop();await pool.end()}};
}

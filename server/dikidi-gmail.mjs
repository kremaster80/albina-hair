import {createHash} from 'node:crypto';
import {parseDikidiBookingEmail} from './dikidi-email.mjs';

const GMAIL='imap.gmail.com';
const intervalMs=60000;

export function gmailConfig(env=process.env){
 const user=String(env.DIKIDI_GMAIL_USER||'').trim().toLowerCase();
 const from=String(env.DIKIDI_MAIL_SENDER||'').trim().toLowerCase();
 const password=String(env.DIKIDI_GMAIL_APP_PASSWORD||'').replace(/\s/g,'');
 return /^[^@\s]+@gmail\.com$/.test(user)&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)&&password.length===16
  ? {user,from,password}:null;
}

export function trustedDikidiMail(parsed,expectedFrom){
 const from=parsed?.from?.value;
 if(!Array.isArray(from)||from.length!==1||String(from[0]?.address||'').toLowerCase()!==expectedFrom)return false;
 const domain=expectedFrom.split('@')[1];
 return (parsed.headerLines||[]).some(header=>{
  if(header.key!=='authentication-results'||!/^Authentication-Results:\s*mx\.google\.com\s*;/i.test(header.line))return false;
  const match=/\bdkim=pass\b[^;\r\n]*?\bheader\.(?:i|d)=@?([a-z0-9.-]+)/i.exec(header.line);
  if(!match)return false;
  const signer=match[1].toLowerCase();
  return signer===domain||signer.endsWith('.'+domain);
 });
}

// DIKIDI emails do not include the year. Infer it only if the planned start
// lies in [-36h, +366 days] of the *Gmail received timestamp*.
export function inferMoscowBookingAt(booking,receivedAt){
 const received=+new Date(receivedAt);
 if(!Number.isFinite(received)||!booking||booking.type!=='booking_created')return null;
 const years=[new Date(received).getUTCFullYear()-1,new Date(received).getUTCFullYear(),new Date(received).getUTCFullYear()+1];
 const dates=years.map(y=>{
  const ms=Date.UTC(y,booking.month-1,booking.day,Number(booking.localTime.slice(0,2))-3,Number(booking.localTime.slice(3)),0);
  const local=new Date(ms+3*3600_000);
  return local.getUTCFullYear()===y&&local.getUTCMonth()===booking.month-1&&local.getUTCDate()===booking.day?ms:null;
 }).filter(Number.isFinite).filter(ms=>ms>=received-36*3600_000&&ms<=received+366*86400_000).sort((a,b)=>a-b);
 return dates.length?new Date(dates[0]):null;
}

export async function scanDikidiMailbox({pool,ingest,config,imapFactory,parseMime}){
 const client=await imapFactory(config);
 await client.connect();
 try{
  const lock=await client.getMailboxLock('INBOX');
  try{
   const validity=String(client.mailbox.uidValidity);
   const next=Number(client.mailbox.uidNext);
   if(!validity||!Number.isSafeInteger(next)||next<1)throw Error('Missing Gmail UID state');
   const result=await pool.query('SELECT uid_validity,last_uid FROM crm_dikidi_mail_sync WHERE mailbox=$1',[config.user]);
   let cursor;
   if(!result.rowCount||result.rows[0].uid_validity!==validity){
    cursor=next-1;
    await pool.query("INSERT INTO crm_dikidi_mail_sync(mailbox,uid_validity,last_uid) VALUES($1,$2,$3) ON CONFLICT(mailbox) DO UPDATE SET uid_validity=$2,last_uid=$3,updated_at=now()",[config.user,validity,cursor]);
    console.info('[dikidi-mail] checkpoint initialised, old mail skipped');
    return;
   }
   cursor=Number(result.rows[0].last_uid);
   let processed=0,imported=0;
   // Limit work per scan. A later scan resumes from the saved UID.
   for await(const item of client.fetch((cursor+1)+':*',{uid:true,source:true,internalDate:true},{uid:true})){
    if(item.uid<=cursor)continue;
    if(++processed>100)break;
    if(Buffer.byteLength(item.source||'')<=512000){
     const mail=await parseMime(item.source);
     if(trustedDikidiMail(mail,config.from)){
      const booking=parseDikidiBookingEmail(mail.text||'');
      if(booking){
       const at=inferMoscowBookingAt(booking,item.internalDate||mail.date);
       if(at){
        const id=createHash('sha256').update(config.user+'\n'+String(mail.messageId||validity+':'+item.uid)).digest('hex');
        const text='Запись DIKIDI: '+booking.master+'; '+booking.day+'.'+String(booking.month).padStart(2,'0')+
           ' в '+booking.localTime+'; длительность '+booking.durationMinutes+' мин.';
        if(await ingest({source:'dikidi',externalId:booking.clientPhone,
          eventId:'gmail:'+id,name:booking.clientName,phone:booking.clientPhone,
          text,note:'DIKIDI Email · '+text,bookingAt:at}))imported++;
       }
      }
     }
    }
    cursor=item.uid;
    await pool.query('UPDATE crm_dikidi_mail_sync SET last_uid=$2,updated_at=now() WHERE mailbox=$1 AND uid_validity=$3',[config.user,cursor,validity]);
   }
   console.info('[dikidi-mail] ok scanned='+Math.min(processed,100)+' imported='+imported);
  }finally{lock.release()}
 }finally{await client.logout().catch(()=>{})}
}

export function startDikidiGmailPolling({pool,ingest,config=gmailConfig(),imapFactory,parseMime,delayMs=intervalMs}){
 if(!config)return null;
 let stopped=false,timer,active,backoff=delayMs;
 const run=()=>{
  if(stopped)return;
  active=scanDikidiMailbox({pool,ingest,config,imapFactory,parseMime}).then(()=>{backoff=delayMs}).catch(e=>{
   // Errors must never log email content, credentials, phone numbers, or bodies.
   console.warn('[dikidi-mail] scan failed, will retry');
   backoff=Math.min(backoff*2,300000);
  }).finally(()=>{
   if(!stopped){timer=setTimeout(run,backoff);timer.unref?.()}
  });
 };
 run();
 return {stop:async()=>{stopped=true;clearTimeout(timer);await active}};
}

export async function startGmailMailboxPolling({pool,ingest}){
 const config=gmailConfig();
 if(!config)return null;
 const {ImapFlow}=await import('imapflow');
 const {simpleParser}=await import('mailparser');
 return startDikidiGmailPolling({
  pool,ingest,config,
  imapFactory:()=>new ImapFlow({host:GMAIL,port:993,secure:true,auth:{user:config.user,pass:config.password},
    logger:false,connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000}),
  parseMime:source=>simpleParser(source,{skipHtmlToText:true,skipTextToHtml:true})
 });
}

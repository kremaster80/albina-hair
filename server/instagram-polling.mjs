// Opt-in, read-only polling for the verified Unified Login account.
const graph='https://graph.facebook.com/v27.0/';
const idOK=s=>typeof s==='string'&&/^[A-Za-z0-9_=:-]{1,300}$/.test(s);
const numeric=s=>typeof s==='string'&&/^\d{5,30}$/.test(s);
const time=s=>Date.parse(s);
export const pollingAccount=r=>r?.state==='authorized'&&r.loginMode==='unified'&&numeric(r.userId)&&typeof r.accessToken==='string'&&r.accessToken.length>0&&Number.isFinite(time(r.connectedAt));
function safeError(code){return Object.assign(new Error('Instagram API polling failed'),{safeCode:Number.isInteger(code)?code:0})}
export async function graphRequest(edge,params,token){
 const url=new URL(graph+edge);url.search=new URLSearchParams(params).toString();
 const r=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(12000)});
 const b=await r.json();
 if(!r.ok||b.error)throw safeError(b.error?.code);
 return b;
}
export async function collectInstagram({account,since,until,request=graphRequest}){
 if(!pollingAccount(account))throw safeError(0);
 const call=(edge,params)=>request(edge,params,account.accessToken);
 const events=[];let after='',truncated=0;const seen=new Set(),cursors=new Set();
 for(let page=0;page<10;page++){
  const list=await call(account.userId+'/conversations',{platform:'instagram',fields:'id,updated_time',limit:'50',...(after?{after}:{})});
  if(!Array.isArray(list.data))throw safeError(0);
  for(const c of list.data){
   if(!idOK(c.id)||!Number.isFinite(time(c.updated_time)))throw safeError(0);
   if(time(c.updated_time)<since||seen.has(c.id))continue;
   seen.add(c.id);
   const messages=await call(c.id+'/messages',{limit:'20'});
   if(!Array.isArray(messages.data))throw safeError(0);
   let oldest=Infinity;
   for(const item of messages.data.slice(0,20)){
    if(!idOK(item.id))throw safeError(0);
    const m=await call(item.id,{fields:'id,created_time,from,to,message'});
    const at=time(m.created_time);
    if(m.id!==item.id||!Number.isFinite(at))throw safeError(0);
    oldest=Math.min(oldest,at);
    if(at<since||at>until||!numeric(m.from?.id)||m.from.id===account.userId||
      !m.to?.data?.some(x=>x.id===account.userId))continue;
    events.push({source:'instagram',eventId:m.id,externalId:m.from.id,name:m.from.username,text:m.message,at});
   }
   if((messages.paging?.next||messages.data.length>=20)&&oldest>=since)truncated++;
  }
  if(!list.paging?.next)return {events:events.sort((a,b)=>a.at-b.at||a.eventId.localeCompare(b.eventId)),truncated};
  after=list.paging?.cursors?.after;
  if(typeof after!=='string'||!after||cursors.has(after))throw safeError(0);
  cursors.add(after);
 }
 throw safeError(0); // no checkpoint advance when the conversation scan is incomplete
}
export function startInstagramPolling({records,pool,ingest,intervalMs=30000,request=graphRequest}){
 let stopped=false,timer,active,delay=intervalMs;
 const tick=async()=>{
  const account=records.get('instagram');
  if(!pollingAccount(account))return;
  const key=account.userId+':'+account.connectedAt;
  const now=Date.now();
  // Start from the first opt-in run, not from old conversations.
  const row=(await pool.query('INSERT INTO crm_instagram_poll_state(connection_key,started_at,watermark) VALUES($1,$2,$2) ON CONFLICT(connection_key) DO UPDATE SET connection_key=EXCLUDED.connection_key RETURNING started_at,watermark',[key,new Date(now)])).rows[0];
  const since=Math.max(+row.started_at,+row.watermark-120000);
  const {events,truncated}=await collectInstagram({account,since,until:now,request});
  let imported=0;
  for(const e of events){
   if(stopped||records.get('instagram')!==account)return;
   if(await ingest(e))imported++;
  }
  if(stopped||records.get('instagram')!==account)return;
  await pool.query('UPDATE crm_instagram_poll_state SET watermark=GREATEST(watermark,$2) WHERE connection_key=$1',[key,new Date(now)]);
  console.info('[instagram-poll] ok imported='+imported+' limited_threads='+truncated);
  if(truncated)console.warn('[instagram-poll] older messages may be outside API 20-message detail window');
 };
 const run=()=>{
  if(stopped)return;
  active=tick().then(()=>{delay=intervalMs}).catch(e=>{
   console.warn('[instagram-poll] failed code='+(Number.isInteger(e.safeCode)?e.safeCode:0));
   delay=Math.min(300000,delay*2);
  }).finally(()=>{if(!stopped){timer=setTimeout(run,delay);timer.unref?.()}});
 };
 run();
 return {stop:async()=>{stopped=true;clearTimeout(timer);await active}};
}

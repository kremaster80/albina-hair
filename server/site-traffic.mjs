// Anonymous first-party marketing-source counters. No PII or visitor IDs in DB.
const sources = new Set(['2gis','yandex_maps','google_maps','instagram','direct','other']);
const actions = new Set(['visit','dikidi_click','telegram_click','instagram_click','questionnaire_copy']);
const cols = {visit:'visits',dikidi_click:'dikidi_clicks',telegram_click:'telegram_clicks',instagram_click:'instagram_clicks',questionnaire_copy:'questionnaire_copies'};

export function siteEventPayload(payload){
  if (!payload || typeof payload!=='object' || Array.isArray(payload)) return null;
  return sources.has(payload.source) && actions.has(payload.action)
    ? {source:payload.source,action:payload.action} : null;
}

export function createSiteTraffic({pool,origin}){
  // Short-lived in-memory abuse limiter. IP is never persisted or included in reports.
  const recent=new Map();
  function allowedRequest(req){
    const now=Date.now(),ip=req.socket?.remoteAddress||'unknown';
    if(recent.size>4096)recent.clear();
    const state=recent.get(ip);
    const item=state && now-state.start<60_000?state:{start:now,count:0};
    item.count++;
    recent.set(ip,item);
    return item.count<=120;
  }
  async function publicEvent(req,res){
    const reply=(code)=>{res.writeHead(code,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end()};
    if(req.method!=='POST') return reply(405);
    if(req.headers.origin!==origin || !String(req.headers['content-type']||'').startsWith('application/json')) return reply(403);
    if(!allowedRequest(req))return reply(429);
    try {
      let size=0;const parts=[];
      for await(const chunk of req){size+=chunk.length;if(size>1024)return reply(413);parts.push(chunk)}
      const payload=siteEventPayload(JSON.parse(Buffer.concat(parts).toString('utf8')));
      if(!payload)return reply(400);
      await pool.query("INSERT INTO crm_site_traffic(day,source,action,total) VALUES((now() AT TIME ZONE 'Europe/Moscow')::date,$1,$2,1) ON CONFLICT(day,source,action) DO UPDATE SET total=crm_site_traffic.total+1",[payload.source,payload.action]);
      return reply(204);
    }catch{return reply(503)}
  }
  async function summary(days=30){
    const period=[7,30,90].includes(days)?days:30;
    const {rows}=await pool.query("SELECT source,action,SUM(total)::bigint AS total FROM crm_site_traffic WHERE day >= (now() AT TIME ZONE 'Europe/Moscow')::date - ($1::int-1) GROUP BY source,action",[period]);
    const data=Object.fromEntries([...sources].map(source=>[source,{source,visits:0,dikidi_clicks:0,telegram_clicks:0,instagram_clicks:0,questionnaire_copies:0}]));
    for(const item of rows){if(data[item.source]&&cols[item.action])data[item.source][cols[item.action]]=Number(item.total)}
    const result=[...Object.values(data)].sort((a,b)=>b.visits-a.visits);
    const totals={visits:0,dikidi_clicks:0,telegram_clicks:0,instagram_clicks:0,questionnaire_copies:0};
    for(const row of result)for(const key of Object.keys(totals))totals[key]+=row[key];
    return {days:period,totals,sources:result};
  }
  return {publicEvent,summary};
}

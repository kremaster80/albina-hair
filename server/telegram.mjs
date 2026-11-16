// Telegram-first CRM. No bot secrets or credentials ever reach the browser.
const names={instagram:'Instagram',whatsapp:'WhatsApp',telegram:'Telegram',website:'Сайт',yandex:'Яндекс', '2gis':'2ГИС',google:'Google',dikidi:'DIKIDI',manual:'Вручную'};
const statuses={new:'Новая',working:'В работе',booked:'Записан',closed:'Закрыта'};
const questions=[
 ['Цель визита',['Освежить стрижку / корни','Уход и лечение','Изменить имидж']],
 ['История волос',['Натуральные','Окрашены в салоне','Домашнее окрашивание']],
 ['Процедуры за последний год',['Кератин / ботокс / завивка','Не было','Другое']],
 ['Частота ухода',['Каждые 3–4 недели','Раз в несколько месяцев','Раз в полгода или год']],
 ['Сервис и атмосфера',['Люблю общаться','Предпочитаю тишину','Без предпочтений']]
];
const clip=(x,n=500)=>String(x??'').trim().slice(0,n);
const btn=(text,callback_data)=>({text,callback_data});
const link=(text,url)=>({text,url});
const label=r=>clip(r.name||r.phone||'Клиент #'+(r.contact_id||r.id),100);
const date=x=>x?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(x))+' МСК':'не назначено';
function httpsURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
function appointment(value){
 const m=/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(value);
 if(!m)return null;
 const [,d,mo,y,h,mi]=m;
 if(+h>23||+mi>59||+mo<1||+mo>12||+d<1||+d>31)return null;
 const at=new Date(y+'-'+mo+'-'+d+'T'+h+':'+mi+':00+03:00');
 if(!Number.isFinite(+at)||+at<=Date.now())return null;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);
 const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));
 return p.day===d&&p.month===mo&&p.year===y&&p.hour===h&&p.minute===mi?at:null;
}
export function createTelegram({pool,ingest,origin,transport}){
 const adminId=()=>String(process.env.TELEGRAM_ADMIN_CHAT_ID||'');
 const pending=new Map();
 const policy=()=>httpsURL(process.env.TELEGRAM_PRIVACY_URL);
 const booking=()=>httpsURL(process.env.DIKIDI_BOOKING_URL);
 async function call(method,payload,{signal,timeoutMs=15000}={}){
  if(transport)return transport(method,payload);
  if(!process.env.TELEGRAM_BOT_TOKEN)throw new Error('Telegram token missing');
  const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok)throw Object.assign(new Error('Telegram delivery failed'),{telegramMethod:method,telegramCode:Number(j.error_code)||r.status});
  return j.result;
 }
 async function send(chat,text,rows=[]){return call('sendMessage',{chat_id:chat,text:clip(text,4000),...(rows.length?{reply_markup:{inline_keyboard:rows}}:{})})}
 async function getState(chat){return (await pool.query('SELECT mode,draft,consented_at,reminders FROM crm_bot_state WHERE chat_id=$1',[chat])).rows[0]||{mode:'',draft:{},consented_at:null,reminders:false}}
 async function mode(chat,value='',draft={}){await pool.query("INSERT INTO crm_bot_state(chat_id,mode,draft) VALUES($1,$2,$3) ON CONFLICT(chat_id) DO UPDATE SET mode=EXCLUDED.mode,draft=EXCLUDED.draft,updated_at=now()",[chat,value,JSON.stringify(draft)])}
 const back=[[btn('Главное меню','menu')]];
 async function adminMenu(chat){await mode(chat);return send(chat,'ALBINA · рабочий кабинет\n\nВыберите раздел.',[[btn('Новые заявки','list:new'),btn('Все заявки','list:all')],[btn('Клиенты','clients:0'),btn('Поиск','search')],[btn('Записи','bookings'),btn('Статистика','stats')],[link('Подключения и CRM',origin+'/admin/')]])}
 async function clientMenu(chat){await mode(chat);return send(chat,'Здравствуйте! Я помощник Альбины.\nВыберите, чем могу помочь.',[[btn('Заполнить анкету','questionnaire')],[btn('Написать Альбине','write')],...(booking()?[[link('Онлайн-запись DIKIDI',booking())]]:[]),[btn('Напоминания','reminders')],[btn('Условия обработки данных','privacy')]])}
 async function consent(chat){
  if(!policy())return send(chat,'Приём обращений пока не настроен. Свяжитесь с Альбиной напрямую через её сайт.',[[link('Сайт Альбины',origin+'/')]]);
  return send(chat,'Для отправки заявки в CRM требуется ваше согласие на обработку данных. Ознакомьтесь с политикой конфиденциальности. Согласие можно отозвать через /privacy.',[[link('Политика конфиденциальности',policy())],[btn('Согласен(на)','consent:yes')],[btn('Не согласен(на)','consent:no')]]);
 }
 const select="SELECT l.id,l.contact_id,l.status,l.service,l.note,l.booking_at,c.name,c.phone,c.source,c.external_id FROM crm_leads l JOIN crm_contacts c ON c.id=l.contact_id";
 async function list(chat,filter='all',offset=0){
  const list=(await pool.query(select+" WHERE ($1='all' OR l.status=$1) ORDER BY l.updated_at DESC,l.id DESC LIMIT 11 OFFSET $2",[filter,offset])).rows;
  const rows=list.slice(0,10).map(r=>[btn('#'+r.id+' · '+label(r)+' · '+statuses[r.status],'lead:'+r.id)]);
  const pages=[];if(offset>0)pages.push(btn('Назад','list:'+filter+':'+(offset-10)));if(list.length>10)pages.push(btn('Далее','list:'+filter+':'+(offset+10)));if(pages.length)rows.push(pages);
  return send(chat,list.length?'Заявки · '+(filter==='all'?'все':statuses[filter]):'Заявок нет.',[...rows,...back]);
 }
 async function lead(chat,id){
  const r=(await pool.query(select+' WHERE l.id=$1',[id])).rows[0];
  if(!r)return send(chat,'Заявка не найдена.',back);
  const msgs=(await pool.query('SELECT text FROM crm_messages WHERE lead_id=$1 ORDER BY id DESC LIMIT 5',[id])).rows.reverse();
  const text=['Заявка #'+id,label(r),'Источник: '+(names[r.source]||r.source),'Статус: '+statuses[r.status],'Телефон: '+(r.phone||'не указан'),'Услуга: '+(r.service||'не указана'),'Запись: '+date(r.booking_at),r.note?'Комментарий: '+clip(r.note,300):'',msgs.length?'Последние сообщения:\n'+msgs.map(m=>'• '+clip(m.text,350)).join('\n'):''].filter(Boolean).join('\n');
  return send(chat,text,[[btn('В работу','status:'+id+':working'),btn('Закрыть','status:'+id+':closed')],[btn('Назначить визит','book:'+id),btn('Новая','status:'+id+':new')],[btn('Клиент','client:'+r.contact_id)],[btn('К заявкам','list:all'),btn('Меню','menu')]]);
 }
 async function clients(chat,q='',offset=0){
  const r=(await pool.query("SELECT id,name,phone,source FROM crm_contacts WHERE ($1='' OR concat_ws(' ',name,phone,external_id) ILIKE '%'||$1||'%' OR ($2<>'' AND regexp_replace(phone,'[^0-9]','','g') LIKE '%'||$2||'%')) ORDER BY updated_at DESC,id DESC LIMIT 11 OFFSET $3",[q,q.replace(/\D/g,''),offset])).rows;
  const rows=r.slice(0,10).map(c=>[btn(label(c)+' · '+(names[c.source]||c.source),'client:'+c.id)]);
  const pg=[];if(offset>0)pg.push(btn('Назад','clients:'+(offset-10)));if(r.length>10&&!q)pg.push(btn('Далее','clients:'+(offset+10)));if(pg.length&&!q)rows.push(pg);
  if(q&&r.length>10)rows.push([btn('Уточнить поиск','search')]);
  return send(chat,r.length?(q?'Результаты поиска':'Клиентская база'):'Клиенты не найдены.',[...rows,...back]);
 }
 async function client(chat,id){
  const r=(await pool.query('SELECT id,name,phone,source FROM crm_contacts WHERE id=$1',[id])).rows[0];
  if(!r)return send(chat,'Клиент не найден.',back);
  const history=(await pool.query("SELECT id,status,service FROM crm_leads WHERE contact_id=$1 ORDER BY updated_at DESC LIMIT 10",[id])).rows;
  return send(chat,[label(r),'Телефон: '+(r.phone||'не указан'),'Канал: '+(names[r.source]||r.source),'Последние заявки:'].join('\n'),[...history.map(l=>[btn('#'+l.id+' · '+statuses[l.status]+' · '+clip(l.service,24),'lead:'+l.id)]),...back]);
 }
 async function stats(chat){
  const result=(await pool.query('SELECT status,count(*)::int AS count FROM crm_leads GROUP BY status')).rows;
  const c=(await pool.query('SELECT count(*)::int AS count FROM crm_contacts')).rows[0].count;
  const by=(await pool.query('SELECT c.source,count(*)::int AS count FROM crm_leads l JOIN crm_contacts c ON c.id=l.contact_id GROUP BY c.source ORDER BY count DESC')).rows;
  const counts=Object.fromEntries(result.map(x=>[x.status,x.count]));
  return send(chat,['Статистика','Клиентов: '+c,...Object.entries(statuses).map(([k,v])=>v+': '+(counts[k]||0)),'','Источники:',...by.map(x=>(names[x.source]||x.source)+': '+x.count)].join('\n'),back);
 }
 async function bookings(chat){
  const r=(await pool.query(select+" WHERE l.status='booked' AND l.booking_at>=now() ORDER BY l.booking_at LIMIT 20")).rows;
  return send(chat,'Предстоящие визиты (локальные записи, без синхронизации DIKIDI)\n'+(r.length?r.map(x=>'• '+date(x.booking_at)+' — '+label(x)).join('\n'):'Записей нет.'),[...r.map(x=>[btn('#'+x.id+' · '+label(x),'lead:'+x.id)]),...back]);
 }
 async function question(chat,index,answers){
  await mode(chat,'question',{index,answers});
  const [title,options]=questions[index];
  return send(chat,(index+1)+' из '+questions.length+' · '+title,[...options.map((s,i)=>[btn(s,'q:'+index+':'+i)]),[btn('Отмена','menu')]]);
 }
 async function adminAction(chat,data,text,state){
  if(data==='menu'||text==='/start'||text==='/menu')return adminMenu(chat);
  if(data==='search'){await mode(chat,'search');return send(chat,'Введите имя или телефон клиента.',back)}
  if(data==='stats'||text==='/stats')return stats(chat);
  if(data==='bookings'||text==='/bookings')return bookings(chat);
  if(text==='/leads')return list(chat);
  if(text==='/clients')return clients(chat);
  let m;
  if((m=/^list:(all|new|working|booked|closed)(?::(\d{1,4}))?$/.exec(data)))return list(chat,m[1],Number(m[2]||0));
  if((m=/^clients:(\d{1,4})$/.exec(data)))return clients(chat,'',Number(m[1]));
  if((m=/^lead:(\d{1,18})$/.exec(data)))return lead(chat,m[1]);
  if((m=/^client:(\d{1,18})$/.exec(data)))return client(chat,m[1]);
  if((m=/^status:(\d{1,18}):(new|working|closed)$/.exec(data))){
   try{await pool.query('UPDATE crm_leads SET status=$2,booking_at=NULL,updated_at=now() WHERE id=$1',[m[1],m[2]])}catch(e){if(e.code==='23505')return send(chat,'У клиента уже есть другая открытая заявка.',back);throw e}
   return lead(chat,m[1]);
  }
  if((m=/^book:(\d{1,18})$/.exec(data))){await mode(chat,'booking',{id:m[1]});return send(chat,'Введите подтверждённые дату и время визита в формате ДД.ММ.ГГГГ ЧЧ:ММ (МСК).\nЭто локальная запись; DIKIDI не изменится.',back)}
  if(!data&&text&&state.mode==='search'){await mode(chat);return clients(chat,clip(text,100))}
  if(!data&&text&&state.mode==='booking'){
   const at=appointment(text);
   if(!at)return send(chat,'Введите корректную будущую дату в формате ДД.ММ.ГГГГ ЧЧ:ММ (МСК).',back);
   const id=String(state.draft.id||'');if(!/^\d{1,18}$/.test(id))return adminMenu(chat);
   await pool.query("UPDATE crm_leads SET status='booked',booking_at=$2,updated_at=now() WHERE id=$1",[id,at]);await mode(chat);return lead(chat,id);
  }
  return adminMenu(chat);
 }
 async function clientAction(chat,user,data,text,state,updateId){
  const name=[user.first_name,user.last_name].filter(Boolean).join(' ');
  if(data==='privacy'||text==='/privacy')return send(chat,'Управление согласием и напоминаниями.',[...(policy()?[[link('Политика конфиденциальности',policy())]]:[]),[btn('Отозвать согласие','consent:revoke')],[btn('Меню','menu')]]);
  if(data==='consent:revoke'){
   await pool.query("UPDATE crm_bot_state SET consented_at=NULL,reminders=false,mode='',draft='{}' WHERE chat_id=$1",[chat]);
   return send(chat,'Согласие отозвано. Новые обращения не сохраняются, напоминания отключены. Для удаления ранее сохранённых данных обратитесь к Альбине.',back);
  }
  if(data==='consent:no'){await pool.query("UPDATE crm_bot_state SET consented_at=NULL,reminders=false,mode='',draft='{}' WHERE chat_id=$1",[chat]);return send(chat,'Без согласия я не сохраняю обращения. Можно связаться с Альбиной напрямую.',[[link('Сайт Альбины',origin+'/')]]);}
  if(data==='consent:yes'){
   if(!policy())return consent(chat);
   await pool.query("INSERT INTO crm_bot_state(chat_id,consented_at) VALUES($1,now()) ON CONFLICT(chat_id) DO UPDATE SET consented_at=now(),updated_at=now()",[chat]);return clientMenu(chat);
  }
  if(!state.consented_at||!policy())return consent(chat);
  if(data==='menu'||text==='/start'||text==='/menu')return clientMenu(chat);
  if(data==='reminders')return send(chat,'Напоминания о подтверждённых локальных визитах: '+(state.reminders?'включены':'выключены')+'.',[[btn('Включить','remind:on'),btn('Выключить','remind:off')],...back]);
  if(data==='remind:on'||data==='remind:off'){await pool.query('UPDATE crm_bot_state SET reminders=$2 WHERE chat_id=$1',[chat,data==='remind:on']);return send(chat,data==='remind:on'?'Напоминания включены.':'Напоминания выключены.',back)}
  if(data==='questionnaire')return question(chat,0,[]);
  if(data==='write'){await mode(chat,'write');return send(chat,'Напишите сообщение Альбине. Оно будет передано в CRM.',back)}
  let m;
  if((m=/^q:(\d):(\d)$/.exec(data))){
   const i=Number(m[1]),answer=Number(m[2]);
   if(state.mode!=='question'||state.draft.index!==i||!questions[i]?.[1]?.[answer])return send(chat,'Откройте актуальный вопрос или начните анкету заново.',back);
   const answers=[...(state.draft.answers||[]),questions[i][0]+': '+questions[i][1][answer]];
   if(i+1<questions.length)return question(chat,i+1,answers);
   await mode(chat,'confirm',{answers});return send(chat,'Проверьте анкету:\n\n'+answers.join('\n'),[[btn('Отправить Альбине','question:submit')],...back]);
  }
  if(data==='question:submit'&&state.mode==='confirm'){
   const answers=state.draft.answers||[];
   if(answers.length!==questions.length)return clientMenu(chat);
   await ingest({source:'telegram',eventId:String(updateId),externalId:chat,name,text:'Анкета перед записью:\n'+answers.join('\n'),note:answers.join('\n')});
   await mode(chat);return send(chat,'Анкета отправлена Альбине. Это заявка, а не подтверждение записи.',[...(booking()?[[link('Выбрать время в DIKIDI',booking())]]:[]),...back]);
  }
  if(!data&&text&&!text.startsWith('/')&&!['question','confirm'].includes(state.mode)){
   await ingest({source:'telegram',eventId:String(updateId),externalId:chat,name,text:clip(text,4000)});
   await mode(chat);return send(chat,'Сообщение передано Альбине.',back);
  }
  return clientMenu(chat);
 }
 async function handle(update){
  const callback=update.callback_query,m=callback?.message||update.message,u=callback?.from||update.message?.from;
  if(!u||u.is_bot||m?.chat?.type!=='private'||String(m.chat.id)!==String(u.id)||update.update_id==null)return;
  const chat=String(u.id),data=clip(callback?.data,64),text=clip(update.message?.text||update.message?.caption,4000);
  // Single Node process: queue each chat independently without occupying a DB
  // connection while waiting for Telegram. Update dedup survives process restarts.
  const previous=pending.get(chat)||Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
   if((await pool.query('SELECT 1 FROM crm_bot_updates WHERE update_id=$1',[String(update.update_id)])).rowCount)return;
   if(callback)await call('answerCallbackQuery',{callback_query_id:callback.id}).catch(()=>{});
   const state=await getState(chat);
   if(/^\d+$/.test(adminId())&&chat===adminId())await adminAction(chat,data,text,state);
   else await clientAction(chat,u,data,text,state,update.update_id);
   await pool.query('INSERT INTO crm_bot_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING',[String(update.update_id)]);
  });
  pending.set(chat,job);
  try{await job}finally{if(pending.get(chat)===job)pending.delete(chat)}
 }
 let reminderBusy=false;
 async function reminders(){
  if(reminderBusy||!process.env.TELEGRAM_BOT_TOKEN||!policy())return;
  reminderBusy=true;
  try{
   // Only confirmed, local bookings and clients who opted in. Never infer a DIKIDI appointment.
   await pool.query("INSERT INTO crm_bot_reminders(lead_id,booking_at) SELECT l.id,l.booking_at FROM crm_leads l JOIN crm_contacts c ON c.id=l.contact_id JOIN crm_bot_state s ON s.chat_id=c.external_id WHERE c.source='telegram' AND c.external_id ~ '^[0-9]+$' AND s.consented_at IS NOT NULL AND s.reminders AND l.status='booked' AND l.booking_at>now()+interval '1 hour' AND l.booking_at<=now()+interval '24 hours' ON CONFLICT DO NOTHING");
   const r=(await pool.query("SELECT n.id,n.attempts,l.booking_at,c.external_id FROM crm_bot_reminders n JOIN crm_leads l ON l.id=n.lead_id JOIN crm_contacts c ON c.id=l.contact_id JOIN crm_bot_state s ON s.chat_id=c.external_id WHERE n.sent_at IS NULL AND n.attempts<8 AND n.next_attempt_at<=now() AND s.consented_at IS NOT NULL AND s.reminders AND c.source='telegram' AND c.external_id ~ '^[0-9]+$' AND c.external_id<>$1 AND l.status='booked' AND l.booking_at=n.booking_at AND l.booking_at>now()+interval '1 hour' AND l.booking_at<=now()+interval '24 hours' ORDER BY l.booking_at LIMIT 10",[adminId()])).rows;
   for(const item of r){
    try{await send(item.external_id,'Напоминание от Альбины: у вас запланирован визит '+date(item.booking_at)+'. Если планы изменились, свяжитесь с Альбиной.',[[btn('Отключить напоминания','remind:off')]]);await pool.query('UPDATE crm_bot_reminders SET sent_at=now() WHERE id=$1',[item.id])}
    catch{await pool.query("UPDATE crm_bot_reminders SET attempts=attempts+1,next_attempt_at=now()+($2::int*interval '1 second') WHERE id=$1",[item.id,Math.min(1800,60*2**item.attempts)])}
   }
  }finally{reminderBusy=false}
 }
 return {handle,call,send,reminders};
}

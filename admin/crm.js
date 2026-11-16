'use strict';
(() => {
const $=id=>document.getElementById(id);
const names={instagram:'Instagram',whatsapp:'WhatsApp',telegram:'Telegram',website:'Сайт',yandex:'Яндекс', '2gis':'2ГИС',google:'Google',dikidi:'DIKIDI',manual:'Вручную'};
const states={new:'Новая',working:'В работе',booked:'Записан',closed:'Закрыта'};
const views={leads:['Заявки','Все обращения','Новые клиенты и история общения.'],clients:['Клиенты','Клиентская база','Контакты по каналам связи и история обращений.'],bookings:['Записи','Запланированные визиты','Локальные записи. Расписание DIKIDI пока не синхронизировано.'],stats:['Статистика','Источники обращений','Число заявок по каждому каналу.']};
let view='leads',page=0,seq=0,timer,summary=null;
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function labelName(r){return r.name||r.phone||'Клиент '+(r.external_id?.startsWith('manual:')?'':r.external_id||'')}
function fmt(value,full=false){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('ru-RU',full?{dateStyle:'medium',timeStyle:'short'}:{day:'numeric',month:'short'}):'—'}
async function api(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 if(response.status===401){location.replace('/admin/');throw new Error('Сессия завершена')}
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Ошибка сервера ('+response.status+')');return data;
}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text}
function empty(title,text){const n=el('div','empty');n.append(el('h3','',title),el('p','',text));$('results').replaceChildren(n)}
function metric(title,value){const n=el('div','metric');n.append(el('span','',title),el('strong','',String(value)));return n}
async function loadSummary(){
 try{summary=await api('/api/crm/summary');$('metrics').replaceChildren(metric('Новые заявки',summary.status.new||0),metric('В работе',summary.status.working||0),metric('Записаны',summary.status.booked||0),metric('Контакты',summary.contacts));return true}
 catch(e){$('metrics').replaceChildren();notice(e.message);return false}
}
function leadRow(r,booking=false){
 const row=el('button','lead-row');row.type='button';const main=el('div','');main.append(el('span','name',labelName(r)),el('span','preview',booking?(r.service||'Услуга не указана')+' · '+fmt(r.booking_at,true):(r.last_message||r.service||r.note||'Без сообщения')));
 row.append(main,el('span','source',names[r.source]||r.source),el('span','state '+r.status,states[r.status]||r.status),el('span','date',fmt(r.updated_at)));
 row.addEventListener('click',()=>void openLead(r.id));return row;
}
function clientRow(r){
 const row=el('button','lead-row');row.type='button';const main=el('div','');main.append(el('span','name',labelName(r)),el('span','preview',r.phone||'Контакт из '+(names[r.source]||r.source)));
 row.append(main,el('span','source',names[r.source]||r.source),el('span','state',r.lead_count+' заявок'),el('span','date',fmt(r.updated_at)));
 row.addEventListener('click',()=>void openClient(r));return row;
}
function renderStats(){
 const list=el('div','stat-list'),items=summary?.sources||[],total=items.reduce((a,b)=>a+Number(b.count),0);
 if(!items.length)return empty('Пока нет данных','Статистика появится после первой заявки.');
 for(const r of items){const row=el('div','stat-row');row.append(el('span','',names[r.source]||r.source),el('strong','',String(r.count)));const bar=el('div','bar'),fill=el('span');fill.style.width=(total?100*r.count/total:0)+'%';bar.append(fill);list.append(row,bar)}$('results').replaceChildren(list);
}
async function load(){
 const request=++seq;
 $('pagination').hidden=true;empty('Загрузка…','');
 try{
  const q=new URLSearchParams({q:$('search').value,page:String(page)});
  if(view==='stats'){if(await loadSummary()&&request===seq)renderStats();return}
  if(view==='leads'){q.set('status',$('status').value);q.set('source',$('source').value)}
  const data=await api('/api/crm/'+view+'?'+q);
  if(seq!==request)return;
  notice('');
  const list=data[view]||[];
  if(!list.length)empty(view==='clients'?'Нет контактов':view==='bookings'?'Нет записей':'Нет заявок', 'Когда появятся данные, они будут отображаться здесь.');
  else $('results').replaceChildren(...list.map(r=>view==='clients'?clientRow(r):leadRow(r,view==='bookings')));
  if(view!=='bookings'&&(data.hasMore||page>0)){$('pagination').hidden=false;$('prev').disabled=page===0;$('next').disabled=!data.hasMore;$('page').textContent='Страница '+(page+1)}
 }catch(e){if(request===seq){notice(e.message);empty('Данные недоступны','Проверьте подключение CRM и повторите попытку.')}}
}
function setView(v){
 if(!views[v])return;view=v;page=0;$('search').value='';$('status').value='';$('source').value='';
 const [title,section,note]=views[v];$('heading').textContent=title;$('section-title').textContent=section;$('section-note').textContent=note;
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
 $('filters').hidden=!['leads','clients'].includes(v);$('state-filter').hidden=v!=='leads';$('source-filter').hidden=v!=='leads';void load();
}
function openDialog(title,kicker='КАРТОЧКА'){$('dialog-title').textContent=title;$('dialog-kicker').textContent=kicker;$('dialog-error').textContent='';$('dialog-body').replaceChildren();if(!$('detail').open)$('detail').showModal();return $('dialog-body')}
function field(form,title,tag='input',value='',options={}){
 const l=el('label','',title),input=el(tag);if(tag==='select'){for(const [id,name] of Object.entries(options.choices||{})){const opt=el('option','',name);opt.value=id;input.append(opt)}}else if(options.type)input.type=options.type;
 input.value=value||'';if(options.required)input.required=true;if(options.max)input.maxLength=options.max;l.append(input);form.append(l);return input;
}
function submit(form,title,handler){
 const button=el('button','primary',title);button.type='submit';form.append(button);
 form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;$('dialog-error').textContent='';try{await handler();$('detail').close();await loadSummary();await load()}catch(err){$('dialog-error').textContent=err.message}finally{button.disabled=false}});
}
function openNew(){
 const body=openDialog('Новая заявка','ДОБАВЛЕНИЕ');const form=el('form','form-grid');body.append(form);
 const name=field(form,'Имя','input','',{max:200}),phone=field(form,'Телефон','input','',{type:'tel',max:40});
 const source=field(form,'Источник','select','manual',{choices:names}),service=field(form,'Услуга','input','',{max:200}),note=field(form,'Комментарий','textarea','',{max:2000});
 submit(form,'Сохранить заявку',()=>api('/api/crm/leads',{method:'POST',body:JSON.stringify({name:name.value,phone:phone.value,source:source.value,service:service.value,note:note.value})}));
}
function localDate(iso){if(!iso)return '';const date=new Date(iso);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
async function openLead(id){
 const body=openDialog('Заявка #'+id);body.append(el('p','muted','Загрузка…'));
 try{
  const {lead:r,messages}=await api('/api/crm/leads/'+id);if(!$('detail').open)return;
  $('dialog-title').textContent=labelName(r);body.replaceChildren(el('p','muted',(names[r.source]||r.source)+(r.phone?' · '+r.phone:'')));
  const history=el('div','history');history.append(el('h3','','История сообщений'));for(const m of messages){const div=el('div');div.append(el('small','',fmt(m.created_at,true)),document.createTextNode(m.text));history.append(div)}body.append(history);
  const form=el('form','form-grid');body.append(form);
  const state=field(form,'Статус','select',r.status,{choices:states}),service=field(form,'Услуга','input',r.service,{max:200}),note=field(form,'Комментарий','textarea',r.note,{max:2000}),booking=field(form,'Локальное время записи','input',localDate(r.booking_at),{type:'datetime-local'});
  form.append(el('p','muted','Изменения здесь не создают и не изменяют запись в DIKIDI.'));
  submit(form,'Сохранить изменения',()=>api('/api/crm/leads/'+id,{method:'POST',body:JSON.stringify({status:state.value,service:service.value,note:note.value,bookingAt:booking.value?new Date(booking.value).toISOString():null})}));
 }catch(e){$('dialog-error').textContent=e.message}
}
async function openClient(r){
 const body=openDialog(labelName(r),'КЛИЕНТ');body.append(el('p','muted',(names[r.source]||r.source)+(r.phone?' · '+r.phone:'')));
 try{
  const data=await api('/api/crm/clients/'+r.id);const list=el('div','history');list.append(el('h3','','История обращений'));
  for(const item of data.leads){const b=el('button','ghost','#'+item.id+' · '+(states[item.status]||item.status)+' · '+fmt(item.created_at));b.type='button';b.addEventListener('click',()=>void openLead(item.id));list.append(b)}body.append(list);
  const remove=el('button','danger','Удалить контакт и историю');remove.type='button';remove.addEventListener('click',async()=>{if(!confirm('Безвозвратно удалить контакт, все заявки и сообщения?'))return;try{await api('/api/crm/clients/'+r.id,{method:'DELETE'});$('detail').close();await loadSummary();await load()}catch(e){$('dialog-error').textContent=e.message}});body.append(remove);
 }catch(e){$('dialog-error').textContent=e.message}
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('search').addEventListener('input',()=>{clearTimeout(timer);page=0;timer=setTimeout(load,300)});
for(const id of ['status','source'])$(id).addEventListener('change',()=>{page=0;void load()});
$('prev').addEventListener('click',()=>{if(page>0){page--;void load()}});$('next').addEventListener('click',()=>{page++;void load()});
$('add').addEventListener('click',openNew);$('close').addEventListener('click',()=>$('detail').close());$('refresh').addEventListener('click',()=>{void loadSummary().then(load)});
$('logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:'{}'});location.replace('/admin/')}catch(e){notice(e.message)}});
void(async()=>{try{const s=await api('/api/admin/session');if(!s.authenticated)return location.replace('/admin/');await loadSummary();await load()}catch(e){notice(e.message)}})();
})();
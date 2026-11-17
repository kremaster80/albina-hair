// WhatsApp Embedded Signup: verify all asset IDs against Meta, never trust popup alone.
const graph='https://graph.facebook.com/v27.0/';
const idOK=s=>typeof s==='string'&&/^\d{5,30}$/.test(s);
const fail=message=>Object.assign(new Error(message),{publicMessage:message});
export async function exchangeWhatsApp({appId,appSecret,code,wabaId,phoneId='',mode,remoteJSON}){
 if(typeof code!=='string'||code.length<12||code.length>4096||!idOK(wabaId)||
    (phoneId&&!idOK(phoneId))||!['standard','coexistence'].includes(mode)||(!phoneId&&mode!=='coexistence'))throw fail('Meta не передала необходимые сведения об аккаунте.');
 const url=new URL(graph+'oauth/access_token');
 url.search=new URLSearchParams({client_id:appId,client_secret:appSecret,code}).toString();
 const {access_token:token}=await remoteJSON(url);
 if(typeof token!=='string'||!token)throw fail('Meta не выдала токен.');
 const request=(edge,params={},options={})=>{
  const u=new URL(graph+edge);u.search=new URLSearchParams(params).toString();
  return remoteJSON(u,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});
 };
 const {data:debug}=await request('debug_token',{input_token:token},{headers:{Authorization:'Bearer '+appId+'|'+appSecret}});
 if(debug?.is_valid!==true||String(debug.app_id)!==appId||
 !['whatsapp_business_management','whatsapp_business_messaging'].every(s=>debug.scopes?.includes(s)))throw fail('Meta не подтвердила токен или необходимые разрешения WhatsApp.');
 if(Number(debug.expires_at)>0&&Number(debug.expires_at)*1000<=Date.now())throw fail('Срок действия токена истёк.');
 const phones=await request(wabaId+'/phone_numbers',{fields:'id,display_phone_number',limit:'100'});
 if(!Array.isArray(phones.data))throw fail('Не удалось получить номера WhatsApp.');
 if(!phoneId&&(phones.data.length!==1||phones.paging?.next))throw fail('В аккаунте несколько номеров или номера отсутствуют. Нужен выбор конкретного номера, автоматически подключать его небезопасно.');
 const selected=phoneId?phones.data.find(p=>p.id===phoneId):phones.data[0];
 if(!idOK(selected?.id))throw fail('Номер не подтверждён Meta.');
 const info=await request(selected.id,{fields:'id,is_on_biz_app,platform_type'});
 if(info.id!==selected.id||info.platform_type!=='CLOUD_API')throw fail('Meta пока не подтвердила готовность номера к Cloud API.');
 if(mode==='coexistence'&&info.is_on_biz_app!==true)throw fail('Meta не подтвердила одновременную работу номера в приложении WhatsApp Business. Не удаляйте и не переносите аккаунт.');
 return {state:'authorized',accessToken:token,wabaId,phoneId:selected.id,mode:info.is_on_biz_app===true?'coexistence':'standard',account:selected.display_phone_number||selected.id,expiresAt:Number(debug.expires_at)>0?Number(debug.expires_at)*1000:null,webhookSubscribed:false,connectedAt:new Date().toISOString()};
}
export async function subscribeWhatsApp(record,remoteJSON){
 const url=new URL(graph+record.wabaId+'/subscribed_apps');
 const result=await remoteJSON(url,{method:'POST',headers:{Authorization:'Bearer '+record.accessToken}});
 if(result.success!==true)throw fail('Meta не подтвердила подписку приложения на события WhatsApp.');
 return true;
}

// Meta Unified Login: one professional Instagram account per CRM installation.
const graph='https://graph.facebook.com/v27.0/';
const numericId=value=>typeof value==='string'&&/^\d{5,30}$/.test(value);
export function unifiedConfigured(env=process.env){
 return numericId(env.META_APP_ID)&&numericId(env.INSTAGRAM_CONFIG_ID)&&Boolean(env.META_APP_SECRET);
}
export function unifiedAuthorizeURL({appId,configId,redirectUri,state}){
 const url=new URL('https://www.facebook.com/dialog/oauth');
 url.search=new URLSearchParams({client_id:appId,config_id:configId,display:'popup',override_default_response_type:'true',redirect_uri:redirectUri,response_type:'code',state,prompt:'login'}).toString();
 return url;
}
const fail=(message)=>Object.assign(new Error(message),{publicMessage:message});
export async function exchangeUnified({appId,appSecret,redirectUri,code,remoteJSON}){
 const tokenURL=new URL(graph+'oauth/access_token');
 tokenURL.search=new URLSearchParams({client_id:appId,client_secret:appSecret,redirect_uri:redirectUri,code}).toString();
 const tokens=await remoteJSON(tokenURL);
 const token=tokens.access_token;
 if(typeof token!=='string'||!token)throw fail('Meta не выдала токен доступа.');
 const request=(edge,params,bearer=token)=>{
  const url=new URL(graph+edge);url.search=new URLSearchParams(params).toString();
  return remoteJSON(url,{headers:{Authorization:'Bearer '+bearer}});
 };
 const {data:debug}=await request('debug_token',{input_token:token},appId+'|'+appSecret);
 if(debug?.is_valid!==true||String(debug.app_id)!==appId)throw fail('Meta не подтвердила принадлежность токена приложению.');
 const required=['instagram_basic','instagram_manage_messages'];
 if(!required.every(scope=>debug.scopes?.includes(scope)))throw fail('Не предоставлены разрешения instagram_basic и instagram_manage_messages.');
 if(Number(debug.expires_at)>0&&Number(debug.expires_at)*1000<=Date.now())throw fail('Срок действия токена истёк.');
 // Do not guess the Instagram ID from the system user's own ID.
 let assigned;
 try{assigned=await request('me/assigned_instagram_accounts',{fields:'id,username',limit:'100'})}
 catch{throw fail('Не удалось получить список аккаунтов Instagram. Проверьте права бизнес-портфолио и конфигурацию Meta.')}
 if(!Array.isArray(assigned?.data)||assigned.data.length!==1||assigned.paging?.next)throw fail('Выберите ровно один профессиональный аккаунт Instagram при авторизации.');
 const id=assigned.data[0]?.id;
 if(!numericId(id))throw fail('Meta не вернула идентификатор Instagram.');
 const identity=await request(id,{fields:'id,username'});
 if(identity.id!==id||typeof identity.username!=='string'||!identity.username)throw fail('Не удалось подтвердить выбранный аккаунт Instagram.');
 return {state:'authorized',loginMode:'unified',accessToken:token,userId:id,account:'@'+identity.username,expiresAt:Number(debug.expires_at)>0?Number(debug.expires_at)*1000:null,connectedAt:new Date().toISOString()};
}

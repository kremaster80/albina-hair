import {setTimeout as sleep} from 'node:timers/promises';

// Exactly one poller per bot token. Acknowledge only completed updates; the
// existing database deduplication covers replay after a process restart.
export function startTelegramPolling({call,handle,log=console,delay=sleep}){
 const controller=new AbortController(),signal=controller.signal;
 let offset,ready=false,failures=0;
 async function loop(){
  while(!signal.aborted){
   try{
    if(!ready){
     await call('deleteWebhook',{drop_pending_updates:false},{signal,timeoutMs:20000});
     ready=true;
     log.info('ALBINA Telegram polling started (pending updates preserved)');
    }
    const updates=await call('getUpdates',{
     ...(offset===undefined?{}:{offset}),
     timeout:25,limit:20,allowed_updates:['message','callback_query']
    },{signal,timeoutMs:45000});
    if(!Array.isArray(updates))throw new Error('Unexpected update response');
    if(!updates.length)offset=undefined; // offset already acknowledged; allow new ID sequence after inactivity
    for(const update of updates){
     if(signal.aborted)break;
     if(!Number.isSafeInteger(update?.update_id))throw new Error('Invalid update id');
     try{await handle(update)}
     catch(err){
      // A user who blocked the bot cannot receive an acknowledgement.
      // Do not let that permanently block the shared incoming queue.
      if(err?.telegramMethod!=='sendMessage'||err?.telegramCode!==403)throw err;
      log.warn('ALBINA Telegram delivery blocked; update acknowledged');
     }
     offset=update.update_id+1;
    }
    failures=0;
   }catch(err){
    if(signal.aborted)break;
    failures++;
    // Avoid logging request URLs or error causes: they may contain the token.
    const code=Number.isInteger(err?.telegramCode)?' HTTP/API '+err.telegramCode:'';
    log.warn('ALBINA Telegram polling retry'+code+'; attempt '+failures);
    const seconds=Math.min(30,2**Math.min(failures,5));
    await delay(seconds*1000,undefined,{signal}).catch(()=>{});
   }
  }
 }
 const done=loop();
 return {stop:async()=>{controller.abort();await done}};
}

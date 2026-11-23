// DIKIDI notification email parser. This module NEVER authenticates the sender
// or writes to CRM: ingestion must validate provider, mailbox and message identity.
const normalize = text => typeof text === 'string'
  ? text.normalize('NFC').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()
  : '';
const validDayMonth = (day, month) => {
  // Leap year permits Feb 29; the actual year must come from mailbox metadata.
  const last = [31,29,31,30,31,30,31,31,30,31,30,31][month-1];
  return Number.isInteger(last) && day >= 1 && day <= last;
};
const durationFrom = value => {
  const raw=normalize(value).toLowerCase();
  const hour=raw.match(/(\d{1,2})\s*час(?:а|ов)?\b/u);
  const minute=raw.match(/(\d{1,2})\s*минут(?:а|ы)?\b/u);
  if (!hour && !minute) return null;
  const h=hour?Number(hour[1]):0,m=minute?Number(minute[1]):0;
  if (h>23 || m>59 || (h===0 && m===0)) return null;
  return h*60+m;
};

/**
 * Parse known Russian DIKIDI "Создана новая запись" emails only.
 *
 * Returns null for unrecognised messages. Year and event identity are deliberately
 * absent from the DIKIDI email text and must not be invented.
 * This is not safe to call directly on unauthenticated arbitrary email content.
 */
export function parseDikidiBookingEmail(text) {
  const body=normalize(text);
  if (body.length > 8000) return null;
  const match=/(?:^| )Создана новая запись к (.{2,160}?) на (\d{2})\.(\d{2}) в (\d{2}):(\d{2}) \(([^()]{1,80})\)\. Клиент: (.{2,160}?) (\+?\d{10,15})(?: |$)/iu.exec(body);
  if (!match) return null;
  const [ ,master,dd,mm,hh,mi,length,client,phoneRaw] = match;
  const day=Number(dd),month=Number(mm),hour=Number(hh),minute=Number(mi);
  const durationMinutes=durationFrom(length);
  if (!validDayMonth(day,month) || hour>23 || minute>59 || !durationMinutes) return null;
  const digits=phoneRaw.replace(/\D/g,'');
  let phone=phoneRaw;
  if (digits.length===11 && digits.startsWith('8')) phone='+7'+digits.slice(1);
  else if(digits.length===11 && digits.startsWith('7')) phone='+'+digits;
  return {
    type:'booking_created',
    master:master.trim(),
    clientName:client.trim(),
    clientPhone:phone,
    day,
    month,
    localTime:hh+':'+mi,
    durationMinutes,
    year:null,
    bookingId:null,
    service:null
  };
}

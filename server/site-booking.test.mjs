import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const script=readFileSync(new URL('script.js',root),'utf8');
const config=readFileSync(new URL('config.js',root),'utf8');
const url='https://dikidi.net/2184654';

test('DIKIDI booking button is a working direct anchor',()=>{
 assert.match(html,/<a[^>]*id="dikidi-booking-link"[^>]*href="https:\/\/dikidi\.net\/2184654"[^>]*>Записаться через DIKIDI<\/a>/);
 assert.ok(config.includes("dikidiBookingUrl: '"+url+"'"));
 assert.match(script,/contactLink\('Запись DIKIDI', dikidiBookingUrl\)/);
});
test('booking no longer opens WhatsApp, and optional questionnaire stays copy-only',()=>{
 assert.doesNotMatch(script,/wa\.me|window\.open\(/);
 assert.match(script,/copyToClipboard\(message\)/);
 assert.match(html,/id="booking-form"/);
 assert.match(html,/id="form-button-text">Скопировать анкету/);
});

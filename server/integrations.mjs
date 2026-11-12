/**
 * ALBINA — private integrations API, Node.js 20+ (no dependencies).
 * Never serve this file or its credentials directory as a static asset.
 * Run behind HTTPS/Nginx; see INTEGRATIONS.md.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  randomBytes, createHmac, createHash, timingSafeEqual,
  createCipheriv, createDecipheriv
} from 'node:crypto';

const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const DATA_KEY = process.env.DATA_KEY || '';
const DATA_FILE = process.env.DATA_FILE || '/var/lib/albina-hair/integrations.json';
const PORT = Number(process.env.PORT || 3077);
const COOKIE = 'albina_admin_session';
const IS_HTTPS = PUBLIC_ORIGIN.startsWith('https://');
const IS_LOCAL = /^http:\/\/localhost(:\d+)?$/.test(PUBLIC_ORIGIN);

if ((!IS_HTTPS && !IS_LOCAL) || ADMIN_PASSWORD.length < 16 ||
    SESSION_SECRET.length < 32 || !/^[a-fA-F0-9]{64}$/.test(DATA_KEY) ||
    !path.isAbsolute(DATA_FILE) || DATA_FILE.startsWith('/var/www/')) {
  throw new Error('Missing/unsafe config. Read INTEGRATIONS.md: HTTPS origin, strong admin password, session secret, 32-byte hex data key and private data path required.');
}
const key = Buffer.from(DATA_KEY, 'hex');
const records = new Map();
const sessions = new Map();
const authStates = new Map();
const attempts = new Map();

function sealed(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
}
function unseal(blob) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8'));
}
if (fs.existsSync(DATA_FILE)) {
  const existing = unseal(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  for (const [provider, value] of Object.entries(existing)) records.set(provider, value);
}
function persist() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true, mode: 0o700 });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sealed(Object.fromEntries(records))), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
  fs.chmodSync(DATA_FILE, 0o600);
}
function sign(value) {
  return createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}
function safeEquals(a, b) {
  const aa = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(part => {
    const i = part.indexOf('=');
    return i > 0 ? [part.slice(0, i).trim(), part.slice(i + 1).trim()] : ['', ''];
  }));
}
function adminSession(req) {
  const value = cookies(req)[COOKIE] || '';
  const dot = value.indexOf('.');
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  if (!safeEquals(value.slice(dot + 1), sign(id))) return null;
  const expiry = sessions.get(id);
  if (!expiry || expiry < Date.now()) { sessions.delete(id); return null; }
  return id;
}
function sessionCookie(value, maxAge) {
  return COOKIE + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (IS_HTTPS ? '; Secure' : '');
}
function headers(extra = {}) {
  return {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    ...extra
  };
}
function json(res, code, data, extra = {}) {
  res.writeHead(code, headers({ 'Content-Type': 'application/json; charset=utf-8', ...extra }));
  res.end(JSON.stringify(data));
}
function sameOrigin(req) {
  return req.headers.origin === PUBLIC_ORIGIN;
}
async function readJSON(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString('utf8');
    if (raw.length > 16384) throw new Error('Payload too large');
  }
  return JSON.parse(raw || '{}');
}
async function remoteJSON(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error('Provider rejected request');
  return body;
}
function callbackURL(provider) {
  return PUBLIC_ORIGIN + '/api/integrations/' + provider + '/callback';
}
function configured(provider) {
  if (provider === 'instagram') return Boolean(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET);
  if (provider === 'google') return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (provider === 'whatsapp') return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_CONFIG_ID);
  if (provider === 'dikidi') return true;
  return false;
}
const providerNames = ['instagram', 'whatsapp', 'telegram', 'google', 'yandex', '2gis', 'dikidi'];
function publicStatus() {
  return Object.fromEntries(providerNames.map(provider => {
    const rec = records.get(provider);
    return [provider, {
      configured: configured(provider),
      state: rec ? rec.state : 'not_connected',
      connectedAt: rec ? rec.connectedAt : null,
      account: rec ? rec.account || null : null
    }];
  }));
}
function outcome(res, provider, ok, message) {
  const payload = JSON.stringify({ type: 'albina-integration-result', provider, ok, message }).replace(/</g, '\\u003c');
  const target = JSON.stringify(PUBLIC_ORIGIN);
  const title = ok ? 'Авторизация завершена' : 'Не удалось подключить';
  const body = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    title + '</title></head><body style="font:16px system-ui;padding:48px;max-width:500px;margin:auto"><h1>' +
    title + '</h1><p>Вернитесь в панель интеграций. Это окно можно закрыть.</p><script>' +
    'if(window.opener){window.opener.postMessage(' + payload + ',' + target + ');window.close()}' +
    '</script></body></html>';
  res.writeHead(ok ? 200 : 400, headers({ 'Content-Type': 'text/html; charset=utf-8' }));
  res.end(body);
}
function oauthStart(req, res, provider, session) {
  if (!configured(provider)) return outcome(res, provider, false, 'Создайте приложение разработчика и задайте настройки на сервере.');
  const state = randomBytes(24).toString('base64url');
  authStates.set(state, { provider, session, until: Date.now() + 10 * 60 * 1000 });
  let url;
  if (provider === 'instagram') {
    url = new URL('https://www.instagram.com/oauth/authorize');
    url.searchParams.set('client_id', process.env.INSTAGRAM_CLIENT_ID);
    url.searchParams.set('scope', 'instagram_business_basic,instagram_business_manage_messages');
  } else {
    url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/business.manage');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
  }
  url.searchParams.set('redirect_uri', callbackURL(provider));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  res.writeHead(302, headers({ Location: url.toString() }));
  res.end();
}
async function oauthCallback(req, res, provider, url) {
  const state = url.searchParams.get('state') || '';
  const pending = authStates.get(state);
  authStates.delete(state);
  if (!pending || pending.provider !== provider || pending.until < Date.now() || !sessions.has(pending.session)) {
    return outcome(res, provider, false, 'Время авторизации истекло.');
  }
  const code = url.searchParams.get('code');
  if (!code || url.searchParams.has('error')) return outcome(res, provider, false, 'Доступ не предоставлен.');
  try {
    if (provider === 'instagram') {
      const short = await remoteJSON('https://api.instagram.com/oauth/access_token', {
        method: 'POST', body: new URLSearchParams({
          client_id: process.env.INSTAGRAM_CLIENT_ID,
          client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
          grant_type: 'authorization_code', redirect_uri: callbackURL(provider), code
        })
      });
      if (!short.access_token) throw new Error('No Instagram token');
      const tokenURL = new URL('https://graph.instagram.com/access_token');
      tokenURL.search = new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        access_token: short.access_token
      }).toString();
      const long = await remoteJSON(tokenURL);
      if (!long.access_token) throw new Error('No long-lived token');
      const me = new URL('https://graph.instagram.com/me');
      me.search = new URLSearchParams({ fields: 'id,username', access_token: long.access_token }).toString();
      const identity = await remoteJSON(me);
      if (!identity.id) throw new Error('No Instagram identity');
      records.set(provider, { state: 'authorized', accessToken: long.access_token,
        userId: identity.id, account: identity.username ? '@' + identity.username : identity.id,
        expiresAt: Date.now() + (Number(long.expires_in || 5184000) * 1000),
        connectedAt: new Date().toISOString() });
    } else {
      const tokens = await remoteJSON('https://oauth2.googleapis.com/token', {
        method: 'POST', body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
          code, redirect_uri: callbackURL(provider), grant_type: 'authorization_code'
        })
      });
      if (!tokens.access_token) throw new Error('No Google token');
      records.set(provider, { state: 'authorized', accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
        account: 'Google Business Profile', connectedAt: new Date().toISOString() });
    }
    persist();
    outcome(res, provider, true, 'OAuth выполнен, импорт заявок настраивается отдельно.');
  } catch {
    outcome(res, provider, false, 'Проверьте настройки приложения, доступы и redirect URL.');
  }
}
async function whatsappComplete(req, res) {
  if (!configured('whatsapp')) return json(res, 409, { error: 'Meta App is not configured' });
  const body = await readJSON(req);
  const code = String(body.code || '');
  const wabaId = String(body.wabaId || '');
  const phoneId = String(body.phoneId || '');
  if (code.length < 12 || code.length > 4096 || !/^\d{5,30}$/.test(wabaId) ||
      !/^\d{5,30}$/.test(phoneId)) {
    return json(res, 400, { error: 'Meta registration did not return valid business assets' });
  }
  try {
    const tokenURL = new URL('https://graph.facebook.com/v25.0/oauth/access_token');
    tokenURL.search = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      code
    }).toString();
    const token = await remoteJSON(tokenURL);
    if (!token.access_token) throw new Error('Missing token');
    const phonesURL = new URL('https://graph.facebook.com/v25.0/' + wabaId + '/phone_numbers');
    phonesURL.search = new URLSearchParams({ fields: 'id,display_phone_number', access_token: token.access_token }).toString();
    const phones = await remoteJSON(phonesURL);
    const selected = Array.isArray(phones.data) && phones.data.find(p => String(p.id) === phoneId);
    if (!selected) throw new Error('WABA phone not verified');
    records.set('whatsapp', { state: 'authorized', accessToken: token.access_token, wabaId,
      phoneId, account: selected.display_phone_number || phoneId, connectedAt: new Date().toISOString() });
    persist();
    json(res, 200, { ok: true, message: 'Meta Business account verified; webhooks still require setup' });
  } catch {
    json(res, 400, { error: 'Meta API could not confirm this WhatsApp Business account' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', PUBLIC_ORIGIN);
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname === '/api/admin/session') {
      return json(res, 200, { authenticated: Boolean(adminSession(req)) });
    }
    if (req.method === 'POST' && pathname === '/api/admin/login') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Invalid origin' });
      const ip = req.socket.remoteAddress || 'unknown';
      const entry = attempts.get(ip) || { count: 0, reset: Date.now() + 15 * 60 * 1000 };
      if (Date.now() > entry.reset) { entry.count = 0; entry.reset = Date.now() + 15 * 60 * 1000; }
      if (entry.count >= 5) return json(res, 429, { error: 'Too many attempts. Try later.' });
      const body = await readJSON(req);
      const expected = createHash('sha256').update(ADMIN_PASSWORD).digest();
      const actual = createHash('sha256').update(String(body.password || '')).digest();
      if (!timingSafeEqual(expected, actual)) {
        entry.count++; attempts.set(ip, entry);
        return json(res, 401, { error: 'Неверный код доступа' });
      }
      attempts.delete(ip);
      const id = randomBytes(32).toString('base64url');
      sessions.set(id, Date.now() + 12 * 60 * 60 * 1000);
      return json(res, 200, { authenticated: true }, { 'Set-Cookie': sessionCookie(id + '.' + sign(id), 43200) });
    }
    const session = adminSession(req);
    if (!session) return json(res, 401, { error: 'Авторизуйтесь в панели управления' });
    if (req.method === 'POST' || req.method === 'DELETE') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Invalid origin' });
    }
    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      sessions.delete(session);
      return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (req.method === 'GET' && pathname === '/api/integrations/status') {
      return json(res, 200, { providers: publicStatus() });
    }
    if (req.method === 'GET' && pathname === '/api/integrations/meta-config') {
      return json(res, 200, { configured: configured('whatsapp'),
        appId: process.env.META_APP_ID || null, configurationId: process.env.META_CONFIG_ID || null });
    }
    const match = pathname.match(/^\/api\/integrations\/(instagram|google)\/(start|callback)$/);
    if (match && req.method === 'GET' && match[2] === 'start') return oauthStart(req, res, match[1], session);
    // OAuth callback is handled below only after validating one-time state; it does not require the cookie.
    if (req.method === 'POST' && pathname === '/api/integrations/whatsapp/complete') return await whatsappComplete(req, res);
    if (req.method === 'POST' && pathname === '/api/integrations/dikidi/key') {
      const body = await readJSON(req);
      const apiKey = String(body.apiKey || '').trim();
      const companyId = String(body.companyId || '').trim();
      if (!/^[^\s]{12,512}$/.test(apiKey) || companyId.length > 100) {
        return json(res, 400, { error: 'Проверьте API-ключ (12–512 символов без пробелов)' });
      }
      records.set('dikidi', { state: 'key_saved_unverified', apiKey,
        companyId, account: companyId ? 'Проект ' + companyId : 'DIKIDI', connectedAt: new Date().toISOString() });
      persist();
      return json(res, 200, { ok: true });
    }
    const remove = pathname.match(/^\/api\/integrations\/(instagram|whatsapp|google|dikidi)$/);
    if (req.method === 'DELETE' && remove) {
      records.delete(remove[1]); persist();
      return json(res, 200, { ok: true, note: 'Also revoke access in the provider account' });
    }
    return json(res, 404, { error: 'Not found' });
  } catch {
    return json(res, 500, { error: 'Internal error — see server logs' });
  }
});

// OAuth callbacks are initiated by the provider, which does not send the admin session cookie.
// Wrap listener to handle callbacks before the normal admin-session authorization.
server.removeAllListeners('request');
server.on('request', async (req, res) => {
  const url = new URL(req.url || '/', PUBLIC_ORIGIN);
  const callback = url.pathname.match(/^\/api\/integrations\/(instagram|google)\/callback$/);
  if (req.method === 'GET' && callback) {
    try { return await oauthCallback(req, res, callback[1], url); }
    catch { return outcome(res, callback[1], false, 'Ошибка подключения'); }
  }
  return requestHandler(req, res);
});

function requestHandler(req, res) {
  // Expose the original async handler via a separately registered listener, not public routes.
  return route(req, res);
}

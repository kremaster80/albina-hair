import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'albina-api-test-'));
const file = path.join(root, 'encrypted.json');
const port = 31878;
const base = 'http://127.0.0.1:' + port;
const origin = 'http://localhost:8000';
const password = 'example-local-test-password-long';
const secret = 'test-session-secret-is-long-enough-12345678';
const apiKey = 'TEST_API_KEY_NEVER_REAL_123456789';
const proc = spawn(process.execPath, [new URL('./integrations.mjs', import.meta.url).pathname], {
  env: { ...process.env, PUBLIC_ORIGIN: origin, PORT: String(port), ADMIN_PASSWORD: password,
    SESSION_SECRET: secret, DATA_KEY: '0123456789abcdef'.repeat(4), DATA_FILE: file },
  stdio: ['ignore', 'pipe', 'pipe']
});
let stderr = '';
proc.stderr.on('data', chunk => { stderr += chunk; });
async function request(url, options = {}) {
  const res = await fetch(base + url, { ...options, headers: {
    ...(options.method && options.method !== 'GET' ? { Origin: origin } : {}),
    ...(options.body ? { 'Content-Type':'application/json' } : {}),
    ...(options.headers || {})
  }});
  return { status:res.status, body:await res.json(), cookie:res.headers.get('set-cookie') };
}
try {
  let started = false;
  for (let i=0;i<50;i++) {
    if (proc.exitCode !== null) throw new Error('API exited: ' + stderr);
    try { await request('/api/admin/session'); started = true; break; }
    catch { await sleep(100); }
  }
  assert.ok(started,'API did not start: '+stderr);
  let r = await request('/api/admin/session');
  assert.equal(r.body.authenticated, false);
  r = await request('/api/integrations/status');
  assert.equal(r.status, 401);
  r = await request('/api/admin/login', {method:'POST',body:JSON.stringify({password:'incorrect'})});
  assert.equal(r.status, 401);
  r = await request('/api/admin/login', {method:'POST',body:JSON.stringify({password})});
  assert.equal(r.status, 200);
  const cookie = r.cookie.split(';')[0];
  r = await request('/api/integrations/status', {headers:{Cookie:cookie}});
  assert.equal(r.status, 200);
  assert.equal(r.body.providers.instagram.state,'not_connected');
  r = await request('/api/integrations/dikidi/key',{
    method:'POST',headers:{Cookie:cookie},
    body:JSON.stringify({apiKey,companyId:'12345'})
  });
  assert.equal(r.status, 200);
  r = await request('/api/integrations/status', {headers:{Cookie:cookie}});
  assert.equal(r.body.providers.dikidi.state,'key_saved_unverified');
  assert.ok(!JSON.stringify(r.body).includes(apiKey));
  assert.ok(!fs.readFileSync(file,'utf8').includes(apiKey));
  assert.equal(fs.statSync(file).mode & 0o777,0o600);
  r = await request('/api/integrations/dikidi',{method:'DELETE',headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  r = await request('/api/integrations/status',{headers:{Cookie:cookie}});
  assert.equal(r.body.providers.dikidi.state,'not_connected');
  r = await request('/api/admin/logout',{method:'POST',body:'{}',headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  r = await request('/api/integrations/status',{headers:{Cookie:cookie}});
  assert.equal(r.status,401);
  console.log('ALBINA API smoke tests passed');
} finally {
  proc.kill('SIGTERM');
  fs.rmSync(root,{recursive:true,force:true});
}

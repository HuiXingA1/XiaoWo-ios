// e2e: boot patched server → login as b → open SSE → login as a → post message → expect SSE event
process.env.NEST_PORT = '17999';
process.env.NEST_DATA_DIR = process.cwd() + '/.testdata';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const BASE = 'http://127.0.0.1:17999';
let log = '';

function req(method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + path, {
      method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  fs.rmSync('.testdata', { recursive: true, force: true });
  const srv = spawn(process.execPath, ['server.js'], { cwd: process.cwd() + '/full', stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    // wait for listen
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try { await req('GET', '/login'); break; } catch { /* retry */ }
    }
    console.log('server up');

    // login as a (initial password Lyyb0709) — check login API shape
    const la = await req('POST', '/api/auth/login', { body: { password: 'Lyyb0709', who: 'a' } });
    console.log('login a:', la.status, la.body.slice(0, 80));
    const cookieA = (la.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
    const lb = await req('POST', '/api/auth/login', { body: { password: 'Lyyb0709', who: 'b' } });
    console.log('login b:', lb.status, lb.body.slice(0, 80));
    const cookieB = (lb.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

    // open SSE as b
    const events = [];
    const sse = http.request(BASE + '/api/events', { headers: { Cookie: cookieB, Accept: 'text/event-stream' } }, (res) => {
      console.log('SSE status:', res.statusCode, res.headers['content-type']);
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (chunk.startsWith(':')) continue; // comment/heartbeat
          const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
          if (dataLine) events.push(JSON.parse(dataLine.slice(5).trim()));
        }
      });
    });
    sse.on('error', () => {});
    sse.end();
    await new Promise((r) => setTimeout(r, 600));

    // a posts a message
    const pm = await req('POST', '/api/messages', { body: { body: 'e2e通知测试' }, cookie: cookieA });
    console.log('post message:', pm.status, pm.body.slice(0, 120));
    await new Promise((r) => setTimeout(r, 800));

    console.log('SSE events received:', JSON.stringify(events));
    const hit = events.find((e) => e.type === 'message' && e.who === 'a' && e.msgId > 0);
    if (!hit) throw new Error('FAIL: no message event on SSE');
    console.log('unread in event:', hit.unread, '| body:', hit.body);

    // b-side unread via REST should also be 1
    const ur = await req('GET', '/api/messages/unread', { cookie: cookieB });
    console.log('REST unread:', ur.body);
    console.log('E2E PASS ✅');
  } finally {
    srv.kill();
    fs.rmSync('.testdata', { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('E2E FAIL:', e.message); console.error('--- server log ---'); console.error(log.slice(-2000)); process.exit(1); });

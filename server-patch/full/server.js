'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { DATA_DIR, UPLOAD_DIR, allSettings, checkpoint } = require('./lib/db');
const auth = require('./lib/auth');
const { createApi } = require('./lib/api');
const events = require('./lib/events');
const {
  HttpError, sendJSON, sendText, parseCookies, cookie, serveStatic, serveFile,
} = require('./lib/http');

const PORT = Number(process.env.NEST_PORT || 7788);
const HOST = process.env.NEST_HOST || '0.0.0.0';
/* 部署在反向代理（Caddy / Nginx / Cloudflare）后面时设 NEST_TRUST_PROXY=1，
   才会采信 X-Forwarded-For 与 X-Forwarded-Proto。直接暴露时不要开，否则 IP 可被伪造。 */
const TRUST_PROXY = process.env.NEST_TRUST_PROXY === '1';
const PUBLIC_DIR = path.join(__dirname, 'public');

auth.ensurePassword();
const api = createApi();
events.startHeartbeat();

function securityHeaders(res, secure) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  /* 只在确认是 HTTPS 时才发 HSTS —— 在纯 HTTP 下发会让浏览器永久记住
     必须走 HTTPS，本机 http://127.0.0.1 就再也打不开了。 */
  if (secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
}

const PUBLIC_PATHS = new Set(['/login', '/login.html', '/favicon.svg', '/manifest.webmanifest']);

function resolveClientIP(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

/* 判断本次请求是不是走的 HTTPS（直连 TLS 或反代转发）。
   决定 Cookie 要不要加 Secure：加了 Secure 的 Cookie 在纯 HTTP 下浏览器不会存，
   所以在局域网 http 访问时必须动态判断，不能写死。 */
function isSecureRequest(req) {
  if (req.socket && req.socket.encrypted) return true;
  if (TRUST_PROXY) {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    if (proto === 'https') return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  securityHeaders(res, isSecureRequest(req));

  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsed.pathname);

  // 静态资源（无需登录）
  if (pathname.startsWith('/assets/') || PUBLIC_PATHS.has(pathname)) {
    if (serveStatic(res, PUBLIC_DIR, pathname === '/login' ? '/login.html' : pathname)) return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.nest_session;
  const session = auth.getSession(token);

  /* ---------- 登录门禁 ---------- */

  if (!pathname.startsWith('/api/')) {
    if (pathname.startsWith('/media/')) {
      if (!session) { res.writeHead(302, { Location: '/login' }); res.end(); return; }
      const rel = pathname.slice('/media/'.length);
      const abs = path.resolve(UPLOAD_DIR, rel);
      if (!abs.startsWith(path.resolve(UPLOAD_DIR))) { sendText(res, 403, 'Forbidden'); return; }
      serveFile(req, res, abs);
      return;
    }
    if (!session) {
      res.writeHead(302, { Location: '/login' });
      res.end();
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      if (serveStatic(res, PUBLIC_DIR, '/index.html')) return;
    }
    if (pathname === '/logout') {
      auth.destroySession(token);
      res.writeHead(302, { Location: '/login', 'Set-Cookie': cookie('nest_session', '', { maxAge: 0 }) });
      res.end();
      return;
    }
    if (serveStatic(res, PUBLIC_DIR, pathname)) return;
    // SPA 兜底
    if (!path.extname(pathname) && serveStatic(res, PUBLIC_DIR, '/index.html')) return;
    sendText(res, 404, '这里什么都没有');
    return;
  }

  /* ---------- API ---------- */

  const secure = isSecureRequest(req);
  const ctx = {
    req, res, ip: resolveClientIP(req), token, session, secure,
    query: Object.fromEntries(parsed.searchParams.entries()),
    params: {},
    setCookie(name, value, opts) {
      const prev = res.getHeader('Set-Cookie');
      const next = cookie(name, value, { secure, ...(opts || {}) });
      res.setHeader('Set-Cookie', prev ? [].concat(prev, next) : next);
    },
  };

  // 悄悄话实时事件流（SSE）：需要登录；长连接直接接管 res，不走普通路由
  if (req.method === 'GET' && pathname === '/api/push/stream' && session) {
    events.addEventListener(session.who, res);
    return;
  }

  for (const route of api.routes) {
    if (route.method !== req.method) continue;
    const m = route.re.exec(pathname);
    if (!m) continue;
    route.keys.forEach((k, i) => { ctx.params[k] = m[i + 1]; });
    if (route.auth && !session) {
      sendJSON(res, 401, { error: '需要先进入小窝', needLogin: true });
      return;
    }
    try {
      const result = await route.handler(ctx);
      if (result !== undefined && !res.headersSent) sendJSON(res, 200, result);
      if (session && token) auth.touchSession(token);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJSON(res, err.status, { error: err.message, ...(err.extra || {}) });
      } else {
        console.error(`[api] ${req.method} ${pathname}`, err);
        sendJSON(res, 500, { error: '服务出了点小状况，稍后再试' });
      }
    }
    return;
  }

  sendJSON(res, 404, { error: '接口不存在' });
  void started;
});

server.listen(PORT, HOST, () => {
  const s = allSettings();
  const nets = os.networkInterfaces();
  const lan = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) lan.push(n.address);
    }
  }
  console.log('');
  console.log('  🌷  ' + (s['couple.title'] || '我们的小窝') + '  已点亮');
  console.log('  ─────────────────────────────────────');
  console.log(`  本机访问   http://127.0.0.1:${PORT}`);
  for (const ip of lan) console.log(`  局域网     http://${ip}:${PORT}   ← 手机/平板用这个`);
  console.log(`  数据目录   ${DATA_DIR}`);
  if (TRUST_PROXY) console.log('  反代模式   已开启（采信 X-Forwarded-*）');
  console.log('  ─────────────────────────────────────');
  console.log('  只有知道密码的人，才能推开这扇门。');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n  晚安，明天见 🌙');
  process.exit(0);
});

/* systemd / Docker 停服务时发的是 SIGTERM，不是 SIGINT。
   先停止收新连接、把数据库 WAL 落盘，再退出——不然重启时可能丢掉最后几条写入。 */
function shutdown(signal) {
  console.log(`\n  收到 ${signal}，正在收尾…`);
  server.close(() => {
    checkpoint();
    console.log('  数据已落盘，晚安 🌙');
    process.exit(0);
  });
  // 兜底：5 秒还没关干净就强退，别让 systemd 等太久（默认 90 秒才 SIGKILL）
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));

module.exports = { server };

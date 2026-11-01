'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
};

const MAX_JSON_BODY = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

function sendJSON(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length });
  res.end(body);
}

function readBody(req, limit = MAX_JSON_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, '内容太大了'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJSON(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, '请求格式不正确');
  }
}

/** 用 WHATWG Request 做流式 multipart 解析，避免把整个上传缓冲进内存 */
async function readMultipart(req, limit = MAX_UPLOAD_BYTES) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared && declared > limit) throw new HttpError(413, '照片太大，单张请控制在 40MB 内');

  const url = 'http://local' + (req.url || '/');
  const request = new Request(url, {
    method: 'POST',
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: 'half',
  });

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, '上传数据解析失败');
  }

  const fields = {};
  const files = [];
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      fields[key] = value;
      continue;
    }
    if (typeof value.arrayBuffer !== 'function') continue;
    const buf = Buffer.from(await value.arrayBuffer());
    files.push({ field: key, filename: value.name || 'file', mime: value.type || 'application/octet-stream', buffer: buf });
  }
  return { fields, files };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function cookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

function serveStatic(res, rootDir, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel = clean.replace(/^\/+/, '');
  const target = path.resolve(rootDir, rel);
  const root = path.resolve(rootDir);
  if (!target.startsWith(root)) {
    sendText(res, 403, 'Forbidden');
    return true;
  }
  let stat;
  try { stat = fs.statSync(target); } catch { return false; }
  if (stat.isDirectory()) return false;

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  if (res.req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return true;
  }
  const cache = /\.(png|jpe?g|webp|gif|woff2)$/i.test(ext) ? 'public, max-age=604800' : 'no-cache';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cache,
    ETag: etag,
  });
  fs.createReadStream(target).pipe(res);
  return true;
}

function serveFile(req, res, absPath, { cache = 'public, max-age=604800', download = false } = {}) {
  let stat;
  try { stat = fs.statSync(absPath); } catch {
    sendText(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(absPath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return;
  }
  const headers = {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cache,
    ETag: etag,
  };
  if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(absPath)}"`;
  res.writeHead(200, headers);
  fs.createReadStream(absPath).pipe(res);
}

module.exports = {
  HttpError, sendJSON, sendText, readBody, readJSON, readMultipart,
  parseCookies, cookie, serveStatic, serveFile, MIME,
  MAX_JSON_BODY, MAX_UPLOAD_BYTES,
};

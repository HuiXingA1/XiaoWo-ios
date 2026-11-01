'use strict';

/* ═══════════════════════════════════════════════════════
   tiles.js · 地图底图瓦片代理

   为什么不直接让浏览器去连高德：
   1. CSP 里 img-src 只有 'self'，直连会被拦；为了地图放宽整个
      img-src 等于把「页面能加载任意图片」这个口子打开，不划算。
   2. 直连时高德会看到两个人的真实 IP。
   3. 同一块瓦片两个人反复请求，本地缓存一份就够了。

   所以浏览器只跟自己的服务器要图，服务器去取、存盘、再吐回来。
   ═══════════════════════════════════════════════════════ */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { DATA_DIR } = require('./db');

const TILE_DIR = path.join(DATA_DIR, 'tiles');

/* 每层瓦片数量 4^z。z 越大越细。 */
const MIN_Z = 3;
const MAX_Z = 18;

/* 底图风格。key 会出现在 URL 里，前端也用这几个值。 */
const STYLES = {
  /* 高德矢量底图（街道+路名，中文），style=8 是「标准」配色 */
  amap: (x, y, z, s) =>
    `https://webrd0${s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`,
  /* 高德卫星影像，叠一层路网标注就是「卫星+地名」 */
  satellite: (x, y, z, s) =>
    `https://webst0${s}.is.autonavi.com/appmaptile?style=6&x=${x}&y=${y}&z=${z}`,
  /* 卫星上的路名/地名透明层 */
  hybrid: (x, y, z, s) =>
    `https://webst0${s}.is.autonavi.com/appmaptile?style=8&x=${x}&y=${y}&z=${z}`,
};

/* 兼容老名字：前端可能传 'vector' / 'roadmap' */
const ALIAS = {
  vector: 'amap',
  roadmap: 'amap',
  street: 'amap',
  sat: 'satellite',
};

function normalizeStyle(raw) {
  const s = String(raw || '').toLowerCase();
  if (ALIAS[s]) return ALIAS[s];
  return STYLES[s] ? s : 'amap';
}

/* ── 磁盘缓存 ──────────────────────────────────────────────
   目录按 z/x 分桶（单层最多 256 个目录，不至于一个目录几十万文件）。
   文件名带 style 前缀，切风格不会互相覆盖。 */

const MAX_AGE_MS = 30 * 24 * 3600 * 1000; // 一个月没被用过就清掉

function cachePath(style, z, x, y) {
  return path.join(TILE_DIR, style, String(z), String(x), `${y}.bin`);
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function readCache(style, z, x, y) {
  const p = cachePath(style, z, x, y);
  try {
    const st = fs.statSync(p);
    /* 顺手把 atime 往后推一点，清缓存时按最近使用判断 */
    if (Date.now() - st.mtimeMs > 7 * 24 * 3600 * 1000) {
      try { fs.utimesSync(p, new Date(), st.mtime); } catch { /* ignore */ }
    }
    return { buf: fs.readFileSync(p), type: mimeOf(p) };
  } catch {
    return null;
  }
}

function mimeOf(p) {
  /* 文件头第一位区分：高德矢量图是 PNG，卫星图是 JPEG */
  try {
    const fd = fs.openSync(p, 'r');
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
    if (head.slice(0, 4).toString('hex') === '89504e47') return 'image/png';
  } catch { /* ignore */ }
  return 'image/png';
}

function writeCache(style, z, x, y, buf) {
  const p = cachePath(style, z, x, y);
  try {
    ensureDir(p);
    /* 先写临时文件再改名，避免并发下读到半个文件 */
    const tmp = p + '.' + process.pid + '.' + crypto.randomBytes(3).toString('hex');
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, p);
  } catch { /* 写不进去就算了，下次再取 */ }
}

/* ── 取瓦片 ────────────────────────────────────────────────
   内存里再放一层最近用过的，手机上滑动地图时不用每次读盘。 */

const memCache = new Map();
const MEM_LIMIT = 400;

function memGet(key) {
  const hit = memCache.get(key);
  if (!hit) return null;
  /* LRU：命中的挪到末尾 */
  memCache.delete(key);
  memCache.set(key, hit);
  return hit;
}

function memSet(key, val) {
  memCache.set(key, val);
  if (memCache.size > MEM_LIMIT) {
    const oldest = memCache.keys().next().value;
    memCache.delete(oldest);
  }
}

/* 同一块瓦片同时被两个人要，只发一次外部请求 */
const inflight = new Map();

async function fetchTile(style, z, x, y) {
  const key = `${style}/${z}/${x}/${y}`;

  const mem = memGet(key);
  if (mem) return mem;

  const disk = readCache(style, z, x, y);
  if (disk) {
    memSet(key, disk);
    return disk;
  }

  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    const s = 1 + Math.floor(Math.random() * 4); // webrd01~04
    const url = STYLES[style](x, y, z, s);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: {
          /* 高德对没有 UA 的请求也放行，但带上更像正常浏览器 */
          'user-agent': 'Mozilla/5.0 (compatible; LoversNest/1.0)',
          accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
        },
      });
      if (!res.ok) throw new Error('upstream ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) throw new Error('too small');
      const type = (res.headers.get('content-type') || '').split(';')[0] || 'image/png';
      const out = { buf, type };
      writeCache(style, z, x, y, buf);
      memSet(key, out);
      return out;
    } finally {
      clearTimeout(timer);
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

function validTile(z, x, y) {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z < MIN_Z || z > MAX_Z) return false;
  const n = 1 << z;
  return x >= 0 && x < n && y >= 0 && y < n;
}

/* 清缓存：设了上限就只清最久没动的 */
function prune(limitMb = 300) {
  let total = 0;
  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          const st = fs.statSync(p);
          total += st.size;
          files.push({ p, size: st.size, at: st.mtimeMs });
        } catch { /* ignore */ }
      }
    }
  };
  walk(TILE_DIR);
  if (total <= limitMb * 1024 * 1024) return { removed: 0, total };

  files.sort((a, b) => a.at - b.at); // 最老的先删
  const target = limitMb * 1024 * 1024 * 0.8;
  let removed = 0;
  for (const f of files) {
    if (total <= target) break;
    try { fs.unlinkSync(f.p); total -= f.size; removed++; } catch { /* ignore */ }
  }
  return { removed, total };
}

function stats() {
  let total = 0;
  let count = 0;
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try { total += fs.statSync(p).size; count++; } catch { /* ignore */ }
      }
    }
  };
  walk(TILE_DIR);
  return { count, bytes: total };
}

module.exports = {
  TILE_DIR, MIN_Z, MAX_Z, STYLES, normalizeStyle, validTile,
  fetchTile, readCache, prune, stats, MAX_AGE_MS,
};

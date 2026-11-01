'use strict';

/* ═══════════════════════════════════════════════════════
   小窝 · 核心层
   状态、接口、UI 原语
   ═══════════════════════════════════════════════════════ */

const App = {
  settings: {},
  stats: {},
  today: '',
  me: 'a',          // 当前登录的人：a / b，由登录时认领，服务端下发
  posts: [],
  nextBefore: null,
  hasMore: false,
  cycle: null,
  anniversaries: [],
  daily: null,
  view: 'home',
  location: null,
  watchId: null,
};

/* ───────────── 工具 ───────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad(n) { return String(n).padStart(2, '0'); }

function isoOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffDays(b, a) {
  const db = parseISO(b), da = parseISO(a);
  if (!db || !da) return null;
  return Math.round((db - da) / 86400000);
}

function addDays(iso, n) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

function humanTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  const d = new Date(ts);
  const t = isoOf(d);
  const tdy = App.today || isoOf(new Date());
  if (t === tdy) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (t === addDays(tdy, -1)) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dd = diffDays(tdy, t);
  if (dd !== null && dd > 1 && dd < 7) return `${dd} 天前`;
  if (d.getFullYear() === new Date().getFullYear()) {
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  }
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function fullTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dayLabel(iso) {
  const tdy = App.today || isoOf(new Date());
  const dd = diffDays(tdy, iso);
  const d = parseISO(iso);
  if (!d) return iso;
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  if (dd === 0) return `今天 · 周${week}`;
  if (dd === 1) return `明天 · 周${week}`;
  if (dd === 2) return `后天 · 周${week}`;
  if (dd === -1) return `昨天 · 周${week}`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${week}`;
}

function nameA() { return App.settings['couple.name_a'] || '我'; }
function nameB() { return App.settings['couple.name_b'] || '宝贝'; }
function nameOf(who) { return who === 'b' ? nameB() : nameA(); }

function avatarHTML(who, size = '') {
  const key = who === 'b' ? 'couple.avatar_b' : 'couple.avatar_a';
  const url = App.settings[key];
  const cls = `avatar${who === 'b' ? ' avatar--b' : ''}${size ? ' avatar--' + size : ''}`;
  if (url) return `<div class="${cls}"><img src="${esc(url)}" alt=""></div>`;
  const initial = (nameOf(who) || '?').slice(0, 1);
  return `<div class="${cls}">${esc(initial)}</div>`;
}

/* ───────────── 接口 ───────────── */

async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();

  if (res.status === 401) {
    if (data && data.needLogin) {
      window.location.href = '/login';
      throw new Error('need login');
    }
  }
  if (!res.ok) {
    const msg = (data && data.error) || `出错了 (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ───────────── Toast ───────────── */

let toastStack = null;

function toast(msg, type = '') {
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    document.body.appendChild(toastStack);
  }
  const el = document.createElement('div');
  el.className = `toast${type ? ' toast--' + type : ''}`;
  el.textContent = msg;
  toastStack.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 2400);
}

/* ───────────── 模态框 ───────────── */

let modalStack = [];

function openModal({ title, body, footer, wide = false, onMount, onClose }) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal__head">
        <div class="modal__title">${esc(title)}</div>
        <button class="modal__close" type="button" aria-label="关闭">✕</button>
      </div>
      <div class="modal__body">${body}</div>
      ${footer ? `<div class="modal__foot">${footer}</div>` : ''}
    </div>`;

  const close = () => {
    mask.remove();
    modalStack = modalStack.filter((m) => m !== close);
    if (!modalStack.length) document.body.style.overflow = '';
    if (onClose) onClose();
  };

  mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });
  mask.querySelector('.modal__close').addEventListener('click', close);

  document.body.appendChild(mask);
  document.body.style.overflow = 'hidden';
  modalStack.push(close);

  const modal = mask.querySelector('.modal');
  if (onMount) onMount(modal, close);

  const firstInput = modal.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select');
  if (firstInput) setTimeout(() => firstInput.focus(), 60);

  return { mask, modal, close };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modalStack.length) { modalStack[modalStack.length - 1](); return; }
    const lb = $('.lightbox');
    if (lb) lb.remove();
  }
});

/* ───────────── 灯箱 ───────────── */

function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `<button class="lightbox__close" aria-label="关闭">✕</button><img src="${esc(src)}" alt="">`;
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.classList.contains('lightbox__close')) el.remove();
  });
  document.body.appendChild(el);
}

/* ───────────── 确认 ───────────── */

function confirmDialog(message, onOk, okText = '删除') {
  openModal({
    title: '确认一下',
    body: `<p style="font-size:14.5px;line-height:1.8;color:var(--ink-700)">${esc(message)}</p>`,
    footer: `<button class="btn btn--ghost" data-cancel>再想想</button>
             <button class="btn btn--danger" data-ok>${esc(okText)}</button>`,
    onMount(modal, close) {
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-ok]').onclick = async () => {
        close();
        await onOk();
      };
    },
  });
}

/* ───────────── 图片压缩 ───────────── */

function compressImage(file, maxSide = 1600, quality = 0.86) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('不是图片')); return; }
    if (file.type === 'image/gif') { resolve(file); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        if (blob.size > file.size && file.size < 900 * 1024) { resolve(file); return; }
        const out = new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
        resolve(out);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读不出来')); };
    img.src = url;
  });
}

async function uploadFiles(files, onProgress) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 9);
  if (!list.length) return [];

  const compressed = [];
  for (let i = 0; i < list.length; i++) {
    if (onProgress) onProgress(`正在处理 ${i + 1}/${list.length} 张…`);
    try {
      compressed.push(await compressImage(list[i]));
    } catch {
      /* 跳过坏图 */
    }
  }
  if (!compressed.length) throw new Error('没有可用的图片');

  const fd = new FormData();
  for (const f of compressed) fd.append('files', f, f.name);
  const data = await api('/api/upload', { method: 'POST', body: fd });
  return data.files || [];
}

/* ───────────── 文件选择 ───────────── */

function pickFiles(accept = 'image/*', multiple = true) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}

/* ───────────── 通用小组件 ───────────── */

function ring(percent, color) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, percent));
  return `<svg width="96" height="96" viewBox="0 0 96 96">
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(168,144,154,0.18)" stroke-width="7"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="${color || 'var(--accent)'}" stroke-width="7"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"
      style="transition: stroke-dashoffset 0.9s cubic-bezier(0.32,0.72,0,1)"/>
  </svg>`;
}

function emptyState(icon, title, desc) {
  return `<div class="empty">
    <div class="empty__icon">${icon}</div>
    <div class="empty__title">${esc(title)}</div>
    ${desc ? `<div class="empty__desc">${desc}</div>` : ''}
  </div>`;
}

const MOODS = {
  happy:   { icon: '😊', label: '开心' },
  love:    { icon: '🥰', label: '心动' },
  calm:    { icon: '😌', label: '平静' },
  excited: { icon: '🤩', label: '兴奋' },
  shy:     { icon: '😳', label: '害羞' },
  meh:     { icon: '😐', label: '一般' },
  tired:   { icon: '😪', label: '累了' },
  sad:     { icon: '🥺', label: '难过' },
  angry:   { icon: '😤', label: '生气' },
  sick:    { icon: '🤒', label: '不舒服' },
};

const WEATHERS = {
  sunny: { icon: '☀️', label: '晴' },
  cloudy: { icon: '⛅', label: '多云' },
  rainy: { icon: '🌧️', label: '雨' },
  snowy: { icon: '❄️', label: '雪' },
  windy: { icon: '🌬️', label: '风' },
  night: { icon: '🌙', label: '夜' },
};

function moodTag(mood) {
  const m = MOODS[mood];
  return m ? `<span class="tag">${m.icon} ${m.label}</span>` : '';
}

function weatherTag(w) {
  const m = WEATHERS[w];
  return m ? `<span class="tag tag--sage">${m.icon} ${m.label}</span>` : '';
}

function loadingBlock() {
  return `<div class="loading-center"><div class="spinner"></div></div>`;
}

/* ───────────── 本地偏好 ───────────── */

function loadPrefs() {
  try {
    const accent = localStorage.getItem('nest.accent');
    if (accent) document.documentElement.dataset.accent = accent;
    const theme = localStorage.getItem('nest.theme');
    if (theme) document.documentElement.dataset.theme = theme;
  } catch { /* 隐私模式 */ }
}

/* 身份不再由前端自选：登录时在门禁页认领，服务端写进会话。
   这里只做归一化，任何越界值都回落到 'a'。 */
function setMe(who) {
  App.me = who === 'b' ? 'b' : 'a';
  try { localStorage.setItem('nest.me', App.me); } catch { /* ignore */ }
  $$('[data-me-toggle]').forEach((el) => {
    el.classList.toggle('on', el.dataset.meToggle === App.me);
  });
}

function otherOf(who) { return (who === 'b' ? 'a' : 'b'); }

/* ───────────── 定位上报 ───────────── */

/* 浏览器定位：watchPosition 比 setInterval 省电，也不会在后台被限流得太厉害。
   只在页面可见时上报，切到后台就暂停——手机上长期开着也别把电吃光。 */
function startLocWatch() {
  if (App.watchId !== null) return;
  if (!navigator.geolocation) { toast('这个浏览器不支持定位', 'err'); return; }
  App.watchId = navigator.geolocation.watchPosition(
    (pos) => { pushLocation(pos).catch(() => {}); },
    (err) => {
      const msg = err && err.code === 1
        ? '定位权限被拒绝了，去浏览器设置里允许一下'
        : '暂时定不到位，等会儿再试';
      toast(msg, 'err');
      stopLocWatch();
    },
    { enableHighAccuracy: true, maximumAge: 30 * 1000, timeout: 25 * 1000 }
  );
}

function stopLocWatch() {
  if (App.watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(App.watchId);
  }
  App.watchId = null;
}

async function pushLocation(pos) {
  const c = pos.coords || {};
  const battery = await readBattery();
  return api('/api/location', {
    method: 'POST',
    body: {
      lat: c.latitude,
      lng: c.longitude,
      acc: Number.isFinite(c.accuracy) ? c.accuracy : null,
      speed: Number.isFinite(c.speed) ? c.speed : null,
      heading: Number.isFinite(c.heading) ? c.heading : null,
      altitude: Number.isFinite(c.altitude) ? c.altitude : null,
      battery: battery ? battery.level : null,
      charging: battery ? battery.charging : false,
      source: 'gps',
    },
  });
}

/* 电量：Battery Status API 只有部分浏览器有，没有就返回 null，界面上不显示 */
async function readBattery() {
  if (!navigator.getBattery) return null;
  try {
    const b = await navigator.getBattery();
    return { level: Math.round(b.level * 100), charging: !!b.charging };
  } catch {
    return null;
  }
}

/* 单次定位（用户点「现在更新一下」时用） */
function getOnce() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('这个浏览器不支持定位')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      (e) => reject(new Error(e && e.code === 1 ? '定位权限被拒绝了' : '暂时定不到位')),
      { enableHighAccuracy: true, timeout: 25 * 1000, maximumAge: 0 }
    );
  });
}

/* 距离 / 方位：与服务端 lib/geo.js 同一套公式，前端算是为了拖动时实时更新 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dφ = rad(lat2 - lat1);
  const dλ = rad(lng2 - lng1);
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function humanDistance(m) {
  if (m === null || m === undefined) return '';
  const n = Number(m);
  if (!Number.isFinite(n)) return '';
  if (n < 1000) return `${Math.round(n / 10) * 10} 米`;
  if (n < 10000) return `${(n / 1000).toFixed(1)} 公里`;
  return `${Math.round(n / 1000)} 公里`;
}

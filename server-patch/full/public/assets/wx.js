'use strict';

/* ═══════════════════════════════════════════════════════════════
   wx.js · 微信式视图层（v2）
   ─ chats     聊天列表（首页）
   ─ messages  聊天线程 + 站内搜索 + 图片画廊 + 长按菜单
   ─ moments   朋友圈
   ─ discover  发现
   ─ me        我
   其它老视图（时光轴 / 周期 / 设置…）继续由 views.js 提供。
   ═══════════════════════════════════════════════════════════════ */

const WX_PAT = '__pat__';

/* ───────────── 图标（统一 24 网格、1.7 描边） ───────────── */

const WX_ICO = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 5.4h16a1.7 1.7 0 0 1 1.7 1.7v8.2a1.7 1.7 0 0 1-1.7 1.7h-7L8.2 20.6v-3.6H4A1.7 1.7 0 0 1 2.3 15.3V7.1A1.7 1.7 0 0 1 4 5.4Z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.2v3.6h2.8l6 3.9V6.3l-6 3.9H4Z"/><path d="M16.6 9.2a4 4 0 0 1 0 5.6"/><path d="M19 6.8a7.4 7.4 0 0 1 0 10.4"/></svg>',
  mood: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/></svg>',
  location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 21s7-6.1 7-10.8a7 7 0 1 0-14 0C5 14.9 12 21 12 21Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  cycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20.2 14.6A8.6 8.6 0 1 1 9.4 3.8a7 7 0 0 0 10.8 10.8Z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.3 4.9 13a4.6 4.6 0 0 1 6.5-6.5l.6.6.6-.6A4.6 4.6 0 1 1 19.1 13Z"/></svg>',
  cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.4h17"/><path d="M5.4 20.4v-6.2a1.8 1.8 0 0 1 1.8-1.8h9.6a1.8 1.8 0 0 1 1.8 1.8v6.2"/><path d="M12 12.4V9.6"/><circle cx="12" cy="8" r="1.3"/></svg>',
  wish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3.6 2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8-5.3 2.8 1-6L3.3 10l6-.9Z"/></svg>',
  trip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="4" y="7.6" width="16" height="12" rx="2"/><path d="M9 7.6V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6v2"/><path d="M9.6 19.6v1.6M14.4 19.6v1.6"/></svg>',
  movie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.6h18M7.6 5v4.6M12 5v4.6M16.4 5v4.6"/></svg>',
  capsule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="4" y="9.4" width="16" height="11" rx="2"/><path d="M4 13.6h16"/><path d="M12 9.4V6"/><circle cx="12" cy="4.4" r="1.4"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m4 11 8-6.6 8 6.6"/><path d="M6.6 9.8v10.2h10.8V9.8"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.3M12 18.9v2.3M2.8 12h2.3M18.9 12h2.3M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20.2 14.6A8.6 8.6 0 1 1 9.4 3.8a7 7 0 0 0 10.8 10.8Z"/></svg>',
  moments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4.6" width="18" height="14.8" rx="2"/><circle cx="8.6" cy="10" r="1.6"/><path d="m4.4 17.6 4.9-4.3 3.2 2.6 2.7-2.2 4.4 3.9"/></svg>',
  timeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="2.2"/><circle cx="6.5" cy="17.5" r="2.2"/><path d="M6.5 8.7v6.6"/><path d="M11 6.5h8M11 17.5h8"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.4" cy="9.8" r="1.5"/><path d="m4.6 17.4 4.7-4.2 3.1 2.5 2.6-2.1 4.4 3.8"/></svg>',
  smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><circle cx="9.2" cy="10.2" r="0.9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10.2" r="0.9" fill="currentColor" stroke="none"/><path d="M8.6 14.4a4.2 4.2 0 0 0 6.8 0"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5.6v12.8M5.6 12h12.8"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.4"/><path d="m15.9 15.9 4.1 4.1"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="8.4" y="8.4" width="11" height="11.6" rx="2"/><path d="M16.2 8.4V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8.2a2 2 0 0 0 2 2h2.4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.2h14"/><path d="M8.6 7.2V5.6A1.6 1.6 0 0 1 10.2 4h3.6a1.6 1.6 0 0 1 1.6 1.6v1.6"/><path d="M7.2 7.2v11.2A1.6 1.6 0 0 0 8.8 20h6.4a1.6 1.6 0 0 0 1.6-1.6V7.2"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.6a1.5 1.5 0 0 1 3 0V11"/><path d="M12 11V4.6a1.5 1.5 0 0 1 3 0V11"/><path d="M15 11.4V7.4a1.5 1.5 0 0 1 3 0v6.2c0 3.4-2.4 6.4-6 6.4s-6-2.4-6-5.4v-3a1.5 1.5 0 0 1 3 0"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/></svg>',  chev: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4.4 2.2 3.6 3.8-3.6 3.8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.6 12.4 4.6 4.6L19.4 6.8"/></svg>',
  check2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2.6 12.4 4.2 4.2L15 8"/><path d="m9.4 12.4 4.2 4.2L22 8"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8.6 8.4a3.5 3.5 0 1 1 4.6 3.3c-.9.4-1.2 1-1.2 1.9v.6"/><circle cx="12" cy="18.2" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.6h2.2M4 12h2.2M4 17.4h2.2"/><path d="m9.4 6.6 1.5 1.5L13.6 5"/><path d="m9.4 12 1.5 1.5L13.6 10.4"/><path d="M9.4 17.4h9.2"/><path d="M16.4 6.6h2.2M16.4 12h2.2"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.6" width="16" height="16.8" rx="2.2"/><path d="M8.4 16.4v-3.6M12 16.4V8.6M15.6 16.4v-2.2"/></svg>',
  album: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.2" y="4.4" width="17.6" height="15.2" rx="2.2"/><path d="M3.2 15.6 8.4 10.8l3.4 2.9 2.9-2.4 5.1 4.5"/><circle cx="8.8" cy="9" r="1.5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.4" y="5.2" width="17.2" height="15.2" rx="2.2"/><path d="M3.4 9.8h17.2M8 3.4v3.4M16 3.4v3.4"/><circle cx="8.4" cy="13.6" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="13.6" r="1" fill="currentColor" stroke="none"/></svg>',
  sprout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-7.4"/><path d="M12 13.6c0-3.2-2.4-5.6-5.6-5.6 0 3.2 2.4 5.6 5.6 5.6Z"/><path d="M12 13.6c0-3.6 2.6-6.2 6.2-6.2 0 3.6-2.6 6.2-6.2 6.2Z"/></svg>',
  medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="15" r="5.6"/><path d="m8.6 9.6-2.2-6 3.4 1.6L12 2l2.2 3.2 3.4-1.6-2.2 6"/></svg>',
  dot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="6.4" stroke-dasharray="2.6 3.4"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 8.2A2.2 2.2 0 0 1 5.6 6h11.2a2.2 2.2 0 0 1 2.2 2.2v1.2"/><rect x="3.4" y="8.2" width="17.2" height="10.4" rx="2.2"/><path d="M16.4 13.4h1.6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5.4 8.4h13.2l-1.2 11.2a1.8 1.8 0 0 1-1.8 1.6H8.4a1.8 1.8 0 0 1-1.8-1.6Z"/><path d="M9 8.4V6.6a3 3 0 0 1 6 0v1.8"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.2 13.8a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1.6 1.6"/><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1.6-1.6"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 18.4V5.6l9.2-1.8v12.6"/><circle cx="7" cy="18.4" r="2.6"/><circle cx="16.2" cy="16.4" r="2.6"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4"/><circle cx="8.6" cy="8.6" r="1.15" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/></svg>',
  tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-6.4"/><path d="M12 14.6c-4 0-6.6-2.6-6.6-6A6.6 6.6 0 0 1 12 2.4a6.6 6.6 0 0 1 6.6 6.2c0 3.4-2.6 6-6.6 6Z"/><path d="m8.4 20.8 3.6-2 3.6 2"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4 4 16.6"/><path d="m9.4 4.6 2.6 2 2.6-2M9.4 19.4l2.6-2 2.6 2"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3.4 2.2 5.6 5.6 2.2-5.6 2.2L12 19l-2.2-5.6L4.2 11.2l5.6-2.2Z"/><path d="M18.4 17.6v3M16.9 19.1h3"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.8" width="6" height="11.4" rx="3"/><path d="M5.4 11.6a6.6 6.6 0 0 0 13.2 0"/><path d="M12 18.2v3"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="6.2" width="18.8" height="11.6" rx="2.4"/><path d="M6.4 10h.02M9.6 10h.02M12.8 10h.02M16 10h.02M6.4 13.4h.02M9.6 13.4h.02M12.8 13.4h.02M16 13.4h.02"/><path d="M8 16.4h8"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.4 5.6 19 12 8.4 18.4Z"/></svg>',
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3.6 12h.02M7 9.4v5.2M10.4 7.4v9.2M13.8 9v6M17.2 10.4v3.2M20.6 12h.02"/></svg>',
};

/* 右箭头：所有行统一这一枚 */
function wxChev() {
  return `<span class="wx-chev">${WX_ICO.chev}</span>`;
}

const WX_EMOJI = ['😊', '🥰', '😘', '😌', '😭', '😤', '🤔', '😴', '🙈', '❤️', '🌹', '🎁', '🍰', '☕', '🌙', '☀️', '✨', '🐷', '👀', '🫶'];

/* 朋友圈点赞 / 评论按钮上的小图标（17px，和 .wx-act 的字号对齐） */
const WX_HEART = '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 20.3 4.9 13a4.6 4.6 0 0 1 6.5-6.5l.6.6.6-.6A4.6 4.6 0 1 1 19.1 13Z"/></svg>';
const WX_HEART_O = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 20.3 4.9 13a4.6 4.6 0 0 1 6.5-6.5l.6.6.6-.6A4.6 4.6 0 1 1 19.1 13Z"/></svg>';const WX_CMT = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 5.6h16a1.6 1.6 0 0 1 1.6 1.6v8.2a1.6 1.6 0 0 1-1.6 1.6h-7.1L8.2 20.4v-3.4H4A1.6 1.6 0 0 1 2.4 15.4V7.2A1.6 1.6 0 0 1 4 5.6Z"/></svg>';

/* ───────────── 小工具 ───────────── */

function wxLoading() {
  return '<div class="wx-loading"><div class="spinner"></div></div>';
}

function wxEmpty(title, sub, ico) {
  return `<div class="wx-empty">${ico ? `<div class="wx-empty__ico">${ico}</div>` : ''}<div class="wx-empty__t">${esc(
    title || ''
  )}</div>${sub ? `<div class="wx-empty__d">${esc(sub)}</div>` : ''}</div>`;
}

/* 彩色方块图标：列表左侧 */
function wxIco(name, n) {
  return `<span class="wx-ico wx-ico--${n || 8}">${WX_ICO[name] || ''}</span>`;
}

/* 大号彩色方块头像（给「公告栏」「你在哪儿」这类非人类会话用） */
function wxCellIco(name, n) {
  return `<div class="wx-cell__av wx-cell__av--ico wx-ico--${n || 8}">${WX_ICO[name] || ''}</div>`;
}

/* 发布框工具条图标（24 网格，与全站图标同一描边语言） */
function wxTool(name) {
  const s = WX_ICO[name] || '';
  return s.replace('<svg ', '<svg width="21" height="21" ');
}

/* 心情 / 天气小标签：存的是 key，显示要翻成中文 */
function wxMoodChip(k) {
  if (!k) return '';
  const m = (typeof MOODS !== 'undefined' && MOODS[k]) || null;
  const text = m ? `${m.icon} ${m.label}` : k;
  return `<span class="wx-chip wx-chip--mood">${esc(text)}</span>`;
}
function wxWeatherChip(k) {
  if (!k) return '';
  const m = (typeof WEATHERS !== 'undefined' && WEATHERS[k]) || null;
  const text = m ? `${m.icon} ${m.label}` : k;
  return `<span class="wx-chip wx-chip--wx">${esc(text)}</span>`;
}
function wxHomeTitle() {
  const s = App.settings || {};
  return s['couple.title'] || '我们的小窝';
}

function wxSubTitle() {
  const s = App.settings || {};
  return s['couple.subtitle'] || '';
}

/* 列表右侧时间：今天 HH:MM / 昨天 / 星期X / M月D日 / YYYY/M/D */
function wxListClock(ts) {
  const t = Number(ts) || 0;
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 1) return '昨天';
  if (diff > 1 && diff < 7) return '星期' + '日一二三四五六'[d.getDay()];
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/* 朋友圈时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / 日期 */
function wxFeedClock(ts) {
  const t = Number(ts) || 0;
  if (!t) return '';
  const diff = Date.now() - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 172800000) return '昨天';
  return wxListClock(t);
}

function wxScrollBottom(smooth) {
  const c = $('#content');
  if (!c) return;
  c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

/* 刚插完 DOM 时 scrollHeight 还没算完，滚不到底。
   这里补两帧：rAF 后一次、80ms 后一次，图片解码晚也能跟上。 */
function wxPinBottom(smooth) {
  wxScrollBottom(false);
  requestAnimationFrame(() => wxScrollBottom(false));
  setTimeout(() => wxScrollBottom(smooth), 80);
}

function wxNearBottom() {
  const c = $('#content');
  if (!c) return true;
  return c.scrollHeight - c.scrollTop - c.clientHeight < 140;
}

/* ═══════════════════════════════════════════════════════════════
   通用：图片画廊
   用法：容器里放若干 <img data-zoom="url">，wxBindZoom 自动成组
   ═══════════════════════════════════════════════════════════════ */

function wxGallery(urls, start) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return;
  let i = Math.min(Math.max(0, Number(start) || 0), list.length - 1);

  const box = document.createElement('div');
  box.className = 'wx-gal';
  box.innerHTML = `
    <img class="wx-gal__img" src="${esc(list[i])}" alt="">
    <div class="wx-gal__n">${i + 1} / ${list.length}</div>
    <button class="wx-gal__x" type="button" aria-label="关闭">${WX_ICO.close}</button>
    ${list.length > 1 ? '<button class="wx-gal__nav wx-gal__nav--l" type="button" aria-label="上一张">‹</button>' : ''}
    ${list.length > 1 ? '<button class="wx-gal__nav wx-gal__nav--r" type="button" aria-label="下一张">›</button>' : ''}`;

  const img = box.querySelector('.wx-gal__img');
  const num = box.querySelector('.wx-gal__n');
  const paint = () => {
    img.src = list[i];
    num.textContent = `${i + 1} / ${list.length}`;
  };
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
  };
  const step = (d) => {
    i = (i + d + list.length) % list.length;
    paint();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  };

  box.querySelector('.wx-gal__x').onclick = close;
  const l = box.querySelector('.wx-gal__nav--l');
  const r = box.querySelector('.wx-gal__nav--r');
  if (l) l.onclick = (e) => { e.stopPropagation(); step(-1); };
  if (r) r.onclick = (e) => { e.stopPropagation(); step(1); };

  /* 手机上左右滑 */
  let x0 = null;
  box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 46) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  box.addEventListener('click', (e) => {
    if (e.target === box || e.target === img) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
}

/* 把容器里的 [data-zoom] 编成一组 */
function wxBindZoom(root) {
  if (!root) return;
  const groups = new Map();
  root.querySelectorAll('[data-zoom]').forEach((img) => {
    const host = img.closest('[data-gallery]') || img.parentElement || root;
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(img);
  });
  groups.forEach((imgs) => {
    if (imgs[0] && imgs[0].dataset.zoomGroup === '1') return;
    imgs.forEach((im) => { im.dataset.zoomGroup = '1'; });
    const urls = imgs.map((x) => x.getAttribute('data-zoom'));
    imgs.forEach((im, idx) => {
      if (im.dataset.zoomBound) return;
      im.dataset.zoomBound = '1';
      im.addEventListener('click', () => wxGallery(urls, idx));
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   通用：底部动作面板
   ═══════════════════════════════════════════════════════════════ */

function wxSheet(title, items) {
  const mask = document.createElement('div');
  mask.className = 'wx-sheet-mask';
  mask.innerHTML = `<div class="wx-sheet">
    ${title ? `<div class="wx-sheet__t">${esc(title)}</div>` : ''}
    ${(items || [])
      .map(
        (it, i) =>
          `<button class="wx-sheet__b${it.danger ? ' wx-sheet__b--danger' : ''}" type="button" data-i="${i}">${esc(
            it.label
          )}</button>`
      )
      .join('')}
    <button class="wx-sheet__cancel" type="button" data-cancel>取消</button>
  </div>`;

  const close = () => mask.remove();
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });
  mask.querySelector('[data-cancel]').onclick = close;
  mask.querySelectorAll('[data-i]').forEach((b) => {
    b.onclick = () => {
      const it = (items || [])[Number(b.dataset.i)];
      close();
      if (it && typeof it.run === 'function') it.run();
    };
  });
  document.body.appendChild(mask);
  return mask;
}

/* ═══════════════════════════════════════════════════════════════
   1. 聊天列表（首页）
   ═══════════════════════════════════════════════════════════════ */

function wxHeroHTML() {
  const stats = App.stats || {};
  const counts = stats.counts || {};
  const days = stats.togetherDays;
  const startDate = (App.settings || {})['couple.start_date'] || '';

  const chips = [];
  chips.push(`<button class="wx-hero__chip" type="button" data-go="timeline">${WX_ICO.timeline}动态 ${counts.posts || 0}</button>`);
  if (counts.wishes) {
    chips.push(
      `<button class="wx-hero__chip" type="button" data-go="wishes">${WX_ICO.wish}愿望 ${counts.wishesDone || 0}/${counts.wishes}</button>`
    );
  }
  if (counts.anniversaries) {
    chips.push(
      `<button class="wx-hero__chip" type="button" data-go="anniversaries">${WX_ICO.cake}纪念日 ${counts.anniversaries}</button>`
    );
  }

  return `<div class="wx-hero">
    <div class="wx-hero__k">${days ? 'TOGETHER' : esc(wxSubTitle() || 'OUR LITTLE NEST')}</div>
    <div class="wx-hero__n">${days ? `${days}<small>天</small>` : esc(wxHomeTitle())}</div>
    <div class="wx-hero__row">${chips.join('')}</div>
    ${startDate ? `<div class="wx-hero__k" style="margin-top:14px;opacity:.72">从 ${esc(startDate)} 开始</div>` : ''}
  </div>`;
}

/* 会话列表里的一行：头像 / 名称 / 预览 / 时间 / 红点 */
function wxConvRow(o) {
  const dot = Number(o.badge) > 0
    ? `<span class="p-dot">${Number(o.badge) > 99 ? '99+' : o.badge}</span>`
    : '';
  const av = o.avatar
    ? `<div class="p-cell__av">${o.avatar}</div>`
    : `<div class="p-cell__ico ${o.icoCls || 'ico-8'}">${WX_ICO[o.ico] || ''}</div>`;
  return `<button class="p-cell" type="button" data-go="${esc(o.go)}">
    ${av}
    <div class="p-cell__body">
      <div class="p-cell__t">${esc(o.name)}</div>
      <div class="p-cell__d">${esc(o.desc || '')}</div>
    </div>
    <div class="p-cell__meta">
      <span class="p-cell__time">${esc(o.time || '')}</span>
      ${dot}
    </div>
  </button>`;
}

Views.chats = async function (el) {
  if (App.setChrome) App.setChrome({ title: '聊天', sub: '', back: false, tab: 'chats', actions: 'chat' });
  el.innerHTML = wxLoading();

  const d = await api('/api/chats/summary').catch(() => null);

  const other = otherOf(App.me);
  const badges = App.badges || {};
  const unread = d ? Number(d.unread || 0) : Number(badges.messages || 0);
  const annUnread = d ? Number(d.annUnread || 0) : Number(badges.announcements || 0);

  /* 会话预览 */
  let preview = '还没说过话，说第一句吧';
  if (d && d.last) {
    const m = d.last;
    const bits = [];
    if (m.body === WX_PAT) bits.push('[拍了拍]');
    else if (m.body) bits.push(String(m.body).replace(/\s+/g, ' '));
    if (m.hasMedia) bits.push('[图片]');
    preview = (m.who === App.me ? '我：' : '') + (bits.join(' ') || '[消息]');
  }

  const annPreview = d && d.ann
    ? String(d.ann.title || d.ann.body || '有新公告').replace(/\s+/g, ' ')
    : '还没有公告';

  el.innerHTML = `<div class="p-page">
    <div class="p-list p-list--flush" style="margin-top:8px">
      ${wxConvRow({
        go: 'messages',
        name: nameOf(other),
        desc: preview,
        time: d && d.last ? wxListClock(d.last.createdAt) : '',
        badge: unread,
        avatar: avatarHTML(other),
      })}
      ${wxConvRow({
        go: 'announcements',
        ico: 'pin',
        icoCls: 'ico-3',
        name: '公告栏',
        desc: annPreview,
        time: '',
        badge: annUnread,
      })}
    </div>
    <div class="p-sign">只有你们两个人能看见</div>
  </div>`;

  el.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = () => App.go(b.dataset.go);
  });
};

/* ═══════════════════════════════════════════════════════════════
   1b. 今日一问 —— 已并入「默契测验」，这里只做跳转，保证老链接不断
   ═══════════════════════════════════════════════════════════════ */

Views.daily = async function (el) {
  App.go('quiz', { replace: true });
};


/* ═══════════════════════════════════════════════════════════════
   2. 聊天线程
   ═══════════════════════════════════════════════════════════════ */

let wxChatTimer = null;
let wxChatSig = '';
let wxChatPaused = false;   /* 跳转到历史位置时暂停轮询重绘 */
let wxSearchOpen = false;

function wxBubble(m) {
  if (m.body === WX_PAT) {
    return `<div class="wx-sys" data-mid="${m.id}">${esc(nameOf(m.who))} 拍了拍 ${esc(nameOf(otherOf(m.who)))}</div>`;
  }
  const mine = m.who === App.me;
  const md = m.media || null;
  const isVoice = !!(md && md.url && /^audio\//i.test(md.mime || ''));
  const hasMedia = !!(md && md.url) && !isVoice;
  const voice = isVoice ? wxVoiceBubble(md) : '';
  const text = m.body ? `<div class="wx-bub">${esc(m.body).replace(/\n/g, '<br>')}</div>` : '';
  const img = hasMedia
    ? `<div class="wx-bub wx-bub--img"><img class="wx-bub__img" src="${esc(md.url)}" data-zoom="${esc(md.url)}" alt="" loading="lazy"></div>`
    : '';
  const tick = mine
    ? `<span class="tick">${m.readAt ? WX_ICO.check2 : WX_ICO.check}</span>`
    : '';
  return `<div class="wx-msg${mine ? ' wx-msg--mine' : ''}" data-mid="${m.id}">
    <div class="wx-msg__av" data-pat="${esc(m.who)}">${avatarHTML(m.who)}</div>
    <div class="wx-msg__col">${text}${img}${voice}
      <div class="wx-msg__meta"><span>${esc(chatClock(m.createdAt))}</span>${tick}</div>
    </div>
  </div>`;
}

/* 语音气泡：宽度跟时长走，和微信一样短消息窄、长消息宽 */
function wxVoiceBubble(md) {
  const dur = Math.max(1, Math.min(60, Math.round(Number(md.duration) || 1)));
  const w = Math.round(74 + (dur / 60) * 104);
  return `<div class="wx-bub wx-bub--voice" data-audio="${esc(md.url)}" data-dur="${dur}" style="width:${w}px">
    <span class="wx-voice__wave">${WX_ICO.wave}</span>
    <span class="wx-voice__dur">${dur}″</span>
  </div>`;
}

/* 全局只有一个播放器：点第二段就停掉第一段 */
let wxAudioEl = null;
let wxAudioNode = null;
function wxPlayVoice(node) {
  const url = node.dataset.audio;
  if (!url) return;
  if (wxAudioNode === node && wxAudioEl && !wxAudioEl.paused) {
    wxAudioEl.pause();
    wxAudioEl.currentTime = 0;
    node.classList.remove('is-playing');
    return;
  }
  if (wxAudioNode && wxAudioNode !== node) wxAudioNode.classList.remove('is-playing');
  if (!wxAudioEl) {
    wxAudioEl = new Audio();
    wxAudioEl.preload = 'metadata';
    wxAudioEl.addEventListener('ended', () => {
      if (wxAudioNode) wxAudioNode.classList.remove('is-playing');
    });
  }
  if (wxAudioEl.getAttribute('src') !== url) wxAudioEl.src = url;
  wxAudioNode = node;
  node.classList.add('is-playing');
  wxAudioEl.currentTime = 0;
  const p = wxAudioEl.play();
  if (p && p.catch) {
    p.catch(() => {
      node.classList.remove('is-playing');
      toast('这段语音放不出来', 'err');
    });
  }
}

function wxBindVoice(root) {
  if (!root) return;
  root.querySelectorAll('.wx-bub--voice').forEach((node) => {
    if (node.dataset.voiceBound) return;
    node.dataset.voiceBound = '1';
    node.onclick = (e) => {
      e.stopPropagation();
      wxPlayVoice(node);
    };
  });
}

/* ───────────── 语音录制：按住说话 ─────────────
   按住 → MediaRecorder 开始录；松手 → 停 + 上传 + 发消息。
   上滑超过 60px 取消（和微信一样）。最长 60 秒。 */

const WX_VOICE_MAX = 60000;

let wxRec = null; /* { recorder, chunks, startAt, stream, cancelled } */

function wxRecorderSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

function wxPickAudioMime() {
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of list) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function wxVoiceToast(text) {
  let t = document.getElementById('wxVoiceTip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'wxVoiceTip';
    t.className = 'wx-voice-tip';
    document.body.appendChild(t);
  }
  t.innerHTML = text;
  t.classList.add('is-on');
  return t;
}
function wxVoiceToastHide() {
  const t = document.getElementById('wxVoiceTip');
  if (t) t.classList.remove('is-on');
}

/* 计时 + 取消态：tick 和手指移动都调它，移动时立刻变红，不等下一帧 */
function wxVoiceTipUpdate() {
  if (!wxRec) return;
  const tip = document.getElementById('wxVoiceTip');
  if (!tip) return;
  const s = (Date.now() - wxRec.startAt) / 1000;
  const b = tip.querySelector('b');
  if (b) b.textContent = s.toFixed(1) + '″';
  const label = tip.querySelector('span');
  if (label) label.textContent = wxRec.cancelled ? '松手取消' : '手指上滑，取消发送';
  tip.classList.toggle('is-cancel', !!wxRec.cancelled);
}

function wxVoiceMarkCancel(flag) {
  if (!wxRec) return;
  if (wxRec.cancelled === flag) return;
  wxRec.cancelled = flag;
  wxVoiceTipUpdate();
}

async function wxVoiceStart(el, ui) {
  if (wxRec) return;
  if (!wxRecorderSupported()) {
    toast('这个浏览器不支持录音', 'err');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    toast('没有麦克风权限，先在浏览器里允许一下', 'err');
    return;
  }

  const mime = wxPickAudioMime();
  let rec;
  try {
    rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    toast('录音起不来', 'err');
    return;
  }

  wxRec = { recorder: rec, chunks: [], startAt: Date.now(), stream, cancelled: false, el, ui };

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) wxRec && wxRec.chunks.push(e.data);
  };
  rec.onstop = () => wxVoiceFinish();
  rec.start();

  ui.dock.classList.add('is-recording');
  ui.holdBtn.classList.add('is-holding');
  ui.holdBtn.textContent = '松开 发送';
  wxVoiceToast('<b>0.0″</b><span>手指上滑，取消发送</span>');

  wxRec.tick = setInterval(() => {
    if (!wxRec) return;
    wxVoiceTipUpdate();
    if ((Date.now() - wxRec.startAt) / 1000 >= WX_VOICE_MAX / 1000) wxVoiceStop(true);
  }, 100);
}

function wxVoiceStop(send) {
  if (!wxRec) return;
  const r = wxRec;
  if (!send) r.cancelled = true;
  clearInterval(r.tick);
  r.ui.dock.classList.remove('is-recording');
  r.ui.holdBtn.classList.remove('is-holding');
  r.ui.holdBtn.textContent = '按住 说话';
  try {
    if (r.recorder.state !== 'inactive') r.recorder.stop();
  } catch (e) {
    /* 已经停了 */
  }
}

async function wxVoiceFinish() {
  const r = wxRec;
  wxRec = null;
  if (!r) return;
  wxVoiceToastHide();
  r.stream.getTracks().forEach((t) => t.stop());

  const dur = Math.min(WX_VOICE_MAX, Date.now() - r.startAt) / 1000;
  if (r.cancelled) return;
  if (dur < 0.8) {
    toast('说话时间太短');
    return;
  }

  const blob = new Blob(r.chunks, { type: r.chunks[0] ? r.chunks[0].type : 'audio/webm' });
  if (!blob.size) {
    toast('没录到声音', 'err');
    return;
  }

  const ext = /mp4|m4a/i.test(blob.type) ? 'm4a' : /ogg/i.test(blob.type) ? 'ogg' : 'webm';
  const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });

  try {
    const fd = new FormData();
    fd.append('voice', file, file.name);
    fd.append('duration', String(Math.round(dur)));
    const up = await api('/api/upload/voice', { method: 'POST', body: fd });
    const m = await api('/api/messages', { method: 'POST', body: { mediaId: up.id } });
    wxAppendMessage(r.el, m);
  } catch (e) {
    toast((e && e.message) || '语音没发出去', 'err');
  }
}

function wxBindVoiceRecorder(el, ui) {
  const { holdBtn, voiceBtn, input, emojiPanel, dock } = ui;
  if (!holdBtn || !voiceBtn) return;

  if (!wxRecorderSupported()) {
    voiceBtn.hidden = true;
    return;
  }

  /* 麦克风图标 / 键盘图标 切换 */
  voiceBtn.onclick = () => {
    const toVoice = holdBtn.hidden;
    holdBtn.hidden = !toVoice;
    input.hidden = toVoice;
    voiceBtn.innerHTML = toVoice ? WX_ICO.keyboard : WX_ICO.mic;
    voiceBtn.setAttribute('aria-label', toVoice ? '键盘' : '语音');
    if (toVoice) {
      input.blur();
      emojiPanel.hidden = true;
    } else {
      input.focus();
    }
    wxSyncSend(el);
    wxSyncDock(el);
  };

  let startY = 0;
  const onDown = (e) => {
    e.preventDefault();
    if (wxRec) return;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    wxVoiceStart(el, ui);
  };
  const onMove = (e) => {
    if (!wxRec) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    wxVoiceMarkCancel(startY - y > 60);
  };
  const onUp = (e) => {
    if (!wxRec) return;
    e.preventDefault();
    wxVoiceStop(!wxRec.cancelled);
  };

  holdBtn.addEventListener('touchstart', onDown, { passive: false });
  holdBtn.addEventListener('touchmove', onMove, { passive: true });
  holdBtn.addEventListener('touchend', onUp, { passive: false });
  holdBtn.addEventListener('touchcancel', () => {
    if (wxRec) wxVoiceStop(false);
  });
  /* 桌面用鼠标也能按住说话 */
  holdBtn.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', (e) => {
    if (!wxRec) return;
    wxVoiceMarkCancel(startY - e.clientY > 60);
  });
  window.addEventListener('mouseup', (e) => {
    if (!wxRec) return;
    e.preventDefault();
    wxVoiceStop(!wxRec.cancelled);
  });

  void dock;
}

function wxThreadHTML(items, hasMore) {
  const out = [];
  if (hasMore) out.push('<button class="wx-chatmore" type="button" data-more>查看更早的消息</button>');
  let day = '';
  (items || []).forEach((m) => {
    const label = chatDayLabel(m.createdAt);
    if (label !== day) {
      day = label;
      out.push(`<div class="wx-day"><span>${esc(label)}</span></div>`);
    }
    out.push(wxBubble(m));
  });
  return out.join('');
}

/* 底部输入坞：输入行 + 表情面板合成一块，跟着键盘走。
   以前表情面板和输入行都是 position:fixed;bottom:0，键盘一升就互相压。 */
function wxComposerHTML() {
  return `<div class="wx-dock" id="wxDock">
    <div class="wx-composer" id="wxComposer">
      <button class="wx-composer__ic" type="button" data-voice-toggle aria-label="语音">${WX_ICO.mic}</button>
      <textarea id="wxInput" class="wx-composer__input" rows="1" placeholder="说点什么…" maxlength="2000"></textarea>
      <button class="wx-hold" type="button" data-hold hidden>按住 说话</button>
      <button class="wx-composer__ic" type="button" data-emoji aria-label="表情">${WX_ICO.smile}</button>
      <button class="wx-composer__ic" type="button" data-pick aria-label="图片">${WX_ICO.plus}</button>
      <button class="wx-send" type="button" data-send hidden>发送</button>
    </div>
    <div class="wx-emoji" id="wxEmoji" hidden>${WX_EMOJI.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
  </div>`;
}

/* 把底栏高度写进 --dock-h，让内容区留出正好那么多空 */
let wxDockRO = null;
function wxSyncDock(el) {
  const dock = el.querySelector('#wxDock');
  if (!dock) return;
  const apply = () => {
    const h = Math.round(dock.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--dock-h', h + 'px');
    /* 直接给滚动容器加内边距，不依赖 :has() 的兼容性 */
    el.style.paddingBottom = `calc(${h}px + 8px)`;
    wxPinBottom(false);
  };
  apply();
  if (wxDockRO) wxDockRO.disconnect();
  if (typeof ResizeObserver === 'function') {
    wxDockRO = new ResizeObserver(apply);
    wxDockRO.observe(dock);
  }
}
function wxClearDock() {
  if (wxDockRO) {
    wxDockRO.disconnect();
    wxDockRO = null;
  }
  document.documentElement.style.removeProperty('--dock-h');
  document.documentElement.style.removeProperty('--kb');
  document.body.classList.remove('is-typing');
  const c = $('#content');
  if (c) c.style.paddingBottom = '';
  wxVoiceToastHide();
}

function wxSyncSend(el) {
  const input = el.querySelector('#wxInput');
  const send = el.querySelector('[data-send]');
  const pick = el.querySelector('[data-pick]');
  const hold = el.querySelector('[data-hold]');
  if (!input || !send || !pick) return;
  const voiceMode = !!(hold && !hold.hidden);
  const has = !!input.value.trim();
  /* 语音模式下没有输入框，发送键不出现；平时有字就把「+」换成「发送」 */
  send.hidden = voiceMode || !has;
  pick.hidden = !voiceMode && has;
}

function wxGrow(input) {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 104) + 'px';
}

function wxAppendMessage(el, m) {
  const thread = el.querySelector('#wxChat');
  if (!thread) return;
  const label = chatDayLabel(m.createdAt);
  if (thread.dataset.day !== label) {
    thread.dataset.day = label;
    thread.insertAdjacentHTML('beforeend', `<div class="wx-day"><span>${esc(label)}</span></div>`);
  }
  thread.insertAdjacentHTML('beforeend', wxBubble(m));
  wxBindZoom(thread);
  wxBindPat(thread);
  wxBindVoice(thread);
  wxPinBottom(true);
  wxChatSig += '|' + m.id + ':' + (m.readAt ? 1 : 0);
}

async function wxSendText(el) {
  const input = el.querySelector('#wxInput');
  const text = (input.value || '').trim();
  if (!text) return;
  const send = el.querySelector('[data-send]');
  send.disabled = true;
  try {
    const m = await api('/api/messages', { method: 'POST', body: { body: text } });
    input.value = '';
    wxGrow(input);
    wxSyncSend(el);
    wxAppendMessage(el, m);
  } catch (e) {
    toast(e.message || '发送失败', 'err');
  } finally {
    send.disabled = false;
  }
}

async function wxSendImages(el) {
  let files = null;
  try {
    files = await Promise.resolve(pickFiles('image/*', true));
  } catch (e) {
    return;
  }
  if (!files || !files.length) return;
  try {
    toast('正在上传…');
    const up = await uploadFiles(files);
    for (const f of up) {
      const m = await api('/api/messages', { method: 'POST', body: { mediaId: f.id } });
      wxAppendMessage(el, m);
    }
  } catch (e) {
    toast(e.message || '上传失败', 'err');
  }
}

async function wxPat(who) {
  if (who === App.me) {
    toast('不能拍自己哦');
    return;
  }
  try {
    const m = await api('/api/messages', { method: 'POST', body: { body: WX_PAT } });
    const el = $('#content');
    if (el) wxAppendMessage(el, m);
    toast('你拍了拍 ' + nameOf(who));
  } catch (e) {
    toast(e.message || '拍不动', 'err');
  }
}

function wxBindPat(root) {
  if (!root) return;
  root.querySelectorAll('[data-pat]').forEach((node) => {
    if (node.dataset.patBound) return;
    node.dataset.patBound = '1';
    let timer = null;
    node.addEventListener('dblclick', () => wxPat(node.dataset.pat));
    node.addEventListener('touchstart', () => {
      timer = setTimeout(() => wxPat(node.dataset.pat), 620);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => {
      node.addEventListener(ev, () => clearTimeout(timer), { passive: true });
    });
  });
}

/* 长按气泡：复制 / 拍一拍 / 删除 */
function wxBindBubbleMenu(root) {
  if (!root) return;
  root.querySelectorAll('.wx-msg').forEach((node) => {
    if (node.dataset.menuBound) return;
    node.dataset.menuBound = '1';
    let timer = null;
    const open = () => {
      const mid = Number(node.dataset.mid);
      const body = node.querySelector('.wx-bub');
      const raw = body ? (body.textContent || '').trim() : '';
      const mine = node.classList.contains('wx-msg--mine');
      const items = [];
      if (raw) {
        items.push({
          label: '复制',
          run() {
            const text = raw.replace(/已读$|送达$/, '').trim();
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(() => toast('已复制'), () => toast('复制失败', 'err'));
            } else {
              toast('这个浏览器不支持复制', 'err');
            }
          },
        });
      }
      items.push({ label: '拍一拍', run: () => wxPat(otherOf(App.me)) });
      if (mine) {
        items.push({
          label: '删除',
          danger: true,
          run() {
            confirmDialog('删掉这条消息？', async () => {
              try {
                await api('/api/messages/' + mid, { method: 'DELETE' });
                node.remove();
                toast('已删除');
              } catch (e) {
                toast(e.message || '删不掉', 'err');
              }
            });
          },
        });
      }
      wxSheet('', items);
    };
    const start = () => {
      timer = setTimeout(open, 480);
    };
    const cancel = () => clearTimeout(timer);
    node.addEventListener('touchstart', start, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => node.addEventListener(ev, cancel, { passive: true }));
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      open();
    });
  });
}

/* 跳到某条消息附近 */
async function wxJumpTo(el, id) {
  const thread = el.querySelector('#wxChat');
  if (!thread) return;
  const local = thread.querySelector(`[data-mid="${id}"]`);
  if (local) {
    local.scrollIntoView({ block: 'center' });
    local.classList.add('wx-msg--hl');
    setTimeout(() => local.classList.remove('wx-msg--hl'), 1400);
    return;
  }
  try {
    const d = await api(`/api/messages?before=${id + 21}&limit=40`);
    const items = d.items || [];
    wxChatPaused = true;
    thread.innerHTML =
      (items.length && items[0].id > 1 ? '<button class="wx-chatmore" type="button" data-jumpback>回到最新消息</button>' : '') +
      wxThreadHTML(items, false);
    thread.dataset.day = items.length ? chatDayLabel(items[items.length - 1].createdAt) : '';
    wxBindZoom(thread);
    wxBindPat(thread);
    wxBindBubbleMenu(thread);
    const back = thread.querySelector('[data-jumpback]');
    if (back) back.onclick = () => wxReloadThread(el);
    const target = thread.querySelector(`[data-mid="${id}"]`);
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.classList.add('wx-msg--hl');
      setTimeout(() => target.classList.remove('wx-msg--hl'), 1600);
    }
  } catch (e) {
    toast(e.message || '打不开', 'err');
  }
}

async function wxReloadThread(el) {
  const thread = el.querySelector('#wxChat');
  if (!thread) return;
  try {
    const d = await api('/api/messages?limit=40');
    const items = d.items || [];
    wxChatPaused = false;
    wxChatSig = items.map((m) => `${m.id}:${m.readAt ? 1 : 0}`).join('|');
    thread.innerHTML = wxThreadHTML(items, d.hasMore);
    thread.dataset.day = items.length ? chatDayLabel(items[items.length - 1].createdAt) : '';
    wxBindZoom(thread);
    wxBindPat(thread);
    wxBindBubbleMenu(thread);
    wxBindVoice(thread);
    wxPinBottom(false);
  } catch (e) {
    toast(e.message || '加载失败', 'err');
  }
}

/* 聊天内搜索 */
function wxSearchHTML() {
  return `<div class="wx-searchwrap" id="wxSearch" hidden>
    <div class="wx-search">
      ${WX_ICO.search}
      <input type="search" id="wxSearchIn" placeholder="搜索聊天记录" maxlength="40" autocomplete="off">
      <button class="wx-search__x" type="button" data-sclose aria-label="关闭">${WX_ICO.close}</button>
    </div>
    <div id="wxSearchOut"></div>
  </div>`;
}

function wxToggleChatSearch(el, force) {
  const wrap = el.querySelector('#wxSearch');
  const thread = el.querySelector('#wxChat');
  const composer = el.querySelector('#wxComposer');
  const emoji = el.querySelector('#wxEmoji');
  if (!wrap || !thread) return;
  const open = typeof force === 'boolean' ? force : wrap.hidden;
  wxSearchOpen = open;
  wrap.hidden = !open;
  thread.hidden = open;
  if (composer) composer.hidden = open;
  if (emoji && open) emoji.hidden = true;

  if (!open) {
    const out = el.querySelector('#wxSearchOut');
    if (out) out.innerHTML = '';
    wxScrollBottom(false);
    return;
  }

  const input = wrap.querySelector('#wxSearchIn');
  const out = wrap.querySelector('#wxSearchOut');
  input.focus();

  let seq = 0;
  const run = async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (!q) {
      out.innerHTML = '<div class="wx-empty"><div class="wx-empty__t">输入关键词找消息</div></div>';
      return;
    }
    out.innerHTML = wxLoading();
    try {
      const d = await api('/api/messages/search?q=' + encodeURIComponent(q) + '&limit=60');
      if (mine !== seq) return;
      const items = d.items || [];
      if (!items.length) {
        out.innerHTML = wxEmpty('没找到', `没有包含「${q}」的消息`, WX_ICO.search);
        return;
      }
      out.innerHTML =
        `<div class="wx-list wx-list--plain">` +
        items
          .map(
            (m) => `<button class="wx-result" type="button" data-jump="${m.id}">
              <div class="wx-result__top">
                <b>${esc(nameOf(m.who))}</b>
                <span>${esc(wxListClock(m.createdAt))}</span>
              </div>
              <div class="wx-result__txt">${wxHighlight(m.body === WX_PAT ? '[拍了拍]' : m.body || '[图片]', q)}</div>
            </button>`
          )
          .join('') +
        `</div><div class="wx-sign">共 ${items.length} 条</div>`;
      out.querySelectorAll('[data-jump]').forEach((b) => {
        b.onclick = () => {
          wxToggleChatSearch(el, false);
          wxJumpTo(el, Number(b.dataset.jump));
        };
      });
    } catch (e) {
      if (mine !== seq) return;
      out.innerHTML = wxEmpty('搜索失败', e.message || '', WX_ICO.search);
    }
  };

  let t = null;
  input.oninput = () => {
    clearTimeout(t);
    t = setTimeout(run, 240);
  };
  wrap.querySelector('[data-sclose]').onclick = () => wxToggleChatSearch(el, false);
  run();
}

function wxHighlight(text, q) {
  const raw = String(text || '');
  const safe = esc(raw);
  if (!q) return safe;
  const needle = esc(q);
  try {
    const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return safe.replace(re, (m) => `<mark>${m}</mark>`);
  } catch (e) {
    return safe;
  }
}

function wxBindChat(el, data) {
  const thread = el.querySelector('#wxChat');
  const input = el.querySelector('#wxInput');
  const emojiPanel = el.querySelector('#wxEmoji');
  const dock = el.querySelector('#wxDock');
  const holdBtn = el.querySelector('[data-hold]');
  const voiceBtn = el.querySelector('[data-voice-toggle]');
  if (!thread || !input) return;

  const items0 = data.items || [];
  thread.dataset.day = items0.length ? chatDayLabel(items0[items0.length - 1].createdAt) : '';

  wxBindZoom(thread);
  wxBindPat(thread);
  wxBindBubbleMenu(thread);
  wxBindVoice(thread);
  wxSyncDock(el);
  wxPinBottom(false);

  /* ── 键盘：用 visualViewport 把底栏顶上去，同时给内容区让出高度 ── */
  const vv = window.visualViewport;
  const onViewport = () => {
    if (!vv) return;
    const gap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', gap + 'px');
    document.body.classList.toggle('is-typing', gap > 80);
    if (gap > 80) emojiPanel.hidden = true;
    /* 视口一变（键盘弹出 / 收起）就贴回最新消息，否则最后一条会被压在底栏后面 */
    requestAnimationFrame(() => wxScrollBottom(false));
  };
  if (vv) {
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
    onViewport();
  }
  el.__wxViewportOff = () => {
    if (vv) {
      vv.removeEventListener('resize', onViewport);
      vv.removeEventListener('scroll', onViewport);
    }
    document.documentElement.style.removeProperty('--kb');
    document.body.classList.remove('is-typing');
  };

  /* 点聊天区收起键盘和表情，和微信一致 */
  thread.addEventListener('click', (e) => {
    if (e.target.closest('.wx-bub--voice') || e.target.closest('img')) return;
    if (document.activeElement === input) input.blur();
    if (!emojiPanel.hidden) {
      emojiPanel.hidden = true;
      wxSyncDock(el);
    }
  });

  input.addEventListener('input', () => {
    wxGrow(input);
    wxSyncSend(el);
  });
  input.addEventListener('focus', () => {
    emojiPanel.hidden = true;
    wxSyncDock(el);
    requestAnimationFrame(() => wxScrollBottom(false));
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 720) {
      e.preventDefault();
      wxSendText(el);
    }
  });

  el.querySelector('[data-send]').onclick = () => wxSendText(el);
  el.querySelector('[data-pick]').onclick = () => wxSendImages(el);

  /* 表情面板：开的时候先收键盘，两个不能同时占地方 */
  el.querySelector('[data-emoji]').onclick = () => {
    const willOpen = emojiPanel.hidden;
    if (willOpen && document.activeElement === input) input.blur();
    emojiPanel.hidden = !willOpen;
    wxSyncDock(el);
    if (willOpen) {
      wxPinBottom(true);
    } else {
      input.focus();
    }
  };
  emojiPanel.querySelectorAll('[data-e]').forEach((b) => {
    b.onclick = () => {
      const pos = input.selectionStart || input.value.length;
      input.value = input.value.slice(0, pos) + b.dataset.e + input.value.slice(pos);
      wxGrow(input);
      wxSyncSend(el);
      /* 选完表情不抢焦点，否则键盘弹起来把面板挤掉 */
      input.selectionStart = input.selectionEnd = pos + b.dataset.e.length;
    };
  });

  /* ── 语音：按住说话 ── */
  wxBindVoiceRecorder(el, { dock, holdBtn, voiceBtn, input, emojiPanel });

  /* 更早的消息 */
  const bindMore = () => {
    const btn = thread.querySelector('[data-more]');
    if (!btn) return;
    btn.onclick = async () => {
      const list = data.items || [];
      const oldest = list.length ? list[0].id : 0;
      btn.disabled = true;
      btn.textContent = '加载中…';
      try {
        const c = $('#content');
        const keep = c.scrollHeight;
        const d = await api(`/api/messages?before=${oldest}&limit=40`);
        const older = d.items || [];
        data.items = older.concat(list);
        btn.remove();
        if (older.length) {
          thread.insertAdjacentHTML(
            'afterbegin',
            (d.hasMore ? '<button class="wx-chatmore" type="button" data-more>查看更早的消息</button>' : '') +
              wxThreadHTML(older, false)
          );
          wxBindZoom(thread);
          wxBindPat(thread);
          wxBindBubbleMenu(thread);
          bindMore();
          c.scrollTop = c.scrollHeight - keep;
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '查看更早的消息';
        toast(e.message || '加载失败', 'err');
      }
    };
  };
  bindMore();

  /* 轮询新消息 + 已读回执 */
  clearInterval(wxChatTimer);
  wxChatTimer = setInterval(async () => {
    if (App.view !== 'messages') {
      clearInterval(wxChatTimer);
      wxChatTimer = null;
      return;
    }
    if (document.hidden || wxChatPaused || wxSearchOpen) return;
    try {
      const d = await api('/api/messages?limit=40');
      const list = d.items || [];
      const sig = list.map((m) => `${m.id}:${m.readAt ? 1 : 0}`).join('|');
      if (sig === wxChatSig) return;
      wxChatSig = sig;
      const near = wxNearBottom();
      const t = el.querySelector('#wxChat');
      t.innerHTML = wxThreadHTML(list, d.hasMore);
      t.dataset.day = list.length ? chatDayLabel(list[list.length - 1].createdAt) : '';
      wxBindZoom(t);
      wxBindPat(t);
      wxBindBubbleMenu(t);
      bindMore();
      if (near) wxPinBottom(true);
      refreshBadges();
    } catch (e) {
      /* 网络抖一下就算，下一轮再试 */
    }
  }, 8000);
}

Views.messages = async function (el) {
  if (typeof stopChatTimer === 'function') stopChatTimer();
  clearInterval(wxChatTimer);
  wxChatTimer = null;
  wxChatPaused = false;
  wxSearchOpen = false;

  const other = otherOf(App.me);
  if (App.setChrome) App.setChrome({ title: nameOf(other), sub: '', back: true, tab: 'chats', actions: 'search' });

  el.innerHTML = wxLoading();
  let data;
  try {
    data = await api('/api/messages?limit=40');
  } catch (e) {
    el.innerHTML = wxEmpty('聊天加载失败', e.message || '', WX_ICO.smile);
    return;
  }

  const items = data.items || [];
  wxChatSig = items.map((m) => `${m.id}:${m.readAt ? 1 : 0}`).join('|');

  el.innerHTML = `${wxSearchHTML()}<div class="wx-chat" id="wxChat">${wxThreadHTML(items, data.hasMore)}</div>${wxComposerHTML()}`;
  wxBindChat(el, data);
  refreshBadges();
};

/* ═══════════════════════════════════════════════════════════════
   3. 朋友圈
   ═══════════════════════════════════════════════════════════════ */

function wxCoverHTML() {
  const days = App.stats && App.stats.togetherDays;
  const sub = wxSubTitle();
  return `<div class="wx-cover">
    <div class="wx-cover__shade"></div>
    <div class="wx-cover__text">
      <h1>${esc(wxHomeTitle())}</h1>
      <p>${days ? `在一起 ${days} 天` : esc(sub || '只属于两个人的地方')}</p>
    </div>
    <div class="wx-cover__me">
      <span class="wx-cover__name">${esc(nameOf(App.me))}</span>
      <span class="wx-cover__av">${avatarHTML(App.me, 'lg')}</span>
    </div>
  </div>`;
}

function wxSocialHTML(reactions, comments) {
  const likes = (reactions || []).map((r) => esc(nameOf(r.author)));
  const cs = comments || [];
  if (!likes.length && !cs.length) return '';
  return `<div class="wx-social">
    ${likes.length ? `<div class="wx-social__likes"><span class="hr">${WX_HEART}</span><span>${likes.join('，')}</span></div>` : ''}
    ${cs
      .map(
        (c) =>
          `<div class="wx-social__cmt"><b>${esc(nameOf(c.author))}</b><span>：${esc(c.content || '')}</span></div>`
      )
      .join('')}
  </div>`;
}

function wxPostHTML(p) {
  const mine = p.author === App.me;
  const media = p.media || [];
  const n = media.length;
  const gcls = n === 1 ? 'wx-grid--1' : n === 2 ? 'wx-grid--2' : n === 4 ? 'wx-grid--4' : 'wx-grid--3';
  const grid = n
    ? `<div class="wx-grid ${gcls}" data-gallery>${media
        .map((m) => `<img src="${esc(m.url)}" data-zoom="${esc(m.url)}" alt="" loading="lazy">`)
        .join('')}</div>`
    : '';
  const chips = [wxMoodChip(p.mood), wxWeatherChip(p.weather)]
    .filter((x) => x)
    .join('');
  const reactions = p.reactions || [];
  const comments = p.comments || [];
  const liked = reactions.some((r) => r.author === App.me);

  return `<article class="wx-post" data-post="${p.id}" data-author="${esc(p.author)}">
    <div class="wx-post__av">${avatarHTML(p.author)}</div>
    <div class="wx-post__body">
      <div class="wx-post__name">${esc(nameOf(p.author))}</div>
      ${p.content ? `<div class="wx-post__text">${esc(p.content)}</div>` : ''}
      ${grid}
      ${p.location ? `<div class="wx-post__where">${WX_ICO.location}${esc(p.location)}</div>` : ''}
      ${chips ? `<div class="wx-post__chips">${chips}</div>` : ''}
      <div class="wx-post__foot">
        <span>${esc(wxFeedClock(p.createdAt))}</span>
        <div class="wx-post__acts">
          <button class="wx-act${liked ? ' on' : ''}" type="button" data-like aria-label="赞">${WX_HEART}${
    reactions.length ? `<span class="wx-act__n">${reactions.length}</span>` : ''
  }</button>
          <button class="wx-act" type="button" data-cmt aria-label="评论">${WX_CMT}${
    comments.length ? `<span class="wx-act__n">${comments.length}</span>` : ''
  }</button>
          ${mine ? `<button class="wx-act" type="button" data-del aria-label="删除">${WX_ICO.trash}</button>` : ''}
        </div>
      </div>
      <div data-social>${wxSocialHTML(reactions, comments)}</div>
      <div class="wx-cmtbar" hidden>
        <input type="text" placeholder="评论…" maxlength="300" data-cmin>
        <button type="button" data-cok>发送</button>
      </div>
    </div>
  </article>`;
}

function wxComposePost() {
  let picked = [];
  openModal({
    title: '发表动态',
    body: `<div class="wx-cm">
      <textarea id="wxPostText" class="wx-cm__ta" rows="4" maxlength="2000" placeholder="这一刻的想法…"></textarea>
      <div class="wx-cm__picks" id="wxPicks"></div>
      <div class="wx-cm__tools">
        <button type="button" class="wx-cm__btn" data-addimg>＋ 图片</button>
        <input type="text" class="wx-cm__in" id="wxPostLoc" maxlength="40" placeholder="所在位置（可不填）">
      </div>
    </div>`,
    footer: '<button class="btn btn--ghost" type="button" data-cancel>取消</button><button class="btn btn--primary" type="button" data-pub>发表</button>',
    onMount(modal, close) {
      const row = modal.querySelector('#wxPicks');
      const paint = () => {
        row.innerHTML = picked
          .map(
            (f, i) =>
              `<span class="wx-preview__i"><img src="${esc(f.url)}" alt=""><button type="button" class="wx-preview__x" data-rm="${i}">${WX_ICO.close}</button></span>`
          )
          .join('');
      };
      modal.querySelector('[data-addimg]').onclick = async () => {
        try {
          const files = await Promise.resolve(pickFiles('image/*', true));
          if (!files || !files.length) return;
          toast('正在上传…');
          const up = await uploadFiles(files);
          picked = picked.concat(up).slice(0, 9);
          paint();
        } catch (e) {
          toast(e.message || '上传失败', 'err');
        }
      };
      row.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm]');
        if (!rm) return;
        picked.splice(Number(rm.dataset.rm), 1);
        paint();
      });
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-pub]').onclick = async () => {
        const text = modal.querySelector('#wxPostText').value.trim();
        const loc = modal.querySelector('#wxPostLoc').value.trim();
        if (!text && !picked.length) {
          toast('写点什么吧');
          return;
        }
        const btn = modal.querySelector('[data-pub]');
        btn.disabled = true;
        btn.textContent = '发表中…';
        try {
          await api('/api/posts', {
            method: 'POST',
            body: { content: text, location: loc, media: picked.map((p) => p.id) },
          });
          close();
          toast('已发表', 'ok');
          if (App.view === 'moments') App.go('moments', { replace: true });
        } catch (e) {
          toast(e.message || '发表失败', 'err');
          btn.disabled = false;
          btn.textContent = '发表';
        }
      };
    },
  });
}

function wxBindFeed(el, data) {
  wxBindZoom(el);

  const findPost = (id) => (data.items || []).find((p) => p.id === id) || null;

  el.addEventListener('click', async (e) => {
    const card = e.target.closest('.wx-post');
    if (!card) return;
    const id = Number(card.dataset.post);

    if (e.target.closest('[data-like]')) {
      const btn = e.target.closest('[data-like]');
      btn.disabled = true;
      try {
        const r = await api(`/api/posts/${id}/react`, { method: 'POST', body: { kind: 'like' } });
        const reactions = r.reactions || [];
        const p = findPost(id);
        if (p) p.reactions = reactions;
        card.querySelector('[data-social]').innerHTML = wxSocialHTML(reactions, (p || {}).comments);
        btn.classList.toggle('on', reactions.some((x) => x.author === App.me));
        const num = btn.querySelector('.wx-act__n');
        if (reactions.length) {
          if (num) num.textContent = reactions.length;
          else btn.insertAdjacentHTML('beforeend', `<span class="wx-act__n">${reactions.length}</span>`);
        } else if (num) {
          num.remove();
        }
      } catch (err) {
        toast(err.message || '点不了赞', 'err');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (e.target.closest('[data-cmt]')) {
      const bar = card.querySelector('.wx-cmtbar');
      bar.hidden = !bar.hidden;
      if (!bar.hidden) bar.querySelector('[data-cmin]').focus();
      return;
    }

    if (e.target.closest('[data-cok]')) {
      const bar = card.querySelector('.wx-cmtbar');
      const input = bar.querySelector('[data-cmin]');
      const text = input.value.trim();
      if (!text) return;
      const ok = e.target.closest('[data-cok]');
      ok.disabled = true;
      try {
        const c = await api(`/api/posts/${id}/comments`, { method: 'POST', body: { content: text } });
        const p = findPost(id);
        if (p) p.comments = (p.comments || []).concat(c);
        card.querySelector('[data-social]').innerHTML = wxSocialHTML((p || {}).reactions, (p || {}).comments);
        const cn = card.querySelector('[data-cmt] .wx-act__n');
        if (cn) cn.textContent = String((p && p.comments && p.comments.length) || 0);
        input.value = '';
        bar.hidden = true;
        toast('评论成功', 'ok');
      } catch (err) {
        toast(err.message || '评论失败', 'err');
      } finally {
        ok.disabled = false;
      }
      return;
    }

    if (e.target.closest('[data-del]')) {
      confirmDialog('删除这条动态？删了就找不回来了', async () => {
        try {
          await api(`/api/posts/${id}`, { method: 'DELETE' });
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 200);
          toast('已删除');
        } catch (err) {
          toast(err.message || '删除失败', 'err');
        }
      });
    }
  });

  const more = el.querySelector('[data-more]');
  if (more) {
    more.onclick = async () => {
      more.disabled = true;
      more.textContent = '加载中…';
      try {
        const d = await api(`/api/posts?limit=15&before=${data.nextBefore || ''}`);
        const items = d.items || [];
        const feed = el.querySelector('#wxFeed');
        feed.insertAdjacentHTML('beforeend', items.map(wxPostHTML).join(''));
        data.items = (data.items || []).concat(items);
        data.nextBefore = d.nextBefore;
        data.hasMore = d.hasMore;
        if (!d.hasMore) more.parentNode.removeChild(more);
        wxBindZoom(feed);
      } catch (err) {
        toast(err.message || '加载失败', 'err');
        more.disabled = false;
        more.textContent = '查看更多';
      }
    };
  }
}

Views.moments = async function (el) {
  if (App.setChrome) App.setChrome({ title: '朋友圈', sub: '', back: true, tab: 'discover', actions: 'camera' });
  el.innerHTML = wxLoading();

  let d;
  try {
    d = await api('/api/posts?limit=15');
  } catch (e) {
    el.innerHTML = wxEmpty('朋友圈加载失败', e.message || '', WX_ICO.moments);
    return;
  }

  const items = d.items || [];
  el.innerHTML = `<div class="wx-moments">
    ${wxCoverHTML()}
    <div class="wx-feed" id="wxFeed">${items.map(wxPostHTML).join('')}</div>
    ${
      items.length
        ? ''
        : wxEmpty('还没有动态', '点右上角的相机，发第一条', WX_ICO.moments)
    }
    ${d.hasMore ? '<button class="wx-more" type="button" data-more>查看更多</button>' : ''}
    <div class="wx-sign">— 只属于我们俩 —</div>
  </div>`;

  wxBindFeed(el.querySelector('.wx-moments') || el, d);
};

/* ═══════════════════════════════════════════════════════════════
   4. 发现
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   4. 通讯录 —— 对方 + 所有「关于我们两个人」的记录
   ═══════════════════════════════════════════════════════════════ */

Views.contacts = async function (el) {
  if (App.setChrome) App.setChrome({ title: '通讯录', sub: '', back: false, tab: 'contacts', actions: '' });

  const other = otherOf(App.me);
  const stats = App.stats || {};
  const counts = stats.counts || {};
  const days = stats.togetherDays;
  const badges = App.badges || {};

  const groups = [
    {
      title: '',
      rows: [
        { go: 'location', ico: 'location', n: 4, label: '你在哪儿', val: '实时位置' },
      ],
    },
    {
      title: '我们俩的记录',
      rows: [
        { go: 'anniversaries', ico: 'cake', n: 2, label: '纪念日', val: counts.anniversaries ? `${counts.anniversaries} 个` : '' },
        { go: 'cycle', ico: 'cycle', n: 3, label: '周期记录', val: '经期与预测' },
        { go: 'intimacy', ico: 'heart', n: 1, label: '亲密记录', val: counts.intimacy ? `${counts.intimacy} 次` : '' },
        { go: 'wishes', ico: 'wish', n: 6, label: '愿望清单', val: counts.wishes ? `${counts.wishesDone || 0}/${counts.wishes}` : '' },
      ],
    },
  ];

  el.innerHTML = `<div class="p-page">
    <button class="wx-contact-head" type="button" data-go="messages">
      <div class="wx-contact-head__av">${avatarHTML(other, 'lg')}</div>
      <div style="min-width:0;flex:1">
        <div class="wx-contact-head__name">${esc(nameOf(other))}</div>
        <div class="wx-contact-head__sub">${esc(
          days ? `在一起 ${days} 天` : '还没设置开始日期'
        )}${counts.posts ? ` · ${counts.posts} 条动态` : ''}</div>
      </div>
      ${badges.messages ? `<span class="p-dot">${Number(badges.messages) > 99 ? '99+' : badges.messages}</span>` : ''}
      <span class="p-chev">${WX_ICO.chev}</span>
    </button>

    ${groups
      .map(
        (g) => `<div class="p-sec" style="margin-top:18px">
          ${g.title ? `<h2 class="p-sec__t">${esc(g.title)}</h2>` : ''}
          <div class="p-list">${g.rows
            .map(
              (r) => `<button class="p-cell" type="button" data-go="${r.go}">
                <div class="p-cell__ico ico-${r.n}">${WX_ICO[r.ico] || ''}</div>
                <div class="p-cell__body"><div class="p-cell__t">${esc(r.label)}</div></div>
                ${r.badge ? `<span class="p-dot">${Number(r.badge) > 99 ? '99+' : r.badge}</span>` : ''}
                ${r.val ? `<span class="p-cell__v">${esc(r.val)}</span>` : ''}
                <span class="p-chev">${WX_ICO.chev}</span>
              </button>`
            )
            .join('')}</div>
        </div>`
      )
      .join('')}

    <div class="p-sign">只有你们两个人能看见</div>
  </div>`;

  el.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = () => App.go(b.dataset.go);
  });
};

/* ═══════════════════════════════════════════════════════════════
   5. 发现 —— 只放「内容」：朋友圈、时光轴、心情、旅行、电影、胶囊
   ═══════════════════════════════════════════════════════════════ */

Views.discover = async function (el) {
  if (App.setChrome) App.setChrome({ title: '发现', sub: '', back: false, tab: 'discover', actions: '' });

  const stats = App.stats || {};
  const counts = stats.counts || {};
  const badges = App.badges || {};

  /* 朋友圈单独做成一张大卡（微信里也是独立入口） */
  el.innerHTML = `<div class="p-page">
    <div class="p-sec" style="margin-top:10px">
      <div class="p-list">
        <button class="p-cell p-cell--tall" type="button" data-go="moments">
          <div class="p-cell__ico ico-1" style="width:38px;height:38px;border-radius:var(--r-md)">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4.6" width="18" height="14.8" rx="2"/><circle cx="8.6" cy="10" r="1.6"/><path d="m4.4 17.6 4.9-4.3 3.2 2.6 2.7-2.2 4.4 3.9"/></svg>
          </div>
          <div class="p-cell__body">
            <div class="p-cell__t" style="font-size:17px">朋友圈</div>
            <div class="p-cell__d">${esc(
              counts.posts ? `${counts.posts} 条动态 · ${counts.photos || 0} 张照片` : '发第一条吧'
            )}</div>
          </div>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sec">
      <h2 class="p-sec__t">一起做</h2>
      <div class="p-list">
        <button class="p-cell" type="button" data-go="challenge">
          <div class="p-cell__ico ico-1">${WX_ICO.sparkle}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">今天的小事</div>
            <div class="p-cell__d" data-ch-desc>每天一件小事，两个人都点了才算</div>
          </div>
          <span class="p-cell__v" data-ch-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="quiz">
          <div class="p-cell__ico ico-1">${WX_ICO.quiz}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">默契测验</div>
            <div class="p-cell__d" data-quiz-desc>每天一题，都答完才互相看见</div>
          </div>
          <span class="p-cell__v" data-quiz-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="items">
          <div class="p-cell__ico ico-4">${WX_ICO.list}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">100 件小事</div>
            <div class="p-cell__d" data-items-desc>做完一件打个勾，对方确认才算</div>
          </div>
          <span class="p-cell__v" data-items-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="report">
          <div class="p-cell__ico ico-3">${WX_ICO.report}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">爱情报告</div>
            <div class="p-cell__d" data-report-desc>上个月的记录，做成一份报告</div>
          </div>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="events">
          <div class="p-cell__ico ico-2">${WX_ICO.calendar}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">一起的日子</div>
            <div class="p-cell__d" data-events-desc>两个人的日程放在同一张日历上</div>
          </div>
          <span class="p-cell__v" data-events-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="draw">
          <div class="p-cell__ico ico-3">${WX_ICO.dice}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">交给运气</div>
            <div class="p-cell__d">吃什么、去哪玩，抽一下就不争了</div>
          </div>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sec">
      <h2 class="p-sec__t">一起攒</h2>
      <div class="p-list">
        <button class="p-cell" type="button" data-go="fund">
          <div class="p-cell__ico ico-2">${WX_ICO.wallet}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">恋爱基金</div>
            <div class="p-cell__d" data-fund-desc>一起存的钱，一起花在哪</div>
          </div>
          <span class="p-cell__v" data-fund-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="songs">
          <div class="p-cell__ico ico-6">${WX_ICO.music}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">我们的歌</div>
            <div class="p-cell__d" data-songs-desc>听到想起对方的，就放进来</div>
          </div>
          <span class="p-cell__v" data-songs-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sec">
      <h2 class="p-sec__t">记录</h2>
      <div class="p-list">
        <button class="p-cell" type="button" data-go="timeline">
          <div class="p-cell__ico ico-5">${WX_ICO.timeline}</div>
          <div class="p-cell__body"><div class="p-cell__t">时光轴</div></div>
          <span class="p-cell__v">${counts.posts ? `${counts.posts} 条` : ''}</span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="moods">
          <div class="p-cell__ico ico-2">${WX_ICO.mood}</div>
          <div class="p-cell__body"><div class="p-cell__t">心情打卡</div></div>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="albums">
          <div class="p-cell__ico ico-7">${WX_ICO.album}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">共同相册</div>
            <div class="p-cell__d" data-albums-desc>把照片收成一本一本的</div>
          </div>
          <span class="p-cell__v" data-albums-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sec">
      <h2 class="p-sec__t">一起去过 / 想看</h2>
      <div class="p-list">
        <button class="p-cell" type="button" data-go="trips">
          <div class="p-cell__ico ico-6">${WX_ICO.trip}</div>
          <div class="p-cell__body"><div class="p-cell__t">旅行足迹</div></div>
          <span class="p-cell__v">${counts.trips ? `${counts.trips} 次` : ''}</span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="movies">
          <div class="p-cell__ico ico-7">${WX_ICO.movie}</div>
          <div class="p-cell__body"><div class="p-cell__t">电影清单</div></div>
          <span class="p-cell__v">${counts.movies ? `${counts.moviesDone || 0}/${counts.movies}` : ''}</span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sec">
      <h2 class="p-sec__t">留给以后</h2>
      <div class="p-list">
        <button class="p-cell" type="button" data-go="capsules">
          <div class="p-cell__ico ico-8">${WX_ICO.capsule}</div>
          <div class="p-cell__body"><div class="p-cell__t">时光胶囊</div></div>
          <span class="p-cell__v">${counts.capsules ? `${counts.capsules} 个` : ''}</span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sign">${esc(wxSubTitle() || '只有你们两个人能看见')}</div>
  </div>`;

  el.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = () => App.go(b.dataset.go);
  });

  /* 三张新卡的实时状态：异步补，不挡首屏 */
  (async () => {
    try {
      const q = await api('/api/quiz/badge');
      const qv = el.querySelector('[data-quiz-val]');
      const qd = el.querySelector('[data-quiz-desc]');
      if (q.both) {
        if (qv) qv.textContent = '已揭晓';
      } else if (q.theirs) {
        if (qv) qv.textContent = '等你';
        if (qd) qd.textContent = `${nameOf(otherOf(App.me))} 答完了，就等你`;
        const cell = qv && qv.closest('.p-cell');
        if (cell) cell.classList.add('is-hot');
      } else if (q.mine) {
        if (qv) qv.textContent = '等对方';
      }
    } catch (e) {
      /* 没连上就不显示，无所谓 */
    }
    try {
      const d = await api('/api/items');
      const v = el.querySelector('[data-items-val]');
      const dd = el.querySelector('[data-items-desc]');
      if (d.total) {
        if (v) v.textContent = `${d.done}/${d.total}`;
        if (dd && d.pending) dd.textContent = `${d.pending} 件等你确认`;
      } else if (dd) {
        dd.textContent = '还没开始，点进去一键加入';
      }
    } catch (e) {
      /* 同上 */
    }
    try {
      const r = await api('/api/report/latest');
      const dd = el.querySelector('[data-report-desc]');
      if (dd && r.available && !r.viewedByMe) {
        dd.textContent = `${r.payload.label} 报告已生成`;
        const cell = dd.closest('.p-cell');
        if (cell) cell.classList.add('is-hot');
      }
    } catch (e) {
      /* 同上 */
    }
    try {
      const a = await api('/api/albums');
      const v = el.querySelector('[data-albums-val]');
      const dd = el.querySelector('[data-albums-desc]');
      if (a.items && a.items.length) {
        if (v) v.textContent = `${a.items.length} 本`;
        const total = a.items.reduce((n, x) => n + (x.count || 0), 0);
        if (dd) dd.textContent = `收了 ${total} 张照片`;
      } else if (dd) {
        dd.textContent = '还没建，点进去建第一本';
      }
    } catch (e) {
      /* 同上 */
    }
    try {
      const ev = await api(`/api/events?month=${isoOf(new Date()).slice(0, 7)}`);
      const v = el.querySelector('[data-events-val]');
      const dd = el.querySelector('[data-events-desc]');
      const up = (ev.upcoming || []).filter((x) => !x.hidden);
      if (up.length) {
        if (v) v.textContent = `${up.length} 个`;
        if (dd) dd.textContent = `最近：${up[0].title}`;
      } else if (dd) {
        dd.textContent = '两个人的日程放在同一张日历上';
      }
    } catch (e) {
      /* 同上 */
    }
    try {
      const ch = await api('/api/challenge/today');
      const v = el.querySelector('[data-ch-val]');
      const dd = el.querySelector('[data-ch-desc]');
      if (ch.both) {
        if (v) v.textContent = '都做到了';
        if (dd) dd.textContent = `连续 ${ch.streak} 天`;
      } else if (ch.mine) {
        if (v) v.textContent = '等对方';
        if (dd) dd.textContent = ch.title;
      } else {
        if (v) v.textContent = ch.streak ? `第 ${ch.streak} 天` : '';
        if (dd) dd.textContent = ch.title;
      }
    } catch (e) {
      /* 同上 */
    }
    try {
      const f = await api('/api/fund');
      const v = el.querySelector('[data-fund-val]');
      const dd = el.querySelector('[data-fund-desc]');
      const g = (f.goals || []).find((x) => !x.achievedAt);
      if (g) {
        if (v) v.textContent = `¥${Math.round(g.savedCents / 100)}`;
        if (dd) dd.textContent = `${g.title} · 目标 ¥${Math.round(g.targetCents / 100)}`;
      } else if (f.items && f.items.length) {
        if (v) v.textContent = `¥${Math.round(f.stats.monthOutCents / 100)}`;
        if (dd) dd.textContent = '这个月花在恋爱上';
      } else if (dd) {
        dd.textContent = '一起存的钱，一起花在哪';
      }
    } catch (e) {
      /* 同上 */
    }
    try {
      const sg = await api('/api/songs');
      const v = el.querySelector('[data-songs-val]');
      const dd = el.querySelector('[data-songs-desc]');
      const n = (sg.items || []).length;
      if (n) {
        if (v) v.textContent = `${n} 首`;
        const pin = (sg.items || []).find((x) => x.pinned);
        if (dd) dd.textContent = pin ? `我们的歌：${pin.title}` : '听到想起对方的，就放进来';
      }
    } catch (e) {
      /* 同上 */
    }
  })();
};

/* ═══════════════════════════════════════════════════════════════
   6. 我
   ═══════════════════════════════════════════════════════════════ */

Views.me = async function (el) {
  if (App.setChrome) App.setChrome({ title: '我', sub: '', back: false, tab: 'me', actions: '' });

  const s = App.settings || {};
  const stats = App.stats || {};
  const counts = stats.counts || {};
  const days = stats.togetherDays;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const startDate = s['couple.start_date'] || '';
  const other = otherOf(App.me);
  const badges = App.badges || {};

  el.innerHTML = `<div class="p-page">
    <div class="wx-me__head">
      <div class="wx-me__av">${avatarHTML(App.me, 'lg')}</div>
      <div style="min-width:0">
        <div class="wx-me__name">${esc(nameOf(App.me))}</div>
        <div class="wx-me__id">和 ${esc(nameOf(other))} 的小窝</div>
        <div class="wx-me__meta">${
          days ? `在一起 <b>${days}</b> 天` : '还没设置开始日期'
        }</div>
      </div>
    </div>

    <div class="p-sec" style="margin-top:18px">
      <div class="p-list">
        <button class="p-cell" type="button" data-go="home">
          <div class="p-cell__ico ico-1">${WX_ICO.home}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">我们的小窝</div>
            <div class="p-cell__d">天数、周期、纪念日一览</div>
          </div>
          <span class="p-cell__v">${days ? `${days} 天` : ''}</span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="tree">
          <div class="p-cell__ico ico-4">${WX_ICO.sprout}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">我们的小树</div>
            <div class="p-cell__d" data-tree-desc>你们做的事，都会让它长大</div>
          </div>
          <span class="p-cell__v" data-tree-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sec">
      <div class="p-list">
        <button class="p-cell" type="button" data-go="badges">
          <div class="p-cell__ico ico-3">${WX_ICO.medal}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">徽章墙</div>
            <div class="p-cell__d" data-badges-desc>一起攒下来的</div>
          </div>
          <span class="p-cell__v" data-badges-val></span>
          ${badges.achievements ? `<span class="p-dot">${badges.achievements}</span>` : ''}
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
        <button class="p-cell" type="button" data-go="cool">
          <div class="p-cell__ico ico-5">${WX_ICO.snow}</div>
          <div class="p-cell__body">
            <div class="p-cell__t">冷静一下</div>
            <div class="p-cell__d" data-cool-desc>说不清的时候，先停一会儿</div>
          </div>
          <span class="p-cell__v" data-cool-val></span>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sec">
      <div class="p-list">
        <div class="p-cell p-cell--static">
          <div class="p-cell__ico ico-6">${WX_ICO.moon}</div>
          <div class="p-cell__body"><div class="p-cell__t">深色模式</div></div>
          <button class="wx-switch${dark ? ' on' : ''}" type="button" data-dark aria-label="深色模式"><i></i></button>
        </div>
        <button class="p-cell" type="button" data-go="settings">
          <div class="p-cell__ico ico-8">${WX_ICO.settings}</div>
          <div class="p-cell__body"><div class="p-cell__t">设置</div></div>
          <span class="p-chev">${WX_ICO.chev}</span>
        </button>
      </div>
    </div>

    <div class="p-sec">
      <div class="p-list">
        <button class="p-cell p-cell--danger" type="button" data-logout>
          <div class="p-cell__body" style="text-align:center">
            <div class="p-cell__t" style="justify-content:center">退出登录</div>
          </div>
        </button>
      </div>
    </div>

    <div class="p-sign">${startDate ? `从 ${esc(startDate)} 开始` : ''}</div>
  </div>`;

  el.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = () => App.go(b.dataset.go);
  });

  /* 小树 / 徽章 / 冷静卡 的实时状态：异步补，不挡首屏 */
  (async () => {
    try {
      const t = await api('/api/tree');
      const v = el.querySelector('[data-tree-val]');
      const dd = el.querySelector('[data-tree-desc]');
      if (v) v.textContent = t.stageName || '';
      if (dd) {
        dd.textContent = t.wateredToday
          ? '今天浇过水了'
          : t.next
          ? `再 ${t.toNext} 点就到「${t.next.name}」`
          : '已经长到最大了';
      }
    } catch (e) {
      /* 没连上就不显示 */
    }
    try {
      const b = await api('/api/badges');
      const v = el.querySelector('[data-badges-val]');
      const dd = el.querySelector('[data-badges-desc]');
      if (v) v.textContent = `${b.unlocked}/${b.total}`;
      if (dd) dd.textContent = b.unlocked >= b.total ? '全收齐了' : `还有 ${b.total - b.unlocked} 枚没解锁`;
    } catch (e) {
      /* 同上 */
    }
    try {
      const c = await api('/api/cool');
      const v = el.querySelector('[data-cool-val]');
      const dd = el.querySelector('[data-cool-desc]');
      if (c.current) {
        if (v) v.textContent = '冷却中';
        if (dd) dd.textContent = c.current.mine ? '你按了暂停' : `${nameOf(otherOf(App.me))} 按了暂停`;
        const cell = dd && dd.closest('.p-cell');
        if (cell) cell.classList.add('is-hot');
      } else if (c.stats && c.stats.total) {
        if (dd) dd.textContent = `用过 ${c.stats.total} 次，每次都解开了`;
      }
    } catch (e) {
      /* 同上 */
    }
  })();

  const sw = el.querySelector('[data-dark]');
  if (sw) {
    sw.onclick = () => {
      const on = !sw.classList.contains('on');
      sw.classList.toggle('on', on);
      document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
      try {
        localStorage.setItem('nest.theme', on ? 'dark' : 'light');
      } catch (e) {
        /* 隐私模式，无所谓 */
      }
      if (App.applyTheme) App.applyTheme();
    };
  }

  const out = el.querySelector('[data-logout]');
  if (out) {
    out.onclick = () => {
      confirmDialog(
        '要退出登录吗？下次进来要重新输暗号',
        async () => {
          try {
            await api('/api/auth/logout', { method: 'POST' });
          } catch (e) {
            /* 忽略 */
          }
          location.href = '/login';
        },
        '退出'
      );
    };
  }
};


/* ═══════════════════════════════════════════════════════════════
   7. 默契测验 —— 双方都答完才互看（服务端裁剪）
   ═══════════════════════════════════════════════════════════════ */

const QUIZ_CAT = {
  communication: '沟通',
  conflict: '相处',
  intimacy: '亲密',
  money: '钱',
  family: '家人',
  growth: '成长',
  fun: '好玩',
  memory: '回忆',
  future: '未来',
};

function wxQuizOptHTML(q, chosen, disabled) {
  if (!q.options) return '';
  return `<div class="p-quiz__opts">${q.options
    .map((o, i) => {
      const on = String(chosen) === String(i);
      return `<button class="p-quiz__opt${on ? ' on' : ''}" type="button" data-opt="${i}" ${
        disabled ? 'disabled' : ''
      }><span class="p-quiz__radio"></span><span>${esc(o)}</span></button>`;
    })
    .join('')}</div>`;
}

Views.quiz = async function (el) {
  if (App.setChrome) App.setChrome({ title: '默契测验', sub: '', back: true, tab: 'discover', actions: '' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let q;
  let hist = [];
  try {
    q = await api('/api/quiz/today');
    const h = await api('/api/quiz/history');
    hist = h.items || [];
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const other = otherOf(App.me);
  const cat = QUIZ_CAT[q.category] || '';

  /* 顶部状态条：三态 */
  let statusTxt = '一起答';
  let statusCls = '';
  if (q.both) {
    statusTxt = q.same ? '我们想的一样' : '原来你是这么想的';
    statusCls = 'is-done';
  } else if (q.theirAnswered) {
    statusTxt = `${nameOf(other)} 答完了，就等你`;
    statusCls = 'is-wait';
  } else if (q.mine) {
    statusTxt = '已封存 · 等对方揭晓';
    statusCls = 'is-sealed';
  }

  const mineChoice = q.mine ? q.mine.choice : null;

  el.innerHTML = `<div class="p-page">
    <div class="p-quiz__top ${statusCls}">
      <div class="p-quiz__day">今日默契题 · 第 ${q.dayNumber} 天</div>
      <div class="p-quiz__status">${esc(statusTxt)}</div>
    </div>

    <div class="p-card p-quiz__card">
      ${cat ? `<span class="p-tag p-tag--primary">${esc(cat)}</span>` : ''}
      <div class="p-quiz__q">${esc(q.question)}</div>

      ${
        q.options
          ? wxQuizOptHTML(q, mineChoice, !!q.mine && !q.both)
          : `<textarea class="p-textarea" data-ta maxlength="500" placeholder="写下来…" ${
              q.mine && !q.both ? 'disabled' : ''
            }>${esc(q.mine ? q.mine.choice : '')}</textarea>`
      }

      ${
        !q.mine
          ? `<button class="p-btn p-btn--primary p-btn--block" type="button" data-submit style="margin-top:14px">${
              q.options ? '就这个' : '提交'
            }</button>`
          : `<div class="p-quiz__mine">你选了「${esc(
              q.options ? q.options[Number(mineChoice)] : mineChoice
            )}」${q.mine.note ? ` · ${esc(q.mine.note)}` : ''}</div>`
      }
    </div>

    ${
      q.both
        ? `<div class="p-sec">
             <h2 class="p-sec__t">${esc(nameOf(other))}的答案</h2>
             <div class="p-card p-quiz__theirs${q.same ? ' is-same' : ''}">
               <div class="p-quiz__their-q">${esc(
                 q.options ? q.options[Number(q.theirs.choice)] : q.theirs.choice
               )}</div>
               ${q.theirs.note ? `<div class="p-quiz__their-n">${esc(q.theirs.note)}</div>` : ''}
               <div class="p-quiz__cmp">${
                 q.same ? '你们选了一样的' : `你选的是「${esc(q.options ? q.options[Number(mineChoice)] : mineChoice)}」`
               }</div>
             </div>
             <div class="p-quiz__act">
               <button class="p-btn p-btn--soft p-btn--block" type="button" data-discuss>聊聊这个</button>
             </div>
           </div>`
        : q.theirAnswered
        ? `<div class="p-card p-quiz__seal">
             <div class="p-quiz__seal__t">${esc(nameOf(other))} 已经答完了</div>
             <div class="p-quiz__seal__d">你答完就能互相看见</div>
             <button class="p-btn p-btn--soft p-btn--sm" type="button" data-nudge style="margin-top:12px">催一下</button>
           </div>`
        : ''
    }

    ${
      hist.length
        ? `<div class="p-sec">
             <h2 class="p-sec__t">以前的题</h2>
             <div class="p-list">${hist
               .slice(0, 12)
               .map(
                 (h) => `<div class="p-cell p-cell--static">
                   <div class="p-cell__body">
                     <div class="p-cell__t" style="font-size:15px">${esc(h.question)}</div>
                     <div class="p-cell__d">${
                       h.both
                         ? h.same
                           ? '两个人都答了 · 一样'
                           : `你「${esc(
                               h.options ? h.options[Number(h.mine.choice)] : h.mine.choice
                             )}」· TA「${esc(
                               h.options ? h.options[Number(h.theirs.choice)] : h.theirs.choice
                             )}」`
                         : h.mine
                         ? '你答了 · 对方还没'
                         : '对方答了 · 你还没'
                     }</div>
                   </div>
                   <span class="p-cell__v">${esc(h.date || '')}</span>
                 </div>`
               )
               .join('')}</div>
           </div>`
        : ''
    }
    <div class="p-sign">每天零点换一题 · 两个人都答完才能互相看见</div>
  </div>`;

  /* 选项点选 */
  let picked = mineChoice;
  el.querySelectorAll('[data-opt]').forEach((b) => {
    b.onclick = () => {
      picked = b.dataset.opt;
      el.querySelectorAll('[data-opt]').forEach((x) => x.classList.toggle('on', x === b));
    };
  });

  const submit = el.querySelector('[data-submit]');
  if (submit) {
    submit.onclick = async () => {
      const ta = el.querySelector('[data-ta]');
      const choice = q.options ? picked : ta && ta.value.trim();
      if (choice === null || choice === undefined || choice === '') return toast(q.options ? '选一个吧' : '写一句吧');
      submit.disabled = true;
      try {
        await api('/api/quiz/answer', { method: 'POST', body: { choice } });
        App.go('quiz', { replace: true });
      } catch (e) {
        submit.disabled = false;
        toast((e && e.message) || '没提交上', 'error');
      }
    };
  }

  const nudge = el.querySelector('[data-nudge]');
  if (nudge) {
    nudge.onclick = async () => {
      try {
        await api('/api/location/nudge', { method: 'POST', body: { kind: 'miss' } });
        toast('戳了一下');
      } catch (e) {
        toast((e && e.message) || '没戳到', 'error');
      }
    };
  }

  const disc = el.querySelector('[data-discuss]');
  if (disc) {
    disc.onclick = () => {
      try {
        sessionStorage.setItem('nest.chatDraft', `刚答的题：${q.question}`);
      } catch (e) {
        /* 无所谓 */
      }
      App.go('messages');
    };
  }
};


/* ═══════════════════════════════════════════════════════════════
   8. 100 件小事 —— 带凭证 + 双人确认
   ═══════════════════════════════════════════════════════════════ */

const ITEM_CAT = {
  life: '生活',
  time: '时光',
  hobby: '兴趣',
  travel: '旅行',
  food: '吃',
  us: '我们',
};

function wxRing(pct) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  const off = c * (1 - p);
  /* 弧太短的时候圆头会变成一个圆点，看着像渲染坏了 —— 只有够长才用圆头 */
  const cap = p > 0.06 ? 'round' : 'butt';
  return `<svg class="p-ring" viewBox="0 0 100 100" width="112" height="112">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--fill)" stroke-width="7"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--primary)" stroke-width="7"
      stroke-linecap="${cap}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
      transform="rotate(-90 50 50)"/>
  </svg>`;
}

Views.items = async function (el) {
  if (App.setChrome) App.setChrome({ title: '100 件小事', sub: '', back: true, tab: 'discover', actions: '' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let data;
  try {
    data = await api('/api/items');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const items = data.items || [];
  const other = otherOf(App.me);

  /* 空态：一键灌入内置清单 */
  if (!items.length) {
    el.innerHTML = `<div class="p-page">
      ${wxEmpty(
        '100 件小事',
        '内置 100 件两个人可以一起做的事，做完一件打个勾，对方确认才算数',
        WX_ICO.list
      )}
      <div style="padding:0 24px 24px">
        <button class="p-btn p-btn--primary p-btn--block" type="button" data-seed>全部加入</button>
      </div>
    </div>`;
    const seed = el.querySelector('[data-seed]');
    seed.onclick = async () => {
      seed.disabled = true;
      try {
        await api('/api/items/seed', { method: 'POST' });
        toast('加好了');
        App.go('items', { replace: true });
      } catch (e) {
        seed.disabled = false;
        toast((e && e.message) || '没加上', 'error');
      }
    };
    return;
  }

  const total = data.total || items.length;
  const done = data.done || 0;
  const pct = total ? done / total : 0;

  /* 按分类分组，未完成的排前面 */
  const groups = [];
  const byCat = new Map();
  for (const it of items) {
    if (!byCat.has(it.category)) byCat.set(it.category, []);
    byCat.get(it.category).push(it);
  }
  for (const [cat, list] of byCat) {
    groups.push({
      cat,
      list: list.slice().sort((a, b) => (a.done === b.done ? a.seq - b.seq : a.done ? 1 : -1)),
    });
  }

  el.innerHTML = `<div class="p-page">
    <div class="p-items__head">
      <div class="p-items__ring">
        ${wxRing(pct)}
        <div class="p-items__ring__n"><b>${done}</b><span>/${total}</span></div>
      </div>
      <div class="p-items__meta">
        <div class="p-items__t">已经一起做完 ${done} 件</div>
        <div class="p-items__d">${
          done >= total ? '全部做完了，可以再加几件' : `还差 ${total - done} 件`
        }</div>
        ${
          data.pending
            ? `<div class="p-items__pend">${data.pending} 件等你确认</div>`
            : ''
        }
      </div>
    </div>

    ${groups
      .map(
        (g) => `<div class="p-sec">
          <h2 class="p-sec__t">${esc(ITEM_CAT[g.cat] || g.cat)} <span class="p-sec__n">${
          g.list.filter((x) => x.done).length
        }/${g.list.length}</span></h2>
          <div class="p-list">${g.list
            .map((it) => {
              const mineDone = it.done && it.doneBy === App.me;
              const needWitness = it.done && !it.witnessBy;
              const canWitness = needWitness && it.doneBy !== App.me;
              return `<button class="p-cell p-item${it.done ? ' is-done' : ''}" type="button" data-item="${it.id}">
                <span class="p-item__box">${
                  it.done && it.witnessBy ? WX_ICO.check : ''
                }</span>
                <div class="p-cell__body">
                  <div class="p-cell__t">${esc(it.title)}</div>
                  <div class="p-cell__d">${
                    it.done && it.witnessBy
                      ? `第 ${it.seq} 件 · 两个人都确认了`
                      : canWitness
                      ? `${nameOf(it.doneBy)} 说做完了，等你确认`
                      : mineDone && needWitness
                      ? `第 ${it.seq} 件 · 等 ${esc(nameOf(other))} 确认`
                      : `第 ${it.seq} 件`
                  }</div>
                </div>
                ${canWitness ? `<span class="p-item__badge">待确认</span>` : ''}
              </button>`;
            })
            .join('')}</div>
        </div>`
      )
      .join('')}

    <div style="padding:6px 16px 28px">
      <button class="p-btn p-btn--ghost p-btn--block" type="button" data-add>加一件我们自己的</button>
    </div>
  </div>`;

  /* 点某一项 → 详情 / 标记完成 / 确认 */
  el.querySelectorAll('[data-item]').forEach((b) => {
    b.onclick = () => {
      const it = items.find((x) => String(x.id) === b.dataset.item);
      if (it) openItemSheet(it);
    };
  });

  const add = el.querySelector('[data-add]');
  if (add) {
    add.onclick = () => {
      const m = openModal({
        title: '加一件',
        body: `<div class="p-field" style="padding:0">
          <input class="p-input" data-t maxlength="60" placeholder="比如：一起去看一次海">
        </div>`,
        footer: `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-ok>加上</button>`,
        onMount: (modal, close) => {
          modal.querySelector('[data-x]').onclick = () => close();
          const ok = async () => {
            const t = modal.querySelector('[data-t]').value.trim();
            if (!t) return;
            try {
              await api('/api/items', { method: 'POST', body: { title: t } });
              close();
              App.go('items', { replace: true });
            } catch (e) {
              toast((e && e.message) || '没加上', 'error');
            }
          };
          modal.querySelector('[data-ok]').onclick = ok;
        },
      });
    };
  }
};

/* 单件详情：做完 / 确认 / 撤销 */
function openItemSheet(it) {
  const other = otherOf(App.me);
  const canWitness = it.done && !it.witnessBy && it.doneBy !== App.me;
  const mineDone = it.done && it.doneBy === App.me;

  const m = openModal({
    title: it.title,
    body: `<div style="font-size:14px;color:var(--sub);line-height:1.6;margin-bottom:14px">
        第 ${it.seq} 件 · ${esc(ITEM_CAT[it.category] || it.category)}
      </div>
      ${
        it.done && it.witnessBy
          ? `<div class="p-item__ok">${WX_ICO.check} 两个人都确认做完了</div>`
          : canWitness
          ? `<div style="font-size:14.5px;color:var(--fg-2);line-height:1.6">${esc(
              nameOf(it.doneBy)
            )} 说这件事做完了，你确认一下？</div>`
          : mineDone
          ? `<div style="font-size:14.5px;color:var(--fg-2);line-height:1.6">你标记了做完，等 ${esc(
              nameOf(other)
            )} 确认。</div>`
          : `<textarea class="p-textarea" data-note maxlength="200" placeholder="说点什么（可不填）"></textarea>`
      }
      ${
        it.note
          ? `<div style="margin-top:12px;font-size:14px;color:var(--fg-2);line-height:1.6">${esc(it.note)}</div>`
          : ''
      }`,
    footer: canWitness
      ? `<button class="p-btn p-btn--ghost" data-x>先不看</button><button class="p-btn p-btn--primary" data-w>确认做完</button>`
      : mineDone
      ? `<button class="p-btn p-btn--ghost" data-u>撤销</button><button class="p-btn p-btn--ghost" data-x>关闭</button>`
      : it.done
      ? `<button class="p-btn p-btn--ghost" data-x>关闭</button>`
      : `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-d>我们做完了</button>`,
    onMount: (modal, close) => {
      const x = modal.querySelector('[data-x]');
      if (x) x.onclick = () => close();

      const w = modal.querySelector('[data-w]');
      if (w)
        w.onclick = async () => {
          try {
            await api(`/api/items/${it.id}`, { method: 'PATCH', body: { witness: true } });
            close();
            toast('确认了');
            App.go('items', { replace: true });
          } catch (e) {
            toast((e && e.message) || '没确认上', 'error');
          }
        };

      const d = modal.querySelector('[data-d]');
      if (d)
        d.onclick = async () => {
          const note = modal.querySelector('[data-note]');
          try {
            await api(`/api/items/${it.id}`, {
              method: 'PATCH',
              body: { done: true, note: note ? note.value.trim() : '' },
            });
            close();
            toast('记下了，等对方确认');
            App.go('items', { replace: true });
          } catch (e) {
            toast((e && e.message) || '没记上', 'error');
          }
        };

      const u = modal.querySelector('[data-u]');
      if (u)
        u.onclick = async () => {
          try {
            await api(`/api/items/${it.id}`, { method: 'PATCH', body: { undo: true } });
            close();
            App.go('items', { replace: true });
          } catch (e) {
            toast((e && e.message) || '没撤销', 'error');
          }
        };
    },
  });
}


/* ═══════════════════════════════════════════════════════════════
   9. 爱情报告 —— 上个月 / 去年的快照
   ═══════════════════════════════════════════════════════════════ */

const MOOD_CN = {
  happy: '开心',
  love: '心动',
  calm: '平静',
  excited: '兴奋',
  shy: '害羞',
  meh: '一般',
  tired: '累了',
  sad: '难过',
  angry: '生气',
  sick: '不舒服',
};

function wxMoodLabel(k) {
  if (typeof MOODS !== 'undefined' && MOODS[k]) return MOODS[k].label;
  return MOOD_CN[k] || k;
}

Views.report = async function (el, opts) {
  if (App.setChrome) App.setChrome({ title: '爱情报告', sub: '', back: true, tab: 'discover', actions: '' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  const period = (opts && opts.period) || '';
  let r;
  try {
    r = period ? await api(`/api/report/${period}`) : await api('/api/report/latest');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('还没生成', (e && e.message) || '下个月再来')}</div>`;
    return;
  }

  if (r.available === false) {
    el.innerHTML = `<div class="p-page">
      ${wxEmpty('还没有报告', `${r.period} 那会儿没什么记录，等这个月过完再看`, WX_ICO.report)}
    </div>`;
    return;
  }

  const p = r.payload;
  const other = otherOf(App.me);
  const postMax = Math.max(p.postsBy.a || 0, p.postsBy.b || 0, 1);
  const moodTotal = Object.values(p.moods || {}).reduce((s, n) => s + n, 0);
  const moodTop = Object.entries(p.moods || {}).sort((x, y) => y[1] - x[1]).slice(0, 6);

  /* 标记已读 */
  api(`/api/report/${r.period}/view`, { method: 'POST' }).catch(() => {});

  const moodBars = moodTop
    .map(
      ([k, n]) => `<div class="p-report__mood">
        <span class="p-report__mood__k">${esc(wxMoodLabel(k))}</span>
        <span class="p-report__mood__bar"><i style="width:${((n / (moodTotal || 1)) * 100).toFixed(1)}%"></i></span>
        <span class="p-report__mood__n">${n}</span>
      </div>`
    )
    .join('');

  el.innerHTML = `<div class="p-page p-report">
    <div class="p-report__cover">
      <div class="p-report__k">${esc(p.label)}</div>
      <div class="p-report__big">${p.togetherDays ? `第 ${p.togetherDays} 天` : '我们'}</div>
      <div class="p-report__avs">${avatarHTML('a', 'lg')}${avatarHTML('b', 'lg')}</div>
    </div>

    <div class="p-report__sec">
      <div class="p-report__n">${p.posts}</div>
      <div class="p-report__l">条动态${p.photos ? ` · ${p.photos} 张照片` : ''}</div>
      <div class="p-report__bars">
        <div class="p-report__bar"><span>${esc(nameA())}</span><i style="width:${((p.postsBy.a || 0) / postMax) * 100}%"></i><b>${p.postsBy.a || 0}</b></div>
        <div class="p-report__bar is-b"><span>${esc(nameB())}</span><i style="width:${((p.postsBy.b || 0) / postMax) * 100}%"></i><b>${p.postsBy.b || 0}</b></div>
      </div>
    </div>

    ${
      moodTop.length
        ? `<div class="p-report__sec">
             <div class="p-report__h">这个月的心情</div>
             ${moodBars}
           </div>`
        : ''
    }

    ${
      p.places && p.places.length
        ? `<div class="p-report__sec">
             <div class="p-report__h">去过的地方</div>
             ${p.places.map((x) => `<div class="p-report__place">${esc(x.name)}<b>${x.n}</b></div>`).join('')}
           </div>`
        : ''
    }

    ${
      p.wishesDone && p.wishesDone.length
        ? `<div class="p-report__sec">
             <div class="p-report__h">完成的愿望</div>
             ${p.wishesDone.slice(0, 5).map((w) => `<div class="p-report__line">${esc(w.title)}</div>`).join('')}
           </div>`
        : ''
    }

    ${
      p.moviesDone && p.moviesDone.length
        ? `<div class="p-report__sec">
             <div class="p-report__h">看过的电影</div>
             ${p.moviesDone.slice(0, 5).map((m) => `<div class="p-report__line">${esc(m.title)}</div>`).join('')}
           </div>`
        : ''
    }

    ${
      p.quote
        ? `<div class="p-report__quote">
             <div class="p-report__quote__q">「${esc(p.quote.question)}」</div>
             ${p.quote.answerA ? `<div class="p-report__quote__a">${esc(nameA())}：${esc(p.quote.answerA)}</div>` : ''}
             ${p.quote.answerB ? `<div class="p-report__quote__a">${esc(nameB())}：${esc(p.quote.answerB)}</div>` : ''}
           </div>`
        : ''
    }

    <div class="p-report__end">
      <div class="p-report__end__t">下个月也一起</div>
      <div class="p-report__end__d">${r.viewedBoth ? '我们都看过了' : '对方还没看'}</div>
    </div>
    <div class="p-sign">数据截至 ${new Date(p.generatedAt).toLocaleDateString('zh-CN')}</div>
  </div>`;
};


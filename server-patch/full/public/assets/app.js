'use strict';

/* ═══════════════════════════════════════════════════════════════
   app.js · 微信外壳：顶栏 / 底栏 / 路由 / 启动
   路由用 pushState + popstate，手机返回键可以退回上一页

   信息架构（每个功能只有一个入口）：
     聊天    会话 · 今日一问 · 公告栏
     通讯录  对方名片 · 你在哪儿 · 周期记录 · 亲密记录 · 纪念日 · 愿望清单
     发现    朋友圈 · 时光轴 · 心情打卡 · 旅行足迹 · 电影清单 · 时光胶囊
     我      我的名片 · 我们的小窝 · 设置
   ═══════════════════════════════════════════════════════════════ */

const WX_SVG = {
  chats:
    '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 5.4h16a1.7 1.7 0 0 1 1.7 1.7v8.2a1.7 1.7 0 0 1-1.7 1.7h-7L8.2 20.6v-3.6H4A1.7 1.7 0 0 1 2.3 15.3V7.1A1.7 1.7 0 0 1 4 5.4Z"/></svg>',
  contacts:
    '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="5" y="3.2" width="15.2" height="17.6" rx="2.2"/><path d="M9 8.4h7.6M9 12h7.6M9 15.6h4.6"/><path d="M2.6 7.4h2.4M2.6 12h2.4M2.6 16.6h2.4"/></svg>',
  discover:
    '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="12" cy="12" r="8.8"/><path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4z" fill="currentColor" stroke="none"/></svg>',
  me:
    '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="3.8"/><path d="M4.4 20.4c.8-4.1 3.9-6.2 7.6-6.2s6.8 2.1 7.6 6.2"/></svg>',
  camera:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.6 8.4h3.1l1.5-2.2h5.6l1.5 2.2h3.1a1.7 1.7 0 0 1 1.7 1.7v7.1a1.7 1.7 0 0 1-1.7 1.7H3.6a1.7 1.7 0 0 1-1.7-1.7V10.1a1.7 1.7 0 0 1 1.7-1.7Z"/><circle cx="11" cy="13.6" r="3.1"/></svg>',
  chat:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5.4h16a1.7 1.7 0 0 1 1.7 1.7v8.2a1.7 1.7 0 0 1-1.7 1.7h-7L8.2 20.6v-3.6H4A1.7 1.7 0 0 1 2.3 15.3V7.1A1.7 1.7 0 0 1 4 5.4Z"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.4"/><path d="m15.9 15.9 4.1 4.1"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5.6v12.8M5.6 12h12.8"/></svg>',
  image:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.4" cy="9.8" r="1.5"/><path d="m4.6 17.4 4.7-4.2 3.1 2.5 2.6-2.1 4.4 3.8"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.4" y="5.2" width="17.2" height="15.2" rx="2.2"/><path d="M3.4 9.8h17.2M8 3.4v3.4M16 3.4v3.4"/></svg>',
};

const WX_TABS = [
  { key: 'chats', label: '聊天', icon: 'chats' },
  { key: 'contacts', label: '通讯录', icon: 'contacts' },
  { key: 'discover', label: '发现', icon: 'discover' },
  { key: 'me', label: '我', icon: 'me' },
];

/* 每个视图的顶栏形态：tabbar=false 表示这次不显示底栏（二级页面） */
const WX_VIEWS = {
  chats: { title: '聊天', tab: 'chats', tabbar: true, back: false, actions: 'chat' },
  contacts: { title: '通讯录', tab: 'contacts', tabbar: true, back: false, actions: '' },
  discover: { title: '发现', tab: 'discover', tabbar: true, back: false, actions: '' },
  me: { title: '我', tab: 'me', tabbar: true, back: false, actions: '' },

  moments: { title: '朋友圈', tab: 'discover', tabbar: false, back: true, actions: 'camera' },
  messages: { title: '', tab: 'chats', tabbar: false, back: true, actions: 'chat' },
  daily: { title: '今日一问', tab: 'chats', tabbar: false, back: true },

  home: { title: '我们的小窝', tab: 'me', back: true, tabbar: false },
  timeline: { title: '时光轴', tab: 'discover', back: true, tabbar: false },
  cycle: { title: '周期记录', tab: 'contacts', back: true, tabbar: false },
  intimacy: { title: '亲密记录', tab: 'contacts', back: true, tabbar: false },
  anniversaries: { title: '纪念日', tab: 'contacts', back: true, tabbar: false },
  wishes: { title: '愿望清单', tab: 'contacts', back: true, tabbar: false },
  moods: { title: '心情打卡', tab: 'discover', back: true, tabbar: false },
  trips: { title: '旅行足迹', tab: 'discover', back: true, tabbar: false },
  movies: { title: '电影清单', tab: 'discover', back: true, tabbar: false },
  capsules: { title: '时光胶囊', tab: 'discover', back: true, tabbar: false },
  location: { title: '你在哪儿', tab: 'contacts', back: true, tabbar: false },
  announcements: { title: '公告栏', tab: 'chats', back: true, tabbar: false },
  settings: { title: '设置', tab: 'me', back: true, tabbar: false },

  quiz: { title: '默契测验', tab: 'discover', back: true, tabbar: false },
  items: { title: '100 件小事', tab: 'discover', back: true, tabbar: false },
  report: { title: '爱情报告', tab: 'discover', back: true, tabbar: false },
  albums: { title: '共同相册', tab: 'discover', back: true, tabbar: false, actions: 'album' },
  album: { title: '相册', tab: 'discover', back: true, tabbar: false, actions: 'album' },
  events: { title: '一起的日子', tab: 'discover', back: true, tabbar: false, actions: 'event' },
  draw: { title: '交给运气', tab: 'discover', back: true, tabbar: false },
  cool: { title: '冷静一下', tab: 'me', back: true, tabbar: false },
  tree: { title: '我们的小树', tab: 'me', back: true, tabbar: false },
  badges: { title: '徽章墙', tab: 'me', back: true, tabbar: false },
  challenge: { title: '今天的小事', tab: 'discover', back: true, tabbar: false },
  fund: { title: '恋爱基金', tab: 'discover', back: true, tabbar: false, actions: 'fund' },
  songs: { title: '我们的歌', tab: 'discover', back: true, tabbar: false, actions: 'song' },
};

/* ───────────── 顶栏 / 底栏 ───────────── */

function paintTabs(meta) {
  const nav = $('#tabbar');
  const app = $('#app');
  if (!nav) return;

  const show = meta.tabbar !== false;
  if (app) app.classList.toggle('wx-app--full', !show);

  if (!nav.dataset.built) {
    nav.innerHTML = WX_TABS.map(
      (t) => `<button class="wx-tab" type="button" data-tab="${t.key}">
        ${WX_SVG[t.icon] || ''}
        <span class="wx-tab__label">${t.label}</span>
        <i class="wx-tab__dot" data-dot="${t.key}" hidden></i>
      </button>`
    ).join('');    nav.querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => App.go(b.dataset.tab);
    });
    nav.dataset.built = '1';
  }

  const active = meta.tab || (meta.tabbar === false ? App.lastTab : '');
  if (active) App.lastTab = active;
  nav.querySelectorAll('.wx-tab').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === active);
  });
}

function paintTop(meta) {
  const back = $('#wxBack');
  const title = $('#pageTitle');
  const sub = $('#pageSub');
  const actions = $('#wxActions');
  if (!title) return;

  if (back) {
    back.hidden = !meta.back;
    back.onclick = () => App.back();
  }
  title.textContent = meta.title || '';
  title.classList.toggle('wx-top__title--center', !!meta.center);
  if (sub) {
    sub.textContent = meta.sub || '';
    sub.hidden = !meta.sub;
  }
  if (actions) {
    actions.innerHTML = '';
    const mk = (html, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wx-icbtn';
      b.setAttribute('aria-label', label);
      b.innerHTML = html;
      b.onclick = fn;
      actions.appendChild(b);
      return b;
    };
    if (meta.actions === 'camera') {
      mk(WX_SVG.camera, '发表', () => {
        if (typeof wxComposePost === 'function') wxComposePost();
      });
    } else if (meta.actions === 'album') {
      mk(WX_SVG.image, '加照片', () => {
        if (typeof wxAlbumAdd === 'function') wxAlbumAdd();
      });
    } else if (meta.actions === 'event') {
      mk(WX_SVG.calendar, '新建', () => {
        if (typeof wxEventNew === 'function') wxEventNew();
      });
    } else if (meta.actions === 'chat') {
      mk(WX_SVG.chat, '聊天', () => App.go('messages'));
    } else if (meta.actions === 'fund') {
      mk(WX_SVG.plus, '记一笔', () => {
        if (typeof wxFundAdd === 'function') wxFundAdd(App._fundGoals || []);
      });
    } else if (meta.actions === 'song') {
      mk(WX_SVG.plus, '加一首', () => {
        if (typeof wxSongAdd === 'function') wxSongAdd();
      });
    } else if (meta.actions === 'search') {
      mk(WX_SVG.search, '搜索', () => {
        const el = $('#content');
        if (el && typeof wxToggleChatSearch === 'function') wxToggleChatSearch(el);
      });
    }
  }

  const base = wxHomeTitle();
  document.title = meta.title ? `${meta.title} · ${base}` : base;
}

/* 底栏角标：聊天页显示未读消息 + 未读公告，我页显示新解锁的徽章 */
function paintDots() {
  const badges = App.badges || {};
  const set = (key, n) => {
    const dot = document.querySelector(`[data-dot="${key}"]`);
    if (!dot) return;
    const v = Number(n) || 0;
    dot.hidden = !v;
    dot.textContent = v > 99 ? '99+' : String(v);
  };
  /* 公告栏挂在「聊天」页里，所以两个未读数合在聊天 tab 上 */
  set('chats', (Number(badges.messages) || 0) + (Number(badges.announcements) || 0));
  set('discover', 0);
  set('me', badges.achievements);
}

/* ───────────── 路由 ───────────── */

App.go = function (view, opts) {
  opts = opts || {};
  if (!Views[view]) view = 'chats';

  const base = WX_VIEWS[view] || { title: view, back: true, tabbar: false };
  const meta = Object.assign({ center: true }, base);
  App.view = view;
  App.meta = meta;
  App.params = opts.params || {};

  paintTop(meta);
  paintTabs(meta);

  const content = $('#content');
  if (content) {
    /* 上一页留下的定时器 / 输入坞高度 / 键盘监听都要清掉 */
    if (typeof content.__wxViewportOff === 'function') {
      try { content.__wxViewportOff(); } catch (e) { /* 忽略 */ }
      content.__wxViewportOff = null;
    }
    if (typeof wxClearDock === 'function') wxClearDock();
    if (typeof wxVoiceStop === 'function') wxVoiceStop(false);
    content.scrollTop = 0;
    content.innerHTML = '';
    if (typeof wxClearTimers === 'function') wxClearTimers();
    try {
      const ret = Views[view](content, opts);
      if (ret && typeof ret.catch === 'function') {
        ret.catch((e) => {
          console.error(e);
          content.innerHTML = `<div class="p-empty"><div class="p-empty__t">出了点问题</div><div class="p-empty__d">${esc(
            (e && e.message) || ''
          )}</div></div>`;
        });
      }
    } catch (e) {
      console.error(e);
      content.innerHTML = `<div class="p-empty"><div class="p-empty__t">页面打不开</div><div class="p-empty__d">${esc(
        (e && e.message) || ''
      )}</div></div>`;
    }
  }

  if (!opts.silent) {
    const hash = '#' + view + (opts.params && opts.params.id ? '/' + opts.params.id : '');
    if (location.hash !== hash) {
      if (opts.replace) history.replaceState({ view, params: App.params }, '', hash);
      else history.pushState({ view, params: App.params }, '', hash);
    }
  }
  paintDots();
};

App.setChrome = function (opts) {
  const meta = Object.assign({}, App.meta || {}, opts || {});
  App.meta = meta;
  paintTop(meta);
  paintTabs(meta);
};

App.back = function () {
  if (history.state && history.state.view && history.state.view !== App.view) {
    history.back();
    return;
  }
  const fallback = (App.meta && App.meta.tab) || App.lastTab || 'chats';
  App.go(fallback, { replace: true });
};

App.chrome = function () {
  paintTabs(App.meta || WX_VIEWS.chats);
  paintTop(App.meta || WX_VIEWS.chats);
};

App.applyTheme = function () {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#121110' : '#f6f4f2');
};

/* ───────────── 角标 / 公告 ───────────── */

async function refreshBadges() {
  try {
    const d = await api('/api/bootstrap');
    App.badges = d.badges || {};
    App.stats = d.stats || App.stats;
    App.daily = d.question || App.daily;
    if (d.settings) App.settings = d.settings;
    paintDots();
    const t = App.meta && App.meta.title;
    document.title = t ? `${t} · ${wxHomeTitle()}` : wxHomeTitle();
  } catch (e) {
    /* 掉线了就别刷了 */
  }
}

async function checkAnnouncements() {
  try {
    const d = await api('/api/announcements');
    const unread = (d.items || []).filter((a) => !a.readAt);
    if (!unread.length) return;
    let seen = 0;
    try {
      seen = Number(sessionStorage.getItem('nest.anShown') || 0);
    } catch (e) {
      seen = 0;
    }
    const fresh = unread.filter((a) => Number(a.id) > seen);
    if (!fresh.length) return;
    try {
      sessionStorage.setItem('nest.anShown', String(Math.max.apply(null, fresh.map((a) => Number(a.id)))));
    } catch (e) {
      /* 忽略 */
    }
    if (typeof showAnnouncementPopups === 'function') showAnnouncementPopups(fresh);
  } catch (e) {
    /* 忽略 */
  }
}

/* ───────────── 兼容老 views.js 的调用 ───────────── */

function closeSidebar() {}
function openSidebar() {}
function renderMeToggle() {}
function openMeCard() {
  App.go('me');
}

/* ───────────── 启动 ───────────── */

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;

  try {
    loadPrefs();
  } catch (e) {
    /* 忽略 */
  }
  App.applyTheme();

  let data;
  try {
    data = await api('/api/bootstrap');
  } catch (e) {
    const b = $('#boot');
    if (b) b.remove();
    const c = $('#content');
    const app = $('#app');
    if (app) app.hidden = false;
    if (c) {
      c.innerHTML = `<div class="p-empty"><div class="p-empty__t">加载失败</div><div class="p-empty__d">${esc(
        (e && e.message) || '网络不太好'
      )}</div></div>`;
    }
    return;
  }

  App.settings = data.settings || {};
  App.stats = data.stats || {};
  App.today = data.today || '';
  App.daily = data.question || null;
  App.badges = data.badges || {};
  setMe(data.who || 'a');

  const b = $('#boot');
  if (b) b.remove();
  const app = $('#app');
  if (app) app.hidden = false;

  App.meta = WX_VIEWS.chats;
  App.chrome();

  const startRaw = (location.hash || '').replace(/^#/, '') || 'chats';
  const [startView, startId] = startRaw.split('/');
  App.go(startView, { silent: true, replace: true, params: startId ? { id: startId } : null });

  refreshBadges();
  setTimeout(checkAnnouncements, 900);

  setInterval(() => {
    if (!document.hidden) refreshBadges();
  }, 45000);

  setInterval(() => {
    const t = isoOf(new Date());
    if (t !== App.today) {
      App.today = t;
      App.go(App.view, { replace: true });
      refreshBadges();
    }
  }, 60000);

  window.addEventListener('popstate', () => {
    const raw = (location.hash || '').replace(/^#/, '') || 'chats';
    const [v, id] = raw.split('/');
    App.go(v, { silent: true, params: id ? { id } : null });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

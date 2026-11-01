'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const D = require('./dates');
const { all, get, run, tx, allSettings, getSetting, setSetting, DATA_DIR, UPLOAD_DIR } = require('./db');
const auth = require('./auth');
const cycle = require('./cycle');
const geo = require('./geo');
const tiles = require('./tiles');
const storage = require('./storage');
const QB = require('./quizbank');
const TPL = require('./itemtpl');
const { BADGES } = require('./badges');
const { HttpError, sendJSON, readJSON, readMultipart } = require('./http');
const { notifyCounterpart } = require('./events');

const AUTHOR_KEYS = new Set(['a', 'b']);

function authorOf(v) {
  const s = String(v || 'a').toLowerCase();
  return AUTHOR_KEYS.has(s) ? s : 'a';
}

/* 谁在操作：以登录会话里认领的身份为准。
   前端不再能靠改 body.author 冒充对方——以前可以，两个人在同一台设备上切换时尤其容易写错。
   没有会话（理论上到不了业务路由）时才回落到 body.author。 */
function whoOf(ctx, body) {
  if (ctx && ctx.session && ctx.session.who) return auth.normalizeWho(ctx.session.who);
  return authorOf(body && body.author);
}

function str(v, max = 2000) {
  if (v === undefined || v === null) return '';
  return String(v).slice(0, max);
}

function optStr(v, max = 500) {
  const s = str(v, max).trim();
  return s === '' ? null : s;
}

function num(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
}

/* 五星评分：接受 0~5 的小数（如 4.5），超出范围夹住，非法值归 null */
function scoreOf(v, max = 5) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(max, Math.max(0, Math.round(n * 2) / 2));
  return clamped === 0 ? null : clamped;
}

function isoOr(v, fallback = null) {
  const s = str(v, 10);
  return D.isISO(s) ? s : fallback;
}

function requireDate(v, label = '日期') {
  const s = isoOr(v);
  if (!s) throw new HttpError(400, `${label}格式不正确`);
  return s;
}

function idParam(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, '无效的编号');
  return n;
}

/* ─────────────────────────── 媒体 ─────────────────────────── */

function mediaRows(ownerType, ownerIds) {
  if (!ownerIds.length) return new Map();
  const marks = ownerIds.map(() => '?').join(',');
  const rows = all(
    `SELECT * FROM media WHERE owner_type = ? AND owner_id IN (${marks}) ORDER BY id ASC`,
    ownerType, ...ownerIds
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.owner_id)) map.set(r.owner_id, []);
    map.get(r.owner_id).push({ id: r.id, url: `/media/${r.filename}`, mime: r.mime, w: r.width, h: r.height });
  }
  return map;
}

function attachUploads(mediaIds, ownerType, ownerId) {
  const ids = Array.isArray(mediaIds)
    ? mediaIds.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0).slice(0, 12)
    : [];
  if (!ids.length) return;
  const marks = ids.map(() => '?').join(',');
  run(
    `UPDATE media SET owner_type = ?, owner_id = ? WHERE id IN (${marks}) AND owner_type = 'pending'`,
    ownerType, ownerId, ...ids
  );
}

function deleteMediaOf(ownerType, ownerId) {
  const rows = all('SELECT * FROM media WHERE owner_type = ? AND owner_id = ?', ownerType, ownerId);
  for (const r of rows) storage.removeImage(r.filename);
  run('DELETE FROM media WHERE owner_type = ? AND owner_id = ?', ownerType, ownerId);
}

/* 让 owner 的媒体集合与 mediaIds 完全一致：新上传的挂上、移除的删掉 */
function syncUploads(mediaIds, ownerType, ownerId) {
  const ids = Array.isArray(mediaIds)
    ? mediaIds.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0).slice(0, 12)
    : [];
  const keep = new Set(ids);
  const current = all('SELECT * FROM media WHERE owner_type = ? AND owner_id = ?', ownerType, ownerId);
  for (const r of current) {
    if (!keep.has(r.id)) {
      storage.removeImage(r.filename);
      run('DELETE FROM media WHERE id = ?', r.id);
    }
  }
  attachUploads(ids, ownerType, ownerId);
}

/* ─────────────────────────── 动态 ─────────────────────────── */

function serializePost(row, mediaMap, reactions, comments) {
  return {
    id: row.id,
    author: row.author,
    content: row.content,
    mood: row.mood,
    weather: row.weather,
    location: row.location,
    pinned: !!row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media: mediaMap.get(row.id) || [],
    reactions: reactions.get(row.id) || [],
    comments: comments.get(row.id) || [],
  };
}

function listPosts(query) {
  const limit = Math.min(Math.max(num(query.limit, 20), 1), 50);
  const before = num(query.before, null);
  const search = str(query.q, 80).trim();
  const author = query.author && AUTHOR_KEYS.has(String(query.author)) ? String(query.author) : null;
  const month = /^\d{4}-\d{2}$/.test(String(query.month || '')) ? String(query.month) : null;

  const where = [];
  const params = [];
  if (before) { where.push('created_at < ?'); params.push(before); }
  if (author) { where.push('author = ?'); params.push(author); }
  if (search) { where.push('(content LIKE ? OR location LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (month) {
    const start = new Date(`${month}-01T00:00:00`).getTime();
    const [y, m] = month.split('-').map(Number);
    const next = new Date(y, m, 1).getTime();
    where.push('created_at >= ? AND created_at < ?');
    params.push(start, next);
  }
  const sql = `SELECT * FROM posts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
  const rows = all(sql, ...params, limit);

  const ids = rows.map((r) => r.id);
  const mediaMap = mediaRows('post', ids);
  const reactions = new Map();
  const comments = new Map();
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    for (const r of all(`SELECT * FROM post_reactions WHERE post_id IN (${marks})`, ...ids)) {
      if (!reactions.has(r.post_id)) reactions.set(r.post_id, []);
      reactions.get(r.post_id).push({ author: r.author, kind: r.kind });
    }
    for (const c of all(`SELECT * FROM post_comments WHERE post_id IN (${marks}) ORDER BY id ASC`, ...ids)) {
      if (!comments.has(c.post_id)) comments.set(c.post_id, []);
      comments.get(c.post_id).push({ id: c.id, author: c.author, content: c.content, createdAt: c.created_at });
    }
  }

  return {
    items: rows.map((r) => serializePost(r, mediaMap, reactions, comments)),
    nextBefore: rows.length === limit ? rows[rows.length - 1].created_at : null,
    hasMore: rows.length === limit,
  };
}

/* ─────────────────────────── 纪念日 ─────────────────────────── */

function nextOccurrence(dateISO, repeatYearly) {
  const todayStr = D.today();
  if (!repeatYearly) return dateISO >= todayStr ? dateISO : null;
  const base = D.parseISO(dateISO);
  if (!base) return null;
  const now = D.parseISO(todayStr);
  let candidate = new Date(now.getFullYear(), base.getMonth(), base.getDate());
  if (D.toISO(base) === dateISO && D.diffDays(dateISO, todayStr) === 0) candidate = now;
  if (D.toISO(candidate) < todayStr) candidate = new Date(now.getFullYear() + 1, base.getMonth(), base.getDate());
  return D.toISO(candidate);
}

function serializeAnniversary(row) {
  const todayStr = D.today();
  const next = nextOccurrence(row.date, !!row.repeat_yearly);
  const daysTo = next ? D.diffDays(next, todayStr) : null;
  const passed = D.diffDays(todayStr, row.date);
  /* 「第几年」要跟即将到来的那一次对应，否则会出现「2027-05-20 · 第 2 年」这种错位 */
  let years = null;
  if (row.repeat_yearly && passed >= 0 && next) {
    const base = D.parseISO(row.date);
    const target = D.parseISO(next);
    if (base && target) {
      const n = target.getFullYear() - base.getFullYear();
      years = n > 0 ? n : null;
    }
  }
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    repeatYearly: !!row.repeat_yearly,
    icon: row.icon || '💗',
    note: row.note,
    next,
    daysTo,
    passedDays: passed,
    years,
  };
}

/* ─────────────────────────── 心情 ─────────────────────────── */

const MOODS = new Set(['happy', 'love', 'calm', 'tired', 'sad', 'angry', 'sick', 'excited', 'shy', 'meh']);

/* ─────────────────────────── 每日一问 ─────────────────────────── */

const QUESTION_POOL = [
  '今天有哪一刻想起我了？',
  '如果现在能立刻见到我，你想做什么？',
  '最近我做的哪件小事让你觉得被爱着？',
  '你手机里最喜欢的一张我们的照片是哪张？为什么？',
  '这周有什么想让我陪你一起做的事？',
  '你最近的一个小烦恼是什么？说出来我分担一半。',
  '描述一下你理想中的周末，我在里面做什么？',
  '有什么话你一直想说但忘了说？',
  '今天最想被我用什么方式抱一下？',
  '我们在一起之后，你改掉的一个小习惯是什么？',
  '如果给我们的关系打一个标签，你会写什么？',
  '最近有没有偷偷为我准备什么？',
  '你觉得我们最像的一对影视情侣是谁？',
  '下次约会，你想去哪里？',
  '有什么事情让你最近觉得压力大？',
  '我做什么会让你瞬间安心？',
  '你最喜欢我身上的哪一点？',
  '如果明天放假，我们说走就走，去哪？',
  '最近一次为我心动是什么时候？',
  '你想在几年后回忆起现在的什么画面？',
];

function questionFor(dateISO) {
  const seed = D.dayOfYear(dateISO) + Number(dateISO.slice(0, 4));
  return QUESTION_POOL[seed % QUESTION_POOL.length];
}

/* 一条悄悄话：带图的话把图片信息一起给前端 */
function serializeMessage(row) {
  let media = null;
  if (row.media_id) {
    const m = get('SELECT * FROM media WHERE id = ?', row.media_id);
    if (m) {
      media = {
        id: m.id,
        url: `/media/${m.filename}`,
        mime: m.mime,
        width: m.width,
        height: m.height,
        duration: m.duration === null || m.duration === undefined ? null : Number(m.duration),
      };
    }
  }
  return {
    id: row.id,
    who: row.who,
    body: row.body,
    media,
    replyTo: row.reply_to || null,
    createdAt: Number(row.created_at),
    readAt: row.read_at ? Number(row.read_at) : null,
  };
}

/* ─────────────────────────── 统计 ─────────────────────────── */

function buildStats() {
  const s = allSettings();
  const startDate = D.isISO(s['couple.start_date']) ? s['couple.start_date'] : '';
  const todayStr = D.today();
  const togetherDays = startDate ? D.diffDays(todayStr, startDate) + 1 : null;

  const counts = {
    posts: Number(get('SELECT COUNT(*) c FROM posts').c || 0),
    photos: Number(get("SELECT COUNT(*) c FROM media WHERE owner_type = 'post'").c || 0),
    wishes: Number(get('SELECT COUNT(*) c FROM wishes').c || 0),
    wishesDone: Number(get('SELECT COUNT(*) c FROM wishes WHERE done = 1').c || 0),
    trips: Number(get('SELECT COUNT(*) c FROM trips').c || 0),
    movies: Number(get('SELECT COUNT(*) c FROM movies').c || 0),
    moviesDone: Number(get("SELECT COUNT(*) c FROM movies WHERE status = 'done'").c || 0),
    intimacy: Number(get('SELECT COUNT(*) c FROM intimacy').c || 0),
    anniversaries: Number(get('SELECT COUNT(*) c FROM anniversaries').c || 0),
    capsules: Number(get('SELECT COUNT(*) c FROM capsules').c || 0),
    messages: Number(get('SELECT COUNT(*) c FROM messages').c || 0),
    announcements: Number(get('SELECT COUNT(*) c FROM announcements').c || 0),
  };

  const firstPost = get('SELECT MIN(created_at) t FROM posts');
  const streak = (() => {
    const days = all("SELECT DISTINCT date(created_at / 1000, 'unixepoch', 'localtime') d FROM posts ORDER BY d DESC LIMIT 400");
    const set = new Set(days.map((r) => r.d));
    let cur = todayStr;
    if (!set.has(cur)) cur = D.addDays(cur, -1);
    let n = 0;
    while (cur && set.has(cur)) { n += 1; cur = D.addDays(cur, -1); }
    return n;
  })();

  const monthPosts = Number(
    get("SELECT COUNT(*) c FROM posts WHERE created_at >= ?", new Date(`${todayStr.slice(0, 7)}-01T00:00:00`).getTime()).c || 0
  );

  return { togetherDays, startDate, counts, streak, monthPosts, firstPostAt: firstPost ? firstPost.t : null };
}

/* ─────────────────────────── 路由 ─────────────────────────── */

const TILE_STYLE_VALUES = new Set(['amap', 'satellite', 'hybrid', 'none']);

function createApi() {
  const routes = [];
  const on = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'
    );
    routes.push({ method, re, keys, handler, auth: opts.auth !== false });
  };

  /* ---- 鉴权 ---- */

  on('POST', '/api/auth/login', async (ctx) => {
    const gate = auth.checkThrottle(ctx.ip);
    if (!gate.allowed) {
      throw new HttpError(429, `尝试太频繁了，请 ${gate.retryAfter} 秒后再试`, { retryAfter: gate.retryAfter });
    }
    const body = await readJSON(ctx.req);
    const password = str(body.password, 200);
    if (!password) throw new HttpError(400, '请输入密码');

    if (!auth.verifyPassword(password)) {
      auth.noteFailure(ctx.ip);
      auth.logAttempt(ctx.ip, false);
      await new Promise((r) => setTimeout(r, 350));
      throw new HttpError(401, '密码不对哦，再想想');
    }

    auth.noteSuccess(ctx.ip);
    auth.logAttempt(ctx.ip, true);
    const who = auth.normalizeWho(body.who);
    const session = auth.createSession(who, ctx.ip, ctx.req.headers['user-agent']);
    ctx.setCookie('nest_session', session.token, { maxAge: auth.SESSION_TTL / 1000 });
    return { ok: true, who: session.who, expiresAt: session.expiresAt };
  }, { auth: false });

  on('POST', '/api/auth/logout', async (ctx) => {
    auth.destroySession(ctx.token);
    ctx.setCookie('nest_session', '', { maxAge: 0 });
    return { ok: true };
  }, { auth: false });

  on('GET', '/api/auth/state', async (ctx) => {
    const s = allSettings();
    return {
      authed: !!ctx.session,
      who: ctx.session ? auth.normalizeWho(ctx.session.who) : null,
      throttled: !auth.checkThrottle(ctx.ip).allowed,
      /* 门禁页要把两个名字显示出来让人选，所以这里只能公开这两个名字。
         其它设置一律不给。 */
      names: {
        a: s['couple.name_a'] || '妍妍',
        b: s['couple.name_b'] || '博博',
      },
      title: s['couple.title'] || '我们的小窝',
    };
  }, { auth: false });

  on('POST', '/api/auth/password', async (ctx) => {
    const body = await readJSON(ctx.req);
    const res = auth.changePassword(str(body.current, 200), str(body.next, 200));
    if (!res.ok) throw new HttpError(400, res.error);
    auth.destroyAllSessions();
    ctx.setCookie('nest_session', '', { maxAge: 0 });
    return { ok: true };
  });

  /* ---- 初始化数据 ---- */

  on('GET', '/api/bootstrap', async (ctx) => {
    const settings = allSettings();
    delete settings['auth.hash'];
    delete settings['auth.salt'];
    const todayStr = D.today();
    const me = ctx.session ? auth.normalizeWho(ctx.session.who) : 'a';
    const other = me === 'a' ? 'b' : 'a';
    const q = get('SELECT * FROM daily_questions WHERE date = ?', todayStr);
    return {
      settings,
      who: me,
      stats: buildStats(),
      today: todayStr,
      serverTime: Date.now(),
      question: q
        ? { id: q.id, date: q.date, question: q.question, answerA: q.answer_a, answerB: q.answer_b }
        : { date: todayStr, question: questionFor(todayStr), answerA: null, answerB: null },
      /* 顶栏小圆点要的几个数：没看的悄悄话、没读的公告、新解锁的徽章 */
      badges: {
        messages: Number(
          get('SELECT COUNT(*) c FROM messages WHERE who = ? AND read_at IS NULL', other).c || 0
        ),
        announcements: Number(
          get(
            'SELECT COUNT(*) c FROM announcements a WHERE NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.ann_id = a.id AND r.who = ?)',
            me
          ).c || 0
        ),
        achievements: (() => {
          try { checkBadges(); } catch (e) { /* 徽章算不出来不影响启动 */ }
          return Number(get('SELECT COUNT(*) c FROM achievements WHERE seen = 0').c || 0);
        })(),
      },
    };
  });

  on('GET', '/api/settings', async () => {
    const s = allSettings();
    delete s['auth.hash'];
    delete s['auth.salt'];
    return s;
  });

  on('PATCH', '/api/settings', async (ctx) => {
    const body = await readJSON(ctx.req);
    const allowed = [
      'couple.title', 'couple.subtitle', 'couple.name_a', 'couple.name_b',
      'couple.start_date', 'couple.avatar_a', 'couple.avatar_b',
      'cycle.avg_cycle', 'cycle.avg_length', 'cycle.remind_days', 'ui.accent',
      'loc.enabled', 'loc.paused_a', 'loc.paused_b', 'loc.interval', 'loc.tiles',
    ];
    const TILE_STYLES = TILE_STYLE_VALUES;
    for (const [k, v] of Object.entries(body)) {
      if (!allowed.includes(k)) continue;
      if (k === 'couple.start_date' && v && !D.isISO(v)) continue;
      if (k === 'loc.interval') {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        setSetting(k, String(Math.min(1800, Math.max(15, Math.round(n)))));
        continue;
      }
      if (k === 'loc.enabled' || k === 'loc.paused_a' || k === 'loc.paused_b') {
        setSetting(k, bool(v) ? '1' : '0');
        continue;
      }
      if (k === 'loc.tiles') {
        if (TILE_STYLES.has(String(v))) setSetting(k, String(v));
        continue;
      }
      if (k.startsWith('cycle.')) {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        const bounds = k === 'cycle.remind_days' ? [0, 14] : k === 'cycle.avg_length' ? [1, 14] : [15, 60];
        setSetting(k, String(Math.min(bounds[1], Math.max(bounds[0], Math.round(n)))));
        continue;
      }
      setSetting(k, str(v, 120));
    }
    const s = allSettings();
    delete s['auth.hash'];
    delete s['auth.salt'];
    return s;
  });

  /* ---- 上传 ---- */

  on('POST', '/api/upload', async (ctx) => {
    const { fields, files } = await readMultipart(ctx.req);
    if (!files.length) throw new HttpError(400, '没有收到图片');
    const saved = [];
    for (const f of files.slice(0, 9)) {
      const meta = storage.saveImage(f);
      const r = run(
        'INSERT INTO media(owner_type, owner_id, filename, mime, size, width, height, created_at) VALUES (?, 0, ?, ?, ?, ?, ?, ?)',
        'pending', meta.relPath, meta.mime, meta.size,
        num(fields.width, null), num(fields.height, null), Date.now()
      );
      saved.push({ id: r.id, url: `/media/${meta.relPath}`, mime: meta.mime });
    }
    return { files: saved };
  });

  /* 语音：先落到 pending，发消息时再认领。duration 由前端测出来的秒数，只用于显示宽度 */
  on('POST', '/api/upload/voice', async (ctx) => {
    const { fields, files } = await readMultipart(ctx.req);
    if (!files.length) throw new HttpError(400, '没录到声音');
    const meta = storage.saveAudio(files[0]);
    const dur = num(fields.duration, null);
    const r = run(
      'INSERT INTO media(owner_type, owner_id, filename, mime, size, width, height, duration, created_at) VALUES (?, 0, ?, ?, ?, NULL, NULL, ?, ?)',
      'pending', meta.relPath, meta.mime, meta.size,
      dur === null ? null : Math.max(0, Math.min(600, Math.round(dur))),
      Date.now()
    );
    return { id: r.id, url: `/media/${meta.relPath}`, mime: meta.mime, duration: dur };
  });

  on('POST', '/api/upload/avatar', async (ctx) => {
    const { fields, files } = await readMultipart(ctx.req);
    if (!files.length) throw new HttpError(400, '没有收到图片');
    const meta = storage.saveImage(files[0]);
    const who = authorOf(fields.author);
    const key = who === 'a' ? 'couple.avatar_a' : 'couple.avatar_b';
    const old = get('SELECT value FROM settings WHERE key = ?', key);
    setSetting(key, `/media/${meta.relPath}`);
    if (old && old.value.startsWith('/media/')) storage.removeImage(old.value.slice(7));
    return { url: `/media/${meta.relPath}` };
  });

  /* ---- 动态 ---- */

  on('GET', '/api/posts', async (ctx) => listPosts(ctx.query));

  on('POST', '/api/posts', async (ctx) => {
    const body = await readJSON(ctx.req);
    const content = str(body.content, 5000).trim();
    const media = Array.isArray(body.media) ? body.media : [];
    if (!content && !media.length) throw new HttpError(400, '写点什么，或者放张照片吧');
    const now = Date.now();
    const r = run(
      'INSERT INTO posts(author, content, mood, weather, location, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      whoOf(ctx, body), content,
      optStr(body.mood, 20), optStr(body.weather, 20), optStr(body.location, 60),
      bool(body.pinned) ? 1 : 0, now, now
    );
    attachUploads(media, 'post', r.id);
    const row = get('SELECT * FROM posts WHERE id = ?', r.id);
    return serializePost(row, mediaRows('post', [r.id]), new Map(), new Map());
  });

  on('PATCH', '/api/posts/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM posts WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这条动态不在了');
    const body = await readJSON(ctx.req);
    const content = body.content !== undefined ? str(body.content, 5000).trim() : row.content;
    run(
      'UPDATE posts SET content = ?, mood = ?, weather = ?, location = ?, pinned = ?, updated_at = ? WHERE id = ?',
      content,
      body.mood !== undefined ? optStr(body.mood, 20) : row.mood,
      body.weather !== undefined ? optStr(body.weather, 20) : row.weather,
      body.location !== undefined ? optStr(body.location, 60) : row.location,
      body.pinned !== undefined ? (bool(body.pinned) ? 1 : 0) : row.pinned,
      Date.now(), id
    );
    if (Array.isArray(body.media)) attachUploads(body.media, 'post', id);
    const fresh = get('SELECT * FROM posts WHERE id = ?', id);
    return serializePost(fresh, mediaRows('post', [id]), new Map(), new Map());
  });

  on('DELETE', '/api/posts/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    deleteMediaOf('post', id);
    run('DELETE FROM post_reactions WHERE post_id = ?', id);
    run('DELETE FROM post_comments WHERE post_id = ?', id);
    const r = run('DELETE FROM posts WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这条动态不在了');
    return { ok: true };
  });

  on('POST', '/api/posts/:id/react', async (ctx) => {
    const id = idParam(ctx.params.id);
    if (!get('SELECT id FROM posts WHERE id = ?', id)) throw new HttpError(404, '这条动态不在了');
    const body = await readJSON(ctx.req);
    const who = whoOf(ctx, body);
    const kind = str(body.kind, 20) || 'heart';
    const existing = get('SELECT * FROM post_reactions WHERE post_id = ? AND author = ?', id, who);
    if (existing && existing.kind === kind) {
      run('DELETE FROM post_reactions WHERE id = ?', existing.id);
    } else {
      run(
        `INSERT INTO post_reactions(post_id, author, kind, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(post_id, author) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at`,
        id, who, kind, Date.now()
      );
    }
    return { reactions: all('SELECT author, kind FROM post_reactions WHERE post_id = ?', id) };
  });

  on('POST', '/api/posts/:id/comments', async (ctx) => {
    const id = idParam(ctx.params.id);
    if (!get('SELECT id FROM posts WHERE id = ?', id)) throw new HttpError(404, '这条动态不在了');
    const body = await readJSON(ctx.req);
    const content = str(body.content, 1000).trim();
    if (!content) throw new HttpError(400, '评论不能为空');
    const r = run(
      'INSERT INTO post_comments(post_id, author, content, created_at) VALUES (?, ?, ?, ?)',
      id, whoOf(ctx, body), content, Date.now()
    );
    return { id: r.id, author: whoOf(ctx, body), content, createdAt: Date.now() };
  });

  on('DELETE', '/api/comments/:id', async (ctx) => {
    const r = run('DELETE FROM post_comments WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '评论不在了');
    return { ok: true };
  });

  on('GET', '/api/posts/calendar', async () => {
    const rows = all(
      "SELECT date(created_at / 1000, 'unixepoch', 'localtime') d, COUNT(*) c FROM posts GROUP BY d ORDER BY d DESC LIMIT 400"
    );
    const map = {};
    for (const r of rows) map[r.d] = r.c;
    return { counts: map };
  });

  /* ---- 经期 ---- */

  on('GET', '/api/cycle', async (ctx) => {
    const s = allSettings();
    const periods = all('SELECT * FROM cycle_periods ORDER BY start_date DESC');
    const days = all('SELECT * FROM cycle_days ORDER BY date DESC LIMIT 400');
    const result = cycle.analyze(periods, days, {
      today: D.today(),
      avgCycle: s['cycle.avg_cycle'],
      avgLength: s['cycle.avg_length'],
      remindDays: s['cycle.remind_days'],
    });
    result.settings = {
      avgCycle: s['cycle.avg_cycle'],
      avgLength: s['cycle.avg_length'],
      remindDays: s['cycle.remind_days'],
    };
    return result;
  });

  on('POST', '/api/cycle/periods', async (ctx) => {
    const body = await readJSON(ctx.req);
    const start = requireDate(body.start_date, '开始日期');
    const end = body.end_date ? isoOr(body.end_date) : null;
    if (end && end < start) throw new HttpError(400, '结束日期不能早于开始日期');
    if (get('SELECT id FROM cycle_periods WHERE start_date = ?', start)) {
      throw new HttpError(409, '这天已经记录过了');
    }
    const r = run(
      'INSERT INTO cycle_periods(start_date, end_date, note, created_at) VALUES (?, ?, ?, ?)',
      start, end, optStr(body.note, 300), Date.now()
    );
    return { id: r.id };
  });

  on('PATCH', '/api/cycle/periods/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM cycle_periods WHERE id = ?', id);
    if (!row) throw new HttpError(404, '记录不在了');
    const body = await readJSON(ctx.req);
    const start = body.start_date !== undefined ? requireDate(body.start_date, '开始日期') : row.start_date;
    const end = body.end_date !== undefined ? (body.end_date ? isoOr(body.end_date) : null) : row.end_date;
    if (end && end < start) throw new HttpError(400, '结束日期不能早于开始日期');
    run(
      'UPDATE cycle_periods SET start_date = ?, end_date = ?, note = ? WHERE id = ?',
      start, end, body.note !== undefined ? optStr(body.note, 300) : row.note, id
    );
    return { ok: true };
  });

  on('DELETE', '/api/cycle/periods/:id', async (ctx) => {
    const r = run('DELETE FROM cycle_periods WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '记录不在了');
    return { ok: true };
  });

  on('POST', '/api/cycle/days', async (ctx) => {
    const body = await readJSON(ctx.req);
    const date = requireDate(body.date, '日期');
    run(
      `INSERT INTO cycle_days(date, flow, symptoms, mood, note, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET flow = excluded.flow, symptoms = excluded.symptoms,
         mood = excluded.mood, note = excluded.note`,
      date, optStr(body.flow, 20), optStr(body.symptoms, 200), optStr(body.mood, 20), optStr(body.note, 500), Date.now()
    );
    return { ok: true };
  });

  on('DELETE', '/api/cycle/days/:id', async (ctx) => {
    const r = run('DELETE FROM cycle_days WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '记录不在了');
    return { ok: true };
  });

  /* ---- 亲密记录 ---- */

  on('GET', '/api/intimacy', async (ctx) => {
    const limit = Math.min(Math.max(num(ctx.query.limit, 60), 1), 200);
    const rows = all('SELECT * FROM intimacy ORDER BY date DESC, id DESC LIMIT ?', limit);
    const items = rows.map((r) => ({
      id: r.id,
      date: r.date,
      time: r.time,
      author: r.author,
      protected: !!r.protected,
      rating: r.rating,
      mood: r.mood,
      place: r.place,
      note: r.note,
      createdAt: r.created_at,
    }));
    const monthMap = {};
    for (const r of all("SELECT substr(date, 1, 7) m, COUNT(*) c FROM intimacy GROUP BY m")) monthMap[r.m] = r.c;
    const last = items[0] || null;
    const todayStr = D.today();
    const since = last ? D.diffDays(todayStr, last.date) : null;
    const monthCount = Number(get("SELECT COUNT(*) c FROM intimacy WHERE substr(date,1,7) = ?", todayStr.slice(0, 7)).c || 0);
    return { items, monthMap, lastDate: last ? last.date : null, daysSince: since, monthCount, total: items.length };
  });

  on('POST', '/api/intimacy', async (ctx) => {
    const body = await readJSON(ctx.req);
    const date = requireDate(body.date, '日期');
    const r = run(
      `INSERT INTO intimacy(date, time, author, protected, rating, mood, place, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      date, optStr(body.time, 10), whoOf(ctx, body),
      body.protected === undefined ? 1 : (bool(body.protected) ? 1 : 0),
      num(body.rating, null), optStr(body.mood, 20), optStr(body.place, 60), optStr(body.note, 1000), Date.now()
    );
    return { id: r.id };
  });

  on('PATCH', '/api/intimacy/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM intimacy WHERE id = ?', id);
    if (!row) throw new HttpError(404, '记录不在了');
    const body = await readJSON(ctx.req);
    run(
      'UPDATE intimacy SET date = ?, time = ?, protected = ?, rating = ?, mood = ?, place = ?, note = ? WHERE id = ?',
      body.date !== undefined ? requireDate(body.date, '日期') : row.date,
      body.time !== undefined ? optStr(body.time, 10) : row.time,
      body.protected !== undefined ? (bool(body.protected) ? 1 : 0) : row.protected,
      body.rating !== undefined ? num(body.rating, null) : row.rating,
      body.mood !== undefined ? optStr(body.mood, 20) : row.mood,
      body.place !== undefined ? optStr(body.place, 60) : row.place,
      body.note !== undefined ? optStr(body.note, 1000) : row.note,
      id
    );
    return { ok: true };
  });

  on('DELETE', '/api/intimacy/:id', async (ctx) => {
    const r = run('DELETE FROM intimacy WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '记录不在了');
    return { ok: true };
  });

  /* ---- 纪念日 ---- */

  on('GET', '/api/anniversaries', async () => {
    const rows = all('SELECT * FROM anniversaries ORDER BY date ASC');
    const items = rows.map(serializeAnniversary).sort((a, b) => {
      if (a.daysTo === null && b.daysTo === null) return 0;
      if (a.daysTo === null) return 1;
      if (b.daysTo === null) return -1;
      return a.daysTo - b.daysTo;
    });
    return { items };
  });

  on('POST', '/api/anniversaries', async (ctx) => {
    const body = await readJSON(ctx.req);
    const title = str(body.title, 80).trim();
    if (!title) throw new HttpError(400, '给它起个名字吧');
    const date = requireDate(body.date, '日期');
    const r = run(
      'INSERT INTO anniversaries(title, date, repeat_yearly, icon, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      title, date, body.repeatYearly === false ? 0 : 1, optStr(body.icon, 8) || '💗', optStr(body.note, 500), Date.now()
    );
    return serializeAnniversary(get('SELECT * FROM anniversaries WHERE id = ?', r.id));
  });

  on('PATCH', '/api/anniversaries/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM anniversaries WHERE id = ?', id);
    if (!row) throw new HttpError(404, '纪念日不在了');
    const body = await readJSON(ctx.req);
    run(
      'UPDATE anniversaries SET title = ?, date = ?, repeat_yearly = ?, icon = ?, note = ? WHERE id = ?',
      body.title !== undefined ? (str(body.title, 80).trim() || row.title) : row.title,
      body.date !== undefined ? requireDate(body.date, '日期') : row.date,
      body.repeatYearly !== undefined ? (body.repeatYearly ? 1 : 0) : row.repeat_yearly,
      body.icon !== undefined ? (optStr(body.icon, 8) || '💗') : row.icon,
      body.note !== undefined ? optStr(body.note, 500) : row.note,
      id
    );
    return serializeAnniversary(get('SELECT * FROM anniversaries WHERE id = ?', id));
  });

  on('DELETE', '/api/anniversaries/:id', async (ctx) => {
    const r = run('DELETE FROM anniversaries WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '纪念日不在了');
    return { ok: true };
  });

  /* ---- 愿望清单 ---- */

  on('GET', '/api/wishes', async () => {
    const rows = all('SELECT * FROM wishes ORDER BY done ASC, created_at DESC');
    return {
      items: rows.map((r) => ({
        id: r.id, title: r.title, note: r.note, category: r.category,
        targetDate: r.target_date, done: !!r.done, doneAt: r.done_at,
        author: r.author, createdAt: r.created_at,
      })),
    };
  });

  on('POST', '/api/wishes', async (ctx) => {
    const body = await readJSON(ctx.req);
    const title = str(body.title, 120).trim();
    if (!title) throw new HttpError(400, '写下你想一起做的事');
    const r = run(
      'INSERT INTO wishes(title, note, category, target_date, done, author, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      title, optStr(body.note, 500), optStr(body.category, 30),
      body.targetDate ? isoOr(body.targetDate) : null, whoOf(ctx, body), Date.now()
    );
    return { id: r.id };
  });

  on('PATCH', '/api/wishes/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM wishes WHERE id = ?', id);
    if (!row) throw new HttpError(404, '愿望不在了');
    const body = await readJSON(ctx.req);
    const done = body.done !== undefined ? (body.done ? 1 : 0) : row.done;
    run(
      'UPDATE wishes SET title = ?, note = ?, category = ?, target_date = ?, done = ?, done_at = ? WHERE id = ?',
      body.title !== undefined ? (str(body.title, 120).trim() || row.title) : row.title,
      body.note !== undefined ? optStr(body.note, 500) : row.note,
      body.category !== undefined ? optStr(body.category, 30) : row.category,
      body.targetDate !== undefined ? (body.targetDate ? isoOr(body.targetDate) : null) : row.target_date,
      done,
      done && !row.done ? Date.now() : (done ? row.done_at : null),
      id
    );
    return { ok: true };
  });

  on('DELETE', '/api/wishes/:id', async (ctx) => {
    const r = run('DELETE FROM wishes WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '愿望不在了');
    return { ok: true };
  });

  /* ---- 心情打卡 ---- */

  on('GET', '/api/moods', async (ctx) => {
    const month = /^\d{4}-\d{2}$/.test(String(ctx.query.month || '')) ? String(ctx.query.month) : D.today().slice(0, 7);
    const rows = all("SELECT * FROM moods WHERE substr(date, 1, 7) = ? ORDER BY date ASC", month);
    const todayRows = all('SELECT * FROM moods WHERE date = ?', D.today());
    return {
      month,
      items: rows.map((r) => ({ id: r.id, date: r.date, author: r.author, mood: r.mood, note: r.note })),
      today: todayRows.map((r) => ({ id: r.id, date: r.date, author: r.author, mood: r.mood, note: r.note })),
    };
  });

  on('POST', '/api/moods', async (ctx) => {
    const body = await readJSON(ctx.req);
    const date = requireDate(body.date, '日期');
    const mood = str(body.mood, 20);
    if (!MOODS.has(mood)) throw new HttpError(400, '选择一种心情');
    const who = whoOf(ctx, body);
    run(
      `INSERT INTO moods(date, author, mood, note, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date, author) DO UPDATE SET mood = excluded.mood, note = excluded.note`,
      date, who, mood, optStr(body.note, 200), Date.now()
    );
    return { ok: true };
  });

  /* ---- 旅行足迹 ---- */

  on('GET', '/api/trips', async () => {
    const rows = all("SELECT * FROM trips ORDER BY COALESCE(start_date, '') DESC, id DESC");
    const ids = rows.map((r) => r.id);
    const mediaMap = mediaRows('trip', ids);
    return {
      items: rows.map((r) => ({
        id: r.id, title: r.title, place: r.place,
        startDate: r.start_date, endDate: r.end_date, note: r.note,
        coverMediaId: r.cover_media_id, createdAt: r.created_at,
        photos: mediaMap.get(r.id) || [],
      })),
    };
  });

  on('POST', '/api/trips', async (ctx) => {
    const body = await readJSON(ctx.req);
    const title = str(body.title, 100).trim();
    if (!title) throw new HttpError(400, '这次旅行叫什么？');
    const r = run(
      'INSERT INTO trips(title, place, start_date, end_date, note, cover_media_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      title, optStr(body.place, 60),
      body.startDate ? isoOr(body.startDate) : null,
      body.endDate ? isoOr(body.endDate) : null,
      optStr(body.note, 2000), null, Date.now()
    );
    attachUploads(body.media, 'trip', r.id);
    return { id: r.id };
  });

  on('PATCH', '/api/trips/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM trips WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这段旅程不在了');
    const body = await readJSON(ctx.req);
    run(
      'UPDATE trips SET title = ?, place = ?, start_date = ?, end_date = ?, note = ? WHERE id = ?',
      body.title !== undefined ? (str(body.title, 100).trim() || row.title) : row.title,
      body.place !== undefined ? optStr(body.place, 60) : row.place,
      body.startDate !== undefined ? (body.startDate ? isoOr(body.startDate) : null) : row.start_date,
      body.endDate !== undefined ? (body.endDate ? isoOr(body.endDate) : null) : row.end_date,
      body.note !== undefined ? optStr(body.note, 2000) : row.note,
      id
    );
    if (Array.isArray(body.media)) syncUploads(body.media, 'trip', id);
    return { ok: true };
  });

  on('DELETE', '/api/trips/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    deleteMediaOf('trip', id);
    const r = run('DELETE FROM trips WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这段旅程不在了');
    return { ok: true };
  });

  /* ---- 电影清单 ---- */

  on('GET', '/api/movies', async () => {
    const rows = all('SELECT * FROM movies ORDER BY status ASC, COALESCE(finished_at, created_at) DESC');
    return {
      items: rows.map((r) => ({
        id: r.id, title: r.title, kind: r.kind, status: r.status,
        rating: r.rating, review: r.review, author: r.author,
        createdAt: r.created_at, finishedAt: r.finished_at,
      })),
    };
  });

  on('POST', '/api/movies', async (ctx) => {
    const body = await readJSON(ctx.req);
    const title = str(body.title, 120).trim();
    if (!title) throw new HttpError(400, '片名叫什么？');
    const status = ['want', 'watching', 'done'].includes(body.status) ? body.status : 'want';
    const r = run(
      'INSERT INTO movies(title, kind, status, rating, review, author, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      title, ['movie', 'tv', 'anime', 'doc'].includes(body.kind) ? body.kind : 'movie',
      status, scoreOf(body.rating), optStr(body.review, 1000), whoOf(ctx, body), Date.now(),
      status === 'done' ? Date.now() : null
    );
    return { id: r.id };
  });

  on('PATCH', '/api/movies/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM movies WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这条不在了');
    const body = await readJSON(ctx.req);
    const status = ['want', 'watching', 'done'].includes(body.status) ? body.status : row.status;
    run(
      'UPDATE movies SET title = ?, kind = ?, status = ?, rating = ?, review = ?, finished_at = ? WHERE id = ?',
      body.title !== undefined ? (str(body.title, 120).trim() || row.title) : row.title,
      body.kind !== undefined && ['movie', 'tv', 'anime', 'doc'].includes(body.kind) ? body.kind : row.kind,
      status,
      body.rating !== undefined ? scoreOf(body.rating) : scoreOf(row.rating),
      body.review !== undefined ? optStr(body.review, 1000) : row.review,
      status === 'done' && !row.finished_at ? Date.now() : (status === 'done' ? row.finished_at : null),
      id
    );
    return { ok: true };
  });

  on('DELETE', '/api/movies/:id', async (ctx) => {
    const r = run('DELETE FROM movies WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '这条不在了');
    return { ok: true };
  });

  /* ---- 时光胶囊 ---- */

  on('GET', '/api/capsules', async () => {
    const rows = all('SELECT * FROM capsules ORDER BY unlock_date ASC');
    const todayStr = D.today();
    return {
      items: rows.map((r) => {
        const unlocked = r.unlock_date <= todayStr;
        return {
          id: r.id, title: r.title, unlockDate: r.unlock_date, author: r.author,
          createdAt: r.created_at, openedAt: r.opened_at,
          unlocked, daysTo: D.diffDays(r.unlock_date, todayStr),
          content: unlocked ? r.content : null,
          preview: unlocked ? null : `${r.content.length} 字`,
        };
      }),
    };
  });

  on('POST', '/api/capsules', async (ctx) => {
    const body = await readJSON(ctx.req);
    const title = str(body.title, 100).trim();
    const content = str(body.content, 8000).trim();
    if (!title || !content) throw new HttpError(400, '标题和内容都要写哦');
    const unlock = requireDate(body.unlockDate, '开启日期');
    if (unlock < D.today()) throw new HttpError(400, '开启日期要在今天之后');
    const r = run(
      'INSERT INTO capsules(title, content, unlock_date, author, created_at) VALUES (?, ?, ?, ?, ?)',
      title, content, unlock, whoOf(ctx, body), Date.now()
    );
    return { id: r.id };
  });

  on('POST', '/api/capsules/:id/open', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM capsules WHERE id = ?', id);
    if (!row) throw new HttpError(404, '胶囊不在了');
    if (row.unlock_date > D.today()) throw new HttpError(403, `还没到时间，还有 ${D.diffDays(row.unlock_date, D.today())} 天`);
    run('UPDATE capsules SET opened_at = COALESCE(opened_at, ?) WHERE id = ?', Date.now(), id);
    return { content: row.content };
  });

  on('DELETE', '/api/capsules/:id', async (ctx) => {
    const r = run('DELETE FROM capsules WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '胶囊不在了');
    return { ok: true };
  });

  /* ---- 每日一问 ---- */

  on('GET', '/api/daily', async () => {
    const todayStr = D.today();
    let q = get('SELECT * FROM daily_questions WHERE date = ?', todayStr);
    if (!q) {
      run(
        'INSERT INTO daily_questions(date, question, created_at) VALUES (?, ?, ?)',
        todayStr, questionFor(todayStr), Date.now()
      );
      q = get('SELECT * FROM daily_questions WHERE date = ?', todayStr);
    }
    return { id: q.id, date: q.date, question: q.question, answerA: q.answer_a, answerB: q.answer_b };
  });

  on('POST', '/api/daily', async (ctx) => {
    const body = await readJSON(ctx.req);
    const todayStr = D.today();
    let q = get('SELECT * FROM daily_questions WHERE date = ?', todayStr);
    if (!q) {
      run('INSERT INTO daily_questions(date, question, created_at) VALUES (?, ?, ?)', todayStr, questionFor(todayStr), Date.now());
      q = get('SELECT * FROM daily_questions WHERE date = ?', todayStr);
    }
    const who = whoOf(ctx, body);
    const answer = str(body.answer, 1000).trim();
    if (!answer) throw new HttpError(400, '写一句吧');
    if (who === 'a') run('UPDATE daily_questions SET answer_a = ? WHERE id = ?', answer, q.id);
    else run('UPDATE daily_questions SET answer_b = ? WHERE id = ?', answer, q.id);
    const fresh = get('SELECT * FROM daily_questions WHERE id = ?', q.id);
    return { answerA: fresh.answer_a, answerB: fresh.answer_b };
  });

  on('GET', '/api/daily/history', async () => {
    const rows = all(
      'SELECT * FROM daily_questions WHERE answer_a IS NOT NULL OR answer_b IS NOT NULL ORDER BY date DESC LIMIT 60'
    );
    return {
      items: rows.map((r) => ({ date: r.date, question: r.question, answerA: r.answer_a, answerB: r.answer_b })),
    };
  });

  /* ---- 情侣定位 ---- */

  /* 对方看到的东西：最新一点 + 是否在线 + 电量 + 匹配到的地名 + 今天走过的路 */
  function serializePresence(who) {
    const last = get(
      'SELECT * FROM location_points WHERE who = ? ORDER BY created_at DESC LIMIT 1',
      who
    );
    const paused = getSetting(`loc.paused_${who}`, '0') === '1';
    const places = all('SELECT * FROM places ORDER BY id');
    if (!last) return { who, has: false, paused, point: null };
    const hit = geo.matchPlace({ lat: last.lat, lng: last.lng }, places);
    return {
      who,
      has: true,
      paused,
      point: {
        lat: Number(last.lat),
        lng: Number(last.lng),
        acc: last.acc === null ? null : Number(last.acc),
        speed: last.speed === null ? null : Number(last.speed),
        heading: last.heading === null ? null : Number(last.heading),
        altitude: last.altitude === null ? null : Number(last.altitude),
        battery: last.battery === null ? null : Number(last.battery),
        charging: last.charging === 1,
        source: last.source || 'gps',
        at: Number(last.created_at),
        place: hit,
      },
    };
  }

  /* 距离 / 方位：把两个人的最新位置合起来算 */
  function together(me, other) {
    const a = serializePresence(me);
    const b = serializePresence(other);
    const out = { me: a, other: b, distance: null, bearing: null, compass: null, humanDistance: null };
    if (a.has && b.has) {
      const d = geo.distance(a.point.lat, a.point.lng, b.point.lat, b.point.lng);
      const brg = geo.bearing(a.point.lat, a.point.lng, b.point.lat, b.point.lng);
      out.distance = Math.round(d);
      out.bearing = Math.round(brg);
      out.compass = geo.compass(brg);
      out.humanDistance = geo.humanDistance(d);
    }
    return out;
  }

  on('GET', '/api/location', async (ctx) => {
    const me = whoOf(ctx, {});
    const other = me === 'a' ? 'b' : 'a';
    const settings = allSettings();
    const trailHours = Math.min(72, Math.max(1, Number(ctx.query.hours) || 24));
    const since = Date.now() - trailHours * 3600 * 1000;
    const trailOf = (who) =>
      all(
        'SELECT lat, lng, acc, speed, battery, created_at FROM location_points WHERE who = ? AND created_at >= ? ORDER BY created_at ASC LIMIT 2000',
        who, since
      ).map((p) => ({
        lat: Number(p.lat), lng: Number(p.lng),
        acc: p.acc === null ? null : Number(p.acc),
        speed: p.speed === null ? null : Number(p.speed),
        battery: p.battery === null ? null : Number(p.battery),
        at: Number(p.created_at),
      }));

    const places = all('SELECT * FROM places ORDER BY id').map((p) => ({
      id: p.id, name: p.name, icon: p.icon || '📍',
      lat: Number(p.lat), lng: Number(p.lng), radius: Number(p.radius) || 200,
    }));

    const unread = all(
      'SELECT * FROM nudges WHERE to_who = ? AND seen_at IS NULL ORDER BY created_at DESC LIMIT 20',
      me
    ).map((n) => ({ id: n.id, from: n.from_who, kind: n.kind, at: Number(n.created_at) }));

    return {
      ...together(me, other),
      settings: {
        enabled: settings['loc.enabled'] !== '0',
        interval: Number(settings['loc.interval']) || 60,
        pausedA: settings['loc.paused_a'] === '1',
        pausedB: settings['loc.paused_b'] === '1',
        tiles: TILE_STYLE_VALUES.has(settings['loc.tiles']) ? settings['loc.tiles'] : 'amap',
      },
      places,
      trails: { me: trailOf(me), other: trailOf(other) },
      nudges: unread,
      serverTime: Date.now(),
    };
  });

  /* 上报一个点。同一分钟内重复上报会被合并，避免手机频繁唤醒把库写爆。 */
  on('POST', '/api/location', async (ctx) => {
    const me = whoOf(ctx, {});
    if (getSetting('loc.enabled', '1') === '0') throw new HttpError(403, '定位功能现在是关着的');
    if (getSetting(`loc.paused_${me}`, '0') === '1') throw new HttpError(403, '你把自己的位置暂停共享了');

    const body = await readJSON(ctx.req);
    const lat = num(body.lat, null);
    const lng = num(body.lng, null);
    if (!geo.validPoint(lat, lng)) throw new HttpError(400, '坐标不对，重新定位一下');

    const acc = num(body.acc, null);
    const speed = num(body.speed, null);
    const heading = num(body.heading, null);
    const altitude = num(body.altitude, null);
    const battery = body.battery === undefined || body.battery === null ? null : Math.round(num(body.battery, 0));
    const charging = body.charging === true || body.charging === 1 ? 1 : 0;
    const now = Date.now();

    /* 一分钟内的连续点：只更新最后一条，不新增行 */
    const last = get(
      'SELECT * FROM location_points WHERE who = ? ORDER BY created_at DESC LIMIT 1',
      me
    );
    if (last && now - Number(last.created_at) < 55 * 1000) {
      run(
        'UPDATE location_points SET lat = ?, lng = ?, acc = ?, speed = ?, heading = ?, altitude = ?, battery = ?, charging = ?, created_at = ? WHERE id = ?',
        lat, lng, acc, speed, heading, altitude, battery, charging, now, last.id
      );
    } else {
      run(
        'INSERT INTO location_points(who, lat, lng, acc, speed, heading, altitude, battery, charging, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        me, lat, lng, acc, speed, heading, altitude, battery, charging, optStr(body.source, 20) || 'gps', now
      );
    }

    /* 轨迹只留 3 天，自动清理 */
    run('DELETE FROM location_points WHERE created_at < ?', now - 3 * 24 * 3600 * 1000);

    const other = me === 'a' ? 'b' : 'a';
    return { ok: true, at: now, ...together(me, other) };
  });

  on('POST', '/api/location/pause', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const paused = body.paused === undefined ? true : bool(body.paused);
    setSetting(`loc.paused_${me}`, paused ? '1' : '0');
    return { ok: true, paused };
  });

  on('POST', '/api/location/clear', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const target = body.all === true ? null : me;
    if (target) run('DELETE FROM location_points WHERE who = ?', target);
    else run('DELETE FROM location_points');
    return { ok: true };
  });

  on('POST', '/api/location/nudge', async (ctx) => {
    const me = whoOf(ctx, {});
    const other = me === 'a' ? 'b' : 'a';
    const body = await readJSON(ctx.req);
    const kind = ['miss', 'come', 'home', 'eat', 'hug', 'sleep'].includes(body.kind) ? body.kind : 'miss';
    /* 十分钟内同一种只发一次，手滑连点不会刷屏；
       但对方已经看过的那次不算数 —— 看到了还想再戳一下，应该能戳到 */
    const recent = get(
      'SELECT * FROM nudges WHERE from_who = ? AND kind = ? AND seen_at IS NULL AND created_at > ? ORDER BY id DESC LIMIT 1',
      me, kind, Date.now() - 10 * 60 * 1000
    );
    if (recent) return { ok: true, id: recent.id, deduped: true };
    const r = run(
      'INSERT INTO nudges(from_who, to_who, kind, created_at) VALUES (?, ?, ?, ?)',
      me, other, kind, Date.now()
    );
    return { ok: true, id: r.id };
  });

  on('POST', '/api/nudges/seen', async (ctx) => {
    const me = whoOf(ctx, {});
    run('UPDATE nudges SET seen_at = ? WHERE to_who = ? AND seen_at IS NULL', Date.now(), me);
    return { ok: true };
  });

  on('GET', '/api/places', async () => {
    return {
      items: all('SELECT * FROM places ORDER BY id').map((p) => ({
        id: p.id, name: p.name, icon: p.icon || '📍',
        lat: Number(p.lat), lng: Number(p.lng), radius: Number(p.radius) || 200,
      })),
    };
  });

  on('POST', '/api/places', async (ctx) => {
    const body = await readJSON(ctx.req);
    const name = str(body.name, 40).trim();
    if (!name) throw new HttpError(400, '给这个地方起个名字');
    const lat = num(body.lat, null);
    const lng = num(body.lng, null);
    if (!geo.validPoint(lat, lng)) throw new HttpError(400, '坐标不对');
    const radius = Math.min(5000, Math.max(30, Math.round(num(body.radius, 200))));
    const r = run(
      'INSERT INTO places(name, icon, lat, lng, radius, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      name, optStr(body.icon, 8) || '📍', lat, lng, radius, Date.now()
    );
    return { id: r.id, name, lat, lng, radius };
  });

  on('PATCH', '/api/places/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM places WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这个地方不在了');
    const body = await readJSON(ctx.req);
    const name = body.name === undefined ? row.name : str(body.name, 40).trim() || row.name;
    const lat = body.lat === undefined ? Number(row.lat) : num(body.lat, null);
    const lng = body.lng === undefined ? Number(row.lng) : num(body.lng, null);
    if (!geo.validPoint(lat, lng)) throw new HttpError(400, '坐标不对');
    const radius = body.radius === undefined
      ? Number(row.radius)
      : Math.min(5000, Math.max(30, Math.round(num(body.radius, 200))));
    const icon = body.icon === undefined ? row.icon : optStr(body.icon, 8) || '📍';
    run('UPDATE places SET name = ?, icon = ?, lat = ?, lng = ?, radius = ? WHERE id = ?',
      name, icon, lat, lng, radius, id);
    return { ok: true, id, name, lat, lng, radius };
  });

  on('DELETE', '/api/places/:id', async (ctx) => {
    const r = run('DELETE FROM places WHERE id = ?', idParam(ctx.params.id));
    if (!r.changes) throw new HttpError(404, '这个地方不在了');
    return { ok: true };
  });

  /* ---- 地图底图（服务端代理 + 磁盘缓存）----
     浏览器只跟自己的服务器要图，CSP 里的 img-src 不用为地图放宽，
     高德也看不到两个人的真实 IP。 */

  on('GET', '/api/tile/:style/:z/:x/:y', async (ctx) => {
    const style = tiles.normalizeStyle(ctx.params.style);
    const z = Number(ctx.params.z);
    const x = Number(ctx.params.x);
    /* y 允许带 .png / .jpg 后缀，去掉再校验 */
    const y = Number(String(ctx.params.y).replace(/\.(png|jpe?g|webp)$/i, ''));
    if (!tiles.validTile(z, x, y)) throw new HttpError(400, '瓦片坐标不对');

    let tile;
    try {
      tile = await tiles.fetchTile(style, z, x, y);
    } catch (e) {
      throw new HttpError(502, '底图暂时取不到');
    }
    ctx.res.writeHead(200, {
      'Content-Type': tile.type || 'image/png',
      /* 底图一个月内不会变，长缓存；两个人同一块瓦片只取一次 */
      'Cache-Control': 'public, max-age=2592000, immutable',
      'Content-Length': tile.buf.length,
    });
    ctx.res.end(tile.buf);
    return undefined;
  });

  /* ---- 悄悄话（聊天）---- */

  on('GET', '/api/messages', async (ctx) => {
    const me = whoOf(ctx, {});
    const before = num(ctx.query.before, null);
    const limit = Math.min(100, Math.max(1, Math.round(num(ctx.query.limit, 40))));

    const rows = before
      ? all('SELECT * FROM messages WHERE id < ? ORDER BY id DESC LIMIT ?', before, limit)
      : all('SELECT * FROM messages ORDER BY id DESC LIMIT ?', limit);

    /* 倒着取的，翻回来按时间正序给前端 */
    rows.reverse();

    /* 先把「还没看的」数出来，再标已读 —— 顺序反了永远返回 0 */
    const unread = get(
      'SELECT COUNT(*) AS c FROM messages WHERE who = ? AND read_at IS NULL', me === 'a' ? 'b' : 'a'
    ).c;

    /* 顺手把对方发来的标成已读 —— 打开聊天页就等于看到了 */
    const unreadIds = rows.filter((r) => r.who !== me && !r.read_at).map((r) => r.id);
    if (unreadIds.length) {
      const now = Date.now();
      for (const id of unreadIds) run('UPDATE messages SET read_at = ? WHERE id = ?', now, id);
      for (const r of rows) if (unreadIds.includes(r.id)) r.read_at = now;
    }

    const total = get('SELECT COUNT(*) AS c FROM messages').c;

    return {
      items: rows.map(serializeMessage),
      hasMore: rows.length === limit,
      total: Number(total),
      unread: Number(unread),
    };
  });

  /* 聊天记录搜索：只查文本，不动已读状态 */
  on('GET', '/api/messages/search', async (ctx) => {
    whoOf(ctx, {});
    const q = str(ctx.query.q, 40).trim();
    const limit = Math.min(100, Math.max(1, Math.round(num(ctx.query.limit, 40))));
    if (!q) return { items: [], total: 0 };
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    const rows = all(
      "SELECT * FROM messages WHERE body LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ?",
      like,
      limit
    );
    return { items: rows.map(serializeMessage), total: rows.length };
  });

  on('POST', '/api/messages', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const text = str(body.body, 4000).trim();
    const mediaId = num(body.mediaId, null);
    if (!text && !mediaId) throw new HttpError(400, '说点什么吧');
    if (mediaId) {
      const m = get('SELECT * FROM media WHERE id = ?', mediaId);
      if (!m) throw new HttpError(400, '这张照片不在了');
    }
    const r = run(
      'INSERT INTO messages(who, body, media_id, reply_to, created_at) VALUES (?, ?, ?, ?, ?)',
      me, text, mediaId, num(body.replyTo, null), Date.now()
    );
    /* read_at 只代表「对方看到了」，自己发的时候不写 */
    const row = get('SELECT * FROM messages WHERE id = ?', r.id);
    /* 有新悄悄话：实时推给对方（SSE，谁在线谁收到；无人连接时静默） */
    notifyCounterpart(me, {
      type: 'message',
      who: me,
      body: text || '[照片]',
      msgId: Number(row.id),
      unread: Number(
        get('SELECT COUNT(*) AS c FROM messages WHERE who = ? AND read_at IS NULL', me).c || 0
      ),
      at: Number(row.created_at),
    });
    return serializeMessage(row);
  });

  on('DELETE', '/api/messages/:id', async (ctx) => {
    const me = whoOf(ctx, {});
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM messages WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这条消息不在了');
    /* 只能删自己发的 */
    if (row.who !== me) throw new HttpError(403, '只能删自己发的');
    run('DELETE FROM messages WHERE id = ?', id);
    return { ok: true };
  });

  /* 未读数，给顶栏小圆点用 */
  on('GET', '/api/messages/unread', async (ctx) => {
    const me = whoOf(ctx, {});
    const other = me === 'a' ? 'b' : 'a';
    const unread = get(
      'SELECT COUNT(*) AS c FROM messages WHERE who = ? AND read_at IS NULL', other
    ).c;
    const last = get('SELECT * FROM messages ORDER BY id DESC LIMIT 1');
    return {
      unread: Number(unread),
      lastAt: last ? Number(last.created_at) : null,
      lastWho: last ? last.who : null,
    };
  });

  /* ---- 公告栏 ---- */

  on('GET', '/api/announcements', async (ctx) => {
    const me = whoOf(ctx, {});
    const rows = all('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 200');
    const reads = new Map(
      all('SELECT ann_id, read_at FROM announcement_reads WHERE who = ?', me)
        .map((r) => [r.ann_id, Number(r.read_at)])
    );
    const items = rows.map((r) => ({
      id: r.id,
      author: r.author,
      title: r.title,
      body: r.body,
      pinned: !!r.pinned,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      readAt: reads.get(r.id) || null,
    }));
    return {
      items,
      /* 未读的那几条：前端拿去弹窗 */
      unread: items.filter((i) => !i.readAt),
      unreadCount: items.filter((i) => !i.readAt).length,
    };
  });

  on('POST', '/api/announcements', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const title = str(body.title, 80).trim();
    const text = str(body.body, 8000).trim();
    if (!title && !text) throw new HttpError(400, '公告得写点东西');
    const now = Date.now();
    const r = run(
      'INSERT INTO announcements(author, title, body, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      me, title || '小通知', text, bool(body.pinned) ? 1 : 0, now, now
    );
    /* 自己发的自己当然已读 */
    run('INSERT OR REPLACE INTO announcement_reads(ann_id, who, read_at) VALUES (?, ?, ?)', r.id, me, now);
    return { ok: true, id: r.id };
  });

  on('PATCH', '/api/announcements/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM announcements WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这条公告不在了');
    const body = await readJSON(ctx.req);
    const title = body.title === undefined ? row.title : str(body.title, 80).trim() || row.title;
    const text = body.body === undefined ? row.body : str(body.body, 8000).trim();
    const pinned = body.pinned === undefined ? Number(row.pinned) : (bool(body.pinned) ? 1 : 0);
    run(
      'UPDATE announcements SET title = ?, body = ?, pinned = ?, updated_at = ? WHERE id = ?',
      title, text, pinned, Date.now(), id
    );
    return { ok: true, id };
  });

  on('DELETE', '/api/announcements/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const r = run('DELETE FROM announcements WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这条公告不在了');
    run('DELETE FROM announcement_reads WHERE ann_id = ?', id);
    return { ok: true };
  });

  /* 标已读：body.ids 为空数组表示「全部标已读」 */
  on('POST', '/api/announcements/read', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const now = Date.now();
    const ids = Array.isArray(body.ids)
      ? body.ids.map((v) => Math.round(Number(v))).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (ids.length) {
      for (const id of ids) {
        run('INSERT OR REPLACE INTO announcement_reads(ann_id, who, read_at) VALUES (?, ?, ?)', id, me, now);
      }
    } else {
      for (const row of all('SELECT id FROM announcements')) {
        run('INSERT OR REPLACE INTO announcement_reads(ann_id, who, read_at) VALUES (?, ?, ?)', row.id, me, now);
      }
    }
    return { ok: true, read: ids.length || undefined };
  });

  /* ---- 统计 / 导出 ---- */

  on('GET', '/api/stats', async () => buildStats());

  on('GET', '/api/export', async (ctx) => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: allSettings(),
      posts: all('SELECT * FROM posts ORDER BY id'),
      media: all('SELECT * FROM media ORDER BY id'),
      cycle_periods: all('SELECT * FROM cycle_periods ORDER BY id'),
      cycle_days: all('SELECT * FROM cycle_days ORDER BY id'),
      intimacy: all('SELECT * FROM intimacy ORDER BY id'),
      anniversaries: all('SELECT * FROM anniversaries ORDER BY id'),
      wishes: all('SELECT * FROM wishes ORDER BY id'),
      moods: all('SELECT * FROM moods ORDER BY id'),
      trips: all('SELECT * FROM trips ORDER BY id'),
      movies: all('SELECT * FROM movies ORDER BY id'),
      capsules: all('SELECT * FROM capsules ORDER BY id'),
      daily_questions: all('SELECT * FROM daily_questions ORDER BY id'),
      places: all('SELECT * FROM places ORDER BY id'),
      location_points: all('SELECT * FROM location_points ORDER BY id'),
      nudges: all('SELECT * FROM nudges ORDER BY id'),
      messages: all('SELECT * FROM messages ORDER BY id'),
      announcements: all('SELECT * FROM announcements ORDER BY id'),
      announcement_reads: all('SELECT * FROM announcement_reads'),
      quizzes: all('SELECT * FROM quizzes ORDER BY id'),
      quiz_answers: all('SELECT * FROM quiz_answers ORDER BY id'),
      couple_items: all('SELECT * FROM couple_items ORDER BY id'),
      reports: all('SELECT * FROM reports ORDER BY id'),
      albums: all('SELECT * FROM albums ORDER BY id'),
      album_items: all('SELECT * FROM album_items ORDER BY id'),
      cool_cards: all('SELECT * FROM cool_cards ORDER BY id'),
      tree_state: all('SELECT * FROM tree_state'),
      tree_log: all('SELECT * FROM tree_log ORDER BY id'),
      draws: all('SELECT * FROM draws ORDER BY id'),
      events: all('SELECT * FROM events ORDER BY id'),
      achievements: all('SELECT * FROM achievements ORDER BY id'),
    };
    delete payload.settings['auth.hash'];
    delete payload.settings['auth.salt'];
    const name = `lovers-nest-backup-${D.today()}.json`;
    ctx.res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    });
    ctx.res.end(JSON.stringify(payload, null, 2));
    return undefined;
  });

  /* ---- 聊天列表摘要：只给预览，不把对方消息标成已读 ---- */

  on('GET', '/api/chats/summary', async (ctx) => {
    const me = whoOf(ctx, {});
    const other = me === 'a' ? 'b' : 'a';
    const last = get('SELECT * FROM messages ORDER BY id DESC LIMIT 1');
    const unread = Number(
      get('SELECT COUNT(*) c FROM messages WHERE who = ? AND read_at IS NULL', other).c || 0
    );
    const total = Number(get('SELECT COUNT(*) c FROM messages').c || 0);
    const ann = get('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC, id DESC LIMIT 1');
    const annUnread = Number(
      get(
        `SELECT COUNT(*) c FROM announcements a WHERE NOT EXISTS (
           SELECT 1 FROM announcement_reads r WHERE r.ann_id = a.id AND r.who = ?
         )`,
        me
      ).c || 0
    );
    return {
      last: last
        ? {
            id: Number(last.id),
            who: last.who,
            body: last.body || '',
            hasMedia: !!last.media_id,
            createdAt: Number(last.created_at),
            readAt: last.read_at ? Number(last.read_at) : null,
          }
        : null,
      total,
      unread,
      ann: ann
        ? {
            id: Number(ann.id),
            title: ann.title || '',
            body: ann.body || '',
            createdAt: Number(ann.created_at),
          }
        : null,
      annUnread,
    };
  });

  /* ═══════════════════════════════════════════════════════════
     v4 新功能
     ═══════════════════════════════════════════════════════════ */

  /* ---- 默契测验 ---- */

  /* 当天那一局：没有就按题库惰性建一条。
     题库按日期取模，所以同一天两人拿到的一定是同一题。 */
  function quizForToday() {
    const todayStr = D.today();
    let row = get('SELECT * FROM quizzes WHERE date = ?', todayStr);
    if (row) return row;
    const pick = QB.pickFor(todayStr);
    const r = run(
      'INSERT INTO quizzes(date, kind, question, options, scale_max, category, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      todayStr,
      'daily',
      pick.q,
      pick.options ? JSON.stringify(pick.options) : null,
      5,
      pick.cat || null,
      'a',
      Date.now()
    );
    return get('SELECT * FROM quizzes WHERE id = ?', r.id);
  }

  /* 序列化一局。对方答案只有「两人都答了」才返回——
     裁剪必须在服务端做，前端隐藏挡不住 DevTools。 */
  function serializeQuiz(row, me) {
    const answers = all('SELECT * FROM quiz_answers WHERE quiz_id = ?', row.id);
    const mine = answers.find((x) => x.author === me) || null;
    const theirs = answers.find((x) => x.author !== me) || null;
    const both = !!(mine && theirs);
    const opts = row.options ? JSON.parse(row.options) : null;
    return {
      id: Number(row.id),
      date: row.date,
      kind: row.kind,
      question: row.question,
      options: opts,
      category: row.category,
      mine: mine ? { choice: mine.choice, note: mine.note, at: Number(mine.created_at) } : null,
      theirs: both ? { choice: theirs.choice, note: theirs.note, at: Number(theirs.created_at) } : null,
      theirAnswered: !!theirs,
      both,
      same: both ? mine.choice === theirs.choice : null,
      dayNumber: row.date ? QB.dayNumber(row.date) : null,
    };
  }

  on('GET', '/api/quiz/today', async (ctx) => {
    const me = whoOf(ctx, {});
    const row = quizForToday();
    return serializeQuiz(row, me);
  });

  on('POST', '/api/quiz/answer', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const row = quizForToday();
    const opts = row.options ? JSON.parse(row.options) : null;
    let choice = str(body.choice, 500).trim();
    if (opts) {
      const i = Number(body.choice);
      if (!Number.isInteger(i) || i < 0 || i >= opts.length) throw new HttpError(400, '选一个吧');
      choice = String(i);
    } else {
      if (!choice) throw new HttpError(400, '写点什么吧');
    }
    const note = optStr(body.note, 500);
    const existing = get('SELECT * FROM quiz_answers WHERE quiz_id = ? AND author = ?', row.id, me);
    if (existing) {
      run('UPDATE quiz_answers SET choice = ?, note = ?, updated_at = ? WHERE id = ?', choice, note, Date.now(), existing.id);
    } else {
      run(
        'INSERT INTO quiz_answers(quiz_id, author, choice, note, created_at) VALUES (?, ?, ?, ?, ?)',
        row.id, me, choice, note, Date.now()
      );
    }
    return serializeQuiz(get('SELECT * FROM quizzes WHERE id = ?', row.id), me);
  });

  on('GET', '/api/quiz/history', async (ctx) => {
    const me = whoOf(ctx, {});
    const todayStr = D.today();
    const rows = all(
      'SELECT * FROM quizzes WHERE date IS NOT NULL AND date < ? ORDER BY date DESC LIMIT 40',
      todayStr
    );
    const items = rows
      .map((r) => serializeQuiz(r, me))
      .filter((x) => x.mine || x.theirAnswered);
    return { items };
  });

  on('GET', '/api/quiz/badge', async (ctx) => {
    const me = whoOf(ctx, {});
    const row = quizForToday();
    const mine = get('SELECT id FROM quiz_answers WHERE quiz_id = ? AND author = ?', row.id, me);
    const theirs = get('SELECT id FROM quiz_answers WHERE quiz_id = ? AND author != ?', row.id, me);
    return { mine: !!mine, theirs: !!theirs, both: !!(mine && theirs) };
  });

  /* ---- 100 件小事 ---- */

  const ITEM_CATS = new Set(['life', 'time', 'hobby', 'travel', 'food', 'us']);

  function serializeItem(r) {
    return {
      id: Number(r.id),
      title: r.title,
      note: r.note,
      category: r.category,
      seq: Number(r.seq || 0),
      done: !!r.done,
      doneAt: r.done_at ? Number(r.done_at) : null,
      doneBy: r.done_by,
      witnessBy: r.witness_by,
      mediaId: r.media_id ? Number(r.media_id) : null,
      createdBy: r.created_by,
      createdAt: Number(r.created_at),
    };
  }

  on('GET', '/api/items', async (ctx) => {
    const rows = all('SELECT * FROM couple_items ORDER BY seq ASC, id ASC');
    const doneCount = rows.filter((r) => r.done).length;
    return {
      items: rows.map(serializeItem),
      total: rows.length,
      done: doneCount,
      /* 待对方确认：我做完但没人认领 */
      pending: rows.filter((r) => r.done && !r.witness_by).length,
    };
  });

  /* 一键把内置清单灌进去（只灌还没出现过的标题，重复点不会翻倍） */
  on('POST', '/api/items/seed', async (ctx) => {
    const me = whoOf(ctx, {});
    const tpl = TPL.templates();
    const have = new Set(all('SELECT title FROM couple_items').map((r) => r.title));
    let added = 0;
    for (const t of tpl) {
      if (have.has(t.title)) continue;
      run(
        'INSERT INTO couple_items(title, note, category, seq, done, created_by, created_at) VALUES (?, NULL, ?, ?, 0, ?, ?)',
        t.title, t.category, t.seq, me, Date.now()
      );
      added += 1;
    }
    return { added };
  });

  on('POST', '/api/items', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const title = str(body.title, 120).trim();
    if (!title) throw new HttpError(400, '写一件想一起做的事');
    const cat = ITEM_CATS.has(String(body.category)) ? String(body.category) : 'life';
    const maxSeq = Number(get('SELECT MAX(seq) m FROM couple_items').m || 0);
    const r = run(
      'INSERT INTO couple_items(title, note, category, seq, done, created_by, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      title, optStr(body.note, 500), cat, maxSeq + 1, me, Date.now()
    );
    return { id: r.id };
  });

  /* 标记做完（带凭证）或确认对方做完，都走这一个端点 */
  on('PATCH', '/api/items/:id', async (ctx) => {
    const me = whoOf(ctx, {});
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM couple_items WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这件事不在了');
    const body = await readJSON(ctx.req);

    if (body.undo) {
      if (row.media_id) deleteMediaOf('item', id);
      run('UPDATE couple_items SET done = 0, done_at = NULL, done_by = NULL, witness_by = NULL, media_id = NULL WHERE id = ?', id);
      return { ok: true };
    }

    if (body.witness) {
      if (!row.done) throw new HttpError(400, '对方还没标记做完');
      if (row.done_by === me) throw new HttpError(400, '这是你自己标记的，等对方确认');
      run('UPDATE couple_items SET witness_by = ? WHERE id = ?', me, id);
      return { ok: true };
    }

    if (body.done) {
      const mediaIds = Array.isArray(body.media) ? body.media : [];
      run(
        'UPDATE couple_items SET done = 1, done_at = ?, done_by = ?, note = ?, witness_by = NULL WHERE id = ?',
        Date.now(), me, body.note !== undefined ? optStr(body.note, 500) : row.note, id
      );
      if (mediaIds.length) {
        deleteMediaOf('item', id);
        attachUploads(mediaIds, 'item', id);
        const first = get("SELECT id FROM media WHERE owner_type = 'item' AND owner_id = ? ORDER BY id ASC LIMIT 1", id);
        if (first) run('UPDATE couple_items SET media_id = ? WHERE id = ?', first.id, id);
      }
      return { ok: true };
    }

    if (body.title !== undefined || body.note !== undefined || body.category !== undefined) {
      run(
        'UPDATE couple_items SET title = ?, note = ?, category = ? WHERE id = ?',
        body.title !== undefined ? (str(body.title, 120).trim() || row.title) : row.title,
        body.note !== undefined ? optStr(body.note, 500) : row.note,
        body.category !== undefined && ITEM_CATS.has(String(body.category)) ? String(body.category) : row.category,
        id
      );
      return { ok: true };
    }

    throw new HttpError(400, '没有要改的东西');
  });

  on('DELETE', '/api/items/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    deleteMediaOf('item', id);
    const r = run('DELETE FROM couple_items WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这件事不在了');
    return { ok: true };
  });

  /* ---- 爱情报告 ---- */

  /* 生成一期报告快照。范围按本地时间 [from, to) 的毫秒区间算。 */
  function buildReport(kind, period) {
    const now = Date.now();
    let from, to, label;
    if (kind === 'year') {
      const y = Number(period);
      from = new Date(y, 0, 1).getTime();
      to = new Date(y + 1, 0, 1).getTime();
      label = `${y} 年`;
    } else {
      const [y, m] = String(period).split('-').map(Number);
      from = new Date(y, m - 1, 1).getTime();
      to = new Date(y, m, 1).getTime();
      label = `${y} 年 ${m} 月`;
    }

    const inRange = (t) => Number(t) >= from && Number(t) < to;

    const posts = all('SELECT * FROM posts WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC', from, to);
    const byAuthor = { a: 0, b: 0 };
    const placeMap = new Map();
    for (const p of posts) {
      byAuthor[p.author] = (byAuthor[p.author] || 0) + 1;
      const loc = (p.location || '').trim();
      if (loc) placeMap.set(loc, (placeMap.get(loc) || 0) + 1);
    }
    const places = [...placeMap.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([name, n]) => ({ name, n }));

    const photos = Number(
      get(
        `SELECT COUNT(*) c FROM media WHERE owner_type = 'post' AND owner_id IN (
           SELECT id FROM posts WHERE created_at >= ? AND created_at < ?)`,
        from, to
      ).c || 0
    );

    const moods = all('SELECT * FROM moods WHERE date >= ? AND date < ?', isoOf(from), isoOf(to));
    const moodMap = {};
    for (const m of moods) moodMap[m.mood] = (moodMap[m.mood] || 0) + 1;

    const wishesDone = all(
      'SELECT * FROM wishes WHERE done = 1 AND done_at >= ? AND done_at < ?', from, to
    );
    const moviesDone = all(
      'SELECT * FROM movies WHERE status = ? AND finished_at >= ? AND finished_at < ?', 'done', from, to
    );
    const trips = all('SELECT * FROM trips WHERE start_date >= ? AND start_date < ?', isoOf(from), isoOf(to));
    const messages = Number(
      get('SELECT COUNT(*) c FROM messages WHERE created_at >= ? AND created_at < ?', from, to).c || 0
    );

    /* 挑一条当月有内容的答案来引用 */
    const dailies = all(
      'SELECT * FROM daily_questions WHERE date >= ? AND date < ? AND (answer_a IS NOT NULL OR answer_b IS NOT NULL) ORDER BY date DESC',
      isoOf(from), isoOf(to)
    );
    const quote = dailies.length
      ? {
          date: dailies[0].date,
          question: dailies[0].question,
          answerA: dailies[0].answer_a,
          answerB: dailies[0].answer_b,
        }
      : null;

    const s = allSettings();
    const startDate = D.isISO(s['couple.start_date']) ? s['couple.start_date'] : '';
    const firstDayOfPeriod = isoOf(from);
    const dayNo = startDate ? D.diffDays(firstDayOfPeriod, startDate) + 1 : null;

    return {
      kind,
      period,
      label,
      generatedAt: now,
      range: { from, to },
      togetherDays: startDate ? D.diffDays(D.today(), startDate) + 1 : null,
      dayNoAtStart: dayNo,
      posts: posts.length,
      postsBy: byAuthor,
      photos,
      messages,
      places,
      moods: moodMap,
      wishesDone: wishesDone.map((w) => ({ title: w.title, at: Number(w.done_at) })),
      moviesDone: moviesDone.map((m) => ({ title: m.title, rating: m.rating })),
      trips: trips.map((t) => ({ title: t.title, place: t.place, startDate: t.start_date })),
      quote,
      /* 亲密记录只给数量，且默认被前端遮住，点开才显示 */
      intimacy: Number(
        get("SELECT COUNT(*) c FROM intimacy WHERE date >= ? AND date < ?", isoOf(from), isoOf(to)).c || 0
      ),
    };
  }

  function isoOf(ms) {
    const d = new Date(Number(ms));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function reportRow(kind, period) {
    let row = get('SELECT * FROM reports WHERE period = ? AND kind = ?', period, kind);
    if (row) return row;
    const payload = buildReport(kind, period);
    run(
      'INSERT INTO reports(period, kind, payload, generated_at, created_at) VALUES (?, ?, ?, ?, ?)',
      period, kind, JSON.stringify(payload), Date.now(), Date.now()
    );
    return get('SELECT * FROM reports WHERE period = ? AND kind = ?', period, kind);
  }

  function serializeReport(row, me) {
    const payload = JSON.parse(row.payload);
    return {
      id: Number(row.id),
      period: row.period,
      kind: row.kind,
      payload,
      generatedAt: Number(row.generated_at),
      viewedByMe: !!(me === 'a' ? row.viewed_a_at : row.viewed_b_at),
      viewedBoth: !!(row.viewed_a_at && row.viewed_b_at),
    };
  }

  /* 当期（上个月 / 去年）。当月还没过完，不给报告。 */
  on('GET', '/api/report/latest', async (ctx) => {
    const me = whoOf(ctx, {});
    const t = new Date();
    const pm = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const period = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, '0')}`;
    const row = reportRow('month', period);
    const payload = JSON.parse(row.payload);
    /* 上月一条记录都没有就不硬造报告 */
    if (!payload.posts && !payload.photos && !payload.messages) {
      return { available: false, period, kind: 'month' };
    }
    return { available: true, ...serializeReport(row, me) };
  });

  on('GET', '/api/report/:period', async (ctx) => {
    const me = whoOf(ctx, {});
    const period = String(ctx.params.period || '');
    const kind = /^\d{4}$/.test(period) ? 'year' : 'month';
    if (kind === 'month' && !/^\d{4}-\d{2}$/.test(period)) throw new HttpError(400, '期间不对');
    const row = reportRow(kind, period);
    return serializeReport(row, me);
  });

  on('POST', '/api/report/:period/view', async (ctx) => {
    const me = whoOf(ctx, {});
    const period = String(ctx.params.period || '');
    const kind = /^\d{4}$/.test(period) ? 'year' : 'month';
    const row = get('SELECT * FROM reports WHERE period = ? AND kind = ?', period, kind);
    if (!row) throw new HttpError(404, '报告还没生成');
    run(
      `UPDATE reports SET ${me === 'a' ? 'viewed_a_at' : 'viewed_b_at'} = ? WHERE id = ?`,
      Date.now(), row.id
    );
    return { ok: true };
  });

  on('GET', '/api/report', async (ctx) => {
    const rows = all('SELECT period, kind, generated_at FROM reports ORDER BY generated_at DESC LIMIT 24');
    return { items: rows.map((r) => ({ period: r.period, kind: r.kind, generatedAt: Number(r.generated_at) })) };
  });

  /* ═══════════════════════════════════════════════════════════════
     v5 · F6 共同相册
     ═══════════════════════════════════════════════════════════════ */

  function serializeAlbum(row, mediaMap, itemCount) {
    const cover = row.cover_media_id
      ? get('SELECT filename FROM media WHERE id = ?', Number(row.cover_media_id))
      : null;
    const first = cover || get(
      "SELECT filename FROM media WHERE owner_type = 'album' AND owner_id = ? ORDER BY id ASC LIMIT 1",
      row.id
    );
    return {
      id: Number(row.id),
      title: row.title,
      note: row.note,
      kind: row.kind,
      year: row.year,
      createdBy: row.created_by,
      createdAt: Number(row.created_at),
      cover: first ? `/media/${first.filename}` : null,
      count: itemCount !== undefined ? itemCount : Number(
        get('SELECT COUNT(*) c FROM album_items WHERE album_id = ?', row.id).c || 0
      ),
    };
  }

  on('GET', '/api/albums', async () => {
    const rows = all('SELECT * FROM albums ORDER BY created_at DESC');
    const counts = new Map(
      all('SELECT album_id, COUNT(*) c FROM album_items GROUP BY album_id').map((r) => [r.album_id, Number(r.c)])
    );
    return { items: rows.map((r) => serializeAlbum(r, null, counts.get(r.id) || 0)) };
  });

  on('POST', '/api/albums', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const title = str(body.title, 60).trim();
    if (!title) throw new HttpError(400, '给相册起个名字');
    const year = /^\d{4}$/.test(String(body.year || '')) ? String(body.year) : null;
    const r = run(
      'INSERT INTO albums(title, note, cover_media_id, kind, year, created_by, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)',
      title, optStr(body.note, 500), optStr(body.kind, 20) || 'normal', year, me, Date.now()
    );
    const ids = Array.isArray(body.media) ? body.media : [];
    if (ids.length) {
      attachUploads(ids, 'album', r.id);
      addAlbumItems(r.id, ids, null, me);
    }
    return { id: r.id };
  });

  function addAlbumItems(albumId, mediaIds, caption, me) {
    const ids = mediaIds.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
    if (!ids.length) return 0;
    const maxSort = Number(get('SELECT MAX(sort) m FROM album_items WHERE album_id = ?', albumId).m || 0);
    let n = 0;
    ids.forEach((mid, i) => {
      const exists = get('SELECT id FROM album_items WHERE album_id = ? AND media_id = ?', albumId, mid);
      if (exists) return;
      run(
        'INSERT INTO album_items(album_id, media_id, caption, added_by, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        albumId, mid, caption || null, me, maxSort + i + 1, Date.now()
      );
      n += 1;
    });
    if (n) {
      const cover = get('SELECT cover_media_id FROM albums WHERE id = ?', albumId);
      if (cover && !cover.cover_media_id) {
        run('UPDATE albums SET cover_media_id = ? WHERE id = ?', ids[0], albumId);
      }
    }
    return n;
  }

  on('GET', '/api/albums/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM albums WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这本相册不在了');
    const items = all('SELECT * FROM album_items WHERE album_id = ? ORDER BY sort ASC, id ASC', id);
    const mediaMap = mediaRows('album', [id]);
    const byId = new Map();
    for (const list of mediaMap.values()) for (const m of list) byId.set(m.id, m);
    return {
      album: serializeAlbum(row, null, items.length),
      items: items
        .filter((it) => byId.has(Number(it.media_id)))
        .map((it) => ({
          id: Number(it.id),
          mediaId: Number(it.media_id),
          url: byId.get(Number(it.media_id)).url,
          w: byId.get(Number(it.media_id)).w,
          h: byId.get(Number(it.media_id)).h,
          caption: it.caption,
          addedBy: it.added_by,
          createdAt: Number(it.created_at),
        })),
    };
  });

  on('PATCH', '/api/albums/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM albums WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这本相册不在了');
    const body = await readJSON(ctx.req);
    run(
      'UPDATE albums SET title = ?, note = ?, cover_media_id = ? WHERE id = ?',
      body.title !== undefined ? (str(body.title, 60).trim() || row.title) : row.title,
      body.note !== undefined ? optStr(body.note, 500) : row.note,
      body.coverMediaId !== undefined ? num(body.coverMediaId, null) : row.cover_media_id,
      id
    );
    return { ok: true };
  });

  on('DELETE', '/api/albums/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    /* 只删相册自己的照片；同一张图若还挂在动态上，media 行是动态的，不受影响 */
    deleteMediaOf('album', id);
    run('DELETE FROM album_items WHERE album_id = ?', id);
    const r = run('DELETE FROM albums WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这本相册不在了');
    return { ok: true };
  });

  on('POST', '/api/albums/:id/items', async (ctx) => {
    const me = whoOf(ctx, {});
    const id = idParam(ctx.params.id);
    const album = get('SELECT * FROM albums WHERE id = ?', id);
    if (!album) throw new HttpError(404, '这本相册不在了');
    const body = await readJSON(ctx.req);
    const ids = Array.isArray(body.media) ? body.media : [];
    if (!ids.length) throw new HttpError(400, '选几张照片');
    attachUploads(ids, 'album', id);
    const added = addAlbumItems(id, ids, optStr(body.caption, 200), me);
    return { added };
  });

  on('DELETE', '/api/albums/:id/items/:itemId', async (ctx) => {
    const id = idParam(ctx.params.id);
    const itemId = idParam(ctx.params.itemId);
    const it = get('SELECT * FROM album_items WHERE id = ? AND album_id = ?', itemId, id);
    if (!it) throw new HttpError(404, '这张照片不在相册里');
    run('DELETE FROM album_items WHERE id = ?', itemId);
    const m = get('SELECT * FROM media WHERE id = ?', Number(it.media_id));
    if (m) {
      storage.removeImage(m.filename);
      run('DELETE FROM media WHERE id = ?', m.id);
    }
    const cover = get('SELECT cover_media_id FROM albums WHERE id = ?', id);
    if (cover && Number(cover.cover_media_id) === Number(it.media_id)) {
      const next = get('SELECT media_id FROM album_items WHERE album_id = ? ORDER BY sort ASC, id ASC LIMIT 1', id);
      run('UPDATE albums SET cover_media_id = ? WHERE id = ?', next ? next.media_id : null, id);
    }
    return { ok: true };
  });

  /* ═══════════════════════════════════════════════════════════════
     v5 · F7 冷静卡
     发起人说「先别聊了」，30 分钟后自动解锁。
     reason 默认只有发起人看得到。
     ═══════════════════════════════════════════════════════════════ */

  function serializeCool(row, me) {
    const endsAt = Number(row.started_at) + Number(row.minutes) * 60000;
    const mine = row.started_by === me;
    const privateReason = !!Number(row.reason_private) && !mine;
    return {
      id: Number(row.id),
      startedBy: row.started_by,
      startedAt: Number(row.started_at),
      minutes: Number(row.minutes),
      endsAt,
      leftMs: Math.max(0, endsAt - Date.now()),
      status: row.status,
      reason: privateReason ? null : row.reason,
      reasonHidden: privateReason,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at ? Number(row.resolved_at) : null,
      makeUpNote: row.make_up_note,
      mine,
    };
  }

  /* 到点了就把状态翻成 done，不用定时器：读的时候顺手结算 */
  function settleCool() {
    const now = Date.now();
    const rows = all("SELECT * FROM cool_cards WHERE status = 'cooling'");
    for (const r of rows) {
      if (now >= Number(r.started_at) + Number(r.minutes) * 60000) {
        run("UPDATE cool_cards SET status = 'done', resolved_at = ? WHERE id = ?", now, r.id);
      }
    }
  }

  on('GET', '/api/cool', async (ctx) => {
    const me = whoOf(ctx, {});
    settleCool();
    const cur = get("SELECT * FROM cool_cards WHERE status = 'cooling' ORDER BY started_at DESC LIMIT 1");
    const hist = all("SELECT * FROM cool_cards WHERE status != 'cooling' ORDER BY started_at DESC LIMIT 20");
    const doneCount = Number(get("SELECT COUNT(*) c FROM cool_cards WHERE status = 'done'").c || 0);
    return {
      current: cur ? serializeCool(cur, me) : null,
      history: hist.map((r) => serializeCool(r, me)),
      stats: { total: Number(get('SELECT COUNT(*) c FROM cool_cards').c || 0), done: doneCount },
    };
  });

  on('POST', '/api/cool', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    settleCool();
    const running = get("SELECT * FROM cool_cards WHERE status = 'cooling' LIMIT 1");
    if (running) throw new HttpError(400, '已经有一张在冷却中');
    const minutes = Math.min(180, Math.max(5, Math.round(num(body.minutes, 30))));
    const r = run(
      'INSERT INTO cool_cards(started_by, started_at, minutes, reason, reason_private, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      me, Date.now(), minutes, optStr(body.reason, 300), body.private === false ? 0 : 1, 'cooling', Date.now()
    );
    return { id: r.id, endsAt: Date.now() + minutes * 60000 };
  });

  on('POST', '/api/cool/:id/end', async (ctx) => {
    const me = whoOf(ctx, {});
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM cool_cards WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这张卡不在了');
    if (row.status !== 'cooling') throw new HttpError(400, '已经结束了');
    const body = await readJSON(ctx.req);
    run(
      "UPDATE cool_cards SET status = 'done', resolved_by = ?, resolved_at = ?, make_up_note = ? WHERE id = ?",
      me, Date.now(), optStr(body.note, 300), id
    );
    return { ok: true };
  });

  on('DELETE', '/api/cool/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM cool_cards WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这张卡不在了');
    if (row.status === 'cooling') throw new HttpError(400, '还在冷却，等它走完');
    run('DELETE FROM cool_cards WHERE id = ?', id);
    return { ok: true };
  });

  /* ═══════════════════════════════════════════════════════════════
     v5 · F8 情侣树
     exp 全部由已有行为推导，不做签到强迫；浇水只是每天一次的小加成。
     ═══════════════════════════════════════════════════════════════ */

  const TREE_STAGES = [
    { at: 0, name: '种子', desc: '还没发芽' },
    { at: 40, name: '发芽', desc: '冒出来一点绿' },
    { at: 150, name: '小树', desc: '有模有样了' },
    { at: 400, name: '长大', desc: '能遮一点太阳' },
    { at: 900, name: '开花', desc: '满树都是' },
    { at: 1800, name: '结果', desc: '结了一树的果子' },
  ];

  function treeCounts() {
    const stats = buildStats();
    const moodN = Number(get('SELECT COUNT(*) c FROM moods').c || 0);
    const quizBoth = Number(
      get('SELECT COUNT(*) c FROM (SELECT quiz_id FROM quiz_answers GROUP BY quiz_id HAVING COUNT(*) >= 2)').c || 0
    );
    const itemsDone = Number(
      get('SELECT COUNT(*) c FROM couple_items WHERE done = 1 AND witness_by IS NOT NULL').c || 0
    );
    /* 相册里的照片也算「照片」，不然建了相册树不长 */
    const photosAll = Number(
      get("SELECT COUNT(*) c FROM media WHERE owner_type IN ('post', 'album')").c || 0
    );
    return { stats, moodN, quizBoth, itemsDone, photosAll };
  }

  function treeSnapshot() {
    const { stats, moodN, quizBoth, itemsDone, photosAll } = treeCounts();
    const albums = Number(get('SELECT COUNT(*) c FROM albums').c || 0);
    const events = Number(get('SELECT COUNT(*) c FROM events').c || 0);
    const draws = Number(get('SELECT COUNT(*) c FROM draws').c || 0);
    const resolved = Number(get("SELECT COUNT(*) c FROM cool_cards WHERE status = 'done'").c || 0);
    const waterDays = Number(get('SELECT COUNT(*) c FROM tree_log WHERE source = ?', 'water').c || 0);
    /* v6：每日小事 / 记账 / 歌单 也让它长大 */
    const chDone = Number(
      get('SELECT COUNT(*) c FROM (SELECT challenge_id FROM challenge_done GROUP BY challenge_id HAVING COUNT(*) >= 2)').c || 0
    );
    const fundN = Number(get('SELECT COUNT(*) c FROM fund_tx').c || 0);
    const songN = Number(get('SELECT COUNT(*) c FROM songs').c || 0);
    const c = stats.counts;

    const exp =
      (stats.togetherDays || 0) * 1 +
      c.posts * 2 +
      photosAll * 1 +
      c.messages * 1 +
      c.wishesDone * 5 +
      c.trips * 10 +
      c.moviesDone * 3 +
      c.capsules * 4 +
      moodN * 2 +
      quizBoth * 4 +
      itemsDone * 6 +
      albums * 8 +
      events * 3 +
      draws * 1 +
      resolved * 12 +
      waterDays * 3 +
      chDone * 7 +
      fundN * 2 +
      songN * 2;

    let stage = 0;
    for (let i = TREE_STAGES.length - 1; i >= 0; i--) {
      if (exp >= TREE_STAGES[i].at) { stage = i; break; }
    }
    const next = TREE_STAGES[stage + 1] || null;
    const from = TREE_STAGES[stage].at;
    const pct = next ? Math.min(1, (exp - from) / (next.at - from)) : 1;

    const todayStr = D.today();
    const state = get('SELECT * FROM tree_state WHERE id = 1');
    const wateredToday = !!(state && state.water_date === todayStr);

    return {
      exp,
      stage,
      stageName: TREE_STAGES[stage].name,
      stageDesc: TREE_STAGES[stage].desc,
      stages: TREE_STAGES,
      next: next ? { name: next.name, at: next.at } : null,
      toNext: next ? Math.max(0, next.at - exp) : 0,
      pct,
      wateredToday,
      waterDays,
      togetherDays: stats.togetherDays || 0,
      counts: {
        albums, events, draws, resolved, quizBoth, itemsDone, moods: moodN,
        posts: c.posts, photos: photosAll, messages: c.messages, wishesDone: c.wishesDone,
        trips: c.trips, moviesDone: c.moviesDone, capsules: c.capsules,
        challenges: chDone, fundTx: fundN, songs: songN,
      },
    };
  }

  on('GET', '/api/tree', async (ctx) => {
    const snap = treeSnapshot();
    const log = all('SELECT * FROM tree_log ORDER BY created_at DESC LIMIT 12');
    return {
      ...snap,
      log: log.map((r) => ({ id: Number(r.id), date: r.date, source: r.source, exp: Number(r.exp), author: r.author })),
    };
  });

  on('POST', '/api/tree/water', async (ctx) => {
    const me = whoOf(ctx, {});
    const todayStr = D.today();
    const state = get('SELECT * FROM tree_state WHERE id = 1');
    if (state && state.water_date === todayStr) throw new HttpError(400, '今天已经浇过了，明天再来');
    run(
      `INSERT INTO tree_state(id, stage, exp, water_date, last_calc_date, updated_at) VALUES (1, 0, 0, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET water_date = excluded.water_date, updated_at = excluded.updated_at`,
      todayStr, todayStr, Date.now()
    );
    run(
      'INSERT INTO tree_log(date, source, exp, author, created_at) VALUES (?, ?, ?, ?, ?)',
      todayStr, 'water', 3, me, Date.now()
    );
    return treeSnapshot();
  });

  /* ═══════════════════════════════════════════════════════════════
     v5 · F10 抽签
     ═══════════════════════════════════════════════════════════════ */

  const DRAW_POOLS = [
    { name: '吃什么', items: ['火锅', '烤肉', '日料', '炒菜', '面', '饺子', '披萨', '汉堡', '麻辣烫', '米线', '咖喱', '随便'] },
    { name: '去哪玩', items: ['看电影', '逛公园', '在家躺', '压马路', '逛超市', '爬山', '图书馆', '周边一日游'] },
    { name: '谁做家务', items: ['你', '我'] },
    { name: '周末怎么过', items: ['睡到自然醒', '出门吃好的', '在家做饭', '收拾屋子', '见朋友', '什么都不干'] },
  ];

  on('GET', '/api/draws', async () => {
    const rows = all('SELECT * FROM draws ORDER BY created_at DESC LIMIT 30');
    return {
      pools: DRAW_POOLS,
      items: rows.map((r) => ({
        id: Number(r.id),
        poolName: r.pool_name,
        pool: JSON.parse(r.pool),
        result: r.result,
        mode: r.mode,
        drawnBy: r.drawn_by,
        createdAt: Number(r.created_at),
      })),
    };
  });

  on('POST', '/api/draws', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    let pool = Array.isArray(body.pool) ? body.pool.map((x) => str(x, 40).trim()).filter(Boolean).slice(0, 40) : [];
    if (!pool.length) throw new HttpError(400, '先写几个选项');
    const mode = ['spin', 'coin', 'lot'].includes(String(body.mode)) ? String(body.mode) : 'spin';
    const result = pool[Math.floor(Math.random() * pool.length)];
    const r = run(
      'INSERT INTO draws(pool_name, pool, result, mode, drawn_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      optStr(body.poolName, 40), JSON.stringify(pool), result, mode, me, Date.now()
    );
    /* 只留最近 30 条 */
    run('DELETE FROM draws WHERE id NOT IN (SELECT id FROM draws ORDER BY created_at DESC LIMIT 30)');
    return { id: r.id, result, mode };
  });

  on('DELETE', '/api/draws/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const r = run('DELETE FROM draws WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这条记录不在了');
    return { ok: true };
  });

  /* ═══════════════════════════════════════════════════════════════
     v5 · F11 共享日历
     surprise=1 时，对方只看得到「这天有事」，看不到标题。
     ═══════════════════════════════════════════════════════════════ */

  const EVENT_KINDS = new Set(['date', 'trip', 'work', 'other']);

  function serializeEvent(row, me) {
    const hidden = !!Number(row.surprise) && row.created_by !== me;
    return {
      id: Number(row.id),
      title: hidden ? '这天有事' : row.title,
      hidden,
      date: row.date,
      endDate: row.end_date,
      time: row.time,
      place: hidden ? null : row.place,
      who: row.who,
      kind: row.kind,
      note: hidden ? null : row.note,
      surprise: !!Number(row.surprise),
      done: !!Number(row.done),
      createdBy: row.created_by,
      createdAt: Number(row.created_at),
    };
  }

  function upcomingEvents(days) {
    const from = D.today();
    const to = D.addDays(from, days);
    const rows = all(
      'SELECT * FROM events WHERE date >= ? AND date <= ? ORDER BY date ASC, time ASC LIMIT 20', from, to
    );
    return rows.map((r) => ({ id: Number(r.id), title: Number(r.surprise) ? '这天有事' : r.title, date: r.date, time: r.time, kind: r.kind, who: r.who }));
  }

  on('GET', '/api/events', async (ctx) => {
    const me = whoOf(ctx, {});
    const month = /^\d{4}-\d{2}$/.test(String(ctx.query.month || '')) ? String(ctx.query.month) : D.today().slice(0, 7);
    const rows = all(
      'SELECT * FROM events WHERE substr(date, 1, 7) = ? OR substr(COALESCE(end_date, date), 1, 7) = ? ORDER BY date ASC, time ASC',
      month, month
    );
    const all7 = all('SELECT date, who FROM events WHERE date >= ? AND date <= ?', D.today(), D.addDays(D.today(), 40));
    const dots = {};
    for (const r of all7) {
      if (!dots[r.date]) dots[r.date] = [];
      if (!dots[r.date].includes(r.who)) dots[r.date].push(r.who);
    }
    return {
      month,
      items: rows.map((r) => serializeEvent(r, me)),
      dots,
      upcoming: upcomingEvents(7),
      today: D.today(),
    };
  });

  on('POST', '/api/events', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const title = str(body.title, 80).trim();
    if (!title) throw new HttpError(400, '写点什么');
    const date = requireDate(body.date, '日期');
    const endDate = isoOr(body.endDate, null);
    const time = /^\d{2}:\d{2}$/.test(String(body.time || '')) ? String(body.time) : null;
    const who = ['a', 'b', 'both'].includes(String(body.who)) ? String(body.who) : 'both';
    const kind = EVENT_KINDS.has(String(body.kind)) ? String(body.kind) : 'date';
    const r = run(
      `INSERT INTO events(title, date, end_date, time, place, who, kind, note, surprise, done, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      title, date, endDate, time, optStr(body.place, 80), who, kind, optStr(body.note, 500),
      body.surprise ? 1 : 0, me, Date.now()
    );
    return { id: r.id };
  });

  on('PATCH', '/api/events/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM events WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这个安排不在了');
    const body = await readJSON(ctx.req);
    if (body.done !== undefined) {
      run('UPDATE events SET done = ? WHERE id = ?', bool(body.done) ? 1 : 0, id);
      return { ok: true };
    }
    run(
      `UPDATE events SET title = ?, date = ?, end_date = ?, time = ?, place = ?, who = ?, kind = ?, note = ?, surprise = ? WHERE id = ?`,
      body.title !== undefined ? (str(body.title, 80).trim() || row.title) : row.title,
      body.date !== undefined ? requireDate(body.date, '日期') : row.date,
      body.endDate !== undefined ? isoOr(body.endDate, null) : row.end_date,
      body.time !== undefined ? (/^\d{2}:\d{2}$/.test(String(body.time || '')) ? String(body.time) : null) : row.time,
      body.place !== undefined ? optStr(body.place, 80) : row.place,
      body.who !== undefined && ['a', 'b', 'both'].includes(String(body.who)) ? String(body.who) : row.who,
      body.kind !== undefined && EVENT_KINDS.has(String(body.kind)) ? String(body.kind) : row.kind,
      body.note !== undefined ? optStr(body.note, 500) : row.note,
      body.surprise !== undefined ? (bool(body.surprise) ? 1 : 0) : row.surprise,
      id
    );
    return { ok: true };
  });

  on('DELETE', '/api/events/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const r = run('DELETE FROM events WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这个安排不在了');
    return { ok: true };
  });

  /* ═══════════════════════════════════════════════════════════════
     v5 · F12 成就徽章
     ═══════════════════════════════════════════════════════════════ */

  function checkBadges() {
    const { stats, moodN, quizBoth, itemsDone } = treeCounts();
    const snap = treeSnapshot();
    const extra = {
      moods: moodN,
      quizBoth,
      itemsDone,
      albums: snap.counts.albums,
      events: snap.counts.events,
      draws: snap.counts.draws,
      resolved: snap.counts.resolved,
      treeStage: snap.stage,
      /* v6：今天的小事 / 恋爱基金 / 我们的歌 */
      challenges: Number(
        get("SELECT COUNT(*) c FROM challenges WHERE EXISTS (SELECT 1 FROM challenge_done d WHERE d.challenge_id = challenges.id AND (SELECT COUNT(*) FROM challenge_done x WHERE x.challenge_id = challenges.id) >= 2)").c || 0
      ),
      challengeStreak: Number((get('SELECT current FROM streak_state WHERE id = 1') || {}).current || 0),
      fundTx: Number(get('SELECT COUNT(*) c FROM fund_tx').c || 0),
      fundGoalsDone: Number(
        get(
          `SELECT COUNT(*) c FROM fund_goals g WHERE
             (SELECT COALESCE(SUM(CASE kind WHEN 'in' THEN amount_cents WHEN 'out' THEN -amount_cents ELSE 0 END), 0)
              FROM fund_tx WHERE goal_id = g.id) >= g.target_cents`
        ).c || 0
      ),
      songs: Number(get('SELECT COUNT(*) c FROM songs').c || 0),
    };
    const unlocked = new Map(all('SELECT * FROM achievements').map((r) => [r.key, r]));
    const fresh = [];
    for (const b of BADGES) {
      if (unlocked.has(b.key)) continue;
      let ok = false;
      try { ok = !!b.check(stats, extra); } catch { ok = false; }
      if (!ok) continue;
      run(
        'INSERT INTO achievements(key, title, detail, icon, unlocked_at, seen, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        b.key, b.title, b.detail || '', b.icon || '🏅', Date.now(), Date.now()
      );
      fresh.push(b.key);
    }
    return { stats, extra, fresh, unlocked };
  }

  on('GET', '/api/badges', async (ctx) => {
    const { fresh, unlocked } = checkBadges();
    const items = BADGES.map((b) => {
      const u = unlocked.get(b.key);
      return {
        key: b.key,
        title: b.title,
        detail: b.detail,
        icon: b.icon,
        unlocked: !!u,
        unlockedAt: u ? Number(u.unlocked_at) : null,
        seen: u ? !!Number(u.seen) : false,
      };
    });
    const doneList = items.filter((i) => i.unlocked).sort((x, y) => (y.unlockedAt || 0) - (x.unlockedAt || 0));
    const lockedList = items.filter((i) => !i.unlocked);
    return {
      items: [...doneList, ...lockedList],
      unlocked: doneList.length,
      total: items.length,
      fresh: items.filter((i) => i.unlocked && !i.seen).map((i) => i.key),
    };
  });

  on('POST', '/api/badges/seen', async (ctx) => {
    const body = await readJSON(ctx.req);
    const keys = Array.isArray(body.keys) ? body.keys.map((k) => str(k, 40)) : [];
    if (!keys.length) {
      run('UPDATE achievements SET seen = 1 WHERE seen = 0');
    } else {
      for (const k of keys) run('UPDATE achievements SET seen = 1 WHERE key = ?', k);
    }
    return { ok: true };
  });

  /* ═══════════════════════════════════════════════════════════════
     v6 · F3 情侣任务 · 每日挑战
     不做付费补签、不做断签惩罚：断了只显示「今天继续」。
     每月自动送 2 次豁免，用完了也不扣任何东西。
     ═══════════════════════════════════════════════════════════════ */

  const CHALLENGE_KIND = new Set(['act', 'say', 'photo', 'touch']);

  /* 题库：按天取模，同一天两人同一题 */
  const CHALLENGE_BANK = [
    { t: '给对方拍一张今天的天空', k: 'photo' },
    { t: '说三件今天感谢对方的事', k: 'say' },
    { t: '一起听完一首歌', k: 'act' },
    { t: '给对方发一条 30 秒的语音', k: 'say' },
    { t: '翻出一张以前的合照，说说那天', k: 'photo' },
    { t: '今天不刷手机，聊十分钟', k: 'act' },
    { t: '夸对方三个具体的点', k: 'say' },
    { t: '给对方带一样爱吃的东西', k: 'act' },
    { t: '一起下楼走一圈', k: 'act' },
    { t: '拍一张你们俩的合照', k: 'photo' },
    { t: '说一件你一直没说出口的小事', k: 'say' },
    { t: '一起做一顿饭，哪怕只是煮面', k: 'act' },
    { t: '把手机里最舍不得删的一张图给对方看', k: 'photo' },
    { t: '问对方一个你还没问过的问题', k: 'say' },
    { t: '今天出门前抱一下', k: 'touch' },
    { t: '一起把一件拖着的小事做完', k: 'act' },
    { t: '给对方写一句话，存在这里', k: 'say' },
    { t: '一起看一集剧，中途不许看手机', k: 'act' },
    { t: '拍下对方今天最好看的样子', k: 'photo' },
    { t: '睡前说一句「今天也谢谢你」', k: 'say' },
    { t: '一起列一件下次想做的事', k: 'act' },
    { t: '给对方揉五分钟肩', k: 'touch' },
    { t: '把今天的天气拍下来发给对方', k: 'photo' },
    { t: '说一件你希望对方多做的事', k: 'say' },
    { t: '一起把房间收拾十分钟', k: 'act' },
    { t: '找到你们第一张合照，一起看', k: 'photo' },
    { t: '今天叫对方一次只有你们知道的外号', k: 'say' },
    { t: '一起定一个下个月的小计划', k: 'act' },
    { t: '给对方倒一杯水', k: 'act' },
    { t: '说一句你今天最想说的话', k: 'say' },
  ];

  function challengeFor(dateISO) {
    const n = D.diffDays(dateISO, '2020-01-01');
    const pick = CHALLENGE_BANK[((n % CHALLENGE_BANK.length) + CHALLENGE_BANK.length) % CHALLENGE_BANK.length];
    return pick;
  }

  function ensureChallenge(dateISO) {
    let row = get('SELECT * FROM challenges WHERE date = ?', dateISO);
    if (row) return row;
    const pick = challengeFor(dateISO);
    run(
      'INSERT INTO challenges(date, title, detail, kind, points, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      dateISO, pick.t, pick.d || null, pick.k, 1, Date.now()
    );
    return get('SELECT * FROM challenges WHERE date = ?', dateISO);
  }

  function streakState() {
    let s = get('SELECT * FROM streak_state WHERE id = 1');
    if (!s) {
      run(
        'INSERT INTO streak_state(id, current, best, last_date, grace_left, grace_month, updated_at) VALUES (1, 0, 0, NULL, 2, ?, ?)',
        D.today().slice(0, 7), Date.now()
      );
      s = get('SELECT * FROM streak_state WHERE id = 1');
    }
    /* 月初把豁免补回 2 次 */
    const month = D.today().slice(0, 7);
    if (s.grace_month !== month) {
      run('UPDATE streak_state SET grace_left = 2, grace_month = ?, updated_at = ? WHERE id = 1', month, Date.now());
      s = get('SELECT * FROM streak_state WHERE id = 1');
    }
    return s;
  }

  function challengePayload(me) {
    const todayStr = D.today();
    const row = ensureChallenge(todayStr);
    const doneRows = all('SELECT * FROM challenge_done WHERE challenge_id = ?', row.id);
    const mine = doneRows.find((r) => r.author === me) || null;
    const theirs = doneRows.find((r) => r.author !== me) || null;
    const st = streakState();

    /* 昨天有没有接上：用来决定显示「连续 N 天」还是「今天继续」 */
    const yesterday = D.addDays(todayStr, -1);
    const yRow = get('SELECT * FROM challenges WHERE date = ?', yesterday);
    const yDone = yRow
      ? Number(get('SELECT COUNT(*) c FROM challenge_done WHERE challenge_id = ?', yRow.id).c || 0)
      : 0;

    const media = mine && mine.media_id ? get('SELECT * FROM media WHERE id = ?', mine.media_id) : null;
    const theirMedia = theirs && theirs.media_id ? get('SELECT * FROM media WHERE id = ?', theirs.media_id) : null;

    return {
      id: Number(row.id),
      date: row.date,
      title: row.title,
      detail: row.detail,
      kind: row.kind,
      points: Number(row.points),
      mine: mine ? { note: mine.note, url: media ? `/media/${media.filename}` : null, at: Number(mine.created_at) } : null,
      theirs: theirs
        ? { note: theirs.note, url: theirMedia ? `/media/${theirMedia.filename}` : null, at: Number(theirs.created_at) }
        : null,
      both: !!mine && !!theirs,
      streak: Number(st.current),
      best: Number(st.best),
      graceLeft: Number(st.grace_left),
      yesterdayDone: yDone >= 2,
    };
  }

  /* 双方都完成时推进 streak（幂等：只有 last_date 不是今天才 +1） */
  function bumpStreak(dateISO) {
    const st = streakState();
    if (st.last_date === dateISO) return st;
    const yesterday = D.addDays(dateISO, -1);
    let cur = Number(st.current);
    if (st.last_date === yesterday) cur += 1;
    else if (st.last_date) {
      /* 断了：不惩罚，只是从 1 重新数 */
      cur = 1;
    } else {
      cur = 1;
    }
    const best = Math.max(Number(st.best), cur);
    run('UPDATE streak_state SET current = ?, best = ?, last_date = ?, updated_at = ? WHERE id = 1', cur, best, dateISO, Date.now());
    return get('SELECT * FROM streak_state WHERE id = 1');
  }

  on('GET', '/api/challenge/today', async (ctx) => {
    const me = whoOf(ctx, {});
    return challengePayload(me);
  });

  on('POST', '/api/challenge/done', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const todayStr = D.today();
    const row = ensureChallenge(todayStr);
    const existing = get('SELECT * FROM challenge_done WHERE challenge_id = ? AND author = ?', row.id, me);
    const mediaIds = Array.isArray(body.media) ? body.media.map(Number).filter(Boolean).slice(0, 1) : [];
    let mediaId = mediaIds.length ? mediaIds[0] : null;
    if (mediaId) {
      const m = get('SELECT * FROM media WHERE id = ?', mediaId);
      if (!m) mediaId = null;
      else run("UPDATE media SET owner_type = 'challenge', owner_id = ? WHERE id = ?", row.id, mediaId);
    }

    if (existing) {
      run(
        'UPDATE challenge_done SET note = ?, media_id = COALESCE(?, media_id) WHERE id = ?',
        optStr(body.note, 300), mediaId, existing.id
      );
    } else {
      run(
        'INSERT INTO challenge_done(challenge_id, author, note, media_id, created_at) VALUES (?, ?, ?, ?, ?)',
        row.id, me, optStr(body.note, 300), mediaId, Date.now()
      );
    }

    const cnt = Number(get('SELECT COUNT(*) c FROM challenge_done WHERE challenge_id = ?', row.id).c || 0);
    if (cnt >= 2) bumpStreak(todayStr);

    return challengePayload(me);
  });

  on('POST', '/api/challenge/undo', async (ctx) => {
    const me = whoOf(ctx, {});
    const row = ensureChallenge(D.today());
    run('DELETE FROM challenge_done WHERE challenge_id = ? AND author = ?', row.id, me);
    return challengePayload(me);
  });

  on('GET', '/api/challenge/history', async () => {
    const rows = all(
      `SELECT c.*, (SELECT COUNT(*) FROM challenge_done d WHERE d.challenge_id = c.id) AS done_n
       FROM challenges c ORDER BY c.date DESC LIMIT 40`
    );
    const st = streakState();
    return {
      streak: Number(st.current),
      best: Number(st.best),
      graceLeft: Number(st.grace_left),
      items: rows.map((r) => ({
        date: r.date, title: r.title, kind: r.kind, done: Number(r.done_n) >= 2, doneN: Number(r.done_n),
      })),
    };
  });

  /* ═══════════════════════════════════════════════════════════════
     v6 · F4 恋爱基金
     纯记账，不接支付。任一方都能单方结算 / 全量导出。
     金额一律用「分」存整数。
     ═══════════════════════════════════════════════════════════════ */

  const FUND_CATS = ['吃饭', '礼物', '旅行', '房租', '存钱', '其他'];

  function centsOf(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(Math.abs(n));
  }

  function fundSummary(me) {
    const goals = all('SELECT * FROM fund_goals ORDER BY achieved_at IS NOT NULL, created_at DESC');
    const txs = all('SELECT * FROM fund_tx ORDER BY date DESC, id DESC');

    let inSum = 0;
    let outSum = 0;
    const byGoal = new Map();
    for (const t of txs) {
      const amt = Number(t.amount_cents);
      if (t.kind === 'in') inSum += amt;
      else if (t.kind === 'out') outSum += amt;
      /* 目标进度：存进去算加，为目标花掉算减 */
      if (t.goal_id) {
        const k = Number(t.goal_id);
        const delta = t.kind === 'in' ? amt : t.kind === 'out' ? -amt : 0;
        byGoal.set(k, (byGoal.get(k) || 0) + delta);
      }
    }

    /* 净额：我替对方垫的 - 对方替我垫的，各算一半 */
    const other = me === 'a' ? 'b' : 'a';
    let paidByMe = 0;
    let paidByOther = 0;
    for (const t of txs) {
      if (t.kind !== 'out' || Number(t.settled)) continue;
      const half = Math.round(Number(t.amount_cents) / 2);
      if (t.author === me) paidByMe += half;
      else if (t.author === other) paidByOther += half;
    }

    const month = D.today().slice(0, 7);
    let monthOut = 0;
    for (const t of txs) {
      if (t.kind === 'out' && String(t.date).slice(0, 7) === month) monthOut += Number(t.amount_cents);
    }

    return {
      goals: goals.map((g) => ({
        id: Number(g.id),
        title: g.title,
        targetCents: Number(g.target_cents),
        savedCents: byGoal.get(Number(g.id)) || 0,
        dueDate: g.due_date,
        emoji: g.emoji,
        achievedAt: g.achieved_at ? Number(g.achieved_at) : null,
      })),
      items: txs.slice(0, 200).map((t) => ({
        id: Number(t.id),
        date: t.date,
        kind: t.kind,
        amountCents: Number(t.amount_cents),
        title: t.title,
        category: t.category,
        goalId: t.goal_id ? Number(t.goal_id) : null,
        author: t.author,
        settled: !!Number(t.settled),
        note: t.note,
      })),
      cats: FUND_CATS,
      stats: {
        inCents: inSum,
        outCents: outSum,
        monthOutCents: monthOut,
        netCents: paidByMe - paidByOther, /* 正数 = 对方欠我 */
        settleCount: txs.filter((t) => t.kind === 'out' && !Number(t.settled)).length,
      },
    };
  }

  on('GET', '/api/fund', async (ctx) => {
    const me = whoOf(ctx, {});
    return fundSummary(me);
  });

  on('POST', '/api/fund/goals', async (ctx) => {
    const body = await readJSON(ctx.req);
    const title = str(body.title, 40).trim();
    if (!title) throw new HttpError(400, '给这个目标起个名字');
    const target = centsOf(body.targetCents || Number(body.target) * 100);
    if (target <= 0) throw new HttpError(400, '定一个金额');
    const r = run(
      'INSERT INTO fund_goals(title, target_cents, due_date, emoji, achieved_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
      title, target, isoOr(body.dueDate, null), str(body.emoji, 8) || '✈️', Date.now()
    );
    return { id: r.id };
  });

  on('DELETE', '/api/fund/goals/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const r = run('DELETE FROM fund_goals WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这个目标不在了');
    return { ok: true };
  });

  on('POST', '/api/fund/tx', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const title = str(body.title, 60).trim();
    if (!title) throw new HttpError(400, '写点什么');
    const amount = centsOf(body.amountCents || Number(body.amount) * 100);
    if (amount <= 0) throw new HttpError(400, '金额要大于 0');
    const kind = ['in', 'out', 'adj'].includes(String(body.kind)) ? String(body.kind) : 'out';
    const who = ['a', 'b'].includes(String(body.author)) ? String(body.author) : me;
    const r = run(
      `INSERT INTO fund_tx(date, kind, amount_cents, title, category, goal_id, author, settled, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      requireDate(body.date || D.today(), '日期'), kind, amount, title,
      FUND_CATS.includes(String(body.category)) ? String(body.category) : '其他',
      body.goalId ? Number(body.goalId) : null, who, optStr(body.note, 300), Date.now()
    );
    return { id: r.id };
  });

  on('DELETE', '/api/fund/tx/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const r = run('DELETE FROM fund_tx WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这条账不在了');
    return { ok: true };
  });

  /* 单方结算：任一方都能点，不需要对方同意 */
  on('POST', '/api/fund/settle', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const upto = isoOr(body.upto, null);
    if (upto) run("UPDATE fund_tx SET settled = 1 WHERE kind = 'out' AND settled = 0 AND date <= ?", upto);
    else run("UPDATE fund_tx SET settled = 1 WHERE kind = 'out' AND settled = 0");
    return fundSummary(me);
  });

  /* ═══════════════════════════════════════════════════════════════
     v6 · F9 共同歌单（只存元数据，不播音乐）
     url 必须 http(s)，挡住 javascript: 之类
     ═══════════════════════════════════════════════════════════════ */

  function safeUrl(v) {
    const s = str(v, 500).trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) return null;
    return s;
  }

  function serializeSong(r) {
    return {
      id: Number(r.id),
      title: r.title,
      artist: r.artist,
      url: r.url,
      note: r.note,
      addedBy: r.added_by,
      pinned: !!Number(r.pinned),
      playedCount: Number(r.played_count),
      createdAt: Number(r.created_at),
    };
  }

  on('GET', '/api/songs', async () => {
    const rows = all('SELECT * FROM songs ORDER BY pinned DESC, created_at DESC');
    return { items: rows.map(serializeSong) };
  });

  on('POST', '/api/songs', async (ctx) => {
    const me = whoOf(ctx, {});
    const body = await readJSON(ctx.req);
    const title = str(body.title, 80).trim();
    if (!title) throw new HttpError(400, '歌名总要写吧');
    const r = run(
      'INSERT INTO songs(title, artist, url, note, added_by, pinned, played_count, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      title, optStr(body.artist, 60), safeUrl(body.url), optStr(body.note, 200), me, body.pinned ? 1 : 0, Date.now()
    );
    return { id: r.id };
  });

  on('PATCH', '/api/songs/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const row = get('SELECT * FROM songs WHERE id = ?', id);
    if (!row) throw new HttpError(404, '这首歌不在了');
    const body = await readJSON(ctx.req);
    if (body.pin !== undefined) {
      run('UPDATE songs SET pinned = ? WHERE id = ?', bool(body.pin) ? 1 : 0, id);
      return { ok: true };
    }
    if (body.play !== undefined) {
      run('UPDATE songs SET played_count = played_count + 1 WHERE id = ?', id);
      return { ok: true };
    }
    run(
      'UPDATE songs SET title = ?, artist = ?, url = ?, note = ? WHERE id = ?',
      body.title !== undefined ? (str(body.title, 80).trim() || row.title) : row.title,
      body.artist !== undefined ? optStr(body.artist, 60) : row.artist,
      body.url !== undefined ? safeUrl(body.url) : row.url,
      body.note !== undefined ? optStr(body.note, 200) : row.note,
      id
    );
    return { ok: true };
  });

  on('DELETE', '/api/songs/:id', async (ctx) => {
    const id = idParam(ctx.params.id);
    const r = run('DELETE FROM songs WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, '这首歌不在了');
    return { ok: true };
  });

  return { routes };
}

module.exports = { createApi, buildStats };

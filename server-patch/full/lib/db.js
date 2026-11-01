'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.NEST_DATA || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'nest.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

const SCHEMA_VERSION = 7;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  who        TEXT NOT NULL DEFAULT 'a',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ua         TEXT,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author     TEXT NOT NULL DEFAULT 'a',
  content    TEXT NOT NULL DEFAULT '',
  mood       TEXT,
  weather    TEXT,
  location   TEXT,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

CREATE TABLE IF NOT EXISTS post_reactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  author     TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'heart',
  created_at INTEGER NOT NULL,
  UNIQUE(post_id, author)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  author     TEXT NOT NULL DEFAULT 'a',
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id);

CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL,
  owner_id   INTEGER NOT NULL DEFAULT 0,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  width      INTEGER,
  height     INTEGER,
  duration   INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS cycle_periods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL UNIQUE,
  end_date   TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cycle_start ON cycle_periods(start_date DESC);

CREATE TABLE IF NOT EXISTS cycle_days (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL UNIQUE,
  flow       TEXT,
  symptoms   TEXT,
  mood       TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS intimacy (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  time       TEXT,
  author     TEXT NOT NULL DEFAULT 'a',
  protected  INTEGER NOT NULL DEFAULT 1,
  rating     INTEGER,
  mood       TEXT,
  place      TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intimacy_date ON intimacy(date DESC);

CREATE TABLE IF NOT EXISTS anniversaries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  date          TEXT NOT NULL,
  repeat_yearly INTEGER NOT NULL DEFAULT 1,
  icon          TEXT,
  note          TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wishes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  note        TEXT,
  category    TEXT,
  target_date TEXT,
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     INTEGER,
  author      TEXT NOT NULL DEFAULT 'a',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  author     TEXT NOT NULL,
  mood       TEXT NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(date, author)
);
CREATE INDEX IF NOT EXISTS idx_moods_date ON moods(date DESC);

CREATE TABLE IF NOT EXISTS trips (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  place         TEXT,
  start_date    TEXT,
  end_date      TEXT,
  note          TEXT,
  cover_media_id INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS movies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'movie',
  status      TEXT NOT NULL DEFAULT 'want',
  rating      REAL,
  review      TEXT,
  author      TEXT NOT NULL DEFAULT 'a',
  created_at  INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS capsules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  unlock_date TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT 'a',
  created_at  INTEGER NOT NULL,
  opened_at   INTEGER
);

CREATE TABLE IF NOT EXISTS daily_questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL UNIQUE,
  question   TEXT NOT NULL,
  answer_a   TEXT,
  answer_b   TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT,
  ok         INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

/* 定位：每个人一条最新的 + 一串历史点（轨迹）。
   历史只留最近 3 天，够画"今天走过哪里"，又不至于把库撑大。 */
CREATE TABLE IF NOT EXISTS location_points (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  who        TEXT NOT NULL DEFAULT 'a',
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  acc        REAL,
  speed      REAL,
  heading    REAL,
  altitude   REAL,
  battery    INTEGER,
  charging   INTEGER,
  place      TEXT,
  source     TEXT NOT NULL DEFAULT 'gps',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loc_who_time ON location_points(who, created_at DESC);

/* 常去的地方：家、公司、学校…… 位置落进半径内就显示成这个名字 */
CREATE TABLE IF NOT EXISTS places (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  icon       TEXT,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  radius     INTEGER NOT NULL DEFAULT 200,
  created_at INTEGER NOT NULL
);

/* 戳一下：看见对方在哪儿，顺手说句「想你了」 */
CREATE TABLE IF NOT EXISTS nudges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_who   TEXT NOT NULL DEFAULT 'a',
  to_who     TEXT NOT NULL DEFAULT 'b',
  kind       TEXT NOT NULL DEFAULT 'miss',
  created_at INTEGER NOT NULL,
  seen_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_nudges_to ON nudges(to_who, seen_at);

/* 悄悄话：两个人之间的聊天。room 预留了，暂时只有一个房间。
   read_at 是"对方读到这条"的时间，用来做已读回执。 */
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  who        TEXT NOT NULL DEFAULT 'a',
  body       TEXT NOT NULL DEFAULT '',
  media_id   INTEGER,
  reply_to   INTEGER,
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(created_at DESC);

/* 公告：谁都能发，发出来之后对方下次进站会看到弹窗。
   已读是按人记的，所以单独一张表——不能塞进 announcements 里。 */
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author     TEXT NOT NULL DEFAULT 'a',
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ann_time ON announcements(created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_reads (
  ann_id     INTEGER NOT NULL,
  who        TEXT NOT NULL,
  read_at    INTEGER NOT NULL,
  PRIMARY KEY (ann_id, who)
);

/* ─── v4：默契测验（F1） ───
   题库与每局实例合一。date 非空 = 占当天每日位；为空 = 随手开一局。
   答案一人一行，UNIQUE 保证只能答一次（可改不可重）。 */
CREATE TABLE IF NOT EXISTS quizzes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT,
  kind       TEXT NOT NULL DEFAULT 'daily',
  question   TEXT NOT NULL,
  options    TEXT,
  scale_max  INTEGER NOT NULL DEFAULT 5,
  category   TEXT,
  created_by TEXT NOT NULL DEFAULT 'a',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quizzes_date ON quizzes(date);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id    INTEGER NOT NULL,
  author     TEXT NOT NULL,
  choice     TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  UNIQUE(quiz_id, author)
);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_quiz ON quiz_answers(quiz_id);

/* ─── v4：100 件小事（F2） ───
   done=1 且 witness_by 非空才算「双方确认完成」。 */
CREATE TABLE IF NOT EXISTS couple_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  note       TEXT,
  category   TEXT NOT NULL DEFAULT 'life',
  seq        INTEGER NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0,
  done_at    INTEGER,
  done_by    TEXT,
  witness_by TEXT,
  media_id   INTEGER,
  created_by TEXT NOT NULL DEFAULT 'a',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_done ON couple_items(done, category);

/* ─── v4：爱情报告快照（F5） ───
   落库是为了冻结当期数据：事后删了动态，历史报告不该跟着变。 */
CREATE TABLE IF NOT EXISTS reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period       TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'month',
  payload      TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  viewed_a_at  INTEGER,
  viewed_b_at  INTEGER,
  created_at   INTEGER NOT NULL,
  UNIQUE(period, kind)
);

/* ─── v5：共同相册（F6） ───
   album_items 只存 media 引用，不复制文件：一张照片可以同时属于动态和相册。
   删相册不删照片（CASCADE 只删 album_items 那一行）。 */
CREATE TABLE IF NOT EXISTS albums (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  note           TEXT,
  cover_media_id INTEGER,
  kind           TEXT NOT NULL DEFAULT 'normal',
  year           TEXT,
  created_by     TEXT NOT NULL DEFAULT 'a',
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS album_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id   INTEGER NOT NULL,
  media_id   INTEGER NOT NULL,
  caption    TEXT,
  added_by   TEXT NOT NULL DEFAULT 'a',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(album_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_album_items ON album_items(album_id, sort);

/* ─── v5：冷静卡（F7） ───
   reason 默认只有发起人可见，接口返回给对方时要整字段剔除。 */
CREATE TABLE IF NOT EXISTS cool_cards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  started_by     TEXT NOT NULL,
  started_at     INTEGER NOT NULL,
  minutes        INTEGER NOT NULL DEFAULT 30,
  reason         TEXT,
  reason_private INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'cooling',
  resolved_by    TEXT,
  resolved_at    INTEGER,
  make_up_note   TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cool_status ON cool_cards(status, started_at);

/* ─── v5：情侣树（F8） ───
   不要求用户签到：exp 由已有行为推导，water_date 只是每天一次的小加成。 */
CREATE TABLE IF NOT EXISTS tree_state (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  stage          INTEGER NOT NULL DEFAULT 0,
  exp            INTEGER NOT NULL DEFAULT 0,
  water_date     TEXT,
  last_calc_date TEXT,
  updated_at     INTEGER
);

CREATE TABLE IF NOT EXISTS tree_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  source     TEXT NOT NULL,
  exp        INTEGER NOT NULL,
  author     TEXT NOT NULL DEFAULT 'a',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tree_log_date ON tree_log(date);

/* ─── v5：抽签（F10） ─── */
CREATE TABLE IF NOT EXISTS draws (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_name  TEXT,
  pool       TEXT NOT NULL,
  result     TEXT NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'spin',
  drawn_by   TEXT NOT NULL DEFAULT 'a',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_draws_time ON draws(created_at DESC);

/* ─── v5：共享日历（F11） ───
   surprise=1 时，对方端只看到「这天有事」，看不到标题。 */
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  date       TEXT NOT NULL,
  end_date   TEXT,
  time       TEXT,
  place      TEXT,
  who        TEXT NOT NULL DEFAULT 'both',
  kind       TEXT NOT NULL DEFAULT 'date',
  note       TEXT,
  surprise   INTEGER NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'a',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

/* ─── v5：成就徽章（F12） ─── */
CREATE TABLE IF NOT EXISTS achievements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  detail      TEXT,
  icon        TEXT,
  unlocked_at INTEGER,
  seen        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

/* ─── v6：情侣任务（F3） ─── */
CREATE TABLE IF NOT EXISTS challenges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT,
  kind       TEXT NOT NULL DEFAULT 'act',
  points     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(date)
);

CREATE TABLE IF NOT EXISTS challenge_done (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  author       TEXT NOT NULL,
  note         TEXT,
  media_id     INTEGER REFERENCES media(id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE(challenge_id, author)
);

CREATE TABLE IF NOT EXISTS streak_state (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  current     INTEGER NOT NULL DEFAULT 0,
  best        INTEGER NOT NULL DEFAULT 0,
  last_date   TEXT,
  grace_left  INTEGER NOT NULL DEFAULT 2,
  grace_month TEXT,
  updated_at  INTEGER
);

/* ─── v6：恋爱基金（F4） ─── */
CREATE TABLE IF NOT EXISTS fund_goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  target_cents INTEGER NOT NULL,
  due_date     TEXT,
  emoji        TEXT NOT NULL DEFAULT '✈️',
  achieved_at  INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fund_tx (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'out',
  amount_cents INTEGER NOT NULL,
  title        TEXT NOT NULL,
  category     TEXT,
  goal_id      INTEGER REFERENCES fund_goals(id) ON DELETE SET NULL,
  author       TEXT NOT NULL DEFAULT 'a',
  settled      INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fund_date ON fund_tx(date);

/* ─── v6：共同歌单（F9） ─── */
CREATE TABLE IF NOT EXISTS songs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  artist       TEXT,
  url          TEXT,
  note         TEXT,
  added_by     TEXT NOT NULL DEFAULT 'a',
  pinned       INTEGER NOT NULL DEFAULT 0,
  played_count INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
`;

const DEFAULT_SETTINGS = {
  'couple.title': '我们的小窝',
  'couple.subtitle': '只属于我们两个人的地方',
  'couple.name_a': '妍妍',
  'couple.name_b': '博博',
  'couple.start_date': '',
  'couple.avatar_a': '',
  'couple.avatar_b': '',
  'cycle.avg_cycle': '28',
  'cycle.avg_length': '5',
  'cycle.remind_days': '3',
  'ui.accent': 'rose',
  /* 定位：总开关 + 每人各自的开关 + 上报间隔（秒） */
  'loc.enabled': '1',
  'loc.paused_a': '0',
  'loc.paused_b': '0',
  'loc.interval': '60',
  /* 地图底图：amap 高德 / satellite 卫星 / none 只画轨迹 */
  'loc.tiles': 'amap',
};

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function migrate() {
  const row = db.prepare('PRAGMA user_version').get();
  const current = Number(row && row.user_version ? row.user_version : 0);
  if (current < SCHEMA_VERSION) {
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  /* v1 → v2：老库的 sessions 没有 who 列，补上（已有会话一律当 'a'，重新登录一次即对） */
  if (!hasColumn('sessions', 'who')) {
    db.exec("ALTER TABLE sessions ADD COLUMN who TEXT NOT NULL DEFAULT 'a'");
  }
  /* v6 → v7：media 加 duration，语音消息要用 */
  if (!hasColumn('media', 'duration')) {
    db.exec('ALTER TABLE media ADD COLUMN duration INTEGER');
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)').run(key, value);
  }
  /* 老库里的占位名字（"我 / 宝贝"）换成真名；用户自己改过的不动 */
  const nameA = getSetting('couple.name_a', '');
  const nameB = getSetting('couple.name_b', '');
  if (nameA === '我' || nameA === '') setSetting('couple.name_a', '妍妍');
  if (nameB === '宝贝' || nameB === '') setSetting('couple.name_b', '博博');
}

function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function get(sql, ...params) {
  return db.prepare(sql).get(...params) || null;
}

function run(sql, ...params) {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes || 0), id: Number(r.lastInsertRowid || 0) };
}

function getSetting(key, fallback = '') {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  run(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    String(value ?? '')
  );
}

function allSettings() {
  const out = {};
  for (const row of all('SELECT key, value FROM settings')) out[row.key] = row.value;
  return out;
}

function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

/* 把 WAL 落盘并截断。
   服务停之前调一次，保证重启后读到的是完整数据（不然 -wal 文件里可能还留着没合并的页）。 */
function checkpoint() {
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* 不是 WAL 模式或已关库，忽略 */ }
}

migrate();

module.exports = {
  db, DATA_DIR, UPLOAD_DIR, DB_PATH,
  all, get, run, tx, checkpoint, getSetting, setSetting, allSettings,
};

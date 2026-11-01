'use strict';

const crypto = require('node:crypto');
const { all, get, run, getSetting, setSetting } = require('./db');

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 天
const SCRYPT_KEYLEN = 64;

// 登录节流：同一 IP 连续失败后的冷却
const MAX_FAILS = 6;
const FAIL_WINDOW = 1000 * 60 * 10;
const LOCK_TIME = 1000 * 60 * 5;

const failMap = new Map();

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), useSalt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt: useSalt };
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function ensurePassword() {
  const stored = getSetting('auth.hash', '');
  if (stored) return;
  const initial = process.env.NEST_PASSWORD || 'Lyyb0709';
  const { hash, salt } = hashPassword(initial);
  setSetting('auth.hash', hash);
  setSetting('auth.salt', salt);
  setSetting('auth.updated_at', String(Date.now()));
}

function verifyPassword(password) {
  const hash = getSetting('auth.hash', '');
  const salt = getSetting('auth.salt', '');
  if (!hash || !salt) return false;
  const { hash: attempt } = hashPassword(password, salt);
  return safeEqual(attempt, hash);
}

function changePassword(current, next) {
  if (!verifyPassword(current)) return { ok: false, error: '当前密码不正确' };
  if (!next || String(next).length < 6) return { ok: false, error: '新密码至少 6 位' };
  const { hash, salt } = hashPassword(next);
  setSetting('auth.hash', hash);
  setSetting('auth.salt', salt);
  setSetting('auth.updated_at', String(Date.now()));
  return { ok: true };
}

/* 两个人共用一把暗号（Lyyb0709），但登录时各自认领自己的身份。
   身份只决定「这条动态是谁发的、这张心情是谁打的」，不决定能不能进门。 */
const ACCOUNTS = ['a', 'b'];

function normalizeWho(v) {
  const s = String(v || '').toLowerCase();
  return ACCOUNTS.includes(s) ? s : 'a';
}

function createSession(who, ip, ua) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  run(
    'INSERT INTO sessions(token, who, created_at, expires_at, ua, ip) VALUES (?, ?, ?, ?, ?, ?)',
    token, normalizeWho(who), now, now + SESSION_TTL, String(ua || '').slice(0, 300), String(ip || '')
  );
  // 顺手清理过期会话
  run('DELETE FROM sessions WHERE expires_at < ?', now);
  return { token, who: normalizeWho(who), expiresAt: now + SESSION_TTL };
}

function getSession(token) {
  if (!token) return null;
  const row = get('SELECT * FROM sessions WHERE token = ?', token);
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  return row;
}

function touchSession(token) {
  run('UPDATE sessions SET expires_at = ? WHERE token = ?', Date.now() + SESSION_TTL, token);
}

function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
}

function destroyAllSessions() {
  run('DELETE FROM sessions');
}

function throttleKey(ip) { return String(ip || 'unknown'); }

function checkThrottle(ip) {
  const rec = failMap.get(throttleKey(ip));
  if (!rec) return { allowed: true };
  const now = Date.now();
  if (rec.lockedUntil && rec.lockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (now - rec.firstAt > FAIL_WINDOW) {
    failMap.delete(throttleKey(ip));
    return { allowed: true };
  }
  return { allowed: true };
}

function noteFailure(ip) {
  const key = throttleKey(ip);
  const now = Date.now();
  let rec = failMap.get(key);
  if (!rec || now - rec.firstAt > FAIL_WINDOW) {
    rec = { count: 0, firstAt: now, lockedUntil: 0 };
  }
  rec.count += 1;
  if (rec.count >= MAX_FAILS) rec.lockedUntil = now + LOCK_TIME;
  failMap.set(key, rec);
  return rec;
}

function noteSuccess(ip) {
  failMap.delete(throttleKey(ip));
}

function recentFailures(limit = 20) {
  return all('SELECT ip, ok, created_at FROM login_attempts ORDER BY id DESC LIMIT ?', limit);
}

function logAttempt(ip, ok) {
  run('INSERT INTO login_attempts(ip, ok, created_at) VALUES (?, ?, ?)', String(ip || ''), ok ? 1 : 0, Date.now());
  run('DELETE FROM login_attempts WHERE id < (SELECT MAX(id) - 200 FROM login_attempts)');
}

module.exports = {
  SESSION_TTL, ACCOUNTS, normalizeWho, hashPassword, verifyPassword, changePassword, ensurePassword,
  createSession, getSession, touchSession, destroySession, destroyAllSessions,
  checkThrottle, noteFailure, noteSuccess, recentFailures, logAttempt,
};

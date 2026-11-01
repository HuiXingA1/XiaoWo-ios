'use strict';
// 轻量日期工具：全部以本地时区的 'YYYY-MM-DD' 字符串为交换格式，避免时区漂移。

const DAY = 86400000;

function pad(n) { return String(n).padStart(2, '0'); }

function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

function isISO(s) { return !!parseISO(s); }

function today() { return toISO(new Date()); }

function addDays(iso, n) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** b - a，单位天 */
function diffDays(b, a) {
  const db = parseISO(b), da = parseISO(a);
  if (!db || !da) return null;
  return Math.round((db - da) / DAY);
}

function weekday(iso) {
  const d = parseISO(iso);
  return d ? d.getDay() : 0;
}

/** 该日期在当年的第几天（1-366） */
function dayOfYear(iso) {
  const d = parseISO(iso);
  if (!d) return 1;
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - start) / DAY) + 1;
}

function monthKey(iso) { return String(iso || '').slice(0, 7); }

function daysInMonth(year, month1) {
  return new Date(year, month1, 0).getDate();
}

/** 生成某月的日历矩阵（周一起始），返回 [[iso, ...], ...] */
function monthGrid(year, month1) {
  const first = new Date(year, month1 - 1, 1);
  const lead = (first.getDay() + 6) % 7; // 周一=0
  const total = daysInMonth(year, month1);
  const cells = [];
  for (let i = 0; i < lead; i++) {
    const d = new Date(year, month1 - 1, 1 - (lead - i));
    cells.push(toISO(d));
  }
  for (let i = 1; i <= total; i++) cells.push(toISO(new Date(year, month1 - 1, i)));
  while (cells.length % 7 !== 0) {
    const last = parseISO(cells[cells.length - 1]);
    last.setDate(last.getDate() + 1);
    cells.push(toISO(last));
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 中文相对时间 */
function humanTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  const d = new Date(ts);
  const t = toISO(d);
  const tdy = today();
  if (t === tdy) return '今天';
  if (t === addDays(tdy, -1)) return '昨天';
  const dd = diffDays(tdy, t);
  if (dd < 7) return `${dd} 天前`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = {
  DAY, toISO, parseISO, isISO, today, addDays, diffDays, weekday,
  dayOfYear, monthKey, daysInMonth, monthGrid, humanTime,
};

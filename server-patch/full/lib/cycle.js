'use strict';

const D = require('./dates');

/**
 * 周期预测引擎
 * 思路：
 *  1. 取所有「经期开始日」按时间升序，相邻两两求间隔得到历史周期长度；
 *  2. 过滤生理上不可信的间隔（<15 或 >60 天）作为异常点剔除；
 *  3. 用「近期加权 + 中位数稳健化」求平均周期：越近的周期权重越高，
 *     同时若样本数 >= 4，则用中位数对均值做一次收缩，抵抗单次异常；
 *  4. 下次开始日 = 最后一次开始日 + 平均周期；
 *  5. 排卵日 ≈ 下次开始日 - 14，易孕期 = 排卵日 -5 ~ +1；
 *  6. 用样本量与方差给出置信度，前端据此显示"预测仅供参考"。
 */

const MIN_CYCLE = 15;
const MAX_CYCLE = 60;
const DEFAULT_CYCLE = 28;
const DEFAULT_LENGTH = 5;

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round1(n) { return Math.round(n * 10) / 10; }

function analyze(periods, cycleDays, options = {}) {
  const todayStr = options.today || D.today();
  const fallbackCycle = Number(options.avgCycle) || DEFAULT_CYCLE;
  const fallbackLength = Number(options.avgLength) || DEFAULT_LENGTH;
  const remindDays = Number(options.remindDays) || 3;

  const starts = periods
    .map((p) => p.start_date)
    .filter((s) => D.isISO(s))
    .sort();

  // 历史周期长度
  const gaps = [];
  for (let i = 1; i < starts.length; i++) {
    const g = D.diffDays(starts[i], starts[i - 1]);
    if (g >= MIN_CYCLE && g <= MAX_CYCLE) gaps.push(g);
  }

  // 近期加权平均（最近 6 个周期，权重线性递增）
  let avgCycle = fallbackCycle;
  let cycleSource = 'default';
  if (gaps.length) {
    const recent = gaps.slice(-6);
    let wsum = 0, vsum = 0;
    recent.forEach((g, i) => {
      const w = i + 1;
      wsum += g * w;
      vsum += w;
    });
    let weighted = wsum / vsum;
    if (gaps.length >= 4) {
      const med = median(gaps.slice(-8));
      weighted = weighted * 0.6 + med * 0.4;
    }
    avgCycle = Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, weighted));
    cycleSource = 'history';
  }

  // 平均经期长度
  let avgLength = fallbackLength;
  const lengths = periods
    .map((p) => (p.end_date ? D.diffDays(p.end_date, p.start_date) + 1 : null))
    .filter((n) => n && n >= 1 && n <= 14);
  if (lengths.length) {
    avgLength = Math.round(lengths.slice(-6).reduce((a, b) => a + b, 0) / Math.min(lengths.length, 6));
  }

  const lastStart = starts.length ? starts[starts.length - 1] : null;
  const nextStart = lastStart ? D.addDays(lastStart, Math.round(avgCycle)) : null;

  // 当前是否处于经期
  let inPeriod = false;
  let currentDay = 0;
  const current = periods.find((p) => p.start_date <= todayStr && (!p.end_date || p.end_date >= todayStr));
  if (current) {
    const span = current.end_date
      ? D.diffDays(current.end_date, current.start_date) + 1
      : avgLength;
    const elapsed = D.diffDays(todayStr, current.start_date) + 1;
    if (elapsed >= 1 && elapsed <= Math.max(span, 1)) {
      inPeriod = true;
      currentDay = elapsed;
    }
  }

  // 若最后一条记录已结束且今日仍在预测窗口内，也视为经期
  if (!inPeriod && lastStart) {
    const elapsed = D.diffDays(todayStr, lastStart) + 1;
    const lastRec = periods.find((p) => p.start_date === lastStart);
    if (!lastRec?.end_date && elapsed >= 1 && elapsed <= avgLength) {
      inPeriod = true;
      currentDay = elapsed;
    }
  }

  const daysToNext = nextStart ? D.diffDays(nextStart, todayStr) : null;

  // 排卵与易孕期
  let ovulation = null, fertileStart = null, fertileEnd = null;
  if (nextStart) {
    ovulation = D.addDays(nextStart, -14);
    fertileStart = D.addDays(ovulation, -5);
    fertileEnd = D.addDays(ovulation, 1);
  }
  const inFertile = !!(fertileStart && fertileEnd && todayStr >= fertileStart && todayStr <= fertileEnd);

  // 置信度
  let confidence = 'low';
  if (gaps.length >= 6) confidence = 'high';
  else if (gaps.length >= 3) confidence = 'medium';
  if (gaps.length >= 3) {
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
    const sd = Math.sqrt(variance);
    if (sd > 5) confidence = confidence === 'high' ? 'medium' : 'low';
  }

  // 提醒
  let reminder = null;
  if (!inPeriod && daysToNext !== null) {
    if (daysToNext === 0) reminder = { level: 'today', text: '预计今天开始，注意保暖，别喝冰的' };
    else if (daysToNext > 0 && daysToNext <= remindDays) reminder = { level: 'soon', text: `预计还有 ${daysToNext} 天，红糖姜茶可以备上了` };
    else if (daysToNext < 0) reminder = { level: 'late', text: `比预计晚了 ${Math.abs(daysToNext)} 天，记得补一条记录` };
  }

  // 未来 3 次预测
  const upcoming = [];
  if (nextStart) {
    for (let i = 0; i < 3; i++) {
      const s = D.addDays(nextStart, Math.round(avgCycle) * i);
      upcoming.push({
        start: s,
        end: D.addDays(s, Math.max(1, avgLength) - 1),
        ovulation: D.addDays(s, -14),
      });
    }
  }

  // 近 6 个月的日历标记
  const marks = {};
  for (const p of periods) {
    const span = p.end_date ? D.diffDays(p.end_date, p.start_date) + 1 : avgLength;
    for (let i = 0; i < Math.max(span, 1); i++) {
      const d = D.addDays(p.start_date, i);
      if (d) marks[d] = { type: 'period', actual: true };
    }
  }
  for (const u of upcoming) {
    const span = Math.max(1, avgLength);
    for (let i = 0; i < span; i++) {
      const d = D.addDays(u.start, i);
      if (d && !marks[d]) marks[d] = { type: 'period', actual: false };
    }
  }
  if (fertileStart && fertileEnd) {
    let cur = fertileStart;
    let guard = 0;
    while (cur && cur <= fertileEnd && guard++ < 40) {
      if (!marks[cur]) marks[cur] = { type: 'fertile', actual: false };
      cur = D.addDays(cur, 1);
    }
  }
  if (ovulation && !marks[ovulation]) marks[ovulation] = { type: 'ovulation', actual: false };
  for (const c of cycleDays) {
    if (!marks[c.date]) marks[c.date] = { type: 'note', actual: true };
  }

  return {
    today: todayStr,
    lastStart,
    nextStart,
    daysToNext,
    avgCycle: round1(avgCycle),
    avgLength,
    cycleSource,
    sampleCount: gaps.length,
    confidence,
    inPeriod,
    currentDay,
    ovulation,
    fertileStart,
    fertileEnd,
    inFertile,
    reminder,
    upcoming,
    marks,
    periods,
    cycleDays,
  };
}

module.exports = { analyze, median, MIN_CYCLE, MAX_CYCLE, DEFAULT_CYCLE, DEFAULT_LENGTH };

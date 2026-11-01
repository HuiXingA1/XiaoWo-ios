'use strict';

/* ═══════════════════════════════════════════════════════
   地理计算：两点距离、方位、附近地点匹配
   全部本地算，不调用任何第三方地图/逆地理编码服务，
   位置数据不出这台服务器。
   ═══════════════════════════════════════════════════════ */

const EARTH_RADIUS = 6371008.8; // 米，WGS84 平均半径

const toRad = (deg) => (Number(deg) * Math.PI) / 180;
const toDeg = (rad) => (Number(rad) * 180) / Math.PI;

/* 坐标合法性：纬度 ±90，经度 ±180，且不能是 0,0（定位失败的典型值） */
function validLat(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= -90 && n <= 90;
}
function validLng(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= -180 && n <= 180;
}
function validPoint(lat, lng) {
  if (!validLat(lat) || !validLng(lng)) return false;
  // 0,0 在几内亚湾，情侣定位里出现这个值一定是定位失败
  if (Math.abs(Number(lat)) < 1e-6 && Math.abs(Number(lng)) < 1e-6) return false;
  return true;
}

/* 球面距离（米） */
function distance(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dφ = φ2 - φ1;
  const dλ = toRad(lng2) - toRad(lng1);
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* 方位角：从点 1 看向点 2，正北为 0，顺时针 0~360 */
function bearing(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dλ = toRad(lng2 - lng1);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

function compass(deg) {
  if (!Number.isFinite(Number(deg))) return '';
  const idx = Math.round(((Number(deg) % 360) + 360) % 360 / 45) % 8;
  return COMPASS[idx];
}

/* 给人看的距离：999 米以内取整到 10 米，以上用公里保留一位小数 */
function humanDistance(meters) {
  if (meters === null || meters === undefined) return '';
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.round(m / 10) * 10} 米`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} 公里`;
  return `${Math.round(m / 1000)} 公里`;
}

/* 匹配「常去的地方」：返回落进半径内的最近一个，没命中返回 null */
function matchPlace(point, places) {
  if (!point || !Array.isArray(places) || !places.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of places) {
    const radius = Number(p.radius) > 0 ? Number(p.radius) : 200;
    const d = distance(point.lat, point.lng, p.lat, p.lng);
    if (d <= radius && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best ? { id: best.id, name: best.name, icon: best.icon || '📍', distance: Math.round(bestD) } : null;
}

module.exports = {
  validPoint, validLat, validLng,
  distance, bearing, compass, humanDistance, matchPlace,
};

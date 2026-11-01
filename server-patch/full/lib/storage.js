'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { UPLOAD_DIR } = require('./db');
const { HttpError } = require('./http');

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/heic', '.heic'],
]);

/* 语音：浏览器录音出来的实际格式，Chrome 系是 webm/opus，iOS Safari 是 mp4(aac) */
const AUDIO_ALLOWED = new Map([
  ['audio/webm', '.webm'],
  ['audio/ogg', '.ogg'],
  ['audio/mp4', '.m4a'],
  ['audio/mpeg', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/aac', '.aac'],
]);

const MAX_FILE = 12 * 1024 * 1024; // 单张 12MB（前端已压缩，正常远小于此）
const MAX_AUDIO = 8 * 1024 * 1024; // 单条语音 8MB，够录 10 分钟

/* HEIC 的 ftyp brand，和 mp4 音频区分开 */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

function extFor(mime, filename) {
  const byMime = ALLOWED.get(String(mime || '').toLowerCase());
  if (byMime) return byMime;
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  return null;
}

/** 依据文件头魔数二次校验，防止伪造 Content-Type */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
    return null;
  }
  return null;
}

/** 语音文件头识别 */
function sniffAudio(buf) {
  if (!buf || buf.length < 12) return null;
  /* EBML（WebM / Matroska） */
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'audio/webm';
  if (buf.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  /* MP4 / M4A：ftyp box，brand 在 8..12 */
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4';
  if (buf.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  return null;
}

function monthDir() {
  const d = new Date();
  const rel = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const abs = path.join(UPLOAD_DIR, rel);
  fs.mkdirSync(abs, { recursive: true });
  return rel;
}

function writeOut(buffer, ext) {
  const rel = monthDir();
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const abs = path.join(UPLOAD_DIR, rel, name);
  fs.writeFileSync(abs, buffer);
  return { relPath: `${rel}/${name}`, size: buffer.length };
}

function saveImage(file) {
  if (!file || !file.buffer || !file.buffer.length) throw new HttpError(400, '空文件');
  if (file.buffer.length > MAX_FILE) throw new HttpError(413, '单张照片请小于 12MB');

  const realType = sniff(file.buffer);
  if (!realType) throw new HttpError(400, '只支持 JPG / PNG / WebP / GIF 图片');

  const ext = extFor(realType, file.filename);
  if (!ext) throw new HttpError(400, '不支持的图片格式');

  const out = writeOut(file.buffer, ext);
  return { relPath: out.relPath, mime: realType, size: out.size };
}

function saveAudio(file) {
  if (!file || !file.buffer || !file.buffer.length) throw new HttpError(400, '没录到声音');
  if (file.buffer.length > MAX_AUDIO) throw new HttpError(413, '这条语音太长了，控制在 8MB 内');

  const realType = sniffAudio(file.buffer);
  if (!realType) throw new HttpError(400, '这个录音格式不认识');

  const ext = AUDIO_ALLOWED.get(realType) || '.webm';
  const out = writeOut(file.buffer, ext);
  return { relPath: out.relPath, mime: realType, size: out.size };
}

function removeImage(relPath) {
  if (!relPath) return;
  const abs = path.resolve(UPLOAD_DIR, relPath);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR))) return;
  try { fs.unlinkSync(abs); } catch { /* 文件已不存在 */ }
}

module.exports = { saveImage, saveAudio, removeImage, sniff, sniffAudio, MAX_FILE, MAX_AUDIO };

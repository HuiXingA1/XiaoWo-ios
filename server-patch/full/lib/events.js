'use strict';

/* 悄悄话实时事件（SSE）
   ─────────────────────────
   POST /api/messages 落库后调用 notifyCounterpart()，把「有新消息」推给对方
   正在连接的客户端（iOS 壳后台保活的长连接，或浏览器标签页）。
   网页前端不知道这个端点的存在也完全没关系——连上后不处理就行，
   老版本网页连不上也不报错（事件流只是慢着没有数据）。
   目标是让 iOS 壳在 WebView 退到后台时仍能收到「该弹通知了」的信号。 */

/** who('a'/'b') → Set<res>，同一身份可能开着多个标签页/设备 */
const listeners = new Map();

function listenersFor(who) {
  let set = listeners.get(who);
  if (!set) {
    set = new Set();
    listeners.set(who, set);
  }
  return set;
}

/**
 * 建立一条 SSE 连接。session 必须已经由调用方校验（需要登录）。
 * 返回给 server.js 用的清理函数：断开时必须从集合里摘掉，
 * 否则手机息屏一夜攒下几百个死连接，内存和 fd 都会被拖垮。
 */
function addEventListener(who, res) {
  const set = listenersFor(who);
  set.add(res);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // 反代（nginx）别缓冲这个流
  });
  // 立即发一条注释行：让客户端确认连上了，也戳穿某些代理的缓冲
  res.write(':connected\n\n');

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    set.delete(res);
    if (!set.size) listeners.delete(who);
  };
  res.on('close', cleanup);
  res.on('error', cleanup);

  return cleanup;
}

/** 未读数直接在这里查：handler 里算好再传进来会多一次查询往返 */
function notifyCounterpart(me, payload) {
  const other = me === 'a' ? 'b' : 'a';
  const set = listeners.get(other);
  if (!set || !set.size) return 0;
  const frame = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
  let delivered = 0;
  for (const res of set) {
    try {
      res.write(frame);
      delivered += 1;
    } catch (_err) {
      try { res.end(); } catch (_e2) { /* 断了就断了 */ }
    }
  }
  return delivered;
}

/**
 * 保活心跳：每 25 秒给所有连接发一行 SSE 注释。
 * 不发的话，NAT 路由器/反代会把几分钟没有数据的连接悄悄掐断，
 * 手机息屏后半夜就收不到任何通知了。
 * 注释行（冒号开头）对 EventSource 是不可见的，不产生任何业务行为。
 */
function startHeartbeat() {
  return setInterval(() => {
    for (const set of listeners.values()) {
      for (const res of set) {
        try {
          res.write(':ping\n\n');
        } catch (_err) {
          try { res.end(); } catch (_e2) { /* close 事件会清理 */ }
        }
      }
    }
  }, 25 * 1000);
}

module.exports = { addEventListener, notifyCounterpart, startHeartbeat };

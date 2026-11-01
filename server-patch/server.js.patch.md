'use strict';

/* server.js 增量补丁说明
   ══════════════════════
   在 lovers-nest/server.js 里做 3 处小改动（用搜索定位，每处 1-3 行）：

   1) 文件顶部 require 区（const { createApi } = require('./lib/api'); 之后）加：
      const events = require('./lib/events');

   2) `const api = createApi();` 之后加：
      events.startHeartbeat();

   3) API 分发循环里（`for (const route of api.routes) {` 之前）加：

      // 悄悄话实时事件流（SSE）：需要登录，长连接不走普通路由
      if (req.method === 'GET' && pathname === '/api/push/stream' && session) {
        events.addEventListener(session.who, res);
        return;
      }

   注意：SSE 响应自己 writeHead，不要让后面的 sendJSON 再碰 res——
   `return` 必须有。session 为空时落回 404/401 都行，保持静默即可。
   反向代理场景：Caddy 默认不缓冲 SSE 没问题；nginx 需要
   proxy_buffering off（响应头里的 X-Accel-Buffering: no 已经带了）。
*/
module.exports = {};

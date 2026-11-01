'use strict';

/* api.js 增量补丁说明
   ════════════════════
   在 lovers-nest/lib/api.js 里做 2 处改动：

   1) 文件顶部 require 区加：
      const { notifyCounterpart } = require('./events');

   2) POST /api/messages 的 handler 里，`const row = get('SELECT * FROM messages WHERE id = ?', r.id);`
      这行之后、`return serializeMessage(row);` 之前，插入：

      /* 有新悄悄话：实时推给对方（SSE，谁在线谁收到；无人连接时静默返回 0） *​/
      notifyCounterpart(me, {
        type: 'message',
        who: me,                                   // 发送者
        body: text || '[照片]',                     // 通知预览文本
        msgId: Number(row.id),
        unread: Number(get(
          'SELECT COUNT(*) AS c FROM messages WHERE who = ? AND read_at IS NULL', me
        ).c || 0),                                  // 对方此刻的未读总数
        at: Number(row.created_at),
      });

   说明：
   - payload 带 unread，iOS 壳直接拿它设置 App 角标，不用再回查。
   - body 只截通知预览（通知横幅上显示「宝贝: 晚上吃火锅吗」）。
   - 自己发的消息不会推给自己（notifyCounterpart 内部只找 who=other 的连接）。
   - read_at 语义不变：打开聊天页时 GET /api/messages 才标已读（api.js:1377）。
*/
module.exports = {};

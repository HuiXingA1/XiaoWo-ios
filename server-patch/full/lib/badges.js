'use strict';

/* 徽章定义表。
   check(stats, extra) 返回 true 就解锁；extra 里带各模块的额外计数。
   顺序就是徽章墙的展示顺序（先易后难，新用户不会一屏全灰）。 */

const BADGES = [
  /* ── 入门 ── */
  { key: 'first_post', title: '第一句话', detail: '发出第一条动态', icon: '✍️', check: (s) => s.counts.posts >= 1 },
  { key: 'first_message', title: '开个口', detail: '发出第一条消息', icon: '💬', check: (s) => s.counts.messages >= 1 },
  { key: 'first_mood', title: '今天怎么样', detail: '记录第一次心情', icon: '🌤', check: (s, e) => e.moods >= 1 },
  { key: 'first_wish', title: '许个愿', detail: '写下第一个愿望', icon: '⭐', check: (s) => s.counts.wishes >= 1 },
  { key: 'first_quiz', title: '默契开始', detail: '答完第一道默契题', icon: '❓', check: (s, e) => e.quizBoth >= 1 },
  { key: 'first_item', title: '第一件小事', detail: '一起完成第一件小事', icon: '✅', check: (s, e) => e.itemsDone >= 1 },
  { key: 'first_album', title: '收进一本', detail: '建第一个相册', icon: '📔', check: (s, e) => e.albums >= 1 },
  { key: 'first_event', title: '约好了', detail: '在日历上记下第一个安排', icon: '📅', check: (s, e) => e.events >= 1 },
  { key: 'first_draw', title: '交给运气', detail: '用抽签决定一件事', icon: '🎲', check: (s, e) => e.draws >= 1 },
  { key: 'first_challenge', title: '今天做到', detail: '完成第一件每日小事', icon: '🌱', check: (s, e) => e.challenges >= 1 },
  { key: 'first_fund', title: '一起记账', detail: '记下第一笔共同开销', icon: '💰', check: (s, e) => e.fundTx >= 1 },
  { key: 'first_song', title: '我们的歌', detail: '放进第一首歌', icon: '🎵', check: (s, e) => e.songs >= 1 },

  /* ── 数量 ── */
  { key: 'posts_10', title: '十句话', detail: '发出 10 条动态', icon: '📝', check: (s) => s.counts.posts >= 10 },
  { key: 'posts_50', title: '话很多', detail: '发出 50 条动态', icon: '📚', check: (s) => s.counts.posts >= 50 },
  { key: 'posts_100', title: '写满了', detail: '发出 100 条动态', icon: '🖋', check: (s) => s.counts.posts >= 100 },
  { key: 'photos_30', title: '三十张', detail: '存下 30 张照片', icon: '🖼', check: (s) => s.counts.photos >= 30 },
  { key: 'photos_100', title: '一百张', detail: '存下 100 张照片', icon: '🎞', check: (s) => s.counts.photos >= 100 },
  { key: 'messages_500', title: '五百句', detail: '互相说够 500 句', icon: '💌', check: (s) => s.counts.messages >= 500 },
  { key: 'messages_2000', title: '说不停', detail: '互相说够 2000 句', icon: '🗣', check: (s) => s.counts.messages >= 2000 },

  /* ── 坚持 ── */
  { key: 'streak_7', title: '一周不断', detail: '连续 7 天有动态', icon: '🔥', check: (s) => s.streak >= 7 },
  { key: 'streak_30', title: '一个月', detail: '连续 30 天有动态', icon: '🌟', check: (s) => s.streak >= 30 },
  { key: 'streak_100', title: '一百天', detail: '连续 100 天有动态', icon: '👑', check: (s) => s.streak >= 100 },

  /* ── 一起做 ── */
  { key: 'items_10', title: '十件小事', detail: '一起完成 10 件小事', icon: '🌱', check: (s, e) => e.itemsDone >= 10 },
  { key: 'items_50', title: '五十件小事', detail: '一起完成 50 件小事', icon: '🌿', check: (s, e) => e.itemsDone >= 50 },
  { key: 'items_100', title: '一百件', detail: '把 100 件小事全做完', icon: '🌳', check: (s, e) => e.itemsDone >= 100 },
  { key: 'quiz_30', title: '三十题', detail: '一起答完 30 道默契题', icon: '🧩', check: (s, e) => e.quizBoth >= 30 },
  { key: 'quiz_100', title: '一百题', detail: '一起答完 100 道默契题', icon: '🎯', check: (s, e) => e.quizBoth >= 100 },

  /* ── 时间 ── */
  { key: 'days_100', title: '一百天', detail: '在一起满 100 天', icon: '💯', check: (s) => (s.togetherDays || 0) >= 100 },
  { key: 'days_365', title: '一年', detail: '在一起满一年', icon: '🎂', check: (s) => (s.togetherDays || 0) >= 365 },
  { key: 'days_1000', title: '一千天', detail: '在一起满 1000 天', icon: '💎', check: (s) => (s.togetherDays || 0) >= 1000 },
  { key: 'days_1825', title: '五年', detail: '在一起满五年', icon: '🏆', check: (s) => (s.togetherDays || 0) >= 1825 },

  /* ── 记录 ── */
  { key: 'trips_5', title: '走过五地', detail: '记录 5 次旅行', icon: '🧳', check: (s) => s.counts.trips >= 5 },
  { key: 'movies_20', title: '一起看过', detail: '一起看完 20 部电影', icon: '🎬', check: (s) => s.counts.moviesDone >= 20 },
  { key: 'wishes_done_10', title: '愿望成真', detail: '完成 10 个愿望', icon: '🌠', check: (s) => s.counts.wishesDone >= 10 },
  { key: 'capsules_5', title: '写给以后', detail: '封存 5 个时光胶囊', icon: '⏳', check: (s) => s.counts.capsules >= 5 },
  { key: 'anniv_5', title: '记着的日子', detail: '记下 5 个纪念日', icon: '🎈', check: (s) => s.counts.anniversaries >= 5 },
  { key: 'albums_5', title: '五本相册', detail: '攒够 5 本相册', icon: '📷', check: (s, e) => e.albums >= 5 },
  { key: 'make_up_3', title: '和好如初', detail: '用过 3 次冷静卡并和好', icon: '🤝', check: (s, e) => e.resolved >= 3 },
  { key: 'tree_bloom', title: '开花了', detail: '情侣树长到开花', icon: '🌸', check: (s, e) => e.treeStage >= 4 },
  { key: 'tree_fruit', title: '结果了', detail: '情侣树长到结果', icon: '🍎', check: (s, e) => e.treeStage >= 5 },
  { key: 'challenge_7', title: '七天连着', detail: '连续 7 天都做到', icon: '🌿', check: (s, e) => e.challengeStreak >= 7 },
  { key: 'challenge_30', title: '一个月连着', detail: '连续 30 天都做到', icon: '🌳', check: (s, e) => e.challengeStreak >= 30 },
  { key: 'fund_goal', title: '存够了', detail: '有一个目标存满了', icon: '🏦', check: (s, e) => e.fundGoalsDone >= 1 },
  { key: 'songs_10', title: '十首歌', detail: '攒够 10 首歌', icon: '🎧', check: (s, e) => e.songs >= 10 },
];

module.exports = { BADGES };

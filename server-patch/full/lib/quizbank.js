'use strict';

/* 默契测验题库。
   每条：q 题目；options 选项数组（有 = 选择题，没有 = 自由作答）；cat 分类。
   分类：communication 沟通 / conflict 相处 / intimacy 亲密 / money 钱 / growth 成长
        / family 家人 / fun 好玩 / memory 回忆 / future 未来
   选题不随机：按「距 2020-01-01 的天数」取模，同一天两人看到的一定是同一题，
   换设备、清缓存也不会变。 */

const BANK = [
  /* ── 沟通 ── */
  { q: '我今天心情不好，你希望我', options: ['直接说出来', '先自己待一会儿'], cat: 'communication' },
  { q: '吵架的时候，你最受不了我', options: ['沉默不说话', '翻旧账'], cat: 'conflict' },
  { q: '我说话的时候，你最希望我', options: ['看着你的眼睛', '把手上的事放下'], cat: 'communication' },
  { q: '你更希望我用哪种方式说「我想你」', options: ['直接说', '做点什么给你'], cat: 'communication' },
  { q: '如果我做得不对，你更愿意', options: ['当场就说', '过后再聊'], cat: 'communication' },
  { q: '你觉得我们之间最好的沟通时间是', options: ['睡前躺着聊', '一起走路的时候'], cat: 'communication' },
  { q: '你生气的时候最需要我', options: ['哄你', '给你空间'], cat: 'conflict' },
  { q: '我们意见不一致时，你更在意', options: ['结果听谁的', '我有没有认真听你'], cat: 'conflict' },
  { q: '你最想我改掉的一个小习惯是', cat: 'conflict' },
  { q: '你觉得我们吵架后谁先低头更多', options: ['我', '你'], cat: 'conflict' },
  { q: '如果我说「随便」，你通常理解成', options: ['真的都行', '其实我有想法但懒得说'], cat: 'communication' },
  { q: '你希望我在你朋友面前', options: ['多说话活跃气氛', '安静陪着就好'], cat: 'communication' },
  { q: '你觉得一条消息回得慢，最可能的原因', options: ['在忙', '忘了'], cat: 'communication' },
  { q: '你最想听我说的一句话是', cat: 'communication' },
  { q: '我做了什么会让你觉得「被爱着」', cat: 'communication' },

  /* ── 亲密 ── */
  { q: '你更喜欢哪种亲密', options: ['抱着不说话', '一直聊天'], cat: 'intimacy' },
  { q: '牵手的时候你更喜欢', options: ['十指扣住', '松松握着'], cat: 'intimacy' },
  { q: '你觉得一天里最亲的时刻是', options: ['出门前的拥抱', '睡前的那几句'], cat: 'intimacy' },
  { q: '你更喜欢我', options: ['主动一点', '等你来'], cat: 'intimacy' },
  { q: '我身上你最喜欢的地方是', cat: 'intimacy' },
  { q: '你最喜欢我怎样叫你', cat: 'intimacy' },
  { q: '如果要选一个只属于我们的暗号，你会选', cat: 'intimacy' },
  { q: '你觉得拥抱多久才算抱够了', options: ['三秒就够', '越久越好'], cat: 'intimacy' },
  { q: '你更喜欢的约会收尾方式是', options: ['送到楼下再走', '一起走一段路'], cat: 'intimacy' },
  { q: '你希望我在你累的时候', options: ['什么都不问，抱着', '问清楚怎么了'], cat: 'intimacy' },

  /* ── 回忆 ── */
  { q: '你第一次觉得「就是这个人」是在什么时候', cat: 'memory' },
  { q: '我们在一起后，你最常想起的一天是', cat: 'memory' },
  { q: '你印象里我最好看的一次是', cat: 'memory' },
  { q: '我们吃过最难忘的一顿是', cat: 'memory' },
  { q: '你最想重来一次的那天是', cat: 'memory' },
  { q: '我们第一次牵手，你还记得当时在想什么吗', cat: 'memory' },
  { q: '你觉得我们最像的一刻是', cat: 'memory' },
  { q: '你手机里最舍不得删的一张照片是', cat: 'memory' },
  { q: '我们吵得最凶那次，你后来怎么想的', cat: 'memory' },
  { q: '你第一次见我家人/朋友时的心情是', cat: 'memory' },

  /* ── 好玩 ── */
  { q: '周末只能选一个', options: ['在家躺一天', '出门乱逛'], cat: 'fun' },
  { q: '火锅还是烤肉', options: ['火锅', '烤肉'], cat: 'fun' },
  { q: '如果中了一百万，第一件事', options: ['先存起来', '立刻出去玩'], cat: 'money' },
  { q: '看电影你更在意', options: ['剧情', '氛围'], cat: 'fun' },
  { q: '你更怕', options: ['冷', '热'], cat: 'fun' },
  { q: '出门旅行你更想', options: ['把行程排满', '走到哪算哪'], cat: 'fun' },
  { q: '如果变成动物，你会选', options: ['猫', '狗'], cat: 'fun' },
  { q: '你更喜欢哪种天气', options: ['下大雨', '大晴天'], cat: 'fun' },
  { q: '半夜饿了你会', options: ['忍着睡', '爬起来找吃的'], cat: 'fun' },
  { q: '你更愿意', options: ['早起', '熬夜'], cat: 'fun' },
  { q: '如果只能保留一个 App', cat: 'fun' },
  { q: '你最想学会的一件事是', cat: 'fun' },
  { q: '你最近一次笑到停不下来是因为', cat: 'fun' },
  { q: '你最想去但还没去的地方是', cat: 'future' },
  { q: '如果明天放假一天，你会拉我去', cat: 'fun' },

  /* ── 未来 ── */
  { q: '你想象里我们的家最需要有的东西是', cat: 'future' },
  { q: '你想养宠物吗', options: ['想，猫', '想，狗'], cat: 'future' },
  { q: '你觉得我们几年后会在哪个城市', cat: 'future' },
  { q: '你更希望我们', options: ['一起做一件事', '各做各的但在一间屋'], cat: 'future' },
  { q: '你想过我们老了会是什么样吗', cat: 'future' },
  { q: '我们下一个要一起去的地方', cat: 'future' },
  { q: '你最想和我一起完成的一件事是', cat: 'future' },
  { q: '你觉得我们最大的共同点是', cat: 'future' },

  /* ── 成长 ── */
  { q: '你希望我在你追求的事上', options: ['多推你一把', '无条件支持就好'], cat: 'growth' },
  { q: '你最近在为什么事努力', cat: 'growth' },
  { q: '你最希望我夸你哪一点', cat: 'growth' },
  { q: '你觉得自己最大的改变是', cat: 'growth' },
  { q: '有没有一件事你一直想做但没说', cat: 'growth' },
  { q: '你希望我怎么对待你的坏情绪', cat: 'growth' },

  /* ── 钱 ── */
  { q: '一起吃饭你更习惯', options: ['AA', '轮流请'], cat: 'money' },
  { q: '买贵的东西你会', options: ['想很久', '喜欢就买'], cat: 'money' },
  { q: '你觉得我们该不该有一个共同账户', options: ['该', '不必'], cat: 'money' },
  { q: '你更愿意把钱花在', options: ['体验', '物品'], cat: 'money' },

  /* ── 家人 ── */
  { q: '你觉得见家长这件事', options: ['越早越好', '再等等'], cat: 'family' },
  { q: '你希望我怎么和你家人相处', cat: 'family' },
  { q: '如果我们家人意见不合，你会', options: ['先站我这边', '先讲道理'], cat: 'family' },

  /* ── 相处 ── */
  { q: '你更介意我', options: ['话太少', '话太多'], cat: 'conflict' },
  { q: '你觉得两个人在一起最需要的是', options: ['信任', '默契'], cat: 'conflict' },
  { q: '你最不能接受对方做的事是', cat: 'conflict' },
  { q: '如果我忘了纪念日，你会', options: ['生气', '提醒我'], cat: 'conflict' },
  { q: '你希望我们多久有一次只属于两个人的时间', options: ['每天一点', '每周一次长的'], cat: 'conflict' },
  { q: '你觉得我们最需要改进的是', cat: 'conflict' },
  { q: '有什么事你一直想跟我说但没开口', cat: 'communication' },
  { q: '你最想我问你但一直没问的问题是', cat: 'communication' },
  { q: '如果用三个词形容我们，你会选', cat: 'communication' },
  { q: '你觉得我了解你吗', options: ['很了解', '还可以更了解'], cat: 'communication' },
  { q: '你希望我多问你什么', cat: 'communication' },
  { q: '今天有没有哪一秒你觉得「有你在真好」', cat: 'communication' },
  { q: '你最想对我说但现在说不出口的话是', cat: 'communication' },
  { q: '你觉得我们之间有没有没说开的事', cat: 'conflict' },
  { q: '如果可以问我一个问题，你会问', cat: 'communication' },
];

const DAY0 = Date.UTC(2020, 0, 1);

function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return 0;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((t - DAY0) / 86400000);
}

function pickFor(iso, offset = 0) {
  const n = dayNumber(iso) + offset;
  const i = ((n % BANK.length) + BANK.length) % BANK.length;
  return BANK[i];
}

module.exports = { BANK, dayNumber, pickFor };

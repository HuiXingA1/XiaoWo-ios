'use strict';

/* ═══════════════════════════════════════════════════════
   views.js · 所有视图
   ═══════════════════════════════════════════════════════ */

const Views = {};

/* 视图内状态 */
let calCursor = null;      // 经期日历 {y, m}
let moodCursor = null;     // 心情月历 {y, m}
let moodFilter = 'all';
let movieFilter = 'all';
let wishFilter = 'todo';
let draft = { media: [], mood: '', weather: '', location: '' };

/* 愿望分类：值 → 中文标签 */
const WISH_CATS = [
  ['travel', '去远方'],
  ['food', '一起吃'],
  ['life', '小日子'],
  ['photo', '拍照'],
  ['home', '家'],
  ['gift', '小惊喜'],
];
const wishCatLabel = (k) => {
  const hit = WISH_CATS.find(([v]) => v === k);
  return hit ? hit[1] : (k || '');
};

/* ───────────── 小工具 ───────────── */

function page(inner, wide) {
  return `<div class="page${wide ? ' page--wide' : ''}">${inner}</div>`;
}

function monthCells(y, m) {
  const cells = [];
  const startDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(y, m, -i);
    cells.push({ iso: isoOf(d), day: d.getDate(), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoOf(new Date(y, m, d)), day: d, inMonth: true });
  }
  let n = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(y, m, daysInMonth + n);
    cells.push({ iso: isoOf(d), day: d.getDate(), inMonth: false });
    n++;
  }
  return cells;
}

function dateField(label, id, value) {
  return `<div class="field">
    <label class="field__label" for="${id}">${esc(label)}</label>
    <input class="input" type="date" id="${id}" value="${esc(value || '')}">
  </div>`;
}

function starsHTML(n, max = 5) {
  const v = Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
  let out = '<span class="stars">';
  for (let i = 1; i <= max; i++) out += `<span class="${i <= v ? 'on' : ''}" style="color:${i <= v ? 'var(--gold-400)' : 'var(--ink-300)'}">★</span>`;
  return out + '</span>';
}

function starsPick(n) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  let out = '<div class="stars" data-stars>';
  for (let i = 1; i <= 5; i++) out += `<button type="button" data-v="${i}" class="${i <= v ? 'on' : ''}">★</button>`;
  return out + '</div>';
}

/* 把任意评分夹到 0~5 并取半星，用于 ★ 渲染，永不产生负数 repeat */
function starString(n, max = 5) {
  const v = Math.max(0, Math.min(max, Math.round((Number(n) || 0) * 2) / 2));
  const full = Math.floor(v);
  const half = v - full >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '⯨' : '') + '☆'.repeat(max - full - half);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 22) return '晚上好';
  return '夜深了';
}

/* ═══════════════════════════════════════════════════════
   首页
   ═══════════════════════════════════════════════════════ */

Views.home = async function (el) {
  el.innerHTML = loadingBlock();

  const [cycleData, annData, posts] = await Promise.all([
    api('/api/cycle').catch(() => null),
    api('/api/anniversaries').catch(() => ({ items: [] })),
    api('/api/posts?limit=3').catch(() => ({ items: [] })),
  ]);

  const s = App.stats || {};
  const days = s.togetherDays;
  const counts = s.counts || {};

  /* ── 周期卡 ── */
  let cycleCard = '';
  if (cycleData) {
    const c = cycleData;
    let state = '还没有记录';
    let hint = '记录一次经期开始日，就能算出预测啦';
    let pct = 0, bigNum = '—', unit = '';

    if (c.inPeriod) {
      state = `经期第 ${c.currentDay} 天`;
      hint = '多喝热水，早点睡，我在呢';
      pct = Math.min(1, c.currentDay / Math.max(1, c.avgLength));
      bigNum = c.currentDay;
      unit = '天';
    } else if (c.daysToNext !== null && c.nextStart) {
      if (c.daysToNext >= 0) {
        state = `还有 ${c.daysToNext} 天`;
        hint = `预计 ${c.nextStart.slice(5).replace('-', ' 月 ')} 日开始`;
        pct = 1 - Math.min(1, c.daysToNext / Math.max(1, c.avgCycle));
        bigNum = c.daysToNext;
        unit = '天';
      } else {
        state = `晚了 ${Math.abs(c.daysToNext)} 天`;
        hint = '记得补一条记录，预测会更准';
        pct = 1;
        bigNum = Math.abs(c.daysToNext);
        unit = '天';
      }
    }

    cycleCard = `
      <div class="cycle-card">
        <div class="section-head" style="margin-bottom:14px">
          <div>
            <div class="section-head__title">周期</div>
            <div class="section-head__desc">${c.reminder ? esc(c.reminder.text) : '记录越久，预测越准'}</div>
          </div>
          <button class="btn btn--sm btn--ghost" data-goto="cycle">详情</button>
        </div>
        <div class="cycle-card__ring">
          <div class="ring">
            ${ring(pct)}
            <div class="ring__label">
              <div>
                <div class="ring__num">${esc(String(bigNum))}</div>
                <div class="ring__unit">${esc(unit || '记录')}</div>
              </div>
            </div>
          </div>
          <div class="cycle-card__info">
            <div class="cycle-card__state">${esc(state)}</div>
            <div class="cycle-card__hint">${esc(hint)}</div>
            <div class="post__meta" style="margin-top:9px;margin-bottom:0">
              ${c.inFertile ? '<span class="tag tag--sage">🌿 易孕期</span>' : ''}
              <span class="tag tag--gray">平均 ${c.avgCycle} 天</span>
              ${c.confidence === 'high' ? '<span class="tag tag--gold">预测较准</span>' : ''}
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ── 纪念日 ── */
  const anns = (annData.items || []).filter((a) => a.daysTo !== null).slice(0, 3);
  const annCard = `
    <div class="card">
      <div class="section-head" style="margin-bottom:6px">
        <div>
          <div class="section-head__title">马上到的日子</div>
          <div class="section-head__desc">${anns.length ? '别忘啦' : '还没有纪念日'}</div>
        </div>
        <button class="btn btn--sm btn--ghost" data-goto="anniversaries">全部</button>
      </div>
      ${anns.length
        ? anns.map((a) => `
          <div class="anniv-row">
            <div class="anniv-row__icon">${esc(a.icon || '💗')}</div>
            <div class="anniv-row__body">
              <div class="anniv-row__title">${esc(a.title)}</div>
              <div class="anniv-row__sub">${esc(a.next || '')}${a.years ? ` · 第 ${a.years} 年` : ''}</div>
            </div>
            <div class="anniv-row__days">
              <div class="anniv-row__num">${a.daysTo === 0 ? '今天' : a.daysTo}</div>
              ${a.daysTo === 0 ? '' : '<div class="anniv-row__unit">天后</div>'}
            </div>
          </div>`).join('')
        : `<div class="empty" style="padding:26px 0"><div class="empty__icon">🎂</div>
           <div class="empty__title">加上在一起的日期吧</div>
           <div class="empty__desc">在纪念日里记下每个值得回头的日子</div></div>`}
    </div>`;

  /* ── 每日一问 ── */
  const q = App.daily || {};
  const dailyCard = `
    <div class="daily">
      <div class="daily__label">今 日 一 问</div>
      <div class="daily__q">${esc(q.question || '今天想对我说点什么？')}</div>
      <div class="daily__answers">
        <div class="daily__ans ${q.answerA ? '' : 'daily__ans--empty'}">
          <b>${esc(nameA())}</b><span>${esc(q.answerA || '还没回答…')}</span>
        </div>
        <div class="daily__ans ${q.answerB ? '' : 'daily__ans--empty'}">
          <b>${esc(nameB())}</b><span>${esc(q.answerB || '还没回答…')}</span>
        </div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn btn--sm btn--primary" data-act="answer">${esc(nameOf(App.me))} 来回答</button>
        <button class="btn btn--sm btn--ghost" data-act="qhistory">看看以前</button>
      </div>
    </div>`;

  /* ── 最近动态 ── */
  const recent = (posts.items || []).map(postHTML).join('');

  el.innerHTML = page(`
    <div class="hero">
      <div class="hero__bg">🌷</div>
      <div class="hero__greet">${esc(greeting())}，${esc(nameOf(App.me))}</div>
      ${days !== null && days !== undefined
        ? `<div><span class="hero__days">${days}</span><span class="hero__unit">天</span></div>
           <div class="hero__since">从 ${esc(s.startDate || '')} 开始，每一天都算数</div>`
        : `<div><span class="hero__days">🌱</span></div>
           <div class="hero__since">还没设置在一起的日子，去设置里填一下</div>`}
      <div class="hero__couple">
        ${avatarHTML('a', 'lg')}
        <span class="hero__heart">💗</span>
        ${avatarHTML('b', 'lg')}
        <div style="margin-left:6px;font-size:13.5px;color:var(--ink-700);line-height:1.6">
          <div>${esc(nameA())} &amp; ${esc(nameB())}</div>
          <div style="color:var(--text-soft);font-size:12px">${esc(App.settings['couple.subtitle'] || '')}</div>
        </div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="stat__num">${counts.posts || 0}</div><div class="stat__label">条动态</div></div>
      <div class="stat"><div class="stat__num">${counts.photos || 0}</div><div class="stat__label">张照片</div></div>
      <div class="stat"><div class="stat__num">${counts.trips || 0}</div><div class="stat__label">次旅行</div></div>
      <div class="stat"><div class="stat__num">${counts.wishesDone || 0}/${counts.wishes || 0}</div><div class="stat__label">愿望达成</div></div>
      <div class="stat"><div class="stat__num">${s.streak || 0}</div><div class="stat__label">连续记录天</div></div>
    </div>

    <div class="grid-2" style="margin-bottom:18px">
      ${cycleCard}
      ${annCard}
    </div>

    ${dailyCard}

    <div class="section-head" style="margin-top:26px">
      <div>
        <div class="section-head__title">最近的我们</div>
        <div class="section-head__desc">${counts.posts ? `一共写了 ${counts.posts} 条` : '还没有记录'}</div>
      </div>
      <button class="btn btn--sm btn--ghost" data-goto="timeline">去写一条</button>
    </div>
    <div class="timeline">${recent || emptyState('✍️', '这里还空着', '写下第一句话，从今天开始')}</div>
  `);

  /* 事件 */
  el.querySelectorAll('[data-goto]').forEach((b) => {
    b.onclick = () => App.go(b.dataset.goto);
  });
  const ansBtn = el.querySelector('[data-act="answer"]');
  if (ansBtn) ansBtn.onclick = openDailyAnswer;
  const qh = el.querySelector('[data-act="qhistory"]');
  if (qh) qh.onclick = openDailyHistory;
  bindPostEvents(el);
};

/* ── 每日一问 ── */

function openDailyAnswer() {
  const q = App.daily || {};
  const key = App.me === 'b' ? 'answerB' : 'answerA';
  openModal({
    title: '今天的问题',
    body: `
      <div class="daily__q" style="font-size:16px;margin-bottom:16px">${esc(q.question || '')}</div>
      <div class="field">
        <label class="field__label">${esc(nameOf(App.me))} 的回答</label>
        <textarea class="textarea" id="dailyAns" maxlength="1000" placeholder="慢慢写，我等着">${esc(q[key] || '')}</textarea>
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>先不写</button>
             <button class="btn btn--primary" data-save>保存</button>`,
    onMount(modal, close) {
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-save]').onclick = async () => {
        const answer = modal.querySelector('#dailyAns').value.trim();
        if (!answer) { toast('写一句吧', 'err'); return; }
        try {
          const r = await api('/api/daily', { method: 'POST', body: { author: App.me, answer } });
          App.daily = { ...App.daily, answerA: r.answerA, answerB: r.answerB };
          toast('记下了 💗', 'ok');
          close();
          App.go('home');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

async function openDailyHistory() {
  let items = [];
  try { items = (await api('/api/daily/history')).items || []; } catch { /* ignore */ }
  openModal({
    title: '以前的问题',
    wide: true,
    body: items.length
      ? `<div class="list">${items.map((it) => `
          <div class="item" style="flex-direction:column;align-items:stretch">
            <div style="font-size:12px;color:var(--text-soft);margin-bottom:6px">${esc(it.date)}</div>
            <div class="item__title" style="font-family:var(--font-serif);margin-bottom:9px">${esc(it.question)}</div>
            <div class="daily__answers">
              ${it.answerA ? `<div class="daily__ans"><b>${esc(nameA())}</b><span>${esc(it.answerA)}</span></div>` : ''}
              ${it.answerB ? `<div class="daily__ans"><b>${esc(nameB())}</b><span>${esc(it.answerB)}</span></div>` : ''}
            </div>
          </div>`).join('')}</div>`
      : emptyState('💭', '还没有历史', '每天回答一次，慢慢就攒下来了'),
  });
}

/* ═══════════════════════════════════════════════════════
   时光轴
   ═══════════════════════════════════════════════════════ */

function postHTML(p) {
  const media = p.media || [];
  const cls = media.length === 1 ? 'post__media--1'
    : media.length === 2 ? 'post__media--2'
    : media.length === 3 ? 'post__media--3'
    : media.length === 4 ? 'post__media--4' : 'post__media--n';

  const mine = (p.reactions || []).find((r) => r.author === App.me);
  const heartCount = (p.reactions || []).filter((r) => r.kind === 'heart').length;

  return `
  <article class="post${p.pinned ? ' post--pinned' : ''}" data-post="${p.id}">
    ${p.pinned ? '<div class="post__pin">置顶</div>' : ''}
    <div class="post__head">
      ${avatarHTML(p.author)}
      <div style="min-width:0">
        <div class="post__who">${esc(nameOf(p.author))}</div>
        <div class="post__when">${esc(humanTime(p.createdAt))}</div>
      </div>
    </div>
    ${p.content ? `<div class="post__body">${esc(p.content)}</div>` : ''}
    ${media.length ? `<div class="post__media ${cls}">${media.map((m) =>
      `<img src="${esc(m.url)}" alt="" loading="lazy" data-zoom="${esc(m.url)}">`).join('')}</div>` : ''}
    ${(p.mood || p.weather || p.location) ? `<div class="post__meta">
      ${moodTag(p.mood)}${weatherTag(p.weather)}
      ${p.location ? `<span class="tag tag--gray">📍 ${esc(p.location)}</span>` : ''}
    </div>` : ''}
    <div class="post__foot">
      <button class="react-btn${mine ? ' on' : ''}" data-react aria-label="喜欢">
        <span class="react-btn__ico">${mine ? WX_HEART : WX_HEART_O}</span>
        <span>${heartCount || ''}</span>
      </button>
      <button class="react-btn" data-toggle-comments aria-label="评论">
        <span class="react-btn__ico">${WX_CMT}</span>
        <span>${(p.comments || []).length || ''}</span>
      </button>
      <div class="spacer"></div>
      <button class="mini-btn" data-edit title="编辑">改</button>
      <button class="mini-btn" data-del title="删除">删</button>
    </div>
    <div class="post__comments" hidden>
      <div data-comments>${(p.comments || []).map(commentHTML).join('')}</div>
      <div class="comment-form">
        <input type="text" maxlength="1000" placeholder="说点什么…" data-comment-input>
        <button class="btn btn--sm btn--primary" data-comment-send>发送</button>
      </div>
    </div>
  </article>`;
}

function commentHTML(c) {
  return `<div class="comment" data-comment="${c.id}">
    <span class="comment__who">${esc(nameOf(c.author))}</span>
    <span class="comment__text">${esc(c.content)}</span>
    <button class="comment__del" data-comment-del title="删除">✕</button>
  </div>`;
}

Views.timeline = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/posts?limit=20');
  App.posts = data.items || [];
  App.nextBefore = data.nextBefore;
  App.hasMore = data.hasMore;

  el.innerHTML = page(`
    <div class="composer" id="composer">
      <div class="composer__top">
        ${avatarHTML(App.me)}
        <textarea class="composer__input" id="composerInput" placeholder="${esc(nameOf(App.me))}，今天想记点什么…" maxlength="5000"></textarea>
      </div>
      <div class="composer__previews" id="composerPreviews"></div>
      <div id="composerExtra"></div>
      <div class="composer__bar">
        <div class="composer__tools">
          <button class="tool-btn" data-tool="photo" title="照片" aria-label="照片">${wxTool('image')}</button>
          <button class="tool-btn" data-tool="mood" title="心情" aria-label="心情">${wxTool('smile')}</button>
          <button class="tool-btn" data-tool="weather" title="天气" aria-label="天气">${wxTool('sun')}</button>
          <button class="tool-btn" data-tool="place" title="地点" aria-label="地点">${wxTool('location')}</button>
        </div>
        <div class="flex1"></div>
        <button class="btn btn--primary btn--sm" data-send>发布</button>
      </div>
    </div>

    <div class="timeline" id="timeline">
      ${App.posts.length ? App.posts.map(postHTML).join('') : emptyState('✍️', '还没有动态', '写下第一句话吧')}
    </div>

    <div style="text-align:center;margin-top:22px">
      ${App.hasMore ? '<button class="btn btn--ghost" id="loadMore">看更早的</button>' : ''}
    </div>
  `);

  bindComposer(el);
  bindPostEvents(el);

  const more = el.querySelector('#loadMore');
  if (more) {
    more.onclick = async () => {
      more.disabled = true;
      more.textContent = '加载中…';
      try {
        const d = await api(`/api/posts?limit=20&before=${App.nextBefore}`);
        App.posts = App.posts.concat(d.items || []);
        App.nextBefore = d.nextBefore;
        App.hasMore = d.hasMore;
        const tl = el.querySelector('#timeline');
        tl.insertAdjacentHTML('beforeend', (d.items || []).map(postHTML).join(''));
        bindPostEvents(el);
        if (!d.hasMore) more.remove();
        else { more.disabled = false; more.textContent = '看更早的'; }
      } catch (e) {
        toast(e.message, 'err');
        more.disabled = false;
        more.textContent = '看更早的';
      }
    };
  }
};

function bindComposer(el) {
  const input = el.querySelector('#composerInput');
  const previews = el.querySelector('#composerPreviews');
  const extra = el.querySelector('#composerExtra');
  if (!input) return;

  draft = { media: [], mood: '', weather: '', location: '' };

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.max(58, input.scrollHeight) + 'px';
  });

  function renderPreviews() {
    previews.innerHTML = draft.media.map((m, i) =>
      `<div class="preview"><img src="${esc(m.url)}" alt=""><button class="preview__del" data-i="${i}">✕</button></div>`
    ).join('');
    previews.querySelectorAll('.preview__del').forEach((b) => {
      b.onclick = () => { draft.media.splice(Number(b.dataset.i), 1); renderPreviews(); };
    });
  }

  function renderExtra() {
    const bits = [];
    if (draft.mood) bits.push(`<span class="tag">${MOODS[draft.mood].icon} ${MOODS[draft.mood].label}</span>`);
    if (draft.weather) bits.push(`<span class="tag tag--sage">${WEATHERS[draft.weather].icon} ${WEATHERS[draft.weather].label}</span>`);
    if (draft.location) bits.push(`<span class="tag tag--gray">📍 ${esc(draft.location)}</span>`);
    extra.innerHTML = bits.length
      ? `<div class="post__meta" style="margin:12px 0 0 50px">${bits.join('')}</div>`
      : '';
  }

  el.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.onclick = async () => {
      const tool = btn.dataset.tool;

      if (tool === 'photo') {
        const files = await pickFiles('image/*', true);
        if (!files.length) return;
        toast('正在处理图片…');
        try {
          const up = await uploadFiles(files);
          draft.media = draft.media.concat(up).slice(0, 9);
          renderPreviews();
        } catch (e) { toast(e.message, 'err'); }
        return;
      }

      if (tool === 'mood') {
        openModal({
          title: '现在的心情',
          body: `<div class="mood-row">${Object.entries(MOODS).map(([k, v]) =>
            `<button class="mood-pick${draft.mood === k ? ' active' : ''}" data-mood="${k}">
              <span class="mood-pick__ico">${v.icon}</span>
              <span class="mood-pick__label">${v.label}</span>
            </button>`).join('')}</div>`,
          onMount(modal, close) {
            modal.querySelectorAll('[data-mood]').forEach((b) => {
              b.onclick = () => { draft.mood = draft.mood === b.dataset.mood ? '' : b.dataset.mood; renderExtra(); close(); };
            });
          },
        });
        return;
      }

      if (tool === 'weather') {
        openModal({
          title: '今天的天气',
          body: `<div class="mood-row">${Object.entries(WEATHERS).map(([k, v]) =>
            `<button class="mood-pick${draft.weather === k ? ' active' : ''}" data-w="${k}">
              <span class="mood-pick__ico">${v.icon}</span>
              <span class="mood-pick__label">${v.label}</span>
            </button>`).join('')}</div>`,
          onMount(modal, close) {
            modal.querySelectorAll('[data-w]').forEach((b) => {
              b.onclick = () => { draft.weather = draft.weather === b.dataset.w ? '' : b.dataset.w; renderExtra(); close(); };
            });
          },
        });
        return;
      }

      if (tool === 'place') {
        openModal({
          title: '在哪儿',
          body: `<div class="field"><input class="input" id="placeInput" maxlength="60" placeholder="比如：家 / 公司楼下 / 那家面馆" value="${esc(draft.location)}"></div>`,
          footer: `<button class="btn btn--ghost" data-cancel>取消</button>
                   <button class="btn btn--primary" data-ok>好了</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-cancel]').onclick = close;
            modal.querySelector('[data-ok]').onclick = () => {
              draft.location = modal.querySelector('#placeInput').value.trim();
              renderExtra();
              close();
            };
          },
        });
      }
    };
  });

  const send = el.querySelector('[data-send]');
  send.onclick = async () => {
    const content = input.value.trim();
    if (!content && !draft.media.length) { toast('写点什么，或者放张照片', 'err'); return; }
    send.disabled = true;
    send.textContent = '发布中…';
    try {
      await api('/api/posts', {
        method: 'POST',
        body: {
          author: App.me,
          content,
          media: draft.media.map((m) => m.id),
          mood: draft.mood || null,
          weather: draft.weather || null,
          location: draft.location || null,
        },
      });
      toast('记下来了 💗', 'ok');
      App.go('timeline');
    } catch (e) {
      toast(e.message, 'err');
      send.disabled = false;
      send.textContent = '发布';
    }
  };
}

function bindPostEvents(root) {
  root.querySelectorAll('.post').forEach((card) => {
    if (card.dataset.bound) return;
    card.dataset.bound = '1';
    const id = Number(card.dataset.post);

    const img = card.querySelector('[data-zoom]');
    card.querySelectorAll('[data-zoom]').forEach((im) => {
      im.onclick = () => lightbox(im.dataset.zoom);
    });
    void img;

    const react = card.querySelector('[data-react]');
    if (react) {
      react.onclick = async () => {
        try {
          const r = await api(`/api/posts/${id}/react`, { method: 'POST', body: { author: App.me, kind: 'heart' } });
          const mine = (r.reactions || []).find((x) => x.author === App.me);
          const cnt = (r.reactions || []).filter((x) => x.kind === 'heart').length;
          react.classList.toggle('on', !!mine);
          react.querySelector('.react-btn__ico').textContent = mine ? '❤️' : '🤍';
          react.querySelector('span:last-child').textContent = cnt || '';
        } catch (e) { toast(e.message, 'err'); }
      };
    }

    const toggle = card.querySelector('[data-toggle-comments]');
    const box = card.querySelector('.post__comments');
    if (toggle && box) {
      toggle.onclick = () => {
        box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector('[data-comment-input]').focus();
      };
    }

    const cSend = card.querySelector('[data-comment-send]');
    const cInput = card.querySelector('[data-comment-input]');
    if (cSend && cInput) {
      const doSend = async () => {
        const content = cInput.value.trim();
        if (!content) return;
        try {
          const c = await api(`/api/posts/${id}/comments`, { method: 'POST', body: { author: App.me, content } });
          card.querySelector('[data-comments]').insertAdjacentHTML('beforeend', commentHTML(c));
          cInput.value = '';
          bindCommentDel(card);
          const cnt = card.querySelectorAll('[data-comments] .comment').length;
          toggle.querySelector('span:last-child').textContent = cnt || '';
        } catch (e) { toast(e.message, 'err'); }
      };
      cSend.onclick = doSend;
      cInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } };
    }
    bindCommentDel(card);

    const edit = card.querySelector('[data-edit]');
    if (edit) edit.onclick = () => openPostEdit(id);

    const del = card.querySelector('[data-del]');
    if (del) {
      del.onclick = () => confirmDialog('这条动态和它的照片会一起消失，确定吗？', async () => {
        try {
          await api(`/api/posts/${id}`, { method: 'DELETE' });
          card.style.transition = 'opacity .3s, transform .3s';
          card.style.opacity = '0';
          card.style.transform = 'scale(.96)';
          setTimeout(() => card.remove(), 300);
          toast('删掉了', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      });
    }
  });
}

function bindCommentDel(root) {
  root.querySelectorAll('[data-comment-del]').forEach((b) => {
    b.onclick = async () => {
      const row = b.closest('.comment');
      const id = Number(row.dataset.comment);
      try {
        await api(`/api/comments/${id}`, { method: 'DELETE' });
        row.remove();
      } catch (e) { toast(e.message, 'err'); }
    };
  });
}

async function openPostEdit(id) {
  const post = App.posts.find((p) => p.id === id);
  if (!post) return;
  openModal({
    title: '改一改',
    wide: true,
    body: `
      <div class="field">
        <textarea class="textarea" id="editContent" maxlength="5000">${esc(post.content || '')}</textarea>
      </div>
      <div class="row row--between">
        <label class="row" style="align-items:center;gap:8px;font-size:13.5px;cursor:pointer">
          <input type="checkbox" id="editPin" ${post.pinned ? 'checked' : ''}> 置顶这条
        </label>
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>取消</button>
             <button class="btn btn--primary" data-save>保存</button>`,
    onMount(modal, close) {
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-save]').onclick = async () => {
        try {
          await api(`/api/posts/${id}`, {
            method: 'PATCH',
            body: {
              content: modal.querySelector('#editContent').value.trim(),
              pinned: modal.querySelector('#editPin').checked,
            },
          });
          toast('改好了', 'ok');
          close();
          App.go(App.view);
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════
   周期
   ═══════════════════════════════════════════════════════ */

Views.cycle = async function (el) {
  el.innerHTML = loadingBlock();
  const c = await api('/api/cycle');
  App.cycle = c;

  const today = parseISO(App.today);
  if (!calCursor) calCursor = { y: today.getFullYear(), m: today.getMonth() };

  function renderCalendar() {
    const { y, m } = calCursor;
    const cells = monthCells(y, m);
    const dow = ['日', '一', '二', '三', '四', '五', '六'];
    return `
      <div class="cal">
        <div class="cal__head">
          <div class="cal__month">${y} 年 ${m + 1} 月</div>
          <div class="cal__nav">
            <button data-cal="-1">‹</button>
            <button data-cal="0">今</button>
            <button data-cal="1">›</button>
          </div>
        </div>
        <div class="cal__grid">
          ${dow.map((d) => `<div class="cal__dow">${d}</div>`).join('')}
          ${cells.map((cell) => {
            const mark = c.marks[cell.iso];
            const cls = ['cal__cell'];
            if (!cell.inMonth) cls.push('other');
            if (cell.iso === App.today) cls.push('today');
            if (mark) {
              if (mark.type === 'period') cls.push(mark.actual ? 'period' : 'period-pred');
              else if (mark.type === 'fertile') cls.push('fertile');
              else if (mark.type === 'ovulation') cls.push('ovulation');
              else if (mark.type === 'note') cls.push('note-dot');
            }
            return `<button class="${cls.join(' ')}" data-day="${cell.iso}">${cell.day}</button>`;
          }).join('')}
        </div>
        <div class="cal__legend">
          <span><i class="cal__dot" style="background:rgba(244,101,138,.5)"></i>经期</span>
          <span><i class="cal__dot" style="background:rgba(244,101,138,.22);border:1px dashed rgba(244,101,138,.5)"></i>预测</span>
          <span><i class="cal__dot" style="background:rgba(157,188,170,.6)"></i>易孕期</span>
          <span><i class="cal__dot" style="background:var(--sage-500)"></i>身体记录</span>
        </div>
      </div>`;
  }

  const conf = { high: '较准', medium: '一般', low: '数据还少' }[c.confidence] || '数据还少';

  el.innerHTML = page(`
    <div class="cycle-card" style="margin-bottom:18px">
      <div class="row row--between" style="align-items:flex-start;margin-bottom:16px">
        <div>
          <div class="section-head__title">${c.inPeriod ? `经期第 ${c.currentDay} 天` : (c.daysToNext !== null && c.daysToNext >= 0 ? `预计还有 ${c.daysToNext} 天` : '记录周期')}</div>
          <div class="section-head__desc">${c.reminder ? esc(c.reminder.text) : '点日历上的日期可以补记录'}</div>
        </div>
        <button class="btn btn--primary btn--sm" data-add-period>记一次</button>
      </div>
      <div class="cycle-stats">
        <div class="cycle-stat">
          <div class="cycle-stat__label">平均周期</div>
          <div class="cycle-stat__num">${c.avgCycle} <span>天</span></div>
        </div>
        <div class="cycle-stat">
          <div class="cycle-stat__label">平均经期</div>
          <div class="cycle-stat__num">${c.avgLength} <span>天</span></div>
        </div>
        <div class="cycle-stat">
          <div class="cycle-stat__label">下次预计</div>
          <div class="cycle-stat__num">${c.nextStart ? esc(c.nextStart.slice(5).replace('-', '/')) : '—'}</div>
        </div>
        <div class="cycle-stat">
          <div class="cycle-stat__label">排卵日</div>
          <div class="cycle-stat__num cycle-stat__num--sage">${c.ovulation ? esc(c.ovulation.slice(5).replace('-', '/')) : '—'}</div>
        </div>
      </div>
      <div class="post__meta" style="margin-top:14px;margin-bottom:0">
        <span class="tag tag--gray">样本 ${c.sampleCount} 次</span>
        <span class="tag ${c.confidence === 'high' ? 'tag--gold' : 'tag--gray'}">${conf}</span>
        ${c.inFertile ? '<span class="tag tag--sage">🌿 易孕期</span>' : ''}
      </div>
    </div>

    <div class="card" style="margin-bottom:18px" id="calBox">${renderCalendar()}</div>

    <div class="grid-2">
      <div class="card">
        <div class="section-head" style="margin-bottom:12px">
          <div>
            <div class="section-head__title">经期记录</div>
            <div class="section-head__desc">共 ${c.periods.length} 次</div>
          </div>
        </div>
        ${c.periods.length ? `<div class="list">${c.periods.map((p) => `
          <div class="item" data-period="${p.id}">
            <div class="item__body">
              <div class="item__title">${esc(p.start_date)}${p.end_date ? ` → ${esc(p.end_date)}` : ' <span class="tag tag--gray" style="margin-left:6px">进行中</span>'}</div>
              <div class="item__sub">${p.end_date ? `${diffDays(p.end_date, p.start_date) + 1} 天` : '未记录结束日'}${p.note ? ' · ' + esc(p.note) : ''}</div>
            </div>
            <div class="item__actions">
              <button class="mini-btn" data-edit-period="${p.id}">改</button>
              <button class="mini-btn" data-del-period="${p.id}">删</button>
            </div>
          </div>`).join('')}</div>`
        : emptyState('🌸', '还没有记录', '记下最近一次的开始日就好')}
      </div>

      <div class="card">
        <div class="section-head" style="margin-bottom:12px">
          <div>
            <div class="section-head__title">身体日记</div>
            <div class="section-head__desc">量、症状、心情</div>
          </div>
        </div>
        ${c.cycleDays.length ? `<div class="list">${c.cycleDays.slice(0, 14).map((d) => `
          <div class="item">
            <div class="item__body">
              <div class="item__title">${esc(d.date)} ${d.flow ? `<span class="tag">${esc(d.flow)}</span>` : ''}</div>
              <div class="item__sub">${esc([d.symptoms, d.mood, d.note].filter(Boolean).join(' · ') || '—')}</div>
            </div>
            <div class="item__actions">
              <button class="mini-btn" data-del-day="${d.id}">删</button>
            </div>
          </div>`).join('')}</div>`
        : emptyState('📝', '还没记过', '点日历里的某一天可以写')}
      </div>
    </div>
  `);

  /* 日历交互 */
  function rebindCalendar() {
    const box = el.querySelector('#calBox');
    box.innerHTML = renderCalendar();
    box.querySelectorAll('[data-cal]').forEach((b) => {
      b.onclick = () => {
        const step = Number(b.dataset.cal);
        if (step === 0) {
          const t = parseISO(App.today);
          calCursor = { y: t.getFullYear(), m: t.getMonth() };
        } else {
          const d = new Date(calCursor.y, calCursor.m + step, 1);
          calCursor = { y: d.getFullYear(), m: d.getMonth() };
        }
        rebindCalendar();
      };
    });
    box.querySelectorAll('[data-day]').forEach((b) => {
      b.onclick = () => openDayRecord(b.dataset.day);
    });
  }
  rebindCalendar();

  el.querySelector('[data-add-period]').onclick = () => openPeriodForm();

  el.querySelectorAll('[data-edit-period]').forEach((b) => {
    b.onclick = () => openPeriodForm(Number(b.dataset.editPeriod));
  });
  el.querySelectorAll('[data-del-period]').forEach((b) => {
    b.onclick = () => confirmDialog('删掉这次经期记录？', async () => {
      try {
        await api(`/api/cycle/periods/${b.dataset.delPeriod}`, { method: 'DELETE' });
        toast('删掉了', 'ok');
        App.go('cycle');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
  el.querySelectorAll('[data-del-day]').forEach((b) => {
    b.onclick = () => confirmDialog('删掉这天的记录？', async () => {
      try {
        await api(`/api/cycle/days/${b.dataset.delDay}`, { method: 'DELETE' });
        toast('删掉了', 'ok');
        App.go('cycle');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
};

function openPeriodForm(id) {
  const existing = id ? (App.cycle.periods || []).find((p) => p.id === id) : null;
  openModal({
    title: existing ? '改经期记录' : '记一次经期',
    body: `
      ${dateField('开始日期', 'pStart', existing ? existing.start_date : App.today)}
      ${dateField('结束日期（还没结束就空着）', 'pEnd', existing ? existing.end_date : '')}
      <div class="field">
        <label class="field__label">备注</label>
        <input class="input" id="pNote" maxlength="300" placeholder="比如：这次有点疼" value="${esc(existing ? existing.note : '')}">
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>取消</button>
             <button class="btn btn--primary" data-ok>保存</button>`,
    onMount(modal, close) {
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-ok]').onclick = async () => {
        const body = {
          start_date: modal.querySelector('#pStart').value,
          end_date: modal.querySelector('#pEnd').value || null,
          note: modal.querySelector('#pNote').value.trim() || null,
        };
        if (!body.start_date) { toast('选个开始日期', 'err'); return; }
        try {
          if (existing) await api(`/api/cycle/periods/${id}`, { method: 'PATCH', body });
          else await api('/api/cycle/periods', { method: 'POST', body });
          toast('记下了', 'ok');
          close();
          App.go('cycle');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

function openDayRecord(iso) {
  const existing = (App.cycle.cycleDays || []).find((d) => d.date === iso);
  const flows = ['少量', '中等', '较多', '结束'];
  openModal({
    title: dayLabel(iso),
    body: `
      <div class="field">
        <label class="field__label">量</label>
        <div class="row row--wrap" style="gap:6px" id="flowRow">
          ${flows.map((f) => `<button class="chip${existing && existing.flow === f ? ' active' : ''}" data-flow="${f}">${f}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field__label">身体感受</label>
        <input class="input" id="dSym" maxlength="200" placeholder="腰酸 / 肚子疼 / 有点困…" value="${esc(existing ? existing.symptoms : '')}">
      </div>
      <div class="field">
        <label class="field__label">心情</label>
        <input class="input" id="dMood" maxlength="20" placeholder="易怒 / 低落 / 还行" value="${esc(existing ? existing.mood : '')}">
      </div>
      <div class="field">
        <label class="field__label">想说的话</label>
        <textarea class="textarea textarea--auto" id="dNote" maxlength="500" placeholder="随便写">${esc(existing ? existing.note : '')}</textarea>
      </div>
      <div style="font-size:12px;color:var(--text-soft)">也可以只把这天标记成经期开始 👇</div>`,
    footer: `<button class="btn btn--ghost" data-cancel>关闭</button>
             <button class="btn btn--soft" data-period>标记经期开始</button>
             <button class="btn btn--primary" data-ok>保存</button>`,
    onMount(modal, close) {
      let flow = existing ? existing.flow : '';
      modal.querySelectorAll('[data-flow]').forEach((b) => {
        b.onclick = () => {
          flow = flow === b.dataset.flow ? '' : b.dataset.flow;
          modal.querySelectorAll('[data-flow]').forEach((x) => x.classList.toggle('active', x.dataset.flow === flow));
        };
      });
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-period]').onclick = async () => {
        try {
          await api('/api/cycle/periods', { method: 'POST', body: { start_date: iso } });
          toast('标记好了', 'ok');
          close();
          App.go('cycle');
        } catch (e) { toast(e.message, 'err'); }
      };
      modal.querySelector('[data-ok]').onclick = async () => {
        try {
          await api('/api/cycle/days', {
            method: 'POST',
            body: {
              date: iso,
              flow: flow || null,
              symptoms: modal.querySelector('#dSym').value.trim() || null,
              mood: modal.querySelector('#dMood').value.trim() || null,
              note: modal.querySelector('#dNote').value.trim() || null,
            },
          });
          toast('记下了', 'ok');
          close();
          App.go('cycle');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════
   亲密记录
   ═══════════════════════════════════════════════════════ */

Views.intimacy = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/intimacy?limit=120');
  App.intimacy = data;

  const groups = new Map();
  for (const it of data.items) {
    const key = it.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  el.innerHTML = page(`
    <div class="intimacy-hero">
      <div class="intimacy-hero__num">${data.daysSince === null ? '—' : data.daysSince}</div>
      <div class="intimacy-hero__label">${data.daysSince === null
        ? '还没有记录'
        : `天前 · ${esc(data.lastDate || '')}`}</div>
      <div class="row" style="justify-content:center;gap:26px;margin-top:16px">
        <div>
          <div style="font-family:var(--font-serif);font-size:19px;font-weight:600">${data.monthCount}</div>
          <div style="font-size:11.5px;color:var(--text-soft)">本月</div>
        </div>
        <div>
          <div style="font-family:var(--font-serif);font-size:19px;font-weight:600">${data.total}</div>
          <div style="font-size:11.5px;color:var(--text-soft)">累计</div>
        </div>
        <div>
          <div style="font-family:var(--font-serif);font-size:19px;font-weight:600">${Object.keys(data.monthMap).length}</div>
          <div style="font-size:11.5px;color:var(--text-soft)">有记录月</div>
        </div>
      </div>
      <button class="btn btn--primary btn--sm" style="margin-top:18px" data-add>记一次</button>
    </div>

    ${data.items.length ? Array.from(groups.entries()).map(([month, items]) => `
      <div style="margin-bottom:20px">
        <div class="section-head" style="margin-bottom:10px">
          <div class="section-head__title">${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月</div>
          <div class="section-head__desc">${items.length} 次</div>
        </div>
        <div class="list">
          ${items.map((it) => `
            <div class="intimacy-item">
              <div class="intimacy-item__date">
                <div class="intimacy-item__day">${esc(it.date.slice(8))}</div>
                <div class="intimacy-item__mon">${esc(it.date.slice(5, 7))}月</div>
              </div>
              <div class="intimacy-item__body">
                <div class="intimacy-item__meta">
                  ${it.time ? `<span class="tag tag--gray">${esc(it.time)}</span>` : ''}
                  <span class="tag ${it.protected ? 'tag--sage' : 'tag--gold'}">${it.protected ? '🛡 有措施' : '⚠️ 无措施'}</span>
                  ${it.rating ? starsHTML(it.rating) : ''}
                  ${it.place ? `<span class="tag tag--gray">📍 ${esc(it.place)}</span>` : ''}
                </div>
                ${it.note ? `<div class="intimacy-item__note">${esc(it.note)}</div>` : ''}
              </div>
              <div class="item__actions">
                <button class="mini-btn" data-edit="${it.id}">改</button>
                <button class="mini-btn" data-del="${it.id}">删</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')
      : emptyState('💞', '还没有记录', '这里只有你们两个人看得到')}
  `);

  el.querySelector('[data-add]').onclick = () => openIntimacyForm();
  el.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => openIntimacyForm(Number(b.dataset.edit));
  });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => confirmDialog('删掉这条记录？', async () => {
      try {
        await api(`/api/intimacy/${b.dataset.del}`, { method: 'DELETE' });
        toast('删掉了', 'ok');
        App.go('intimacy');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
};

function openIntimacyForm(id) {
  const existing = id ? (App.intimacy.items || []).find((x) => x.id === id) : null;
  let rating = existing ? existing.rating || 0 : 0;
  let prot = existing ? existing.protected : true;

  openModal({
    title: existing ? '改一改' : '记一次',
    body: `
      <div class="row">
        <div class="flex1">${dateField('日期', 'iDate', existing ? existing.date : App.today)}</div>
        <div class="flex1">
          <div class="field">
            <label class="field__label">时间</label>
            <input class="input" type="time" id="iTime" value="${esc(existing ? existing.time || '' : '')}">
          </div>
        </div>
      </div>
      <div class="field">
        <label class="field__label">感受</label>
        <div id="iStars">${starsPick(rating)}</div>
      </div>
      <div class="field">
        <label class="field__label">措施</label>
        <div class="row row--wrap" style="gap:6px" id="iProt">
          <button class="chip${prot ? ' active' : ''}" data-p="1">有措施</button>
          <button class="chip${prot ? '' : ' active'}" data-p="0">无措施</button>
        </div>
      </div>
      <div class="field">
        <label class="field__label">地点</label>
        <input class="input" id="iPlace" maxlength="60" placeholder="家里 / 酒店…" value="${esc(existing ? existing.place || '' : '')}">
      </div>
      <div class="field">
        <label class="field__label">想说的</label>
        <textarea class="textarea textarea--auto" id="iNote" maxlength="1000" placeholder="只有我们看得到">${esc(existing ? existing.note || '' : '')}</textarea>
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>取消</button>
             <button class="btn btn--primary" data-ok>保存</button>`,
    onMount(modal, close) {
      modal.querySelectorAll('#iStars button').forEach((b) => {
        b.onclick = () => {
          rating = Number(b.dataset.v) === rating ? 0 : Number(b.dataset.v);
          modal.querySelectorAll('#iStars button').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) <= rating));
        };
      });
      modal.querySelectorAll('#iProt [data-p]').forEach((b) => {
        b.onclick = () => {
          prot = b.dataset.p === '1';
          modal.querySelectorAll('#iProt [data-p]').forEach((x) => x.classList.toggle('active', (x.dataset.p === '1') === prot));
        };
      });
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-ok]').onclick = async () => {
        const body = {
          date: modal.querySelector('#iDate').value,
          time: modal.querySelector('#iTime').value || null,
          protected: prot,
          rating: rating || null,
          place: modal.querySelector('#iPlace').value.trim() || null,
          note: modal.querySelector('#iNote').value.trim() || null,
          author: App.me,
        };
        if (!body.date) { toast('选个日期', 'err'); return; }
        try {
          if (existing) await api(`/api/intimacy/${id}`, { method: 'PATCH', body });
          else await api('/api/intimacy', { method: 'POST', body });
          toast('记下了', 'ok');
          close();
          App.go('intimacy');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════
   纪念日
   ═══════════════════════════════════════════════════════ */

Views.anniversaries = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/anniversaries');
  App.anniversaries = data.items || [];

  el.innerHTML = page(`
    <div class="section-head">
      <div>
        <div class="section-head__title">我们的日子</div>
        <div class="section-head__desc">${App.anniversaries.length} 个值得记住的日子</div>
      </div>
      <button class="btn btn--primary btn--sm" data-add>加一个</button>
    </div>
    <div class="list">
      ${App.anniversaries.length ? App.anniversaries.map((a) => `
        <div class="item" style="align-items:center">
          <div class="anniv-row__icon">${esc(a.icon || '💗')}</div>
          <div class="item__body">
            <div class="item__title">${esc(a.title)}</div>
            <div class="item__sub">
              ${esc(a.date)}${a.repeatYearly ? ' · 每年' : ' · 仅一次'}
              ${a.years ? ` · 第 ${a.years} 年` : ''}
              ${a.passedDays >= 0 ? ` · 已经 ${a.passedDays} 天` : ''}
              ${a.note ? `<br>${esc(a.note)}` : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${a.daysTo !== null
              ? `<div class="anniv-row__num">${a.daysTo === 0 ? '今天' : a.daysTo}</div>
                 <div class="anniv-row__unit">${a.daysTo === 0 ? '🎉' : '天后'}</div>`
              : '<div style="font-size:12px;color:var(--text-soft)">已过</div>'}
          </div>
          <div class="item__actions">
            <button class="mini-btn" data-edit="${a.id}">改</button>
            <button class="mini-btn" data-del="${a.id}">删</button>
          </div>
        </div>`).join('')
      : emptyState('🎂', '还没有纪念日', '在一起的日期、第一次见面、第一次旅行…')}
    </div>
  `);

  el.querySelector('[data-add]').onclick = () => openAnnivForm();
  el.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => openAnnivForm(Number(b.dataset.edit));
  });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => confirmDialog('删掉这个纪念日？', async () => {
      try {
        await api(`/api/anniversaries/${b.dataset.del}`, { method: 'DELETE' });
        toast('删掉了', 'ok');
        App.go('anniversaries');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
};

function openAnnivForm(id) {
  const existing = id ? (App.anniversaries || []).find((a) => a.id === id) : null;
  const icons = ['💗', '🎂', '🌹', '🎄', '✈️', '🏠', '💍', '🎁', '🌙', '⭐️', '🍰', '🐱'];
  let icon = existing ? existing.icon || '💗' : '💗';
  let repeat = existing ? existing.repeatYearly : true;

  openModal({
    title: existing ? '改一改' : '新的纪念日',
    body: `
      <div class="field">
        <label class="field__label">名字</label>
        <input class="input" id="aTitle" maxlength="80" placeholder="在一起的第一天" value="${esc(existing ? existing.title : '')}">
      </div>
      ${dateField('日期', 'aDate', existing ? existing.date : App.settings['couple.start_date'] || App.today)}
      <div class="field">
        <label class="field__label">图标</label>
        <div class="row row--wrap" style="gap:5px" id="aIcons">
          ${icons.map((i) => `<button class="chip${icon === i ? ' active' : ''}" data-icon="${i}" style="padding:5px 9px">${i}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field__label">每年重复</label>
        <div class="row" style="gap:6px" id="aRepeat">
          <button class="chip${repeat ? ' active' : ''}" data-r="1">每年</button>
          <button class="chip${repeat ? '' : ' active'}" data-r="0">只这一次</button>
        </div>
      </div>
      <div class="field">
        <label class="field__label">备注</label>
        <textarea class="textarea textarea--auto" id="aNote" maxlength="500" placeholder="想记住的细节">${esc(existing ? existing.note || '' : '')}</textarea>
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>取消</button>
             <button class="btn btn--primary" data-ok>保存</button>`,
    onMount(modal, close) {
      modal.querySelectorAll('#aIcons [data-icon]').forEach((b) => {
        b.onclick = () => {
          icon = b.dataset.icon;
          modal.querySelectorAll('#aIcons [data-icon]').forEach((x) => x.classList.toggle('active', x.dataset.icon === icon));
        };
      });
      modal.querySelectorAll('#aRepeat [data-r]').forEach((b) => {
        b.onclick = () => {
          repeat = b.dataset.r === '1';
          modal.querySelectorAll('#aRepeat [data-r]').forEach((x) => x.classList.toggle('active', (x.dataset.r === '1') === repeat));
        };
      });
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-ok]').onclick = async () => {
        const body = {
          title: modal.querySelector('#aTitle').value.trim(),
          date: modal.querySelector('#aDate').value,
          icon,
          repeatYearly: repeat,
          note: modal.querySelector('#aNote').value.trim() || null,
        };
        if (!body.title) { toast('给它起个名字吧', 'err'); return; }
        if (!body.date) { toast('选个日期', 'err'); return; }
        try {
          if (existing) await api(`/api/anniversaries/${id}`, { method: 'PATCH', body });
          else await api('/api/anniversaries', { method: 'POST', body });
          toast('记下了', 'ok');
          close();
          App.go('anniversaries');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════
   愿望清单
   ═══════════════════════════════════════════════════════ */

Views.wishes = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/wishes');
  const all = data.items || [];
  App.wishes = all;

  const shown = all.filter((w) => (wishFilter === 'todo' ? !w.done : wishFilter === 'done' ? w.done : true));

  el.innerHTML = page(`
    <div class="section-head">
      <div>
        <div class="section-head__title">想一起做的事</div>
        <div class="section-head__desc">${all.filter((w) => w.done).length} / ${all.length} 已完成</div>
      </div>
      <button class="btn btn--primary btn--sm" data-add>写一个</button>
    </div>

    <div class="row row--wrap" style="gap:6px;margin-bottom:16px">
      <button class="chip${wishFilter === 'todo' ? ' active' : ''}" data-f="todo">还没做</button>
      <button class="chip${wishFilter === 'done' ? ' active' : ''}" data-f="done">已完成</button>
      <button class="chip${wishFilter === 'all' ? ' active' : ''}" data-f="all">全部</button>
    </div>

    <div class="list">
      ${shown.length ? shown.map((w) => `
        <div class="item${w.done ? ' item--done' : ''}">
          <button class="check${w.done ? ' on' : ''}" data-toggle="${w.id}">✓</button>
          <div class="item__body">
            <div class="item__title">${esc(w.title)}</div>
            <div class="item__sub">
              ${esc(nameOf(w.author))} 写下
              ${w.category ? ` · ${esc(wishCatLabel(w.category))}` : ''}
              ${w.targetDate ? ` · 想在 ${esc(w.targetDate)} 前` : ''}
              ${w.note ? `<br>${esc(w.note)}` : ''}
            </div>
          </div>
          <div class="item__actions">
            <button class="mini-btn" data-edit="${w.id}">改</button>
            <button class="mini-btn" data-del="${w.id}">删</button>
          </div>
        </div>`).join('')
      : emptyState('🌟', wishFilter === 'done' ? '还没有完成的' : '清单空空的', '写一个想一起实现的愿望')}
    </div>
  `);

  el.querySelectorAll('[data-f]').forEach((b) => {
    b.onclick = () => { wishFilter = b.dataset.f; App.go('wishes'); };
  });
  el.querySelector('[data-add]').onclick = () => openWishForm();

  el.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const w = all.find((x) => x.id === Number(b.dataset.toggle));
      if (!w) return;
      try {
        await api(`/api/wishes/${w.id}`, { method: 'PATCH', body: { done: !w.done } });
        if (!w.done) toast('又实现一个 🎉', 'ok');
        App.go('wishes');
      } catch (e) { toast(e.message, 'err'); }
    };
  });
  el.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => openWishForm(Number(b.dataset.edit));
  });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => confirmDialog('删掉这个愿望？', async () => {
      try {
        await api(`/api/wishes/${b.dataset.del}`, { method: 'DELETE' });
        toast('删掉了', 'ok');
        App.go('wishes');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
};

function openWishForm(id) {
  const existing = id ? (App.wishes || []).find((w) => w.id === id) : null;
  const cats = WISH_CATS;
  let cat = existing ? existing.category || '' : '';
  openModal({
    title: existing ? '改一改这个愿望' : '想一起做的事',
    body: `
      <div class="field">
        <label class="field__label">愿望</label>
        <input class="input" id="wTitle" maxlength="120" placeholder="去看一次海" value="${esc(existing ? existing.title : '')}">
      </div>
      <div class="field">
        <label class="field__label">分类</label>
        <div class="row row--wrap" style="gap:6px" id="wCats">
          ${cats.map(([k, l]) => `<button class="chip${cat === k ? ' active' : ''}" data-c="${k}">${l}</button>`).join('')}
        </div>
      </div>
      ${dateField('想在什么时候之前（可不填）', 'wDate', existing ? existing.targetDate || '' : '')}
      <div class="field">
        <label class="field__label">补充</label>
        <textarea class="textarea textarea--auto" id="wNote" maxlength="500" placeholder="细节、为什么想做">${esc(existing ? existing.note || '' : '')}</textarea>
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>取消</button>
             <button class="btn btn--primary" data-ok>保存</button>`,
    onMount(modal, close) {
      modal.querySelectorAll('#wCats [data-c]').forEach((b) => {
        b.onclick = () => {
          cat = cat === b.dataset.c ? '' : b.dataset.c;
          modal.querySelectorAll('#wCats [data-c]').forEach((x) => x.classList.toggle('active', x.dataset.c === cat));
        };
      });
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-ok]').onclick = async () => {
        const body = {
          title: modal.querySelector('#wTitle').value.trim(),
          category: cat || null,
          targetDate: modal.querySelector('#wDate').value || null,
          note: modal.querySelector('#wNote').value.trim() || null,
          author: existing ? existing.author : App.me,
        };
        if (!body.title) { toast('写下你想一起做的事', 'err'); return; }
        try {
          if (id) await api(`/api/wishes/${id}`, { method: 'PATCH', body });
          else await api('/api/wishes', { method: 'POST', body });
          toast(existing ? '改好了' : '记下了', 'ok');
          close();
          App.go('wishes');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════
   心情打卡
   ═══════════════════════════════════════════════════════ */

Views.moods = async function (el) {
  el.innerHTML = loadingBlock();
  const today = parseISO(App.today);
  if (!moodCursor) moodCursor = { y: today.getFullYear(), m: today.getMonth() };
  const monthKey = `${moodCursor.y}-${String(moodCursor.m + 1).padStart(2, '0')}`;
  const data = await api(`/api/moods?month=${monthKey}`);

  const byDate = new Map();
  for (const it of data.items) {
    if (!byDate.has(it.date)) byDate.set(it.date, {});
    byDate.get(it.date)[it.author] = it;
  }

  const myToday = (data.today || []).find((x) => x.author === App.me);
  const otherToday = (data.today || []).find((x) => x.author !== App.me);

  const cells = monthCells(moodCursor.y, moodCursor.m);

  el.innerHTML = page(`
    <div class="card" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:14px">
        <div>
          <div class="section-head__title">今天的心情</div>
          <div class="section-head__desc">${esc(dayLabel(App.today))}</div>
        </div>
        <div class="me-hint">以 ${esc(nameOf(App.me))} 的身份打卡</div>
      </div>
      <div class="mood-row" id="moodPick">
        ${Object.entries(MOODS).map(([k, v]) => `
          <button class="mood-pick${myToday && myToday.mood === k ? ' active' : ''}" data-m="${k}">
            <span class="mood-pick__ico">${v.icon}</span>
            <span class="mood-pick__label">${v.label}</span>
          </button>`).join('')}
      </div>
      <div class="field" style="margin-top:16px;margin-bottom:0">
        <input class="input" id="moodNote" maxlength="200" placeholder="一句话说说现在（可不填）" value="${esc(myToday ? myToday.note || '' : '')}">
      </div>
      <div class="row" style="margin-top:12px;align-items:center">
        <button class="btn btn--primary btn--sm" data-save>打卡</button>
        <div class="flex1"></div>
        <div style="font-size:12.5px;color:var(--text-soft)">
          ${otherToday ? `${esc(nameOf(otherToday.author))} 今天：${MOODS[otherToday.mood] ? MOODS[otherToday.mood].icon + ' ' + MOODS[otherToday.mood].label : ''}` : `${esc(nameOf(App.me === 'a' ? 'b' : 'a'))} 今天还没打卡`}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="cal__head">
        <div class="cal__month">${moodCursor.y} 年 ${moodCursor.m + 1} 月</div>
        <div class="cal__nav">
          <button data-nav="-1">‹</button>
          <button data-nav="0">今</button>
          <button data-nav="1">›</button>
        </div>
      </div>
      <div class="mood-heat">
        ${['日', '一', '二', '三', '四', '五', '六'].map((d) => `<div class="mood-heat__dow">${d}</div>`).join('')}
        ${cells.map((c) => {
          if (!c.inMonth) return '<div style="aspect-ratio:1"></div>';
          const rec = byDate.get(c.iso) || {};
          const a = rec.a, b = rec.b;
          const cls = ['mood-cell'];
          if (a && b) cls.push('mood-cell--both');
          else if (a) cls.push('mood-cell--a');
          else if (b) cls.push('mood-cell--b');
          const ico = a ? MOODS[a.mood]?.icon : (b ? MOODS[b.mood]?.icon : '');
          return `<div class="${cls.join(' ')}" title="${esc(c.iso)}${a ? ' · ' + nameA() + ' ' + (MOODS[a.mood]?.label || '') : ''}${b ? ' · ' + nameB() + ' ' + (MOODS[b.mood]?.label || '') : ''}">
            <span style="font-size:15px">${ico || ''}</span>
            <span class="mood-cell__date">${c.day}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="cal__legend">
        <span><i class="cal__dot" style="background:rgba(244,101,138,.5)"></i>${esc(nameA())}</span>
        <span><i class="cal__dot" style="background:rgba(232,193,121,.8)"></i>${esc(nameB())}</span>
        <span><i class="cal__dot" style="background:rgba(168,144,154,.25)"></i>没打卡</span>
      </div>
    </div>
  `);

  let picked = myToday ? myToday.mood : '';
  el.querySelectorAll('#moodPick [data-m]').forEach((b) => {
    b.onclick = () => {
      picked = picked === b.dataset.m ? '' : b.dataset.m;
      el.querySelectorAll('#moodPick [data-m]').forEach((x) => x.classList.toggle('active', x.dataset.m === picked));
    };
  });

  el.querySelector('[data-save]').onclick = async () => {
    if (!picked) { toast('选一个心情吧', 'err'); return; }
    try {
      await api('/api/moods', {
        method: 'POST',
        body: { date: App.today, author: App.me, mood: picked, note: el.querySelector('#moodNote').value.trim() || null },
      });
      toast('打卡成功 🫧', 'ok');
      App.go('moods');
    } catch (e) { toast(e.message, 'err'); }
  };

  el.querySelectorAll('[data-nav]').forEach((b) => {
    b.onclick = () => {
      const step = Number(b.dataset.nav);
      if (step === 0) {
        const t = parseISO(App.today);
        moodCursor = { y: t.getFullYear(), m: t.getMonth() };
      } else {
        const d = new Date(moodCursor.y, moodCursor.m + step, 1);
        moodCursor = { y: d.getFullYear(), m: d.getMonth() };
      }
      App.go('moods');
    };
  });
};

/* ═══════════════════════════════════════════════════════
   旅行足迹
   ═══════════════════════════════════════════════════════ */

Views.trips = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/trips');
  const items = data.items || [];
  App.trips = items;

  el.innerHTML = page(`
    <div class="section-head">
      <div>
        <div class="section-head__title">一起去过的地方</div>
        <div class="section-head__desc">${items.length} 段旅程</div>
      </div>
      <button class="btn btn--primary btn--sm" data-add>加一段</button>
    </div>

    ${items.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:16px">
      ${items.map((t) => {
        const cover = t.photos && t.photos.length ? t.photos[0].url : null;
        return `<div class="trip" data-trip="${t.id}">
          <div class="trip__cover">
            ${cover ? `<img src="${esc(cover)}" alt="">` : '🧳'}
            ${t.place ? `<div class="trip__place">📍 ${esc(t.place)}</div>` : ''}
          </div>
          <div class="trip__body">
            <div class="trip__title">${esc(t.title)}</div>
            <div class="trip__date">${esc(t.startDate || '')}${t.endDate ? ' → ' + esc(t.endDate) : ''}</div>
            ${t.note ? `<div class="trip__note">${esc(t.note)}</div>` : ''}
            ${t.photos && t.photos.length > 1 ? `<div class="trip__thumbs">
              ${t.photos.slice(0, 6).map((p) => `<img src="${esc(p.url)}" alt="" data-zoom="${esc(p.url)}">`).join('')}
            </div>` : ''}
            <div class="row" style="margin-top:12px;gap:6px">
              <button class="btn btn--sm btn--ghost" data-edit="${t.id}">编辑</button>
              <button class="btn btn--sm btn--danger" data-del="${t.id}">删除</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`
    : emptyState('🧳', '还没有旅行记录', '第一次出门也算，记下来吧')}
  `);

  el.querySelector('[data-add]').onclick = () => openTripForm();
  el.querySelectorAll('[data-zoom]').forEach((im) => { im.onclick = () => lightbox(im.dataset.zoom); });
  el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openTripForm(Number(b.dataset.edit)); });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => confirmDialog('删掉这段旅程和它的照片？', async () => {
      try {
        await api(`/api/trips/${b.dataset.del}`, { method: 'DELETE' });
        toast('删掉了', 'ok');
        App.go('trips');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
};

function openTripForm(id) {
  const existing = id ? (App.trips || []).find((t) => t.id === id) : null;
  let media = existing && existing.photos ? existing.photos.map((p) => ({ id: p.id, url: p.url })) : [];
  openModal({
    title: existing ? '改这段旅程' : '新的旅程',
    wide: true,
    body: `
      <div class="field">
        <label class="field__label">这次旅行叫什么</label>
        <input class="input" id="tTitle" maxlength="100" placeholder="海边的四天" value="${esc(existing ? existing.title : '')}">
      </div>
      <div class="field">
        <label class="field__label">去了哪里</label>
        <input class="input" id="tPlace" maxlength="60" placeholder="青岛" value="${esc(existing ? existing.place || '' : '')}">
      </div>
      <div class="row">
        <div class="flex1">${dateField('出发', 'tStart', existing ? existing.startDate || '' : App.today)}</div>
        <div class="flex1">${dateField('回来', 'tEnd', existing ? existing.endDate || '' : '')}</div>
      </div>
      <div class="field">
        <label class="field__label">照片</label>
        <div class="composer__previews" id="tPhotos" style="margin:0"></div>
        <button class="btn btn--sm btn--ghost" style="margin-top:9px" data-pick>选照片</button>
      </div>
      <div class="field">
        <label class="field__label">记下点什么</label>
        <textarea class="textarea" id="tNote" maxlength="2000" placeholder="那几天发生了什么">${esc(existing ? existing.note || '' : '')}</textarea>
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>取消</button>
             <button class="btn btn--primary" data-ok>保存</button>`,
    onMount(modal, close) {
      const box = modal.querySelector('#tPhotos');
      function draw() {
        box.innerHTML = media.map((m, i) =>
          `<div class="preview"><img src="${esc(m.url)}" alt=""><button class="preview__del" data-i="${i}">✕</button></div>`).join('');
        box.querySelectorAll('.preview__del').forEach((b) => {
          b.onclick = () => { media.splice(Number(b.dataset.i), 1); draw(); };
        });
      }
      draw();
      modal.querySelector('[data-pick]').onclick = async () => {
        const files = await pickFiles('image/*', true);
        if (!files.length) return;
        toast('正在处理…');
        try {
          const up = await uploadFiles(files);
          media = media.concat(up).slice(0, 12);
          draw();
        } catch (e) { toast(e.message, 'err'); }
      };
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-ok]').onclick = async () => {
        const body = {
          title: modal.querySelector('#tTitle').value.trim(),
          place: modal.querySelector('#tPlace').value.trim() || null,
          startDate: modal.querySelector('#tStart').value || null,
          endDate: modal.querySelector('#tEnd').value || null,
          note: modal.querySelector('#tNote').value.trim() || null,
          media: media.map((m) => m.id),
        };
        if (!body.title) { toast('这次旅行叫什么？', 'err'); return; }
        try {
          if (id) await api(`/api/trips/${id}`, { method: 'PATCH', body });
          else await api('/api/trips', { method: 'POST', body });
          toast('记下了', 'ok');
          close();
          App.go('trips');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════
   电影清单
   ═══════════════════════════════════════════════════════ */

Views.movies = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/movies');
  const all = data.items || [];
  App.movies = all;
  const shown = all.filter((m) => (movieFilter === 'all' ? true : m.status === movieFilter));

  const kinds = { movie: '电影', tv: '剧集', anime: '动画', doc: '纪录片' };
  const statusLabel = { want: '想看', watching: '在看', done: '看过' };

  el.innerHTML = page(`
    <div class="section-head">
      <div>
        <div class="section-head__title">一起看过的</div>
        <div class="section-head__desc">${all.filter((m) => m.status === 'done').length} 部看完 · ${all.filter((m) => m.status !== 'done').length} 部待看</div>
      </div>
      <button class="btn btn--primary btn--sm" data-add>加一部</button>
    </div>

    <div class="row row--wrap" style="gap:6px;margin-bottom:16px">
      ${[['all', '全部'], ['want', '想看'], ['watching', '在看'], ['done', '看过']].map(([k, l]) =>
        `<button class="chip${movieFilter === k ? ' active' : ''}" data-f="${k}">${l}</button>`).join('')}
    </div>

    ${shown.length ? `<div class="film-grid">
      ${shown.map((m) => `
        <div class="film" data-movie="${m.id}">
          <div class="film__status"><span class="tag ${m.status === 'done' ? 'tag--sage' : m.status === 'watching' ? 'tag--gold' : 'tag--gray'}">${statusLabel[m.status]}</span></div>
          <div class="film__title">${esc(m.title)}</div>
          <div class="film__kind">${kinds[m.kind] || '电影'} · ${esc(nameOf(m.author))} 加的</div>
          ${m.rating ? `<div class="film__rating">${starString(m.rating)}</div>` : ''}
          ${m.review ? `<div class="film__review">${esc(m.review)}</div>` : ''}
          <div class="row" style="margin-top:10px;gap:5px">
            <button class="btn btn--sm btn--ghost" data-edit="${m.id}">改</button>
            <button class="mini-btn" data-del="${m.id}">删</button>
          </div>
        </div>`).join('')}
    </div>`
    : emptyState('🎬', '片单空着', '加一部想一起看的')}
  `);

  el.querySelector('[data-add]').onclick = () => openMovieForm();
  el.querySelectorAll('[data-f]').forEach((b) => {
    b.onclick = () => { movieFilter = b.dataset.f; App.go('movies'); };
  });
  el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openMovieForm(Number(b.dataset.edit)); });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => confirmDialog('从片单里删掉？', async () => {
      try {
        await api(`/api/movies/${b.dataset.del}`, { method: 'DELETE' });
        toast('删掉了', 'ok');
        App.go('movies');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
};

function openMovieForm(id) {
  const existing = id ? (App.movies || []).find((m) => m.id === id) : null;
  let status = existing ? existing.status : 'want';
  let kind = existing ? existing.kind : 'movie';
  let rating = existing ? Math.round(Number(existing.rating) || 0) : 0;

  openModal({
    title: existing ? '改一改' : '加一部',
    body: `
      <div class="field">
        <label class="field__label">名字</label>
        <input class="input" id="mvTitle" maxlength="120" placeholder="想看的片子" value="${esc(existing ? existing.title : '')}">
      </div>
      <div class="field">
        <label class="field__label">类型</label>
        <div class="row row--wrap" style="gap:6px" id="mvKind">
          ${[['movie', '电影'], ['tv', '剧集'], ['anime', '动画'], ['doc', '纪录片']].map(([k, l]) =>
            `<button class="chip${kind === k ? ' active' : ''}" data-k="${k}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field__label">状态</label>
        <div class="row row--wrap" style="gap:6px" id="mvStatus">
          ${[['want', '想看'], ['watching', '在看'], ['done', '看过了']].map(([k, l]) =>
            `<button class="chip${status === k ? ' active' : ''}" data-s="${k}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field__label">打分</label>
        <div id="mvStars">${starsPick(rating)}</div>
      </div>
      <div class="field">
        <label class="field__label">一句话影评</label>
        <textarea class="textarea textarea--auto" id="mvReview" maxlength="1000">${esc(existing ? existing.review || '' : '')}</textarea>
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>取消</button>
             <button class="btn btn--primary" data-ok>保存</button>`,
    onMount(modal, close) {
      modal.querySelectorAll('#mvKind [data-k]').forEach((b) => {
        b.onclick = () => {
          kind = b.dataset.k;
          modal.querySelectorAll('#mvKind [data-k]').forEach((x) => x.classList.toggle('active', x.dataset.k === kind));
        };
      });
      modal.querySelectorAll('#mvStatus [data-s]').forEach((b) => {
        b.onclick = () => {
          status = b.dataset.s;
          modal.querySelectorAll('#mvStatus [data-s]').forEach((x) => x.classList.toggle('active', x.dataset.s === status));
        };
      });
      modal.querySelectorAll('#mvStars button').forEach((b) => {
        b.onclick = () => {
          rating = Number(b.dataset.v) === rating ? 0 : Number(b.dataset.v);
          modal.querySelectorAll('#mvStars button').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) <= rating));
        };
      });
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-ok]').onclick = async () => {
        const body = {
          title: modal.querySelector('#mvTitle').value.trim(),
          kind, status,
          rating: rating || null,
          review: modal.querySelector('#mvReview').value.trim() || null,
          author: existing ? existing.author : App.me,
        };
        if (!body.title) { toast('片名叫什么？', 'err'); return; }
        try {
          if (id) await api(`/api/movies/${id}`, { method: 'PATCH', body });
          else await api('/api/movies', { method: 'POST', body });
          toast('好了', 'ok');
          close();
          App.go('movies');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════
   时光胶囊
   ═══════════════════════════════════════════════════════ */

Views.capsules = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/capsules');
  const items = data.items || [];

  el.innerHTML = page(`
    <div class="section-head">
      <div>
        <div class="section-head__title">写给未来的信</div>
        <div class="section-head__desc">封好，等到那天才能打开</div>
      </div>
      <button class="btn btn--primary btn--sm" data-add>写一封</button>
    </div>

    ${items.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
      ${items.map((c) => `
        <div class="capsule${c.unlocked ? '' : ' capsule--locked'}" data-capsule="${c.id}">
          <div class="capsule__seal">${c.unlocked ? '📬' : '🔒'}</div>
          <div class="capsule__title">${esc(c.title)}</div>
          <div class="capsule__meta">
            ${esc(nameOf(c.author))} 写于 ${esc(humanTime(c.createdAt))}<br>
            ${c.unlocked ? `已于 ${esc(c.unlockDate)} 开启` : `将在 ${esc(c.unlockDate)} 开启 · 还有 ${c.daysTo} 天`}
          </div>
          ${c.unlocked
            ? `<div class="capsule__content">${esc(c.content || '')}</div>`
            : `<div class="capsule__locked-hint">✉️ 密封中 · ${esc(c.preview || '')}</div>`}
          <div class="row" style="margin-top:12px;gap:6px">
            ${c.unlocked ? '' : `<button class="btn btn--sm btn--ghost" data-open="${c.id}">现在能开吗</button>`}
            <button class="mini-btn" data-del="${c.id}">删</button>
          </div>
        </div>`).join('')}
    </div>`
    : emptyState('⏳', '还没有胶囊', '写给一年后的我们')}
  `);

  el.querySelector('[data-add]').onclick = () => openCapsuleForm();
  el.querySelectorAll('[data-open]').forEach((b) => {
    b.onclick = async () => {
      try {
        const r = await api(`/api/capsules/${b.dataset.open}/open`, { method: 'POST' });
        openModal({
          title: '打开了',
          wide: true,
          body: `<div class="capsule__content" style="margin-top:0;padding-top:0;border:none">${esc(r.content)}</div>`,
        });
        App.go('capsules');
      } catch (e) { toast(e.message, 'err'); }
    };
  });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => confirmDialog('把这封信烧掉？', async () => {
      try {
        await api(`/api/capsules/${b.dataset.del}`, { method: 'DELETE' });
        toast('删掉了', 'ok');
        App.go('capsules');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
};

function openCapsuleForm() {
  const d = parseISO(App.today);
  d.setFullYear(d.getFullYear() + 1);
  openModal({
    title: '写一封给未来的信',
    wide: true,
    body: `
      <div class="field">
        <label class="field__label">标题</label>
        <input class="input" id="cTitle" maxlength="100" placeholder="给一年后的我们">
      </div>
      ${dateField('什么时候可以打开', 'cDate', isoOf(d))}
      <div class="field">
        <label class="field__label">内容</label>
        <textarea class="textarea" id="cContent" maxlength="8000" style="min-height:180px" placeholder="想对未来的我们说什么…"></textarea>
      </div>`,
    footer: `<button class="btn btn--ghost" data-cancel>取消</button>
             <button class="btn btn--primary" data-ok>封好</button>`,
    onMount(modal, close) {
      modal.querySelector('[data-cancel]').onclick = close;
      modal.querySelector('[data-ok]').onclick = async () => {
        const body = {
          title: modal.querySelector('#cTitle').value.trim(),
          content: modal.querySelector('#cContent').value.trim(),
          unlockDate: modal.querySelector('#cDate').value,
          author: App.me,
        };
        if (!body.title || !body.content) { toast('标题和内容都要写哦', 'err'); return; }
        try {
          await api('/api/capsules', { method: 'POST', body });
          toast('封好了 ✉️', 'ok');
          close();
          App.go('capsules');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════
   设置
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   你在哪儿 · 情侣定位
   地图是自己画的：只把两个人的坐标铺在一个等比平面上，
   不请求任何第三方地图服务，位置数据不出这台服务器。
   ═══════════════════════════════════════════════════════ */

const NUDGE_KINDS = [
  ['miss', '想你了', '💗'],
  ['come', '来找我', '🏃'],
  ['home', '到家了', '🏠'],
  ['eat', '吃饭了', '🍚'],
  ['hug', '抱一下', '🤗'],
  ['sleep', '睡了', '🌙'],
];

function nudgeLabel(kind) {
  const hit = NUDGE_KINDS.find(([v]) => v === kind);
  return hit ? `${hit[2]} ${hit[1]}` : '💗 想你了';
}

let locTimer = null;
function stopLocTimer() {
  if (locTimer) { clearInterval(locTimer); locTimer = null; }
}

/* ───────────── 地图（真实底图） ─────────────

   底图走自己的服务端代理 /api/tile/{style}/{z}/{x}/{y}.png，
   不直连高德——这样 CSP 里的 img-src 不用为地图放宽，
   对方也看不到两个人的真实 IP，同一块瓦片还能缓存下来复用。

   投影是标准 Web 墨卡托：第 z 级「世界图」是一张 256*2^z 见方的大图，
   任意经纬度都能换算成这张大图上的像素坐标，瓦片就是它的 256 见方切片。 */

const TILE_SIZE = 256;
const MAP_W = 1024;          // 逻辑画布宽（CSS 里按容器宽度缩放）
const MAP_H = 600;           // 逻辑画布高
const MAP_MIN_Z = 3;
const MAP_MAX_Z = 16;
const TILE_STYLES = [
  ['amap', '地图'],
  ['satellite', '卫星'],
  ['none', '只画轨迹'],
];

/* 每个像素代表多少米（随纬度变化，赤道最粗、两极最细） */
function metersPerPx(lat, z) {
  return (156543.03392 * Math.cos((Number(lat) * Math.PI) / 180)) / Math.pow(2, z);
}

function worldPx(lat, lng, z) {
  const size = TILE_SIZE * Math.pow(2, z);
  const la = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
  const ln = Number(lng) || 0;
  const s = Math.sin((la * Math.PI) / 180);
  return {
    x: ((ln + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
    size,
  };
}

/* 自动挑一个把所有点都装下的层级：
   先用 z=20 量出跨度，再按「装进画布的 76%」倒推该退到第几级。 */
function locFit(points) {
  let minLat = Infinity; let maxLat = -Infinity;
  let minLng = Infinity; let maxLng = -Infinity;
  for (const p of points) {
    const lat = Number(p && p.lat); const lng = Number(p && p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  if (!Number.isFinite(minLat)) return null;

  const a = worldPx(minLat, minLng, 20);
  const b = worldPx(maxLat, maxLng, 20);
  /* 一个点都没有跨度时给 1 像素下限，避免 log2(0) */
  const spanX = Math.max(Math.abs(b.x - a.x), 1);
  const spanY = Math.max(Math.abs(b.y - a.y), 1);
  const zx = 20 + Math.log2((MAP_W * 0.56) / spanX);
  const zy = 20 + Math.log2((MAP_H * 0.56) / spanY);
  const z = Math.max(MAP_MIN_Z, Math.min(MAP_MAX_Z, Math.floor(Math.min(zx, zy))));

  return {
    z,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
    spanLat: maxLat - minLat,
    spanLng: maxLng - minLng,
  };
}

/* 画布左上角在世界图上的像素位置 */
function locWindow(view) {
  const c = worldPx(view.centerLat, view.centerLng, view.z);
  return { left: c.x - MAP_W / 2, top: c.y - MAP_H / 2, z: view.z };
}

function locTileHTML(win, style) {
  if (!style || style === 'none') return '';
  const n = Math.pow(2, win.z);
  const x0 = Math.floor(win.left / TILE_SIZE);
  const x1 = Math.floor((win.left + MAP_W) / TILE_SIZE);
  const y0 = Math.floor(win.top / TILE_SIZE);
  const y1 = Math.floor((win.top + MAP_H) / TILE_SIZE);
  const out = [];

  const push = (kind, x, y) => {
    if (y < 0 || y >= n) return;
    const wx = ((x % n) + n) % n;   // 横向跨 180° 时绕回来
    const px = x * TILE_SIZE - win.left;
    const py = y * TILE_SIZE - win.top;
    const cls = kind === 'hybrid' ? 'loc-map__tile loc-map__tile--label' : 'loc-map__tile';
    out.push(`<img class="${cls}" alt="" draggable="false" src="/api/tile/${kind}/${win.z}/${wx}/${y}.png" style="left:${px.toFixed(1)}px;top:${py.toFixed(1)}px">`);
  };

  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) push(style, x, y);
  /* 卫星图本身没有路名，再叠一层高德的透明标注层 */
  if (style === 'satellite') for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) push('hybrid', x, y);
  return out.join('');
}

/* 从服务端数据算出这张地图要画什么 */
function locMapModel(data, view) {
  const meTrail = (data.trails && data.trails.me) || [];
  const otherTrail = (data.trails && data.trails.other) || [];
  const mePt = data.me && data.me.point;
  const otherPt = data.other && data.other.point;

  /* 定框只按两个人的当前位置：轨迹可能拖得很长，跟着轨迹定框会把人缩成两个小点。
     只有一个人在的时候，才用他自己的轨迹兜住视野。 */
  const both = [mePt, otherPt].filter(Boolean);
  const core = both.length >= 2
    ? both.slice()
    : [...(both.length ? (mePt ? meTrail : otherTrail) : [...meTrail, ...otherTrail])];
  if (!core.length) return null;
  const auto = locFit(core);
  if (!auto) return null;

  /* 常去地点：只留离两个人不远的，否则一个郊区的「老家」
     会把两个人挤成两个小点。按核心点跨度的 2.5 倍（至少 0.02°≈2km）判断。 */
  const reach = Math.max(0.02, Math.max(auto.spanLat, auto.spanLng) * 2.5);
  const places = (data.places || []).filter((p) => {
    const lat = Number(p && p.lat); const lng = Number(p && p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return Math.hypot(lat - auto.centerLat, lng - auto.centerLng) <= reach;
  });

  const v = view || auto;
  const win = locWindow(v);
  const project = (lat, lng) => {
    const w = worldPx(lat, lng, win.z);
    return { x: w.x - win.left, y: w.y - win.top };
  };

  return { win, view: v, auto, project, meTrail, otherTrail, mePt, otherPt, places };
}

function locMapHTML(data, view) {
  const style = (data.settings && data.settings.tiles) || 'amap';
  const model = locMapModel(data, view);

  if (!model) {
    return `<div class="loc-map loc-map--empty">
      <div class="loc-map__hint">还没有任何位置<br><span>打开定位，第一次上报之后这里就会出现地图</span></div>
    </div>`;
  }

  const { win, project } = model;
  const pt = (p) => project(p.lat, p.lng);
  const clampX = (v) => Math.max(2, Math.min(MAP_W - 2, v));
  const clampY = (v) => Math.max(2, Math.min(MAP_H - 2, v));
  const mPerPx = metersPerPx(model.view.centerLat, win.z);

  const trailPath = (trail) => trail
    .map((p) => { const q = pt(p); return `${clampX(q.x).toFixed(1)},${clampY(q.y).toFixed(1)}`; })
    .join(' ');

  /* 人是否正站在某个常去地点里（按米数比半径） */
  const inCircle = (p, point) => {
    if (!point) return false;
    const a = pt(p); const b = pt(point);
    return Math.hypot(a.x - b.x, a.y - b.y) * metersPerPx(Number(p.lat), win.z) <= (Number(p.radius) || 200);
  };

  const placeMarks = model.places.map((p) => {
    const q = pt(p);
    const r = Math.max(9, Math.min(70, (Number(p.radius) || 200) / Math.max(mPerPx, 0.05)));
    const cx = clampX(q.x); const cy = clampY(q.y);
    const occupied = inCircle(p, model.mePt) || inCircle(p, model.otherPt);
    const ty = Math.max(11, Math.min(MAP_H - 5, cy - r - 6));
    return `<g class="loc-map__place">
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" />
      ${occupied ? '' : `<text class="loc-map__place-name" x="${cx.toFixed(1)}" y="${ty.toFixed(1)}">${esc(p.name || '')}</text>`}
    </g>`;
  }).join('');

  const meXY = model.mePt ? pt(model.mePt) : null;
  const otherXY = model.otherPt ? pt(model.otherPt) : null;

  const link = meXY && otherXY
    ? `<line class="loc-map__link" x1="${meXY.x.toFixed(1)}" y1="${meXY.y.toFixed(1)}" x2="${otherXY.x.toFixed(1)}" y2="${otherXY.y.toFixed(1)}" />`
    : '';

  const pin = (xy, cls, label, pulse) => (xy ? `<g class="loc-map__pin ${cls}">
      <circle cx="${xy.x.toFixed(1)}" cy="${xy.y.toFixed(1)}" r="16" class="loc-map__halo" />
      ${pulse ? `<circle cx="${xy.x.toFixed(1)}" cy="${xy.y.toFixed(1)}" r="12" class="loc-map__pulse" />` : ''}
      <circle cx="${xy.x.toFixed(1)}" cy="${xy.y.toFixed(1)}" r="7.5" />
      <text x="${xy.x.toFixed(1)}" y="${(xy.y + 26).toFixed(1)}">${esc(label)}</text>
    </g>` : '');

  /* 比例尺：取一段好看的整数距离，换算成画布上的像素长度 */
  const niceMeters = (() => {
    const want = mPerPx * 130;
    const steps = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
    for (const s of steps) if (want <= s) return s;
    return 500000;
  })();
  const barW = Math.max(24, Math.min(240, niceMeters / Math.max(mPerPx, 0.01)));

  return `<div class="loc-map" data-loc-map>
    <div class="loc-map__scene" data-loc-scene>
      <div class="loc-map__world" data-loc-world>
        ${locTileHTML(win, style)}
        ${style === 'none' ? '<div class="loc-map__blank"></div>' : '<div class="loc-map__veil"></div>'}
        <svg class="loc-map__overlay" width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="我们俩的位置">
          ${placeMarks}
          ${model.meTrail.length > 1 ? `<polyline class="loc-map__trail loc-map__trail--me" points="${trailPath(model.meTrail)}" />` : ''}
          ${model.otherTrail.length > 1 ? `<polyline class="loc-map__trail loc-map__trail--other" points="${trailPath(model.otherTrail)}" />` : ''}
          ${link}
          ${pin(otherXY, 'loc-map__pin--other', nameOf(otherOf(App.me)), true)}
          ${pin(meXY, 'loc-map__pin--me', nameOf(App.me), false)}
        </svg>
      </div>
    </div>
    <div class="loc-map__bar">
      <div class="loc-map__scale"><i style="width:${barW.toFixed(0)}px"></i><span>${humanDistance(niceMeters)}</span></div>
      <div class="loc-map__styles">
        ${TILE_STYLES.map(([k, label]) => `<button class="loc-map__style${k === style ? ' on' : ''}" data-loc-style="${k}" type="button">${label}</button>`).join('')}
      </div>
    </div>
    <div class="loc-map__zoom">
      <button class="loc-map__zbtn" data-loc-zoom="in" type="button" title="放大">＋</button>
      <button class="loc-map__zbtn" data-loc-zoom="out" type="button" title="缩小">－</button>
      <button class="loc-map__zbtn" data-loc-zoom="fit" type="button" title="回到我们俩">◎</button>
    </div>
    ${style === 'none' ? '' : '<div class="loc-map__credit">底图 © 高德地图</div>'}
  </div>`;
}

function locWhere(presence) {
  if (!presence || !presence.has || !presence.point) return '还不知道在哪儿';
  if (presence.paused) return '暂停共享了';
  const p = presence.point;
  if (p.place && p.place.name) return `${p.place.icon || '📍'} ${p.place.name}`;
  return `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
}

function locPersonCard(presence, isMe) {
  const who = presence.who;
  const p = presence.point;
  const bits = [];
  if (p) {
    if (Number.isFinite(p.acc)) bits.push(`±${Math.round(p.acc)} 米`);
    if (Number.isFinite(p.battery)) bits.push(`${p.charging ? '⚡' : '🔋'} ${p.battery}%`);
  }
  /* 精度/电量一行，时间单独一行：窄屏上两列卡片只有一百多像素，
     三段挤一行会被折断成「48 分钟 / 前」这种断句 */
  const meta = bits.length ? `<div class="loc-person__meta">${bits.map((b) => `<span>${esc(b)}</span>`).join('')}</div>` : '';
  const when = p ? `<div class="loc-person__time">${esc(humanTime(p.at))}</div>` : '';
  return `<div class="loc-person${isMe ? ' loc-person--me' : ''}">
    <div class="loc-person__head">
      ${avatarHTML(who, 'sm')}
      <div class="loc-person__name">${esc(nameOf(who))}${isMe ? '<span class="loc-person__tag">我</span>' : ''}</div>
    </div>
    <div class="loc-person__where">${esc(locWhere(presence))}</div>
    ${p ? meta + when : `<div class="loc-person__meta">${esc(presence.paused ? '对方看不到你的位置' : '还没上报过')}</div>`}
  </div>`;
}

Views.location = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/location?hours=12');
  App.location = data;
  /* 记住用户自己拖过/缩过的视野，刷新页面时不会跳回自动取景 */
  if (!App.locView) App.locView = null;

  const me = data.me || {};
  const other = data.other || {};
  const has = !!(me.has && other.has);
  const pausedMe = App.me === 'b' ? data.settings.pausedB : data.settings.pausedA;
  const pausedOther = App.me === 'b' ? data.settings.pausedA : data.settings.pausedB;
  const nudges = data.nudges || [];

  /* 大数字：距离。方位用文字，比箭头更容易读 */
  let heroBig = '';
  let heroSub = '两个人都还没上报位置';
  let heroIcon = '🧭';
  if (has) {
    heroBig = data.humanDistance || humanDistance(data.distance);
    heroSub = data.distance < 200
      ? `就在附近 · 大概朝${data.compass}边`
      : `${esc(nameOf(otherOf(App.me)))} 在你的${data.compass}边`;
    heroIcon = data.distance < 200 ? '💗' : '🧭';
  } else if (me.has && !other.has) {
    heroSub = `你已经在报位置了，${esc(nameOf(otherOf(App.me)))} 还没打开`;
  } else if (!me.has && other.has) {
    heroSub = `${esc(nameOf(otherOf(App.me)))} 在等你打开定位`;
  }

  const trailCount = ((data.trails && data.trails.me) || []).length + ((data.trails && data.trails.other) || []).length;

  el.innerHTML = page(`
    <div class="loc-hero${has ? '' : ' loc-hero--idle'}">
      <div class="loc-hero__icon">${heroIcon}</div>
      ${heroBig ? `<div class="loc-hero__num">${esc(heroBig)}</div>` : ''}
      <div class="loc-hero__sub">${heroSub}</div>
      <div class="loc-hero__acts">
        <button class="btn btn--sm btn--primary" data-loc-now>更新我的位置</button>
        <button class="btn btn--sm btn--ghost" data-loc-pause>${pausedMe ? '继续共享' : '暂停共享'}</button>
      </div>
      ${!data.settings.enabled ? `<div class="loc-hero__off">定位功能现在是关着的，去设置里打开</div>` : ''}
      ${pausedOther ? `<div class="loc-hero__off">${esc(nameOf(otherOf(App.me)))} 暂停了共享</div>` : ''}
    </div>

    ${locMapHTML(data, App.locView)}

    <div class="loc-people">
      ${locPersonCard(me, true)}
      ${locPersonCard(other, false)}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-head" style="margin-bottom:12px">
        <div>
          <div class="section-head__title">戳一下</div>
          <div class="section-head__desc">${esc(nameOf(otherOf(App.me)))} 下次打开就会看到</div>
        </div>
      </div>
      <div class="nudge-grid">
        ${NUDGE_KINDS.map(([k, label, icon]) => `
          <button class="nudge-btn" data-nudge="${k}"><span>${icon}</span>${esc(label)}</button>`).join('')}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-head" style="margin-bottom:10px">
        <div>
          <div class="section-head__title">最近的提醒</div>
          <div class="section-head__desc">${nudges.length ? `收到 ${nudges.length} 条还没看的` : '还没有新的'}</div>
        </div>
        ${nudges.length ? '<button class="btn btn--sm btn--ghost" data-nudge-seen>都看到了</button>' : ''}
      </div>
      ${nudges.length
        ? `<div class="nudge-list">${nudges.map((n) => `
            <div class="nudge-item">
              ${avatarHTML(n.from, 'sm')}
              <div class="nudge-item__text">${esc(nameOf(n.from))} ${esc(nudgeLabel(n.kind))}</div>
              <div class="nudge-item__time">${esc(humanTime(n.at))}</div>
            </div>`).join('')}</div>`
        : emptyState('🔔', '安安静静', '想对方的时候就戳一下')}
    </div>

    <div class="loc-foot">
      <span>轨迹 ${trailCount} 个点 · 只留最近 3 天</span>
      <button class="link-btn" data-loc-places>常去的地方</button>
    </div>
  `);

  /* 事件 */
  el.querySelector('[data-loc-now]').onclick = async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = '定位中…';
    try {
      const pos = await getOnce();
      await pushLocation(pos);
      toast('更新好了', 'ok');
      App.go('location');
    } catch (e) {
      toast(e.message || '定不到位', 'err');
      btn.disabled = false;
      btn.textContent = '更新我的位置';
    }
  };

  el.querySelector('[data-loc-pause]').onclick = async () => {
    try {
      await api('/api/settings', {
        method: 'PATCH',
        body: { [App.me === 'b' ? 'loc.paused_b' : 'loc.paused_a']: pausedMe ? '0' : '1' },
      });
      if (pausedMe) startLocWatch();
      else stopLocWatch();
      toast(pausedMe ? '继续共享了' : '已暂停共享', 'ok');
      App.go('location');
    } catch (e) { toast(e.message, 'err'); }
  };

  el.querySelectorAll('[data-nudge]').forEach((b) => {
    b.onclick = async () => {
      try {
        const r = await api('/api/location/nudge', { method: 'POST', body: { kind: b.dataset.nudge } });
        toast(r.deduped ? '刚发过啦' : `已经戳了 ${nameOf(otherOf(App.me))} 一下`, 'ok');
      } catch (e) { toast(e.message, 'err'); }
    };
  });

  const seenBtn = el.querySelector('[data-nudge-seen]');
  if (seenBtn) {
    seenBtn.onclick = async () => {
      try {
        await api('/api/nudges/seen', { method: 'POST' });
        App.go('location');
      } catch (e) { toast(e.message, 'err'); }
    };
  }

  el.querySelector('[data-loc-places]').onclick = () => openPlacesManager(data.places || []);

  bindLocMap(el, data);

  /* 停在这个页面时每 30 秒刷一次，别的页面不刷 */
  stopLocTimer();
  locTimer = setInterval(() => {
    if (App.view !== 'location') { stopLocTimer(); return; }
    if (document.hidden) return;
    api('/api/location?hours=12').then((d) => {
      App.location = d;
      if (App.view === 'location') refreshLocMap(d);
    }).catch(() => {});
  }, 30 * 1000);
};

/* ── 地图交互：拖动、滚轮缩放、双指缩放、切换底图 ── */

/* 只重画地图那一块，不整个页面重来——否则每 30 秒自动刷新时
   用户正在拖地图会被打断 */
function refreshLocMap(data) {
  const box = document.querySelector('[data-loc-map]');
  if (!box) return;
  const holder = document.createElement('div');
  holder.innerHTML = locMapHTML(data, App.locView);
  const fresh = holder.firstElementChild;
  if (!fresh) return;
  box.replaceWith(fresh);
  const el = document.querySelector('.content');
  if (el) bindLocMap(el, data);
}

function bindLocMap(el, data) {
  const box = el.querySelector('[data-loc-map]');
  if (!box) return;
  const scene = box.querySelector('[data-loc-scene]');
  const world = box.querySelector('[data-loc-world]');
  if (!scene || !world) return;

  const model = locMapModel(data, App.locView);
  if (!model) return;

  /* 逻辑画布 1024x600 整体缩放到容器宽度。
     瓦片、轨迹都按逻辑像素摆，缩放只作用在这一层。 */
  const fitScale = () => {
    const s = Math.max(0.2, scene.clientWidth / MAP_W);
    world.style.transform = `scale(${s})`;
    return s;
  };
  let scale = fitScale();
  window.addEventListener('resize', () => { scale = fitScale(); }, { passive: true });

  /* 屏幕像素 → 逻辑像素：拖动/缩放里都直接除 scale */

  const rerender = () => {
    const holder = document.createElement('div');
    holder.innerHTML = locMapHTML(data, App.locView);
    const fresh = holder.firstElementChild;
    if (!fresh) return;
    box.replaceWith(fresh);
    bindLocMap(el, data);
  };

  /* 世界像素 ↔ 经纬度 */
  const worldToLatLng = (x, y, z) => {
    const size = TILE_SIZE * Math.pow(2, z);
    const cx = ((x % size) + size) % size;
    const lng = (cx / size) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * Math.max(0, Math.min(size, y))) / size;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  };

  /* 平移：拖多少逻辑像素，中心点就在世界图上反向挪多少 */
  const pan = (dxLogical, dyLogical) => {
    const v = App.locView || { ...model.auto };
    const c = worldPx(v.centerLat, v.centerLng, v.z);
    const size = TILE_SIZE * Math.pow(2, v.z);
    const nx = Math.max(0, Math.min(size, c.x + dxLogical));
    const ny = Math.max(0, Math.min(size, c.y + dyLogical));
    const { lat, lng } = worldToLatLng(nx, ny, v.z);
    App.locView = { ...v, centerLat: lat, centerLng: lng };
    rerender();
  };

  /* 缩放：以鼠标/手指所在点为锚，缩放后那个点还停在原处 */
  const zoomAt = (delta, anchorX, anchorY) => {
    const v = App.locView || { ...model.auto };
    const z = Math.max(MAP_MIN_Z, Math.min(MAP_MAX_Z, v.z + delta));
    if (z === v.z) return;

    const ax = anchorX == null ? MAP_W / 2 : anchorX;
    const ay = anchorY == null ? MAP_H / 2 : anchorY;

    /* 锚点此刻对应的经纬度（旧层级下算） */
    const win = locWindow(v);
    const anchorWorld = { x: win.left + ax, y: win.top + ay };
    const anchorLL = worldToLatLng(anchorWorld.x, anchorWorld.y, v.z);

    /* 同一经纬度在新层级下的世界像素 */
    const at = worldPx(anchorLL.lat, anchorLL.lng, z);
    const size2 = TILE_SIZE * Math.pow(2, z);
    const cx = Math.max(0, Math.min(size2, at.x - ax + MAP_W / 2));
    const cy = Math.max(0, Math.min(size2, at.y - ay + MAP_H / 2));
    const center = worldToLatLng(cx, cy, z);

    App.locView = { z, centerLat: center.lat, centerLng: center.lng };
    rerender();
  };

  /* 拖：拖动过程中只挪 transform，松手才重新取瓦片。
     每帧重绘会把正在拖的元素换掉，指针就丢了。 */
  let drag = null;
  scene.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    drag = { x: ev.clientX, y: ev.clientY, dx: 0, dy: 0 };
    scene.classList.add('dragging');
    try { scene.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  });
  scene.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    drag.dx = ev.clientX - drag.x;
    drag.dy = ev.clientY - drag.y;
    world.style.transform = `translate(${drag.dx.toFixed(1)}px, ${drag.dy.toFixed(1)}px) scale(${scale})`;
  });
  const endDrag = (ev) => {
    if (!drag) return;
    const { dx, dy } = drag;
    drag = null;
    scene.classList.remove('dragging');
    try { scene.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    world.style.transform = `scale(${scale})`;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    /* 手指往右拖 → 画面往右走 → 视野中心往左移 */
    pan(-dx / scale, -dy / scale);
  };
  scene.addEventListener('pointerup', endDrag);
  scene.addEventListener('pointercancel', endDrag);

  /* 滚轮缩放 */
  scene.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = scene.getBoundingClientRect();
    zoomAt(ev.deltaY < 0 ? 1 : -1, (ev.clientX - r.left) / scale, (ev.clientY - r.top) / scale);
  }, { passive: false });

  /* 双指缩放（手机上主要用这个） */
  let pinch = null;
  scene.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 2) return;
    const [a, b] = ev.touches;
    pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  }, { passive: true });
  scene.addEventListener('touchmove', (ev) => {
    if (ev.touches.length !== 2 || !pinch) return;
    ev.preventDefault();
    const [a, b] = ev.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (Math.abs(d - pinch.d) < 34) return;
    const r = scene.getBoundingClientRect();
    zoomAt(
      d > pinch.d ? 1 : -1,
      ((a.clientX + b.clientX) / 2 - r.left) / scale,
      ((a.clientY + b.clientY) / 2 - r.top) / scale
    );
    pinch = { d };
  }, { passive: false });
  scene.addEventListener('touchend', () => { pinch = null; }, { passive: true });

  /* 缩放按钮 */
  box.querySelectorAll('[data-loc-zoom]').forEach((b) => {
    b.onclick = () => {
      const kind = b.dataset.locZoom;
      if (kind === 'fit') { App.locView = null; rerender(); return; }
      zoomAt(kind === 'in' ? 1 : -1, null, null);
    };
  });

  /* 切换底图 */
  box.querySelectorAll('[data-loc-style]').forEach((b) => {
    b.onclick = async () => {
      const style = b.dataset.locStyle;
      box.querySelectorAll('[data-loc-style]').forEach((x) => x.classList.toggle('on', x === b));
      try {
        await api('/api/settings', { method: 'PATCH', body: { 'loc.tiles': style } });
        if (App.location) {
          App.location.settings = { ...(App.location.settings || {}), tiles: style };
          refreshLocMap(App.location);
        }
      } catch (e) { toast(e.message, 'err'); }
    };
  });
}

/* ── 常去的地方 ── */

function openPlacesManager(places) {
  const icons = ['🏠', '🏢', '🏫', '🏪', '☕', '🍜', '🌳', '🏥', '🎬', '📍'];

  const render = (list) => `
    <div class="places-list">
      ${list.length ? list.map((p) => `
        <div class="places-item">
          <div class="places-item__icon">${esc(p.icon || '📍')}</div>
          <div class="places-item__body">
            <div class="places-item__name">${esc(p.name)}</div>
            <div class="places-item__meta">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)} · ${p.radius} 米内算在这里</div>
          </div>
          <button class="mini-btn" data-place-del="${p.id}">删</button>
        </div>`).join('') : '<div class="places-empty">还没有常去的地方</div>'}
    </div>
    <div class="places-add">
      <div class="row" style="gap:8px;margin-bottom:10px">
        <div class="flex1">
          <label class="field__label">名字</label>
          <input class="input" id="placeName" maxlength="20" placeholder="家 / 公司 / 学校">
        </div>
        <div style="width:96px">
          <label class="field__label">范围</label>
          <select class="input" id="placeRadius">
            <option value="100">100 米</option>
            <option value="200" selected>200 米</option>
            <option value="500">500 米</option>
            <option value="1000">1 公里</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field__label">图标</label>
        <div class="icon-row" id="placeIcons">
          ${icons.map((ic, i) => `<button type="button" class="icon-pick${i === 0 ? ' active' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
        </div>
      </div>
      <button class="btn btn--primary btn--sm" data-place-add>用我现在的位置添加</button>
    </div>`;

  openModal({
    title: '常去的地方',
    body: render(places),
    footer: '<button class="btn btn--ghost" data-close>关掉</button>',
    onMount(modal, close) {
      let icon = icons[0];

      modal.querySelector('[data-close]').onclick = close;

      const bindIcons = () => {
        modal.querySelectorAll('[data-icon]').forEach((b) => {
          b.onclick = () => {
            icon = b.dataset.icon;
            modal.querySelectorAll('[data-icon]').forEach((x) => x.classList.toggle('active', x === b));
          };
        });
      };
      bindIcons();

      const bindDel = () => {
        modal.querySelectorAll('[data-place-del]').forEach((b) => {
          b.onclick = async () => {
            try {
              await api(`/api/places/${b.dataset.placeDel}`, { method: 'DELETE' });
              b.closest('.places-item').remove();
              toast('删掉了', 'ok');
            } catch (e) { toast(e.message, 'err'); }
          };
        });
      };
      bindDel();

      modal.querySelector('[data-place-add]').onclick = async (ev) => {
        const name = modal.querySelector('#placeName').value.trim();
        if (!name) { toast('给它起个名字', 'err'); return; }
        const btn = ev.currentTarget;
        btn.disabled = true;
        btn.textContent = '定位中…';
        try {
          const pos = await getOnce();
          await api('/api/places', {
            method: 'POST',
            body: {
              name,
              icon,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              radius: Number(modal.querySelector('#placeRadius').value),
            },
          });
          toast('加好了', 'ok');
          close();
          App.go('location');
        } catch (e) {
          toast(e.message || '加不上', 'err');
          btn.disabled = false;
          btn.textContent = '用我现在的位置添加';
        }
      };
    },
  });
}

/* ───────────── 悄悄话（聊天） ───────────── */

let chatTimer = null;
function stopChatTimer() {
  if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
}

/* 消息气泡。自己发的靠右、对方靠左，颜色也跟着身份走 */
function chatBubble(m) {
  const mine = m.who === App.me;
  const img = m.media
    ? `<img class="chat-bubble__img" src="${esc(m.media.url)}" alt="" data-zoom="${esc(m.media.url)}">`
    : '';
  return `<div class="chat-row${mine ? ' chat-row--mine' : ''}" data-msg="${m.id}">
    ${mine ? '' : avatarHTML(m.who, 'sm')}
    <div class="chat-bubble${mine ? ' chat-bubble--mine' : ''}">
      ${img}
      ${m.body ? `<div class="chat-bubble__text">${esc(m.body).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="chat-bubble__meta">
        <span>${esc(chatClock(m.createdAt))}</span>
        ${mine ? `<span class="chat-bubble__tick${m.readAt ? ' on' : ''}" title="${m.readAt ? '对方看到了' : '对方还没看'}">${m.readAt ? '✓✓' : '✓'}</span>` : ''}
      </div>
    </div>
    ${mine ? avatarHTML(m.who, 'sm') : ''}
  </div>`;
}

function chatClock(ts) {
  const d = new Date(Number(ts));
  const p = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (sameDay) return hm;
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/* 按天分组，中间插一条日期分隔 */
function chatListHTML(items) {
  if (!items.length) {
    return emptyState('💬', '还没说过话', '从一句「在干嘛」开始');
  }
  const out = [];
  let lastDay = '';
  for (const m of items) {
    const d = new Date(Number(m.createdAt));
    const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (day !== lastDay) {
      lastDay = day;
      out.push(`<div class="chat-day"><span>${esc(chatDayLabel(m.createdAt))}</span></div>`);
    }
    out.push(chatBubble(m));
  }
  return out.join('');
}

function chatDayLabel(ts) {
  const d = new Date(Number(ts));
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return '今天';
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return '昨天';
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

Views.messages = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/messages?limit=60');
  const items = data.items || [];

  el.innerHTML = page(`
    <div class="chat">
      <div class="chat__head">
        <div class="chat__who">
          ${avatarHTML(otherOf(App.me), 'sm')}
          <div>
            <div class="chat__name">${esc(nameOf(otherOf(App.me)))}</div>
            <div class="chat__sub">只有你们两个人能看见</div>
          </div>
        </div>
        <button class="icon-btn" data-chat-refresh type="button" title="刷新">⟳</button>
      </div>

      <div class="chat__list" data-chat-list>
        ${data.hasMore ? '<button class="link-btn chat__more" data-chat-more>看看更早的</button>' : ''}
        ${chatListHTML(items)}
      </div>

      <div class="chat__composer">
        <div class="chat__attach" data-chat-preview hidden></div>
        <div class="chat__input-row">
          <button class="icon-btn" data-chat-pick type="button" title="发张照片">📷</button>
          <textarea class="chat__input" data-chat-input rows="1" placeholder="说点什么…" maxlength="4000"></textarea>
          <button class="btn btn--sm btn--primary" data-chat-send type="button">发送</button>
        </div>
      </div>
    </div>
  `);

  const list = el.querySelector('[data-chat-list]');
  const input = el.querySelector('[data-chat-input]');
  const preview = el.querySelector('[data-chat-preview]');
  let pending = [];      // 待发送的照片（media id）
  let oldest = items.length ? items[0].id : null;

  const scrollBottom = (smooth) => {
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  scrollBottom(false);

  /* 输入框随内容长高，最多 5 行 */
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(120, input.scrollHeight) + 'px';
  };
  input.addEventListener('input', grow);

  const renderPreview = () => {
    if (!pending.length) { preview.hidden = true; preview.innerHTML = ''; return; }
    preview.hidden = false;
    preview.innerHTML = pending.map((f) => `
      <div class="chat-thumb">
        <img src="${esc(f.url)}" alt="">
        <button class="chat-thumb__x" data-chat-unpick="${f.id}" type="button">×</button>
      </div>`).join('');
    preview.querySelectorAll('[data-chat-unpick]').forEach((b) => {
      b.onclick = () => {
        pending = pending.filter((x) => String(x.id) !== String(b.dataset.chatUnpick));
        renderPreview();
      };
    });
  };

  el.querySelector('[data-chat-pick]').onclick = async () => {
    try {
      const files = await pickFiles('image/*', true);
      if (!files.length) return;
      const up = await uploadFiles(files);
      pending = pending.concat(up);
      renderPreview();
    } catch (e) { toast(e.message || '上传失败', 'err'); }
  };

  const send = async () => {
    const text = input.value.trim();
    if (!text && !pending.length) return;
    const btn = el.querySelector('[data-chat-send]');
    btn.disabled = true;
    try {
      /* 一张图一条消息，文字单独一条，混着发时先发文字 */
      if (text) {
        const m = await api('/api/messages', { method: 'POST', body: { body: text } });
        list.insertAdjacentHTML('beforeend', chatBubble(m));
        input.value = '';
        grow();
      }
      for (const f of pending) {
        const m = await api('/api/messages', { method: 'POST', body: { mediaId: f.id } });
        list.insertAdjacentHTML('beforeend', chatBubble(m));
      }
      pending = [];
      renderPreview();
      scrollBottom(true);
      el.querySelectorAll("[data-zoom]").forEach((im) => { im.onclick = () => lightbox(im.dataset.zoom); });
      refreshBadges();
    } catch (e) {
      toast(e.message || '没发出去', 'err');
    } finally {
      btn.disabled = false;
      input.focus();
    }
  };

  el.querySelector('[data-chat-send]').onclick = send;
  input.addEventListener('keydown', (ev) => {
    /* 回车发送，Shift+回车换行——手机上回车就是换行，不拦 */
    if (ev.key === 'Enter' && !ev.shiftKey && window.innerWidth > 720) {
      ev.preventDefault();
      send();
    }
  });

  const loadMore = async (btn) => {
    if (!oldest) return;
    btn.disabled = true;
    btn.textContent = '翻…';
    try {
      const older = await api(`/api/messages?before=${oldest}&limit=40`);
      if (!older.items.length) { btn.remove(); return; }
      oldest = older.items[0].id;
      const html = chatListHTML(older.items);
      btn.insertAdjacentHTML('afterend', html);
      if (!older.hasMore) btn.remove();
      else { btn.disabled = false; btn.textContent = '看看更早的'; }
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
      btn.textContent = '看看更早的';
    }
  };
  const moreBtn = el.querySelector('[data-chat-more]');
  if (moreBtn) moreBtn.onclick = () => loadMore(moreBtn);

  el.querySelector('[data-chat-refresh]').onclick = async () => {
    const d = await api('/api/messages?limit=60');
    list.innerHTML = (d.hasMore ? '' : '') + chatListHTML(d.items || []);
    scrollBottom(false);
    el.querySelectorAll("[data-zoom]").forEach((im) => { im.onclick = () => lightbox(im.dataset.zoom); });
    toast('刷新了', 'ok');
  };

  el.querySelectorAll("[data-zoom]").forEach((im) => { im.onclick = () => lightbox(im.dataset.zoom); });

  /* 停在聊天页时每 8 秒拉一次新消息；有新的就追加，不整页重画 */
  stopChatTimer();
  chatTimer = setInterval(async () => {
    if (App.view !== 'messages') { stopChatTimer(); return; }
    if (document.hidden) return;
    try {
      const d = await api('/api/messages?limit=1');
      const latest = (d.items || [])[0];
      if (!latest) return;
      const shown = list.querySelectorAll('[data-msg]');
      const lastId = shown.length ? Number(shown[shown.length - 1].dataset.msg) : 0;
      if (latest.id <= lastId) return;
      /* 有新消息：拉最近一批补齐 */
      const full = await api('/api/messages?limit=60');
      list.innerHTML = chatListHTML(full.items || []);
      scrollBottom(true);
      el.querySelectorAll("[data-zoom]").forEach((im) => { im.onclick = () => lightbox(im.dataset.zoom); });
      refreshBadges();
    } catch { /* 网络抖一下就算了 */ }
  }, 8000);
};

/* ───────────── 公告栏 ───────────── */

function annTime(ts) {
  const d = new Date(Number(ts));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Views.announcements = async function (el) {
  el.innerHTML = loadingBlock();
  const data = await api('/api/announcements');
  const items = data.items || [];

  el.innerHTML = page(`
    <div class="section-head">
      <div>
        <div class="section-head__title">公告栏</div>
        <div class="section-head__desc">
          ${data.unreadCount ? `有 ${data.unreadCount} 条还没看` : '都看过了'}
        </div>
      </div>
      <button class="btn btn--sm btn--primary" data-ann-new>写一条</button>
    </div>

    ${data.unreadCount ? `<div class="ann-unread-tip">
      <span>🔔</span>
      <span>有 ${data.unreadCount} 条新公告，下次进小窝还会弹出来</span>
      <button class="link-btn" data-ann-readall>全部标为已读</button>
    </div>` : ''}

    <div class="ann-list">
      ${items.length ? items.map((a) => `
        <article class="ann${a.readAt ? '' : ' ann--unread'}" data-ann="${a.id}">
          <div class="ann__head">
            <div class="ann__title">
              ${a.pinned ? '<span class="ann__pin">置顶</span>' : ''}
              ${a.readAt ? '' : '<span class="ann__dot"></span>'}
              ${esc(a.title || '小通知')}
            </div>
            <div class="ann__acts">
              <button class="mini-btn" data-ann-edit="${a.id}">改</button>
              <button class="mini-btn" data-ann-del="${a.id}">删</button>
            </div>
          </div>
          <div class="ann__body">${esc(a.body || '').replace(/\n/g, '<br>')}</div>
          <div class="ann__meta">
            ${esc(nameOf(a.author))} · ${esc(annTime(a.createdAt))}
            ${a.readAt ? `<span class="ann__read">已读 ${esc(annTime(a.readAt))}</span>` : '<span class="ann__unread">未读</span>'}
          </div>
        </article>`).join('') : emptyState('📌', '公告栏还是空的', '写一条给对方的留言，比如「周末去看电影」')}
    </div>
  `);

  el.querySelector('[data-ann-new]').onclick = () => openAnnEditor(null);

  const readAll = el.querySelector('[data-ann-readall]');
  if (readAll) {
    readAll.onclick = async () => {
      try {
        await api('/api/announcements/read', { method: 'POST', body: { ids: [] } });
        toast('都标已读了', 'ok');
        refreshBadges();
        App.go('announcements');
      } catch (e) { toast(e.message, 'err'); }
    };
  }

  el.querySelectorAll('[data-ann-edit]').forEach((b) => {
    b.onclick = () => {
      const a = items.find((x) => String(x.id) === String(b.dataset.annEdit));
      if (a) openAnnEditor(a);
    };
  });

  el.querySelectorAll('[data-ann-del]').forEach((b) => {
    b.onclick = () => {
      const a = items.find((x) => String(x.id) === String(b.dataset.annDel));
      confirmDialog(`删掉「${a ? a.title : '这条公告'}」？删了就找不回来了`, async () => {
        try {
          await api(`/api/announcements/${b.dataset.annDel}`, { method: 'DELETE' });
          toast('删掉了', 'ok');
          refreshBadges();
          App.go('announcements');
        } catch (e) { toast(e.message, 'err'); }
      });
    };
  });
};

function openAnnEditor(existing) {
  const a = existing || {};
  openModal({
    title: existing ? '改公告' : '写一条公告',
    body: `
      <div class="field">
        <label class="field__label" for="annTitle">标题</label>
        <input class="input" id="annTitle" maxlength="80" placeholder="一句话说清楚" value="${esc(a.title || '')}">
      </div>
      <div class="field">
        <label class="field__label" for="annBody">内容</label>
        <textarea class="input" id="annBody" rows="6" maxlength="8000" placeholder="想跟对方说的话…">${esc(a.body || '')}</textarea>
      </div>
      <label class="check-row">
        <input type="checkbox" id="annPin" ${a.pinned ? 'checked' : ''}>
        <span>置顶（一直排在公告栏最上面）</span>
      </label>
      <p class="me-card__tip">对方下次打开小窝时会看到弹窗，勾了「已读」之后就不再弹，但还能在公告栏里翻到。</p>`,
    footer: `<button class="btn btn--ghost" data-close>取消</button>
             <button class="btn btn--primary" data-save>${existing ? '保存' : '发出去'}</button>`,
    onMount(modal, close) {
      const title = modal.querySelector('#annTitle');
      const body = modal.querySelector('#annBody');
      const pin = modal.querySelector('#annPin');
      title.focus();
      modal.querySelector('[data-close]').onclick = close;
      modal.querySelector('[data-save]').onclick = async () => {
        const payload = { title: title.value.trim(), body: body.value.trim(), pinned: pin.checked };
        if (!payload.title && !payload.body) { toast('写点东西再发', 'err'); return; }
        try {
          if (existing) {
            await api(`/api/announcements/${existing.id}`, { method: 'PATCH', body: payload });
            toast('改好了', 'ok');
          } else {
            await api('/api/announcements', { method: 'POST', body: payload });
            toast('发出去了', 'ok');
          }
          close();
          refreshBadges();
          App.go('announcements');
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* 进站时弹的新公告：一条一条弹，全部勾完才不再出现 */
function showAnnouncementPopups(list) {
  if (!list.length) return;
  let idx = 0;

  const next = () => {
    if (idx >= list.length) {
      refreshBadges();
      return;
    }
    const a = list[idx++];
    openModal({
      title: a.pinned ? '📌 置顶公告' : '📌 新公告',
      body: `
        <div class="ann-pop">
          <div class="ann-pop__from">${esc(nameOf(a.author))} 在 ${esc(annTime(a.createdAt))} 留的</div>
          <div class="ann-pop__title">${esc(a.title || '小通知')}</div>
          <div class="ann-pop__body">${esc(a.body || '').replace(/\n/g, '<br>')}</div>
        </div>`,
      footer: `<button class="btn btn--ghost" data-later>稍后再看</button>
               <button class="btn btn--primary" data-got>我看到了</button>`,
      onMount(modal, close) {
        const mark = async (ids) => {
          try { await api('/api/announcements/read', { method: 'POST', body: { ids } }); } catch { /* ignore */ }
        };
        modal.querySelector('[data-got]').onclick = async () => {
          await mark([a.id]);
          close();
          next();
        };
        modal.querySelector('[data-later]').onclick = async () => {
          /* 稍后再看 = 剩下的全部标已读？不，是这次先不看了，下次进来还弹 */
          await mark(list.slice(idx).map((x) => x.id));
          close();
          refreshBadges();
        };
      },
    });
  };

  next();
}

Views.settings = async function (el) {
  const s = App.settings;
  const accents = [['rose', '#f4658a'], ['lilac', '#9b7ede'], ['sage', '#6f9e84'], ['ocean', '#5b93c4'], ['sunset', '#e2864f']];
  const currentAccent = s['ui.accent'] || 'rose';
  const dark = document.documentElement.dataset.theme === 'dark';

  /* 位置共享这块要读一次定位接口，拿开关、暂停状态和常去地点 */
  const loc = (await api('/api/location').catch(() => null)) || {};
  const locSet = loc.settings || {};
  const locEnabled = locSet.enabled !== false;
  const pausedMe = App.me === 'b' ? !!locSet.pausedB : !!locSet.pausedA;
  const places = Array.isArray(loc.places) ? loc.places : [];

  el.innerHTML = page(`
    <div class="card" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:6px">
        <div><div class="section-head__title">我们的信息</div></div>
      </div>
      <div class="row" style="gap:18px;margin-bottom:16px">
        <div style="text-align:center">
          <div class="avatar-edit" data-avatar="a">
            ${avatarHTML('a', 'lg')}
            <div class="avatar-edit__overlay">换</div>
          </div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:6px">${esc(nameA())}</div>
        </div>
        <div style="text-align:center">
          <div class="avatar-edit" data-avatar="b">
            ${avatarHTML('b', 'lg')}
            <div class="avatar-edit__overlay">换</div>
          </div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:6px">${esc(nameB())}</div>
        </div>
        <div class="flex1"></div>
      </div>

      <div class="field">
        <label class="field__label">小窝名字</label>
        <input class="input" id="sTitle" maxlength="40" value="${esc(s['couple.title'] || '')}">
      </div>
      <div class="field">
        <label class="field__label">副标题</label>
        <input class="input" id="sSub" maxlength="80" value="${esc(s['couple.subtitle'] || '')}">
      </div>
      <div class="row">
        <div class="flex1">
          <div class="field">
            <label class="field__label">${App.me === 'a' ? '你的名字' : `${esc(nameA())} 的名字`}</label>
            <input class="input" id="sNameA" maxlength="20" value="${esc(s['couple.name_a'] || '')}">
          </div>
        </div>
        <div class="flex1">
          <div class="field">
            <label class="field__label">${App.me === 'b' ? '你的名字' : `${esc(nameB())} 的名字`}</label>
            <input class="input" id="sNameB" maxlength="20" value="${esc(s['couple.name_b'] || '')}">
          </div>
        </div>
      </div>
      ${dateField('在一起的日期', 'sStart', s['couple.start_date'] || '')}
      <button class="btn btn--primary" data-save-basic>保存</button>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="setting-row">
        <div>
          <div class="setting-row__label">强调色</div>
          <div class="setting-row__desc">换一种心情的底色</div>
        </div>
        <div class="setting-row__ctrl">
          <div class="swatches" id="accentRow">
            ${accents.map(([k, c]) => `<button class="swatch${currentAccent === k ? ' active' : ''}" data-accent="${k}" style="background:${c}"></button>`).join('')}
          </div>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">夜间模式</div>
          <div class="setting-row__desc">晚上看更舒服</div>
        </div>
        <div class="setting-row__ctrl">
          <button class="btn btn--sm ${dark ? 'btn--primary' : 'btn--ghost'}" data-theme-toggle>${dark ? '已开启' : '关闭'}</button>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">当前身份</div>
          <div class="setting-row__desc">你在这台设备上是 ${esc(nameOf(App.me))}，发布内容都会记在这个名字下</div>
        </div>
        <div class="setting-row__ctrl" style="font-size:13.5px;color:var(--accent);font-weight:600">${esc(nameOf(App.me))}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:10px">
        <div>
          <div class="section-head__title">位置共享</div>
          <div class="section-head__desc">只在这台服务器上算距离，不经过任何第三方地图</div>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">开启定位</div>
          <div class="setting-row__desc">关掉之后两边都看不到对方在哪儿</div>
        </div>
        <div class="setting-row__ctrl">
          <button class="btn btn--sm ${locEnabled ? 'btn--primary' : 'btn--ghost'}" data-loc-enabled>${locEnabled ? '已开启' : '已关闭'}</button>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">我暂停共享</div>
          <div class="setting-row__desc">只停我自己的，对方的还能看见</div>
        </div>
        <div class="setting-row__ctrl">
          <button class="btn btn--sm ${pausedMe ? 'btn--ghost' : 'btn--primary'}" data-loc-pause>${pausedMe ? '已暂停' : '共享中'}</button>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">上报间隔</div>
          <div class="setting-row__desc">越短越实时，也越费电</div>
        </div>
        <div class="setting-row__ctrl" style="min-width:150px">
          <select class="input input--sm" id="sLocInterval">
            ${[[30, '30 秒'], [60, '1 分钟'], [180, '3 分钟'], [300, '5 分钟'], [600, '10 分钟']]
              .map(([v, t]) => `<option value="${v}"${Number(s['loc.interval'] || 60) === v ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">常去的地方</div>
          <div class="setting-row__desc">${places.length ? places.map((p) => `${p.icon} ${esc(p.name)}`).join('、') : '加上家和公司，位置会显示成名字'}</div>
        </div>
        <div class="setting-row__ctrl"><button class="btn btn--sm btn--ghost" data-places>管理</button></div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">清掉我的轨迹</div>
          <div class="setting-row__desc">只删历史点，不影响现在的定位</div>
        </div>
        <div class="setting-row__ctrl"><button class="btn btn--sm btn--danger" data-loc-clear>清除</button></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:10px">
        <div>
          <div class="section-head__title">周期默认值</div>
          <div class="section-head__desc">记录多了会自动按实际数据修正</div>
        </div>
      </div>
      <div class="row">
        <div class="flex1">
          <div class="field">
            <label class="field__label">平均周期（天）</label>
            <input class="input" type="number" id="sCycle" min="15" max="60" value="${esc(s['cycle.avg_cycle'] || '28')}">
          </div>
        </div>
        <div class="flex1">
          <div class="field">
            <label class="field__label">平均经期（天）</label>
            <input class="input" type="number" id="sLength" min="1" max="14" value="${esc(s['cycle.avg_length'] || '5')}">
          </div>
        </div>
        <div class="flex1">
          <div class="field">
            <label class="field__label">提前几天提醒</label>
            <input class="input" type="number" id="sRemind" min="0" max="14" value="${esc(s['cycle.remind_days'] || '3')}">
          </div>
        </div>
      </div>
      <button class="btn btn--primary btn--sm" data-save-cycle>保存</button>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:10px">
        <div>
          <div class="section-head__title">密码</div>
          <div class="section-head__desc">改完之后所有设备都要重新进入</div>
        </div>
      </div>
      <div class="field">
        <label class="field__label">当前密码</label>
        <input class="input" type="password" id="pwCur" autocomplete="current-password">
      </div>
      <div class="field">
        <label class="field__label">新密码（至少 6 位）</label>
        <input class="input" type="password" id="pwNew" autocomplete="new-password">
      </div>
      <button class="btn btn--ghost" data-change-pw>修改密码</button>
    </div>

    <div class="card">
      <div class="section-head" style="margin-bottom:10px">
        <div>
          <div class="section-head__title">数据</div>
          <div class="section-head__desc">所有记录都存在这台电脑上</div>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">导出备份</div>
          <div class="setting-row__desc">下载一个 JSON，包含全部文字记录</div>
        </div>
        <div class="setting-row__ctrl"><button class="btn btn--sm btn--ghost" data-export>导出</button></div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">照片文件夹</div>
          <div class="setting-row__desc">data/uploads 里的原图，直接复制走就行</div>
        </div>
        <div class="setting-row__ctrl" style="font-size:12px;color:var(--text-soft)">本地</div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">离开小窝</div>
          <div class="setting-row__desc">下次要重新输密码</div>
        </div>
        <div class="setting-row__ctrl"><button class="btn btn--sm btn--danger" data-logout>退出</button></div>
      </div>
    </div>
  `);

  /* 头像 */
  el.querySelectorAll('[data-avatar]').forEach((box) => {
    box.onclick = async () => {
      const who = box.dataset.avatar;
      const files = await pickFiles('image/*', false);
      if (!files.length) return;
      try {
        const small = await compressImage(files[0], 480, 0.88);
        const fd = new FormData();
        fd.append('author', who);
        fd.append('files', small, small.name || 'avatar.jpg');
        const r = await api('/api/upload/avatar', { method: 'POST', body: fd });
        App.settings[who === 'a' ? 'couple.avatar_a' : 'couple.avatar_b'] = r.url;
        toast('换好了', 'ok');
        App.go('settings');
      } catch (e) { toast(e.message, 'err'); }
    };
  });

  /* 基本信息 */
  el.querySelector('[data-save-basic]').onclick = async () => {
    try {
      const r = await api('/api/settings', {
        method: 'PATCH',
        body: {
          'couple.title': el.querySelector('#sTitle').value.trim(),
          'couple.subtitle': el.querySelector('#sSub').value.trim(),
          'couple.name_a': el.querySelector('#sNameA').value.trim(),
          'couple.name_b': el.querySelector('#sNameB').value.trim(),
          'couple.start_date': el.querySelector('#sStart').value,
        },
      });
      App.settings = r;
      const st = await api('/api/stats');
      App.stats = st;
      toast('保存好了', 'ok');
      App.chrome();
      App.go('settings');
    } catch (e) { toast(e.message, 'err'); }
  };

  /* 强调色 */
  el.querySelectorAll('[data-accent]').forEach((b) => {
    b.onclick = async () => {
      document.documentElement.dataset.accent = b.dataset.accent;
      try { localStorage.setItem('nest.accent', b.dataset.accent); } catch { /* ignore */ }
      el.querySelectorAll('[data-accent]').forEach((x) => x.classList.toggle('active', x === b));
      try { await api('/api/settings', { method: 'PATCH', body: { 'ui.accent': b.dataset.accent } }); } catch { /* ignore */ }
    };
  });

  /* 主题 */
  el.querySelector('[data-theme-toggle]').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? '' : 'dark';
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('nest.theme', next); } catch { /* ignore */ }
    App.go('settings');
  };

  /* 周期默认值 */
  el.querySelector('[data-save-cycle]').onclick = async () => {
    try {
      const r = await api('/api/settings', {
        method: 'PATCH',
        body: {
          'cycle.avg_cycle': Number(el.querySelector('#sCycle').value) || 28,
          'cycle.avg_length': Number(el.querySelector('#sLength').value) || 5,
          'cycle.remind_days': Number(el.querySelector('#sRemind').value) || 3,
        },
      });
      App.settings = r;
      toast('保存好了', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  /* 位置共享 */
  const patchLoc = async (body, okText) => {
    try {
      await api('/api/settings', { method: 'PATCH', body });
      toast(okText, 'ok');
      App.go('settings');
    } catch (e) { toast(e.message, 'err'); }
  };

  el.querySelector('[data-loc-enabled]').onclick = () => {
    patchLoc({ 'loc.enabled': locEnabled ? '0' : '1' }, locEnabled ? '定位已关闭' : '定位已开启');
  };

  el.querySelector('[data-loc-pause]').onclick = () => {
    const key = App.me === 'b' ? 'loc.paused_b' : 'loc.paused_a';
    patchLoc({ [key]: pausedMe ? '0' : '1' }, pausedMe ? '继续共享位置' : '已暂停共享');
  };

  el.querySelector('#sLocInterval').onchange = (ev) => {
    patchLoc({ 'loc.interval': Number(ev.target.value) }, '上报间隔改好了');
  };

  el.querySelector('[data-places]').onclick = () => openPlacesManager(places);

  el.querySelector('[data-loc-clear]').onclick = () => {
    confirmDialog('会删掉你所有的历史位置点，对方也就看不到你过去走过的路线了。现在的定位不受影响。', async () => {
      try {
        await api('/api/location/clear', { method: 'POST', body: { all: false } });
        toast('轨迹清空了', 'ok');
        App.go('settings');
      } catch (e) { toast(e.message, 'err'); }
    }, '清掉');
  };

  /* 改密码 */
  el.querySelector('[data-change-pw]').onclick = async () => {
    const current = el.querySelector('#pwCur').value;
    const next = el.querySelector('#pwNew').value;
    if (!current || !next) { toast('两个都填一下', 'err'); return; }
    if (next.length < 6) { toast('新密码至少 6 位', 'err'); return; }
    try {
      await api('/api/auth/password', { method: 'POST', body: { current, next } });
      toast('改好了，请重新进入', 'ok');
      setTimeout(() => { window.location.href = '/login'; }, 900);
    } catch (e) { toast(e.message, 'err'); }
  };

  /* 导出 */
  el.querySelector('[data-export]').onclick = () => {
    window.location.href = '/api/export';
  };

  /* 退出 */
  el.querySelector('[data-logout]').onclick = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/login';
  };
};

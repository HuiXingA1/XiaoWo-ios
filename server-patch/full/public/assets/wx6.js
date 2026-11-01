'use strict';

/* ═══════════════════════════════════════════════════════════════
   wx6.js · v6 新功能视图
     F3  今天的小事   Views.challenge
     F4  恋爱基金     Views.fund
     F9  共同歌单     Views.songs
   依赖 wx.js 的 WX_ICO / wxLoading / wxEmpty / wxTimer。
   ═══════════════════════════════════════════════════════════════ */

function wx6yuan(cents) {
  const n = Number(cents) || 0;
  const v = n / 100;
  /* 整数就不带小数，有零头才显示两位 */
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function wx6Date(iso) {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return `${Number(m)} 月 ${Number(d)} 日`;
}

function wx6DayLabel(iso) {
  const today = isoOf(new Date());
  const y = addDays(today, -1);
  if (iso === today) return '今天';
  if (iso === y) return '昨天';
  return wx6Date(iso);
}

/* ═══════════════════════════════════════════════════════════════
   F3 · 今天的小事
   不做付费补签、不做断签惩罚 —— 断了只写「今天继续」。
   ═══════════════════════════════════════════════════════════════ */

const CH_KIND_CN = { act: '一起做', say: '说一句', photo: '拍一张', touch: '靠近一点' };

Views.challenge = async function (el) {
  if (App.setChrome) App.setChrome({ title: '今天的小事', sub: '', back: true, tab: 'discover', actions: '' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let d;
  try {
    d = await api('/api/challenge/today');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const other = otherOf(App.me);
  let hist = { items: [], streak: d.streak, best: d.best };
  try {
    hist = await api('/api/challenge/history');
  } catch (e) {
    /* 历史拿不到不影响今天 */
  }

  const stamp = (who) => `<span class="p-ch__stamp p-ch__stamp--${who}">${esc(
    String(nameOf(who)).slice(0, 1)
  )}</span>`;

  el.innerHTML = `<div class="p-page">
    <div class="p-ch__wrap">
      <div class="p-ch__note">
        <div class="p-ch__top">
          <span class="p-ch__kind">${esc(CH_KIND_CN[d.kind] || '一起做')}</span>
          <span class="p-ch__date">${esc(wx6Date(d.date))}</span>
        </div>
        <div class="p-ch__title">${esc(d.title)}</div>
        ${d.detail ? `<div class="p-ch__detail">${esc(d.detail)}</div>` : ''}
        ${
          d.both
            ? `<div class="p-ch__done">
                 <div class="p-ch__stamps">${stamp(App.me)}${stamp(other)}</div>
                 <div class="p-ch__done__t">今天两个人都做到了</div>
               </div>`
            : `<div class="p-ch__acts">
                 ${
                   d.mine
                     ? `<div class="p-ch__wait">你已经点过了，等 ${esc(nameOf(other))} 也点一下</div>
                        <button class="p-btn p-btn--ghost p-btn--block" type="button" data-undo>点错了，撤回来</button>`
                     : `<button class="p-btn p-btn--primary p-btn--block" type="button" data-done>我完成了</button>`
                 }
               </div>`
        }
      </div>

      ${
        d.mine && !d.both
          ? `<div class="p-ch__mine">
               ${d.mine.url ? `<img src="${esc(d.mine.url)}" alt="">` : ''}
               ${d.mine.note ? `<div class="p-ch__mine__n">${esc(d.mine.note)}</div>` : ''}
             </div>`
          : ''
      }
    </div>

    <div class="p-ch__streak">
      <div class="p-ch__streak__n"><b>${d.streak}</b><span>天</span></div>
      <div class="p-ch__streak__meta">
        <div class="p-ch__streak__t">${d.streak ? `连续第 ${d.streak} 天` : '从今天开始'}</div>
        <div class="p-ch__streak__d">${
          d.streak
            ? `最长 ${d.best} 天`
            : '断了也没关系，随时都能重新开始'
        }</div>
      </div>
      <div class="p-ch__grace">这个月还能歇 ${d.graceLeft} 天</div>
    </div>

    ${
      hist.items.length > 1
        ? `<div class="p-sec" style="margin-top:20px">
             <h2 class="p-sec__t">这些天做过的事</h2>
             <div class="p-list">${hist.items
               .filter((x) => x.date !== d.date)
               .slice(0, 12)
               .map(
                 (h) => `<div class="p-cell p-cell--static">
                   <div class="p-cell__ico ico-${h.done ? 4 : 8}">${h.done ? WX_ICO.check : WX_ICO.dot}</div>
                   <div class="p-cell__body">
                     <div class="p-cell__t">${esc(h.title)}</div>
                     <div class="p-cell__d">${esc(wx6DayLabel(h.date))}${
                   h.done ? ' · 两个人都做到了' : h.doneN ? ' · 一个人做到了' : ' · 那天没做'
                 }</div>
                   </div>
                 </div>`
               )
               .join('')}</div>
           </div>`
        : ''
    }

    <div class="p-sign">每天零点换一件，两个人都点了才算</div>
  </div>`;

  const done = el.querySelector('[data-done]');
  if (done) {
    done.onclick = () => wxChallengeDone(d);
  }
  const undo = el.querySelector('[data-undo]');
  if (undo) {
    undo.onclick = async () => {
      undo.disabled = true;
      try {
        await api('/api/challenge/undo', { method: 'POST' });
        App.go('challenge', { replace: true });
      } catch (e) {
        undo.disabled = false;
        toast((e && e.message) || '没撤成', 'error');
      }
    };
  }
};

/* 完成弹层：一句话 + 可选一张图 */
function wxChallengeDone(d) {
  let mediaId = null;
  let preview = '';

  openModal({
    title: '我完成了',
    body: `<div class="p-field" style="padding:0">
      <div class="p-field__label">说一句（可不写）</div>
      <textarea class="p-textarea" data-n maxlength="300" placeholder="今天…"></textarea>
    </div>
    <div class="p-ch__pick" data-pick>
      <span class="p-ch__pick__i">${WX_ICO.image}</span>
      <span>加一张图</span>
    </div>
    <div class="p-ch__prev" data-prev hidden></div>`,
    footer: `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-ok>交上去</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close();

      const pick = modal.querySelector('[data-pick]');
      const prev = modal.querySelector('[data-prev]');
      pick.onclick = async () => {
        const files = await pickFiles('image/*', false);
        if (!files || !files.length) return;
        try {
          pick.classList.add('is-busy');
          const up = await uploadFiles(files);
          if (up && up[0]) {
            mediaId = up[0].id;
            preview = up[0].url;
            prev.hidden = false;
            prev.innerHTML = `<img src="${esc(preview)}" alt="">`;
          }
        } catch (e) {
          toast((e && e.message) || '没传上去', 'error');
        } finally {
          pick.classList.remove('is-busy');
        }
      };

      modal.querySelector('[data-ok]').onclick = async () => {
        const note = modal.querySelector('[data-n]').value.trim();
        try {
          await api('/api/challenge/done', {
            method: 'POST',
            body: { note: note || undefined, media: mediaId ? [mediaId] : undefined },
          });
          close();
          App.go('challenge', { replace: true });
        } catch (e) {
          toast((e && e.message) || '没交上', 'error');
        }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════════════
   F4 · 恋爱基金（纯记账，不接支付）
   ═══════════════════════════════════════════════════════════════ */

Views.fund = async function (el) {
  if (App.setChrome) App.setChrome({ title: '恋爱基金', sub: '', back: true, tab: 'discover', actions: 'fund' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let d;
  try {
    d = await api('/api/fund');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const other = otherOf(App.me);
  const main = (d.goals || []).find((g) => !g.achievedAt) || (d.goals || [])[0] || null;
  const net = d.stats.netCents;
  /* 顶栏「记一笔」要用到目标列表 */
  App._fundGoals = d.goals || [];

  /* 按日分组 */
  const groups = [];
  let cur = null;
  for (const t of d.items || []) {
    if (!cur || cur.date !== t.date) {
      cur = { date: t.date, items: [], out: 0, in: 0 };
      groups.push(cur);
    }
    cur.items.push(t);
    if (t.kind === 'out') cur.out += t.amountCents;
    else if (t.kind === 'in') cur.in += t.amountCents;
  }

  el.innerHTML = `<div class="p-page">
    ${
      main
        ? `<div class="p-fund__goal">
             <div class="p-fund__goal__top">
               <span class="p-fund__emoji">${esc(main.emoji || '✈️')}</span>
               <span class="p-fund__name">${esc(main.title)}</span>
               ${main.dueDate ? `<span class="p-fund__due">${esc(main.dueDate.slice(0, 7))} 前</span>` : ''}
             </div>
             <div class="p-fund__nums">
               <b>¥${wx6yuan(main.savedCents)}</b>
               <span>/ ¥${wx6yuan(main.targetCents)}</span>
             </div>
             <div class="p-fund__bar"><i style="width:${Math.min(
               100,
               main.targetCents ? (main.savedCents / main.targetCents) * 100 : 0
             ).toFixed(1)}%"></i></div>
             <div class="p-fund__foot">
               <span>${
                 main.targetCents
                   ? `还差 ¥${wx6yuan(Math.max(0, main.targetCents - main.savedCents))}`
                   : ''
               }</span>
               <button class="p-fund__del" type="button" data-goal-del="${main.id}">删掉目标</button>
             </div>
           </div>`
        : `<div class="p-fund__empty">
             <div class="p-fund__empty__t">还没有一起存钱的目标</div>
             <div class="p-fund__empty__d">比如「旅行基金」，看着进度涨起来</div>
             <button class="p-btn p-btn--primary" type="button" data-goal-new style="margin-top:14px">定一个</button>
           </div>`
    }

    <div class="p-fund__stats">
      <div class="p-fund__stat">
        <b>¥${wx6yuan(d.stats.monthOutCents)}</b>
        <span>这个月花在恋爱上</span>
      </div>
      <div class="p-fund__stat">
        <b class="${net > 0 ? 'is-owe' : net < 0 ? 'is-mine' : ''}">${
      net === 0 ? '平' : `¥${wx6yuan(Math.abs(net))}`
    }</b>
        <span>${
      net === 0 ? '两个人刚好' : net > 0 ? `${esc(nameOf(other))} 该给我` : `我该给 ${esc(nameOf(other))}`
    }</span>
      </div>
    </div>

    ${
      groups.length
        ? groups
            .map(
              (g) => `<div class="p-fund__day">
                <div class="p-fund__dayhead">
                  <span>${esc(wx6DayLabel(g.date))}</span>
                  <span class="p-fund__daysum">${g.out ? `-${wx6yuan(g.out)}` : ''}${
                g.in ? `${g.out ? ' · ' : ''}+${wx6yuan(g.in)}` : ''
              }</span>
                </div>
                ${g.items
                  .map(
                    (t) => `<div class="p-fund__row">
                      <div class="p-fund__row__i ico-${t.kind === 'in' ? 4 : t.kind === 'adj' ? 3 : 2}">${
                      t.kind === 'in' ? WX_ICO.wallet : WX_ICO.bag
                    }</div>
                      <div class="p-fund__row__b">
                        <div class="p-fund__row__t">${esc(t.title)}</div>
                        <div class="p-fund__row__d">${esc(t.category || '')} · ${esc(
                      nameOf(t.author)
                    )} 付${t.settled ? ' · 已结清' : ''}</div>
                      </div>
                      <div class="p-fund__row__v p-fund__row__v--${t.kind}">${
                      t.kind === 'in' ? '+' : t.kind === 'out' ? '-' : ''
                    }${wx6yuan(t.amountCents)}</div>
                    </div>`
                  )
                  .join('')}
              </div>`
            )
            .join('')
        : `<div style="padding:26px 16px">${wxEmpty('还没有账', '吃一顿、看一场，随手记一条')}</div>`
    }

    <div class="p-fund__foot2">
      <button class="p-btn p-btn--ghost p-btn--block" type="button" data-settle>${
        d.stats.settleCount ? `我们结清了（${d.stats.settleCount} 笔）` : '已经没有没结清的了'
      }</button>
    </div>
    <div class="p-sign">只是记账，不经手任何钱 · 任一方都能单方结清</div>
  </div>`;

  el.querySelectorAll('[data-goal-del]').forEach((b) => {
    b.onclick = () => {
      confirmDialog('删掉这个目标？记过的账不会跟着删。', async () => {
        try {
          await api(`/api/fund/goals/${b.dataset.goalDel}`, { method: 'DELETE' });
          App.go('fund', { replace: true });
        } catch (e) {
          toast((e && e.message) || '没删掉', 'error');
        }
      }, '删掉');
    };
  });

  const gn = el.querySelector('[data-goal-new]');
  if (gn) gn.onclick = () => wxFundGoal();

  const st = el.querySelector('[data-settle]');
  if (st && d.stats.settleCount) {
    st.onclick = () => {
      confirmDialog('把现在的账都标成结清？之后记的账不受影响。', async () => {
        try {
          await api('/api/fund/settle', { method: 'POST' });
          toast('结清了');
          App.go('fund', { replace: true });
        } catch (e) {
          toast((e && e.message) || '没结上', 'error');
        }
      }, '结清');
    };
  }
};

function wxFundGoal() {
  openModal({
    title: '定一个目标',
    body: `<div class="p-field" style="padding:0">
      <div class="p-field__label">叫什么</div>
      <input class="p-input" data-t maxlength="40" placeholder="旅行基金">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">目标金额（元）</div>
      <input class="p-input" data-a inputmode="decimal" placeholder="8000">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">什么时候之前（可不填）</div>
      <input class="p-input" data-d type="date">
    </div>`,
    footer: `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-ok>定好</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close();
      modal.querySelector('[data-ok]').onclick = async () => {
        const t = modal.querySelector('[data-t]').value.trim();
        const a = Number(modal.querySelector('[data-a]').value);
        if (!t) return toast('起个名字');
        if (!(a > 0)) return toast('写个金额');
        try {
          await api('/api/fund/goals', {
            method: 'POST',
            body: { title: t, targetCents: Math.round(a * 100), dueDate: modal.querySelector('[data-d]').value || undefined },
          });
          close();
          App.go('fund', { replace: true });
        } catch (e) {
          toast((e && e.message) || '没定上', 'error');
        }
      };
    },
  });
}

/* 记一笔：金额 + 分类 + 谁付的 */
function wxFundAdd(goals) {
  let kind = 'out';
  let cat = '吃饭';
  let author = App.me;

  openModal({
    title: '记一笔',
    body: `<div class="p-chips" data-kind style="padding:0 0 4px">
      <button class="p-chip on" type="button" data-k="out">花出去</button>
      <button class="p-chip" type="button" data-k="in">存进来</button>
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">多少钱（元）</div>
      <input class="p-input" data-a inputmode="decimal" placeholder="0.00" style="font-size:22px;font-variant-numeric:tabular-nums">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">买什么 / 干什么</div>
      <input class="p-input" data-t maxlength="60" placeholder="周末吃饭">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">算哪一类</div>
      <div class="p-chips" data-cat>
        ${['吃饭', '礼物', '旅行', '房租', '存钱', '其他']
          .map(
            (c, i) => `<button class="p-chip${i === 0 ? ' on' : ''}" type="button" data-c="${c}">${c}</button>`
          )
          .join('')}
      </div>
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">谁付的</div>
      <div class="p-chips" data-who>
        <button class="p-chip on" type="button" data-w="${App.me}">我</button>
        <button class="p-chip" type="button" data-w="${otherOf(App.me)}">${esc(nameOf(otherOf(App.me)))}</button>
      </div>
    </div>
    ${
      goals && goals.length
        ? `<div class="p-field" style="padding:14px 0 0">
             <div class="p-field__label">算进哪个目标（可不选）</div>
             <div class="p-chips" data-goal>
               <button class="p-chip on" type="button" data-g="">不选</button>
               ${goals
                 .filter((g) => !g.achievedAt)
                 .map((g) => `<button class="p-chip" type="button" data-g="${g.id}">${esc(g.emoji)} ${esc(g.title)}</button>`)
                 .join('')}
             </div>
           </div>`
        : ''
    }`,
    footer: `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-ok>记上</button>`,
    onMount: (modal, close) => {
      let goalId = null;
      const bind = (sel, attr, fn) => {
        const box = modal.querySelector(sel);
        if (!box) return;
        box.querySelectorAll(`[data-${attr}]`).forEach((b) => {
          b.onclick = () => {
            box.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.toggle('on', x === b));
            fn(b.dataset[attr]);
          };
        });
      };
      bind('[data-kind]', 'k', (v) => { kind = v; });
      bind('[data-cat]', 'c', (v) => { cat = v; });
      bind('[data-who]', 'w', (v) => { author = v; });
      bind('[data-goal]', 'g', (v) => { goalId = v ? Number(v) : null; });

      modal.querySelector('[data-x]').onclick = () => close();
      modal.querySelector('[data-ok]').onclick = async () => {
        const a = Number(modal.querySelector('[data-a]').value);
        const t = modal.querySelector('[data-t]').value.trim();
        if (!(a > 0)) return toast('写个金额');
        if (!t) return toast('写点什么');
        try {
          await api('/api/fund/tx', {
            method: 'POST',
            body: { title: t, amountCents: Math.round(a * 100), kind, category: cat, author, goalId: goalId || undefined },
          });
          close();
          App.go('fund', { replace: true });
        } catch (e) {
          toast((e && e.message) || '没记上', 'error');
        }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════════════
   F9 · 共同歌单（只存元数据，点了跳外链）
   ═══════════════════════════════════════════════════════════════ */

Views.songs = async function (el) {
  if (App.setChrome) App.setChrome({ title: '我们的歌', sub: '', back: true, tab: 'discover', actions: 'song' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let d;
  try {
    d = await api('/api/songs');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const items = d.items || [];
  const pinned = items.filter((s) => s.pinned);
  const rest = items.filter((s) => !s.pinned);

  el.innerHTML = `<div class="p-page">
    ${
      pinned.length
        ? `<div class="p-songs__pin">
             <div class="p-songs__pin__t">我们的歌</div>
             <div class="p-songs__scroll">
               ${pinned
                 .map(
                   (s) => `<button class="p-songs__card" type="button" data-song="${s.id}">
                     <div class="p-songs__card__t">${esc(s.title)}</div>
                     <div class="p-songs__card__a">${esc(s.artist || '')}</div>
                   </button>`
                 )
                 .join('')}
             </div>
           </div>`
        : ''
    }

    ${
      rest.length
        ? `<div class="p-songs__list">${rest
            .map(
              (s) => `<button class="p-songs__row" type="button" data-song="${s.id}">
                <span class="p-songs__cover">${esc(String(s.title).slice(0, 1))}</span>
                <span class="p-songs__body">
                  <span class="p-songs__t">${esc(s.title)}</span>
                  <span class="p-songs__a">${esc(s.artist || '不知道谁唱的')}</span>
                  ${s.note ? `<span class="p-songs__n">${esc(s.note)}</span>` : ''}
                </span>
                ${s.url ? `<span class="p-songs__ext">${WX_ICO.link}</span>` : ''}
              </button>`
            )
            .join('')}</div>`
        : pinned.length
        ? ''
        : `<div style="padding:26px 16px">${wxEmpty('还没有歌', '听到一首想起对方的，就加进来', WX_ICO.music)}</div>`
    }

    <div class="p-songs__foot">
      <button class="p-btn p-btn--primary p-btn--block" type="button" data-add>加一首</button>
    </div>
    <div class="p-sign">只记名字，不存音频 · 点开有链接的会跳出去</div>
  </div>`;

  el.querySelectorAll('[data-song]').forEach((b) => {
    b.onclick = () => wxSongSheet(items.find((x) => String(x.id) === b.dataset.song));
  });

  const add = el.querySelector('[data-add]');
  if (add) add.onclick = () => wxSongAdd();
};

function wxSongSheet(s) {
  if (!s) return;
  const mask = document.createElement('div');
  mask.className = 'wx-sheet-mask';
  mask.innerHTML = `<div class="wx-sheet">
    <div class="wx-sheet__t">${esc(s.title)}${s.artist ? ' · ' + esc(s.artist) : ''}</div>
    ${s.note ? `<div class="p-songs__sheetnote">${esc(s.note)}</div>` : ''}
    ${
      s.url
        ? `<a class="wx-sheet__i" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-play>打开链接</a>`
        : ''
    }
    <button class="wx-sheet__i" type="button" data-pin>${s.pinned ? '取消「我们的歌」' : '设为「我们的歌」'}</button>
    <button class="wx-sheet__i wx-sheet__i--danger" type="button" data-del>删掉</button>
    <button class="wx-sheet__cancel" type="button" data-cancel>关闭</button>
  </div>`;
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });
  mask.querySelector('[data-cancel]').onclick = close;

  const play = mask.querySelector('[data-play]');
  if (play) {
    play.onclick = () => {
      api(`/api/songs/${s.id}`, { method: 'PATCH', body: { play: true } }).catch(() => {});
    };
  }

  mask.querySelector('[data-pin]').onclick = async () => {
    try {
      await api(`/api/songs/${s.id}`, { method: 'PATCH', body: { pin: !s.pinned } });
      close();
      App.go('songs', { replace: true });
    } catch (e) {
      toast((e && e.message) || '没改上', 'error');
    }
  };

  mask.querySelector('[data-del]').onclick = () => {
    close();
    confirmDialog('从歌单里删掉这首？', async () => {
      try {
        await api(`/api/songs/${s.id}`, { method: 'DELETE' });
        App.go('songs', { replace: true });
      } catch (e) {
        toast((e && e.message) || '没删掉', 'error');
      }
    }, '删掉');
  };

  document.body.appendChild(mask);
}

function wxSongAdd() {
  openModal({
    title: '加一首',
    body: `<div class="p-field" style="padding:0">
      <div class="p-field__label">歌名</div>
      <input class="p-input" data-t maxlength="80" placeholder="比如：小情歌">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">谁唱的（可不填）</div>
      <input class="p-input" data-a maxlength="60" placeholder="苏打绿">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">为什么是这首（可不填）</div>
      <textarea class="p-textarea" data-n maxlength="200" placeholder="那天在车里循环了一路"></textarea>
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">链接（可不填）</div>
      <input class="p-input" data-u maxlength="500" inputmode="url" placeholder="粘贴任意音乐 App 的分享链接">
    </div>
    <label class="p-cool__priv" style="padding-left:0;padding-right:0">
      <input type="checkbox" data-pin>
      <span>放进「我们的歌」</span>
    </label>`,
    footer: `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-ok>加上</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close();
      modal.querySelector('[data-ok]').onclick = async () => {
        const t = modal.querySelector('[data-t]').value.trim();
        if (!t) return toast('写个歌名');
        try {
          await api('/api/songs', {
            method: 'POST',
            body: {
              title: t,
              artist: modal.querySelector('[data-a]').value.trim() || undefined,
              note: modal.querySelector('[data-n]').value.trim() || undefined,
              url: modal.querySelector('[data-u]').value.trim() || undefined,
              pinned: modal.querySelector('[data-pin]').checked,
            },
          });
          close();
          App.go('songs', { replace: true });
        } catch (e) {
          toast((e && e.message) || '没加上', 'error');
        }
      };
    },
  });
}

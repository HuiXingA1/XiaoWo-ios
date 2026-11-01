'use strict';

/* ═══════════════════════════════════════════════════════════════
   wx5.js · v5 新功能视图
     F6  共同相册   Views.albums / Views.album
     F7  冷静卡     Views.cool
     F8  情侣树     Views.tree
     F10 抽签       Views.draw
     F11 共享日历   Views.events
     F12 成就徽章   Views.badges
   依赖 wx.js 里的 WX_ICO / wxLoading / wxEmpty / wxGallery / wxRing。
   ═══════════════════════════════════════════════════════════════ */

/* 视图级定时器：切页面时必须清掉，否则倒计时会在后台一直跑 */
const WX_TIMERS = [];
function wxTimer(fn, ms) {
  const id = setInterval(fn, ms);
  WX_TIMERS.push(id);
  return id;
}
function wxClearTimers() {
  while (WX_TIMERS.length) clearInterval(WX_TIMERS.pop());
}

function wxPad2(n) { return String(n).padStart(2, '0'); }

function wxMonthGrid(year, month1) {
  const first = new Date(year, month1 - 1, 1);
  const lead = (first.getDay() + 6) % 7; /* 周一开头 */
  const total = new Date(year, month1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(`${year}-${wxPad2(month1)}-${wxPad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function wxDur(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${wxPad2(m)}:${wxPad2(r)}`;
}

function wxMonthName(iso) {
  const [y, m] = String(iso).split('-');
  return `${y} 年 ${Number(m)} 月`;
}

/* ═══════════════════════════════════════════════════════════════
   F6 · 共同相册
   ═══════════════════════════════════════════════════════════════ */

Views.albums = async function (el) {
  if (App.setChrome) App.setChrome({ title: '共同相册', sub: '', back: true, tab: 'discover', actions: 'album' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let data;
  try {
    data = await api('/api/albums');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    el.innerHTML = `<div class="p-page">
      ${wxEmpty('还没有相册', '把散在动态里的照片，收成一本一本的', WX_ICO.album)}
      <div style="padding:0 24px 24px">
        <button class="p-btn p-btn--primary p-btn--block" type="button" data-new>建第一本</button>
      </div>
    </div>`;
    const b = el.querySelector('[data-new]');
    if (b) b.onclick = () => wxAlbumAdd();
    return;
  }

  el.innerHTML = `<div class="p-page">
    <div class="p-albums">
      ${items
        .map(
          (a) => `<button class="p-alb" type="button" data-album="${a.id}">
            <div class="p-alb__cover">
              ${a.cover ? `<img src="${esc(a.cover)}" alt="" loading="lazy">` : `<span class="p-alb__ph">${WX_ICO.album}</span>`}
              <span class="p-alb__n">${a.count}</span>
            </div>
            <div class="p-alb__t">${esc(a.title)}</div>
            <div class="p-alb__d">${esc(a.year || '')}${
              a.year && a.count ? ' · ' : ''
            }${a.count ? `${a.count} 张` : '还是空的'}</div>
          </button>`
        )
        .join('')}
    </div>
    <div class="p-sign">照片只存在这台服务器上</div>
  </div>`;

  el.querySelectorAll('[data-album]').forEach((b) => {
    b.onclick = () => App.go('album', { params: { id: b.dataset.album } });
  });
};

/* 新建相册：标题 + 一次选几张照片 */
async function wxAlbumAdd() {
  const files = await pickFiles('image/*', true);
  const ids = [];
  if (files && files.length) {
    try {
      toast('正在上传…');
      const up = await uploadFiles(files);
      for (const f of up) ids.push(f.id);
    } catch (e) {
      toast((e && e.message) || '上传失败', 'error');
      return;
    }
  }

  openModal({
    title: '新建相册',
    body: `<div class="p-field" style="padding:0">
      <div class="p-field__label">名字</div>
      <input class="p-input" data-t maxlength="30" placeholder="比如：第一次去看海">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">年份（可不填）</div>
      <input class="p-input" data-y inputmode="numeric" maxlength="4" placeholder="${new Date().getFullYear()}">
    </div>
    ${
      ids.length
        ? `<div class="p-alb__pick">已选 ${ids.length} 张</div>`
        : `<div class="p-alb__pick p-alb__pick--empty">没选照片也行，进去再补</div>`
    }`,
    footer: `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-ok>建好</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close();
      const ok = async () => {
        const t = modal.querySelector('[data-t]').value.trim();
        if (!t) return toast('起个名字吧');
        const y = modal.querySelector('[data-y]').value.trim();
        try {
          const r = await api('/api/albums', { method: 'POST', body: { title: t, year: y || undefined, media: ids } });
          close();
          App.go('album', { replace: true, params: { id: r.id } });
        } catch (e) {
          toast((e && e.message) || '没建成', 'error');
        }
      };
      modal.querySelector('[data-ok]').onclick = ok;
    },
  });
}

Views.album = async function (el, opts) {
  const id = (opts && opts.params && opts.params.id) || (App.params && App.params.id);
  if (!id) {
    App.go('albums', { replace: true });
    return;
  }
  if (App.setChrome) App.setChrome({ title: '相册', sub: '', back: true, tab: 'discover', actions: 'album' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let data;
  try {
    data = await api(`/api/albums/${id}`);
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('打不开这本', (e && e.message) || '可能被删了')}</div>`;
    return;
  }

  const a = data.album;
  const items = data.items || [];
  const urls = items.map((x) => x.url);
  if (App.setChrome) App.setChrome({ title: a.title, sub: '', back: true, tab: 'discover', actions: 'album' });

  el.innerHTML = `<div class="p-page">
    <div class="p-albhead">
      <div class="p-albhead__t">${esc(a.title)}</div>
      <div class="p-albhead__d">${esc(a.year || '')}${a.year ? ' · ' : ''}${
        items.length ? `${items.length} 张` : '还是空的'
      }</div>
      ${a.note ? `<div class="p-albhead__n">${esc(a.note)}</div>` : ''}
    </div>

    ${
      items.length
        ? `<div class="p-photos">${items
            .map(
              (p, i) => `<button class="p-photo" type="button" data-photo="${i}">
                <img src="${esc(p.url)}" alt="" loading="lazy">
                ${p.caption ? `<span class="p-photo__cap">${esc(p.caption)}</span>` : ''}
              </button>`
            )
            .join('')}</div>`
        : wxEmpty('空的', '点右上角加几张照片')
    }

    <div style="padding:16px 16px 28px">
      <button class="p-btn p-btn--ghost p-btn--block" type="button" data-add>加照片</button>
      <button class="p-btn p-btn--danger p-btn--block" type="button" data-del style="margin-top:10px">删掉这本相册</button>
    </div>
  </div>`;

  el.querySelectorAll('[data-photo]').forEach((b) => {
    b.onclick = () => wxGallery(urls, Number(b.dataset.photo));
  });

  const add = el.querySelector('[data-add]');
  if (add) {
    add.onclick = async () => {
      const files = await pickFiles('image/*', true);
      if (!files || !files.length) return;
      add.disabled = true;
      try {
        const up = await uploadFiles(files);
        await api(`/api/albums/${id}/items`, { method: 'POST', body: { media: up.map((f) => f.id) } });
        App.go('album', { replace: true, params: { id } });
      } catch (e) {
        add.disabled = false;
        toast((e && e.message) || '没加上', 'error');
      }
    };
  }

  const del = el.querySelector('[data-del]');
  if (del) {
    del.onclick = () => {
      confirmDialog(
        '相册里的照片会一起删掉，删了就找不回来',
        async () => {
          try {
            await api(`/api/albums/${id}`, { method: 'DELETE' });
            App.go('albums', { replace: true });
          } catch (e) {
            toast((e && e.message) || '没删掉', 'error');
          }
        },
        '删掉'
      );
    };
  }
};

/* ═══════════════════════════════════════════════════════════════
   F7 · 冷静卡
   ═══════════════════════════════════════════════════════════════ */

Views.cool = async function (el) {
  if (App.setChrome) App.setChrome({ title: '冷静一下', sub: '', back: true, tab: 'me', actions: '' });
  wxClearTimers();

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let data;
  try {
    data = await api('/api/cool');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const cur = data.current;
  const hist = data.history || [];
  const other = otherOf(App.me);

  /* ── 正在冷却 ── */
  if (cur) {
    const mine = cur.mine;
    el.innerHTML = `<div class="p-page">
      <div class="p-cool p-cool--on">
        <div class="p-cool__k">${mine ? '你按了暂停' : `${esc(nameOf(other))} 按了暂停`}</div>
        <div class="p-cool__clock" data-clock>${wxDur(cur.leftMs)}</div>
        <div class="p-cool__hint">${
          mine ? '这段时间先不聊，等自己缓过来' : '不是不想理你，是现在说不清'
        }</div>
        ${
          cur.reason
            ? `<div class="p-cool__why">${esc(cur.reason)}</div>`
            : cur.reasonHidden
            ? `<div class="p-cool__why p-cool__why--hidden">对方写了理由，只给自己看</div>`
            : ''
        }
        <div class="p-cool__bar"><i data-bar style="width:${Math.max(
          0,
          Math.min(100, 100 - (cur.leftMs / (cur.minutes * 60000)) * 100)
        ).toFixed(1)}%"></i></div>
        <div class="p-cool__meta">${cur.minutes} 分钟 · 到点自动解开</div>
      </div>

      <div style="padding:16px">
        <button class="p-btn p-btn--primary p-btn--block" type="button" data-end>我已经好了</button>
      </div>

      <div class="p-sign">结束的时候可以留一句话，对方会看到</div>
    </div>`;

    const clock = el.querySelector('[data-clock]');
    const bar = el.querySelector('[data-bar]');
    const startedLeft = cur.leftMs;
    wxTimer(() => {
      const left = Math.max(0, cur.endsAt - Date.now());
      if (clock) clock.textContent = wxDur(left);
      if (bar) {
        const pct = 100 - (left / (cur.minutes * 60000)) * 100;
        bar.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + '%';
      }
      if (left <= 0) {
        wxClearTimers();
        App.go('cool', { replace: true });
      }
    }, 1000);
    void startedLeft;

    const end = el.querySelector('[data-end]');
    end.onclick = () => {
      openModal({
        title: '和解',
        body: `<div class="p-field" style="padding:0">
          <div class="p-field__label">留一句话（可不写）</div>
          <textarea class="p-textarea" data-n maxlength="200" placeholder="刚才是我急了…"></textarea>
        </div>`,
        footer: `<button class="p-btn p-btn--ghost" data-x>再等等</button><button class="p-btn p-btn--primary" data-ok>解开</button>`,
        onMount: (modal, close) => {
          modal.querySelector('[data-x]').onclick = () => close();
          modal.querySelector('[data-ok]').onclick = async () => {
            const n = modal.querySelector('[data-n]').value.trim();
            try {
              await api(`/api/cool/${cur.id}/end`, { method: 'POST', body: { note: n || undefined } });
              close();
              App.go('cool', { replace: true });
            } catch (e) {
              toast((e && e.message) || '没解开', 'error');
            }
          };
        },
      });
    };
    return;
  }

  /* ── 没在冷却：发起 ── */
  const MINUTES = [10, 30, 60, 120];
  el.innerHTML = `<div class="p-page">
    <div class="p-cool">
      <div class="p-cool__k">先别说话</div>
      <div class="p-cool__t">按一下暂停</div>
      <div class="p-cool__hint">不是冷战，是给情绪一个缓冲。<br>到点自动解开，谁都不用先低头。</div>
    </div>

    <div class="p-sec" style="margin-top:18px">
      <h2 class="p-sec__t">停多久</h2>
      <div class="p-chips" data-mins>
        ${MINUTES.map(
          (m, i) => `<button class="p-chip${i === 1 ? ' on' : ''}" type="button" data-min="${m}">${
            m >= 60 ? `${m / 60} 小时` : `${m} 分钟`
          }</button>`
        ).join('')}
      </div>
    </div>

    <div class="p-sec">
      <h2 class="p-sec__t">想说什么（可不写）</h2>
      <div class="p-card">
        <textarea class="p-textarea" data-reason maxlength="200" placeholder="写给自己看，也可以让对方看到"></textarea>
        <label class="p-cool__priv">
          <input type="checkbox" data-priv checked>
          <span>只有我自己能看到理由</span>
        </label>
      </div>
    </div>

    <div style="padding:4px 16px 24px">
      <button class="p-btn p-btn--primary p-btn--block" type="button" data-start>开始冷静</button>
    </div>

    ${
      hist.length
        ? `<div class="p-sec">
             <h2 class="p-sec__t">以前用过 <span class="p-sec__n">${hist.length}</span></h2>
             <div class="p-list">${hist
               .slice(0, 8)
               .map(
                 (h) => `<div class="p-cell p-cell--static">
                   <div class="p-cell__ico ico-6">${WX_ICO.snow}</div>
                   <div class="p-cell__body">
                     <div class="p-cell__t">${esc(nameOf(h.startedBy))} 停了 ${h.minutes} 分钟</div>
                     <div class="p-cell__d">${esc(
                       h.makeUpNote ? `「${h.makeUpNote}」` : h.resolvedBy ? `${nameOf(h.resolvedBy)} 先开的口` : '到点自己解开了'
                     )}</div>
                   </div>
                   <span class="p-cell__v">${esc(String(h.startedAt ? new Date(h.startedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : ''))}</span>
                 </div>`
               )
               .join('')}</div>
           </div>`
        : ''
    }
    <div class="p-sign">用 ${data.stats.done || 0} 次 · 每次都解开过</div>
  </div>`;

  let minutes = 30;
  el.querySelectorAll('[data-min]').forEach((b) => {
    b.onclick = () => {
      minutes = Number(b.dataset.min);
      el.querySelectorAll('[data-min]').forEach((x) => x.classList.toggle('on', x === b));
    };
  });

  const start = el.querySelector('[data-start]');
  start.onclick = async () => {
    start.disabled = true;
    const reason = el.querySelector('[data-reason]').value.trim();
    const priv = el.querySelector('[data-priv]').checked;
    try {
      await api('/api/cool', { method: 'POST', body: { minutes, reason: reason || undefined, private: priv } });
      App.go('cool', { replace: true });
    } catch (e) {
      start.disabled = false;
      toast((e && e.message) || '没开始', 'error');
    }
  };
};

/* ═══════════════════════════════════════════════════════════════
   F8 · 情侣树
   ═══════════════════════════════════════════════════════════════ */

function wxTreeSVG(stage, pct) {
  /* 6 个阶段：种子 → 发芽 → 小树 → 长大 → 开花 → 结果
     画布 200×190，地面 y=168，树往上长 */
  const s = Math.max(0, Math.min(5, Number(stage) || 0));
  const grow = s === 0 ? 0 : Math.min(1, 0.55 + (Number(pct) || 0) * 0.45);
  const canopy = [0, 15, 30, 41, 48, 50][s];
  const trunkH = [0, 24, 42, 58, 68, 72][s];
  const cx = 100;
  const groundY = 168;
  const trunkTop = groundY - trunkH;

  /* 树冠中心：三团叠在一起，花和果子都按这个圆心撒，不会飘出去 */
  const canopyCY = trunkTop - canopy * 0.32;
  const canopyR = canopy * 0.78;

  const leaves = [];
  if (s >= 2) {
    leaves.push(`<circle cx="${cx}" cy="${(canopyCY - canopy * 0.24).toFixed(1)}" r="${(canopy * 0.66).toFixed(1)}" />`);
    leaves.push(`<circle cx="${(cx - canopy * 0.6).toFixed(1)}" cy="${(canopyCY + canopy * 0.16).toFixed(1)}" r="${(canopy * 0.54).toFixed(1)}" />`);
    leaves.push(`<circle cx="${(cx + canopy * 0.6).toFixed(1)}" cy="${(canopyCY + canopy * 0.14).toFixed(1)}" r="${(canopy * 0.52).toFixed(1)}" />`);
    leaves.push(`<circle cx="${cx}" cy="${(canopyCY + canopy * 0.2).toFixed(1)}" r="${(canopy * 0.6).toFixed(1)}" />`);
  } else if (s === 1) {
    leaves.push(
      `<ellipse cx="${cx - 10}" cy="${trunkTop - 1}" rx="10.5" ry="5.6" transform="rotate(-26 ${cx - 10} ${trunkTop - 1})" />`
    );
    leaves.push(
      `<ellipse cx="${cx + 10}" cy="${trunkTop + 5}" rx="9.5" ry="5.2" transform="rotate(24 ${cx + 10} ${trunkTop + 5})" />`
    );
  }

  const flowers = [];
  if (s >= 4) {
    const rr = canopyR * 0.62;
    for (const deg of [196, 244, 292, 340, 28, 112, 150]) {
      const a = (deg * Math.PI) / 180;
      flowers.push(
        `<circle class="p-tree__flower" cx="${(cx + rr * Math.cos(a)).toFixed(1)}" cy="${(canopyCY + rr * Math.sin(a)).toFixed(1)}" r="3.2" />`
      );
    }
  }

  const fruits = [];
  if (s >= 5) {
    const rr = canopyR * 0.44;
    for (const deg of [170, 220, 266, 312, 14, 96]) {
      const a = (deg * Math.PI) / 180;
      fruits.push(
        `<circle class="p-tree__fruit" cx="${(cx + rr * Math.cos(a)).toFixed(1)}" cy="${(canopyCY + rr * Math.sin(a)).toFixed(1)}" r="4.2" />`
      );
    }
  }

  const w0 = 3.2 + s * 0.5; /* 树干底宽 */
  const w1 = 1.5 + s * 0.28; /* 树干顶宽 */

  return `<svg class="p-tree__svg" viewBox="0 0 200 190" role="img" aria-label="情侣树">
    <ellipse class="p-tree__shadow" cx="100" cy="170" rx="${(26 + s * 7).toFixed(1)}" ry="6.5" />
    ${s === 0 ? `<ellipse class="p-tree__seed" cx="100" cy="162" rx="7" ry="8.6" />` : ''}
    ${
      s >= 1
        ? `<path class="p-tree__trunk" d="M ${(cx - w0).toFixed(1)} ${groundY}
             C ${(cx - w0 * 0.9).toFixed(1)} ${(groundY - trunkH * 0.55).toFixed(1)}
               ${(cx - w1 * 1.1).toFixed(1)} ${(trunkTop + trunkH * 0.25).toFixed(1)}
               ${(cx - w1).toFixed(1)} ${trunkTop}
             L ${(cx + w1).toFixed(1)} ${trunkTop}
             C ${(cx + w1 * 1.1).toFixed(1)} ${(trunkTop + trunkH * 0.25).toFixed(1)}
               ${(cx + w0 * 0.9).toFixed(1)} ${(groundY - trunkH * 0.55).toFixed(1)}
               ${(cx + w0).toFixed(1)} ${groundY} Z" />`
        : ''
    }
    ${
      s >= 3
        ? `<path class="p-tree__branch" d="M ${cx} ${(trunkTop + 16).toFixed(1)}
             q -12 -6 -20 -20" fill="none" stroke-width="2.2" stroke-linecap="round"/>
           <path class="p-tree__branch" d="M ${cx} ${(trunkTop + 26).toFixed(1)}
             q 12 -8 19 -22" fill="none" stroke-width="2.2" stroke-linecap="round"/>`
        : ''
    }
    <g class="p-tree__leaves" style="transform-origin:${cx}px ${canopyCY.toFixed(1)}px;transform:scale(${s === 0 ? 0 : grow.toFixed(2)})">
      ${leaves.join('')}
    </g>
    ${flowers.join('')}
    ${fruits.join('')}
  </svg>`;
}

Views.tree = async function (el) {
  if (App.setChrome) App.setChrome({ title: '我们的小树', sub: '', back: true, tab: 'me', actions: '' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let d;
  try {
    d = await api('/api/tree');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('树还没种下', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const c = d.counts || {};

  el.innerHTML = `<div class="p-page">
    <div class="p-tree">
      ${wxTreeSVG(d.stage, d.pct)}
      <div class="p-tree__name">${esc(d.stageName)}</div>
      <div class="p-tree__desc">${esc(d.stageDesc)}</div>
    </div>

    <div class="p-tree__exp">
      <div class="p-tree__exp__top">
        <span>${d.next ? `离「${esc(d.next.name)}」还差 ${d.toNext}` : '已经长到最大了'}</span>
        <b>${d.exp}</b>
      </div>
      <div class="p-tree__bar"><i style="width:${(d.pct * 100).toFixed(1)}%"></i></div>
      <div class="p-tree__stages">
        ${(d.stages || [])
          .map(
            (s, i) => `<span class="p-tree__stage${i === d.stage ? ' on' : ''}${i < d.stage ? ' done' : ''}">${esc(s.name)}</span>`
          )
          .join('')}
      </div>
    </div>

    <div style="padding:4px 16px 8px">
      <button class="p-btn ${d.wateredToday ? 'p-btn--ghost' : 'p-btn--primary'} p-btn--block" type="button" data-water ${
        d.wateredToday ? 'disabled' : ''
      }>${d.wateredToday ? '今天浇过了，明天再来' : '浇一次水 +3'}</button>
    </div>

    <div class="p-sec" style="margin-top:16px">
      <h2 class="p-sec__t">这棵树是怎么长大的</h2>
      <div class="p-list">
        ${wxTreeRow('在一起的天数', '每天 1 点', d.togetherDays ? `${d.togetherDays} 天` : '')}
        ${wxTreeRow('发的动态', '每条 2 点', c.posts ? `${c.posts} 条` : '')}
        ${wxTreeRow('照片', '每张 1 点', c.photos ? `${c.photos} 张` : '')}
        ${wxTreeRow('说过的每句话', '每条 1 点', c.messages ? `${c.messages} 条` : '')}
        ${wxTreeRow('一起做完的小事', '每件 6 点', c.itemsDone ? `${c.itemsDone} 件` : '')}
        ${wxTreeRow('都答完的默契题', '每题 4 点', c.quizBoth ? `${c.quizBoth} 题` : '')}
        ${wxTreeRow('心情打卡', '每次 2 点', c.moods ? `${c.moods} 次` : '')}
        ${wxTreeRow('今天的小事', '每件 7 点', c.challenges ? `${c.challenges} 件` : '')}
        ${wxTreeRow('一起记的账', '每笔 2 点', c.fundTx ? `${c.fundTx} 笔` : '')}
        ${wxTreeRow('一起听的歌', '每首 2 点', c.songs ? `${c.songs} 首` : '')}
        ${wxTreeRow('相册', '每本 8 点', c.albums ? `${c.albums} 本` : '')}
        ${wxTreeRow('日历上的安排', '每条 3 点', c.events ? `${c.events} 条` : '')}
        ${wxTreeRow('冷静后和好', '每次 12 点', c.resolved ? `${c.resolved} 次` : '')}
        ${wxTreeRow('浇水', '每天 3 点', d.waterDays ? `${d.waterDays} 天` : '')}
      </div>
    </div>

    ${
      (d.log || []).length
        ? `<div class="p-sec">
             <h2 class="p-sec__t">最近的记录</h2>
             <div class="p-list">${d.log
               .slice(0, 6)
               .map(
                 (l) => `<div class="p-cell p-cell--static">
                   <div class="p-cell__body"><div class="p-cell__t">${esc(nameOf(l.author))} 浇了水</div>
                   <div class="p-cell__d">${esc(l.date)}</div></div>
                   <span class="p-cell__v">+${l.exp}</span>
                 </div>`
               )
               .join('')}</div>
           </div>`
        : ''
    }

    <div class="p-sign">不用天天签到，你们做的事本身就会让它长大</div>
  </div>`;

  const w = el.querySelector('[data-water]');
  if (w && !d.wateredToday) {
    w.onclick = async () => {
      w.disabled = true;
      try {
        await api('/api/tree/water', { method: 'POST' });
        toast('浇好了');
        App.go('tree', { replace: true });
      } catch (e) {
        w.disabled = false;
        toast((e && e.message) || '没浇上', 'error');
      }
    };
  }
};

function wxTreeRow(label, unit, val) {
  return `<div class="p-cell p-cell--static">
    <div class="p-cell__body"><div class="p-cell__t">${esc(label)}</div></div>
    <span class="p-cell__v">${esc(val || unit)}</span>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   F10 · 抽签
   ═══════════════════════════════════════════════════════════════ */

const DRAW_MODE_CN = { spin: '转盘', coin: '硬币', lot: '抽签' };

Views.draw = async function (el) {
  if (App.setChrome) App.setChrome({ title: '交给运气', sub: '', back: true, tab: 'discover', actions: '' });
  wxClearTimers();

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let data;
  try {
    data = await api('/api/draws');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const pools = data.pools || [];
  const hist = data.items || [];

  let poolName = pools[0] ? pools[0].name : '自定义';
  let pool = pools[0] ? pools[0].items.slice() : [];
  let mode = 'spin';
  let spinning = false;
  let rot = 0;

  el.innerHTML = `<div class="p-page">
    <div class="p-chips p-chips--pool" data-pools>
      ${pools
        .map(
          (p, i) =>
            `<button class="p-chip${i === 0 ? ' on' : ''}" type="button" data-pool="${esc(p.name)}">${esc(p.name)}</button>`
        )
        .join('')}
      <button class="p-chip" type="button" data-pool="__custom">自定义</button>
    </div>

    <div class="p-draw">
      <div class="p-draw__stage" data-stage>
        <div class="p-draw__ptr"></div>
        <div class="p-draw__wheel" data-wheel></div>
      </div>
      <div class="p-draw__result" data-result hidden>
        <div class="p-draw__result__k">就它了</div>
        <div class="p-draw__result__t" data-result-t></div>
      </div>
    </div>

    <div class="p-draw__legend" data-legend></div>

    <div style="padding:8px 16px 4px">
      <button class="p-btn p-btn--primary p-btn--block" type="button" data-spin>转一下</button>
    </div>

    <div class="p-sec" style="margin-top:16px">
      <h2 class="p-sec__t">怎么抽</h2>
      <div class="p-chips">
        ${['spin', 'coin', 'lot']
          .map(
            (m) => `<button class="p-chip${m === 'spin' ? ' on' : ''}" type="button" data-mode="${m}">${DRAW_MODE_CN[m]}</button>`
          )
          .join('')}
      </div>
    </div>

    ${
      hist.length
        ? `<div class="p-sec">
             <h2 class="p-sec__t">抽过的</h2>
             <div class="p-list">${hist
               .slice(0, 10)
               .map(
                 (h) => `<div class="p-cell p-cell--static">
                   <div class="p-cell__ico ico-3">${WX_ICO.dice}</div>
                   <div class="p-cell__body">
                     <div class="p-cell__t">${esc(h.result)}</div>
                     <div class="p-cell__d">${esc(h.poolName || '自定义')} · ${esc(
                   nameOf(h.drawnBy)
                 )} 抽的</div>
                   </div>
                   <span class="p-cell__v">${esc(humanTime(h.createdAt))}</span>
                 </div>`
               )
               .join('')}</div>
           </div>`
        : ''
    }
    <div class="p-sign">让运气来决定，谁都不用争</div>
  </div>`;

  const wheel = el.querySelector('[data-wheel]');
  const stage = el.querySelector('[data-stage]');
  const legend = el.querySelector('[data-legend]');
  const resultBox = el.querySelector('[data-result]');
  const resultT = el.querySelector('[data-result-t]');

  function paintWheel() {
    const n = Math.max(1, pool.length);
    const seg = 360 / n;
    if (mode === 'spin' && n > 1) {
      const stops = pool
        .map((_, i) => {
          const col = i % 2 ? 'var(--fill)' : 'var(--primary-soft)';
          return `${col} ${(i * seg).toFixed(2)}deg ${((i + 1) * seg).toFixed(2)}deg`;
        })
        .join(', ');
      stage.className = 'p-draw__stage';
      wheel.className = 'p-draw__wheel';
      wheel.style.background = `conic-gradient(${stops})`;
      wheel.style.transform = `rotate(${rot}deg)`;
      wheel.innerHTML = pool
        .map((_, i) => {
          const a = i * seg + seg / 2;
          return `<span class="p-draw__label" style="transform:rotate(${a}deg) translateY(-92px) rotate(${-a}deg)">${
            n <= 12 ? esc(String(i + 1)) : ''
          }</span>`;
        })
        .join('');
      legend.innerHTML = pool
        .map((p, i) => `<span class="p-draw__leg"><b>${i + 1}</b>${esc(p)}</span>`)
        .join('');
    } else {
      /* 硬币 / 抽签：一块大牌子 */
      stage.className = 'p-draw__stage p-draw__stage--flat';
      wheel.className = 'p-draw__slab';
      wheel.style.background = '';
      wheel.style.transform = '';
      wheel.innerHTML = mode === 'coin' ? '<span class="p-draw__coinface">?</span>' : '<span class="p-draw__stick"></span>';
      legend.innerHTML = `<span class="p-draw__leg p-draw__leg--wide">${esc(
        mode === 'coin' ? '两枚硬币，正面朝上算一个' : '从签筒里抽一支'
      )}</span>`;
    }
  }

  paintWheel();

  el.querySelectorAll('[data-pool]').forEach((b) => {
    b.onclick = () => {
      el.querySelectorAll('[data-pool]').forEach((x) => x.classList.toggle('on', x === b));
      if (b.dataset.pool === '__custom') {
        openModal({
          title: '自定义选项',
          body: `<div class="p-field" style="padding:0">
            <div class="p-field__label">一行一个</div>
            <textarea class="p-textarea" data-t maxlength="600" style="min-height:120px" placeholder="火锅&#10;烤肉&#10;日料"></textarea>
          </div>`,
          footer: `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-ok>用这些</button>`,
          onMount: (modal, close) => {
            modal.querySelector('[data-x]').onclick = () => close();
            modal.querySelector('[data-ok]').onclick = () => {
              const list = modal
                .querySelector('[data-t]')
                .value.split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 20);
              if (list.length < 2) return toast('至少写两个');
              pool = list;
              poolName = '自定义';
              rot = 0;
              paintWheel();
              close();
            };
          },
        });
        return;
      }
      const p = pools.find((x) => x.name === b.dataset.pool);
      if (p) {
        pool = p.items.slice();
        poolName = p.name;
        rot = 0;
        paintWheel();
      }
    };
  });

  el.querySelectorAll('[data-mode]').forEach((b) => {
    b.onclick = () => {
      if (spinning) return;
      mode = b.dataset.mode;
      if (mode === 'coin' && pool.length !== 2) return toast('硬币要正好两个选项');
      el.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
      paintWheel();
    };
  });

  const spin = el.querySelector('[data-spin]');
  spin.onclick = async () => {
    if (spinning) return;
    if (pool.length < 2) return toast('至少两个选项');

    spinning = true;
    spin.disabled = true;
    resultBox.hidden = true;
    wheel.classList.remove('is-win');

    let r;
    try {
      r = await api('/api/draws', { method: 'POST', body: { pool, poolName, mode } });
    } catch (e) {
      spinning = false;
      spin.disabled = false;
      return toast((e && e.message) || '没抽成', 'error');
    }

    const idx = Math.max(0, pool.indexOf(r.result));

    if (mode === 'spin') {
      const seg = 360 / pool.length;
      const want = (360 - (idx * seg + seg / 2)) % 360;
      const cur = ((rot % 360) + 360) % 360;
      rot += 360 * 5 + ((want - cur + 360) % 360);
      wheel.style.transition = 'transform 2.6s cubic-bezier(0.16, 1, 0.3, 1)';
      wheel.style.transform = `rotate(${rot}deg)`;
    } else {
      stage.classList.add(mode === 'coin' ? 'is-flip' : 'is-draw');
      wheel.innerHTML =
        mode === 'coin'
          ? `<span class="p-draw__coinface">${esc(r.result)}</span>`
          : `<span class="p-draw__sticktext">${esc(r.result)}</span>`;
    }

    setTimeout(() => {
      spinning = false;
      spin.disabled = false;
      resultT.textContent = r.result;
      resultBox.hidden = false;
      wheel.classList.add('is-win');
      spin.textContent = '再抽一次';
      /* 结果出来后再刷新历史，不打断动画 */
      api('/api/draws')
        .then(() => {})
        .catch(() => {});
    }, mode === 'spin' ? 2700 : 1100);
  };
};

/* ═══════════════════════════════════════════════════════════════
   F11 · 共享日历
   ═══════════════════════════════════════════════════════════════ */

const EVENT_KIND_CN = { date: '约会', trip: '出行', work: '各自的事', other: '其他' };
const EVENT_KIND_ICO = { date: 'heart', trip: 'trip', work: 'list', other: 'pin' };

Views.events = async function (el) {
  if (App.setChrome) App.setChrome({ title: '一起的日子', sub: '', back: true, tab: 'discover', actions: 'event' });

  const month = App._evMonth || isoOf(new Date()).slice(0, 7);
  App._evMonth = month;

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let d;
  try {
    d = await api(`/api/events?month=${month}`);
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const [y, m] = month.split('-').map(Number);
  const cells = wxMonthGrid(y, m);
  const todayStr = d.today || isoOf(new Date());
  const byDate = new Map();
  for (const it of d.items || []) {
    if (!byDate.has(it.date)) byDate.set(it.date, []);
    byDate.get(it.date).push(it);
  }

  const week = ['一', '二', '三', '四', '五', '六', '日'];
  const upcoming = d.upcoming || [];

  el.innerHTML = `<div class="p-page">
    <div class="p-calhead">
      <button class="p-calhead__nav" type="button" data-mv="-1" aria-label="上个月">‹</button>
      <div class="p-calhead__t">${esc(wxMonthName(month))}</div>
      <button class="p-calhead__nav" type="button" data-mv="1" aria-label="下个月">›</button>
    </div>

    <div class="p-cal">
      <div class="p-cal__week">${week.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="p-cal__grid">
        ${cells
          .map((iso) => {
            if (!iso) return `<span class="p-cal__cell is-out"></span>`;
            const list = byDate.get(iso) || [];
            const whos = [];
            for (const it of list) if (!whos.includes(it.who)) whos.push(it.who);
            const isToday = iso === todayStr;
            const day = Number(iso.slice(8));
            return `<button class="p-cal__cell${isToday ? ' is-today' : ''}${list.length ? ' has' : ''}" type="button" data-day="${iso}">
              <span class="p-cal__n">${day}</span>
              <span class="p-cal__dots">${whos
                .slice(0, 3)
                .map((w) => `<i class="p-cal__dot p-cal__dot--${w}"></i>`)
                .join('')}</span>
            </button>`;
          })
          .join('')}
      </div>
    </div>

    ${
      upcoming.length
        ? `<div class="p-sec">
             <h2 class="p-sec__t">接下来 7 天</h2>
             <div class="p-list">${upcoming
               .map(
                 (u) => `<button class="p-cell" type="button" data-open="${u.date}">
                   <div class="p-cell__ico ico-1">${WX_ICO[EVENT_KIND_ICO[u.kind] || 'pin']}</div>
                   <div class="p-cell__body">
                     <div class="p-cell__t">${esc(u.title)}</div>
                     <div class="p-cell__d">${esc(u.date)}${u.time ? ` · ${esc(u.time)}` : ' · 全天'}</div>
                   </div>
                   <span class="p-cell__v">${esc(
                     u.who === 'both' ? '一起' : nameOf(u.who)
                   )}</span>
                 </button>`
               )
               .join('')}</div>
           </div>`
        : ''
    }

    <div class="p-sec">
      <h2 class="p-sec__t">这个月</h2>
      ${
        (d.items || []).length
          ? `<div class="p-list">${(d.items || [])
              .map(
                (it) => `<button class="p-cell" type="button" data-open="${it.date}">
                  <div class="p-cell__ico ico-${it.kind === 'trip' ? 6 : it.kind === 'work' ? 8 : 1}">${
                  WX_ICO[EVENT_KIND_ICO[it.kind] || 'pin']
                }</div>
                  <div class="p-cell__body">
                    <div class="p-cell__t">${esc(it.title)}${it.surprise ? ' · 惊喜' : ''}</div>
                    <div class="p-cell__d">${esc(it.date)}${it.time ? ` · ${esc(it.time)}` : ''}${
                  it.place ? ` · ${esc(it.place)}` : ''
                }</div>
                  </div>
                  <span class="p-cell__v">${esc(EVENT_KIND_CN[it.kind] || '')}</span>
                </button>`
              )
              .join('')}</div>`
          : wxEmpty('这个月还空着', '点某一天就能加安排')
      }
    </div>

    <div class="p-sign">点某一天可以看当天的事</div>
  </div>`;

  el.querySelectorAll('[data-mv]').forEach((b) => {
    b.onclick = () => {
      const dt = new Date(y, m - 1 + Number(b.dataset.mv), 1);
      App._evMonth = `${dt.getFullYear()}-${wxPad2(dt.getMonth() + 1)}`;
      App.go('events', { replace: true });
    };
  });

  el.querySelectorAll('[data-day]').forEach((b) => {
    b.onclick = () => wxDaySheet(b.dataset.day);
  });
  el.querySelectorAll('[data-open]').forEach((b) => {
    b.onclick = () => wxDaySheet(b.dataset.open);
  });
};

/* 某一天的抽屉：列当天的事 + 新建 */
async function wxDaySheet(date) {
  let d;
  try {
    d = await api(`/api/events?month=${date.slice(0, 7)}`);
  } catch (e) {
    return toast((e && e.message) || '没连上', 'error');
  }
  const list = (d.items || []).filter((x) => x.date === date || (x.endDate && x.date <= date && x.endDate >= date));

  const mask = document.createElement('div');
  mask.className = 'wx-sheet-mask';
  mask.innerHTML = `<div class="wx-sheet">
    <div class="wx-sheet__t">${esc(date)}</div>
    ${
      list.length
        ? list
            .map(
              (it) => `<div class="p-daysheet__row">
                <div class="p-daysheet__main">
                  <div class="p-daysheet__t">${esc(it.title)}${it.surprise ? ' · 惊喜' : ''}</div>
                  <div class="p-daysheet__d">${esc(EVENT_KIND_CN[it.kind] || '')}${
                it.time ? ` · ${esc(it.time)}` : ' · 全天'
              }${it.place ? ` · ${esc(it.place)}` : ''} · ${esc(it.who === 'both' ? '一起' : nameOf(it.who))}</div>
                  ${it.note ? `<div class="p-daysheet__n">${esc(it.note)}</div>` : ''}
                </div>
                <button class="p-daysheet__x" type="button" data-del="${it.id}" aria-label="删掉">${WX_ICO.trash}</button>
              </div>`
            )
            .join('')
        : `<div class="p-daysheet__empty">这天还没有安排</div>`
    }
    <button class="wx-sheet__b" type="button" data-new>加一条</button>
    <button class="wx-sheet__cancel" type="button" data-cancel>关闭</button>
  </div>`;

  const close = () => mask.remove();
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });
  mask.querySelector('[data-cancel]').onclick = close;
  mask.querySelector('[data-new]').onclick = () => {
    close();
    wxEventNew(date);
  };
  mask.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      confirmDialog('删掉这条安排？', async () => {
        try {
          await api(`/api/events/${b.dataset.del}`, { method: 'DELETE' });
          close();
          App.go('events', { replace: true });
        } catch (e) {
          toast((e && e.message) || '没删掉', 'error');
        }
      }, '删掉');
    };
  });
  document.body.appendChild(mask);
}

/* 新建安排：顶栏按钮和抽屉都用它 */
function wxEventNew(date) {
  const def = date || isoOf(new Date());
  let who = 'both';
  let kind = 'date';

  openModal({
    title: '加一条安排',
    body: `<div class="p-field" style="padding:0">
      <div class="p-field__label">做什么</div>
      <input class="p-input" data-t maxlength="40" placeholder="比如：去看电影">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">哪天</div>
      <input class="p-input" data-d type="date" value="${def}">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">几点（不填就是全天）</div>
      <input class="p-input" data-tm type="time">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">在哪</div>
      <input class="p-input" data-p maxlength="40" placeholder="可不填">
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">谁的事</div>
      <div class="p-chips" data-who>
        <button class="p-chip" type="button" data-w="both">一起</button>
        <button class="p-chip" type="button" data-w="${App.me}">我的</button>
        <button class="p-chip" type="button" data-w="${otherOf(App.me)}">对方的</button>
      </div>
    </div>
    <div class="p-field" style="padding:14px 0 0">
      <div class="p-field__label">类型</div>
      <div class="p-chips" data-kind>
        ${Object.keys(EVENT_KIND_CN)
          .map((k, i) => `<button class="p-chip${i === 0 ? ' on' : ''}" type="button" data-k="${k}">${EVENT_KIND_CN[k]}</button>`)
          .join('')}
      </div>
    </div>
    <label class="p-cool__priv" style="padding-top:16px">
      <input type="checkbox" data-sur>
      <span>这是惊喜，对方只看到「这天有事」</span>
    </label>`,
    footer: `<button class="p-btn p-btn--ghost" data-x>算了</button><button class="p-btn p-btn--primary" data-ok>加上</button>`,
    onMount: (modal, close) => {
      const q = (s) => modal.querySelector(s);
      q('[data-who]').querySelectorAll('[data-w]').forEach((b) => {
        if (b.dataset.w === 'both') b.classList.add('on');
        b.onclick = () => {
          who = b.dataset.w;
          q('[data-who]').querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', x === b));
        };
      });
      q('[data-kind]').querySelectorAll('[data-k]').forEach((b) => {
        b.onclick = () => {
          kind = b.dataset.k;
          q('[data-kind]').querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b));
        };
      });
      q('[data-x]').onclick = () => close();
      q('[data-ok]').onclick = async () => {
        const title = q('[data-t]').value.trim();
        if (!title) return toast('写点什么');
        const date2 = q('[data-d]').value;
        if (!date2) return toast('选一天');
        try {
          await api('/api/events', {
            method: 'POST',
            body: {
              title,
              date: date2,
              time: q('[data-tm]').value || undefined,
              place: q('[data-p]').value.trim() || undefined,
              who,
              kind,
              surprise: q('[data-sur]').checked,
            },
          });
          App._evMonth = date2.slice(0, 7);
          close();
          App.go('events', { replace: true });
        } catch (e) {
          toast((e && e.message) || '没加上', 'error');
        }
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════════════
   F12 · 成就徽章
   ═══════════════════════════════════════════════════════════════ */

Views.badges = async function (el) {
  if (App.setChrome) App.setChrome({ title: '徽章墙', sub: '', back: true, tab: 'me', actions: '' });

  el.innerHTML = `<div class="p-page">${wxLoading()}</div>`;

  let d;
  try {
    d = await api('/api/badges');
  } catch (e) {
    el.innerHTML = `<div class="p-page">${wxEmpty('没连上', (e && e.message) || '待会再试')}</div>`;
    return;
  }

  const items = d.items || [];
  const got = d.unlocked || 0;
  const total = d.total || items.length;
  const pct = total ? got / total : 0;
  const fresh = d.fresh || [];

  el.innerHTML = `<div class="p-page">
    <div class="p-badges__head">
      <div class="p-badges__ring">
        ${wxRing(pct)}
        <div class="p-badges__ring__n"><b>${got}</b><span>/${total}</span></div>
      </div>
      <div class="p-badges__meta">
        <div class="p-badges__t">已经解锁 ${got} 枚</div>
        <div class="p-badges__d">${got >= total ? '全收齐了' : `还有 ${total - got} 枚在路上`}</div>
      </div>
    </div>

    <div class="p-badges">
      ${items
        .map(
          (b) => `<div class="p-badge${b.unlocked ? ' is-on' : ''}${b.unlocked && !b.seen ? ' is-new' : ''}">
            <div class="p-badge__i">${esc(b.icon || '🏅')}</div>
            <div class="p-badge__t">${esc(b.title)}</div>
            <div class="p-badge__d">${esc(b.detail || '')}</div>
          </div>`
        )
        .join('')}
    </div>
    <div class="p-sign">解锁的徽章会一直留在这里</div>
  </div>`;

  if (fresh.length) {
    toast(`🎉 解锁「${(items.find((x) => x.key === fresh[0]) || {}).title || '新徽章'}」`);
    api('/api/badges/seen', { method: 'POST', body: { keys: fresh } }).catch(() => {});
  } else {
    api('/api/badges/seen', { method: 'POST', body: {} }).catch(() => {});
  }
};

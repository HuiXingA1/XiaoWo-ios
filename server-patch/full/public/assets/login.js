'use strict';

(function () {
  const gate = document.getElementById('gate');
  const form = document.getElementById('gateForm');
  const input = document.getElementById('gatePass');
  const btn = document.getElementById('gateBtn');
  const err = document.getElementById('gateErr');
  const eye = document.getElementById('gateEye');
  const titleEl = document.getElementById('gateTitle');
  const subEl = document.getElementById('gateSub');
  const whoBox = document.getElementById('gateWho');
  const nameAEl = document.getElementById('whoNameA');
  const nameBEl = document.getElementById('whoNameB');
  const avaAEl = document.getElementById('whoAvaA');
  const avaBEl = document.getElementById('whoAvaB');

  /* ── 花瓣飘落 ── */
  function petals() {
    const count = window.innerWidth < 640 ? 14 : 26;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'gate__petal';
      const size = 6 + Math.random() * 11;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.animationDuration = 9 + Math.random() * 12 + 's';
      p.style.animationDelay = -Math.random() * 18 + 's';
      p.style.setProperty('--drift', (Math.random() * 200 - 100) + 'px');
      p.style.opacity = 0.3 + Math.random() * 0.5;
      p.style.filter = `blur(${Math.random() < 0.4 ? 0.6 : 0}px)`;
      gate.appendChild(p);
    }
  }
  petals();

  /* ── 眼睛切换 ── */
  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.textContent = show ? '🙈' : '👁';
    input.focus();
  });

  /* ── 提示 ── */
  let errTimer = null;
  function showError(msg) {
    err.textContent = msg;
    err.classList.add('show');
    const card = gate.querySelector('.gate__card');
    card.classList.add('gate__shake');
    setTimeout(() => card.classList.remove('gate__shake'), 460);
    clearTimeout(errTimer);
    errTimer = setTimeout(() => err.classList.remove('show'), 4200);
  }

  function clearError() {
    err.classList.remove('show');
  }

  /* ── 选人 ──
     两个人共用同一把暗号，但进门时各选各的名字。
     选中的身份会写进会话，之后每一条记录都知道是谁写的。 */
  let who = '';
  function pickWho(next) {
    who = next === 'b' ? 'b' : 'a';
    whoBox.querySelectorAll('[data-who]').forEach((b) => {
      b.classList.toggle('active', b.dataset.who === who);
    });
    const label = who === 'b' ? nameBEl.textContent : nameAEl.textContent;
    subEl.textContent = `${label}，输入我们的暗号`;
    clearError();
    input.focus();
  }

  whoBox.querySelectorAll('[data-who]').forEach((b) => {
    b.addEventListener('click', () => pickWho(b.dataset.who));
  });

  /* ── 提交 ── */
  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;

    if (!who) {
      showError('先点一下你是谁');
      whoBox.classList.add('gate__shake');
      setTimeout(() => whoBox.classList.remove('gate__shake'), 460);
      return;
    }

    const password = input.value.trim();
    if (!password) { showError('暗号还没写呢'); return; }

    busy = true;
    btn.disabled = true;
    btn.textContent = '正 在 推 门 …';
    clearError();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, who }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        btn.textContent = '欢 迎 回 家 🌷';
        gate.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
        gate.style.opacity = '0';
        gate.style.transform = 'scale(1.03)';
        setTimeout(() => { window.location.href = '/'; }, 420);
        return;
      }

      showError(data.error || '密码不对哦，再想想');
      input.value = '';
      input.focus();
    } catch {
      showError('连不上小窝，检查一下服务有没有开着');
    } finally {
      if (gate.style.opacity !== '0') {
        busy = false;
        btn.disabled = false;
        btn.textContent = '推 门 进 去';
      }
    }
  });

  /* ── 已登录直接放行 ── */
  fetch('/api/auth/state', { headers: { Accept: 'application/json' } })
    .then((r) => r.json())
    .then((d) => {
      if (!d) return;
      /* 名字按设置里改过的显示，门禁页就知道该写谁 */
      if (d.names) {
        nameAEl.textContent = d.names.a;
        nameBEl.textContent = d.names.b;
        avaAEl.textContent = (d.names.a || '妍').slice(0, 1);
        avaBEl.textContent = (d.names.b || '博').slice(0, 1);
      }
      if (d.title) titleEl.textContent = d.title;

      if (d.authed) {
        btn.textContent = '欢 迎 回 家 🌷';
        setTimeout(() => { window.location.href = '/'; }, 260);
        return;
      }

      /* 记住上次是谁进的门，下次默认选中 */
      let last = '';
      try { last = localStorage.getItem('nest.me') || ''; } catch { /* 隐私模式 */ }
      if (last === 'a' || last === 'b') pickWho(last);
    })
    .catch(() => { /* 离线就停在登录页 */ });

  input.focus();

  /* 记住暗号的小彩蛋：连续错三次后提示 */
  let wrongCount = 0;
  form.addEventListener('submit', () => {
    wrongCount++;
    if (wrongCount === 3) titleEl.textContent = '再想想…我们第一次见面那天？';
  }, true);
})();

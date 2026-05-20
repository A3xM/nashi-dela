/* ── State ── */
const S = {
  user: null,
  tab: 'home',
  selectedMember: null,
  pinInput: '',
  session: null,
  tasks: [],
  users: [],
  assignments: [],
  stats: [],
  approvals: { postpones: [], spend_requests: [] },
  points: null,
  prefs: [],
  selectedTaskIds: new Set(),
  view: 'login',     // login | child | mom
  subview: 'home',   // home | session | approvals | settings | prefs
};

const app = document.getElementById('app');

/* ── API ── */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Ошибка сети');
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

/* ── Toast ── */
function toast(msg, duration = 2200) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

/* ── Avatar helpers ── */
function initials(name) { return name ? name[0] : '?'; }
function avatar(user, size = 'normal') {
  const cls = size === 'sm' ? 'avatar-sm' : 'avatar';
  return `<div class="${cls}" style="background:${user.avatar_color}">${initials(user.name)}</div>`;
}

/* ── Render dispatcher ── */
function render() {
  if (S.view === 'login') { renderLogin(); return; }
  if (S.user?.role === 'admin') { renderMom(); return; }
  renderChild();
}

/* ══════════════════════════════════════
   LOGIN
══════════════════════════════════════ */
function renderLogin() {
  app.innerHTML = `
    <div class="login-screen">
      <div>
        <h1>🏠 Наш дом</h1>
        <p style="margin-top:8px;color:var(--text-secondary)">Кто ты?</p>
      </div>
      <div class="member-grid" id="memberGrid"></div>
      <div class="pin-section" id="pinSection" style="display:none">
        <h3>Введи PIN</h3>
        <div class="pin-dots" id="pinDots">
          ${[0,1,2,3].map(() => '<div class="pin-dot"></div>').join('')}
        </div>
        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k =>
            k === '' ? '<div></div>' :
            `<button class="pin-btn${k==='⌫'?' del':''}" data-key="${k}">${k}</button>`
          ).join('')}
        </div>
        <div id="loginError" class="login-error" style="margin-top:10px"></div>
      </div>
    </div>`;

  const grid = document.getElementById('memberGrid');
  S.users.forEach(u => {
    const card = document.createElement('div');
    card.className = 'member-card';
    card.innerHTML = `
      ${avatar(u)}
      <div class="name">${u.name}</div>
      <div class="age">${u.age} лет</div>`;
    card.onclick = () => selectMember(u);
    grid.appendChild(card);
  });
}

function selectMember(u) {
  S.selectedMember = u;
  S.pinInput = '';
  document.querySelectorAll('.member-card').forEach((c, i) => {
    c.classList.toggle('selected', S.users[i]?.id === u.id);
  });
  document.getElementById('pinSection').style.display = 'block';
  updatePinDots();

  document.querySelectorAll('.pin-btn').forEach(btn => {
    btn.onclick = () => handlePin(btn.dataset.key);
  });
}

function handlePin(key) {
  if (key === '⌫') {
    S.pinInput = S.pinInput.slice(0, -1);
  } else if (S.pinInput.length < 4) {
    S.pinInput += key;
  }
  updatePinDots();
  if (S.pinInput.length === 4) attemptLogin();
}

function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach((d, i) => {
    d.classList.toggle('filled', i < S.pinInput.length);
  });
}

async function attemptLogin() {
  try {
    const user = await api('POST', '/login', { name: S.selectedMember.name, pin: S.pinInput });
    S.user = user;
    S.view = user.role === 'admin' ? 'mom' : 'child';
    S.subview = 'home';
    await loadData();
    render();
  } catch (e) {
    document.getElementById('loginError').textContent = '❌ Неверный PIN, попробуй ещё раз';
    S.pinInput = '';
    updatePinDots();
    setTimeout(() => {
      const el = document.getElementById('loginError');
      if (el) el.textContent = '';
    }, 2000);
  }
}

/* ══════════════════════════════════════
   DATA LOADING
══════════════════════════════════════ */
async function loadData() {
  if (S.user?.role === 'admin') {
    const [session, stats, approvals] = await Promise.all([
      api('GET', '/session/current'),
      api('GET', '/stats'),
      api('GET', '/approvals'),
    ]);
    S.session   = session;
    S.stats     = stats;
    S.approvals = approvals;
  } else {
    const [assigns, pts] = await Promise.all([
      api('GET', `/assignments/my/${S.user.id}`),
      api('GET', `/points/${S.user.id}`),
    ]);
    S.assignments = assigns;
    S.points      = pts;
  }
}

async function loadTasks() {
  S.tasks = await api('GET', '/tasks');
}

/* ══════════════════════════════════════
   CHILD VIEW
══════════════════════════════════════ */
function renderChild() {
  const tabs = ['home', 'points'];
  const tabLabels = [
    { id: 'home',   icon: '✅', label: 'Мои дела' },
    { id: 'points', icon: '⭐', label: 'Баллы' },
  ];

  const pendingCount = S.assignments.filter(a => a.status === 'pending').length;
  const doneCount    = S.assignments.filter(a => a.status === 'done').length;
  const total        = S.assignments.length;

  app.innerHTML = `
    <div class="header">
      ${avatar(S.user)}
      <h1>${S.user.name}</h1>
      ${S.user.adhd ? `<div style="background:#FF8C69;color:white;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:700">СДВГ-режим</div>` : ''}
      <button class="back-btn" id="logoutBtn" title="Выйти">👤</button>
    </div>
    <div class="tabs">
      ${tabLabels.map(t => `<button class="tab${S.subview===t.id?' active':''}" data-tab="${t.id}">${t.icon} ${t.label}</button>`).join('')}
    </div>
    <div class="content" id="childContent"></div>
    <div class="bottom-nav" style="display:none"></div>`;

  document.getElementById('logoutBtn').onclick = logout;
  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = async () => {
      S.subview = t.dataset.tab;
      render();
    };
  });

  const content = document.getElementById('childContent');

  if (S.subview === 'home') {
    if (!S.session) {
      content.innerHTML = `<div class="empty"><div class="icon">😴</div><p>Задач пока нет.<br>Мама ещё не выбрала дела на эту неделю.</p></div>`;
      return;
    }
    // Progress
    content.innerHTML = `
      <div class="stats-row">
        <div class="stat-card"><div class="stat-num" style="color:var(--green)">${doneCount}</div><div class="stat-label">Сделано</div></div>
        <div class="stat-card"><div class="stat-num" style="color:var(--yellow)">${pendingCount}</div><div class="stat-label">Осталось</div></div>
        <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Всего</div></div>
      </div>
      <div class="progress-bar-wrap mt8"><div class="progress-bar" style="width:${total?Math.round(doneCount/total*100):0}%"></div></div>`;

    // Group by category
    const cats = {};
    S.assignments.forEach(a => {
      const cat = a.category || 'Разное';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(a);
    });

    Object.entries(cats).forEach(([cat, items]) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="card-title">${cat}</div>`;
      items.forEach(a => {
        card.appendChild(taskItem(a));
      });
      content.appendChild(card);
    });

    // Add adhoc button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary';
    addBtn.textContent = '+ Предложить дело маме';
    addBtn.onclick = () => { /* future feature */ toast('Скоро!'); };
    content.appendChild(addBtn);

  } else if (S.subview === 'points') {
    renderPointsView(content);
  }
}

function taskItem(a) {
  const isDone       = a.status === 'done';
  const isPostponed  = a.status === 'postpone_requested' || a.status === 'postponed';
  const taskName     = a.adhoc_name || a.task_name || '—';
  const mins         = a.estimated_minutes ? `${a.estimated_minutes} мин` : '';
  const pts          = a.points_awarded ? `+${a.points_awarded} ⭐` : '';

  const div = document.createElement('div');
  div.className = 'task-item';
  div.innerHTML = `
    <button class="task-check${isDone?' done':''}" data-id="${a.id}" ${isDone||isPostponed?'disabled':''}>
      ${isDone ? '✓' : ''}
    </button>
    <div class="task-info">
      <div class="task-name${isDone?' done-text':''}">${taskName}</div>
      <div class="task-meta">
        ${mins ? `<span>${mins}</span>` : ''}
        ${pts && !isDone ? `<span style="color:var(--yellow)">${pts}</span>` : ''}
        ${isPostponed ? `<span style="color:var(--yellow)">⏳ Перенос</span>` : ''}
        ${isDone ? `<span style="color:var(--green)">✓ Готово</span>` : ''}
      </div>
    </div>
    ${!isDone && !isPostponed ? `
    <div class="task-actions">
      <button class="action-btn btn-done" data-done="${a.id}">Готово</button>
      <button class="action-btn btn-postpone" data-post="${a.id}">Перенос</button>
    </div>` : ''}`;

  div.querySelector('[data-done]')?.addEventListener('click', () => markDone(a.id));
  div.querySelector('[data-post]')?.addEventListener('click', () => openPostponeModal(a));
  return div;
}

async function markDone(id) {
  try {
    const res = await api('POST', `/assignments/${id}/done`);
    if (res.points_awarded > 0) toast(`✅ Готово! +${res.points_awarded} ⭐`);
    else toast('✅ Готово!');
    await loadData();
    render();
  } catch (e) { toast('Ошибка: ' + e.message); }
}

function openPostponeModal(a) {
  const today = new Date();
  const max   = new Date(today); max.setDate(today.getDate() + 6);
  const fmt   = d => d.toISOString().split('T')[0];

  showModal(`
    <h2>Перенести задачу</h2>
    <p style="color:var(--text-secondary);margin-bottom:14px">${a.adhoc_name || a.task_name}</p>
    <input type="text" id="postReason" placeholder="Причина переноса" maxlength="80"/>
    <input type="date" id="postDate" value="${fmt(new Date(today.getTime()+86400000))}"
      min="${fmt(today)}" max="${fmt(max)}"/>
    <div class="modal-btns">
      <button class="btn-secondary" id="cancelPost" style="flex:1">Отмена</button>
      <button class="btn-primary" id="confirmPost" style="flex:1">Отправить</button>
    </div>`,
    async () => {
      const reason = document.getElementById('postReason').value.trim();
      const date   = document.getElementById('postDate').value;
      if (!date) { toast('Выбери дату'); return; }
      try {
        await api('POST', `/assignments/${a.id}/postpone`, { reason, postpone_to: date });
        toast('⏳ Запрос отправлен маме');
        closeModal();
        await loadData();
        render();
      } catch (e) { toast('Ошибка: ' + e.message); }
    }
  );
  document.getElementById('cancelPost').onclick = closeModal;
}

function renderPointsView(content) {
  const bal = S.points?.balance ?? S.user.points ?? 0;
  const history = S.points?.history ?? [];
  const can30  = bal >= 10;
  const can60  = bal >= 20;
  const can90  = bal >= 30;

  content.innerHTML = `
    <div class="points-hero">
      <div class="pts-num">${bal}</div>
      <div class="pts-label">⭐ баллов</div>
      <div class="exchange-row">
        <div class="exchange-btn ${can30?'':'disabled-btn'}" data-mins="30" style="${!can30?'opacity:.4':''}">
          30 мин<br><small>10 ⭐</small>
        </div>
        <div class="exchange-btn ${can60?'':'disabled-btn'}" data-mins="60" style="${!can60?'opacity:.4':''}">
          1 час<br><small>20 ⭐</small>
        </div>
        <div class="exchange-btn ${can90?'':'disabled-btn'}" data-mins="90" style="${!can90?'opacity:.4':''}">
          1.5 часа<br><small>30 ⭐</small>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Как зарабатывать</div>
      <div class="task-meta" style="padding:4px 0">🟢 Зелёное дело = <strong>12 ⭐</strong></div>
      <div class="task-meta" style="padding:4px 0">🟡 Жёлтое дело = <strong>8 ⭐</strong></div>
      <div class="task-meta" style="padding:4px 0">🎯 Все дела за неделю = <strong>+15 ⭐ бонус</strong></div>
    </div>
    <div class="card">
      <div class="card-title">История</div>
      ${history.length === 0 ? '<div class="empty" style="padding:20px"><p>Пока пусто</p></div>' :
        history.map(tx => `
          <div class="tx-item">
            <div>
              <div class="tx-desc">${tx.description}</div>
              ${tx.status === 'pending' ? '<div class="tx-pending">⏳ Ожидает одобрения мамы</div>' : ''}
            </div>
            <div class="tx-amount ${tx.amount > 0 ? 'pos' : 'neg'}">${tx.amount > 0 ? '+' : ''}${tx.amount} ⭐</div>
          </div>`).join('')}
    </div>`;

  content.querySelectorAll('.exchange-btn[data-mins]').forEach(btn => {
    const mins = parseInt(btn.dataset.mins);
    const cost = mins / 30 * 10;
    if (bal >= cost) {
      btn.onclick = () => confirmSpend(mins, cost);
    }
  });
}

async function confirmSpend(mins, cost) {
  showModal(`
    <h2>Обменять баллы</h2>
    <p style="color:var(--text-secondary);margin-bottom:16px">
      ${mins} мин экранного времени за <strong>${cost} ⭐</strong>.<br>
      Мама получит запрос и одобрит.
    </p>
    <div class="modal-btns">
      <button class="btn-secondary" id="cancelSpend" style="flex:1">Отмена</button>
      <button class="btn-primary" id="confirmSpendBtn" style="flex:1">Обменять</button>
    </div>`,
    async () => {
      try {
        await api('POST', `/points/spend?user_id=${S.user.id}`, { minutes: mins });
        toast('⭐ Запрос отправлен маме!');
        closeModal();
        const pts = await api('GET', `/points/${S.user.id}`);
        S.points = pts;
        render();
      } catch (e) { toast(e.message); }
    }
  );
  document.getElementById('cancelSpend').onclick = closeModal;
}

/* ══════════════════════════════════════
   MOM VIEW
══════════════════════════════════════ */
function renderMom() {
  const approvalsCount =
    (S.approvals?.postpones?.length ?? 0) +
    (S.approvals?.spend_requests?.length ?? 0);

  const navItems = [
    { id: 'home',     icon: '🏠', label: 'Главная' },
    { id: 'session',  icon: '📋', label: 'Неделя' },
    { id: 'approvals',icon: '🔔', label: 'Запросы', badge: approvalsCount },
    { id: 'settings', icon: '⚙️', label: 'Семья' },
  ];

  app.innerHTML = `
    <div class="header">
      ${avatar(S.user)}
      <h1>Привет, ${S.user.name}!</h1>
      <button class="back-btn" id="logoutBtn">👤</button>
    </div>
    <div class="content" id="momContent" style="padding-bottom:80px"></div>
    <div class="bottom-nav">
      ${navItems.map(n => `
        <button class="nav-item${S.subview===n.id?' active':''}" data-nav="${n.id}">
          <span class="icon">${n.icon}</span>
          <span>${n.label}</span>
          ${n.badge ? `<span class="badge">${n.badge}</span>` : ''}
        </button>`).join('')}
    </div>`;

  document.getElementById('logoutBtn').onclick = logout;
  document.querySelectorAll('.nav-item').forEach(b => {
    b.onclick = async () => {
      S.subview = b.dataset.nav;
      if (S.subview === 'session' && S.tasks.length === 0) await loadTasks();
      render();
    };
  });

  const content = document.getElementById('momContent');
  if (S.subview === 'home')      renderMomHome(content);
  else if (S.subview === 'session')   renderMomSession(content);
  else if (S.subview === 'approvals') renderMomApprovals(content);
  else if (S.subview === 'settings')  renderMomSettings(content);
}

/* ── Mom: Home ── */
function renderMomHome(content) {
  const hasSession = !!S.session;

  let html = '';
  if (!hasSession) {
    html += `
      <div class="card" style="text-align:center;padding:32px 16px">
        <div style="font-size:48px;margin-bottom:12px">📋</div>
        <div style="font-weight:700;font-size:17px;margin-bottom:8px">Нет активных задач</div>
        <div style="color:var(--text-secondary);margin-bottom:20px">Создай план на эту неделю</div>
        <button class="btn-primary" id="goSession">Создать план</button>
      </div>`;
  } else {
    // Overview by person
    html += `<div class="card"><div class="card-title">Прогресс недели</div>`;
    const byUser = {};
    (S.session?.assignments || []).forEach(a => {
      if (!byUser[a.user_id]) byUser[a.user_id] = { name: a.user_name, color: a.avatar_color, total: 0, done: 0 };
      byUser[a.user_id].total++;
      if (a.status === 'done') byUser[a.user_id].done++;
    });
    Object.values(byUser).forEach(u => {
      const pct = u.total ? Math.round(u.done / u.total * 100) : 0;
      html += `
        <div class="person-row">
          <div class="avatar-sm" style="background:${u.color};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px">${u.name[0]}</div>
          <div class="person-info">
            <div class="person-name">${u.name}</div>
            <div class="progress-bar-wrap mt8" style="height:6px"><div class="progress-bar" style="width:${pct}%"></div></div>
          </div>
          <div style="font-size:13px;color:var(--text-secondary)">${u.done}/${u.total}</div>
        </div>`;
    });
    html += `</div>`;

    // Pending postpones alert
    const pCount = S.approvals?.postpones?.length ?? 0;
    const sCount = S.approvals?.spend_requests?.length ?? 0;
    if (pCount + sCount > 0) {
      html += `
        <div class="card" style="background:var(--yellow-light);border:1.5px solid var(--yellow)">
          <div style="font-weight:700;color:var(--yellow)">⏳ Требует внимания</div>
          ${pCount > 0 ? `<div style="margin-top:6px;font-size:14px">${pCount} запрос${pCount>1?'а':''} на перенос</div>` : ''}
          ${sCount > 0 ? `<div style="font-size:14px">${sCount} запрос${sCount>1?'а':''} на экранное время</div>` : ''}
          <button class="btn-primary" style="margin-top:12px" id="goApprovals">Посмотреть</button>
        </div>`;
    }
  }

  content.innerHTML = html;
  document.getElementById('goSession')?.addEventListener('click', async () => {
    S.subview = 'session';
    if (S.tasks.length === 0) await loadTasks();
    render();
  });
  document.getElementById('goApprovals')?.addEventListener('click', () => {
    S.subview = 'approvals';
    render();
  });
}

/* ── Mom: Session ── */
function renderMomSession(content) {
  if (S.session) {
    renderSessionOverview(content);
    return;
  }
  renderTaskSelector(content);
}

function renderTaskSelector(content) {
  const freqLabels = { weekly: 'Каждую неделю', biweekly: 'Раз в 2 недели', monthly: 'Раз в месяц' };
  const groups = {};
  S.tasks.forEach(t => {
    if (!groups[t.frequency]) groups[t.frequency] = [];
    groups[t.frequency].push(t);
  });

  let html = `
    <div style="padding:0 0 12px">
      <div style="font-weight:700;font-size:17px">Выбери задачи на неделю</div>
      <div style="color:var(--text-secondary);font-size:13px;margin-top:4px">Алгоритм распределит их по семье</div>
    </div>`;

  ['weekly','biweekly','monthly'].forEach(freq => {
    if (!groups[freq]) return;
    html += `<div class="freq-section">
      <div class="freq-label">${freqLabels[freq]}</div>`;
    groups[freq].forEach(t => {
      const checked = S.selectedTaskIds.has(t.id) ? 'checked' : '';
      html += `
        <label class="select-task">
          <input type="checkbox" data-tid="${t.id}" ${checked}/>
          <span class="task-label">${t.name}</span>
          <span class="task-mins">${t.estimated_minutes} мин</span>
        </label>`;
    });
    html += `</div>`;
  });

  const selCount = S.selectedTaskIds.size;
  html += `
    <div style="position:sticky;bottom:0;background:var(--bg);padding:12px 0 4px">
      <button class="btn-primary" id="distributeBtn" ${selCount===0?'disabled':''}>
        Распределить (${selCount} дел${selCount===1?'о':selCount<5?'а':'})
      </button>
    </div>`;

  content.innerHTML = html;

  content.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.onchange = () => {
      const tid = parseInt(cb.dataset.tid);
      if (cb.checked) S.selectedTaskIds.add(tid);
      else S.selectedTaskIds.delete(tid);
      renderMomSession(content);
    };
  });

  document.getElementById('distributeBtn')?.addEventListener('click', async () => {
    try {
      await api('POST', '/session', { task_ids: [...S.selectedTaskIds] });
      toast('✅ План создан!');
      S.selectedTaskIds.clear();
      await loadData();
      render();
    } catch (e) { toast('Ошибка: ' + e.message); }
  });
}

function renderSessionOverview(content) {
  const assignments = S.session?.assignments || [];
  const byUser = {};
  assignments.forEach(a => {
    if (!byUser[a.user_id]) byUser[a.user_id] = {
      name: a.user_name, color: a.avatar_color, tasks: []
    };
    byUser[a.user_id].tasks.push(a);
  });

  let html = `
    <div class="row" style="margin-bottom:12px">
      <div class="flex1">
        <div style="font-weight:700;font-size:17px">План на неделю</div>
        <div style="color:var(--text-secondary);font-size:13px">с ${S.session.week_start}</div>
      </div>
      <button class="btn-secondary" id="addAdhoc" style="width:auto;padding:8px 14px;font-size:13px">+ Дело</button>
    </div>`;

  Object.values(byUser).forEach(u => {
    const total = u.tasks.length;
    const done  = u.tasks.filter(t => t.status === 'done').length;
    const totalMins = u.tasks.reduce((s, t) => s + (t.estimated_minutes || 0), 0);
    html += `
      <div class="card">
        <div class="dist-person-header">
          <div class="avatar-sm" style="background:${u.color}">${u.name[0]}</div>
          <div class="pname">${u.name}</div>
          <div class="pmins">${done}/${total} · ${totalMins} мин</div>
        </div>`;
    u.tasks.forEach(a => {
      const name = a.adhoc_name || a.task_name;
      const statusIcon = a.status === 'done' ? '✅' : a.status === 'postpone_requested' ? '⏳' : '◦';
      html += `
        <div class="task-item" style="padding:8px 0">
          <span style="font-size:16px">${statusIcon}</span>
          <div class="task-info">
            <div class="task-name${a.status==='done'?' done-text':''}">${name}</div>
            <div class="task-meta">${a.estimated_minutes||0} мин</div>
          </div>
        </div>`;
    });
    html += `</div>`;
  });

  html += `<button class="btn-secondary" id="newPlan">Создать новый план</button>`;
  content.innerHTML = html;

  document.getElementById('newPlan').onclick = () => {
    S.session = null;
    renderMomSession(content);
  };
  document.getElementById('addAdhoc').onclick = () => openAdhocModal();
}

function openAdhocModal() {
  const userOptions = S.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
  showModal(`
    <h2>Добавить внеплановое дело</h2>
    <input type="text" id="adhocName" placeholder="Название задачи" maxlength="80"/>
    <select id="adhocUser">${userOptions}</select>
    <input type="number" id="adhocMins" placeholder="Время (мин)" value="15" min="5" max="120"/>
    <div class="modal-btns">
      <button class="btn-secondary" id="cancelAdhoc" style="flex:1">Отмена</button>
      <button class="btn-primary" id="confirmAdhoc" style="flex:1">Добавить</button>
    </div>`,
    async () => {
      const name = document.getElementById('adhocName').value.trim();
      const uid  = parseInt(document.getElementById('adhocUser').value);
      const mins = parseInt(document.getElementById('adhocMins').value) || 15;
      if (!name) { toast('Введи название'); return; }
      try {
        await api('POST', '/adhoc', { session_id: S.session.id, name, assigned_to: uid, estimated_minutes: mins });
        toast('✅ Задача добавлена');
        closeModal();
        await loadData();
        render();
      } catch (e) { toast(e.message); }
    }
  );
  document.getElementById('cancelAdhoc').onclick = closeModal;
}

/* ── Mom: Approvals ── */
function renderMomApprovals(content) {
  const { postpones, spend_requests } = S.approvals;
  let html = '';

  if (postpones.length === 0 && spend_requests.length === 0) {
    html = `<div class="empty"><div class="icon">🎉</div><p>Нет запросов.<br>Всё хорошо!</p></div>`;
  }

  if (postpones.length > 0) {
    html += `<div class="card-title" style="padding:0 4px">Запросы на перенос</div>`;
    postpones.forEach(a => {
      html += `
        <div class="approval-item" data-id="${a.id}">
          <div class="approval-task">${a.adhoc_name || a.task_name}</div>
          <div class="approval-meta">
            <span style="background:${a.avatar_color};color:white;border-radius:99px;padding:2px 8px;font-size:12px;font-weight:700">${a.user_name}</span>
            ${a.postpone_to ? ` → ${a.postpone_to}` : ''}
            ${a.postpone_reason ? `<br><em>"${a.postpone_reason}"</em>` : ''}
          </div>
          <div class="approval-btns">
            <button class="btn-approve" data-approve="${a.id}">✓ Одобрить</button>
            <button class="btn-reject"  data-reject="${a.id}">✗ Отклонить</button>
          </div>
        </div>`;
    });
  }

  if (spend_requests.length > 0) {
    html += `<div class="card-title" style="padding:8px 4px 0">Запросы на экранное время</div>`;
    spend_requests.forEach(tx => {
      const mins = Math.abs(tx.amount) / 10 * 30;
      html += `
        <div class="approval-item" data-txid="${tx.id}">
          <div class="approval-task">⭐ ${Math.abs(tx.amount)} баллов → ${mins} мин игр</div>
          <div class="approval-meta">
            <span style="background:${tx.avatar_color};color:white;border-radius:99px;padding:2px 8px;font-size:12px;font-weight:700">${tx.user_name}</span>
          </div>
          <div class="approval-btns">
            <button class="btn-approve" data-approvetx="${tx.id}">✓ Одобрить</button>
            <button class="btn-reject"  data-rejecttx="${tx.id}">✗ Отклонить</button>
          </div>
        </div>`;
    });
  }

  content.innerHTML = html;

  content.querySelectorAll('[data-approve]').forEach(btn => {
    btn.onclick = async () => {
      await api('POST', `/approvals/postpone/${btn.dataset.approve}?approve=true`);
      toast('✅ Перенос одобрен');
      await loadData(); render();
    };
  });
  content.querySelectorAll('[data-reject]').forEach(btn => {
    btn.onclick = async () => {
      await api('POST', `/approvals/postpone/${btn.dataset.reject}?approve=false`);
      toast('❌ Перенос отклонён');
      await loadData(); render();
    };
  });
  content.querySelectorAll('[data-approvetx]').forEach(btn => {
    btn.onclick = async () => {
      await api('POST', `/points/spend/${btn.dataset.approvetx}/approve?approve=true`);
      toast('✅ Экранное время одобрено');
      await loadData(); render();
    };
  });
  content.querySelectorAll('[data-rejecttx]').forEach(btn => {
    btn.onclick = async () => {
      await api('POST', `/points/spend/${btn.dataset.rejecttx}/approve?approve=false`);
      toast('❌ Запрос отклонён');
      await loadData(); render();
    };
  });
}

/* ── Mom: Settings ── */
function renderMomSettings(content) {
  const tabsHtml = `
    <div class="tabs" style="margin-bottom:12px;background:white;border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)">
      <button class="tab${!S._settingsTab||S._settingsTab==='family'?' active':''}" data-stab="family">Семья</button>
      <button class="tab${S._settingsTab==='prefs'?' active':''}" data-stab="prefs">Предпочтения</button>
    </div>`;

  content.innerHTML = tabsHtml + `<div id="settingsBody"></div>`;

  content.querySelectorAll('[data-stab]').forEach(b => {
    b.onclick = () => { S._settingsTab = b.dataset.stab; renderMomSettings(content); };
  });

  const body = document.getElementById('settingsBody');
  if (!S._settingsTab || S._settingsTab === 'family') renderFamilySettings(body);
  else renderPrefsSettings(body);
}

function renderFamilySettings(body) {
  let html = `<div class="card">`;
  S.users.forEach(u => {
    html += `
      <div class="person-row">
        <div class="avatar-sm" style="background:${u.avatar_color};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700">${u.name[0]}</div>
        <div class="person-info">
          <div class="person-name">${u.name} · ${u.age} лет ${u.adhd?'<span style="font-size:11px;background:#FF8C69;color:white;border-radius:99px;padding:1px 6px">СДВГ</span>':''}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
            <label style="font-size:12px;color:var(--text-secondary)">⏱ макс мин:
              <input type="number" class="limit-min" data-uid="${u.id}" value="${u.max_minutes===9999?'∞':u.max_minutes}"
                style="width:60px;margin-left:4px;padding:4px 6px;border:1.5px solid #E5E5EA;border-radius:6px;font-size:13px"
                ${u.role==='admin'?'disabled':''}/>
            </label>
            <label style="font-size:12px;color:var(--text-secondary)">📋 макс дел:
              <input type="number" class="limit-tasks" data-uid="${u.id}" value="${u.max_tasks===999?'∞':u.max_tasks}"
                style="width:50px;margin-left:4px;padding:4px 6px;border:1.5px solid #E5E5EA;border-radius:6px;font-size:13px"
                ${u.role==='admin'?'disabled':''}/>
            </label>
          </div>
        </div>
      </div>`;
  });
  html += `</div>
    <button class="btn-primary" id="saveLimits">Сохранить лимиты</button>`;
  body.innerHTML = html;

  document.getElementById('saveLimits').onclick = async () => {
    const minInputs   = body.querySelectorAll('.limit-min');
    const taskInputs  = body.querySelectorAll('.limit-tasks');
    for (let i = 0; i < minInputs.length; i++) {
      const uid  = parseInt(minInputs[i].dataset.uid);
      const mins = parseInt(minInputs[i].value) || 9999;
      const tasks= parseInt(taskInputs[i].value) || 999;
      const u = S.users.find(u => u.id === uid);
      if (u && u.role !== 'admin') {
        await api('PUT', `/users/${uid}/limits`, { max_minutes: mins, max_tasks: tasks });
      }
    }
    S.users = await api('GET', '/users');
    toast('✅ Сохранено');
    renderFamilySettings(body);
  };
}

async function renderPrefsSettings(body) {
  if (!S._prefsUser) S._prefsUser = S.users.find(u => u.role !== 'admin')?.id;
  const children = S.users.filter(u => u.role !== 'admin');
  const prefs = await api('GET', `/preferences/${S._prefsUser}`);

  let html = `
    <div class="card" style="margin-bottom:10px">
      <div class="card-title">Участник</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${children.map(u => `
          <button class="action-btn ${S._prefsUser===u.id?'btn-done':''}" data-puid="${u.id}"
            style="border:1.5px solid ${S._prefsUser===u.id?'var(--green)':'#E5E5EA'}">
            ${u.name}
          </button>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-title">Предпочтения · 🟢 охотно · 🟡 нейтрально · 🔴 не хочет</div>`;

  const cats = {};
  prefs.forEach(p => {
    if (!cats[p.category]) cats[p.category] = [];
    cats[p.category].push(p);
  });
  Object.entries(cats).forEach(([cat, items]) => {
    html += `<div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin:10px 0 4px">${cat}</div>`;
    items.forEach(p => {
      html += `
        <div class="pref-item">
          <div class="pref-name">${p.task_name}</div>
          <div class="color-btns">
            <button class="color-btn green-btn${p.color==='green'?' active':''}" data-tid="${p.task_id}" data-color="green">🟢</button>
            <button class="color-btn yellow-btn${p.color==='yellow'?' active':''}" data-tid="${p.task_id}" data-color="yellow">🟡</button>
            <button class="color-btn red-btn${p.color==='red'?' active':''}" data-tid="${p.task_id}" data-color="red">🔴</button>
          </div>
        </div>`;
    });
  });
  html += `</div>`;
  body.innerHTML = html;

  body.querySelectorAll('[data-puid]').forEach(b => {
    b.onclick = () => { S._prefsUser = parseInt(b.dataset.puid); renderPrefsSettings(body); };
  });

  body.querySelectorAll('.color-btn').forEach(btn => {
    btn.onclick = async () => {
      const tid   = parseInt(btn.dataset.tid);
      const color = btn.dataset.color;
      const pref  = prefs.find(p => p.task_id === tid);
      await api('PUT', `/preferences/${S._prefsUser}`, { task_id: tid, score: pref?.score ?? 5, color });
      toast('Сохранено');
      renderPrefsSettings(body);
    };
  });
}

/* ══════════════════════════════════════
   MODAL
══════════════════════════════════════ */
function showModal(html, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modalOverlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };

  const confirmIds = ['confirmPost', 'confirmAdhoc', 'confirmSpendBtn'];
  confirmIds.forEach(id => {
    document.getElementById(id)?.addEventListener('click', onConfirm);
  });
}

function closeModal() {
  document.getElementById('modalOverlay')?.remove();
}

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function logout() {
  S.user = null;
  S.view = 'login';
  S.subview = 'home';
  S.session = null;
  S.assignments = [];
  S.points = null;
  S._settingsTab = null;
  S._prefsUser = null;
  render();
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
async function init() {
  app.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:32px">🏠</div>`;
  S.users = await api('GET', '/users');
  render();
}

init();

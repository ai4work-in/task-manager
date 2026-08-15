/**
 * Task Manager — frontend app.
 *
 * Structure and markup follow the approved mockup (mockup.html). The differences
 * are that state comes from the Apps Script API instead of in-memory mock data,
 * all interpolated values are HTML-escaped, and three behaviours the mockup
 * predates are present: the due-date popup and Copy-for-WhatsApp.
 *
 * Language: Admin sees plain English, Supervisor/Employee see Hinglish, via L().
 * Priority words are NEVER translated — priorityLabel() is a deliberate passthrough.
 */

/* ============ STATE ============ */
var state = {
  currentUser: null,
  pendingPhone: null,
  tasks: [],
  counts: {},
  team: [],
  taskTypes: [],
  priorities: [],
  statuses: ['Open', 'In Progress', 'Done'],
  detail: null,
  due: null
};

var route = 'login';
var ui = {
  taskFilter: 'all',
  settingsTab: 'types',
  openTagDropdown: null,
  draftSubtasks: [],
  newTaskType: null,
  newTaskPriority: null,
  payload: {},
  busy: false,
  pickedColor: '#C1443A',
  pickedRole: 'employee',
  showDueModal: false
};

/* ============ ROLE + LANGUAGE ============ */
function isAdmin()      { return !!state.currentUser && state.currentUser.role === 'admin'; }
function isSupervisor() { return !!state.currentUser && state.currentUser.role === 'supervisor'; }
function isEmployee()   { return !!state.currentUser && state.currentUser.role === 'employee'; }
function canManage()    { return isAdmin() || isSupervisor(); }
function canEditFields(){ return isAdmin(); }

// Admin = plain English. Supervisor/Employee = Hinglish. Login/PIN screens have no
// user yet, so they stay Hinglish (the non-admin default) until the role is known.
function L(en, hi) { return isAdmin() ? en : hi; }

// Priority words always render in English, for every role. Do not "fix" this.
function priorityLabel(name) { return name; }

/* ============ HELPERS ============ */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function userById(id) {
  for (var i = 0; i < state.team.length; i++) {
    if (String(state.team[i].id) === String(id)) return state.team[i];
  }
  return null;
}

function userName(id) {
  var u = userById(id);
  return u ? u.name : '';
}

function firstName(name) {
  return String(name || '').split(' ')[0];
}

function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function daysUntil(dateKey) {
  if (!dateKey) return null;
  var a = new Date(todayKey() + 'T00:00:00');
  var b = new Date(dateKey + 'T00:00:00');
  if (isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

function fmtDate(dateKey) {
  if (!dateKey) return '—';
  var d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return String(dateKey);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + ' ' + months[d.getMonth()];
}

function fmtDateTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return fmtDate(d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())) +
    ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function dueBadge(dateKey, status) {
  if (status === 'Done') return { cls: 'done', text: L('Done', 'Poora hua') };
  var diff = daysUntil(dateKey);
  if (diff === null) return { cls: 'open', text: L('No due date', 'Due date nahi hai') };
  if (diff < 0)   return { cls: 'overdue', text: L('Overdue', 'Der ho gayi'), urgent: true };
  if (diff === 0) return { cls: 'inprogress', text: L('Due today', 'Aaj due hai'), urgent: true };
  if (diff === 1) return { cls: 'inprogress', text: L('Due tomorrow', 'Kal due hai'), urgent: true };
  if (diff === 2) return { cls: 'inprogress', text: L('Due in 2d', '2 din mein due'), urgent: true };
  return { cls: 'open', text: L('Due in ' + diff + 'd', diff + ' din mein due') };
}

function priorityColor(name) {
  for (var i = 0; i < state.priorities.length; i++) {
    if (state.priorities[i].name === name) return state.priorities[i].color;
  }
  return '#7C8592';
}

function taskProgress(t) {
  var subs = t.subtasks || [];
  var done = 0;
  for (var i = 0; i < subs.length; i++) if (subs[i].status === 'Done') done++;
  return { done: done, total: subs.length, pct: subs.length ? Math.round(done / subs.length * 100) : 0 };
}

function taskNextDue(t) {
  var min = null;
  (t.subtasks || []).forEach(function (s) {
    if (s.status === 'Done' || !s.due_date) return;
    if (!min || s.due_date < min) min = s.due_date;
  });
  return min;
}

function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
}

function go(r, payload) {
  route = r;
  ui.payload = payload || {};
  ui.openTagDropdown = null;
  render();
}

function val(id) {
  var el = document.getElementById(id);
  return el ? String(el.value).trim() : '';
}

/** Uniform API error surfacing — network failures get a friendlier line. */
function apiError(err) {
  ui.busy = false;
  var msg = (err && err.message === 'network')
    ? L('Could not reach the server. Check your connection and try again.',
        'Server se connect nahi ho paya. Connection check karke dobara try karein.')
    : (err && err.message) || L('Something went wrong.', 'Kuch galat ho gaya.');

  if (err && err.status === 401) {
    showToast(msg);
    return logout();
  }
  showToast(msg);
  render();
}

/* ============ BOOT ============ */
function boot() {
  if (window.__TM_UNSUPPORTED__) return;

  var saved = localStorage.getItem(CONFIG.USER_KEY);
  if (API.getToken() && saved) {
    try {
      state.currentUser = JSON.parse(saved);
    } catch (e) {
      state.currentUser = null;
    }
  }

  if (state.currentUser) {
    route = 'home';
    renderLoading();
    loadBoard(true);
  } else {
    go('login');
  }
}

function renderLoading() {
  document.getElementById('app').innerHTML =
    '<div class="loading-wrap"><div class="spinner"></div><div>' +
    esc(L('Loading...', 'Load ho raha hai...')) + '</div></div>';
}

/** Board + the reference data every screen needs. */
function loadBoard(checkDue) {
  return Promise.all([API.listTasks(), API.team(), API.master()])
    .then(function (res) {
      state.tasks = res[0].tasks || [];
      state.counts = res[0].counts || {};
      state.team = res[1].team || [];
      state.taskTypes = res[2].taskTypes || [];
      state.priorities = res[2].priorities || [];
      state.statuses = res[2].statuses && res[2].statuses.length ? res[2].statuses : state.statuses;
      ui.busy = false;
      render();
      if (checkDue) maybeShowDuePopup();
    })
    .catch(apiError);
}

/* ============ RENDER ROOT ============ */
function render() {
  var app = document.getElementById('app');
  var html = '';

  if (route === 'login')         html = screenLogin();
  else if (route === 'pin')      html = screenPin();
  else if (route === 'home')     html = screenHome();
  else if (route === 'detail')   html = screenDetail();
  else if (route === 'create')   html = screenCreate();
  else if (route === 'settings') html = screenSettings();
  else if (route === 'profile')  html = screenProfile();

  if (ui.showDueModal && state.due) html += dueModal();

  app.innerHTML = html;
}

/* ============ LOGIN (phone + PIN, no OTP) ============ */
function screenLogin() {
  return '' +
  '<div class="center-screen">' +
    '<div class="login-logo"><span class="ai">ai</span><span class="four">4</span><span class="work">work</span></div>' +
    '<div class="login-title">Login karein</div>' +
    '<div class="login-sub">Apna registered mobile number daalein. 4-digit PIN aapka admin assign karta hai.</div>' +
    '<div class="field-label">Mobile Number</div>' +
    '<div class="phone-input-row">' +
      '<div class="cc">+91</div>' +
      '<input class="input-lg" id="phoneInput" maxlength="10" inputmode="numeric" autocomplete="tel" ' +
        'placeholder="98XXXXXXXX" value="' + esc(state.pendingPhone || '') + '">' +
    '</div>' +
    '<div class="error-msg" id="loginErr"></div>' +
    '<button class="btn-primary" id="phoneBtn" onclick="submitPhone()">Continue karein</button>' +
  '</div>';
}

function submitPhone() {
  var phone = val('phoneInput');
  var errEl = document.getElementById('loginErr');
  errEl.classList.remove('show');

  if (!/^\d{10}$/.test(phone)) {
    errEl.textContent = '10-digit mobile number daalein.';
    errEl.classList.add('show');
    return;
  }

  var btn = document.getElementById('phoneBtn');
  btn.disabled = true;
  btn.textContent = 'Check ho raha hai...';

  API.checkPhone(phone)
    .then(function () {
      state.pendingPhone = phone;
      go('pin');
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Continue karein';
      errEl.textContent = (err && err.message === 'network')
        ? 'Server se connect nahi ho paya. Connection check karein.'
        : (err.message || 'Yeh number nahi mila.');
      errEl.classList.add('show');
    });
}

/* ============ PIN ============ */
function screenPin() {
  var boxes = '';
  for (var i = 0; i < 4; i++) {
    boxes += '<input class="pin-box" maxlength="1" inputmode="numeric" type="tel" id="pin' + i + '" ' +
             'onkeyup="pinMove(' + i + ', event)">';
  }
  return '' +
  '<div class="center-screen">' +
    '<div class="back-btn" style="margin-bottom:20px;" onclick="go(\'login\')">&#8592;</div>' +
    '<div class="login-title">Apna PIN daalein</div>' +
    '<div class="login-sub">+91 ' + esc(state.pendingPhone) + ' ke roop mein login ho raha hai.<br>' +
      'PIN bhool gaye? Admin se reset karwayein — self-reset ka option nahi hai.</div>' +
    '<div class="pin-boxes">' + boxes + '</div>' +
    '<div class="error-msg" id="pinErr"></div>' +
    '<button class="btn-primary" id="pinBtn" onclick="verifyPin()">Login karein</button>' +
  '</div>';
}

function pinMove(i, e) {
  var box = document.getElementById('pin' + i);
  if (!box) return;

  // Backspace on an empty box steps back, so correcting a typo isn't fiddly.
  if (e && e.key === 'Backspace' && !box.value && i > 0) {
    document.getElementById('pin' + (i - 1)).focus();
    return;
  }
  box.value = box.value.replace(/\D/g, '');
  if (box.value.length === 1 && i < 3) document.getElementById('pin' + (i + 1)).focus();
  if (box.value.length === 1 && i === 3) verifyPin();
}

function verifyPin() {
  var code = '';
  for (var i = 0; i < 4; i++) code += val('pin' + i);

  var errEl = document.getElementById('pinErr');
  errEl.classList.remove('show');

  if (code.length !== 4) {
    errEl.textContent = 'Poora 4-digit PIN daalein.';
    errEl.classList.add('show');
    return;
  }

  var btn = document.getElementById('pinBtn');
  btn.disabled = true;
  btn.textContent = 'Login ho raha hai...';

  API.login(state.pendingPhone, code)
    .then(function (data) {
      API.setToken(data.token);
      state.currentUser = data.user;
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
      ui.taskFilter = 'all';
      route = 'home';
      renderLoading();
      return loadBoard(true);
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Login karein';
      errEl.textContent = err.message === 'network'
        ? 'Server se connect nahi ho paya.'
        : (err.message || 'PIN match nahi hua.');
      errEl.classList.add('show');
      for (var j = 0; j < 4; j++) document.getElementById('pin' + j).value = '';
      document.getElementById('pin0').focus();
    });
}

function logout() {
  API.setToken(null);
  localStorage.removeItem(CONFIG.USER_KEY);
  state.currentUser = null;
  state.pendingPhone = null;
  state.tasks = [];
  state.due = null;
  ui.showDueModal = false;
  go('login');
}

/* ============ HOME ============ */
function screenHome() {
  if (isEmployee()) return employeeHome();

  var tasks = state.tasks.slice();
  if (ui.taskFilter === 'overdue') {
    tasks = tasks.filter(function (t) {
      var d = taskNextDue(t); return t.status !== 'Done' && d && daysUntil(d) < 0;
    });
  } else if (ui.taskFilter === 'duesoon') {
    tasks = tasks.filter(function (t) {
      var d = taskNextDue(t), n = d ? daysUntil(d) : null;
      return t.status !== 'Done' && n !== null && n >= 0 && n <= 2;
    });
  } else if (ui.taskFilter === 'done') {
    tasks = tasks.filter(function (t) { return t.status === 'Done'; });
  }

  var open = state.tasks.filter(function (t) { return t.status !== 'Done'; }).length;
  var overdue = state.tasks.filter(function (t) {
    var d = taskNextDue(t); return t.status !== 'Done' && d && daysUntil(d) < 0;
  }).length;
  var soon = state.tasks.filter(function (t) {
    var d = taskNextDue(t), n = d ? daysUntil(d) : null;
    return t.status !== 'Done' && n !== null && n >= 0 && n <= 2;
  }).length;
  var done = state.tasks.filter(function (t) { return t.status === 'Done'; }).length;

  return '' +
  '<div class="topbar">' +
    '<div class="title">' + esc(isAdmin() ? 'Tasks' : 'Team ke tasks') + '</div>' +
    dueBellButton() +
    '<div class="avatar" onclick="go(\'profile\')">' + esc(state.currentUser.initials) + '</div>' +
  '</div>' +
  '<div class="screen">' +
    '<div class="stat-grid">' +
      statCell(open, L('Open Tasks', 'Open Tasks'), 'navy') +
      statCell(overdue, L('Overdue', 'Der Wale'), 'red') +
      statCell(soon, L('Due in 2 days', '2 Din Mein Due'), 'amber') +
      statCell(done, L('Completed', 'Poore Hue'), 'green') +
    '</div>' +
    '<div class="chiprow" style="border-top:1px solid var(--line);">' +
      chip('all', L('All', 'Sabhi')) +
      chip('overdue', L('Overdue', 'Der wale')) +
      chip('duesoon', L('Due soon', 'Jald due')) +
      chip('done', L('Done', 'Poore')) +
    '</div>' +
    '<div class="list">' +
      (tasks.length
        ? tasks.map(adminCard).join('')
        : emptyState(L('No tasks in this view.', 'Is view mein koi task nahi hai.'))) +
    '</div>' +
    credit() +
  '</div>' +
  '<div class="fab" onclick="openCreate()">+</div>' +
  bottomNav('home');
}

function employeeHome() {
  // Backend already filtered each task's sub-tasks to this employee's own.
  var items = [];
  state.tasks.forEach(function (t) {
    (t.subtasks || []).forEach(function (s) { items.push({ parent: t, sub: s }); });
  });

  if (ui.taskFilter === 'open') items = items.filter(function (i) { return i.sub.status !== 'Done'; });
  if (ui.taskFilter === 'done') items = items.filter(function (i) { return i.sub.status === 'Done'; });

  return '' +
  '<div class="topbar">' +
    '<div class="title">Mera kaam</div>' +
    dueBellButton() +
    '<div class="avatar" onclick="go(\'profile\')">' + esc(state.currentUser.initials) + '</div>' +
  '</div>' +
  '<div class="chiprow">' +
    chip('all', 'Sabhi') + chip('open', 'Open') + chip('done', 'Poore') +
  '</div>' +
  '<div class="screen"><div class="list">' +
    (items.length
      ? items.map(function (i) { return employeeCard(i.parent, i.sub); }).join('')
      : emptyState('Abhi aapko kuch assign nahi hua hai.')) +
    credit() +
  '</div></div>' +
  bottomNav('home');
}

function statCell(num, label, cls) {
  return '<div class="stat-cell"><div class="stat-card">' +
    '<div class="stat-num ' + cls + '">' + num + '</div>' +
    '<div class="stat-label">' + esc(label) + '</div></div></div>';
}

function chip(key, label) {
  return '<div class="chip' + (ui.taskFilter === key ? ' active' : '') +
    '" onclick="setFilter(\'' + key + '\')">' + esc(label) + '</div>';
}

function setFilter(f) { ui.taskFilter = f; render(); }

function emptyState(msg) {
  return '<div class="empty-state">' + esc(msg) + '</div>';
}

function credit() {
  return '<div class="credit">created by <span>ai</span><span class="four">4</span><span>work</span></div>';
}

function adminCard(t) {
  var prog = taskProgress(t);
  var nextDue = taskNextDue(t);
  var badge = nextDue ? dueBadge(nextDue, t.status) : { cls: 'done', text: L('Done', 'Poora hua') };
  var pc = priorityColor(t.priority);
  var subCount = (t.subtasks || []).length;

  var seen = {}, avatars = '';
  (t.subtasks || []).forEach(function (s) {
    if (!s.assignee || seen[s.assignee]) return;
    seen[s.assignee] = true;
    avatars += '<div class="mini-avatar">' + esc(s.assignee_initials || '?') + '</div>';
  });

  var fill = t.status === 'Done' ? 'var(--green)' : (badge.urgent ? 'var(--red)' : 'var(--navy)');

  return '' +
  '<div class="task-card" onclick="openTask(\'' + esc(t.id) + '\')">' +
    '<div class="task-top">' +
      '<div class="task-title">' + esc(t.title) + '</div>' +
      '<div class="prio-flag" style="color:' + esc(pc) + ';">' +
        '<span class="prio-dot" style="background:' + esc(pc) + ';"></span>' +
        esc(priorityLabel(t.priority)) + '</div>' +
    '</div>' +
    '<div class="task-meta">' +
      (t.type ? '<span class="type-tag">' + esc(t.type) + '</span>' : '') +
      '<span class="status-tag ' + badge.cls + '">' + esc(badge.text) + '</span>' +
    '</div>' +
    '<div class="task-meta">' +
      esc(nextDue
        ? L('Next sub-task due', 'Agla sub-task due') + ' ' + fmtDate(nextDue)
        : L('All sub-tasks done', 'Sabhi sub-tasks poore')) +
      '<span class="dot"></span>' +
      esc(subCount + ' sub-task' + (isAdmin() && subCount !== 1 ? 's' : '')) +
    '</div>' +
    '<div class="progress-row">' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + prog.pct + '%; background:' + fill + ';"></div></div>' +
      '<div class="progress-label">' + esc(prog.done + '/' + prog.total + ' ' + L('done', 'poora')) + '</div>' +
    '</div>' +
    (t.status === 'Done' && t.purge_due
      ? '<div class="task-meta" style="color:var(--red); font-weight:700;">' +
        esc(L('Deleted permanently on ', 'Permanently delete: ') + fmtDate(t.purge_due)) + '</div>' : '') +
    '<div class="avatars-stack">' + avatars + '</div>' +
  '</div>';
}

function employeeCard(t, s) {
  var badge = dueBadge(s.due_date, s.status);
  var pc = priorityColor(t.priority);

  return '' +
  '<div class="task-card" onclick="openTask(\'' + esc(t.id) + '\')">' +
    '<div class="task-top">' +
      '<div class="task-title">' + esc(s.title) + '</div>' +
      '<div class="prio-flag" style="color:' + esc(pc) + ';">' +
        '<span class="prio-dot" style="background:' + esc(pc) + ';"></span>' +
        esc(priorityLabel(t.priority)) + '</div>' +
    '</div>' +
    '<div class="task-meta">Yeh kis task ka hissa hai: ' + esc(t.title) + '</div>' +
    '<div class="task-meta">Due ' + esc(fmtDate(s.due_date)) + '<span class="dot"></span>' +
      '<span class="status-tag ' + (s.status === 'Done' ? 'done' : badge.cls) + '">' +
      esc(s.status === 'Done' ? 'Poora hua' : badge.text) + '</span></div>' +
  '</div>';
}

function bottomNav(active) {
  return '' +
  '<div class="bottomnav">' +
    '<div class="navitem' + (active === 'home' ? ' active' : '') + '" onclick="go(\'home\')">' +
      '<span class="ico">&#9638;</span><span>' + esc(isEmployee() ? 'Mera kaam' : 'Tasks') + '</span></div>' +
    (isAdmin()
      ? '<div class="navitem' + (active === 'settings' ? ' active' : '') + '" onclick="openSettings()">' +
        '<span class="ico">&#9881;</span><span>Settings</span></div>' : '') +
    '<div class="navitem' + (active === 'profile' ? ' active' : '') + '" onclick="go(\'profile\')">' +
      '<span class="ico">&#9684;</span><span>Profile</span></div>' +
  '</div>';
}

/* ============ DUE-DATE POPUP (N-2 / N-1 / N) ============ */
function dueBellButton() {
  var n = state.due ? state.due.total : 0;
  if (!n) return '';
  return '<div class="due-badge" style="cursor:pointer;" onclick="openDueModal()">' +
    '&#9873; ' + n + '</div>';
}

/**
 * Fetch the digest and show it at most once per calendar day per user.
 * Deliberately never blocks the board — a digest failure is silent.
 */
function maybeShowDuePopup() {
  API.dueDigest()
    .then(function (data) {
      state.due = data;
      var key = CONFIG.DUE_SEEN_KEY + '_' + state.currentUser.id;
      var lastSeen = localStorage.getItem(key);

      if (data.total > 0 && lastSeen !== data.date) {
        ui.showDueModal = true;
        localStorage.setItem(key, data.date);
      }
      render();
    })
    .catch(function () { /* digest is non-critical — never block the board on it */ });
}

function openDueModal() { ui.showDueModal = true; render(); }
function closeDueModal() { ui.showDueModal = false; render(); }

function dueModal() {
  var groups = [
    { key: 'overdue',   cls: 'overdue', label: L('Overdue',        'Der ho chuki hai') },
    { key: 'today',     cls: 'today',   label: L('Due today',      'Aaj due hai') },
    { key: 'tomorrow',  cls: 'soon',    label: L('Due tomorrow',   'Kal due hai') },
    { key: 'in_2_days', cls: 'soon',    label: L('Due in 2 days',  '2 din mein due') }
  ];

  var body = '';
  groups.forEach(function (g) {
    var items = state.due.items.filter(function (i) { return i.bucket === g.key; });
    if (!items.length) return;

    body += '<div class="due-group-label ' + g.cls + '">' + esc(g.label) + ' (' + items.length + ')</div>';
    items.forEach(function (i) {
      var pc = priorityColor(i.priority);
      body += '' +
      '<div class="due-item" onclick="closeDueModal(); openTask(\'' + esc(i.task_id) + '\')">' +
        '<span class="prio-dot" style="background:' + esc(pc) + '; margin-top:5px;"></span>' +
        '<div class="due-item-text">' +
          '<div class="due-item-title">' + esc(i.title) + '</div>' +
          '<div class="due-item-meta">' + esc(i.task_title) + ' &middot; ' + esc(fmtDate(i.due_date)) +
            (canManage() && i.assignee_name ? ' &middot; ' + esc(firstName(i.assignee_name)) : '') +
          '</div>' +
        '</div>' +
      '</div>';
    });
  });

  return '' +
  '<div class="modal-backdrop" onclick="closeDueModal()">' +
    '<div class="modal-card" onclick="event.stopPropagation()">' +
      '<div class="modal-head">' +
        '<div class="modal-title">' + esc(L('Due soon', 'Jaldi due hai')) + '</div>' +
        '<div class="modal-sub">' + esc(canManage()
          ? L('Sub-tasks due in the next 2 days, or already overdue.',
              'Agle 2 din mein due sub-tasks, ya jo pehle se overdue hain.')
          : 'Aapke sub-tasks jo 2 din mein due hain, ya pehle se overdue hain.') + '</div>' +
      '</div>' +
      '<div class="modal-body">' + (body || emptyState(L('Nothing due.', 'Kuch due nahi hai.'))) + '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn-primary" style="margin-top:0;" onclick="closeDueModal()">' +
          esc(L('Got it', 'Theek hai')) + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ============ TASK DETAIL ============ */
function openTask(taskId) {
  renderLoading();
  API.getTask(taskId)
    .then(function (data) {
      state.detail = data.task;
      go('detail', { taskId: taskId });
      // Refresh the board quietly so counts are current when the user goes back.
      API.listTasks().then(function (res) {
        state.tasks = res.tasks || [];
        state.counts = res.counts || {};
      }).catch(function () {});
    })
    .catch(apiError);
}

function reloadDetail() {
  return API.getTask(state.detail.id)
    .then(function (data) { state.detail = data.task; ui.busy = false; render(); })
    .catch(apiError);
}

function screenDetail() {
  var t = state.detail;
  if (!t) return screenHome();

  var editable = canEditFields();
  var manage = canManage();
  var prog = taskProgress(t);
  var nextDue = taskNextDue(t);
  var badge = nextDue ? dueBadge(nextDue, t.status) : { cls: 'done', text: L('Done', 'Poora hua') };
  var statusCls = t.status === 'Done' ? 'done' : (t.status === 'Open' ? 'open' : 'inprogress');

  return '' +
  '<div class="topbar">' +
    '<div class="back-btn" onclick="backToBoard()">&#8592;</div>' +
    '<div class="title">' + esc(isEmployee() ? 'Task ki detail' : L('Task detail', 'Task ki detail')) + '</div>' +
    '<button class="copy-btn" onclick="copyTask()">&#128203; ' + esc(L('Copy', 'Copy')) + '</button>' +
  '</div>' +
  '<div class="screen"><div class="detail-body">' +

    (editable
      ? '<input class="editable-title" value="' + esc(t.title) + '" onchange="saveTitle(this.value)">'
      : '<div class="static-title">' + esc(t.title) + '</div>') +

    (isSupervisor()
      ? '<div class="perm-note">Aap sub-tasks tag/reassign kar sakte hain, status update kar sakte hain, ' +
        'aur notes add kar sakte hain. Task type, priority, title ya due date edit karna sirf admin kar sakta hai.</div>'
      : '') +

    (t.status === 'Done' && t.purge_due
      ? '<div class="purge-note">&#9888; ' + esc(L(
          'This task is complete. It will be permanently deleted on ' + fmtDate(t.purge_due) +
            ' — along with its sub-tasks and notes. This cannot be undone.',
          'Yeh task complete ho gaya hai. ' + fmtDate(t.purge_due) +
            ' ko yeh permanently delete ho jayega — sub-tasks aur notes ke saath. Wapas nahi aayega.')) + '</div>'
      : '') +

    '<div class="field-label">Status</div>' +
    '<div class="status-tag ' + statusCls + '" style="display:inline-block; padding:8px 14px; font-size:12px;">' +
      esc(t.status) + '</div>' +
    '<div style="font-size:11.5px; color:var(--gray); margin-top:6px; line-height:1.45;">' +
      esc(L('Status updates automatically — Done only once every sub-task below is marked complete.',
            'Status apne aap update hota hai — Done tabhi hoga jab neeche ke sabhi sub-tasks complete ho jayein.')) +
    '</div>' +

    '<div class="field-label">Task type</div>' +
    (editable
      ? '<div class="select-row">' + state.taskTypes.map(function (ty) {
          return '<div class="opt-pill' + (t.type === ty ? ' sel' : '') +
            '" onclick="saveField(\'type\', ' + jsStr(ty) + ')">' + esc(ty) + '</div>';
        }).join('') + '</div>'
      : '<div class="type-tag" style="display:inline-block;">' + esc(t.type || '—') + '</div>') +

    '<div class="field-label">Priority</div>' +
    (editable
      ? '<div class="select-row">' + state.priorities.map(function (p) {
          return '<div class="opt-pill prio-pill' + (t.priority === p.name ? ' sel' : '') +
            '" onclick="saveField(\'priority\', ' + jsStr(p.name) + ')">' +
            '<span class="prio-dot" style="background:' + esc(p.color) + ';"></span>' +
            esc(priorityLabel(p.name)) + '</div>';
        }).join('') + '</div>'
      : '<div class="prio-flag" style="color:' + esc(priorityColor(t.priority)) + ';">' +
        '<span class="prio-dot" style="background:' + esc(priorityColor(t.priority)) + ';"></span>' +
        esc(priorityLabel(t.priority)) + '</div>') +

    '<div class="field-label">' + esc(L('Overall due date (reference only)', 'Overall due date (sirf reference)')) + '</div>' +
    (editable
      ? '<input class="form-input" type="date" value="' + esc(t.reference_due_date || '') +
        '" onchange="saveField(\'reference_due_date\', this.value)">'
      : '<div class="opt-pill sel" style="display:inline-block;">' + esc(fmtDate(t.reference_due_date)) + '</div>') +

    '<div class="field-label">' + esc(L('Sub-tasks', 'Sub-tasks')) + ' (' + prog.done + '/' + prog.total + ' ' +
      esc(L('done', 'poora')) + ') — ' + esc(L('each has its own due date', 'har ek ki apni due date hai')) + '</div>' +
    (t.subtasks || []).map(function (s) { return subtaskRow(t, s); }).join('') +

    (manage ? addSubtaskForm(t) : '') +

    notesSection(t) +

    (isAdmin()
      ? '<button class="danger-btn" onclick="deleteTask()">' + esc('Delete task permanently') + '</button>'
      : '') +
    credit() +
  '</div></div>';
}

function backToBoard() {
  state.detail = null;
  go('home');
}

function subtaskRow(t, s) {
  var manage = canManage();
  var mine = isEmployee() && String(s.assignee) === String(state.currentUser.id);
  var dropdownOpen = ui.openTagDropdown === s.id;
  var badge = dueBadge(s.due_date, s.status);
  var canToggle = manage || mine;

  var html = '' +
  '<div class="subtask-item">' +
    '<div class="checkbox' + (s.status === 'Done' ? ' checked' : '') + '"' +
      (canToggle ? ' onclick="toggleSubtask(' + jsStr(s.id) + ', ' + jsStr(s.status) + ')"' : '') + '>' +
      (s.status === 'Done' ? '&#10003;' : '') + '</div>' +
    '<div class="subtask-text">' +
      '<div class="subtask-title' + (s.status === 'Done' ? ' done' : '') + '">' + esc(s.title) +
      '</div>' +

      '<div class="subtask-assignee"' + (manage ? ' onclick="toggleTagDropdown(' + jsStr(s.id) + ')"' : '') + '>' +
        '<div class="mini-avatar" style="margin:0; width:18px;height:18px;font-size:8px;">' +
          esc(s.assignee_initials || '?') + '</div>' +
        '<span>' + esc(s.assignee_name || L('Unassigned', 'Assign nahi hua')) + '</span>' +
        (manage ? '<span>&#9662;</span>' : '') +
      '</div>' +

      (dropdownOpen
        ? '<div class="tag-dropdown">' + state.team.map(function (u) {
            return '<div class="tag-opt" onclick="reassignSubtask(' + jsStr(s.id) + ', ' + jsStr(u.id) + ')">' +
              '<div class="mini-avatar" style="margin:0;width:18px;height:18px;font-size:8px;">' +
              esc(u.initials) + '</div>' + esc(u.name) + '</div>';
          }).join('') + '</div>'
        : '') +

      '<div class="row-actions">' +
        (manage
          ? '<input type="date" class="form-input" style="max-width:150px; padding:6px 8px; font-size:13px;" ' +
            'value="' + esc(s.due_date || '') + '" onchange="saveSubtaskDue(' + jsStr(s.id) + ', this.value)">'
          : '<span style="font-size:11.5px; color:var(--gray);">' + esc(L('Due', 'Due') + ' ' + fmtDate(s.due_date)) + '</span>') +
        '<span class="status-tag ' + (s.status === 'Done' ? 'done' : badge.cls) + '">' +
          esc(s.status === 'Done' ? L('Done', 'Poora hua') : badge.text) + '</span>' +
      '</div>' +

      '<div class="row-actions">' +
        '<button class="copy-btn" onclick="copySubtask(' + jsStr(s.id) + ')">&#128203; ' +
          esc(L('Copy', 'Copy')) + '</button>' +
      '</div>' +
    '</div>' +
    (manage ? '<div class="subtask-del" onclick="removeSubtask(' + jsStr(s.id) + ')">&#10005;</div>' : '') +
  '</div>';

  return html;
}

function addSubtaskForm(t) {
  return '' +
  '<div class="subtask-input-row" style="margin-top:14px;">' +
    '<input class="form-input" id="addSubTitle" placeholder="' +
      esc(L('Add a sub-task...', 'Naya sub-task add karein...')) + '">' +
  '</div>' +
  '<div class="subtask-input-row">' +
    '<select class="form-input" id="addSubAssignee" style="max-width:110px;">' +
      state.team.map(function (u) {
        return '<option value="' + esc(u.id) + '">' + esc(firstName(u.name)) + '</option>';
      }).join('') +
    '</select>' +
    '<input class="form-input" type="date" id="addSubDue" value="' + esc(t.reference_due_date || todayKey()) + '">' +
    '<button class="add-subtask-btn" onclick="addSubtask()">' + esc(L('+ Add', '+ Tag karein')) + '</button>' +
  '</div>';
}

/* --- notes --- */
function notesSection(t) {
  // Employees may only tag admins/supervisors — the server enforces this too.
  var options = isEmployee()
    ? state.team.filter(function (u) { return u.role === 'admin' || u.role === 'supervisor'; })
    : state.team;

  return '' +
  '<div class="field-label">Notes</div>' +
  (!(t.notes || []).length
    ? '<div style="font-size:12.5px; color:var(--gray); margin-bottom:8px;">' +
      esc(L('No notes yet.', 'Abhi koi note nahi hai.')) + '</div>'
    : t.notes.slice().reverse().map(function (n) {
        return '<div class="note-item">' +
          '<div class="note-head">' +
            '<span class="note-author">' + esc(n.author_name) + '</span>' +
            (n.tagged_id ? '<span class="note-tag">@' + esc(firstName(n.tagged_name)) + '</span>' : '') +
            '<span class="note-time">' + esc(fmtDateTime(n.created_at)) + '</span>' +
          '</div>' +
          '<div class="note-text">' + esc(n.text) + '</div>' +
        '</div>';
      }).join('')) +

  '<textarea class="form-input" id="noteText" placeholder="' +
    esc(L('Add a note...', 'Note likhein...')) + '" style="margin-top:10px;"></textarea>' +
  '<div class="subtask-input-row">' +
    '<select class="form-input" id="noteTag">' +
      '<option value="">' + esc(isEmployee()
        ? 'Admin ya supervisor ko tag karein (optional)'
        : L('Tag someone (optional)', 'Kisi ko tag karein (optional)')) + '</option>' +
      options.map(function (u) {
        return '<option value="' + esc(u.id) + '">' + esc(u.name) + ' (' + esc(u.role) + ')</option>';
      }).join('') +
    '</select>' +
    '<button class="add-subtask-btn" onclick="addNote()">' + esc(L('Post', 'Post karein')) + '</button>' +
  '</div>';
}

/* ============ DETAIL ACTIONS ============ */
function guard() {
  if (ui.busy) return false;
  ui.busy = true;
  return true;
}

function saveTitle(value) {
  if (!guard()) return;
  API.updateTask({ id: state.detail.id, title: value })
    .then(function () { showToast(L('Title updated', 'Title update ho gaya')); return reloadDetail(); })
    .catch(apiError);
}

function saveField(field, value) {
  if (!guard()) return;
  var payload = { id: state.detail.id };
  payload[field] = value;
  API.updateTask(payload).then(reloadDetail).catch(apiError);
}

function toggleSubtask(subId, currentStatus) {
  if (!guard()) return;
  API.updateSubtask({ id: subId, status: currentStatus === 'Done' ? 'Open' : 'Done' })
    .then(function (res) {
      if (res.task_status === 'Done') {
        showToast(L('All sub-tasks done — task marked complete. It will be permanently deleted in 2 days.',
                    'Sabhi sub-tasks poore — task complete. 2 din mein permanently delete ho jayega.'));
      }
      return reloadDetail();
    })
    .catch(apiError);
}

function saveSubtaskDue(subId, value) {
  if (!guard()) return;
  API.updateSubtask({ id: subId, due_date: value })
    .then(function () { showToast(L('Due date updated', 'Due date update ho gayi')); return reloadDetail(); })
    .catch(apiError);
}

function toggleTagDropdown(subId) {
  ui.openTagDropdown = (ui.openTagDropdown === subId) ? null : subId;
  render();
}

function reassignSubtask(subId, userId) {
  if (!guard()) return;
  ui.openTagDropdown = null;
  API.updateSubtask({ id: subId, assignee: userId })
    .then(function () {
      showToast(L('Sub-task tagged to ' + firstName(userName(userId)),
                  'Sub-task ' + firstName(userName(userId)) + ' ko tag ho gaya'));
      return reloadDetail();
    })
    .catch(apiError);
}

function addSubtask() {
  var title = val('addSubTitle');
  if (!title) return;
  if (!guard()) return;

  API.createSubtask({
    task_id: state.detail.id,
    title: title,
    assignee: val('addSubAssignee'),
    due_date: val('addSubDue')
  }).then(reloadDetail).catch(apiError);
}

function removeSubtask(subId) {
  if (!confirm(L('Delete this sub-task?', 'Yeh sub-task delete karein?'))) return;
  if (!guard()) return;
  API.deleteSubtask(subId).then(reloadDetail).catch(apiError);
}

function addNote() {
  var text = val('noteText');
  if (!text) return;
  if (!guard()) return;

  var tagged = val('noteTag');
  API.addNote({ task_id: state.detail.id, text: text, tagged_id: tagged })
    .then(function () {
      showToast(tagged
        ? L('Note posted and ' + firstName(userName(tagged)) + ' tagged',
            'Note post ho gaya aur ' + firstName(userName(tagged)) + ' ko tag kiya gaya')
        : L('Note posted', 'Note post ho gaya'));
      return reloadDetail();
    })
    .catch(apiError);
}

function deleteTask() {
  if (!confirm('Delete this task permanently? Its sub-tasks and notes go with it. This cannot be undone.')) return;
  if (!guard()) return;

  API.deleteTask(state.detail.id)
    .then(function () {
      showToast('Task deleted permanently');
      state.detail = null;
      route = 'home';
      renderLoading();
      return loadBoard(false);
    })
    .catch(apiError);
}

/* ============ COPY FOR WHATSAPP ============ */
/**
 * Manual share path. The app never sends anything itself — this puts a plain-text
 * summary on the clipboard for the user to paste into WhatsApp by hand.
 */
function copyTask() {
  var t = state.detail;
  var lines = [];

  lines.push('*' + t.title + '*');
  if (t.type) lines.push('Type: ' + t.type);
  if (t.priority) lines.push('Priority: ' + priorityLabel(t.priority));
  lines.push('Status: ' + t.status);
  if (t.reference_due_date) lines.push('Due (reference): ' + fmtDate(t.reference_due_date));
  lines.push('');
  lines.push('Sub-tasks:');

  (t.subtasks || []).forEach(function (s) {
    lines.push('- ' + s.title +
      ' — ' + (s.assignee_name || 'Unassigned') +
      ' — due ' + fmtDate(s.due_date) +
      ' — ' + s.status +
      (s.status !== 'Done' && daysUntil(s.due_date) < 0 ? ' (OVERDUE)' : ''));
  });

  copyToClipboard(lines.join('\n'));
}

function copySubtask(subId) {
  var t = state.detail;
  var s = null;
  (t.subtasks || []).forEach(function (x) { if (String(x.id) === String(subId)) s = x; });
  if (!s) return;

  var lines = [
    '*' + s.title + '*',
    'Task: ' + t.title,
    'Assigned to: ' + (s.assignee_name || 'Unassigned'),
    'Due: ' + fmtDate(s.due_date),
    'Priority: ' + priorityLabel(t.priority),
    'Status: ' + s.status
  ];
  if (s.status !== 'Done' && daysUntil(s.due_date) < 0) lines.push('*OVERDUE*');

  copyToClipboard(lines.join('\n'));
}

/**
 * navigator.clipboard needs HTTPS + a recent browser. GitHub Pages is HTTPS, but
 * older Android WebViews still lack it — hence the execCommand fallback.
 */
function copyToClipboard(text) {
  var done = function () {
    showToast(L('Copied — paste it into WhatsApp', 'Copy ho gaya — WhatsApp par paste kar dein'));
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
  } else {
    legacyCopy(text, done);
  }
}

function legacyCopy(text, done) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);

  try {
    ta.select();
    ta.setSelectionRange(0, ta.value.length);   // iOS needs the explicit range
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return done();
  } catch (e) {
    if (ta.parentNode) document.body.removeChild(ta);
  }

  showToast(L('Could not copy. Select the text and copy it manually.',
              'Copy nahi hua. Text select karke manually copy karein.'));
}

/* ============ CREATE TASK (Admin + Supervisor) ============ */
function openCreate() {
  ui.draftSubtasks = [];
  ui.newTaskType = state.taskTypes[0] || '';
  ui.newTaskPriority = (state.priorities[0] && state.priorities[0].name) || '';
  go('create');
}

function screenCreate() {
  return '' +
  '<div class="topbar">' +
    '<div class="back-btn" onclick="go(\'home\')">&#8592;</div>' +
    '<div class="title">' + esc(L('New task', 'Naya task')) + '</div>' +
  '</div>' +
  '<div class="screen"><div class="detail-body">' +
    '<div class="field-label">' + esc(L('Task title', 'Task ka title')) + '</div>' +
    '<input class="form-input" id="newTitle" placeholder="' +
      esc(L('e.g. Prepare September invoices', 'jaise: September ke invoices taiyar karein')) + '">' +

    '<div class="field-label">Task type</div>' +
    '<div class="select-row">' + state.taskTypes.map(function (ty) {
      return '<div class="opt-pill' + (ui.newTaskType === ty ? ' sel' : '') +
        '" onclick="setNewType(' + jsStr(ty) + ')">' + esc(ty) + '</div>';
    }).join('') + '</div>' +

    '<div class="field-label">Priority</div>' +
    '<div class="select-row">' + state.priorities.map(function (p) {
      return '<div class="opt-pill prio-pill' + (ui.newTaskPriority === p.name ? ' sel' : '') +
        '" onclick="setNewPriority(' + jsStr(p.name) + ')">' +
        '<span class="prio-dot" style="background:' + esc(p.color) + ';"></span>' +
        esc(priorityLabel(p.name)) + '</div>';
    }).join('') + '</div>' +

    '<div class="field-label">' + esc(L('Overall due date (reference only — each sub-task has its own)',
      'Overall due date (sirf reference ke liye — har sub-task ki apni due date hoti hai)')) + '</div>' +
    '<input class="form-input" type="date" id="newDue" value="' + esc(todayKey()) + '">' +

    '<div class="field-label">' + esc(L('Sub-tasks', 'Sub-tasks')) + '</div>' +
    ui.draftSubtasks.map(function (s, i) {
      return '<div class="draft-subtask"><span>' + esc(s.title) +
        ' <span style="color:var(--gray);">— ' + esc(firstName(userName(s.assignee))) +
        ' &middot; ' + esc(L('Due', 'Due') + ' ' + fmtDate(s.due_date)) + '</span></span>' +
        '<span class="subtask-del" onclick="removeDraftSubtask(' + i + ')">&#10005;</span></div>';
    }).join('') +

    '<div class="subtask-input-row" style="margin-top:8px;">' +
      '<input class="form-input" id="draftSubTitle" placeholder="' +
        esc(L('Sub-task title...', 'Sub-task ka naam...')) + '">' +
    '</div>' +
    '<div class="subtask-input-row">' +
      '<select class="form-input" id="draftSubAssignee" style="max-width:110px;">' +
        state.team.map(function (u) {
          return '<option value="' + esc(u.id) + '">' + esc(firstName(u.name)) + '</option>';
        }).join('') +
      '</select>' +
      '<input class="form-input" type="date" id="draftSubDue" value="' + esc(todayKey()) + '">' +
      '<button class="add-subtask-btn" onclick="addDraftSubtask()">' + esc(L('+ Add', '+ Tag karein')) + '</button>' +
    '</div>' +

    '<button class="btn-primary" id="createBtn" onclick="createTask()">' +
      esc(L('Create task', 'Task banayein')) + '</button>' +
    credit() +
  '</div></div>';
}

function setNewType(t) { ui.newTaskType = t; render(); }
function setNewPriority(p) { ui.newTaskPriority = p; render(); }

function addDraftSubtask() {
  var title = val('draftSubTitle');
  if (!title) {
    showToast(L('Add a sub-task title first', 'Pehle sub-task ka naam daalein'));
    return;
  }
  ui.draftSubtasks.push({
    title: title,
    assignee: val('draftSubAssignee'),
    due_date: val('draftSubDue')
  });
  render();
}

function removeDraftSubtask(i) { ui.draftSubtasks.splice(i, 1); render(); }

function createTask() {
  var title = val('newTitle');
  if (!title) { showToast(L('Add a task title first', 'Pehle task ka title daalein')); return; }
  if (!ui.draftSubtasks.length) {
    showToast(L('Add at least one sub-task', 'Kam se kam ek sub-task add karein'));
    return;
  }
  if (!guard()) return;

  var btn = document.getElementById('createBtn');
  if (btn) { btn.disabled = true; btn.textContent = L('Saving...', 'Save ho raha hai...'); }

  API.createTask({
    title: title,
    type: ui.newTaskType,
    priority: ui.newTaskPriority,
    reference_due_date: val('newDue'),
    subtasks: ui.draftSubtasks
  })
    .then(function () {
      showToast(L('Task created', 'Task ban gaya'));
      ui.draftSubtasks = [];
      route = 'home';
      renderLoading();
      return loadBoard(false);
    })
    .catch(apiError);
}

/* ============ PROFILE ============ */
function screenProfile() {
  var u = state.currentUser;
  return '' +
  '<div class="topbar">' +
    '<div class="back-btn" onclick="go(\'home\')">&#8592;</div>' +
    '<div class="title">Profile</div>' +
  '</div>' +
  '<div class="screen"><div class="detail-body">' +
    '<div style="display:flex; align-items:center; padding:10px 0 20px;">' +
      '<div class="avatar" style="width:50px;height:50px;font-size:17px; margin-right:12px;">' +
        esc(u.initials) + '</div>' +
      '<div><div style="font-family:\'Sora\',sans-serif; font-weight:700; font-size:15px;">' + esc(u.name) + '</div>' +
      '<div style="font-size:12.5px; color:var(--gray); text-transform:capitalize;">' +
        esc(u.role) + ' &middot; +91 ' + esc(u.phone) + '</div></div>' +
    '</div>' +

    '<div class="field-label">' + esc(L('What you can do', 'Aap kya kar sakte hain')) + '</div>' +
    '<div class="perm-note">' + esc(
      isAdmin()
        ? 'Full access: create and edit tasks, manage task types, priority levels, statuses, team members and PINs.'
        : isSupervisor()
          ? 'Tasks create kar sakte hain, status update kar sakte hain, notes add kar sakte hain, aur sub-tasks tag ya reassign kar sakte hain. Task fields (type, priority, title, due date) edit karna ya Settings manage karna sirf admin kar sakta hai.'
          : 'Aapko sirf apne assigned sub-tasks dikhte hain. Aap unka status update kar sakte hain, notes add kar sakte hain, aur apne admin ya supervisor ko tag kar sakte hain.'
    ) + '</div>' +

    '<div class="field-label">' + esc(L('Reminders', 'Reminders')) + '</div>' +
    '<div class="reminder-note">&#128276; ' + esc(
      canManage()
        ? L('The app shows a due-list when you open it — anything due in the next 2 days or already overdue. Nothing is sent by WhatsApp or SMS. To chase someone, use Copy and paste the details into WhatsApp yourself.',
            'App kholne par due-list dikhti hai — jo 2 din mein due hai ya pehle se overdue hai. WhatsApp ya SMS par kuch nahi jaata. Kisi ko yaad dilana ho to Copy karke khud WhatsApp par paste kar dein.')
        : 'App kholne par aapko apne due sub-tasks dikhte hain — jo 2 din mein due hain ya pehle se overdue hain. WhatsApp ya SMS par koi message nahi jaata.'
    ) + '</div>' +

    '<div class="field-label">' + esc(L('PIN', 'PIN')) + '</div>' +
    '<div class="perm-note">' + esc(
      isAdmin()
        ? 'You reset PINs from Settings → Team. There is no self-service reset for any role.'
        : 'PIN bhool jayein to Admin se reset karwana padega — khud reset karne ka option nahi hai.'
    ) + '</div>' +

    '<button class="danger-btn" onclick="logout()">' + esc(L('Log out', 'Logout karein')) + '</button>' +
    credit() +
  '</div></div>' +
  bottomNav('profile');
}

/* ============ SETTINGS (Admin only) ============ */
function openSettings() {
  ui.settingsTab = 'types';
  go('settings');
}

function setSTab(t) {
  ui.settingsTab = t;
  if (t === 'purge') loadPurgePreview();
  else render();
}

function screenSettings() {
  var tab = ui.settingsTab;
  var body = '';

  if (tab === 'types') body = settingsTypes();
  else if (tab === 'priorities') body = settingsPriorities();
  else if (tab === 'statuses') body = settingsStatuses();
  else if (tab === 'team') body = settingsTeam();
  else if (tab === 'purge') body = settingsPurge();

  return '' +
  '<div class="topbar">' +
    '<div class="back-btn" onclick="go(\'home\')">&#8592;</div>' +
    '<div class="title">Settings</div>' +
  '</div>' +
  '<div class="settings-tabs">' +
    stab('types', 'Types') + stab('priorities', 'Priority') + stab('statuses', 'Status') +
    stab('team', 'Team') + stab('purge', 'Deletions') +
  '</div>' +
  '<div class="screen"><div class="detail-body">' + body + credit() + '</div></div>' +
  bottomNav('settings');
}

function stab(key, label) {
  return '<div class="stab' + (ui.settingsTab === key ? ' active' : '') +
    '" onclick="setSTab(\'' + key + '\')">' + esc(label) + '</div>';
}

function settingsTypes() {
  return '' +
  '<div class="field-label">Task types — used when creating tasks</div>' +
  state.taskTypes.map(function (t) {
    return '<div class="list-mgmt-row"><div class="lbl">' + esc(t) + '</div>' +
      '<div class="rm-btn" onclick="removeMaster(\'taskTypes\', ' + jsStr(t) + ')">&#10005;</div></div>';
  }).join('') +
  '<div class="subtask-input-row">' +
    '<input class="form-input" id="newTypeInput" placeholder="Add a new task type...">' +
    '<button class="add-subtask-btn" onclick="addMaster(\'taskTypes\', \'newTypeInput\')">Add</button>' +
  '</div>';
}

function settingsPriorities() {
  var palette = ['#C1443A', '#C98A2E', '#1F4E79', '#3E8E5A', '#7C8592', '#8E44AD'];
  return '' +
  '<div class="field-label">Priority levels — shown as a flag on every task</div>' +
  '<div style="font-size:11.5px; color:var(--gray); margin:-2px 0 10px; line-height:1.45;">' +
    'Priority names always show in English for every role — Supervisor and Employee see the rest of the app in Hinglish, but not these. ' +
    'Higher rank = more urgent — this only controls the order they are listed in.</div>' +
  state.priorities.map(function (p) {
    return '<div class="list-mgmt-row">' +
      '<span class="swatch" style="background:' + esc(p.color) + ';"></span>' +
      '<div class="lbl">' + esc(p.name) + ' <span style="color:var(--gray); font-weight:400;">— rank ' + p.rank + '</span></div>' +
      '<div class="rm-btn" onclick="removeMaster(\'priorities\', ' + jsStr(p.name) + ')">&#10005;</div></div>';
  }).join('') +
  '<div class="field-label">Add new level</div>' +
  '<input class="form-input" id="newPrioInput" placeholder="e.g. Critical" style="margin-bottom:8px;">' +
  '<input class="form-input" id="newPrioRank" type="number" inputmode="numeric" placeholder="Rank (higher = more urgent)">' +
  '<div class="color-pick-row">' + palette.map(function (c, i) {
    return '<div class="color-pick' + (i === 0 ? ' sel' : '') + '" style="background:' + esc(c) +
      ';" onclick="pickPrioColor(this, ' + jsStr(c) + ')"></div>';
  }).join('') + '</div>' +
  '<button class="add-subtask-btn" style="margin-top:12px;" onclick="addPriority()">Add priority level</button>';
}

function pickPrioColor(el, c) {
  var all = document.querySelectorAll('.color-pick');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('sel');
  el.classList.add('sel');
  ui.pickedColor = c;
}

function addPriority() {
  var name = val('newPrioInput');
  if (!name) return;
  if (!guard()) return;

  API.masterAdd({ list: 'priorities', name: name, color: ui.pickedColor, rank: val('newPrioRank') })
    .then(function () { showToast('Priority level added'); return refreshMaster(); })
    .catch(apiError);
}

function settingsStatuses() {
  return '' +
  '<div class="field-label">Status options</div>' +
  '<div style="font-size:11.5px; color:var(--gray); margin:-2px 0 10px; line-height:1.45;">' +
    'Open, In Progress and Done drive the automatic status rollup and cannot be removed.</div>' +
  state.statuses.map(function (s) {
    var core = (s === 'Open' || s === 'In Progress' || s === 'Done');
    return '<div class="list-mgmt-row"><div class="lbl">' + esc(s) +
      (core ? ' <span style="color:var(--gray); font-weight:400;">— core</span>' : '') + '</div>' +
      (core ? '' : '<div class="rm-btn" onclick="removeMaster(\'statuses\', ' + jsStr(s) + ')">&#10005;</div>') +
      '</div>';
  }).join('') +
  '<div class="subtask-input-row">' +
    '<input class="form-input" id="newStatusInput" placeholder="Add a new status...">' +
    '<button class="add-subtask-btn" onclick="addMaster(\'statuses\', \'newStatusInput\')">Add</button>' +
  '</div>';
}

function settingsTeam() {
  return '' +
  '<div class="field-label">Team members &amp; PINs</div>' +
  state.team.map(function (u) {
    return '<div class="list-mgmt-row">' +
      '<div class="mini-avatar" style="margin:0;">' + esc(u.initials) + '</div>' +
      '<div class="lbl">' + esc(u.name) +
        ' <span style="color:var(--gray); font-weight:400; text-transform:capitalize;">— ' +
        esc(u.role) + ' &middot; PIN &bull;&bull;&bull;&bull;</span></div>' +
      '<div class="pin-reset" onclick="resetPin(' + jsStr(u.id) + ')">Reset PIN</div>' +
      (String(u.id) !== String(state.currentUser.id)
        ? '<div class="rm-btn" onclick="removeTeamMember(' + jsStr(u.id) + ')">&#10005;</div>' : '') +
    '</div>';
  }).join('') +

  '<div class="field-label">Add team member</div>' +
  '<input class="form-input" id="newMemberName" placeholder="Full name" style="margin-bottom:8px;">' +
  '<input class="form-input" id="newMemberPhone" inputmode="numeric" maxlength="10" placeholder="10-digit mobile number" style="margin-bottom:8px;">' +
  '<input class="form-input" id="newMemberPin" inputmode="numeric" maxlength="4" placeholder="4-digit PIN" style="margin-bottom:8px;">' +
  '<div class="select-row" id="newMemberRoleRow">' +
    ['employee', 'supervisor', 'admin'].map(function (r) {
      return '<div class="opt-pill' + (ui.pickedRole === r ? ' sel' : '') +
        '" onclick="pickRole(' + jsStr(r) + ')">' + esc(r.charAt(0).toUpperCase() + r.slice(1)) + '</div>';
    }).join('') +
  '</div>' +
  '<button class="add-subtask-btn" style="margin-top:12px;" onclick="addTeamMember()">Add member</button>';
}

function pickRole(r) { ui.pickedRole = r; render(); }

function addTeamMember() {
  var name = val('newMemberName');
  var phone = val('newMemberPhone');
  var pin = val('newMemberPin') || '1234';
  if (!name || !phone) { showToast('Name and phone number are required'); return; }
  if (!guard()) return;

  API.teamSave({ name: name, phone: phone, pin: pin, role: ui.pickedRole })
    .then(function () { showToast('Team member added — PIN ' + pin); return refreshTeam(); })
    .catch(apiError);
}

function removeTeamMember(id) {
  if (!confirm('Remove ' + userName(id) + ' from the team?')) return;
  if (!guard()) return;
  API.teamDelete(id).then(function () { showToast('Team member removed'); return refreshTeam(); }).catch(apiError);
}

function resetPin(id) {
  var pin = prompt('New 4-digit PIN for ' + userName(id) + ':', '1234');
  if (pin === null) return;
  if (!/^\d{4}$/.test(pin)) { showToast('PIN must be exactly 4 digits'); return; }
  if (!guard()) return;

  API.resetPin(id, pin)
    .then(function () { ui.busy = false; showToast('PIN reset to ' + pin); })
    .catch(apiError);
}

function settingsPurge() {
  var p = state.purge;
  if (!p) return '<div class="empty-state">Loading...</div>';

  return '' +
  '<div class="field-label">Tasks about to be permanently deleted</div>' +
  '<div class="purge-note">&#9888; Completed tasks are hard-deleted ' + p.cutoff_days +
    ' days after completion. This runs daily and cannot be undone — there is no archive.</div>' +
  (p.count === 0
    ? '<div class="empty-state">Nothing is due for deletion right now.</div>'
    : '<div style="margin-top:14px;">' + p.tasks.map(function (t) {
        return '<div class="list-mgmt-row"><div class="lbl">' + esc(t.title) +
          '<span style="color:var(--gray); font-weight:400; display:block; font-size:11.5px; margin-top:3px;">' +
          t.subtasks + ' sub-tasks &middot; ' + t.notes + ' notes &middot; completed ' +
          esc(fmtDateTime(t.completed_at)) + '</span></div></div>';
      }).join('') + '</div>');
}

function loadPurgePreview() {
  state.purge = null;
  render();
  API.purgePreview()
    .then(function (data) { state.purge = data; render(); })
    .catch(apiError);
}

/* ============ MASTER LIST ACTIONS ============ */
function addMaster(list, inputId) {
  var name = val(inputId);
  if (!name) return;
  if (!guard()) return;
  API.masterAdd({ list: list, name: name })
    .then(function () { showToast('Added'); return refreshMaster(); })
    .catch(apiError);
}

function removeMaster(list, name) {
  if (!confirm('Remove "' + name + '"?')) return;
  if (!guard()) return;
  API.masterRemove(list, name)
    .then(function () { showToast('Removed'); return refreshMaster(); })
    .catch(apiError);
}

function refreshMaster() {
  return API.master().then(function (data) {
    state.taskTypes = data.taskTypes || [];
    state.priorities = data.priorities || [];
    state.statuses = data.statuses && data.statuses.length ? data.statuses : state.statuses;
    ui.busy = false;
    render();
  }).catch(apiError);
}

function refreshTeam() {
  return API.team().then(function (data) {
    state.team = data.team || [];
    ui.busy = false;
    render();
  }).catch(apiError);
}

/** Safely embed a string as a JS literal inside an inline handler attribute. */
function jsStr(value) {
  return '&quot;' + String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\&quot;')
    .replace(/'/g, '\\&#39;')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\u003c') + '&quot;';
}

/* ============ INIT ============ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

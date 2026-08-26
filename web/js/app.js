/**
 * CYBR VIEW — bootstrap / enrutado (FASE 6 — acceso y seguridad).
 * Rutas (hash): #/login · #/dashboard (solo editor autenticado) · #/review/:token (cliente).
 * El cliente NO necesita cuenta; accede por un review token. El editor usa Firebase Auth.
 */
import { createPlayer } from './player.js';
import { createSession } from './session.js';
import { createComments } from './comments.js';
import { CONFIG } from './config.js';
import { configured } from './firebase.js';
import { signIn, signOut, onAuth } from './auth.js';
import { canTransition } from './status.js';

const setText = (sel, val) => {
  const el = document.querySelector(sel);
  if (el) el.textContent = val;
};

const $ = (id) => document.getElementById(id);

let player = null;
let session = null;
let comments = null;
let authState = null;

function isTyping(e) {
  return !!e.target.closest('input,textarea,select,button,[contenteditable]');
}

function wireKeys(comments) {
  document.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      comments.focusComposer();
    }
  });
}

function paintBackend(state) {
  const dot = document.querySelector('.status-dot');
  const label = document.querySelector('.status-label');
  const idx = document.querySelector('.status-idx');
  const modbar = $('modbar');
  if (!state) return;
  const isLocal = !configured;
  const online = configured && state.connected === true;
  dot.classList.toggle('is-online', online);
  dot.classList.toggle('is-degraded', configured && !online);
  dot.classList.toggle('is-local', isLocal);
  const envTag = CONFIG.env === 'dev' ? 'DEV' : 'PROD';
  label.textContent = online ? 'SYSTEM ONLINE' : (isLocal ? 'SYSTEM LIMIT' : 'SYSTEM OFFLINE');
  idx.textContent = isLocal ? `LOCAL // ${envTag}` : (online ? 'FIREBASE // ONLINE' : 'FIREBASE // OFFLINE');
  if (modbar) modbar.textContent = isLocal
    ? `STORAGE // LOCAL · ${envTag} · Firebase sin config (config/prod.js)`
    : (online ? `STORAGE // FIREBASE · ${envTag} · RTDB conectada` : `STORAGE // FIREBASE · ${envTag} · SIN CONEXIÓN`);
}

function wireBackend(session) {
  session.onConnection ? session.onConnection(paintBackend) : paintBackend({ backend: 'local' });
}

/* ---------- vistas ---------- */
function showView(name) {
  $('view-login').hidden = name !== 'login';
  $('view-dashboard').hidden = name !== 'dashboard';
  $('view-review').hidden = name !== 'review';
}

function applyMeta(project, version) {
  setText('[data-meta-project]', project?.name || '—');
  setText('[data-meta-version]', version?.name || '—');
  setText('[data-meta-status]', version?.status || '—');
  setText('[data-meta-fps]', version?.fps ?? 25);
  setText('[data-meta-file]', version?.videoUrl ? `SRC://${version.videoUrl.split('/').pop()}` : 'SRC://—');
  setText('#project-value', project?.name || '—');
  setText('#version-value', version?.name || '—');
  setText('#status-value', version?.status || '—');
  player.setSource(version?.videoUrl);

  // barra de aprobación (cliente): solo si la review está SENT_FOR_REVIEW
  const bar = $('approve-bar');
  if (bar) {
    const label = $('review-status-label');
    if (label) label.textContent = version?.status || '—';
    bar.hidden = !(version?.status === 'SENT_FOR_REVIEW');
  }
}

function reviewUrl(token) {
  return `${location.origin}${location.pathname}#/review/${token}`;
}

function showDenied(reason) {
  $('review-denied').hidden = false;
  $('denied-text').textContent = reason === 'revoked'
    ? '// este enlace de revisión fue REVOCADO por el editor'
    : '// este enlace de revisión no es válido';
  $('selector-stack').hidden = true;
  document.querySelector('#view-review .review-grid').style.display = 'none';
}

/* ---------- flujo cliente (review por token) ---------- */
async function openClientReview(token) {
  showView('review');
  const denied = $('review-denied');
  const grid = document.querySelector('#view-review .review-grid');
  grid.style.display = '';
  denied.hidden = true;
  $('selector-stack').hidden = true;

  if (!token) return showDenied('invalid');
  const res = await session.openReview(token);
  if (!res.ok) return showDenied(res.reason);

  applyMeta(res.project, res.version);
}

/* ---------- dashboard (editor) ---------- */
function commentCounts(v) {
  const cs = v.comments || [];
  const open = cs.filter((c) => c.status === 'open').length;
  const resolved = cs.filter((c) => c.status === 'resolved').length;
  return { total: cs.length, open, resolved };
}

function formatHM(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

function lastActivity(v) {
  const a = v.activity || [];
  return formatHM(a.length ? a[a.length - 1].at : v.updatedAt);
}

function transitionActions(v) {
  const map = {
    DRAFT: [{ to: 'SENT_FOR_REVIEW', label: 'PUBLISH' }, { to: 'ARCHIVED', label: 'ARCHIVE' }],
    SENT_FOR_REVIEW: [{ to: 'CHANGES_REQUESTED', label: 'REQUEST CHANGES' }, { to: 'APPROVED', label: 'APPROVE' }],
    CHANGES_REQUESTED: [{ to: 'SENT_FOR_REVIEW', label: 'REOPEN' }],
    APPROVED: [{ to: 'ARCHIVED', label: 'ARCHIVE' }],
    ARCHIVED: [],
  };
  return (map[v.status] || []).filter((t) => canTransition(v.status, t.to));
}

function renderDashboard() {
  const list = $('dashboard-list');
  list.innerHTML = '';
  session.getProjects().forEach((p) => {
    const head = document.createElement('div');
    head.className = 'dash-project';
    head.textContent = p.name;
    list.appendChild(head);

    (p.versions || []).forEach((v) => {
      const counts = commentCounts(v);
      const row = document.createElement('div');
      row.className = 'dash-row';
      row.innerHTML = [
        `<span class="dash-ver">${v.name}</span>`,
        `<span class="dash-status dash-rs">${v.status}</span>`,
        `<span class="dash-counts">OPEN // ${String(counts.open).padStart(2, '0')} · RESOLVED // ${String(counts.resolved).padStart(2, '0')}</span>`,
        `<span class="dash-last">LAST // ${lastActivity(v)}</span>`,
        transitionActions(v).map((t) => `<button class="btn btn-ghost" data-trans="${t.to}" data-version="${v.id}" type="button">${t.label}</button>`).join(''),
        `<button class="btn btn-ghost" data-open="${v.accessToken}" type="button">OPEN</button>`,
        `<button class="btn btn-ghost" data-copy="${v.accessToken}" type="button">COPY LINK</button>`,
        `<button class="btn ${v.accessStatus === 'active' ? 'btn-danger' : 'btn-ghost'}" data-toggle="${v.accessToken}" type="button">${v.accessStatus === 'active' ? 'REVOKE' : 'ACTIVATE'}</button>`,
      ].join('');
      list.appendChild(row);
    });
  });

  list.querySelectorAll('[data-trans]').forEach((b) => {
    b.addEventListener('click', () => {
      session.setReviewStatus(b.dataset.version, b.dataset.trans, 'Editor');
      renderDashboard();
    });
  });
  list.querySelectorAll('[data-open]').forEach((b) => {
    b.addEventListener('click', () => { location.hash = `#/review/${b.dataset.open}`; });
  });
  list.querySelectorAll('[data-copy]').forEach((b) => {
    b.addEventListener('click', () => {
      const url = reviewUrl(b.dataset.copy);
      if (navigator.clipboard) navigator.clipboard.writeText(url);
      else window.prompt('Copiar enlace de revisión:', url);
    });
  });
  list.querySelectorAll('[data-toggle]').forEach((b) => {
    b.addEventListener('click', () => {
      const found = session.resolveToken(b.dataset.toggle);
      const next = found?.version.accessStatus === 'active' ? 'revoked' : 'active';
      session.setAccessStatus(b.dataset.toggle, next);
      renderDashboard();
    });
  });
}

function wireApprove() {
  const btn = $('btn-approve');
  btn?.addEventListener('click', () => {
    if (!window.confirm('Approve this version?')) return;
    const res = session.approveActive('Client');
    if (res?.ok) {
      applyMeta(session.getProject(), session.getVersion());
    }
  });
}

/* ---------- login ---------- */
function wireLogin() {
  const form = $('login-form');
  const err = $('login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    try {
      await signIn(email, password);
      location.hash = '#/dashboard';
    } catch (e2) {
      err.hidden = false;
      err.textContent = `// SIGN IN FAILED ${(e2 && (e2.code || e2.message)) || ''}`;
    }
  });
}

function paintAuth(user) {
  const u = $('auth-user');
  const lo = $('btn-logout');
  if (u) u.textContent = user ? (user.email || 'EDITOR') : '';
  if (lo) lo.hidden = !user;
}

/* ---------- router ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/');
  return { seg: parts[0] || '', param: parts[1] || '' };
}

function route() {
  const { seg, param } = parseHash();

  if (seg === 'login') { showView('login'); return; }
  if (seg === 'dashboard') {
    if (!authState) { location.hash = '#/login'; return; }
    renderDashboard();
    showView('dashboard');
    return;
  }
  if (seg === 'review') { openClientReview(param); return; }

  location.hash = authState ? '#/dashboard' : '#/login';
}

function wireNav() {
  document.querySelector('[data-nav="dashboard"]')?.addEventListener('click', () => { location.hash = '#/dashboard'; });
}

/* ---------- boot ---------- */
player = createPlayer();
session = createSession();
comments = createComments({ store: session, player, canDelete: false });

wireBackend(session);
wireKeys(comments);
wireLogin();
wireNav();
wireApprove();
$('btn-logout')?.addEventListener('click', async () => {
  await signOut();
  location.hash = '#/login';
});

onAuth((user) => {
  authState = user;
  paintAuth(user);
  route();
});
window.addEventListener('hashchange', route);
route();

document.querySelector('[data-meta-root]')?.setAttribute('data-state', 'ready');

// ocultar overlay de carga tras el primer paint
requestAnimationFrame(() => {
  setTimeout(() => $('boot')?.classList.add('is-hidden'), 250);
});

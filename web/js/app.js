/**
 * CYBR VIEW — bootstrap / enrutado (FASE 6 — acceso y seguridad).
 * Rutas (hash): #/login · #/dashboard (solo editor autenticado) · #/review/:token (cliente).
 * El cliente NO necesita cuenta; accede por un review token. El editor usa Firebase Auth.
 */
import { createPlayer } from './player.js?v=20260827b';
import { createSession } from './session.js?v=20260827b';
import { createComments } from './comments.js?v=20260827b';
import { CONFIG } from './config.js?v=20260827b';
import { configured } from './firebase.js?v=20260827b';
import { signIn, signOut, onAuth } from './auth.js?v=20260827b';
import { canTransition } from './status.js?v=20260827b';
import { normalizeVideoUrl } from './data.js?v=20260827b';

const setText = (sel, val) => {
  const el = document.querySelector(sel);
  if (el) el.textContent = val;
};

const $ = (id) => document.getElementById(id);

let player = null;
let session = null;
let comments = null;
let authState = null;
let tokensSynced = false;
let currentReviewProjectId = null;

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
  player.setSource(normalizeVideoUrl(version?.videoUrl));

  // barra de aprobación (cliente): solo si la review está SENT_FOR_REVIEW
  const bar = $('approve-bar');
  if (bar) {
    const label = $('review-status-label');
    if (label) label.textContent = version?.status || '—';
    bar.hidden = !(version?.status === 'SENT_FOR_REVIEW');
  }

  // botón de descarga
  const dlBar = $('download-bar');
  const dlBtn = $('btn-download');
  if (dlBar && dlBtn) {
    const rawUrl = version?.videoUrl || '';
    const proxyUrl = normalizeVideoUrl(rawUrl);
    if (proxyUrl) {
      const safeName = `${project?.name || 'video'}_${version?.name || ''}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      dlBtn.href = '#';
      dlBtn.download = `${safeName}.mp4`;
      dlBtn.onclick = async (e) => {
        e.preventDefault();
        const prev = dlBtn.textContent;
        dlBtn.textContent = 'DESCARGANDO...';
        dlBtn.disabled = true;
        try {
          const res = await fetch(proxyUrl);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `${safeName}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch (err) {
          console.error('[CYBR] download failed', err);
          window.open(proxyUrl, '_blank');
        } finally {
          dlBtn.textContent = prev;
          dlBtn.disabled = false;
        }
      };
      dlBar.hidden = false;
    } else {
      dlBar.hidden = true;
    }
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
  console.error('[CYBR] review denied, reason:', reason, 'hash:', location.hash);
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

  currentReviewProjectId = res.project.id;
  const ra = $('review-actions');
  if (ra) ra.hidden = !authState;
  applyMeta(res.project, res.version);
}

/* ---------- eliminar proyecto desde la vista de review (editor) ---------- */
function wireReviewDelete() {
  const btn = $('btn-delete-project-review');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const pid = currentReviewProjectId;
    if (!pid || !session.deleteProject) return;
    const name = session.getProjects().find((p) => p.id === pid)?.name || 'este proyecto';
    if (!window.confirm(`¿Eliminar el proyecto "${name}"?\nSe borrarán sus versiones, enlaces de revisión y comentarios.`)) return;
    try {
      await session.deleteProject(pid);
      location.hash = '#/dashboard';
    } catch (e) {
      console.error('deleteProject failed', e);
      alert('// ERROR AL ELIMINAR\n' + (e?.message || e));
    }
  });
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

function wireNewProjectForm() {
  const btnNew = $('btn-new-project');
  const form = $('new-project-form');
  const btnCancel = $('cancel-project');
  const btnCreate = $('create-project');
  if (!btnNew || !form) return;

  btnNew.addEventListener('click', () => { form.hidden = false; btnNew.hidden = true; $('new-project-name')?.focus(); });
  btnCancel?.addEventListener('click', () => { form.hidden = true; btnNew.hidden = false; $('new-project-name').value = ''; $('new-project-client').value = ''; });
  btnCreate?.addEventListener('click', async () => {
    const name = $('new-project-name')?.value.trim();
    if (!name) return;
    const client = $('new-project-client')?.value.trim() || '';
    try {
      await session.addProject(name, client);
      form.hidden = true;
      btnNew.hidden = false;
      $('new-project-name').value = '';
      $('new-project-client').value = '';
    } catch (e) {
      console.error('addProject failed', e);
      alert('// ERROR CREATE PROJECT\n' + (e?.message || e));
    }
  });
}

function renderDashboard() {
  const list = $('dashboard-list');
  list.innerHTML = '';

  session.getProjects().forEach((p) => {
    const head = document.createElement('div');
    head.className = 'dash-project';
    head.innerHTML = [
      `<span class="dash-project-name">${p.name || '—'}</span>`,
      p.client ? `<span class="dash-project-client">${p.client}</span>` : '',
      `<button class="btn btn-sm" data-add-version="${p.id}" type="button">+ VERSION</button>`,
      `<button class="btn btn-sm btn-danger" data-delete-project="${p.id}" type="button">DELETE</button>`,
    ].join('');
    list.appendChild(head);

    (p.versions || []).forEach((v) => {
      const counts = commentCounts(v);
      const row = document.createElement('div');
      row.className = 'dash-row';
      row.innerHTML = [
        `<span class="dash-ver">${v.name || '—'}</span>`,
        `<span class="dash-status dash-rs">${v.status}</span>`,
        `<span class="dash-counts">OPEN // ${String(counts.open).padStart(2, '0')} · RESOLVED // ${String(counts.resolved).padStart(2, '0')}</span>`,
        `<span class="dash-last">LAST // ${lastActivity(v)}</span>`,
        transitionActions(v).map((t) => `<button class="btn btn-ghost" data-trans="${t.to}" data-version="${v.id}" type="button">${t.label}</button>`).join(''),
        `<button class="btn btn-ghost" data-open="${v.accessToken}" type="button">OPEN</button>`,
        `<button class="btn btn-ghost" data-copy="${v.accessToken}" type="button">COPY LINK</button>`,
      ].join('');
      list.appendChild(row);
    });

    const addVersionForm = document.createElement('div');
    addVersionForm.className = 'new-entity-form';
    addVersionForm.id = `add-version-form-${p.id}`;
    addVersionForm.hidden = true;
    addVersionForm.innerHTML = [
      `<span class="form-label">VERSION NAME //</span>`,
      `<input type="text" placeholder="V01" class="form-input ver-name" />`,
      `<span class="form-label">VIDEO URL //</span>`,
      `<input type="text" placeholder="https://drive.google.com/..." class="form-input ver-url" />`,
      `<span class="form-label">FPS //</span>`,
      `<input type="number" value="25" min="1" max="120" class="form-input ver-fps" />`,
      `<div class="form-actions">`,
      `<button class="btn btn-ghost ver-cancel" type="button">CANCEL</button>`,
      `<button class="btn btn-send ver-create" type="button">CREATE</button>`,
      `</div>`,
    ].join('');
    list.appendChild(addVersionForm);
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
    b.addEventListener('click', async () => {
      const url = reviewUrl(b.dataset.copy);
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          ok = true;
        }
      } catch { ok = false; }
      if (!ok) { window.prompt('Copiar enlace de revisión:', url); return; }
      const prev = b.textContent;
      b.textContent = 'COPIED';
      setTimeout(() => { b.textContent = prev; }, 1200);
    });
  });
  list.querySelectorAll('[data-add-version]').forEach((b) => {
    b.addEventListener('click', () => {
      const fid = `add-version-form-${b.dataset.addVersion}`;
      const form = $(fid);
      if (form) { form.hidden = !form.hidden; form.querySelector('.ver-name')?.focus(); }
    });
  });
  list.querySelectorAll('[data-delete-project]').forEach((b) => {
    b.addEventListener('click', async () => {
      const pid = b.dataset.deleteProject;
      const name = session.getProjects().find((p) => p.id === pid)?.name || 'este proyecto';
      if (!window.confirm(`¿Eliminar el proyecto "${name}"?\nSe borrarán sus versiones, enlaces de revisión y comentarios.`)) return;
      try {
        await session.deleteProject(pid);
        renderDashboard();
      } catch (e) {
        console.error('deleteProject failed', e);
        alert('// ERROR AL ELIMINAR\n' + (e?.message || e));
      }
    });
  });
  list.querySelectorAll('.ver-cancel').forEach((b) => {
    b.addEventListener('click', () => { b.closest('.new-entity-form').hidden = true; });
  });
  list.querySelectorAll('.ver-create').forEach((b) => {
    b.addEventListener('click', async () => {
      const form = b.closest('.new-entity-form');
      const projectId = form.id.replace('add-version-form-', '');
      const name = form.querySelector('.ver-name')?.value.trim();
      if (!name) return;
      const url = form.querySelector('.ver-url')?.value.trim() || '';
      const fps = parseInt(form.querySelector('.ver-fps')?.value, 10) || 25;
      try {
        const result = await session.addVersion(projectId, name, url, fps);
        if (result?.token) {
          const link = reviewUrl(result.token);
          if (navigator.clipboard) { navigator.clipboard.writeText(link).catch(() => {}); }
          alert(`Review link created and copied:\n${link}`);
        }
        form.hidden = true;
      } catch (e) {
        console.error('addVersion failed', e);
        alert('// ERROR ADD VERSION\n' + (e?.message || e));
      }
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
    if (!tokensSynced) { tokensSynced = true; session.syncAllTokens(); }
    try { renderDashboard(); } catch (e) { console.error('renderDashboard', e); }
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
wireNewProjectForm();
wireReviewDelete();
$('btn-logout')?.addEventListener('click', async () => {
  await signOut();
  location.hash = '#/login';
});

if (session.onProjects) {
  session.onProjects(() => {
    if (authState && location.hash.startsWith('#/dashboard')) renderDashboard();
  });
}

onAuth((user) => {
  authState = user;
  paintAuth(user);
  if (user && session.ensureSeed) session.ensureSeed();
  route();
});
window.addEventListener('hashchange', route);
route();

document.querySelector('[data-meta-root]')?.setAttribute('data-state', 'ready');

// ocultar overlay de carga tras el primer paint
requestAnimationFrame(() => {
  setTimeout(() => $('boot')?.classList.add('is-hidden'), 250);
});

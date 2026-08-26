/**
 * CYBR VIEW — bootstrap / enrutado (FASE 5.5 — MVP web estático).
 * Plataforma PROJECT → VERSION → COMMENTS.
 * Conecta reproductor, sesión (proyecto/versión activos) y panel de comentarios.
 * Comentarios: Firebase RTDB si está configurado; si no, localStorage (modo local/DEV).
 */
import { createPlayer } from './player.js';
import { createSession } from './session.js';
import { createComments } from './comments.js';
import { CONFIG } from './config.js';
import { configured } from './firebase.js';

const setText = (sel, val) => {
  const el = document.querySelector(sel);
  if (el) el.textContent = val;
};

function wireNav() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
}

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

function bindSelectors(session, player) {
  const projectSelect = document.getElementById('project-select');
  const chipsEl = document.getElementById('version-chips');

  function fillProjects() {
    projectSelect.innerHTML = '';
    session.getProjects().forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      projectSelect.appendChild(o);
    });
    const cur = session.getProject();
    if (cur) projectSelect.value = cur.id;
  }

  function fillChips() {
    const p = session.getProject();
    const cur = session.getVersion();
    chipsEl.innerHTML = '';
    (p?.versions || []).forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'version-chip' + (cur?.id === v.id ? ' is-active' : '');
      b.textContent = v.name;
      b.addEventListener('click', () => session.selectVersion(v.id));
      chipsEl.appendChild(b);
    });
  }

  function apply() {
    const proj = session.getProject();
    const ver = session.getVersion();
    setText('[data-meta-project]', proj?.name || '—');
    setText('[data-meta-version]', ver?.name || '—');
    setText('[data-meta-status]', ver?.status || '—');
    setText('[data-meta-fps]', ver?.fps ?? 25);
    setText('[data-meta-file]', ver?.videoUrl ? `SRC://${ver.videoUrl.split('/').pop()}` : 'SRC://—');
    setText('#project-value', proj?.name || '—');
    setText('#version-value', ver?.name || '—');
    setText('#status-value', ver?.status || '—');
    player.setSource(ver?.videoUrl);
    fillChips();
  }

  fillProjects();
  fillChips();
  projectSelect.addEventListener('change', () => session.selectProject(projectSelect.value));
  session.onSelect(apply);
  apply();
}

function paintBackend(state) {
  const dot = document.querySelector('.status-dot');
  const label = document.querySelector('.status-label');
  const idx = document.querySelector('.status-idx');
  const modbar = document.getElementById('modbar');
  if (!state) return;

  const isLocal = !configured;
  const online = configured && state.connected === true;

  dot.classList.toggle('is-online', online);
  dot.classList.toggle('is-degraded', configured && !online);
  dot.classList.toggle('is-local', isLocal);

  const envTag = CONFIG.env === 'dev' ? 'DEV' : 'PROD';
  label.textContent = online ? 'SYSTEM ONLINE' : (isLocal ? 'SYSTEM LIMIT' : 'SYSTEM OFFLINE');
  idx.textContent = isLocal ? `LOCAL // ${envTag}` : (online ? 'FIREBASE // ONLINE' : 'FIREBASE // OFFLINE');

  if (modbar) {
    modbar.textContent = isLocal
      ? `STORAGE // LOCAL · entorno ${envTag} · Firebase no configurado (config/prod.js) · reglas DE DESARROLLO`
      : (online
        ? `STORAGE // FIREBASE · entorno ${envTag} · Realtime Database conectada · reglas DE DESARROLLO`
        : `STORAGE // FIREBASE · entorno ${envTag} · SIN CONEXIÓN · reglas DE DESARROLLO`);
    modbar.classList.toggle('is-fb', !isLocal);
  }
}

function wireBackend(store) {
  store.onConnection ? store.onConnection(paintBackend) : paintBackend({ backend: 'local' });
}

async function main() {
  wireNav();
  const player = createPlayer();
  const session = createSession();
  const comments = createComments({ store: session, player });

  bindSelectors(session, player);
  wireBackend(session);
  wireKeys(comments);

  document.querySelector('[data-meta-root]')?.setAttribute('data-state', 'ready');
}

main();

import { formatCode } from './time.js?v=20261026';

export function createReviewComments({ store, player }) {
  const listEl = document.getElementById('comments-list');
  const empty = document.getElementById('comments-empty');
  const composer = document.getElementById('composer-text');
  const code = document.getElementById('composer-code');
  const send = document.getElementById('btn-send');
  const count = document.getElementById('comments-count');
  const counter = document.getElementById('comments-counter');
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'btn btn-ghost cancel-reply';
  cancel.textContent = 'Cancelar respuesta'; cancel.hidden = true;
  document.querySelector('.composer-foot').prepend(cancel);
  const feedback = document.createElement('p');
  feedback.className = 'comment-feedback'; feedback.setAttribute('role', 'status');
  document.querySelector('.composer').append(feedback);
  const filters = document.createElement('div');
  filters.className = 'comment-filters'; filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filtrar comentarios');
  document.querySelector('.comments-nav').after(filters);
  let filter = 'all', activeId = null, replyTo = null, capturedTime = null, pending = false;
  const button = (text, action, className = 'btn btn-ghost') => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = className; b.textContent = text; b.addEventListener('click', action); return b;
  };
  const all = button('Todos', () => { filter = 'all'; render(); });
  const open = button('Pendientes', () => { filter = 'open'; render(); });
  filters.append(all, open);

  function updateCode() { code.textContent = `${replyTo ? 'Respuesta en' : 'Comentario en'} ${formatCode(capturedTime ?? player.getTime())}`; }
  function capture() {
    player.pause();
    if (capturedTime === null || (!replyTo && !composer.value.trim())) capturedTime = player.getTime();
    updateCode();
  }
  function focusComposer() {
    capture(); composer.focus();
    document.querySelector('.composer').scrollIntoView({ block: 'center' });
  }
  function select(id, seek = true) {
    const c = store.find(id); if (!c) return;
    activeId = id; if (seek) player.seekTo(c.time); render();
  }
  function resetReply() {
    replyTo = null; cancel.hidden = true; composer.placeholder = '¿Qué cambiarías en este momento?';
    capturedTime = null; capture();
  }
  cancel.addEventListener('click', resetReply);
  async function submit() {
    const body = composer.value.trim(); if (!body || pending) return;
    const time = capturedTime ?? player.getTime();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = `c_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    const now = Date.now();
    pending = true; send.disabled = true; feedback.textContent = 'Guardando comentario…';
    try {
      await store.add({ id, authorName: 'INVITADO', authorRole: 'guest', body, time,
        timeCode: formatCode(time), status: 'open', createdAt: now, updatedAt: now,
        ...(replyTo ? { parentId: replyTo } : {}),
      });
      composer.value = ''; replyTo = null; cancel.hidden = true;
      composer.placeholder = '¿Qué cambiarías en este momento?'; capturedTime = null;
      filter = 'all'; select(id, false); capture();
      feedback.textContent = 'Comentario añadido a esta copia de prueba.';
    } catch {
      feedback.textContent = 'No pudimos guardar el comentario. Tu texto sigue aquí para reintentar.';
    } finally { pending = false; send.disabled = false; }
  }
  function renderComment(c, isReply) {
    const item = document.createElement('article');
    item.className = `comment-item${c.status === 'resolved' ? ' is-resolved' : ''}${c.id === activeId ? ' is-active' : ''}${isReply ? ' is-reply' : ''}`;
    item.dataset.id = c.id;
    const head = document.createElement('div'); head.className = 'comment-head';
    const time = button(`↗ ${c.timeCode || formatCode(c.time)}`, () => select(c.id), 'comment-code');
    time.setAttribute('aria-label', `Ir al comentario en ${c.timeCode || formatCode(c.time)}`);
    const state = document.createElement('span'); state.className = `comment-status s-${c.status}`;
    state.textContent = c.status === 'resolved' ? 'Resuelto' : 'Pendiente'; head.append(time, state);
    const text = document.createElement('p'); text.className = 'comment-text'; text.textContent = c.body;
    const meta = document.createElement('div'); meta.className = 'comment-meta';
    meta.textContent = `${isReply ? '↳ Respuesta · ' : ''}${c.authorName || 'Invitado'}`;
    const actions = document.createElement('div'); actions.className = 'comment-actions';
    actions.append(button('Responder', () => {
      replyTo = c.id; capturedTime = c.time; cancel.hidden = false;
      composer.placeholder = `Responder a ${c.authorName || 'Invitado'}`;
      feedback.textContent = ''; focusComposer();
    }), button(c.status === 'resolved' ? 'Reabrir' : '✓ Resolver', () => {
      store.setStatus(c.id, c.status === 'resolved' ? 'open' : 'resolved');
    }));
    item.append(head, text, meta, actions); return item;
  }
  function render() {
    const list = store.sortedByTime();
    const unresolved = list.filter((c) => c.status !== 'resolved').length;
    all.textContent = `Todos · ${list.length}`; open.textContent = `Pendientes · ${unresolved}`;
    all.setAttribute('aria-pressed', String(filter === 'all')); open.setAttribute('aria-pressed', String(filter === 'open'));
    count.textContent = String(list.length).padStart(2, '0');
    const ids = new Set(list.map((c) => c.id));
    const visited = new Set();
    const children = new Map();
    for (const c of list) {
      if (c.parentId && ids.has(c.parentId) && c.parentId !== c.id) {
        if (!children.has(c.parentId)) children.set(c.parentId, []);
        children.get(c.parentId).push(c);
      }
    }
    children.forEach((replies) => replies.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    function visible(c, path = new Set()) {
      if (filter === 'all' || c.status !== 'resolved') return true;
      if (path.has(c.id)) return false;
      const next = new Set(path); next.add(c.id);
      return (children.get(c.id) || []).some((reply) => visible(reply, next));
    }
    listEl.replaceChildren();
    function thread(c, reply = false) {
      if (visited.has(c.id)) return;
      visited.add(c.id);
      if (!visible(c)) return;
      listEl.append(renderComment(c, reply));
      (children.get(c.id) || []).forEach((child) => thread(child, true));
    }
    list.filter((c) => !c.parentId || !ids.has(c.parentId) || c.parentId === c.id).forEach((c) => thread(c));
    list.forEach((c) => thread(c)); // Conserva respuestas huérfanas y referencias circulares.
    empty.hidden = listEl.childElementCount > 0;
    empty.querySelector('.empty-code').textContent = filter === 'open' ? 'Todo al día' : 'Aún no hay comentarios';
    empty.querySelector('.empty-text').textContent = filter === 'open' ? 'No quedan observaciones pendientes.' : 'Pausa el video y deja la primera observación.';
    const index = list.findIndex((c) => c.id === activeId);
    counter.textContent = `${index < 0 ? '—' : index + 1} / ${list.length}`;
    player.setMarkers(list.map((c) => ({ id: c.id, time: c.time, timecode: c.timeCode, status: c.status })));
    player.setActiveMarker(activeId);
  }
  function navigate(dir) {
    const list = store.sortedByTime().filter((c) => filter === 'all' || c.status !== 'resolved');
    if (!list.length) return;
    let i = list.findIndex((c) => c.id === activeId);
    if (i < 0) i = dir > 0 ? -1 : list.length;
    select(list[Math.max(0, Math.min(list.length - 1, i + dir))].id);
  }
  composer.addEventListener('focus', capture);
  composer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
  });
  send.addEventListener('click', submit);
  document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
  document.getElementById('btn-next').addEventListener('click', () => navigate(1));
  player.onMarkerChange = (id) => select(id);
  // El estado del compositor pertenece a una revisión, no se arrastra al cambiar de versión.
  if (store.onSelect) {
    let version = null;
    store.onSelect(({ version: v }) => {
      const next = v?.accessToken || v?.id;
      if (next === version) return;
      version = next; replyTo = null; activeId = null; capturedTime = null;
      composer.value = ''; cancel.hidden = true; feedback.textContent = '';
      composer.placeholder = '¿Qué cambiarías en este momento?'; updateCode();
    });
  }
  store.subscribe(render); render(); updateCode();
  return { select, submit, focusComposer };
}

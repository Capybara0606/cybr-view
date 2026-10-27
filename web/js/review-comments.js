import { formatCode } from './time.js?v=20261026';

export function createReviewComments({ store, player }) {
  const listEl = document.getElementById('comments-list');
  const empty = document.getElementById('comments-empty');
  const composer = document.getElementById('composer-text');
  const code = document.getElementById('composer-code');
  const send = document.getElementById('btn-send');
  const count = document.getElementById('comments-count');
  const counter = document.getElementById('comments-counter');
  const button = (text, action, className = 'btn btn-ghost') => {
    const b = document.createElement('button'); b.type = 'button'; b.className = className;
    b.textContent = text; b.addEventListener('click', (e) => { e.stopPropagation(); action(); }); return b;
  };
  const cancel = button('Cancelar edición', () => finishEdit());
  cancel.classList.add('cancel-edit'); cancel.hidden = true;
  document.querySelector('.composer-foot').prepend(cancel);
  const feedback = document.createElement('p');
  feedback.className = 'comment-feedback'; feedback.setAttribute('role', 'status');
  document.querySelector('.composer').append(feedback);
  const filters = document.createElement('div');
  filters.className = 'comment-filters'; filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filtrar comentarios');
  document.querySelector('.comments-nav').after(filters);
  let filter = 'all', activeId = null, editingId = null, draft = null, capturedTime = null, pending = false;
  const all = button('Todos', () => { filter = 'all'; render(); });
  const open = button('Pendientes', () => { filter = 'open'; render(); });
  filters.append(all, open);

  function updateCode() { code.textContent = `${editingId ? 'Editar comentario en' : 'Comentario en'} ${formatCode(capturedTime ?? player.getTime())}`; }
  function capture() {
    player.pause();
    if (capturedTime === null || (!editingId && !composer.value.trim())) capturedTime = player.getTime();
    updateCode();
  }
  function focusComposer() {
    capture(); composer.focus(); document.querySelector('.composer').scrollIntoView({ block: 'center' });
  }
  function select(id, seek = true) {
    const c = store.find(id); if (!c) return;
    const focused = document.activeElement?.dataset.id === id;
    activeId = id; if (seek) player.seekTo(c.time); render();
    if (focused) Array.from(listEl.children).find((el) => el.dataset.id === id)?.focus({ preventScroll: true });
  }
  function finishEdit() {
    if (pending) return;
    editingId = null; cancel.hidden = true;
    composer.value = draft?.body || ''; capturedTime = draft?.time ?? null; draft = null;
    composer.placeholder = '¿Qué cambiarías en este momento?'; send.textContent = 'Enviar comentario'; updateCode();
  }
  function edit(c) {
    if (pending) return;
    if (!editingId) draft = { body: composer.value, time: capturedTime };
    editingId = c.id; capturedTime = c.time; composer.value = c.body; cancel.hidden = false;
    send.textContent = 'Guardar cambios'; feedback.textContent = ''; focusComposer();
  }
  async function remove(c) {
    if (pending || !window.confirm('¿Eliminar este comentario? Esta acción no se puede deshacer.')) return;
    pending = true;
    try {
      await store.remove(c.id);
      pending = false;
      if (editingId === c.id) finishEdit();
      if (activeId === c.id) activeId = null;
      feedback.textContent = 'Comentario eliminado de esta copia de prueba.'; render();
    } catch { feedback.textContent = 'No pudimos eliminar el comentario. Reintenta.'; }
    finally { pending = false; }
  }
  async function submit() {
    const body = composer.value.trim(); if (!body || pending) return;
    const time = capturedTime ?? player.getTime();
    const edited = editingId;
    const id = edited || `c_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    const now = Date.now();
    pending = true; send.disabled = true; cancel.disabled = true; feedback.textContent = 'Guardando comentario…';
    try {
      if (edited) await store.edit(id, body);
      else await store.add({ id, authorName: 'INVITADO', authorRole: 'guest', body, time,
        timeCode: formatCode(time), status: 'open', createdAt: now, updatedAt: now });
      pending = false;
      if (edited) finishEdit();
      else { composer.value = ''; capturedTime = null; }
      filter = 'all'; select(id, false); updateCode();
      feedback.textContent = edited ? 'Comentario actualizado. Se conserva su tiempo original.' : 'Comentario añadido a esta copia de prueba.';
    } catch { feedback.textContent = 'No pudimos guardar el comentario. Tu texto sigue aquí para reintentar.'; }
    finally { pending = false; send.disabled = false; cancel.disabled = false; }
  }
  function renderComment(c) {
    const item = document.createElement('article');
    item.className = `comment-item${c.status === 'resolved' ? ' is-resolved' : ''}${c.id === activeId ? ' is-active' : ''}`;
    item.dataset.id = c.id; item.tabIndex = 0;
    item.setAttribute('aria-label', `Comentario en ${c.timeCode || formatCode(c.time)}. Pulsa Enter para ir a ese momento.`);
    item.addEventListener('click', (e) => { if (!e.target.closest('button,input,textarea,a')) select(c.id); });
    item.addEventListener('keydown', (e) => {
      if (e.target === item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(c.id); }
    });
    const head = document.createElement('div'); head.className = 'comment-head';
    const time = document.createElement('span'); time.className = 'comment-code'; time.textContent = c.timeCode || formatCode(c.time);
    const state = document.createElement('span'); state.className = `comment-status s-${c.status}`;
    state.textContent = c.status === 'resolved' ? 'Resuelto' : 'Pendiente'; head.append(time, state);
    const text = document.createElement('p'); text.className = 'comment-text'; text.textContent = c.body;
    const meta = document.createElement('div'); meta.className = 'comment-meta'; meta.textContent = c.authorName || 'Invitado';
    const actions = document.createElement('div'); actions.className = 'comment-actions';
    actions.append(button(c.status === 'resolved' ? 'Reabrir' : '✓ Resolver', () => {
      if (!pending) store.setStatus(c.id, c.status === 'resolved' ? 'open' : 'resolved');
    }), button('Editar', () => edit(c)), button('Eliminar', () => remove(c), 'btn btn-ghost btn-danger'));
    item.append(head, text, meta, actions); return item;
  }
  function render() {
    const list = store.sortedByTime();
    const unresolved = list.filter((c) => c.status !== 'resolved').length;
    all.textContent = `Todos · ${list.length}`; open.textContent = `Pendientes · ${unresolved}`;
    all.setAttribute('aria-pressed', String(filter === 'all')); open.setAttribute('aria-pressed', String(filter === 'open'));
    count.textContent = String(list.length).padStart(2, '0');
    listEl.replaceChildren();
    // Las respuestas anteriores se conservan como comentarios; ya no se crean hilos nuevos.
    list.filter((c) => filter === 'all' || c.status !== 'resolved').forEach((c) => listEl.append(renderComment(c)));
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
  if (store.onSelect) {
    let version = null;
    store.onSelect(({ version: v }) => {
      const next = v?.accessToken || v?.id; if (next === version) return;
      version = next; editingId = null; draft = null; activeId = null; capturedTime = null;
      composer.value = ''; cancel.hidden = true; feedback.textContent = ''; send.textContent = 'Enviar comentario';
      composer.placeholder = '¿Qué cambiarías en este momento?'; updateCode();
    });
  }
  store.subscribe(render); render(); updateCode();
  return { select, submit, focusComposer };
}

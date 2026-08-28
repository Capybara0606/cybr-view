/**
 * CYBR VIEW — controlador de comentarios (FASE 2).
 * Composer (captura de timecode al enfocar), lista de registros, navegación,
 * resolución y sincronización de markers sobre el reproductor.
 * Todo en memoria (state.js). Firebase llega en la FASE 3.
 */
import { formatCode } from './time.js?v=20260827b';

const AUTHOR = 'GUEST';

export function createComments({ store, player, canDelete = false }) {
  const listEl = document.getElementById('comments-list');
  const emptyEl = document.getElementById('comments-empty');
  const counterEl = document.getElementById('comments-counter');
  const countEl = document.getElementById('comments-count');
  const composer = document.getElementById('composer-text');
  const composerCode = document.getElementById('composer-code');
  const btnSend = document.getElementById('btn-send');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  const nextId = () => `c_${crypto.randomUUID().slice(0, 8)}`;
  let capturedTime = null;
  let activeId = null;
  let replyTo = null;

  /* ---------- selección / seek ---------- */
  function select(id, seek = true) {
    const c = store.find(id);
    if (!c) return;
    activeId = id;
    if (seek) player.seekTo(c.time);
    render();
  }

  function activeIndex() {
    const list = store.sortedByTime();
    return list.findIndex((c) => c.id === activeId);
  }
  function navigate(dir) {
    const list = store.sortedByTime();
    if (!list.length) return;
    let idx = activeIndex();
    if (idx < 0) idx = dir > 0 ? -1 : 0;
    const next = Math.min(list.length - 1, Math.max(0, idx + dir));
    const target = list[next];
    activeId = target.id;
    player.seekTo(target.time);
    render();
  }

  /* ---------- composer (captura en focus) ---------- */
  function capture() {
    player.pause();
    capturedTime = player.getTime();
    composerCode.textContent = `[${formatCode(capturedTime)}]`;
    composerCode.classList.add('is-live');
  }
  function submit() {
    const body = composer.value.trim();
    if (!body) return;
    const time = capturedTime ?? player.getTime();
    const now = Date.now();
    const comment = {
      id: nextId(),
      authorName: AUTHOR,
      authorRole: 'guest',
      body,
      time,
      timeCode: formatCode(time),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    if (replyTo) comment.parentId = replyTo;
    store.add(comment);
    composer.value = '';
    replyTo = null;
    composer.placeholder = 'Escribe un comentario...';
    activated();
    composer.focus();
    capturedTime = player.getTime();
    composerCode.textContent = `[${formatCode(capturedTime)}]`;
    select(comment.id, false);
  }
  function activated() {
    capturedTime = player.getTime();
    composerCode.textContent = `[${formatCode(capturedTime)}]`;
  }
  function startReply(id) {
    replyTo = id;
    const parent = store.find(id);
    composer.placeholder = `Responder a ${parent?.authorName || '...'}`;
    composerCode.textContent = `[${formatCode(capturedTime ?? player.getTime())}] ↳ REPLY`;
    composer.focus();
  }

  /* ---------- render ---------- */
  function renderComment(c) {
    const item = document.createElement('div');
    item.className = 'comment-item'
      + (c.id === activeId ? ' is-active' : '')
      + (c.status === 'resolved' ? ' is-resolved' : '');
    item.setAttribute('data-id', c.id);
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Comentario en ${c.timeCode}. ${c.body}`);

    const head = document.createElement('div');
    head.className = 'comment-head';
    head.innerHTML = [
      `<span class="comment-code">${c.timeCode}</span>`,
      `<span class="comment-status s-${c.status}">STATUS // ${c.status.toUpperCase()}</span>`,
    ].join('');

    const meta = document.createElement('div');
    meta.className = 'comment-meta';
    meta.textContent = `USER // ${c.authorName}`;

    const text = document.createElement('div');
    text.className = 'comment-text';
    text.textContent = c.body;
    if (c.parentId) {
      const replyTag = document.createElement('div');
      replyTag.className = 'comment-reply-tag';
      replyTag.textContent = '↳ REPLY';
      text.after(replyTag);
    }

    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'btn btn-ghost';
    reply.textContent = '[ REPLY ]';
    reply.addEventListener('click', (e) => {
      e.stopPropagation();
      startReply(c.id);
    });
    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'btn btn-ghost';
    resolve.textContent = c.status === 'open' ? '[ RESOLVE ]' : '[ REOPEN ]';
    resolve.addEventListener('click', (e) => {
      e.stopPropagation();
      store.setStatus(c.id, c.status === 'open' ? 'resolved' : 'open');
    });
    actions.append(reply, resolve);

    if (canDelete) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-ghost btn-danger';
      del.textContent = '[ DELETE ]';
      del.setAttribute('aria-label', `Eliminar comentario en ${c.timeCode}`);
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.confirm(`Eliminar comentario en ${c.timeCode}?`)) store.remove(c.id);
      });
      actions.append(del);
    }

    item.append(head, meta, text, actions);
    item.addEventListener('click', () => select(c.id, true));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(c.id, true);
      }
    });
    return item;
  }

  function render() {
    const list = store.sortedByTime();
    listEl.innerHTML = '';
    list.forEach((c) => listEl.appendChild(renderComment(c)));
    emptyEl.hidden = list.length > 0;
    countEl.textContent = String(list.length).padStart(2, '0');

    const idx = activeIndex();
    if (idx < 0) {
      counterEl.textContent = `00 / ${String(list.length).padStart(2, '0')}`;
    } else {
      counterEl.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
    }

    const markers = list.map((c) => ({ id: c.id, time: c.time, timecode: c.timeCode, status: c.status }));
    player.setMarkers(markers);
    player.setActiveMarker(activeId);
  }

  /* ---------- eventos ---------- */
  composer.addEventListener('focus', capture);
  composer.addEventListener('input', activated);
  composer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  });
  btnSend.addEventListener('click', submit);
  btnPrev.addEventListener('click', () => navigate(-1));
  btnNext.addEventListener('click', () => navigate(1));

  player.onMarkerChange = (id) => select(id, true);
  store.subscribe(render);

  render();
  return { select, submit, focusComposer: () => composer.focus() };
}

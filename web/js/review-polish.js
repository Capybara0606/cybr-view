export function initReviewPolish({ player, session }) {
  const $ = (id) => document.getElementById(id);
  const brand = document.querySelector('.brand');
  brand.replaceChildren();
  const logo = document.createElement('img'); logo.src = 'assets/kiru-icon.svg'; logo.alt = ''; logo.className = 'kiru-header-logo';
  const identity = document.createElement('div'); identity.className = 'kiru-identity';
  const name = document.createElement('strong'); name.textContent = 'KIRU';
  const product = document.createElement('span'); product.textContent = 'CYBR VIEW / REVISIÓN DE VIDEO';
  const wordmark = document.createElement('div'); wordmark.className = 'kiru-wordmark';
  wordmark.append(logo, name); identity.append(wordmark, product); brand.append(identity);
  const badge = document.createElement('span'); badge.className = 'review-preview-tag'; badge.textContent = 'PROPUESTA /04';
  identity.append(badge);

  document.querySelector('.comments .panel-name').textContent = 'COMENTARIOS';
  document.querySelector('.composer-label').textContent = 'TU OBSERVACIÓN';
  document.querySelector('.block-title').textContent = 'VIDEO DE REVISIÓN';
  document.querySelector('[data-meta-root] .meta-label').textContent = 'PROYECTO';
  document.querySelectorAll('[data-meta-root] .meta-label')[1].textContent = 'VERSIÓN';
  $('btn-send').textContent = 'Enviar comentario';
  $('btn-prev').textContent = '← Anterior'; $('btn-next').textContent = 'Siguiente →';
  $('btn-frame-back').textContent = '← 1 frame'; $('btn-frame-fwd').textContent = '1 frame →';
  function icon(button, path, label) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const shape = document.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', path); shape.setAttribute('fill', 'currentColor'); svg.append(shape);
    button.replaceChildren(svg); button.setAttribute('aria-label', label); button.title = label;
  }
  icon($('btn-speed-down'), 'M11 5v14L2 12zm11 0v14l-9-7z', 'Reducir velocidad');
  icon($('btn-speed-up'), 'M2 5v14l9-7zm11 0v14l9-7z', 'Aumentar velocidad');
  $('btn-approve').textContent = '✓ Aprobar versión';
  $('btn-delete-project-review').textContent = 'Eliminar proyecto';
  const menu = document.createElement('details'); menu.className = 'review-manage';
  const summary = document.createElement('summary'); summary.textContent = '⋯ Gestionar';
  menu.append(summary, $('btn-delete-project-review')); $('review-actions').append(menu);
  $('btn-delete-project-review').addEventListener('click', () => { menu.open = false; });

  const state = document.createElement('div'); state.className = 'review-state';
  state.setAttribute('role', 'status');
  document.querySelector('.meta-grid').after(state);
  const labels = { DRAFT: 'Borrador', SENT_FOR_REVIEW: 'Pendiente de revisión',
    CHANGES_REQUESTED: 'Cambios solicitados', APPROVED: 'Versión aprobada', ARCHIVED: 'Archivado' };
  function paint({ version }) {
    const status = version?.status || 'DRAFT';
    state.dataset.status = status; state.textContent = labels[status] || 'En revisión';
    document.querySelector('.approve-label').textContent = '¿Todo listo para entregar?';
  }
  session.onSelect(paint); paint({ version: session.getVersion() });

  const syncPlay = () => icon($('btn-play'), player.video.paused ? 'M7 3v18l15-9z' : 'M5 3h5v18H5zm9 0h5v18h-5z', player.video.paused ? 'Reproducir' : 'Pausar');
  const syncMute = () => {
    $('btn-mute').textContent = player.video.muted ? 'UNMUTE' : 'MUTE';
    $('btn-mute').setAttribute('aria-label', player.video.muted ? 'Activar sonido' : 'Silenciar');
  };
  const syncFull = () => {
    const full = !!(document.fullscreenElement || document.webkitFullscreenElement || player.video.webkitDisplayingFullscreen);
    icon($('btn-fullscreen'), full ? 'M8 3h2v7H3V8h5zm6 0h2v5h5v2h-7zM3 14h7v7H8v-5H3zm11 0h7v2h-5v5h-2z' : 'M3 3h7v2H5v5H3zm11 0h7v7h-2V5h-5zM3 14h2v5h5v2H3zm16 0h2v7h-7v-2h5z', full ? 'Salir de pantalla completa' : 'Pantalla completa');
  };
  ['play', 'pause', 'ended'].forEach((event) => player.video.addEventListener(event, syncPlay));
  player.video.addEventListener('volumechange', syncMute);
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((event) => document.addEventListener(event, syncFull));
  ['webkitbeginfullscreen', 'webkitendfullscreen'].forEach((event) => player.video.addEventListener(event, syncFull));
  syncPlay(); syncMute(); syncFull();
}

export function initReviewPolish({ player, session }) {
  const $ = (id) => document.getElementById(id);
  const brand = document.querySelector('.brand');
  brand.replaceChildren();
  const logo = document.createElement('img'); logo.src = 'assets/kiru-icon.svg'; logo.alt = ''; logo.className = 'kiru-header-logo';
  const identity = document.createElement('div'); identity.className = 'kiru-identity';
  const name = document.createElement('strong'); name.textContent = 'KIRU';
  const product = document.createElement('span'); product.textContent = 'CYBR VIEW / REVISIÓN DE VIDEO';
  identity.append(name, product); brand.append(logo, identity);
  const badge = document.createElement('span'); badge.className = 'review-preview-tag'; badge.textContent = 'PROPUESTA /03';
  identity.append(badge);

  document.querySelector('.comments .panel-name').textContent = 'COMENTARIOS';
  document.querySelector('.composer-label').textContent = 'TU OBSERVACIÓN';
  document.querySelector('.block-title').textContent = 'VIDEO DE REVISIÓN';
  document.querySelector('[data-meta-root] .meta-label').textContent = 'PROYECTO';
  document.querySelectorAll('[data-meta-root] .meta-label')[1].textContent = 'VERSIÓN';
  $('btn-send').textContent = 'Enviar comentario';
  $('btn-prev').textContent = '← Anterior'; $('btn-next').textContent = 'Siguiente →';
  $('btn-frame-back').textContent = '← 1 frame'; $('btn-frame-fwd').textContent = '1 frame →';
  $('btn-speed-down').textContent = '− Velocidad'; $('btn-speed-up').textContent = '+ Velocidad';
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

  const syncPlay = () => { $('btn-play').textContent = player.video.paused ? '▶ Reproducir' : 'Ⅱ Pausar'; };
  const syncMute = () => { $('btn-mute').textContent = player.video.muted ? 'Activar' : 'Silenciar'; };
  const syncFull = () => {
    const full = !!(document.fullscreenElement || document.webkitFullscreenElement || player.video.webkitDisplayingFullscreen);
    $('btn-fullscreen').textContent = full ? '↙ Salir de pantalla completa' : '⛶ Pantalla completa';
  };
  ['play', 'pause', 'ended'].forEach((event) => player.video.addEventListener(event, syncPlay));
  player.video.addEventListener('volumechange', syncMute);
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((event) => document.addEventListener(event, syncFull));
  ['webkitbeginfullscreen', 'webkitendfullscreen'].forEach((event) => player.video.addEventListener(event, syncFull));
  syncPlay(); syncMute(); syncFull();
}

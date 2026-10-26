/** Propuesta local opt-in: ?mobile=1. No cambia el flujo predeterminado. */
export function initMobileProposal({ player, comments, session }) {
  if (new URLSearchParams(location.search).get('mobile') !== '1') return;
  document.body.classList.add('mobile-proposal');
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'css/mobile-proposal.css?v=20261026';
  document.head.appendChild(css);

  const badge = document.createElement('div');
  badge.className = 'mobile-proposal-badge';
  badge.textContent = 'PROPUESTA MÓVIL /01';
  document.querySelector('.brand').appendChild(badge);

  const controls = document.querySelector('.controls');
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'btn mobile-more';
  more.textContent = 'MÁS CONTROLES';
  more.setAttribute('aria-expanded', 'false');
  const advanced = ['.ctrl-frames', '.ctrl-speed', '.ctrl-volume'];
  more.setAttribute('aria-controls', advanced.map((selector, i) => {
    const group = controls.querySelector(selector);
    group.id = `mobile-control-${i}`;
    return group.id;
  }).join(' '));
  more.addEventListener('click', () => {
    const expanded = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(expanded));
    controls.classList.toggle('show-advanced', expanded);
    more.textContent = expanded ? 'MENOS CONTROLES' : 'MÁS CONTROLES';
  });
  controls.appendChild(more);

  const dock = document.createElement('nav');
  dock.className = 'mobile-review-dock';
  dock.setAttribute('aria-label', 'Acciones de revisión');
  const watch = document.createElement('button');
  watch.type = 'button';
  watch.className = 'btn btn-ghost';
  watch.textContent = '↑ VER VIDEO';
  watch.addEventListener('click', () => {
    document.querySelector('.player-block').scrollIntoView({ block: 'start' });
    document.getElementById('btn-play').focus({ preventScroll: true });
  });
  const comment = document.createElement('button');
  comment.type = 'button';
  comment.className = 'btn btn-send';
  comment.addEventListener('click', () => {
    player.pause();
    comments.focusComposer();
    document.querySelector('.composer').scrollIntoView({ block: 'center' });
  });
  session.subscribe(() => {
    comment.textContent = `COMENTAR · ${document.getElementById('comments-count').textContent}`;
  });
  dock.append(watch, comment);
  document.body.appendChild(dock);
}

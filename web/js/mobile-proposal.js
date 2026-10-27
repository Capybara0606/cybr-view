import { initReviewPolish } from './review-polish.js?v=20261026';

/** Propuesta local opt-in: ?mobile=1. No cambia el flujo predeterminado. */
export function initMobileProposal({ player, comments, session }) {
  if (new URLSearchParams(location.search).get('mobile') !== '1') return;
  document.body.classList.add('mobile-proposal');
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'css/mobile-proposal.css?v=20261026';
  document.head.appendChild(css);

  // Conserva los lugares originales al volver al layout de escritorio.
  const actions = document.createElement('div');
  actions.className = 'mobile-project-actions';
  const actionNodes = ['download-bar', 'review-actions'].map((id) => {
    const node = document.getElementById(id);
    const anchor = document.createComment(`original-${id}`);
    node.before(anchor);
    return { node, anchor };
  });
  document.querySelector('.review-main').appendChild(actions);
  const mobile = matchMedia('(max-width: 820px)');
  function placeActions() {
    actionNodes.forEach(({ node, anchor }) => {
      if (mobile.matches) actions.appendChild(node);
      else anchor.after(node);
    });
  }
  mobile.addEventListener('change', placeActions);
  placeActions();

  const controls = document.querySelector('.controls');
  for (const delta of [-5, 5]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn mobile-seek mobile-seek-${delta < 0 ? 'back' : 'forward'}`;
    button.textContent = delta < 0 ? '−5 S' : '+5 S';
    button.setAttribute('aria-label', delta < 0 ? 'Retroceder 5 segundos' : 'Adelantar 5 segundos');
    button.addEventListener('click', () => player.seekBy(delta));
    controls.appendChild(button);
  }
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
  initReviewPolish({ player, session });
}

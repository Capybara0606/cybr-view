/**
 * CYBR VIEW — reproductor de video (FASE 1).
 * Controla <video> con UI custom (play/pause, seek, frame, volumen, fullscreen)
 * y una timeline preparada para markers (FASE 3). Solo Vanilla JS.
 */
import { CONFIG } from './config.js?v=20261026';
import { formatTime, formatTimecode, formatCode } from './time.js?v=20261026';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const MAX_BLOB_BYTES = 160 * 1024 * 1024;

// iPhone/iPad (iPadOS se presenta como Mac con touch). Safari iOS no carga
// metadata hasta que el usuario toca play, y no soporta fullscreen en un <div>.
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// velocidades estilo YouTube (L sube · K baja)
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function createPlayer({ enhanced = false } = {}) {
  const video = document.getElementById('video');
  const player = document.getElementById('player');
  const fallback = document.getElementById('fallback');
  let retryButton = null;
  let playbackStatus = null;
  let seekInput = null;
  let seekPreview = null;
  if (enhanced) {
    retryButton = document.createElement('button');
    retryButton.type = 'button'; retryButton.className = 'btn btn-send video-retry';
    retryButton.textContent = 'Reintentar'; retryButton.hidden = true;
    retryButton.addEventListener('click', () => setSource(currentSource, true));
    fallback.appendChild(retryButton);
    playbackStatus = document.createElement('span'); playbackStatus.className = 'playback-status';
    playbackStatus.setAttribute('role', 'status');
    document.querySelector('.block-head').appendChild(playbackStatus);
    scrubSetup();
  }
  function scrubSetup() {
    const container = document.getElementById('scrubber');
    seekInput = document.createElement('input');
    seekInput.type = 'range'; seekInput.id = 'seek-range';
    seekInput.min = '0'; seekInput.max = '0'; seekInput.step = '0.01'; seekInput.value = '0'; seekInput.disabled = true;
    seekInput.setAttribute('aria-label', 'Posición del video');
    container.appendChild(seekInput);
    // El control nativo gestiona los gestos. Durante el arrastre solo se muestra la
    // posición elegida; se realiza el seek al soltar, sin cancelar lecturas sucesivas en Safari.
    seekInput.addEventListener('input', () => {
      dragging = true; seekPreview = Number(seekInput.value);
      container.classList.add('is-dragging');
      renderTime(); renderProgress(); showSeekTime(seekPreview);
    });
    function commit() {
      if (seekInput.disabled) return;
      const target = Number(seekInput.value);
      dragging = false; seekPreview = null; container.classList.remove('is-dragging');
      seekTo(target); renderTime(); renderProgress(); hideHover();
    }
    seekInput.addEventListener('change', commit);
    seekInput.addEventListener('pointerup', () => {
      requestAnimationFrame(() => { if (seekPreview !== null) commit(); });
    });
    seekInput.addEventListener('pointercancel', () => {
      dragging = false; seekPreview = null; container.classList.remove('is-dragging');
      renderTime(); renderProgress(); hideHover();
    });
    seekInput.addEventListener('keydown', (e) => {
      const positions = { ArrowLeft: video.currentTime - 5, ArrowRight: video.currentTime + 5, Home: 0, End: video.duration };
      if (!(e.key in positions)) return;
      e.preventDefault(); e.stopPropagation(); seekTo(positions[e.key]); renderTime(); renderProgress();
    });
  }
  function paintPlayback(text) { if (playbackStatus) playbackStatus.textContent = text; }

  const btnPlay = document.getElementById('btn-play');
  const btnFrameBack = document.getElementById('btn-frame-back');
  const btnFrameFwd = document.getElementById('btn-frame-fwd');
  const btnMute = document.getElementById('btn-mute');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnSpeedDown = document.getElementById('btn-speed-down');
  const btnSpeedUp = document.getElementById('btn-speed-up');
  const speedLabel = document.getElementById('speed-label');
  const volume = document.getElementById('volume');

  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');

  const scrubber = document.getElementById('scrubber');
  const scrubTrack = scrubber.querySelector('.scrubber-track');
  const scrubProgress = document.getElementById('scrubber-progress');
  const scrubBuffer = document.getElementById('scrubber-buffer');
  const scrubThumb = document.getElementById('scrubber-thumb');
  const scrubHover = document.getElementById('scrubber-hover');

  const timelineScale = document.getElementById('timeline-scale');
  const markerLane = document.getElementById('marker-lane');

  const fps = CONFIG.video.fps > 0 ? CONFIG.video.fps : 25;
  let markers = CONFIG.markers || [];
  let markersById = {};
  let activeMarkerId = null;
  let dragging = false;
  let onMarkerChange = null;

  /* ---------- fuente ---------- */
  function loadSource() {
    if (!CONFIG.video.url) return;
    video.src = CONFIG.video.url;
    if (CONFIG.video.poster) video.poster = CONFIG.video.poster;
  }

  function showFallback(code, text, retryable = false) {
    if (retryButton) retryButton.hidden = !retryable;
    fallback.hidden = false;
    if (code) fallback.querySelector('.fallback-code').textContent = code;
    if (text) fallback.querySelector('.fallback-text').textContent = text;
  }
  function hideFallback() {
    fallback.hidden = true;
  }

  /* ---------- play / pause ---------- */
  function togglePlay() {
    if (video.paused) playNow();
    else video.pause();
  }
  function syncPlayLabel() {
    btnPlay.textContent = video.paused ? 'PLAY' : 'PAUSE';
    btnPlay.setAttribute('aria-label', video.paused ? 'Reproducir' : 'Pausar');
    btnPlay.classList.toggle('is-on', !video.paused);
  }

  /* ---------- tiempo ---------- */
  function renderTime() {
    timeCurrent.textContent = formatTime(seekPreview ?? video.currentTime);
    timeTotal.textContent = formatTime(video.duration || 0);
    // indicador técnico fino (HH:MM:SS:FF)
    timeCurrent.title = formatTimecode(video.currentTime, fps);
  }

  function renderProgress() {
    const dur = video.duration || 0;
    if (seekInput) {
      const available = Number.isFinite(dur) && dur > 0;
      seekInput.disabled = !available; seekInput.max = String(available ? dur : 0);
      if (!dragging) seekInput.value = String(video.currentTime || 0);
      seekInput.setAttribute('aria-valuetext', formatTime(seekPreview ?? video.currentTime));
    }
    if (dur <= 0) return;
    const pct = clamp(((seekPreview ?? video.currentTime) / dur) * 100, 0, 100);
    scrubProgress.style.width = `${pct}%`;
    scrubThumb.style.left = `${pct}%`;
  }

  function renderBuffer() {
    const dur = video.duration || 0;
    const buf = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    if (dur > 0) scrubBuffer.style.width = `${clamp((buf / dur) * 100, 0, 100)}%`;
  }

  /* ---------- frames ---------- */
  function stepFrame(dir) {
    if (!Number.isFinite(video.currentTime)) return;
    video.currentTime = clamp(video.currentTime + dir / fps, 0, video.duration || 0);
  }
  function seekBy(delta) {
    if (!Number.isFinite(video.currentTime)) return;
    video.currentTime = clamp(video.currentTime + delta, 0, video.duration || 0);
  }

  /* ---------- API de control ---------- */
  function seekTo(t) {
    if (Number.isFinite(t)) video.currentTime = clamp(t, 0, video.duration || 0);
  }
  function pauseNow() {
    video.pause();
  }
  function playNow() {
    video.play().catch((error) => {
      if (!enhanced || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        paintPlayback('Toca Reproducir para iniciar');
      } else showFallback('LECTURA INTERRUMPIDA', 'No pudimos reproducir el video. Comprueba tu conexión y reintenta.', true);
    });
  }
  function getTime() {
    return video.currentTime;
  }
  let currentSource = '';
  let metaTimer = null;
  let sourceController = null;
  let blobUrl = null;

  async function blobFallback(url) {
    const controller = sourceController;
    try {
      const head = await fetch(url, { headers: { range: 'bytes=0-0' }, signal: controller.signal });
      if (!head.ok) return;
      const len = parseInt((head.headers.get('content-range') || '').split('/')[1] || '0', 10);
      await head.body?.cancel();
      if (!(len > 0) || len > MAX_BLOB_BYTES) return;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return;
      const blob = await response.blob();
      if (controller.signal.aborted || currentSource !== url) return;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
      video.src = blobUrl;
      video.load();
    } catch {
      /* mantiene el src actual */
    }
  }

  function watchForMetadata(url) {
    clearTimeout(metaTimer);
    // en iOS readyState sigue en 0 hasta el primer play: el timeout dispararía
    // siempre y bajaría el video entero a memoria (blob), que Safari no reproduce bien.
    if (IS_IOS) return;
    metaTimer = setTimeout(() => {
      if (video.readyState < 1) blobFallback(url);
    }, 6000);
  }

  function setSource(url, force = false) {
    if (!force && url && url === currentSource) return;
    clearTimeout(metaTimer);
    sourceController?.abort();
    sourceController = new AbortController();
    video.pause();
    dragging = false; seekPreview = null;
    if (seekInput) { seekInput.disabled = true; seekInput.value = '0'; }
    scrubber.classList.remove('is-dragging'); hideHover();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    currentSource = url || '';
    hideFallback();
    scrubProgress.style.width = '0%';
    scrubBuffer.style.width = '0%';
    scrubThumb.style.left = '0%';
    timelineScale.innerHTML = '';
    markerLane.querySelectorAll('.marker').forEach((el) => el.remove());
    if (!url) {
      video.removeAttribute('src');
      video.load();
      showFallback('SIN VIDEO', 'Esta versión no tiene un video disponible.');
      return;
    }
    paintPlayback('Cargando · toca Reproducir');
    video.src = url;
    video.load();
    watchForMetadata(url);
  }

  /* ---------- seek ---------- */
  function seekFromEvent(e) {
    const rect = scrubTrack.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    if (video.duration > 0) video.currentTime = ratio * video.duration;
  }
  function beginDrag(e) {
    dragging = true;
    scrubber.setPointerCapture?.(e.pointerId);
    scrubber.classList.add('is-dragging');
    seekFromEvent(e);
    if (enhanced) showHover(e);
  }
  function moveDrag(e) {
    if (dragging) { seekFromEvent(e); if (enhanced) showHover(e); }
    else showHover(e);
  }
  function endDrag(e) {
    dragging = false;
    scrubber.classList.remove('is-dragging');
    seekFromEvent(e);
    hideHover();
  }
  function showHover(e) {
    if (video.duration <= 0) return;
    const rect = scrubTrack.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    showSeekTime(ratio * video.duration);
  }
  function showSeekTime(time) {
    if (!(video.duration > 0)) return;
    const ratio = clamp(time / video.duration, 0, 1);
    scrubHover.style.left = enhanced ? `clamp(60px, ${ratio * 100}%, calc(100% - 60px))` : `${ratio * 100}%`;
    scrubHover.textContent = formatTime(time);
    scrubHover.hidden = false;
  }
  function hideHover() {
    scrubHover.hidden = true;
  }

  /* ---------- volumen ---------- */
  function syncVolumeUI() {
    video.volume = Number(volume.value);
    video.muted = Number(volume.value) === 0;
    btnMute.textContent = video.muted ? 'UNMUTE' : 'MUTE';
    btnMute.setAttribute('aria-pressed', String(video.muted));
  }
  function toggleMute() {
    volume.value = video.muted ? '1' : '0';
    syncVolumeUI();
  }

  /* ---------- velocidad ---------- */
  function setSpeed(rate) {
    // defaultPlaybackRate persiste la velocidad al cambiar de versión (setSource)
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
  }
  function stepSpeed(dir) {
    const rate = video.playbackRate;
    const next = dir > 0
      ? SPEEDS.find((s) => s > rate + 0.001)
      : [...SPEEDS].reverse().find((s) => s < rate - 0.001);
    if (next) setSpeed(next);
  }
  function syncSpeedUI() {
    const rate = video.playbackRate;
    speedLabel.textContent = `${rate.toFixed(2)}X`;
    speedLabel.classList.toggle('is-on', rate !== 1);
    btnSpeedDown.disabled = rate <= SPEEDS[0];
    btnSpeedUp.disabled = rate >= SPEEDS[SPEEDS.length - 1];
  }

  /* ---------- fullscreen ---------- */
  function toggleFullscreen() {
    const enter = player.requestFullscreen || player.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    const full = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      const result = full ? exit?.call(document)
        : enter ? enter.call(player) : video.webkitEnterFullscreen?.();
      result?.catch(() => paintPlayback('No se pudo abrir pantalla completa. Vuelve a intentarlo.'));
    } catch {
      paintPlayback('No se pudo abrir pantalla completa. Vuelve a intentarlo.');
    }
  }
  function syncFullscreenLabel() {
    const full = !!(document.fullscreenElement || document.webkitFullscreenElement || video.webkitDisplayingFullscreen);
    btnFullscreen.textContent = full ? 'EXIT' : 'FULLSCREEN';
    btnFullscreen.setAttribute('aria-pressed', String(full));
  }

  /* ---------- timeline scale ---------- */
  function buildScale() {
    const dur = video.duration || 0;
    if (dur <= 0) return;
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const step = steps.find((s) => dur / s <= 12) || 600;
    timelineScale.innerHTML = '';
    for (let t = 0; t <= dur; t += step) {
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.style.left = `${(t / dur) * 100}%`;
      const label = document.createElement('i');
      label.textContent = formatTime(t);
      tick.appendChild(label);
      timelineScale.appendChild(tick);
    }
  }

  /* ---------- markers ---------- */
  function renderMarkers(list) {
    markerLane.querySelectorAll('.marker').forEach((el) => el.remove());
    markersById = {};
    const dur = video.duration || 0;
    (list || []).forEach((m) => {
      if (dur <= 0) return;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'marker'
        + (m.status === 'resolved' ? ' is-resolved' : '')
        + (m.id === activeMarkerId ? ' is-active' : '');
      dot.style.left = `${clamp((m.time / dur) * 100, 0, 100)}%`;
      dot.title = `${m.timecode || formatCode(m.time)} // ${m.status || 'open'}`;
      dot.setAttribute('data-id', m.id);
      dot.setAttribute('aria-label', `Ir a ${m.timecode || formatCode(m.time)}`);
      dot.addEventListener('click', () => onMarkerChange?.(m.id));
      markersById[m.id] = dot;
      markerLane.appendChild(dot);
    });
    const hint = document.getElementById('marker-hint');
    if (hint) hint.textContent = `MARKERS // ${String(list?.length || 0).padStart(2, '0')}`;
  }
  function setMarkers(list) {
    markers = list;
    renderMarkers(markers);
  }
  function setActiveMarker(id) {
    activeMarkerId = id;
    Object.entries(markersById).forEach(([key, el]) => el.classList.toggle('is-active', key === id));
  }

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (e.target.closest('input,textarea,button,[contenteditable]')) return;
    switch (e.code) {
      case 'Space': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': seekBy(-1); break;
      case 'ArrowRight': seekBy(1); break;
      case 'KeyF': toggleFullscreen(); break;
      case 'KeyM': toggleMute(); break;
      case 'KeyL': stepSpeed(1); break;
      case 'KeyK': stepSpeed(-1); break;
    }
  }

  /* ---------- eventos de video ---------- */
  video.addEventListener('play', syncPlayLabel);
  video.addEventListener('pause', syncPlayLabel);
  video.addEventListener('timeupdate', () => { renderTime(); renderProgress(); });
  video.addEventListener('durationchange', () => { renderTime(); renderProgress(); buildScale(); renderMarkers(markers); });
  video.addEventListener('progress', renderBuffer);
  video.addEventListener('loadedmetadata', () => { hideFallback(); clearTimeout(metaTimer); renderProgress(); });
  video.addEventListener('canplay', () => { hideFallback(); paintPlayback(video.paused ? 'Listo para revisar' : 'Reproduciendo'); });
  video.addEventListener('playing', () => paintPlayback('Reproduciendo'));
  video.addEventListener('pause', () => paintPlayback('En pausa'));
  video.addEventListener('waiting', () => paintPlayback('Cargando video…'));
  video.addEventListener('stalled', () => paintPlayback('Esperando conexión…'));
  video.addEventListener('ended', () => paintPlayback('Fin del video'));
  video.addEventListener('error', () => {
    if (enhanced) {
      paintPlayback('Video no disponible');
      const codec = video.error?.code === 3 || video.error?.code === 4;
      showFallback(codec ? 'VIDEO NO DISPONIBLE' : 'CONEXIÓN INTERRUMPIDA',
        codec ? 'No pudimos leer este video. Reintenta o consulta al editor si el problema continúa.' : 'Comprueba tu conexión y vuelve a intentarlo.', true);
    } else showFallback('SRC OFFLINE', 'CHECK SOURCE // CORS OR CODEC');
  });
  video.addEventListener('volumechange', syncVolumeUI);
  video.addEventListener('ratechange', syncSpeedUI);

  document.addEventListener('fullscreenchange', syncFullscreenLabel);
  document.addEventListener('keydown', onKey);

  /* ---------- controles ---------- */
  btnPlay.addEventListener('click', togglePlay);
  btnFrameBack.addEventListener('click', () => stepFrame(-1));
  btnFrameFwd.addEventListener('click', () => stepFrame(1));
  btnMute.addEventListener('click', toggleMute);
  btnFullscreen.addEventListener('click', toggleFullscreen);
  btnSpeedDown.addEventListener('click', () => stepSpeed(-1));
  btnSpeedUp.addEventListener('click', () => stepSpeed(1));
  volume.addEventListener('input', syncVolumeUI);

  if (!enhanced) {
    scrubber.addEventListener('pointerdown', beginDrag);
    scrubber.addEventListener('pointermove', moveDrag);
    scrubber.addEventListener('pointerup', endDrag);
    scrubber.addEventListener('pointercancel', () => { dragging = false; scrubber.classList.remove('is-dragging'); hideHover(); });
    scrubber.addEventListener('pointerleave', hideHover);
    scrubTrack.addEventListener('click', seekFromEvent);
  }

  /* ---------- init ---------- */
  syncVolumeUI();
  syncPlayLabel();
  syncSpeedUI();
  renderTime();
  hideFallback();
  loadSource();

  return {
    video,
    setMarkers,
    setActiveMarker,
    set onMarkerChange(fn) { onMarkerChange = fn; },
    seekTo,
    seekBy,
    pause: pauseNow,
    play: playNow,
    getTime,
    setSource,
  };
}

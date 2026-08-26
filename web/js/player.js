/**
 * CYBR VIEW — reproductor de video (FASE 1).
 * Controla <video> con UI custom (play/pause, seek, frame, volumen, fullscreen)
 * y una timeline preparada para markers (FASE 3). Solo Vanilla JS.
 */
import { CONFIG } from './config.js';
import { formatTime, formatTimecode, formatCode } from './time.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function createPlayer() {
  const video = document.getElementById('video');
  const player = document.getElementById('player');
  const fallback = document.getElementById('fallback');

  const btnPlay = document.getElementById('btn-play');
  const btnFrameBack = document.getElementById('btn-frame-back');
  const btnFrameFwd = document.getElementById('btn-frame-fwd');
  const btnMute = document.getElementById('btn-mute');
  const btnFullscreen = document.getElementById('btn-fullscreen');
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

  function showFallback(code, text) {
    fallback.hidden = false;
    if (code) fallback.querySelector('.fallback-code').textContent = code;
    if (text) fallback.querySelector('.fallback-text').textContent = text;
  }
  function hideFallback() {
    fallback.hidden = true;
  }

  /* ---------- play / pause ---------- */
  function togglePlay() {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }
  function syncPlayLabel() {
    btnPlay.textContent = video.paused ? 'PLAY' : 'PAUSE';
    btnPlay.setAttribute('aria-label', video.paused ? 'Reproducir' : 'Pausar');
    btnPlay.classList.toggle('is-on', !video.paused);
  }

  /* ---------- tiempo ---------- */
  function renderTime() {
    timeCurrent.textContent = formatTime(video.currentTime);
    timeTotal.textContent = formatTime(video.duration || 0);
    // indicador técnico fino (HH:MM:SS:FF)
    timeCurrent.title = formatTimecode(video.currentTime, fps);
  }

  function renderProgress() {
    const dur = video.duration || 0;
    if (dur <= 0) return;
    const pct = clamp((video.currentTime / dur) * 100, 0, 100);
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
    video.play().catch(() => {});
  }
  function getTime() {
    return video.currentTime;
  }
  let currentSource = '';
  function setSource(url) {
    if (!url || url === currentSource) return;
    currentSource = url;
    video.src = url;
    video.load();
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
  }
  function moveDrag(e) {
    if (dragging) seekFromEvent(e);
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
    scrubHover.style.left = `${ratio * 100}%`;
    scrubHover.textContent = formatTime(ratio * video.duration);
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

  /* ---------- fullscreen ---------- */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (player.requestFullscreen || player.webkitRequestFullscreen).call(player);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
  }
  function syncFullscreenLabel() {
    const full = !!document.fullscreenElement;
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
    }
  }

  /* ---------- eventos de video ---------- */
  video.addEventListener('play', syncPlayLabel);
  video.addEventListener('pause', syncPlayLabel);
  video.addEventListener('timeupdate', () => { renderTime(); renderProgress(); });
  video.addEventListener('durationchange', () => { renderTime(); buildScale(); renderMarkers(markers); });
  video.addEventListener('progress', renderBuffer);
  video.addEventListener('loadedmetadata', hideFallback);
  video.addEventListener('canplay', hideFallback);
  video.addEventListener('error', () => showFallback('SRC OFFLINE', 'CHECK SOURCE // CORS OR CODEC'));
  video.addEventListener('volumechange', syncVolumeUI);

  document.addEventListener('fullscreenchange', syncFullscreenLabel);
  document.addEventListener('keydown', onKey);

  /* ---------- controles ---------- */
  btnPlay.addEventListener('click', togglePlay);
  btnFrameBack.addEventListener('click', () => stepFrame(-1));
  btnFrameFwd.addEventListener('click', () => stepFrame(1));
  btnMute.addEventListener('click', toggleMute);
  btnFullscreen.addEventListener('click', toggleFullscreen);
  volume.addEventListener('input', syncVolumeUI);

  scrubber.addEventListener('pointerdown', beginDrag);
  scrubber.addEventListener('pointermove', moveDrag);
  scrubber.addEventListener('pointerup', endDrag);
  scrubber.addEventListener('pointercancel', endDrag);
  scrubber.addEventListener('pointerleave', hideHover);

  scrubTrack.addEventListener('click', seekFromEvent);

  /* ---------- init ---------- */
  syncVolumeUI();
  syncPlayLabel();
  renderTime();
  hideFallback();
  loadSource();

  return {
    video,
    setMarkers,
    setActiveMarker,
    set onMarkerChange(fn) { onMarkerChange = fn; },
    seekTo,
    pause: pauseNow,
    play: playNow,
    getTime,
    setSource,
  };
}

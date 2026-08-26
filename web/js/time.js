/**
 * CYBR VIEW — utilidades de tiempo (FASE 1).
 * Regla (docs/TIMECODE.md): todo se calcula en SEGUNDOS (float interno).
 * El display es HH:MM:SS. Precisión decimal conservada internamente.
 */

const pad = (n, len = 2) => String(n).padStart(len, '0');

/** Convierte segundos (float) a 'HH:MM:SS'. */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Número de frame dentro del segundo actual (para FF en displays técnicos). */
export function frameWithinSecond(seconds, fps) {
  const safeFps = fps > 0 ? fps : 25;
  const frameIndex = Math.round(seconds * safeFps) % Math.round(safeFps);
  return frameIndex;
}

/** Timecode técnico 'HH:MM:SS:FF' (no-drop-frame). Solo display; no se opera con él. */
export function formatTimecode(seconds, fps) {
  const safeFps = fps > 0 ? fps : 25;
  const base = formatTime(seconds);
  return `${base}:${pad(frameWithinSecond(seconds, safeFps))}`;
}

/** Timecode de comentario 'MM:SS.CC' (p. ej. 00:34.27). Solo display. */
export function formatCode(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const cs = Math.min(99, Math.round((seconds % 1) * 100));
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

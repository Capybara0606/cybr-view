/**
 * CYBR VIEW — constantes compartidas (FASE 0).
 * Solo identidad, tokens y enums del dominio. No hay lógica de producto.
 * Se resuelve por copia a `web/` y `cep/` en build (ver AGENTS.md §6).
 */

export const BRAND = {
  PRODUCT: 'CYBR VIEW',
  COMPANY: 'KIRU',
  TAGLINE: 'VIDEO REVIEW // SYSTEM',
  VERSION: '0.6.0',
};

export const THEME = {
  bg: '#050505',
  surface: '#0A0A0A',
  border: '#262626',
  green: '#1DB954',
  text: '#F2F2F2',
  muted: '#8A8A8A',
  danger: '#FF3B30',
};

export const VIDEO_SOURCE = ['url', 'drive', 's3', 'b2', 'cloudflare_stream', 'mux', 'vimeo'];

/**
 * REGLA OFICIAL de tamaño máximo del proxy de revisión.
 * CYBR VIEW NUNCA debe considerar como video válido un archivo > 160 MB.
 */
export const MAX_VIDEO_SIZE_MB = 160;

/** Especificación oficial del proxy de revisión. El master queda fuera de CYBR VIEW. */
export const VIDEO_SPEC = {
  container: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  resolution: '1080p', // 720p aceptable; el master NO entra en CYBR VIEW
  maxSizeMB: MAX_VIDEO_SIZE_MB,
};

export const VERSION_STATUS = ['draft', 'review', 'approved', 'rejected'];

export const COMMENT_STATUS = ['open', 'resolved'];

/* FASE 7 — estados de revisión (máquina de estados) */
export const REVIEW_STATUS = ['DRAFT', 'SENT_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED'];

export const REVIEW_TRANSITIONS = {
  DRAFT: ['SENT_FOR_REVIEW', 'ARCHIVED'],
  SENT_FOR_REVIEW: ['CHANGES_REQUESTED', 'APPROVED'],
  CHANGES_REQUESTED: ['SENT_FOR_REVIEW'],
  APPROVED: ['ARCHIVED'],
  ARCHIVED: [],
};

export const ACTIVITY_TYPES = [
  'comment_created',
  'comment_resolved',
  'comment_reopened',
  'reply_created',
  'review_approved',
  'review_reopened',
];

export const ROLE = ['client', 'editor'];

export const TIMECODE_TYPE = ['NDF', 'DF'];

export const DB_ROOT = 'cybrview/v1';

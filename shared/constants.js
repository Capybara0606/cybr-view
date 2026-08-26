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

export const VERSION_STATUS = ['draft', 'review', 'approved', 'rejected'];

export const COMMENT_STATUS = ['open', 'resolved'];

export const ROLE = ['client', 'editor'];

export const TIMECODE_TYPE = ['NDF', 'DF'];

export const DB_ROOT = 'cybrview/v1';

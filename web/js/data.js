/**
 * CYBR VIEW — datos de catálogo (FASE 5.5).
 * PROYECTOS / VERSIONES (con su videoUrl) y comentarios locales (fallback).
 * En producción, los comentarios viven en Firebase RTDB; aquí queda el catálogo
 * y el fallback local. Los videos NO se guardan en el repo ni en Firebase:
 * videoUrl apunta a una fuente externa (configurada en config/).
 */
import { formatCode } from './time.js';
import { CONFIG } from './config.js';

const KEY = 'cybrview:projects:v4';
const now = () => Date.now();

/** Base del worker proxy de video (arregla CORS de Google Drive para playback inline). */
export const VIDEO_PROXY_BASE = 'https://cybr-view-proxy.j-anibal640-0.workers.dev';

/**
 * Convierte un enlace de Google Drive a la URL del worker proxy para que el
 * <video> reproduzca inline (Drive bloquea cross-origin por CORS/CORP).
 * Si no es un enlace de Drive, devuelve la URL tal cual.
 */
export function normalizeVideoUrl(url) {
  if (!url) return url;
  if (!/drive\.google\.com/i.test(url)) return url;
  let id = '';
  const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/) || url.match(/\/open\?id=([\w-]+)/);
  if (m) id = m[1];
  if (!id) return url;
  return `${VIDEO_PROXY_BASE}/${id}`;
}

export function commentSequence() {
  let n = 100;
  return () => `comment_${String(++n).padStart(3, '0')}`;
}

/** Token de review aleatorio (96 bits). No se usan IDs como seguridad. */
export function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function mkComment(id, time, body) {
  const t = now();
  return {
    id,
    authorName: 'GUEST',
    authorRole: 'guest',
    body,
    time,
    timeCode: formatCode(time),
    status: 'open',
    createdAt: t,
    updatedAt: t,
  };
}

function mkVersion(id, videoUrl, status, comments) {
  const t = now();
  return {
    id,
    name: id,
    videoUrl,
    fps: 25,
    status, // review status (DRAFT/SENT_FOR_REVIEW/CHANGES_REQUESTED/APPROVED/ARCHIVED)
    createdAt: t,
    updatedAt: t,
    comments,
    accessToken: generateToken(),
    accessStatus: 'active', // 'active' | 'revoked'
    approvedAt: null,
    approvedBy: null,
    activity: [], // activity log básico
  };
}

function seedDefault() {
  const v = CONFIG.demo;
  return [
    {
      id: 'proj_multimoney',
      name: 'MULTIMONEY',
      createdAt: now(),
      updatedAt: now(),
      versions: [
        mkVersion('V01', v.videoV01, 'SENT_FOR_REVIEW', [
          mkComment('c1', 5, 'Revisar el fundido de entrada.'),
          mkComment('c2', 12, 'El título aparece muy pronto.'),
          mkComment('c3', 34.27, 'El corte está demasiado rápido.'),
        ]),
        mkVersion('V02', v.videoV02, 'CHANGES_REQUESTED', [
          mkComment('c4', 3, 'Probar aquí el nuevo audio.'),
          mkComment('c5', 8, 'El gráfico de entrada se ve mejor.'),
        ]),
        mkVersion('V03', v.videoV03, 'DRAFT', []),
      ],
    },
    {
      id: 'proj_shorts',
      name: 'SHORTS',
      createdAt: now(),
      updatedAt: now(),
      versions: [
        mkVersion('V01', v.videoShorts, 'SENT_FOR_REVIEW', [
          mkComment('c6', 10, 'Ajustar el ritmo aquí.'),
        ]),
      ],
    },
  ];
}

export function defaultData() {
  return seedDefault();
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Reaplica las URLs de video (y fps) desde la config actual, ignorando la cache de localStorage. */
export function refreshVideoUrls(tree) {
  const def = defaultData();
  tree.forEach((p) => {
    const dp = def.find((d) => d.id === p.id);
    if (!dp) return;
    p.versions.forEach((v) => {
      const dv = dp.versions.find((d) => d.id === v.id);
      if (dv) {
        v.videoUrl = dv.videoUrl;
        v.fps = dv.fps;
      }
    });
  });
  return tree;
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* sin almacenamiento (quota / privado) */
  }
}

/** Busca una revisión por su token. Devuelve { project, version } o null. */
export function findByToken(tree, token) {
  if (!token) return null;
  for (const p of tree) {
    for (const v of p.versions || []) {
      if (v.accessToken === token) return { project: p, version: v };
    }
  }
  return null;
}

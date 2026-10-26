import prod from './config/prod.js';

// Solo lecturas; nunca inicializa el SDK ni reutiliza el token como acceso local.
export async function readReviewSnapshot(token) {
  if (!/^[a-f0-9]{48}$/i.test(token)) throw new Error('El enlace de revisión no es válido.');
  const base = `${prod.firebase.databaseURL}/cybrview/v1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  async function read(path) {
    const response = await fetch(`${base}/${path}.json`, {
      method: 'GET', signal: controller.signal, credentials: 'omit', cache: 'no-store',
    });
    if (!response.ok) throw new Error('No se pudo leer la revisión original.');
    return response.json();
  }
  try {
    const node = await read(`tokens/${token}`);
    if (!node || node.status !== 'active') throw new Error('La revisión no existe o su enlace fue revocado.');
    const video = new URL(node.videoUrl);
    if (!['https:', 'http:'].includes(video.protocol)) throw new Error('La revisión no tiene un video válido.');
    const raw = await read(`reviews/${token}/comments`);
    const comments = Object.entries(raw || {}).map(([id, c]) => ({
      id, body: String(c.body || ''), authorName: String(c.authorName || 'GUEST'),
      authorRole: 'guest', time: Number(c.time) || 0, timeCode: String(c.timeCode || ''),
      status: c.status === 'resolved' ? 'resolved' : 'open',
      createdAt: c.createdAt || Date.now(), updatedAt: c.updatedAt || Date.now(),
      ...(c.parentId ? { parentId: String(c.parentId) } : {}),
    }));
    return {
      name: String(node.projectName || 'Proyecto de prueba'),
      versionName: String(node.versionName || 'V01'), videoUrl: video.href,
      fps: Number(node.fps) > 0 ? Number(node.fps) : 25,
      status: node.reviewStatus || 'SENT_FOR_REVIEW', comments,
    };
  } finally { clearTimeout(timer); }
}

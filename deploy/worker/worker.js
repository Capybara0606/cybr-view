/**
 * CYBR VIEW — worker de video (FASE 13 · full-auto proxy).
 * Cloudflare Worker. Almacena proxies de revisión en R2 y los sirve con
 * Range + CORS + inline para el <video> del navegador.
 *
 * Endpoints:
 *   PUT  /upload?name=foo.mp4   -> recibe el MP4 (body raw), valida <=160MB,
 *                                   guarda en R2, devuelve { id, url }.
 *   GET  /:id                   -> sirve el archivo de R2 con Range/CORS.
 *
 * Fallback: si el id no existe en R2, proxea el id antiguo de Google Drive
 * (para no romper los videos ya configurados, ej. V01).
 *
 * COSTE: plan gratis de Cloudflare (Worker 100k req/día + R2 10GB y egress $0).
 *
 * IMPORTANTE (cambio de arquitectura): este worker es ahora un "servidor
 * intermedio de video". Esto SUPERSEDE la regla "sin servidor intermedio" de
 * AGENTS.md (ADR-017). Ver ADR-022. Google Drive bloquea el playback inline
 * (Cross-Origin-Resource-Policy: same-site) por eso se sirve por aquí.
 */

const MAX_VIDEO_SIZE_MB = 160;
const MAX_VIDEO_SIZE = MAX_VIDEO_SIZE_MB * 1024 * 1024;

const cors = () => ({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,PUT,POST,OPTIONS',
  'access-control-allow-headers': 'range,content-type,content-length',
  'access-control-max-age': '86400',
  'access-control-expose-headers': 'content-range,content-length,content-disposition',
});

const err = (msg, status = 400) => new Response(JSON.stringify({ error: msg }), {
  status,
  headers: { ...cors(), 'content-type': 'application/json' },
});

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { ...cors(), 'content-type': 'application/json' },
});

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path.startsWith('/upload')) return handleUpload(request, env, url);
    if (!['GET', 'HEAD'].includes(request.method)) return err('METHOD_NOT_ALLOWED', 405);
    const response = await handleServe(request, env);
    if (url.searchParams.has('download') && response.ok) {
      const name = (url.searchParams.get('download') || 'video.mp4')
        .replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
      response.headers.set('content-disposition', `attachment; filename="${name}"`);
    }
    return response;
  },
};

async function handleUpload(request, env, url) {
  if (!env.PROXIES_BUCKET) return err('STORAGE_NOT_ENABLED', 503);
  const name = url.searchParams.get('name') || 'proxy_' + Date.now();
  const ct = request.headers.get('content-type') || '';
  const size = Number(request.headers.get('content-length') || 0);

  if (ct && !ct.includes('video/mp4')) return err('NOT_MP4:' + ct, 415);
  if (size > MAX_VIDEO_SIZE) return err('TOO_LARGE:' + size, 413);

  const id = 'cybr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const opts = { contentType: 'video/mp4' };
  if (size > 0) opts.contentLength = size;

  await env.PROXIES_BUCKET.put(id, request.body, opts);

  const base = new URL(request.url).origin;
  return json({ ok: true, id, name, size, url: `${base}/${id}` });
}

async function handleServe(request, env) {
  const id = new URL(request.url).pathname.split('/').filter(Boolean)[0] || '';
  if (!id) return err('NOT_FOUND', 404);

  const rangeHeader = request.headers.get('range') || '';

  // Si NO hay binding R2 (p. ej. el usuario no quiere tarjeta), servimos solo
  // desde el proxy de Drive (igual que antes). No rompe nada.
  if (!env.PROXIES_BUCKET) return serveDrive(id, request.method, rangeHeader);

  const meta = await env.PROXIES_BUCKET.head(id);
  if (meta) {
    const headers = new Headers(cors());
    headers.set('content-type', meta.httpMetadata?.contentType || 'video/mp4');
    headers.set('accept-ranges', 'bytes');
    headers.set('content-disposition', 'inline');
    headers.set('cross-origin-resource-policy', 'cross-origin');
    headers.set('content-length', String(meta.size));
    if (meta.httpEtag) headers.set('etag', meta.httpEtag);
    // HEAD describe la representación completa; Range solo se aplica a GET.
    if (request.method === 'HEAD') return new Response(null, { headers });

    let range = null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (match && (match[1] || match[2])) {
      const start = match[1] ? Number(match[1]) : Math.max(0, meta.size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), meta.size - 1) : meta.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= meta.size) {
        headers.set('content-range', `bytes */${meta.size}`);
        headers.set('content-length', '0');
        return new Response(null, { status: 416, headers });
      }
      range = { offset: start, length: end - start + 1 };
    }
    const obj = await env.PROXIES_BUCKET.get(id, range ? { range } : {});
    if (!obj?.body) return err('NOT_FOUND', 404);
    if (range) {
      headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`);
      headers.set('content-length', String(range.length));
    }
    return new Response(obj.body, { status: range ? 206 : 200, headers });
  }

  // No está en R2: proxea el id tal cual de Google Drive (videos existentes).
  return serveDrive(id, request.method, rangeHeader);
}

async function serveDrive(id, method, rangeHeader) {
  let drive;
  try {
    drive = await fetch(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
      {
        method,
        redirect: 'follow',
        headers: { range: rangeHeader, 'user-agent': 'Mozilla/5.0' },
      },
    );
  } catch {
    return err('DRIVE_UNAVAILABLE', 502);
  }
  if (![200, 206].includes(drive.status)) {
    const response = err('DRIVE_ERROR:' + drive.status, drive.status === 416 ? 416 : 502);
    if (drive.status === 416 && drive.headers.has('content-range')) {
      response.headers.set('content-range', drive.headers.get('content-range'));
    }
    await drive.body?.cancel();
    return response;
  }
  const type = (drive.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['video/mp4', 'application/octet-stream'].includes(type)) {
    await drive.body?.cancel();
    return err('DRIVE_NOT_VIDEO', 502);
  }

  const headers = new Headers(cors());
  headers.set('content-type', 'video/mp4');
  headers.set('accept-ranges', 'bytes');
  headers.set('content-disposition', 'inline');
  headers.set('cross-origin-resource-policy', 'cross-origin');
  for (const h of ['content-range', 'content-length', 'last-modified', 'etag']) {
    const v = drive.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new Response(method === 'HEAD' ? null : drive.body, { status: drive.status, headers });
}

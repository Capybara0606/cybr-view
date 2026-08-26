/**
 * CYBR VIEW — proxy para servir video de Google Drive con Range + CORS + inline.
 * Cloudflare Worker.
 *
 * IMPORTANTE: Google (el servidor de descarga) añade cabeceras que BLOQUEAN el
 * video en otros sitios:
 *   - Cross-Origin-Resource-Policy: same-site   -> bloquea cross-site (ERR_BLOCKED_BY_RESPONSE)
 *   - Cross-Origin-Embedder-Policy / CSP sandbox / Set-Cookie
 * Aquí se construyen cabeceras LIMPIAS, copiando solo las necesarias para streaming.
 */
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,HEAD,OPTIONS',
          'access-control-allow-headers': 'range',
          'access-control-max-age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const id = url.pathname.split('/').filter(Boolean)[0] || '';

    const drive = await fetch(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
      {
        method: request.method,
        redirect: 'follow',
        headers: {
          range: request.headers.get('range') || '',
          'user-agent': 'Mozilla/5.0',
        },
      },
    );

    const headers = new Headers();
    headers.set('content-type', 'video/mp4');
    headers.set('accept-ranges', 'bytes');
    headers.set('access-control-allow-origin', '*');
    headers.set('content-disposition', 'inline');
    headers.set('cross-origin-resource-policy', 'cross-origin');

    for (const h of ['content-range', 'content-length', 'last-modified', 'etag']) {
      const v = drive.headers.get(h);
      if (v) headers.set(h, v);
    }

    if (drive.status === 200 || drive.status === 206) {
      return new Response(drive.body, { status: drive.status, headers });
    }
    return new Response('error', { status: 502 });
  },
};

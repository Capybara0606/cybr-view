/**
 * CYBR VIEW — proxy para servir video de Google Drive con Range + CORS + inline.
 * Cloudflare Worker. IMPORTANTE: elimina `Set-Cookie` de la respuesta de Drive;
 * si no, Chrome bloquea la respuesta cross-site con ERR_BLOCKED_BY_RESPONSE.NotSameSite.
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

    const headers = new Headers(drive.headers);
    headers.delete('set-cookie');
    headers.delete('set-cookie2');
    headers.set('access-control-allow-origin', '*');
    headers.set('accept-ranges', 'bytes');
    headers.set('content-type', 'video/mp4');
    headers.set('content-disposition', 'inline');

    if (drive.status === 200 || drive.status === 206) {
      return new Response(drive.body, { status: drive.status, headers });
    }
    return new Response('error', { status: 502 });
  },
};

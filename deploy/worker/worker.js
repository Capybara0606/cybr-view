/**
 * CYBR VIEW — proxy ligero para servir video de Google Drive con Range + CORS.
 * Ejecutar como Cloudflare Worker (plan gratuito). No toca el repo ni Firebase.
 *
 * Por qué: los renders grandes (>~100 MB) de Drive devuelven la pantalla
 * "no se puede analizar el archivo en busca de virus" (HTML) en vez del MP4,
 * y el enlace directo `uc?export=download` es inestable. Este Worker pide el
 * fichero a `drive.usercontent.google.com` (que ya depende por rango/CORS) y
 * normaliza cabeceras para que HTML5 <video> pueda reproducir y hacer seek.
 *
 * Despliegue:
 *   1. En workers.cloudflare.com crea un Worker.
 *   2. Pega este código (o `wrangler deploy`).
 *   3. Sube el video a Drive y comparte "Anyone with the link".
 *   4. Usa la URL  https://TU-WORKER.workers.dev/FILE_ID  como versión.videoUrl.
 *
 * Nota: la fiabilidad depende de Drive; suele necesitar `confirm=t` para evitar
 * el aviso de escaneo. Si falla, se recomienda alojar el proxy de revisión en
 * un bucket con Range+CORS (Backblaze B2 / R2 / S3). Ver DEPLOYMENT.md.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    // /PDF o de la forma /FILE_ID
    let id = url.pathname.split('/').filter(Boolean)[0] || '';

    const drive = await fetch(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
      {
        method: request.method,
        redirect: 'follow',
        headers: {
          'range': request.headers.get('range') || '',
          'user-agent': 'Mozilla/5.0',
        },
      },
    );

    const body = drive.body;
    const headers = new Headers(drive.headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('accept-ranges', 'bytes');
    headers.set('content-type', 'video/mp4');
    if (drive.status === 200 || drive.status === 206) {
      return new Response(body, { status: drive.status, headers });
    }
    return new Response('error', { status: 502 });
  },
};

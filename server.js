/**
 * CYBR VIEW — servidor de desarrollo local (sin dependencias).
 * Uso:  node server.js
 * Sirve la carpeta `web/` en  http://localhost:3000
 *
 * Con soporte de HTTP Range + streaming (necesario para servidores de video
 * y para el seek del <video> en archivos grandes).
 */
const http = require('http');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const webDir = path.join(__dirname, 'web');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

async function sendFile(req, res, file) {
  const stat = await fsp.stat(file);
  const total = stat.size;
  const mime = MIME[path.extname(file)] || 'application/octet-stream';
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= total) end = total - 1;
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': end - start + 1,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': total });
    fs.createReadStream(file).pipe(res);
  }
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(webDir, url === '/' ? 'index.html' : url);
  if (!file.startsWith(webDir)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  sendFile(req, res, file).catch(() => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  CYBR VIEW  //  http://localhost:${PORT}\n`);
});

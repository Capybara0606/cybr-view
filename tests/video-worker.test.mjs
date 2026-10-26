import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../deploy/worker/worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const bytes = new Uint8Array(100).map((_, i) => i);
const env = { PROXIES_BUCKET: {
  head: async () => ({ size: bytes.length, httpMetadata: { contentType: 'video/mp4' } }),
  get: async (_, { range } = {}) => ({ body: range ? bytes.slice(range.offset, range.offset + range.length) : bytes }),
} };
const request = (range, method = 'GET', query = '') => new Request(`https://video.test/id${query}`, {
  method, headers: range ? { Range: range } : {},
});
test('R2 full, bounded, open-ended, suffix and clamped responses match their body', async () => {
  for (const [range, status, expected, length] of [
    [null, 200, null, 100], ['bytes=0-1', 206, 'bytes 0-1/100', 2],
    ['bytes=90-', 206, 'bytes 90-99/100', 10], ['bytes=-5', 206, 'bytes 95-99/100', 5],
    ['bytes=95-200', 206, 'bytes 95-99/100', 5],
    ['bytes=-200', 206, 'bytes 0-99/100', 100],
  ]) {
    const r = await worker.fetch(request(range), env);
    assert.equal(r.status, status);
    assert.equal(r.headers.get('content-range'), expected);
    assert.equal(Number(r.headers.get('content-length')), length);
    assert.equal((await r.arrayBuffer()).byteLength, length);
  }
});
test('R2 unsatisfiable ranges return 416; malformed or multi-range requests are ignored', async () => {
  for (const range of ['bytes=100-', 'bytes=20-10', 'bytes=-0']) {
    const r = await worker.fetch(request(range), env);
    assert.equal(r.status, 416);
    assert.equal(r.headers.get('content-range'), 'bytes */100');
  }
  for (const range of ['invalid', 'bytes=0-1,4-5']) {
    assert.equal((await worker.fetch(request(range), env)).status, 200);
  }
});
test('HEAD has no body and download responses use a safe attachment filename', async () => {
  const head = await worker.fetch(request('bytes=0-1', 'HEAD'), env);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '100');
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const download = await worker.fetch(request(null, 'GET', '?download=Review_V01.mp4'), env);
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="Review_V01.mp4"');
  assert.equal((await download.arrayBuffer()).byteLength, 100);
});
test('Drive rejects HTML and network failures, forwards valid video and range errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html>confirmation</html>', { headers: { 'content-type': 'text/html' } });
    const html = await worker.fetch(request(null, 'GET', '?download=a.mp4'), {});
    assert.equal(html.status, 502);
    assert.equal(html.headers.get('content-disposition'), null);
    assert.match(await html.text(), /DRIVE_NOT_VIDEO/);
    globalThis.fetch = async () => { throw new Error('network'); };
    assert.equal((await worker.fetch(request(), {})).status, 502);
    globalThis.fetch = async () => new Response(null, { status: 416, headers: { 'content-range': 'bytes */100' } });
    const invalid = await worker.fetch(request('bytes=100-'), {});
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */100');
    globalThis.fetch = async () => new Response(bytes.slice(0, 2), { status: 206, headers: {
      'content-type': 'video/mp4', 'content-range': 'bytes 0-1/100', 'content-length': '2',
    } });
    const video = await worker.fetch(request('bytes=0-1'), {});
    assert.equal(video.status, 206);
    assert.equal(video.headers.get('content-range'), 'bytes 0-1/100');
    assert.equal((await video.arrayBuffer()).byteLength, 2);
  } finally { globalThis.fetch = original; }
});

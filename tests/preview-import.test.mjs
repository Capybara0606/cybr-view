import test from 'node:test';
import assert from 'node:assert/strict';
import { readReviewSnapshot } from '../web/js/preview-import.js';

test('review import only reads the selected review; rejects revoked or inaccessible data', async () => {
  const original = globalThis.fetch;
  const calls = [];
  const token = 'a'.repeat(48);
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return Response.json(url.includes('/tokens/') ? {
        status: 'active', projectName: 'Existing project', versionName: 'V02',
        videoUrl: 'https://video.test/file.mp4', fps: 25, reviewStatus: 'SENT_FOR_REVIEW',
      } : { c1: { body: 'Original comment', time: 3, timeCode: '00:03.00', status: 'open' } });
    };
    const snapshot = await readReviewSnapshot(token);
    assert.equal(snapshot.videoUrl, 'https://video.test/file.mp4');
    assert.equal(snapshot.comments[0].body, 'Original comment');
    assert.equal(snapshot.comments[0].id, 'c1');
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.options.method, 'GET');
      assert.equal(call.options.credentials, 'omit');
      assert.ok(call.url.includes(token));
    }
    await assert.rejects(readReviewSnapshot('../other'), /no es válido/);
    assert.equal(calls.length, 2);
    globalThis.fetch = async () => Response.json({ status: 'revoked' });
    await assert.rejects(readReviewSnapshot(token), /revocado/);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await assert.rejects(readReviewSnapshot(token), /No se pudo leer/);
  } finally { globalThis.fetch = original; }
});

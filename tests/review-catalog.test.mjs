import test from 'node:test';
import assert from 'node:assert/strict';
import { isShared, reviewTokenUpdates, sharedVersions } from '../web/js/review-catalog.js';

const version = (id, status = 'SENT_FOR_REVIEW', accessStatus = 'active') => ({
  id, name: id, accessToken: id.repeat(48), status, accessStatus, videoUrl: `https://video.test/${id}`, comments: [{ body: 'private' }],
});
test('backfills old links and includes only shared versions from the same project', () => {
  const a = version('a'), b = version('b'), draft = version('c', 'DRAFT'), revoked = version('d', 'APPROVED', 'revoked');
  const projects = [{ id: 'one', name: 'One', client: 'private client', versions: [a, b, draft, revoked] }, { id: 'two', name: 'Two', versions: [version('e')] }];
  const updates = reviewTokenUpdates(projects);
  const first = updates[`cybrview/v1/tokens/${a.accessToken}`];
  assert.deepEqual(Object.keys(first.versions), [a.accessToken, b.accessToken]);
  assert.deepEqual(first.versions, updates[`cybrview/v1/tokens/${b.accessToken}`].versions);
  assert.ok(!JSON.stringify(updates).includes('private'));
  assert.equal(updates[`cybrview/v1/tokens/${draft.accessToken}`].status, 'revoked');
  assert.equal(updates[`cybrview/v1/tokens/${revoked.accessToken}`].versions, undefined);
  assert.equal(updates[`cybrview/v1/tokens/${draft.accessToken}`].videoUrl, '');
  b.accessStatus = 'revoked';
  const revokedUpdates = reviewTokenUpdates(projects);
  assert.deepEqual(Object.keys(revokedUpdates[`cybrview/v1/tokens/${a.accessToken}`].versions), [a.accessToken]);
  assert.deepEqual(reviewTokenUpdates(projects), revokedUpdates, 'idempotent backfill');
});
test('legacy token without index remains usable; versions have stable ordering', () => {
  const node = { versionId: 'v1', versionName: 'V01' };
  assert.deepEqual(sharedVersions(node, 'old').map((v) => v.accessToken), ['old']);
  node.versions = { new: { versionId: 'v10', name: 'V10', createdAt: 3 }, old: { versionId: 'v1', name: 'V01', createdAt: 1 } };
  assert.deepEqual(sharedVersions(node, 'old').map((v) => v.accessToken), ['old', 'new']);
});
test('archiving an unshared draft never publishes it; previously shared archives remain available', () => {
  assert.equal(isShared(version('a', 'DRAFT')), false);
  assert.equal(isShared(version('a', 'ARCHIVED')), false);
  assert.equal(isShared({ ...version('a', 'ARCHIVED'), sharedAt: 1 }), true);
});

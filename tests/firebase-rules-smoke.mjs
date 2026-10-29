// Only an explicitly selected LOCAL Firebase Database emulator is accepted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reviewTokenUpdates } from '../web/js/review-catalog.js';
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.ok(/^127\.0\.0\.1:\d+$/.test(host || ''), 'Set FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000; never run against production');
const base = `http://${host}`;
const ns = 'demo-cybr-view';
const root = 'cybrview/v1';
async function request(path, method = 'GET', data, admin = false) {
  return fetch(`${base}/${path}.json?ns=${ns}`, { method, headers: {
    ...(admin ? { Authorization: 'Bearer owner' } : {}), 'Content-Type': 'application/json',
  }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'));
assert.equal((await request('.settings/rules', 'PUT', rules, true)).status, 200);
const versions = ['active', 'draft', 'revoked'].map((id) => ({
  id, name: id, accessToken: id, status: id === 'draft' ? 'DRAFT' : 'SENT_FOR_REVIEW', accessStatus: id === 'revoked' ? 'revoked' : 'active',
}));
assert.equal((await request('', 'PUT', {}, true)).status, 200);
const updates = reviewTokenUpdates([{ id: 'one', name: 'One', versions }]);
updates[`${root}/projects/one`] = { name: 'Private' };
assert.equal((await request('', 'PATCH', updates, true)).status, 200);
for (const path of [`${root}/projects`, `${root}/projects/one`, `${root}/tokens`, `${root}/reviews`, `${root}/tokens/draft`, `${root}/tokens/revoked`]) {
  assert.equal((await request(path)).status, 401, `guest cannot read ${path}`);
}
assert.equal((await request(`${root}/tokens/active`)).status, 200);
for (const token of ['active', 'draft', 'revoked', 'missing']) {
  const allowed = token === 'active' ? 200 : 401;
  assert.equal((await request(`${root}/reviews/${token}/comments`)).status, allowed);
  assert.equal((await request(`${root}/reviews/${token}/comments/c1`, 'PUT', { body: 'Test', time: 3 })).status, allowed);
  assert.equal((await request(`${root}/reviews/${token}/approval`, 'PUT', { approvedAt: 1 })).status, allowed);
  assert.equal((await request(`${root}/reviews/${token}`, 'PUT', { arbitrary: true })).status, 401, 'guest cannot overwrite an entire review');
  assert.equal((await request(`${root}/tokens/${token}`, 'PUT', { status: 'active' })).status, 401);
}
await request(`${root}/tokens/active/status`, 'PUT', 'revoked', true);
assert.equal((await request(`${root}/reviews/active/comments`)).status, 401);
assert.equal((await request(`${root}/reviews/active/comments/c2`, 'PUT', { body: 'After revoke' })).status, 401);
console.log('PASS: real emulator rules deny private catalogs, drafts, revoked tokens, token writes and root review writes; active comment/approval access works and revocation removes it');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMs, effectiveFolderId, decideCanvas, retryDelayMs, isPermanentSyncError, conflictCopyName } from '../syncDecide';

test('decideCanvas : toile absente localement → pull', () => {
  assert.equal(decideCanvas(undefined, 100, undefined), 'pull');
});
test('decideCanvas : identiques → skip', () => {
  assert.equal(decideCanvas(100, 100, 50), 'skip');
});
test('decideCanvas : seule la distante a bougé → pull', () => {
  assert.equal(decideCanvas(50, 100, 50), 'pull');
});
test('decideCanvas : seule la locale a bougé → skip (le push enverra)', () => {
  assert.equal(decideCanvas(100, 50, 50), 'skip');
});
test('decideCanvas : les deux ont bougé → la plus récente gagne', () => {
  assert.equal(decideCanvas(120, 100, 50), 'conflict-local');
  assert.equal(decideCanvas(100, 120, 50), 'conflict-remote');
});
test('decideCanvas : 1re connexion (pas de base) → conflit, plus récente gagne', () => {
  assert.equal(decideCanvas(10, 20, undefined), 'conflict-remote');
  assert.equal(decideCanvas(30, 20, undefined), 'conflict-local');
});
test('retryDelayMs : croissant et plafonné à 10 min', () => {
  assert.equal(retryDelayMs(0), 30_000);
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(20), 600_000);
});
test('isPermanentSyncError', () => {
  assert.equal(isPermanentSyncError('Failed to fetch'), false);
  assert.equal(isPermanentSyncError('Supabase non configuré'), true);
  assert.equal(isPermanentSyncError('permission denied for schema app_123creez'), true);
});
test('conflictCopyName', () => {
  assert.equal(conflictCopyName('Chat', 'locale', new Date(2026, 9, 5, 7, 3)), 'Chat (conflit locale 05/10 07:03)');
});

test('toMs : bigint ms, chaîne, ISO timestamptz', () => {
  assert.equal(toMs(1792266589110), 1792266589110);
  assert.equal(toMs('1792266589110'), 1792266589110);
  assert.equal(toMs('2026-10-29T17:00:00.000Z'), Date.UTC(2026, 9, 29, 17));
  assert.equal(toMs(null), 0);
  assert.equal(toMs('n/a'), 0);
});
test('effectiveFolderId : dossier orphelin → racine', () => {
  const ids = new Set(['folder-a']);
  assert.equal(effectiveFolderId('folder-a', ids), 'folder-a');
  assert.equal(effectiveFolderId('folder-1793292538161-8727', ids), null);
  assert.equal(effectiveFolderId(null, ids), null);
  assert.equal(effectiveFolderId(undefined, ids), null);
});

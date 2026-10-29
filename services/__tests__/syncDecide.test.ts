import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCanvas, retryDelayMs, isPermanentSyncError, conflictCopyName } from '../syncDecide';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ancestorIds, folderPath, canNestFolder, folderDropZone, reorderAround, remoteFolderWins } from '../folderTree';

const F = [
  { id: 'a', parentId: null },
  { id: 'b', parentId: 'a' },
  { id: 'c', parentId: 'b' },
  { id: 'd', parentId: null },
];

test('ancestorIds / folderPath', () => {
  assert.deepEqual(ancestorIds(F, 'c'), ['b', 'a']);
  assert.deepEqual(folderPath(F, 'c'), ['a', 'b', 'c']);
  assert.deepEqual(folderPath(F, 'zz'), []);
});
test('ancestorIds résiste à un cycle déjà présent', () => {
  const cyc = [{ id: 'x', parentId: 'y' }, { id: 'y', parentId: 'x' }];
  assert.deepEqual(ancestorIds(cyc, 'x'), ['y']);
});
test('canNestFolder : pas de cycle, pas soi-même', () => {
  assert.equal(canNestFolder(F, 'a', 'a'), false);
  assert.equal(canNestFolder(F, 'a', 'c'), false); // descendant
  assert.equal(canNestFolder(F, 'a', 'b'), false);
  assert.equal(canNestFolder(F, 'd', 'c'), true);
  assert.equal(canNestFolder(F, 'c', 'b'), false); // déjà dedans
  assert.equal(canNestFolder(F, 'c', 'd'), true);
  assert.equal(canNestFolder(F, 'c', null), true);
  assert.equal(canNestFolder(F, 'a', null), false); // déjà à la racine
  assert.equal(canNestFolder(F, 'a', 'inconnu'), false);
});
test('folderDropZone', () => {
  assert.equal(folderDropZone(105, 100, 100), 'before');
  assert.equal(folderDropZone(150, 100, 100), 'into');
  assert.equal(folderDropZone(190, 100, 100), 'after');
});
test('reorderAround', () => {
  assert.deepEqual(reorderAround(['a', 'b', 'c', 'd'], 'a', 'c', 'after'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(reorderAround(['a', 'b', 'c', 'd'], 'd', 'b', 'before'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(reorderAround(['a', 'b'], 'a', 'a', 'after'), ['a', 'b']);
});
test('remoteFolderWins', () => {
  assert.equal(remoteFolderWins(undefined, 5), true);
  assert.equal(remoteFolderWins(10, 5), false);
  assert.equal(remoteFolderWins(5, 5), false);
});

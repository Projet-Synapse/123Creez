import { test } from 'node:test';
import assert from 'node:assert/strict';
import { committedRename } from '../galleryRename';

test('committedRename : trim, refuse le vide', () => {
  assert.equal(committedRename('  Mon titre  '), 'Mon titre');
  assert.equal(committedRename('Toile'), 'Toile');
  assert.equal(committedRename(''), null);
  assert.equal(committedRename('   '), null);
  assert.equal(committedRename('\n\t'), null);
});

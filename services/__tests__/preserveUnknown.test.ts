import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preserveUnknownFields } from '../preserveUnknown';

const prev = {
  meta: { id: 'c', name: 'A', minVersion: '1.1.0', thumbnail: 'x' },
  layers: [
    { id: 'l1', name: 'L1', strokes: [], raster: { w: 10, h: 10, tiles: { '0,0': 'h' } }, images: [{ id: 'i' }] },
    { id: 'l2', name: 'L2', strokes: [] },
  ],
  activeLayerId: 'l1',
  groups: [{ id: 'g' }],
  futur: { a: 1 },
};

test('champs inconnus de la toile, de meta et des calques conservés', () => {
  const next = { meta: { id: 'c', name: 'B' }, layers: [{ id: 'l1', name: 'L1', strokes: [{ id: 's' }] }, { id: 'l2', name: 'L2', strokes: [] }], activeLayerId: 'l2' };
  const out = preserveUnknownFields(next, prev) as typeof prev;
  assert.deepEqual(out.futur, { a: 1 });
  assert.equal(out.meta.minVersion, '1.1.0');
  assert.equal(out.meta.name, 'B');
  assert.deepEqual(out.layers[0].raster, prev.layers[0].raster);
  assert.equal(out.activeLayerId, 'l2');
});

test('un champ connu retiré volontairement ne revient pas', () => {
  const next = { meta: { id: 'c', name: 'A' }, layers: [{ id: 'l1', name: 'L1', strokes: [] }], activeLayerId: 'l1' };
  const out = preserveUnknownFields(next, prev) as any;
  assert.equal(out.layers[0].images, undefined);
  assert.equal(out.groups, undefined);
  assert.equal(out.meta.thumbnail, undefined);
});

test('calque supprimé : ses champs ne reviennent pas', () => {
  const next = { meta: { id: 'c' }, layers: [{ id: 'l2', strokes: [] }], activeLayerId: 'l2' };
  const out = preserveUnknownFields(next, prev) as any;
  assert.equal(out.layers.length, 1);
  assert.equal(out.layers[0].raster, undefined);
});

test('la nouvelle valeur d\'un champ inconnu l\'emporte', () => {
  const next = { meta: { id: 'c' }, layers: [{ id: 'l1', strokes: [], raster: { w: 1 } }], activeLayerId: 'l1', futur: 2 };
  const out = preserveUnknownFields(next, prev) as any;
  assert.deepEqual(out.layers[0].raster, { w: 1 });
  assert.equal(out.futur, 2);
});

test('rien de stocké : inchangé', () => {
  const next = { meta: { id: 'c' }, layers: [], activeLayerId: '' };
  assert.equal(preserveUnknownFields(next, null), next);
});

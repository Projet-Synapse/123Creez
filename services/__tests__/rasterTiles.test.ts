import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, createRasterLayer, parseColor, stampDab, stampSegment, samplePixel,
  captureTiles, applyPatch, pruneEmptyTiles,
} from '../rasterTiles';

const red = { color: parseColor('#ff0000'), size: 10, opacity: 1, hardness: 1 };

test('calque vide : aucune tuile, pipette transparente', () => {
  const l = createRasterLayer(1000, 800);
  assert.equal(l.tiles.size, 0);
  assert.deepEqual(samplePixel(l, 10, 10), { r: 0, g: 0, b: 0, a: 0 });
});

test('un dab crée seulement la tuile touchée et colore le centre', () => {
  const l = createRasterLayer(1000, 800);
  const dirty = new Set<string>();
  stampDab(l, 50, 50, red, dirty);
  assert.deepEqual([...dirty], ['0,0']);
  assert.deepEqual(samplePixel(l, 50, 50), { r: 255, g: 0, b: 0, a: 255 });
  assert.equal(samplePixel(l, 70, 70).a, 0);
});

test('un dab à cheval sur deux tuiles les marque toutes les deux', () => {
  const l = createRasterLayer(1000, 800);
  const dirty = new Set<string>();
  stampDab(l, TILE, 20, red, dirty);
  assert.ok(dirty.has('0,0') && dirty.has('1,0'));
});

test('segment : pas de trou entre les dabs', () => {
  const l = createRasterLayer(500, 500);
  stampSegment(l, { x: 10, y: 100 }, { x: 300, y: 100 }, red);
  for (let x = 10; x <= 300; x += 3) assert.equal(samplePixel(l, x, 100).a, 255, `x=${x}`);
});

test('gomme puis redessin : le nouveau trait reste visible', () => {
  const l = createRasterLayer(300, 300);
  stampDab(l, 100, 100, red);
  stampDab(l, 100, 100, { ...red, erase: true });
  assert.equal(samplePixel(l, 100, 100).a, 0);
  stampDab(l, 100, 100, { ...red, color: parseColor('#0000ff') });
  assert.deepEqual(samplePixel(l, 100, 100), { r: 0, g: 0, b: 255, a: 255 });
});

test('opacité : mélange source-over', () => {
  const l = createRasterLayer(100, 100);
  stampDab(l, 50, 50, { ...red, opacity: 0.5 });
  const p = samplePixel(l, 50, 50);
  assert.equal(p.r, 255);
  assert.ok(Math.abs(p.a - 128) <= 1);
});

test('hors toile : rien n\'est écrit', () => {
  const l = createRasterLayer(100, 100);
  stampDab(l, -50, -50, red);
  assert.equal(l.tiles.size, 0);
});

test('crayon crénelé : pas de pixels semi-transparents', () => {
  const l = createRasterLayer(100, 100);
  stampDab(l, 50.3, 50.7, { ...red, size: 7, aliased: true });
  const t = l.tiles.get('0,0')!;
  for (let i = 3; i < t.length; i += 4) assert.ok(t[i] === 0 || t[i] === 255);
});

test('undo / redo par patch de tuiles', () => {
  const l = createRasterLayer(600, 600);
  const dirty = new Set<string>();
  stampDab(l, 50, 50, red); // état initial
  const before = captureTiles(l, ['0,0', '1,1']);
  stampDab(l, 300, 300, red, dirty);
  stampDab(l, 50, 50, { ...red, erase: true }, dirty);
  const redo = applyPatch(l, before); // undo
  assert.equal(samplePixel(l, 50, 50).a, 255);
  assert.equal(l.tiles.has('1,1'), false);
  applyPatch(l, redo);
  assert.equal(samplePixel(l, 50, 50).a, 0);
  assert.equal(samplePixel(l, 300, 300).a, 255);
});

test('pruneEmptyTiles retire les tuiles gommées', () => {
  const l = createRasterLayer(300, 300);
  stampDab(l, 50, 50, red);
  stampDab(l, 50, 50, { ...red, size: 30, erase: true });
  pruneEmptyTiles(l);
  assert.equal(l.tiles.size, 0);
});

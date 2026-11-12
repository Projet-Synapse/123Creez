import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitContain, floatingPanelSize } from '../layerPanelLayout';

test('fitContain : toile paysage → pleine largeur, hauteur réduite', () => {
  assert.deepEqual(fitContain(1920, 1080, 48), { width: 48, height: 27 });
});

test('fitContain : toile portrait → pleine hauteur, largeur réduite', () => {
  assert.deepEqual(fitContain(1080, 1920, 48), { width: 27, height: 48 });
});

test('fitContain : toile carrée → case entière', () => {
  assert.deepEqual(fitContain(2048, 2048, 48), { width: 48, height: 48 });
});

test('fitContain : case rectangulaire', () => {
  assert.deepEqual(fitContain(100, 100, 60, 40), { width: 40, height: 40 });
});

test('fitContain : dimensions inconnues ou nulles → case entière', () => {
  assert.deepEqual(fitContain(0, 0, 48), { width: 48, height: 48 });
  assert.deepEqual(fitContain(NaN, 500, 48), { width: 48, height: 48 });
});

test('fitContain : toile très allongée → au moins 1 px', () => {
  const s = fitContain(100000, 10, 48);
  assert.equal(s.width, 48);
  assert.equal(s.height, 1);
});

test('floatingPanelSize : téléphone ~411 dp (zone ~355) → carte 320', () => {
  const { width } = floatingPanelSize(355, 600);
  assert.equal(width, 320);
});

test('floatingPanelSize : petit téléphone (zone ~304) → marge conservée', () => {
  const { width } = floatingPanelSize(304, 600);
  assert.equal(width, 272);
  assert.ok(width <= 304 - 32);
});

test('floatingPanelSize : tablette / bureau → plafonné à 320', () => {
  assert.equal(floatingPanelSize(1200, 800).width, 320);
});

test('floatingPanelSize : hauteur max ~62 % de la zone, jamais plus que la zone', () => {
  assert.equal(floatingPanelSize(355, 600).maxHeight, 372);
  assert.equal(floatingPanelSize(355, 200).maxHeight, 184);
});

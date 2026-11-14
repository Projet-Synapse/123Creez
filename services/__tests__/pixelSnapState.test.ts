import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotIsCurrent, sceneRendersSame, pixelRebuildDelay, shouldRetryPixelSnapshot, pixelViewVisible,
  PIXEL_REBUILD_FAST_MS, PIXEL_REBUILD_DEBOUNCE_MS, PIXEL_MAX_RETRIES,
} from '../pixelSnapState';
import type { RasterScene, RasterLayer } from '../pixelRaster';

const layer = (over: Partial<RasterLayer> = {}): RasterLayer => ({ id: 'a', visible: true, opacity: 1, strokes: [], ...over });
const scene = (over: Partial<RasterScene> = {}): RasterScene => ({
  docW: 100, docH: 80, background: { kind: 'color', color: '#fff' }, grid: null, dots: null,
  layers: [layer()], activeLayerId: 'a', selection: null, transformBox: null, ...over,
});

test('version : un instantané ne vaut que pour SA scène', () => {
  const s1 = scene();
  const s2 = { ...s1 }; // même contenu, autre version
  const snap = { image: 'img', scene: s1 };
  assert.equal(snapshotIsCurrent(snap, s1), true);
  assert.equal(snapshotIsCurrent(snap, s2), false);
  assert.equal(snapshotIsCurrent(null, s1), false);
  assert.equal(snapshotIsCurrent(snap, null), false);
});

test('vue pixélisée affichée seulement avec un instantané à jour, hors geste', () => {
  const s1 = scene();
  const snap = { image: 'img', scene: s1 };
  const base = { eligible: true, gesture: false, suppressed: false, snap, scene: s1 };
  assert.equal(pixelViewVisible(base), true);
  // Lever du doigt avant le commit : geste maintenu → rendu direct.
  assert.equal(pixelViewVisible({ ...base, gesture: true }), false);
  // Trait commité : nouvelle scène, ancien instantané périmé → jamais affiché.
  assert.equal(pixelViewVisible({ ...base, scene: scene() }), false);
  assert.equal(pixelViewVisible({ ...base, eligible: false }), false);
  assert.equal(pixelViewVisible({ ...base, suppressed: true }), false);
  assert.equal(pixelViewVisible({ ...base, snap: null }), false);
});

test('même rendu : calque renommé ou calque actif changé → image reprise', () => {
  const l = layer();
  const a = scene({ layers: [l] });
  assert.equal(sceneRendersSame(a, scene({ layers: [{ ...l, name: 'Fond' } as RasterLayer] })), true);
  assert.equal(sceneRendersSame(a, scene({ layers: [l], activeLayerId: 'b' })), true);
  assert.equal(sceneRendersSame(a, scene({ layers: [{ ...l, opacity: 0.5 }] })), false);
  assert.equal(sceneRendersSame(a, scene({ layers: [l], grid: '#000' })), false);
});

test('debounce : rafale = 150 ms, sinon une image ; ajout de trait toujours immédiat', () => {
  assert.equal(pixelRebuildDelay(null, false), PIXEL_REBUILD_FAST_MS);
  assert.equal(pixelRebuildDelay(2000, false), PIXEL_REBUILD_FAST_MS);
  assert.equal(pixelRebuildDelay(PIXEL_REBUILD_DEBOUNCE_MS, false), PIXEL_REBUILD_FAST_MS);
  assert.equal(pixelRebuildDelay(30, false), PIXEL_REBUILD_DEBOUNCE_MS);
  assert.equal(pixelRebuildDelay(0, false), PIXEL_REBUILD_DEBOUNCE_MS);
  assert.equal(pixelRebuildDelay(30, true), PIXEL_REBUILD_FAST_MS);
  assert.equal(PIXEL_REBUILD_DEBOUNCE_MS, 150);
});

test('échec : quelques nouveaux essais, puis on abandonne', () => {
  assert.equal(shouldRetryPixelSnapshot(0), false);
  for (let n = 1; n <= PIXEL_MAX_RETRIES; n++) assert.equal(shouldRetryPixelSnapshot(n), true);
  assert.equal(shouldRetryPixelSnapshot(PIXEL_MAX_RETRIES + 1), false);
});

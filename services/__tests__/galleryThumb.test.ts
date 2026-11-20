import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GALLERY_THUMB_MAX_PX, isThumbFresh, shouldLoadFullCanvasForDisplay, thumbPixelSize,
  makeHeavyCanvasFixture,
} from '../galleryThumb';

const base = { id: 'c1', width: 1000, height: 700, updatedAt: 1000 };

test('isThumbFresh : vignette présente et thumbAt >= updatedAt', () => {
  assert.equal(isThumbFresh({ ...base, thumbnail: 'data:image/jpeg;base64,xx', thumbAt: 1000 }), true);
  assert.equal(isThumbFresh({ ...base, thumbnail: 'data:image/jpeg;base64,xx', thumbAt: 2000 }), true);
  assert.equal(isThumbFresh({ ...base, thumbnail: 'data:image/jpeg;base64,xx', thumbAt: 999 }), false);
  assert.equal(isThumbFresh({ ...base }), false);
  assert.equal(isThumbFresh({ ...base, thumbnail: '', thumbAt: 2000 }), false);
});

test('shouldLoadFullCanvasForDisplay : seulement si la vignette est absente ou périmée', () => {
  assert.equal(shouldLoadFullCanvasForDisplay({ ...base, thumbnail: 'data:image/jpeg;base64,xx', thumbAt: 1000 }), false);
  assert.equal(shouldLoadFullCanvasForDisplay({ ...base }), true);
  assert.equal(shouldLoadFullCanvasForDisplay({ ...base, thumbnail: 'data:image/jpeg;base64,xx', thumbAt: 1 }), true);
});

test('thumbPixelSize : plafonne à 320 px et garde le ratio', () => {
  assert.deepEqual(thumbPixelSize(1000, 700), { w: GALLERY_THUMB_MAX_PX, h: 224 });
  assert.deepEqual(thumbPixelSize(200, 100), { w: 200, h: 100 });
  assert.deepEqual(thumbPixelSize(1080, 1920), { w: 320, h: 569 });
  assert.deepEqual(thumbPixelSize(0, 0), { w: 1, h: 1 });
});

test('mesure : parser une toile 1000 × 700 complète est beaucoup plus lourd qu\'une vignette', () => {
  const data = makeHeavyCanvasFixture(1000, 700, { strokeCount: 200, pointsPerStroke: 40, photoBytes: 80_000, layerCount: 3 });
  const json = JSON.stringify(data);
  const thumb = 'data:image/jpeg;base64,' + 'A'.repeat(8_000);

  const t0 = performance.now();
  const parsed = JSON.parse(json) as typeof data;
  const parseMs = performance.now() - t0;
  const t1 = performance.now();
  const thumbLen = thumb.length;
  const thumbMs = performance.now() - t1;

  assert.equal(parsed.meta.width, 1000);
  assert.equal(parsed.meta.height, 700);
  assert.ok(json.length > 100_000, `payload trop petit (${json.length})`);
  assert.ok(json.length > thumb.length * 8, `JSON ${json.length} vs vignette ${thumb.length}`);
  assert.equal(shouldLoadFullCanvasForDisplay({
    id: data.meta.id, width: 1000, height: 700, updatedAt: 10, thumbnail: thumb, thumbAt: 10,
  }), false);

  // Mesure indicative (pas d'assertion de durée : trop instable en CI).
  // eslint-disable-next-line no-console
  console.log(`mesure galerie 1000×700 : JSON ${json.length} octets parsés en ${parseMs.toFixed(1)} ms ; vignette ${thumbLen} octets en ${thumbMs.toFixed(3)} ms`);
});

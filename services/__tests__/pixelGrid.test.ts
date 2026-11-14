import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docRasterSize, pixelAlignedTransform, nearestRuns, imageMeetRect } from '../pixelGrid';

// Cas de l'A13 : zone ~ 400 × 700 dp, densité 2,75 (approx.), photo 1536 ×
// 2048 posée sur une toile de même taille, zoom 860 %.
const ZONE_W = 400;
const ZONE_H = 700;
const DOC_W = 1536;
const DOC_H = 2048;
const PR = 2.75;

test('raster : un pixel par pixel de document, au moins 1 × 1', () => {
  assert.deepEqual(docRasterSize(1536, 2048), { w: 1536, h: 2048 });
  assert.deepEqual(docRasterSize(100.4, 99.6), { w: 100, h: 100 });
  assert.deepEqual(docRasterSize(0, 0), { w: 1, h: 1 });
});

test('transformation calée sur les pixels physiques (origine et bord opposé entiers)', () => {
  for (const [tx, ty, s] of [[0, 0, 8.6], [13.37, -251.9, 8.6], [-0.3, 0.7, 2.25], [5.5, 5.5, 1.5]]) {
    const t = pixelAlignedTransform(ZONE_W, ZONE_H, DOC_W, DOC_H, DOC_W, DOC_H, tx, ty, s, PR);
    const near = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
    assert.ok(near(t.x * PR), `x ${t.x * PR}`);
    assert.ok(near(t.y * PR), `y ${t.y * PR}`);
    assert.ok(near((t.x + t.sx * DOC_W) * PR), 'bord droit');
    assert.ok(near((t.y + t.sy * DOC_H) * PR), 'bord bas');
  }
});

test('même placement que le Svg zoomé, à moins d\'un pixel physique près', () => {
  const tx = 42.42; const ty = -17.1; const s = 8.6;
  const t = pixelAlignedTransform(ZONE_W, ZONE_H, DOC_W, DOC_H, DOC_W, DOC_H, tx, ty, s, PR);
  // Référence : viewBox « meet » puis translate + scale autour du centre.
  const k = Math.min(ZONE_W / DOC_W, ZONE_H / DOC_H);
  const fitX = (ZONE_W - DOC_W * k) / 2;
  const fitY = (ZONE_H - DOC_H * k) / 2;
  const left = ZONE_W / 2 + tx + s * (fitX - ZONE_W / 2);
  const top = ZONE_H / 2 + ty + s * (fitY - ZONE_H / 2);
  assert.ok(Math.abs(t.x - left) * PR <= 0.5 + 1e-9);
  assert.ok(Math.abs(t.y - top) * PR <= 0.5 + 1e-9);
  assert.ok(Math.abs(t.sx - s * k) * DOC_W * PR <= 0.5 + 1e-9);
  assert.ok(Math.abs(t.sy - s * k) * DOC_H * PR <= 0.5 + 1e-9);
});

test('raster arrondi (toile non entière) : il recouvre quand même toute la toile', () => {
  const t = pixelAlignedTransform(ZONE_W, ZONE_H, 1000.4, 800, 1000, 800, 0, 0, 3, 2);
  const k = Math.min(ZONE_W / 1000.4, ZONE_H / 800);
  assert.ok(Math.abs(t.sx * 1000 - 3 * 1000.4 * k) * 2 <= 0.5 + 1e-9);
});

test('densité invalide → 1', () => {
  const a = pixelAlignedTransform(100, 100, 50, 50, 50, 50, 0, 0, 2, NaN);
  const b = pixelAlignedTransform(100, 100, 50, 50, 50, 50, 0, 0, 2, 1);
  assert.deepEqual(a, b);
});

test('plus proche voisin, origine entière : chaque pixel = floor ou ceil de la cellule', () => {
  // 860 % × densité → cellule non entière (ex. 8,6 px physiques).
  for (const cell of [8.6, 9.31, 2.5, 23.65]) {
    const runs = nearestRuns(37, cell, 200);
    for (const r of runs) assert.ok(r === Math.floor(cell) || r === Math.ceil(cell), `cellule ${cell} → ${r}`);
    // Tous les pixels physiques sont attribués : aucun trou, aucun recouvrement.
    assert.equal(runs.reduce((a, b) => a + b, 0), Math.round(cell * 200));
  }
});

test('plus proche voisin, cellule entière : carrés tous identiques', () => {
  const runs = nearestRuns(12, 9, 50);
  assert.ok(runs.every(r => r === 9));
});

test('chaîne complète au zoom 860 % : rangée de pixels sans trou ni pixel « fantôme »', () => {
  const t = pixelAlignedTransform(ZONE_W, ZONE_H, DOC_W, DOC_H, DOC_W, DOC_H, 13.37, 0, 8.6, PR);
  const cell = t.sx * PR;
  const runs = nearestRuns(t.x * PR, cell, DOC_W);
  assert.ok(runs.every(r => r === Math.floor(cell) || r === Math.ceil(cell)));
});

test('photo dans sa boîte : « meet » comme react-native-svg', () => {
  assert.deepEqual(imageMeetRect(10, 20, 100, 50, 100, 50), { x: 10, y: 20, w: 100, h: 50 });
  // Boîte trop large : centrée horizontalement.
  assert.deepEqual(imageMeetRect(0, 0, 200, 50, 100, 50), { x: 50, y: 0, w: 100, h: 50 });
  // Taille inconnue : la boîte telle quelle.
  assert.deepEqual(imageMeetRect(1, 2, 3, 4, 0, 0), { x: 1, y: 2, w: 3, h: 4 });
});

// ─── Rotation de vue dans Skia ────────────────────────────────────────
import { pixelViewTransformOps, applyTransformOps } from '../pixelGrid';
import { rotateVec, unrotatePoint } from '../gestureMath';

test('rotation 0° : transformation identique à pixelAlignedTransform seul', () => {
  const t = pixelAlignedTransform(ZONE_W, ZONE_H, DOC_W, DOC_H, DOC_W, DOC_H, 13.37, -25.1, 3.2, PR);
  const ops = pixelViewTransformOps(t, 0, ZONE_W, ZONE_H);
  assert.deepEqual(ops, [{ translateX: t.x }, { translateY: t.y }, { scaleX: t.sx }, { scaleY: t.sy }]);
  const p = applyTransformOps(ops, 100, 200);
  assert.ok(Math.abs(p.x - (t.x + 100 * t.sx)) < 1e-9);
  assert.ok(Math.abs(p.y - (t.y + 200 * t.sy)) < 1e-9);
});

test('rotation : même placement que la vue tournée autour du centre de la zone', () => {
  const t = pixelAlignedTransform(ZONE_W, ZONE_H, DOC_W, DOC_H, DOC_W, DOC_H, -40, 12, 2.5, PR);
  const cx = ZONE_W / 2;
  const cy = ZONE_H / 2;
  for (const deg of [90, 180, -90, 37, -12.5]) {
    const ops = pixelViewTransformOps(t, deg, ZONE_W, ZONE_H);
    for (const [u, v] of [[0, 0], [DOC_W, 0], [DOC_W, DOC_H], [512, 777]]) {
      // Sans rotation, puis tourné autour du centre comme l'Animated.View.
      const flat = { x: t.x + u * t.sx, y: t.y + v * t.sy };
      const r = rotateVec(flat.x - cx, flat.y - cy, deg);
      const got = applyTransformOps(ops, u, v);
      assert.ok(Math.abs(got.x - (cx + r.x)) < 1e-6, `${deg}° x`);
      assert.ok(Math.abs(got.y - (cy + r.y)) < 1e-6, `${deg}° y`);
      // Et les gestes (unrotatePoint) retombent sur le point non tourné.
      const back = unrotatePoint(got.x, got.y, ZONE_W, ZONE_H, deg);
      assert.ok(Math.abs(back.x - flat.x) < 1e-6 && Math.abs(back.y - flat.y) < 1e-6);
    }
  }
});

test('rotation : 360° et valeurs invalides = pas de rotation', () => {
  const t = { x: 1, y: 2, sx: 3, sy: 4 };
  assert.equal(pixelViewTransformOps(t, 360, 100, 100).length, 4);
  assert.equal(pixelViewTransformOps(t, Number.NaN, 100, 100).length, 4);
});

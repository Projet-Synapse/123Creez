import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampBrushSize, clampBrushOpacity, displayStrokeWidth, previewStrokePath,
  BRUSH_SIZE_MIN, BRUSH_SIZE_MAX, BRUSH_OPACITY_MIN, BRUSH_OPACITY_MAX,
  PREVIEW_HEIGHT, PREVIEW_EDGE, PREVIEW_PERIODS, PREVIEW_SAMPLES,
} from '../brushPreview';

test('clampBrushSize : bornes 1–80, arrondi, invalide → minimum', () => {
  assert.equal(clampBrushSize(12), 12);
  assert.equal(clampBrushSize(12.6), 13);
  assert.equal(clampBrushSize(0), BRUSH_SIZE_MIN);
  assert.equal(clampBrushSize(-4), BRUSH_SIZE_MIN);
  assert.equal(clampBrushSize(80), BRUSH_SIZE_MAX);
  assert.equal(clampBrushSize(200), BRUSH_SIZE_MAX);
  assert.equal(clampBrushSize(NaN), BRUSH_SIZE_MIN);
  assert.equal(clampBrushSize(undefined), BRUSH_SIZE_MIN);
  assert.equal(clampBrushSize('12'), BRUSH_SIZE_MIN);
});

test('clampBrushOpacity : bornes 0,05–1, pas de 1 %, invalide → 100 %', () => {
  assert.equal(clampBrushOpacity(1), BRUSH_OPACITY_MAX);
  assert.equal(clampBrushOpacity(0), BRUSH_OPACITY_MIN);
  assert.equal(clampBrushOpacity(0.049), BRUSH_OPACITY_MIN);
  assert.equal(clampBrushOpacity(0.333), 0.33);
  assert.equal(clampBrushOpacity(1.4), BRUSH_OPACITY_MAX);
  assert.equal(clampBrushOpacity(NaN), BRUSH_OPACITY_MAX);
  assert.equal(clampBrushOpacity(undefined), BRUSH_OPACITY_MAX);
});

test('displayStrokeWidth : taille réelle si elle tient, sinon ramenée', () => {
  assert.equal(displayStrokeWidth(12, PREVIEW_HEIGHT), 12);
  assert.equal(displayStrokeWidth(1, PREVIEW_HEIGHT), 1);
  const capped = displayStrokeWidth(80, PREVIEW_HEIGHT, PREVIEW_EDGE);
  assert.equal(capped, PREVIEW_HEIGHT - 2 * PREVIEW_EDGE);
  assert.ok(capped < 80);
  assert.equal(displayStrokeWidth(80, 20, 2), 16);
  assert.equal(displayStrokeWidth(80, 2, 2), 1);
});

test('previewStrokePath : assez de points, d SVG bien formé', () => {
  const r = previewStrokePath(136, PREVIEW_HEIGHT, 12);
  assert.equal(r.points.length, PREVIEW_SAMPLES + 1);
  assert.ok(r.d.startsWith('M '));
  assert.equal((r.d.match(/ L /g) || []).length, PREVIEW_SAMPLES);
  assert.equal(r.strokeWidth, 12);
  assert.ok(r.amplitude > 0);
});

test('previewStrokePath : le trait (épaisseur comprise) reste dans le cadre', () => {
  const cases: [number, number, number][] = [
    [136, PREVIEW_HEIGHT, 1],
    [136, PREVIEW_HEIGHT, 12],
    [136, PREVIEW_HEIGHT, 40],
    [136, PREVIEW_HEIGHT, 80],
    [150 - 16, PREVIEW_HEIGHT, 20], // panneau 150 px, padding horizontal
    [248 - 16, PREVIEW_HEIGHT, 80],
    [80, 40, 30],
  ];
  for (const [w, h, size] of cases) {
    const r = previewStrokePath(w, h, size);
    const half = r.strokeWidth / 2;
    assert.ok(r.points.length >= 3, `assez de points (${w}×${h}, ${size})`);
    for (const p of r.points) {
      assert.ok(p.x - half >= -1e-9, `x gauche ${p.x} ± ${half} dans 0..${w}`);
      assert.ok(p.x + half <= w + 1e-9, `x droit ${p.x} ± ${half} dans 0..${w}`);
      assert.ok(p.y - half >= -1e-9, `y haut ${p.y} ± ${half} dans 0..${h}`);
      assert.ok(p.y + half <= h + 1e-9, `y bas ${p.y} ± ${half} dans 0..${h}`);
    }
  }
});

test('previewStrokePath : 2 périodes, départ et arrivée à mid-hauteur', () => {
  const w = 136;
  const h = PREVIEW_HEIGHT;
  const r = previewStrokePath(w, h, 8);
  assert.equal(PREVIEW_PERIODS, 2);
  const cy = h / 2;
  const first = r.points[0];
  const last = r.points[r.points.length - 1];
  assert.ok(Math.abs(first.y - cy) < 1e-9);
  assert.ok(Math.abs(last.y - cy) < 1e-9);
  // Le trait part près du bord gauche et arrive près du bord droit (hors épaisseur).
  const half = r.strokeWidth / 2;
  assert.ok(first.x <= half + PREVIEW_EDGE + 1e-9);
  assert.ok(last.x >= w - half - PREVIEW_EDGE - 1e-9);
  // Une crête et un creux au moins (l'onde se lit).
  const ys = r.points.map(p => p.y);
  assert.ok(Math.max(...ys) - cy > r.amplitude * 0.9);
  assert.ok(cy - Math.min(...ys) > r.amplitude * 0.9);
});

test('previewStrokePath : plus le trait est épais, plus l\'amplitude baisse', () => {
  const thin = previewStrokePath(136, PREVIEW_HEIGHT, 4);
  const thick = previewStrokePath(136, PREVIEW_HEIGHT, 80);
  assert.ok(thick.strokeWidth > thin.strokeWidth);
  assert.ok(thick.amplitude < thin.amplitude);
  assert.equal(thick.strokeWidth, PREVIEW_HEIGHT - 2 * PREVIEW_EDGE);
  assert.equal(thick.amplitude, 0);
});

test('previewStrokePath : cadre invalide → chemin vide, épaisseur quand même calculée', () => {
  const r = previewStrokePath(0, PREVIEW_HEIGHT, 12);
  assert.equal(r.d, '');
  assert.deepEqual(r.points, []);
  assert.equal(r.strokeWidth, 12);
  const r2 = previewStrokePath(100, -4, 12);
  assert.equal(r2.d, '');
  assert.equal(r2.strokeWidth, 1); // hauteur invalide → épaisseur minimale
});

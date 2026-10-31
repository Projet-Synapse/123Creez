import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pivotTranslate, screenToZone, zoneToScreen, zoomAboutAnchor,
  strokeGate, shouldCommitStroke, sliderValue, STROKE_START_DELAY_MS,
} from '../canvasInput';
import { viewParams, docToScreen } from '../measureMath';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// Modèle du rendu natif : scale autour du centre (transformOrigin 50 % 50 %).
function nativeRender(px: number, py: number, tx: number, ty: number, s: number, w: number, h: number) {
  return { x: w / 2 + tx + s * (px - w / 2), y: h / 2 + ty + s * (py - h / 2) };
}

test('screenToZone inverse exactement le rendu natif (scale centré), à tout zoom', () => {
  const w = 400, h = 700;
  for (const s of [0.3, 1, 2, 7.5]) {
    for (const [tx, ty] of [[0, 0], [35, -120], [-500, 80]]) {
      const p = { x: 123, y: 456 };
      const scr = nativeRender(p.x, p.y, tx, ty, s, w, h);
      const back = screenToZone(scr.x, scr.y, tx, ty, s, w, h);
      near(back.x, p.x); near(back.y, p.y);
      const again = zoneToScreen(p.x, p.y, tx, ty, s, w, h);
      near(again.x, scr.x); near(again.y, scr.y);
    }
  }
});

test('régression : l\'ancienne formule (origine haut-gauche) décale de (1−S)×centre', () => {
  const w = 400, h = 700, s = 3, p = { x: 50, y: 60 };
  const scr = nativeRender(p.x, p.y, 0, 0, s, w, h);
  const old = { x: scr.x / s, y: scr.y / s };
  assert.ok(Math.abs(old.x - p.x) > 100, 'l\'ancienne formule est bien fausse');
  near(pivotTranslate(0, s, w), (w / 2) * (1 - s));
});

test('zoomAboutAnchor garde le point sous le curseur immobile', () => {
  const w = 800, h = 600;
  const tx = 40, ty = -25, s0 = 1.5, s1 = 2.7, ax = 610, ay = 130;
  const p = screenToZone(ax, ay, tx, ty, s0, w, h);
  const t = zoomAboutAnchor(s0, s1, tx, ty, ax, ay, w, h);
  const scr = nativeRender(p.x, p.y, t.tx, t.ty, s1, w, h);
  near(scr.x, ax); near(scr.y, ay);
});

test('viewParams (outil Mesure) suit le même pivot centré', () => {
  const w = 800, h = 600, docW = 2000, docH = 1000, s = 2.2, tx = 15, ty = 9;
  const v = viewParams(s, tx, ty, w, h, docW, docH);
  const d = { x: 700, y: 300 };
  const zone = { x: v.offX + v.k * d.x, y: v.offY + v.k * d.y };
  const expected = nativeRender(zone.x, zone.y, tx, ty, s, w, h);
  const got = docToScreen(d, v);
  near(got.x, expected.x); near(got.y, expected.y);
});

test('strokeGate : attente, démarrage, annulation au 2e doigt', () => {
  assert.equal(strokeGate({ elapsedMs: 10, maxTouches: 1, defer: true }), 'wait');
  assert.equal(strokeGate({ elapsedMs: STROKE_START_DELAY_MS, maxTouches: 1, defer: true }), 'start');
  assert.equal(strokeGate({ elapsedMs: 10, maxTouches: 2, defer: true }), 'cancel');
  assert.equal(strokeGate({ elapsedMs: 5000, maxTouches: 2, defer: true }), 'cancel');
  // Souris / web : immédiat
  assert.equal(strokeGate({ elapsedMs: 0, maxTouches: 1, defer: false }), 'start');
});

test('shouldCommitStroke : jamais de trait si un 2e doigt est apparu', () => {
  assert.equal(shouldCommitStroke(1), true);
  assert.equal(shouldCommitStroke(2), false);
  assert.equal(shouldCommitStroke(3), false);
});

test('sliderValue borne entre 0 et 1', () => {
  assert.equal(sliderValue(-10, 200), 0);
  assert.equal(sliderValue(100, 200), 0.5);
  assert.equal(sliderValue(999, 200), 1);
  assert.equal(sliderValue(50, 0), 0);
});

test('pinch : le point de la toile sous les doigts reste sous les doigts (zoom + pan)', async () => {
  const { anchorTranslate, screenToZone, zoneToScreen } = await import('../canvasInput');
  const w = 400, h = 700;
  let tx = 30, ty = -12, s = 1.3;
  const mid0 = { x: 120, y: 500 };
  const p = screenToZone(mid0.x, mid0.y, tx, ty, s, w, h);
  for (const [scale, mx, my] of [[2.4, 150, 480], [0.6, 90, 520], [7, 300, 100]] as const) {
    ({ tx, ty } = anchorTranslate(p.x, p.y, mx, my, scale, w, h));
    s = scale;
    const back = zoneToScreen(p.x, p.y, tx, ty, s, w, h);
    assert.ok(Math.abs(back.x - mx) < 1e-9 && Math.abs(back.y - my) < 1e-9);
  }
});

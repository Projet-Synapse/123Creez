import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHex, hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, hsvToHex, hexToHsv,
  hexToHsvKeep, angleToHue, hueToPoint, wheelSizeFor, wheelGeometry, wheelZone,
  svToDiamond, diamondToSv, clampToDiamond, setChannel, WHEEL_MIN, WHEEL_MAX,
} from '../colorMath';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('normalizeHex : formes courtes, majuscules, invalides', () => {
  assert.equal(normalizeHex('#FFF'), '#ffffff');
  assert.equal(normalizeHex('Ff6b6B'), '#ff6b6b');
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex('zzzzzz'), null);
});

test('hex ↔ rgb : noir, blanc, primaires', () => {
  assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('#ff0000'), [255, 0, 0]);
  assert.deepEqual(hexToRgb('#00ff00'), [0, 255, 0]);
  assert.deepEqual(hexToRgb('#0000ff'), [0, 0, 255]);
  assert.equal(rgbToHex([0, 0, 0]), '#000000');
  assert.equal(rgbToHex([255, 255, 255]), '#ffffff');
  assert.equal(rgbToHex([300, -4, 15.6]), '#ff0010');
});

test('rgb ↔ hsv : noir, blanc, gris, primaires', () => {
  assert.deepEqual(rgbToHsv([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(rgbToHsv([255, 255, 255]), [0, 0, 1]);
  assert.deepEqual(rgbToHsv([255, 0, 0]), [0, 1, 1]);
  assert.deepEqual(rgbToHsv([0, 255, 0]), [120, 1, 1]);
  assert.deepEqual(rgbToHsv([0, 0, 255]), [240, 1, 1]);
  const [h, s, v] = rgbToHsv([128, 128, 128]);
  assert.equal(h, 0); assert.equal(s, 0); near(v, 128 / 255);
  assert.deepEqual(hsvToRgb(0, 1, 1), [255, 0, 0]);
  assert.deepEqual(hsvToRgb(120, 1, 1), [0, 255, 0]);
  assert.deepEqual(hsvToRgb(240, 1, 1), [0, 0, 255]);
  assert.deepEqual(hsvToRgb(360, 1, 1), [255, 0, 0]);
  assert.deepEqual(hsvToRgb(200, 0.7, 0), [0, 0, 0]);
  assert.deepEqual(hsvToRgb(200, 0, 1), [255, 255, 255]);
});

test('hex → hsv → hex : aller-retour stable', () => {
  for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
    '#ff6b6b', '#4ecdc4', '#533483', '#7f7f7f', '#010203']) {
    const [h, s, v] = hexToHsv(hex);
    assert.equal(hsvToHex(h, s, v), hex);
  }
});

test('hexToHsvKeep : garde H (gris) et H+S (noir)', () => {
  assert.deepEqual(hexToHsvKeep('#000000', [200, 0.6, 0.8]), [200, 0.6, 0]);
  const [h, s, v] = hexToHsvKeep('#808080', [200, 0.6, 0.8]);
  assert.equal(h, 200); assert.equal(s, 0); near(v, 128 / 255);
  assert.deepEqual(hexToHsvKeep('#ff0000', [200, 0.6, 0.8]), [0, 1, 1]);
});

test('anneau : angle ↔ teinte (Y écran vers le bas, sens horaire)', () => {
  near(angleToHue(10, 0), 0);
  near(angleToHue(0, 10), 90);
  near(angleToHue(-10, 0), 180);
  near(angleToHue(0, -10), 270);
  near(angleToHue(10, -0.0000001), 360 - 5.7e-7, 1e-5);
  for (const h of [0, 45, 120, 200, 359]) {
    const p = hueToPoint(h, 50);
    near(Math.hypot(p.x, p.y), 50);
    near(angleToHue(p.x, p.y), h, 1e-9);
  }
});

test('taille de roue : suit la largeur du panneau, bornée', () => {
  assert.equal(wheelSizeFor(137), 137);      // panneau 150 px
  assert.equal(wheelSizeFor(80), WHEEL_MIN);
  assert.equal(wheelSizeFor(235), WHEEL_MAX); // panneau 248 px
  const g = wheelGeometry(136);
  assert.ok(g.r - g.innerR >= 16, 'anneau assez épais pour le doigt');
  assert.ok(g.half < g.innerR, 'le losange tient dans le trou');
});

test('zones de geste : anneau vs losange', () => {
  const g = wheelGeometry(136);
  assert.equal(wheelZone(0, 0, g), 'diamond');
  assert.equal(wheelZone(g.half, 0, g), 'diamond');
  assert.equal(wheelZone(g.ringMid, 0, g), 'ring');
  assert.equal(wheelZone(0, -g.r, g), 'ring');
  assert.equal(wheelZone(g.r + 10, 0, g), 'ring');
});

test('losange : coins et centre ↔ S/V', () => {
  const H = 40;
  const corners: [number, number, number, number][] = [
    // s, v, x, y
    [0, 1, 0, -H],  // haut = blanc
    [1, 1, H, 0],   // droite = teinte pleine
    [1, 0, 0, H],   // bas = noir
    [0, 0, -H, 0],  // gauche = noir
  ];
  for (const [s, v, x, y] of corners) {
    const p = svToDiamond(s, v, H);
    near(p.x, x); near(p.y, y);
    const sv = diamondToSv(x, y, H);
    near(sv.s, s); near(sv.v, v);
  }
  const c = diamondToSv(0, 0, H);
  near(c.s, 0.5); near(c.v, 0.5);
  const p = svToDiamond(0.5, 0.5, H);
  near(p.x, 0); near(p.y, 0);
  // aller-retour quelconque
  const q = svToDiamond(0.3, 0.8, H);
  const back = diamondToSv(q.x, q.y, H);
  near(back.s, 0.3); near(back.v, 0.8);
});

test('losange : le point reste clampé à l\'intérieur', () => {
  const H = 40;
  for (const [x, y] of [[100, 0], [0, -100], [-60, 60], [35, 35], [1000, -1000]]) {
    const p = clampToDiamond(x, y, H);
    assert.ok(Math.abs(p.x) + Math.abs(p.y) <= H + 1e-9, `${p.x},${p.y} dans le losange`);
    const sv = diamondToSv(x, y, H);
    assert.ok(sv.s >= 0 && sv.s <= 1 && sv.v >= 0 && sv.v <= 1);
  }
  const far = clampToDiamond(100, 0, H);
  near(far.x, H); near(far.y, 0);
  const inside = clampToDiamond(5, -7, H);
  near(inside.x, 5); near(inside.y, -7);
});

test('RVB : canal clampé et arrondi', () => {
  assert.deepEqual(setChannel([10, 20, 30], 0, 11), [11, 20, 30]);
  assert.deepEqual(setChannel([10, 20, 30], 1, -5), [10, 0, 30]);
  assert.deepEqual(setChannel([10, 20, 30], 2, 300), [10, 20, 255]);
  assert.deepEqual(setChannel([10, 20, 30], 2, 99.6), [10, 20, 100]);
});

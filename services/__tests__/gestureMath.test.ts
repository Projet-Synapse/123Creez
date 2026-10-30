import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSensitivity, scalePan, scalePinchRatio, scaleZoomStep,
  pixelViewEligible, meetFitRect,
} from '../gestureMath';

test('sensibilité 1 = comportement d\'origine', () => {
  assert.equal(scalePan(37.5, 1), 37.5);
  assert.equal(scalePinchRatio(1.7, 1), 1.7);
  assert.equal(scaleZoomStep(1.08, 1), 1.08);
});

test('valeurs absentes ou invalides → 1', () => {
  assert.equal(clampSensitivity(undefined), 1);
  assert.equal(clampSensitivity(NaN), 1);
  assert.equal(clampSensitivity('2'), 1);
  assert.equal(scalePan(10, undefined), 10);
});

test('bornes', () => {
  assert.equal(clampSensitivity(10), 3);
  assert.equal(clampSensitivity(0), 0.25);
});

test('pan multiplié', () => {
  assert.equal(scalePan(10, 2), 20);
  assert.equal(scalePan(-10, 0.5), -5);
});

test('pinch symétrique', () => {
  const a = scalePinchRatio(2, 1.5);
  const b = scalePinchRatio(0.5, 1.5);
  assert.ok(Math.abs(a * b - 1) < 1e-12);
  assert.ok(a > 2);
  assert.ok(scalePinchRatio(2, 0.5) < 2);
  assert.equal(scalePinchRatio(0, 2), 1);
});

test('éligibilité vue pixélisée', () => {
  assert.equal(pixelViewEligible('smooth', 4, 100, 100), false);
  assert.equal(pixelViewEligible(undefined, 4, 100, 100), false);
  assert.equal(pixelViewEligible('pixelated', 1, 100, 100), false);
  assert.equal(pixelViewEligible('pixelated', 2, 100, 100), true);
  assert.equal(pixelViewEligible('pixelated', 2, 5000, 5000), false);
});

test('meetFitRect', () => {
  const r = meetFitRect(400, 300, 200, 100);
  assert.deepEqual(r, { x: 0, y: 50, w: 400, h: 200, k: 2 });
});

import { settingsNavLayoutFor } from '../layoutRules';
test('nav des paramètres selon la largeur', () => {
  assert.equal(settingsNavLayoutFor(390), 'top');
  assert.equal(settingsNavLayoutFor(699), 'top');
  assert.equal(settingsNavLayoutFor(700), 'side');
  assert.equal(settingsNavLayoutFor(1280), 'side');
  assert.equal(settingsNavLayoutFor(0), 'side');
});

import { normalizeAngle, rotateVec, unrotatePoint, snapAngle, touchAngle } from '../gestureMath';

test('rotation de vue : normalisation et aimantage', () => {
  assert.equal(normalizeAngle(190), -170);
  assert.equal(normalizeAngle(-180), 180);
  assert.equal(snapAngle(4), 0);
  assert.equal(snapAngle(-3), 0);
  assert.equal(snapAngle(93), 90);
  assert.equal(snapAngle(178), 180);
  assert.equal(snapAngle(30), 30);
  assert.equal(touchAngle(0, 0, 0, 10), 90);
});

test('unrotatePoint inverse exactement la rotation autour du centre', () => {
  const w = 400, h = 300, deg = 37;
  const p = { x: 120, y: 80 };
  // écran = C + R(deg)(p − C)
  const v = rotateVec(p.x - w / 2, p.y - h / 2, deg);
  const screen = { x: w / 2 + v.x, y: h / 2 + v.y };
  const back = unrotatePoint(screen.x, screen.y, w, h, deg);
  assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  assert.deepEqual(unrotatePoint(5, 6, w, h, 0), { x: 5, y: 6 });
});

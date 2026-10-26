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

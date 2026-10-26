import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distance, segmentAngleDeg, angleAtVertex, snapAngle, snapPointToAngle,
  pointFromPolar, snapToPoints, setDistanceFromInput, setAngleFromInput,
  measureToLines, viewParams, docToScreen, screenToDoc, screenLenToDoc, Measure,
} from '../measureMath';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('distance en px doc', () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('angle par rapport à l\'horizontale (Y vers le bas, sens trigo écran)', () => {
  near(segmentAngleDeg({ x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  near(segmentAngleDeg({ x: 0, y: 0 }, { x: 0, y: -10 }), 90);
  near(segmentAngleDeg({ x: 0, y: 0 }, { x: -10, y: 0 }), 180);
  near(segmentAngleDeg({ x: 0, y: 0 }, { x: 0, y: 10 }), 270);
});

test('angle au sommet entre 0 et 180', () => {
  const v = { x: 0, y: 0 };
  near(angleAtVertex({ x: 10, y: 0 }, v, { x: 0, y: -10 }), 90);
  near(angleAtVertex({ x: 10, y: 0 }, v, { x: 0, y: 10 }), 90);
  near(angleAtVertex({ x: 10, y: 0 }, v, { x: -10, y: 0 }), 180);
  near(angleAtVertex({ x: 10, y: 0 }, v, { x: 10, y: -10 }), 45);
});

test('magnétisme 15°', () => {
  assert.equal(snapAngle(7), 0);
  assert.equal(snapAngle(8), 15);
  assert.equal(snapAngle(358), 0);
  const p = snapPointToAngle({ x: 0, y: 0 }, { x: 100, y: -12 });
  near(segmentAngleDeg({ x: 0, y: 0 }, p), 0);
  near(distance({ x: 0, y: 0 }, p), Math.hypot(100, 12));
});

test('polaire et saisie numérique (B recalculé depuis A)', () => {
  const p = pointFromPolar({ x: 10, y: 10 }, 20, 90);
  near(p.x, 10); near(p.y, -10);
  const m: Measure = { mode: 'distance', a: { x: 5, y: 5 }, b: { x: 6, y: 6 }, v: null };
  const r = setDistanceFromInput(m, 50, 0);
  near(r.b!.x, 55); near(r.b!.y, 5);
  assert.equal(setDistanceFromInput(m, NaN, 0), m);
  assert.equal(setDistanceFromInput(m, -1, 0), m);
});

test('saisie d\'angle au sommet garde le côté', () => {
  const m: Measure = { mode: 'angle', v: { x: 0, y: 0 }, a: { x: 10, y: 0 }, b: { x: 0, y: 10 } };
  const r = setAngleFromInput(m, 60, 20);
  near(angleAtVertex(r.a, r.v!, r.b!), 60);
  assert.ok(r.b!.y > 0, 'reste sous l\'axe');
  near(distance(r.v!, r.b!), 20);
});

test('accroche aux extrémités précédentes', () => {
  const c = [{ x: 100, y: 100 }, { x: 0, y: 0 }];
  assert.deepEqual(snapToPoints({ x: 104, y: 99 }, c, 8), { x: 100, y: 100 });
  assert.deepEqual(snapToPoints({ x: 50, y: 50 }, c, 8), { x: 50, y: 50 });
});

test('Tracer : segment ou deux bras, rien si incomplet', () => {
  assert.equal(measureToLines(null).length, 0);
  assert.equal(measureToLines({ mode: 'distance', a: { x: 0, y: 0 }, b: null, v: null }).length, 0);
  assert.equal(measureToLines({ mode: 'distance', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, v: null }).length, 0);
  assert.equal(measureToLines({ mode: 'distance', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, v: null }).length, 1);
  const l = measureToLines({ mode: 'angle', v: { x: 0, y: 0 }, a: { x: 3, y: 0 }, b: { x: 0, y: 3 } });
  assert.equal(l.length, 2);
  assert.deepEqual(l[0].from, { x: 0, y: 0 });
});

test('conversion écran ↔ doc aller-retour, indépendante du zoom', () => {
  for (const s of [0.5, 1, 3.7]) {
    const v = viewParams(s, 12, -40, 800, 600, 2000, 1000);
    const d = { x: 123.4, y: 567.8 };
    const back = screenToDoc(docToScreen(d, v), v);
    near(back.x, d.x); near(back.y, d.y);
    near(screenLenToDoc(22, v) * s * v.k, 22);
  }
});

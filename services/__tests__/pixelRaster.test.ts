import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDocRaster, planLayer, dataUrlBase64, type RasterScene, type RasterLayer, type RasterOp } from '../pixelRaster';
import { buildSvgPath } from '../strokePath';

const stroke = (id: string, tool: string, pts: [number, number][] = [[0, 0], [10, 10]]) => ({
  id, tool, points: pts.map(([x, y]) => ({ x, y })), color: '#ff0000', size: 4, opacity: 0.5,
});

const scene = (over: Partial<RasterScene> = {}): RasterScene => ({
  docW: 100, docH: 80,
  background: { kind: 'color', color: '#ffffff' },
  grid: null, dots: null,
  layers: [], activeLayerId: 'a', selection: null, transformBox: null,
  ...over,
});

const kinds = (ops: RasterOp[]) => ops.map(o => (o.op === 'draw' ? `draw:${o.geom.kind}` : o.op));

test('fond : couleur, damier ou rien', () => {
  assert.deepEqual(kinds(planDocRaster(scene())), ['draw:rect']);
  assert.deepEqual(kinds(planDocRaster(scene({ background: { kind: 'checker' } }))), ['checker']);
  assert.deepEqual(kinds(planDocRaster(scene({ background: { kind: 'none' } }))), []);
});

test('grille : lignes tous les 40, strictement dans la toile', () => {
  const ops = planDocRaster(scene({ background: { kind: 'none' }, grid: '#000', docW: 100, docH: 80 }));
  // x = 40, 80 ; y = 40 (80 n'est pas < 80).
  assert.equal(ops.length, 3);
});

test('calque masqué : rien', () => {
  const layer: RasterLayer = { id: 'a', visible: false, opacity: 1, strokes: [stroke('s', 'brush')] };
  assert.deepEqual(planLayer(layer, 100, 80), []);
});

test('ordre d\'un calque comme CanvasArt : images, formes, remplissage, traits, textes', () => {
  const layer: RasterLayer = {
    id: 'a', visible: true, opacity: 0.7,
    strokes: [stroke('s1', 'brush'), stroke('f', 'fill')],
    images: [{ src: 'data:image/jpeg;base64,AAAA', x: 1, y: 2, width: 30, height: 20 }],
    shapes: [{ kind: 'rect', x: 0, y: 0, w: 5, h: 5, color: '#00f', size: 2, opacity: 1, fill: true }],
    texts: [{ x: 3, y: 4, value: 'Salut', size: 12, color: '#000', opacity: 1 }],
  };
  const ops = planLayer(layer, 100, 80);
  assert.deepEqual(kinds(ops), ['layer', 'image', 'draw:rect', 'draw:rect', 'draw:rect', 'layer', 'draw:path', 'restore', 'text', 'restore']);
  assert.deepEqual(ops[0], { op: 'layer', opacity: 0.7 });
  // La photo garde sa boîte (pas de redimensionnement ici).
  assert.deepEqual(ops[1], { op: 'image', src: 'data:image/jpeg;base64,AAAA', x: 1, y: 2, w: 30, h: 20, angle: 0 });
});

test('gomme : n\'efface que ce qui la précède, dans un calque isolé', () => {
  const layer: RasterLayer = {
    id: 'a', visible: true, opacity: 1,
    strokes: [stroke('s1', 'brush'), stroke('e1', 'eraser'), stroke('s2', 'pencil')],
  };
  const ops = planLayer(layer, 100, 80);
  const inner = ops.slice(1, -1);
  assert.deepEqual(inner[0], { op: 'layer', opacity: 1, isolate: true });
  const draws = inner.filter(o => o.op === 'draw') as Extract<RasterOp, { op: 'draw' }>[];
  assert.deepEqual(draws.map(d => !!d.paint.erase), [false, true, false]);
  assert.equal(draws[2].paint.cap, 'square'); // crayon
  assert.equal(draws[0].paint.cap, 'round');
  assert.equal(draws[0].paint.opacity, 0.5);
  if (draws[0].geom.kind === 'path') assert.equal(draws[0].geom.d, buildSvgPath(layer.strokes[0]));
});

test('formes de taille nulle ignorées (comme le Svg), ligne toujours tracée', () => {
  const layer: RasterLayer = {
    id: 'a', visible: true, opacity: 1, strokes: [],
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0, h: 5, color: '#000', size: 1, opacity: 1, fill: false },
      { kind: 'line', x: 0, y: 0, w: 0, h: 5, color: '#000', size: 1, opacity: 1, fill: false },
    ],
  };
  assert.deepEqual(kinds(planLayer(layer, 10, 10)), ['layer', 'draw:line', 'restore']);
});

test('sélection déplacée : dehors en place, dedans décalé sans remplissage, puis contour', () => {
  const layer: RasterLayer = { id: 'a', visible: true, opacity: 1, strokes: [stroke('s', 'brush', [[5, 5]]), stroke('f', 'fill')] };
  const other: RasterLayer = { id: 'b', visible: true, opacity: 1, strokes: [stroke('t', 'brush')] };
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const ops = planDocRaster(scene({ background: { kind: 'none' }, layers: [layer, other], selection: { points, offset: { x: 3, y: 4 } } }));
  const clips = ops.filter(o => o.op === 'clip') as Extract<RasterOp, { op: 'clip' }>[];
  assert.equal(clips.length, 2);
  assert.equal(clips[0].inside, false);
  assert.deepEqual(clips[0].points, points);
  assert.equal(clips[1].inside, true);
  assert.deepEqual(clips[1].points[1], { x: 13, y: 4 });
  // Moitié « dedans » : trait décalé, pas de rectangle de remplissage.
  const i1 = ops.indexOf(clips[1]);
  const inHalf = ops.slice(i1, ops.indexOf(ops.find((o, i) => i > i1 && o.op === 'draw' && o.geom.kind === 'path')!) + 1);
  assert.ok(!inHalf.some(o => o.op === 'draw' && o.geom.kind === 'rect'));
  const moved = inHalf[inHalf.length - 1];
  if (moved.op === 'draw' && moved.geom.kind === 'path') assert.ok(moved.geom.d.startsWith('M 8 9'));
  // Contour pointillé de la sélection en dernier.
  const last = ops[ops.length - 1];
  assert.ok(last.op === 'draw' && last.geom.kind === 'poly' && last.paint.dash?.[0] === 6);
});

test('sélection immobile : calques normaux, contour quand même', () => {
  const layer: RasterLayer = { id: 'a', visible: true, opacity: 1, strokes: [stroke('s', 'brush')] };
  const ops = planDocRaster(scene({ background: { kind: 'none' }, layers: [layer], selection: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], offset: { x: 0, y: 0 } } }));
  assert.ok(!ops.some(o => o.op === 'clip'));
  assert.equal(kinds(ops).filter(k => k === 'draw:poly').length, 2);
});

test('poignées de l\'outil Transformer sous les calques', () => {
  const layer: RasterLayer = { id: 'a', visible: true, opacity: 1, strokes: [stroke('s', 'brush')] };
  const ops = planDocRaster(scene({
    background: { kind: 'none' }, layers: [layer],
    transformBox: { x: 0, y: 0, w: 10, h: 10, color: '#f00', strokeWidth: 2, handleR: 3 },
  }));
  assert.deepEqual(kinds(ops).slice(0, 6), ['draw:rect', 'draw:circle', 'draw:circle', 'draw:circle', 'draw:circle', 'layer']);
});

test('URL data: → base64', () => {
  assert.equal(dataUrlBase64('data:image/png;base64,QUJD'), 'QUJD');
  assert.equal(dataUrlBase64('file:///x.png'), null);
  assert.equal(dataUrlBase64('data:image/svg+xml,<svg/>'), null);
});

// ─── Reconstruction incrémentale ──────────────────────────────────────
import { planIncremental } from '../pixelRaster';

const opaque = (s: ReturnType<typeof stroke>) => ({ ...s, opacity: 1 });

test('incrémental : trait ajouté au calque du dessus → seulement ce trait', () => {
  const s1 = opaque(stroke('s1', 'brush'));
  const s2 = opaque(stroke('s2', 'brush'));
  const bottom: RasterLayer = { id: 'b', visible: true, opacity: 0.5, strokes: [s1] };
  const top: RasterLayer = { id: 'a', visible: true, opacity: 1, strokes: [s1] };
  const prev = scene({ layers: [bottom, top] });
  const next = scene({ layers: [bottom, { ...top, strokes: [s1, s2] }] });
  const ops = planIncremental(prev, next);
  if (!ops) throw new Error('incrémental attendu');
  const draws = ops.filter(o => o.op === 'draw');
  assert.equal(draws.length, 1);
  assert.deepEqual(draws[0].op === 'draw' && draws[0].geom, { kind: 'path', d: buildSvgPath(s2) });
  // Mêmes groupes que le rendu complet (calque, calque isolé des traits).
  assert.deepEqual(kinds(ops), ['layer', 'layer', 'draw:path', 'restore', 'restore']);
});

test('incrémental : un trait après une gomme reste dessiné par-dessus', () => {
  const s1 = opaque(stroke('s1', 'brush'));
  const er = stroke('e', 'eraser');
  const s2 = opaque(stroke('s2', 'pencil'));
  const l: RasterLayer = { id: 'a', visible: true, opacity: 1, strokes: [s1, er] };
  const ops = planIncremental(scene({ layers: [l] }), scene({ layers: [{ ...l, strokes: [s1, er, s2] }] }));
  if (!ops) throw new Error('incrémental attendu');
  assert.equal(ops.filter(o => o.op === 'draw' && o.paint.erase).length, 0);
});

test('incrémental refusé (rendu complet) dans tous les cas non sûrs', () => {
  const s1 = opaque(stroke('s1', 'brush'));
  const s2 = opaque(stroke('s2', 'brush'));
  const l: RasterLayer = { id: 'a', visible: true, opacity: 1, strokes: [s1] };
  const add = (over: Partial<RasterLayer> = {}): RasterLayer => ({ ...l, strokes: [s1, s2], ...over });
  const prev = scene({ layers: [l] });
  // Gomme ou remplissage ajouté.
  assert.equal(planIncremental(prev, scene({ layers: [add({ strokes: [s1, stroke('e', 'eraser')] })] })), null);
  assert.equal(planIncremental(prev, scene({ layers: [add({ strokes: [s1, stroke('f', 'fill')] })] })), null);
  // Annulation (trait retiré) ou trait modifié.
  assert.equal(planIncremental(scene({ layers: [add()] }), prev), null);
  assert.equal(planIncremental(prev, scene({ layers: [add({ strokes: [{ ...s1 }, s2] })] })), null);
  // Calque à opacité < 1 (mélange non associatif avec le groupe).
  const half = { ...l, opacity: 0.5 };
  assert.equal(planIncremental(scene({ layers: [half] }), scene({ layers: [{ ...half, strokes: [s1, s2] }] })), null);
  // Opacité changée, calque masqué.
  assert.equal(planIncremental(prev, scene({ layers: [add({ opacity: 0.9 })] })), null);
  assert.equal(planIncremental(prev, scene({ layers: [add({ visible: false })] })), null);
  // Textes du calque (dessinés APRÈS les traits).
  const texts = [{ x: 1, y: 1, value: 'a', size: 10, color: '#000', opacity: 1 }];
  const lt = { ...l, texts };
  assert.equal(planIncremental(scene({ layers: [lt] }), scene({ layers: [{ ...lt, strokes: [s1, s2] }] })), null);
  // Calque visible au-dessus.
  const above: RasterLayer = { id: 'z', visible: true, opacity: 1, strokes: [] };
  assert.equal(planIncremental(scene({ layers: [l, above] }), scene({ layers: [add(), above] })), null);
  // Deux calques modifiés.
  const l2: RasterLayer = { id: 'c', visible: true, opacity: 1, strokes: [] };
  assert.equal(planIncremental(scene({ layers: [l2, l] }), scene({ layers: [{ ...l2, strokes: [s2] }, add()] })), null);
  // Sélection, poignées, fond, grille, taille, nombre de calques.
  const sel = { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], offset: { x: 0, y: 0 } };
  assert.equal(planIncremental(prev, scene({ layers: [add()], selection: sel })), null);
  const tb = { x: 0, y: 0, w: 10, h: 10, color: '#000', strokeWidth: 1, handleR: 2 };
  assert.equal(planIncremental(prev, scene({ layers: [add()], transformBox: tb })), null);
  assert.equal(planIncremental(prev, scene({ layers: [add()], background: { kind: 'checker' } })), null);
  assert.equal(planIncremental(prev, scene({ layers: [add()], background: { kind: 'color', color: '#000' } })), null);
  assert.equal(planIncremental(prev, scene({ layers: [add()], grid: '#000' })), null);
  assert.equal(planIncremental(prev, scene({ layers: [add()], docW: 101 })), null);
  assert.equal(planIncremental(prev, scene({ layers: [add(), l2] })), null);
  // Autre calque à la même place (ordre changé).
  assert.equal(planIncremental(prev, scene({ layers: [{ ...add(), id: 'x' }] })), null);
});

test('incrémental : calque masqué au-dessus, ou modifié mais masqué → accepté', () => {
  const s1 = opaque(stroke('s1', 'brush'));
  const s2 = opaque(stroke('s2', 'brush'));
  const l: RasterLayer = { id: 'a', visible: true, opacity: 1, strokes: [s1] };
  const hidden: RasterLayer = { id: 'h', visible: false, opacity: 1, strokes: [] };
  const ops = planIncremental(
    scene({ layers: [l, hidden] }),
    scene({ layers: [{ ...l, strokes: [s1, s2] }, { ...hidden, strokes: [s2] }] }),
  );
  assert.ok(ops && ops.length > 0);
  // Rien de visible n'a changé : [] (raster précédent repris tel quel).
  assert.deepEqual(planIncremental(scene({ layers: [l] }), scene({ layers: [{ ...l, name: 'x' } as RasterLayer] })), []);
  const same = scene({ layers: [l] });
  assert.deepEqual(planIncremental(same, same), []);
});

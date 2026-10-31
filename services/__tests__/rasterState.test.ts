import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStrokeToRaster, createRasterState, stripRasterTiles, keepLocalRasterTiles, TileCodec } from '../rasterState';
import { createRasterLayer, samplePixel } from '../rasterTiles';

// Codec factice : stocke les buffers dans une table, url = index.
const store: Uint8ClampedArray[] = [];
const codec: TileCodec = {
  encode: b => { store.push(b.slice()); return `fake:${store.length - 1}`; },
  decode: async u => store[Number(u.slice(5))]?.slice() ?? null,
};
const pixel = (s: ReturnType<typeof createRasterState>, x: number, y: number) => {
  const l = createRasterLayer(s.w, s.h);
  for (const [k, u] of Object.entries(s.tiles)) l.tiles.set(k, store[Number(u.slice(5))]);
  return samplePixel(l, x, y);
};
const brush = { color: '#00ff00', size: 12, opacity: 1, tool: 'brush' };

test('un trait crée des tuiles et ne modifie pas l\'état précédent', async () => {
  const s0 = createRasterState(600, 600);
  const s1 = await applyStrokeToRaster(s0, { ...brush, points: [{ x: 10, y: 10 }, { x: 400, y: 10 }] }, codec);
  assert.deepEqual(Object.keys(s0.tiles), []);
  assert.deepEqual(Object.keys(s1.tiles).sort(), ['0,0', '1,0']);
  assert.equal(pixel(s1, 300, 10).g, 255);
});

test('gomme puis redessin', async () => {
  let s = createRasterState(300, 300);
  s = await applyStrokeToRaster(s, { ...brush, points: [{ x: 50, y: 50 }] }, codec);
  s = await applyStrokeToRaster(s, { ...brush, tool: 'eraser', size: 40, points: [{ x: 50, y: 50 }] }, codec);
  assert.deepEqual(Object.keys(s.tiles), []);
  s = await applyStrokeToRaster(s, { ...brush, color: '#0000ff', points: [{ x: 50, y: 50 }] }, codec);
  assert.equal(pixel(s, 50, 50).b, 255);
});

test('envoi : tuiles retirées ; réception : tuiles locales gardées', () => {
  const local = { layers: [{ id: 'a', raster: { w: 1, h: 1, tile: 256, tiles: { '0,0': 'x' } } }] };
  const sent = stripRasterTiles(local);
  assert.equal((sent.layers[0].raster as any).tiles, undefined);
  assert.equal((local.layers[0].raster as any).tiles['0,0'], 'x');
  const back = keepLocalRasterTiles(sent, local);
  assert.equal((back.layers[0].raster as any).tiles['0,0'], 'x');
});

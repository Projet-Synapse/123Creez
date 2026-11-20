import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPreviewDate, formatPreviewDimensions, formatPreviewSize, formatPreviewLayerCount,
  buildCanvasPreview,
} from '../canvasPreview';

test('formatPreviewDate : jour, mois français, année et heure', () => {
  const ts = Date.UTC(2026, 10, 20, 12, 0, 0);
  const label = formatPreviewDate(ts);
  assert.ok(/20 nov\. 2026, \d{2}:\d{2}/.test(label), label);
});

test('formatPreviewDimensions et taille et calques', () => {
  assert.equal(formatPreviewDimensions(1000, 700), '1000 × 700 px');
  assert.equal(formatPreviewSize(83), '83 o');
  assert.equal(formatPreviewSize(2048), '2.0 Ko');
  assert.equal(formatPreviewSize(2.5 * 1024 * 1024), '2.50 Mo');
  assert.equal(formatPreviewLayerCount(0), '0 calque');
  assert.equal(formatPreviewLayerCount(1), '1 calque');
  assert.equal(formatPreviewLayerCount(4), '4 calques');
});

test('buildCanvasPreview : nom, création, dimensions ; modification seulement si plus tardive', () => {
  const created = Date.UTC(2026, 10, 18, 10, 0, 0);
  const justCreated = {
    name: 'Paysage',
    createdAt: created,
    updatedAt: created,
    width: 1000,
    height: 700,
  };
  const fresh = buildCanvasPreview(justCreated);
  assert.equal(fresh.name, 'Paysage');
  assert.deepEqual(fresh.rows.map(r => r.key), ['created', 'dimensions']);
  assert.equal(fresh.rows[1].value, '1000 × 700 px');

  const richer = buildCanvasPreview(
    { ...justCreated, updatedAt: created + 60_000 },
    { folderName: 'Mes dessins', layerCount: 4, dataBytes: 2 * 1024 * 1024, drawingTimeLabel: '12 min' },
  );
  assert.deepEqual(richer.rows.map(r => r.key), ['created', 'updated', 'dimensions', 'layers', 'folder', 'size', 'time']);
  assert.equal(richer.rows.find(r => r.key === 'layers')?.value, '4 calques');
  assert.equal(richer.rows.find(r => r.key === 'folder')?.value, 'Mes dessins');
  assert.equal(richer.rows.find(r => r.key === 'size')?.value, '2.00 Mo');
  assert.equal(richer.rows.find(r => r.key === 'time')?.value, '12 min');
});

test('buildCanvasPreview : pas de dossier / taille / calques si absents', () => {
  const info = buildCanvasPreview({
    name: 'Croquis',
    createdAt: 1,
    updatedAt: 1,
    width: 400,
    height: 400,
  }, { folderName: null, layerCount: null, dataBytes: 0 });
  assert.ok(!info.rows.some(r => r.key === 'folder' || r.key === 'layers' || r.key === 'size'));
});

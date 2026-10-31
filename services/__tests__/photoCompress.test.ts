import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitPhotoSize, hasTransparency, mimeMayHaveAlpha } from '../photoCompress';

test('fitPhotoSize réduit le côté long à 2048 en gardant le ratio', () => {
  assert.deepEqual(fitPhotoSize(4096, 3072), { width: 2048, height: 1536 });
  assert.deepEqual(fitPhotoSize(1000, 4000), { width: 512, height: 2048 });
});
test("fitPhotoSize n'agrandit jamais", () => {
  assert.deepEqual(fitPhotoSize(800, 600), { width: 800, height: 600 });
});
test('hasTransparency détecte un alpha < 255', () => {
  assert.equal(hasTransparency([0, 0, 0, 255, 1, 1, 1, 255]), false);
  assert.equal(hasTransparency([0, 0, 0, 255, 1, 1, 1, 10]), true);
});
test('mimeMayHaveAlpha', () => {
  assert.equal(mimeMayHaveAlpha('image/jpeg'), false);
  assert.equal(mimeMayHaveAlpha('image/png'), true);
});

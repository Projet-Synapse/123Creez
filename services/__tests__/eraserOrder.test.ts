import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraserSegments } from '../eraserOrder';

const s = (id: string, tool: string) => ({ id, tool });

test('gomme puis nouveau trait : le nouveau trait est dans un tronçon APRÈS la gomme', () => {
  const seg = eraserSegments([s('a', 'pen'), s('e1', 'eraser'), s('b', 'pen')]);
  assert.deepEqual(seg.map(x => [x.draws.map(d => d.id), x.erasers.map(e => e.id)]), [
    [['a'], ['e1']],
    [['b'], []],
  ]);
});

test('alternances et remplissages ignorés', () => {
  const seg = eraserSegments([s('f', 'fill'), s('e0', 'eraser'), s('a', 'pen'), s('b', 'brush'), s('e1', 'eraser'), s('e2', 'eraser'), s('c', 'pen'), s('e3', 'eraser')]);
  assert.deepEqual(seg.map(x => [x.draws.map(d => d.id), x.erasers.map(e => e.id)]), [
    [[], ['e0']],
    [['a', 'b'], ['e1', 'e2']],
    [['c'], ['e3']],
  ]);
});

test('sans gomme : un seul tronçon', () => {
  assert.equal(eraserSegments([s('a', 'pen'), s('b', 'pen')]).length, 1);
  assert.equal(eraserSegments([]).length, 0);
});

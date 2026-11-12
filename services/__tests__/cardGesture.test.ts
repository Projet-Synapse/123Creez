import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_DRAG_HOLD_MS, CARD_MOVE_SLOP_PX,
  isMouseEvent, shouldBlockNativeResponder, decideMove, shouldStartDragOnHold,
  decideRelease, allowTermination, scrollEnabledWhileDragging,
  type CardGestureState,
} from '../cardGesture';

const touch = (o: Partial<CardGestureState> = {}): CardGestureState => ({ isMouse: false, dragging: false, cancelled: false, ...o });
const mouse = (o: Partial<CardGestureState> = {}): CardGestureState => ({ isMouse: true, dragging: false, cancelled: false, ...o });

test('constantes : appui long 450 ms, seuil 8 px', () => {
  assert.equal(CARD_DRAG_HOLD_MS, 450);
  assert.equal(CARD_MOVE_SLOP_PX, 8);
});

test('détection souris', () => {
  assert.equal(isMouseEvent({ type: 'mousedown' }), true);
  assert.equal(isMouseEvent({ type: 'mousemove' }), true);
  assert.equal(isMouseEvent({ type: 'touchstart' }), false);
  assert.equal(isMouseEvent({}), false);
  assert.equal(isMouseEvent(undefined), false);
  assert.equal(isMouseEvent({ type: 42 }), false);
});

test('au doigt, la carte ne bloque pas le défilement natif (Android)', () => {
  assert.equal(shouldBlockNativeResponder(false), false);
  assert.equal(shouldBlockNativeResponder(true), true);
});

test('tactile : tap immobile → ouvre', () => {
  const s = touch();
  assert.equal(decideMove(s, 3, 4), 'none'); // 5 px : sous le seuil
  assert.equal(decideRelease(s), 'tap');
});

test('tactile : bouger avant l\'appui long → défilement, ni tap ni glisser', () => {
  const s = touch();
  assert.equal(decideMove(s, 0, 9), 'scroll');
  s.cancelled = true;
  assert.equal(shouldStartDragOnHold(s), false);
  assert.equal(decideRelease(s), 'none');
  assert.equal(allowTermination(s), true);
});

test('tactile : seuil inclusif à 8 px', () => {
  assert.equal(decideMove(touch(), 8, 0), 'none');
  assert.equal(decideMove(touch(), 8.01, 0), 'scroll');
});

test('tactile : appui long immobile → décolle, puis dépôt au relâchement', () => {
  const s = touch();
  assert.equal(shouldStartDragOnHold(s), true);
  s.dragging = true;
  assert.equal(decideMove(s, 100, 100), 'none'); // on promène la carte
  assert.equal(allowTermination(s), false); // le défilement ne la vole plus
  assert.equal(decideRelease(s), 'drop');
});

test('souris : le glisser démarre dès que le pointeur bouge, pas d\'appui long', () => {
  const s = mouse();
  assert.equal(shouldStartDragOnHold(s), false);
  assert.equal(decideMove(s, 10, 0), 'startDrag');
  assert.equal(decideRelease(mouse()), 'tap');
});

test('le ScrollView est figé seulement pendant un glisser', () => {
  assert.equal(scrollEnabledWhileDragging(false), true);
  assert.equal(scrollEnabledWhileDragging(true), false);
});

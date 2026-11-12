import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPanelWidth, withAlpha, editorChromeBg, editorMenuBg, chromeInsets,
  PANEL_WIDTH_DEFAULT, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX, TOOLBAR_WIDTH, RESIZE_HANDLE_WIDTH,
} from '../editorChrome';

test('largeur du panneau : défaut si absente ou invalide', () => {
  assert.equal(clampPanelWidth(undefined), PANEL_WIDTH_DEFAULT);
  assert.equal(clampPanelWidth(NaN), PANEL_WIDTH_DEFAULT);
  assert.equal(clampPanelWidth('200'), PANEL_WIDTH_DEFAULT);
});

test('largeur sauvée trop large (ancien max 420) → nouveau max compact', () => {
  assert.equal(clampPanelWidth(420), PANEL_WIDTH_MAX);
  assert.equal(clampPanelWidth(300), PANEL_WIDTH_MAX);
  assert.ok(PANEL_WIDTH_MAX <= 260);
});

test('largeur trop étroite → min ; valeur dans la plage gardée (arrondie)', () => {
  assert.equal(clampPanelWidth(40), PANEL_WIDTH_MIN);
  assert.equal(clampPanelWidth(200), 200);
  assert.equal(clampPanelWidth(180.6), 181);
  assert.ok(PANEL_WIDTH_MIN <= PANEL_WIDTH_DEFAULT && PANEL_WIDTH_DEFAULT <= PANEL_WIDTH_MAX);
});

test('withAlpha : hex long, hex court, rgb(a), et repli', () => {
  assert.equal(withAlpha('#141414', 0.72), 'rgba(20, 20, 20, 0.72)');
  assert.equal(withAlpha('#fff', 0.5), 'rgba(255, 255, 255, 0.5)');
  assert.equal(withAlpha('rgba(1, 2, 3, 1)', 0.3), 'rgba(1, 2, 3, 0.3)');
  assert.equal(withAlpha('rgb(1,2,3)', 2), 'rgba(1, 2, 3, 1)');
  assert.equal(withAlpha('transparent', 0.5), 'transparent');
});

test('fond des barres translucide, menus plus opaques', () => {
  assert.equal(editorChromeBg('#141414'), 'rgba(20, 20, 20, 0.72)');
  assert.equal(editorMenuBg('#141414'), 'rgba(20, 20, 20, 0.94)');
});

test('insets : barre d\'outils à gauche, panneau ouvert', () => {
  const r = chromeInsets({ toolbarPosition: 'left', fullDraw: false, panelVisible: true, panelWidth: 172 });
  assert.deepEqual(r, { left: TOOLBAR_WIDTH, right: 172 + RESIZE_HANDLE_WIDTH, panelRight: 0 });
});

test('insets : barre d\'outils à droite → le panneau se décale de sa largeur', () => {
  const r = chromeInsets({ toolbarPosition: 'right', fullDraw: false, panelVisible: true, panelWidth: 172 });
  assert.deepEqual(r, { left: 0, right: TOOLBAR_WIDTH + 172 + RESIZE_HANDLE_WIDTH, panelRight: TOOLBAR_WIDTH });
});

test('insets : panneau fermé, plein écran (barre d\'outils masquée)', () => {
  assert.deepEqual(
    chromeInsets({ toolbarPosition: 'right', fullDraw: false, panelVisible: false, panelWidth: 172 }),
    { left: 0, right: TOOLBAR_WIDTH, panelRight: TOOLBAR_WIDTH },
  );
  assert.deepEqual(
    chromeInsets({ toolbarPosition: undefined, fullDraw: true, panelVisible: false, panelWidth: 172 }),
    { left: 0, right: 0, panelRight: 0 },
  );
});

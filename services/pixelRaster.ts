// Plan de dessin de l'instantané de la vue pixélisée (logique PURE, sans
// React Native, testée dans services/__tests__/pixelRaster.test.ts).
//
// Le Svg de l'éditeur est décrit ici sous forme d'une liste d'opérations
// simples, dans le MÊME ordre que DrawingCanvas + CanvasArt (fond, grille,
// poignées, calques, sélection). Sur Android / iOS, services/pixelSnapshot.ts
// exécute ce plan avec Skia dans une surface de docW × docH px : un pixel par
// pixel de document, photos échantillonnées en plus proche voisin. Affichage
// seul : rien n'est exporté depuis ce plan.
import { eraserSegments } from './eraserOrder';
import { buildSvgPath, strokeLinecap } from './strokePath';

export interface RasterPoint { x: number; y: number }

export interface RasterPaint {
  color: string;
  /** Multiplie l'alpha de la couleur (strokeOpacity / opacity du Svg). */
  opacity: number;
  style: 'fill' | 'stroke';
  width?: number;
  cap?: 'round' | 'square' | 'butt';
  join?: 'round' | 'miter';
  dash?: number[];
  /** Gomme : efface ce qui est déjà dans le calque isolé (masque noir du Svg). */
  erase?: boolean;
}

export type RasterGeom =
  | { kind: 'path'; d: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'oval'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'poly'; points: RasterPoint[] };

export type RasterOp =
  | { op: 'draw'; geom: RasterGeom; paint: RasterPaint }
  /** Groupe avec une opacité (saveLayer si < 1). isolate : calque isolé même
      à opacité 1, pour que la gomme n'efface que son contenu. Fermé par 'restore'. */
  | { op: 'layer'; opacity: number; isolate?: boolean }
  /** save + découpe au polygone (dedans ou dehors) ; fermé par 'restore'. */
  | { op: 'clip'; points: RasterPoint[]; inside: boolean }
  | { op: 'restore' }
  /** Damier de transparence (cases de `size` unités, comme CheckerBg). */
  | { op: 'checker'; w: number; h: number; size: number }
  /** Photo : boîte du Svg (« meet » appliqué à l'exécution), rotation autour du centre. */
  | { op: 'image'; src: string; x: number; y: number; w: number; h: number; angle: number }
  | { op: 'text'; x: number; y: number; value: string; size: number; color: string; opacity: number };

export interface RasterStroke { id: string; tool: string; points: RasterPoint[]; color: string; size: number; opacity: number }
export interface RasterLayer {
  id: string;
  visible: boolean;
  opacity: number;
  strokes: RasterStroke[];
  images?: { src: string; x: number; y: number; width: number; height: number; angle?: number }[];
  shapes?: { kind: 'line' | 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; color: string; size: number; opacity: number; fill: boolean }[];
  texts?: { x: number; y: number; value: string; size: number; color: string; opacity: number }[];
}

export interface RasterScene {
  docW: number;
  docH: number;
  /** Fond : couleur unie, damier, ou rien (transparence réelle). */
  background: { kind: 'color'; color: string } | { kind: 'checker' } | { kind: 'none' };
  /** Couleur de la grille (null = pas de grille). */
  grid: string | null;
  /** Couleur des points (null = pas de points). */
  dots: string | null;
  layers: RasterLayer[];
  activeLayerId: string;
  selection: { points: RasterPoint[]; offset: RasterPoint } | null;
  /** Poignées de l'outil Transformer (déjà dimensionnées en unités de toile). */
  transformBox: { x: number; y: number; w: number; h: number; color: string; strokeWidth: number; handleR: number } | null;
}

/** Couleur du contour de sélection (identique à DrawingCanvas). */
export const SEL_COLOR = '#4ecdc4';
/** Pas de la grille et des points (identique à GridOverlay / DotsOverlay). */
export const GRID_STEP = 40;
/** Taille d'une case du damier (identique à CheckerBg). */
export const CHECKER_SIZE = 12;

/** Un calque, comme CanvasArt : images, formes, remplissage, traits (gomme), textes. */
export function planLayer(
  layer: RasterLayer, docW: number, docH: number,
  dx = 0, dy = 0, includeFill = true,
): RasterOp[] {
  if (!layer.visible) return [];
  const ops: RasterOp[] = [{ op: 'layer', opacity: layer.opacity }];
  for (const img of layer.images ?? []) {
    ops.push({ op: 'image', src: img.src, x: img.x + dx, y: img.y + dy, w: img.width, h: img.height, angle: img.angle ?? 0 });
  }
  for (const sh of layer.shapes ?? []) {
    const stroke: RasterPaint = { color: sh.color, opacity: sh.opacity, style: 'stroke', width: sh.size };
    if (sh.kind === 'line') {
      ops.push({ op: 'draw', geom: { kind: 'line', x1: sh.x + dx, y1: sh.y + dy, x2: sh.x + dx + sh.w, y2: sh.y + dy + sh.h }, paint: { ...stroke, cap: 'round' } });
      continue;
    }
    // Svg : largeur ou hauteur nulle → rien n'est dessiné.
    if (!(sh.w > 0 && sh.h > 0)) continue;
    const box = { x: sh.x + dx, y: sh.y + dy, w: sh.w, h: sh.h };
    const geom: RasterGeom = sh.kind === 'rect' ? { kind: 'rect', ...box } : { kind: 'oval', ...box };
    // Le remplissage du Svg n'a pas d'opacité propre (fill-opacity = 1).
    if (sh.fill) ops.push({ op: 'draw', geom, paint: { color: sh.color, opacity: 1, style: 'fill' } });
    ops.push({ op: 'draw', geom, paint: { ...stroke, join: 'miter', cap: 'butt' } });
  }
  const fills = layer.strokes.filter(s => s.tool === 'fill');
  if (includeFill && fills.length > 0) {
    const last = fills[fills.length - 1];
    ops.push({ op: 'draw', geom: { kind: 'rect', x: 0, y: 0, w: docW, h: docH }, paint: { color: last.color, opacity: last.opacity, style: 'fill' } });
  }
  // Traits : calque isolé, chaque gomme efface tout ce qui la PRÉCÈDE
  // (même résultat que les masques imbriqués de CanvasArt).
  const segments = eraserSegments(layer.strokes);
  if (segments.length > 0) {
    ops.push({ op: 'layer', opacity: 1, isolate: true });
    for (const seg of segments) {
      for (const s of seg.draws) {
        const d = buildSvgPath(s, dx, dy);
        if (!d) continue;
        ops.push({ op: 'draw', geom: { kind: 'path', d }, paint: { color: s.color, opacity: s.opacity, style: 'stroke', width: s.size, cap: strokeLinecap(s.tool), join: 'round' } });
      }
      for (const s of seg.erasers) {
        const d = buildSvgPath(s, dx, dy);
        if (!d) continue;
        ops.push({ op: 'draw', geom: { kind: 'path', d }, paint: { color: '#000000', opacity: 1, style: 'stroke', width: s.size, cap: 'round', join: 'round', erase: true } });
      }
    }
    ops.push({ op: 'restore' });
  }
  for (const t of layer.texts ?? []) {
    ops.push({ op: 'text', x: t.x + dx, y: t.y + dy, value: t.value, size: t.size, color: t.color, opacity: t.opacity });
  }
  ops.push({ op: 'restore' });
  return ops;
}

/** Toute la toile, dans l'ordre du Svg de DrawingCanvas. */
export function planDocRaster(scene: RasterScene): RasterOp[] {
  const { docW, docH } = scene;
  const ops: RasterOp[] = [];
  if (scene.background.kind === 'checker') ops.push({ op: 'checker', w: docW, h: docH, size: CHECKER_SIZE });
  else if (scene.background.kind === 'color') {
    ops.push({ op: 'draw', geom: { kind: 'rect', x: 0, y: 0, w: docW, h: docH }, paint: { color: scene.background.color, opacity: 1, style: 'fill' } });
  }
  if (scene.grid) {
    const paint: RasterPaint = { color: scene.grid, opacity: 1, style: 'stroke', width: 0.5, cap: 'butt' };
    for (let x = GRID_STEP; x < docW; x += GRID_STEP) ops.push({ op: 'draw', geom: { kind: 'line', x1: x, y1: 0, x2: x, y2: docH }, paint });
    for (let y = GRID_STEP; y < docH; y += GRID_STEP) ops.push({ op: 'draw', geom: { kind: 'line', x1: 0, y1: y, x2: docW, y2: y }, paint });
  }
  if (scene.dots) {
    const paint: RasterPaint = { color: scene.dots, opacity: 1, style: 'fill' };
    for (let x = GRID_STEP; x < docW; x += GRID_STEP)
      for (let y = GRID_STEP; y < docH; y += GRID_STEP) ops.push({ op: 'draw', geom: { kind: 'circle', cx: x, cy: y, r: 1 }, paint });
  }
  // Poignées de l'outil Transformer : SOUS les calques, comme dans le Svg.
  const tb = scene.transformBox;
  if (tb) {
    const line: RasterPaint = { color: tb.color, opacity: 1, style: 'stroke', width: tb.strokeWidth };
    ops.push({ op: 'draw', geom: { kind: 'rect', x: tb.x, y: tb.y, w: tb.w, h: tb.h }, paint: { ...line, dash: [10, 6] } });
    for (const h of [{ cx: tb.x + tb.w, cy: tb.y + tb.h, fill: tb.color }, { cx: tb.x + tb.w, cy: tb.y, fill: '#ffffff' }]) {
      ops.push({ op: 'draw', geom: { kind: 'circle', cx: h.cx, cy: h.cy, r: tb.handleR }, paint: { color: h.fill, opacity: 1, style: 'fill' } });
      ops.push({ op: 'draw', geom: { kind: 'circle', cx: h.cx, cy: h.cy, r: tb.handleR }, paint: line });
    }
  }
  const sel = scene.selection;
  const floating = !!sel && (sel.offset.x !== 0 || sel.offset.y !== 0);
  const moved = sel ? sel.points.map(p => ({ x: p.x + sel.offset.x, y: p.y + sel.offset.y })) : [];
  for (const layer of scene.layers) {
    if (!floating || layer.id !== scene.activeLayerId || !sel) {
      ops.push(...planLayer(layer, docW, docH));
      continue;
    }
    // Sélection déplacée : le dehors reste en place, le dedans suit le
    // décalage (sans le remplissage), comme les deux CanvasArt masqués.
    ops.push({ op: 'clip', points: sel.points, inside: false }, ...planLayer(layer, docW, docH), { op: 'restore' });
    ops.push({ op: 'clip', points: moved, inside: true }, ...planLayer(layer, docW, docH, sel.offset.x, sel.offset.y, false), { op: 'restore' });
  }
  if (sel && moved.length > 0) {
    ops.push({ op: 'draw', geom: { kind: 'poly', points: moved }, paint: { color: 'rgba(78,205,196,0.05)', opacity: 1, style: 'fill' } });
    ops.push({ op: 'draw', geom: { kind: 'poly', points: moved }, paint: { color: SEL_COLOR, opacity: 1, style: 'stroke', width: 1.5, cap: 'round', join: 'round', dash: [6, 4] } });
  }
  return ops;
}

/** Décode la partie base64 d'une URL data: ; null si ce n'en est pas une. */
export function dataUrlBase64(src: string): string | null {
  if (!src.startsWith('data:')) return null;
  const comma = src.indexOf(',');
  if (comma < 0 || !src.slice(0, comma).includes(';base64')) return null;
  return src.slice(comma + 1);
}

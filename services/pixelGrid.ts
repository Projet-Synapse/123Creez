// Maths PURES de la vue pixélisée (affichage seul), sans React Native :
// testables à part (services/__tests__/pixelGrid.test.ts).
//
// L'instantané fait exactement un pixel par pixel de document. Il est
// agrandi en « plus proche voisin » ; pour que chaque pixel de document soit
// un carré uni à bord franc, la transformation d'affichage est calée sur la
// grille des pixels PHYSIQUES de l'écran (origine et taille arrondies).

/** Taille du raster de l'instantané : un pixel par pixel de document. */
export function docRasterSize(docW: number, docH: number): { w: number; h: number } {
  return { w: Math.max(1, Math.round(docW)), h: Math.max(1, Math.round(docH)) };
}

/** Placement à l'écran (en dp) d'un raster posé en (0, 0) : x' = x + sx·u. */
export interface PixelViewTransform {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

/**
 * Transformation du raster (rasterW × rasterH) pour qu'il recouvre la toile
 * exactement comme le Svg zoomé (viewBox « meet », puis translate + scale
 * autour du centre de la zone, comme l'Animated.View), mais avec ses bords
 * arrondis au pixel physique (pr = PixelRatio). Écart avec le Svg : moins
 * d'un pixel physique. Worklet : appelée à chaque image du pinch / pan.
 */
export function pixelAlignedTransform(
  zoneW: number, zoneH: number, docW: number, docH: number,
  rasterW: number, rasterH: number,
  tx: number, ty: number, s: number, pr: number,
): PixelViewTransform {
  'worklet';
  const p = pr > 0 && Number.isFinite(pr) ? pr : 1;
  const k = Math.min(zoneW / docW, zoneH / docH);
  const fitX = (zoneW - docW * k) / 2;
  const fitY = (zoneH - docH * k) / 2;
  const cx = zoneW / 2;
  const cy = zoneH / 2;
  // Coin haut-gauche et taille de la toile à l'écran, en pixels physiques.
  const left = (cx + tx + s * (fitX - cx)) * p;
  const top = (cy + ty + s * (fitY - cy)) * p;
  const w = s * docW * k * p;
  const h = s * docH * k * p;
  const L = Math.round(left);
  const T = Math.round(top);
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  return { x: L / p, y: T / p, sx: W / p / rasterW, sy: H / p / rasterH };
}

/**
 * Échantillonnage « plus proche voisin » d'une rangée de pixels physiques :
 * le pixel physique d (centre en d + 0,5) prend la couleur du pixel source
 * floor((d + 0,5 − origine) / cellule). Renvoie, pour chaque pixel source
 * 0..count-1, le nombre de pixels physiques qui le montrent. Sert aux tests :
 * avec une origine entière, chaque pixel de document fait floor(cellule) ou
 * ceil(cellule) pixels, d'une seule couleur (aucun mélange possible).
 */
export function nearestRuns(originPx: number, cellPx: number, count: number): number[] {
  const runs = new Array<number>(count).fill(0);
  if (!(cellPx > 0) || count <= 0) return runs;
  const start = Math.floor(originPx);
  const end = Math.ceil(originPx + cellPx * count);
  for (let d = start; d < end; d++) {
    const i = Math.floor((d + 0.5 - originPx) / cellPx);
    if (i >= 0 && i < count) runs[i]++;
  }
  return runs;
}

/**
 * Rectangle où react-native-svg dessine une <Image> dans sa boîte, avec le
 * preserveAspectRatio par défaut (« xMidYMid meet ») : l'instantané raster
 * place la photo au même endroit que le Svg.
 */
export function imageMeetRect(
  x: number, y: number, w: number, h: number, natW: number, natH: number,
): { x: number; y: number; w: number; h: number } {
  if (!(natW > 0 && natH > 0)) return { x, y, w, h };
  const k = Math.min(w / natW, h / natH);
  const iw = natW * k;
  const ih = natH * k;
  return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

/** Opérations de transformation Skia (la première est la plus extérieure). */
export type PixelViewTransformOp =
  | { translateX: number }
  | { translateY: number }
  | { rotate: number }
  | { scaleX: number }
  | { scaleY: number };

/**
 * Transformation complète de la vue pixélisée, rotation de VUE comprise.
 * La rotation est faite DANS Skia (autour du centre de la zone, comme
 * l'Animated.View tournée du Svg), pour que l'échantillonnage reste en plus
 * proche voisin : une vue Skia tournée par le compositeur Android serait
 * rééchantillonnée en bilinéaire, donc floue. À 0°, aucune rotation n'est
 * ajoutée : résultat identique à pixelAlignedTransform seul.
 */
export function pixelViewTransformOps(
  t: PixelViewTransform, rotationDeg: number, zoneW: number, zoneH: number,
): PixelViewTransformOp[] {
  'worklet';
  const ops: PixelViewTransformOp[] = [];
  const deg = Number.isFinite(rotationDeg) ? rotationDeg % 360 : 0;
  if (deg !== 0) {
    const cx = zoneW / 2;
    const cy = zoneH / 2;
    ops.push(
      { translateX: cx }, { translateY: cy },
      { rotate: (deg * Math.PI) / 180 },
      { translateX: -cx }, { translateY: -cy },
    );
  }
  ops.push({ translateX: t.x }, { translateY: t.y }, { scaleX: t.sx }, { scaleY: t.sy });
  return ops;
}

/**
 * Applique une liste d'opérations à un point (même convention que Skia /
 * CSS : la première opération est la plus extérieure). Sert aux tests.
 */
export function applyTransformOps(ops: PixelViewTransformOp[], x: number, y: number): { x: number; y: number } {
  let px = x;
  let py = y;
  for (let i = ops.length - 1; i >= 0; i--) {
    const o = ops[i] as Record<string, number>;
    if ('translateX' in o) px += o.translateX;
    else if ('translateY' in o) py += o.translateY;
    else if ('scaleX' in o) px *= o.scaleX;
    else if ('scaleY' in o) py *= o.scaleY;
    else if ('rotate' in o) {
      const c = Math.cos(o.rotate);
      const s = Math.sin(o.rotate);
      const nx = px * c - py * s;
      py = px * s + py * c;
      px = nx;
    }
  }
  return { x: px, y: py };
}

// Moteur de pixels — étape 1 : cœur pur (aucune dépendance RN / Skia).
//
// Un calque pixel est découpé en tuiles RGBA de TILE × TILE px, créées à la
// demande (une zone vide ne coûte rien). Les pinceaux « tamponnent » des
// disques le long du trait ; la gomme retire de l'alpha (destination-out).
// Tout est en alpha NON prémultiplié, 8 bits par canal, comme ImageData.
// Le rendu (Skia / <canvas>) et le stockage viendront aux étapes suivantes ;
// ce module ne fait que calculer les pixels, il est donc testable sous Node.

export const TILE = 256;

export interface RasterLayerData {
  width: number;
  height: number;
  /** clé « tx,ty » → TILE*TILE*4 octets RGBA. */
  tiles: Map<string, Uint8ClampedArray>;
}

export interface Rgba { r: number; g: number; b: number; a: number }

export interface DabStyle {
  color: Rgba;
  /** Diamètre en px de document. */
  size: number;
  /** 0..1, multiplié à l'alpha de la couleur. */
  opacity: number;
  /** 0..1 : 1 = bord net, 0 = bord très doux. */
  hardness: number;
  erase?: boolean;
  /** Bord crénelé (outil Crayon pixel) : pas d'anticrénelage. */
  aliased?: boolean;
}

export const tileKey = (tx: number, ty: number) => `${tx},${ty}`;

export function createRasterLayer(width: number, height: number): RasterLayerData {
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), tiles: new Map() };
}

export function parseColor(hex: string, alpha = 1): Rgba {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0, a: Math.round(255 * alpha) };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: Math.round(255 * a * alpha) };
}

function getTile(layer: RasterLayerData, tx: number, ty: number, create: boolean): Uint8ClampedArray | undefined {
  const k = tileKey(tx, ty);
  let t = layer.tiles.get(k);
  if (!t && create) { t = new Uint8ClampedArray(TILE * TILE * 4); layer.tiles.set(k, t); }
  return t;
}

/** Couverture 0..1 d'un pixel situé à la distance d du centre d'un dab. */
function coverage(d: number, radius: number, hardness: number, aliased: boolean): number {
  if (aliased) return d <= radius ? 1 : 0;
  const edge = Math.max(0.75, radius * (1 - Math.min(1, Math.max(0, hardness))));
  const inner = radius - edge;
  if (d <= inner) return 1;
  if (d >= radius + 0.5) return 0;
  return Math.max(0, Math.min(1, (radius + 0.5 - d) / (edge + 0.5)));
}

/** Pose un dab (disque) centré en (cx, cy). Ajoute les tuiles touchées à dirty. */
export function stampDab(layer: RasterLayerData, cx: number, cy: number, s: DabStyle, dirty?: Set<string>): void {
  const radius = Math.max(0.5, s.size / 2);
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const x1 = Math.min(layer.width - 1, Math.ceil(cx + radius + 1));
  const y1 = Math.min(layer.height - 1, Math.ceil(cy + radius + 1));
  if (x1 < x0 || y1 < y0) return;
  const srcA = (s.color.a / 255) * Math.max(0, Math.min(1, s.opacity));
  for (let y = y0; y <= y1; y++) {
    const ty = Math.floor(y / TILE);
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = coverage(d, radius, s.hardness, !!s.aliased);
      if (cov <= 0) continue;
      const tx = Math.floor(x / TILE);
      const tile = getTile(layer, tx, ty, !s.erase);
      if (!tile) continue;
      dirty?.add(tileKey(tx, ty));
      const i = ((y - ty * TILE) * TILE + (x - tx * TILE)) * 4;
      const a = srcA * cov;
      const dA = tile[i + 3] / 255;
      if (s.erase) { tile[i + 3] = Math.round(dA * (1 - a) * 255); continue; }
      const outA = a + dA * (1 - a);
      if (outA <= 0) continue;
      tile[i] = Math.round((s.color.r * a + tile[i] * dA * (1 - a)) / outA);
      tile[i + 1] = Math.round((s.color.g * a + tile[i + 1] * dA * (1 - a)) / outA);
      tile[i + 2] = Math.round((s.color.b * a + tile[i + 2] * dA * (1 - a)) / outA);
      tile[i + 3] = Math.round(outA * 255);
    }
  }
}

/** Tamponne de `from` à `to` avec un espacement de 25 % du diamètre.
    Renvoie la distance restante à reporter sur le segment suivant, pour un
    espacement régulier sur tout le trait. */
export function stampSegment(
  layer: RasterLayerData, from: { x: number; y: number }, to: { x: number; y: number },
  s: DabStyle, carry = 0, dirty?: Set<string>,
): number {
  const spacing = Math.max(0.5, s.size * 0.25);
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  let t = carry;
  while (t <= len) {
    const k = len === 0 ? 0 : t / len;
    stampDab(layer, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, s, dirty);
    t += spacing;
    if (len === 0) return spacing;
  }
  return t - len;
}

/** Pipette : couleur d'un pixel (alpha 0 hors toile ou tuile absente). */
export function samplePixel(layer: RasterLayerData, x: number, y: number): Rgba {
  const px = Math.floor(x), py = Math.floor(y);
  if (px < 0 || py < 0 || px >= layer.width || py >= layer.height) return { r: 0, g: 0, b: 0, a: 0 };
  const t = layer.tiles.get(tileKey(Math.floor(px / TILE), Math.floor(py / TILE)));
  if (!t) return { r: 0, g: 0, b: 0, a: 0 };
  const i = ((py % TILE) * TILE + (px % TILE)) * 4;
  return { r: t[i], g: t[i + 1], b: t[i + 2], a: t[i + 3] };
}

/** Undo : copie des tuiles AVANT modification (null = tuile absente). */
export type TilePatch = Map<string, Uint8ClampedArray | null>;

export function captureTiles(layer: RasterLayerData, keys: Iterable<string>): TilePatch {
  const p: TilePatch = new Map();
  for (const k of keys) { const t = layer.tiles.get(k); p.set(k, t ? t.slice() : null); }
  return p;
}

/** Applique un patch et renvoie le patch inverse (pour redo). */
export function applyPatch(layer: RasterLayerData, patch: TilePatch): TilePatch {
  const inverse = captureTiles(layer, patch.keys());
  for (const [k, t] of patch) { if (t) layer.tiles.set(k, t.slice()); else layer.tiles.delete(k); }
  return inverse;
}

/** Supprime les tuiles devenues entièrement transparentes. */
export function pruneEmptyTiles(layer: RasterLayerData, keys?: Iterable<string>): void {
  for (const k of keys ?? [...layer.tiles.keys()]) {
    const t = layer.tiles.get(k);
    if (!t) continue;
    let empty = true;
    for (let i = 3; i < t.length; i += 4) if (t[i] !== 0) { empty = false; break; }
    if (empty) layer.tiles.delete(k);
  }
}

/** Octets mémoire occupés (estimation pour les garde-fous). */
export const rasterBytes = (layer: RasterLayerData) => layer.tiles.size * TILE * TILE * 4;

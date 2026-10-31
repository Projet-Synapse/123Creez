// Moteur de pixels — étape 1 : état sérialisable d'un calque pixel et
// application d'un trait. Indépendant de RN : l'encodage PNG est injecté
// (Skia sur Android, canvas 2D sur web/Electron), donc testable sous Node.
import {
  TILE, RasterLayerData, createRasterLayer, parseColor, stampSegment, stampDab,
  pruneEmptyTiles, DabStyle,
} from './rasterTiles';

/** Champ `raster` d'un calque « normal » en pixels. Les tuiles sont des
    dataURL PNG (étape 1 : stockage LOCAL uniquement, retirées à l'envoi). */
export interface RasterState {
  w: number;
  h: number;
  tile: number;
  tiles: Record<string, string>;
}

export interface TileCodec {
  encode: (rgba: Uint8ClampedArray) => string;
  decode: (dataUrl: string) => Promise<Uint8ClampedArray | null>;
}

export interface RasterStroke {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  opacity: number;
  tool: string;
}

export function createRasterState(w: number, h: number): RasterState {
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), tile: TILE, tiles: {} };
}

// Cache dataURL → pixels : évite de redécoder les tuiles qu'on vient d'encoder.
const bufferCache = new Map<string, Uint8ClampedArray>();
const CACHE_MAX = 256;
function remember(url: string, buf: Uint8ClampedArray) {
  bufferCache.delete(url);
  bufferCache.set(url, buf);
  while (bufferCache.size > CACHE_MAX) bufferCache.delete(bufferCache.keys().next().value as string);
}

export function styleForStroke(s: RasterStroke): DabStyle {
  return {
    color: parseColor(s.color),
    size: s.size,
    opacity: s.opacity,
    hardness: s.tool === 'pencil' ? 1 : 0.85,
    aliased: s.tool === 'pencil',
    erase: s.tool === 'eraser',
  };
}

/** Applique un trait (pinceau, crayon ou gomme) et renvoie un NOUVEL état
    (l'ancien reste intact : l'undo par instantanés de calques fonctionne). */
export async function applyStrokeToRaster(
  state: RasterState, stroke: RasterStroke, codec: TileCodec,
): Promise<RasterState> {
  const pts = stroke.points;
  if (pts.length === 0) return state;
  const layer: RasterLayerData = createRasterLayer(state.w, state.h);
  // Charge les tuiles existantes susceptibles d'être touchées (toutes, à
  // l'étape 1 : au plus quelques dizaines).
  for (const [k, url] of Object.entries(state.tiles)) {
    let buf = bufferCache.get(url);
    if (!buf) {
      const d = await codec.decode(url);
      if (!d) continue;
      buf = d;
    }
    layer.tiles.set(k, buf.slice());
  }
  const style = styleForStroke(stroke);
  const dirty = new Set<string>();
  if (pts.length === 1) stampDab(layer, pts[0].x, pts[0].y, style, dirty);
  let carry = 0;
  for (let i = 1; i < pts.length; i++) carry = stampSegment(layer, pts[i - 1], pts[i], style, carry, dirty);
  if (dirty.size === 0) return state;
  pruneEmptyTiles(layer, dirty);
  const tiles = { ...state.tiles };
  for (const k of dirty) {
    const buf = layer.tiles.get(k);
    if (!buf) { delete tiles[k]; continue; }
    const url = codec.encode(buf);
    remember(url, buf);
    tiles[k] = url;
  }
  return { ...state, tiles };
}

type AnyLayer = { id: string; raster?: RasterState | { tiles?: Record<string, string> } } & Record<string, unknown>;
type AnyCanvas = { layers: AnyLayer[] } & Record<string, unknown>;

/** Envoi vers Supabase (étape 1 = local seulement) : les tuiles sont
    retirées, seul un marqueur `raster` sans `tiles` part. */
export function stripRasterTiles<T extends AnyCanvas>(data: T): T {
  if (!data.layers.some(l => l.raster)) return data;
  return {
    ...data,
    layers: data.layers.map(l => {
      if (!l.raster) return l;
      const { tiles: _t, ...rest } = l.raster as RasterState;
      return { ...l, raster: { ...rest, localOnly: true } };
    }),
  };
}

/** Réception : une toile distante (sans tuiles) ne doit pas effacer les
    pixels locaux du même calque. */
export function keepLocalRasterTiles<T extends AnyCanvas>(remote: T, local: AnyCanvas | null): T {
  if (!local) return remote;
  const byId = new Map(local.layers.map(l => [l.id, l]));
  let changed = false;
  const layers = remote.layers.map(l => {
    const loc = byId.get(l.id)?.raster as RasterState | undefined;
    if (!loc?.tiles || (l.raster && (l.raster as RasterState).tiles)) return l;
    changed = true;
    return { ...l, raster: { ...(l.raster ?? {}), ...loc, tiles: loc.tiles } };
  });
  return changed ? { ...remote, layers } : remote;
}

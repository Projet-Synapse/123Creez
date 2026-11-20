// Décisions pures pour les vignettes de la galerie.
// La galerie ne doit PAS charger la toile complète (calques, images
// base64, traits) juste pour afficher une carte : une vignette JPEG
// basse résolution suffit. Testé dans services/__tests__/galleryThumb.test.ts.

/** Largeur max de la vignette (px) — largement assez pour une carte ou l'aperçu. */
export const GALLERY_THUMB_MAX_PX = 320;

export interface ThumbMeta {
  id: string;
  updatedAt: number;
  thumbnail?: string;
  thumbAt?: number;
  width: number;
  height: number;
}

/** La vignette stockée est encore valable (générée après la dernière sauvegarde). */
export function isThumbFresh(meta: ThumbMeta): boolean {
  return typeof meta.thumbnail === 'string'
    && meta.thumbnail.length > 0
    && (meta.thumbAt ?? 0) >= meta.updatedAt;
}

/** Faut-il lire le JSON complet de la toile pour l'afficher en galerie ? Non si la vignette est à jour. */
export function shouldLoadFullCanvasForDisplay(meta: ThumbMeta): boolean {
  return !isThumbFresh(meta);
}

/** Taille en pixels de la vignette, en conservant le ratio. */
export function thumbPixelSize(
  contentW: number,
  contentH: number,
  maxWidth = GALLERY_THUMB_MAX_PX,
): { w: number; h: number } {
  const w = Math.max(1, Math.round(Math.min(maxWidth, Math.max(1, contentW))));
  const h = Math.max(1, Math.round(w * (Math.max(1, contentH) / Math.max(1, contentW))));
  return { w, h };
}

/** Construit une toile synthétique (tests / mesures), sans I/O. */
export function makeHeavyCanvasFixture(width: number, height: number, opts?: {
  strokeCount?: number;
  pointsPerStroke?: number;
  photoBytes?: number;
  layerCount?: number;
}): {
  meta: { id: string; name: string; width: number; height: number; updatedAt: number };
  layers: {
    id: string; name: string; visible: boolean; opacity: number;
    strokes: { id: string; tool: string; color: string; size: number; opacity: number; points: { x: number; y: number }[] }[];
    images?: { id: string; src: string; x: number; y: number; width: number; height: number }[];
  }[];
  activeLayerId: string;
} {
  const strokeCount = opts?.strokeCount ?? 200;
  const pointsPerStroke = opts?.pointsPerStroke ?? 40;
  const layerCount = Math.max(1, opts?.layerCount ?? 3);
  const photoBytes = opts?.photoBytes ?? 80_000;
  type FixtureStroke = { id: string; tool: string; color: string; size: number; opacity: number; points: { x: number; y: number }[] };
  type FixtureLayer = {
    id: string; name: string; visible: boolean; opacity: number;
    strokes: FixtureStroke[];
    images?: { id: string; src: string; x: number; y: number; width: number; height: number }[];
  };
  const layers: FixtureLayer[] = [];
  let strokeId = 0;
  for (let li = 0; li < layerCount; li++) {
    const strokes = [];
    const perLayer = Math.floor(strokeCount / layerCount);
    for (let s = 0; s < perLayer; s++) {
      const points = [];
      for (let p = 0; p < pointsPerStroke; p++) {
        points.push({ x: (p * 17 + s) % width, y: (p * 13 + li * 3) % height });
      }
      strokes.push({
        id: `s-${strokeId++}`,
        tool: 'brush',
        color: '#224488',
        size: 4,
        opacity: 1,
        points,
      });
    }
    const layer: (typeof layers)[number] = {
      id: `layer-${li + 1}`,
      name: `Calque ${li + 1}`,
      visible: true,
      opacity: 1,
      strokes,
    };
    if (li === 0 && photoBytes > 0) {
      layer.images = [{
        id: 'img-1',
        src: `data:image/jpeg;base64,${'A'.repeat(photoBytes)}`,
        x: 0, y: 0, width, height,
      }];
    }
    layers.push(layer);
  }
  return {
    meta: { id: 'canvas-heavy', name: 'Toile 1000 × 700', width, height, updatedAt: 1 },
    layers,
    activeLayerId: layers[0].id,
  };
}
